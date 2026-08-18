#!/usr/bin/env node
/**
 * fill-links.mjs
 *
 * Walks ./src/data looking for JSON files matching the BandData shape,
 * finds any arrangement/song whose `links` field is null, and tries to
 * resolve a YouTube video ID and Spotify track ID for it using the
 * `title` (+ `artist` where present) fields — no API keys required.
 *
 *   - YouTube: uses `ytmusic-api`, which queries YouTube Music's own
 *     (unofficial, keyless) search endpoint restricted to the "Songs"
 *     category — i.e. the same catalog of official song uploads you'd
 *     pick from when adding a track to a YouTube Music playlist, not
 *     random videos, covers, or lyric uploads from regular YouTube search.
 *   - Spotify: reconstructs a short-lived anonymous "web player" token.
 *     Spotify locked down the old one-shot anonymous-token trick in 2026;
 *     the token endpoint now requires a TOTP code generated from a secret
 *     embedded in the web player's JS bundle, which Spotify rotates from
 *     time to time. This replicates that flow the way the open-source
 *     community has (see the comment above the Spotify section below for
 *     details and links). THIS IS THE FRAGILE PATH — expect it to need
 *     occasional attention when Spotify changes something.
 *
 * Both fields are stored as bare IDs (not full URLs):
 *   - links.youtube -> YouTube video ID, e.g. "dQw4w9WgXcQ"
 *   - links.spotify  -> Spotify track ID, e.g. "4uLU6hMCjMI75M1A2tKUQC"
 *
 * Usage:
 *   node scripts/fill-links.mjs [--dry-run] [--dir=./src/data]
 *
 * Requires Node 18+ (for global fetch) and the `ytmusic-api` package:
 *   npm install ytmusic-api
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import YTMusic from "ytmusic-api";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const dirArg = args.find((a) => a.startsWith("--dir="));
const DATA_DIR = path.resolve(dirArg ? dirArg.slice("--dir=".length) : "./src/data");

const REQUEST_DELAY_MS = 350; // be polite to both services between lookups
const MAX_RETRIES = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  console.warn(`  [warn] ${label} failed after ${MAX_RETRIES + 1} attempts: ${lastErr.message}`);
  return null;
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Spotify (unofficial, keyless — but genuinely fragile)
//
// As of 2026, Spotify requires every /api/token request to include a TOTP
// code generated from a secret embedded in the web player's JS bundle, and
// rotates that secret periodically. This section reproduces that flow the
// way the open-source community has reverse-engineered it — see:
//   - https://github.com/CycloneAddons/spotify-token-generator
//   - https://github.com/librespot-org/librespot/discussions/1562
//
// Rather than hardcoding a secret that will go stale, we pull the current
// secret from a community-maintained, hourly-auto-updated mirror on GitHub,
// with a live-extraction fallback (pulling it straight out of Spotify's own
// web player bundle) if that mirror is ever unreachable or out of date.
//
// WHEN THIS BREAKS (and it eventually will): check the two repos linked
// above for whatever the community has worked out as the new approach —
// this is an active cat-and-mouse game with Spotify, not a stable API.
// ---------------------------------------------------------------------------

const SPOTIFY_TOKEN_URL = "https://open.spotify.com/api/token";
const SPOTIFY_SERVER_TIME_URL = "https://open.spotify.com/api/server-time";
const SPOTIFY_SECRETS_URL =
  "https://raw.githubusercontent.com/CycloneAddons/spotify-token-generator/main/secrets/secretDict.json";

const SPOTIFY_REQUEST_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  Accept: "application/json",
  Referer: "https://open.spotify.com/",
  Origin: "https://open.spotify.com",
};

async function fetchSpotifySecretDict() {
  const res = await fetch(SPOTIFY_SECRETS_URL);
  if (!res.ok) throw new Error(`secret dict fetch failed: ${res.status}`);
  return res.json(); // { "<version>": [byte, byte, ...], ... }
}

async function fetchSpotifySecretLive() {
  // Fallback: pull the secret straight out of Spotify's own web player
  // bundle, the way the web player itself would compute it.
  const homepage = await fetch("https://open.spotify.com/", {
    headers: { "User-Agent": SPOTIFY_REQUEST_HEADERS["User-Agent"] },
  });
  if (!homepage.ok) throw new Error(`homepage fetch failed: ${homepage.status}`);
  const html = await homepage.text();
  const playerJsMatch = html.match(/"(https:\/\/[^" ]+\/web-player\.[0-9a-f]+\.js)"/);
  if (!playerJsMatch) throw new Error("could not locate web-player bundle URL");

  const bundleRes = await fetch(playerJsMatch[1], {
    headers: { "User-Agent": SPOTIFY_REQUEST_HEADERS["User-Agent"] },
  });
  if (!bundleRes.ok) throw new Error(`bundle fetch failed: ${bundleRes.status}`);
  const bundle = await bundleRes.text();

  const secretRegex = /\{\s*secret\s*:\s*(["'])(.*?)\1\s*,\s*version\s*:\s*(\d+)\s*\}/g;
  let latest = null;
  let match;
  while ((match = secretRegex.exec(bundle)) !== null) {
    const version = parseInt(match[3], 10);
    if (!latest || version > latest.version) {
      latest = { version, secret: Array.from(match[2], (c) => c.charCodeAt(0)) };
    }
  }
  if (!latest) throw new Error("no TOTP secret found in web-player bundle");
  return latest;
}

async function getSpotifySecret() {
  try {
    const dict = await fetchSpotifySecretDict();
    const versions = Object.keys(dict).map(Number);
    const version = Math.max(...versions);
    return { version, secret: dict[String(version)] };
  } catch {
    return fetchSpotifySecretLive();
  }
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function generateSpotifyTotp(timestampSeconds, secretBytes) {
  // The web player XORs each secret byte with a position-dependent value,
  // treats the *decimal digits* of the result as a UTF-8 string, hex-encodes
  // that string, and uses the resulting bytes as the HMAC key for a standard
  // RFC 6238 TOTP (SHA1, 30s step, 6 digits).
  const transformed = secretBytes.map((b, i) => b ^ ((i % 33) + 9));
  const joined = transformed.join("");
  const hexSecret = Buffer.from(joined, "utf8").toString("hex");
  const keyBytes = Buffer.from(hexSecret, "hex");
  void base32Encode; // kept for reference/debugging; RFC HMAC works directly off keyBytes

  const timeStep = 30;
  const counter = Math.floor(timestampSeconds / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", keyBytes).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

let spotifyToken = null; // { value, expiresAt }

async function getSpotifyToken() {
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 5000) {
    return spotifyToken.value;
  }

  const timeRes = await fetch(SPOTIFY_SERVER_TIME_URL, { headers: SPOTIFY_REQUEST_HEADERS });
  if (!timeRes.ok) throw new Error(`server-time request failed: ${timeRes.status}`);
  const { serverTime } = await timeRes.json();

  const { version, secret } = await getSpotifySecret();
  const totp = generateSpotifyTotp(serverTime, secret);

  const params = new URLSearchParams({
    reason: "init",
    productType: "web-player",
    totp,
    totpVer: String(version),
    totpServer: totp,
  });

  const tokenRes = await fetch(`${SPOTIFY_TOKEN_URL}?${params}`, { headers: SPOTIFY_REQUEST_HEADERS });
  if (!tokenRes.ok) throw new Error(`token request failed: ${tokenRes.status}`);
  const data = await tokenRes.json();
  if (!data.accessToken) throw new Error("no accessToken in response");

  spotifyToken = {
    value: data.accessToken,
    expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 55 * 60_000,
  };
  return spotifyToken.value;
}

async function searchSpotify(title, artist) {
  return withRetries(async () => {
    const token = await getSpotifyToken();
    const q = artist ? `track:${title} artist:${artist}` : title;
    const url = `https://api.spotify.com/v1/search?type=track&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      spotifyToken = null; // force refresh next attempt
      throw new Error("unauthorized (token expired)");
    }
    if (!res.ok) throw new Error(`search failed: ${res.status}`);
    const data = await res.json();
    const track = data?.tracks?.items?.[0];
    return track ? track.id : null; // bare Spotify track ID
  }, `spotify search "${title}"`);
}

// ---------------------------------------------------------------------------
// YouTube Music (unofficial, keyless — songs only, via ytmusic-api)
// ---------------------------------------------------------------------------

let ytMusicClientPromise = null;

function getYtMusicClient() {
  if (!ytMusicClientPromise) {
    ytMusicClientPromise = new YTMusic().initialize();
  }
  return ytMusicClientPromise;
}

async function searchYoutube(title, artist) {
  return withRetries(async () => {
    const ytmusic = await getYtMusicClient();
    const query = artist ? `${title} ${artist}` : title;
    const results = await ytmusic.searchSongs(query); // restricted to the "Songs" category
    const song = results?.[0];
    return song ? song.videoId : null; // bare YouTube video ID
  }, `youtube music search "${title}"`);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

async function resolveLinks(title, artist) {
  const spotify = await searchSpotify(title, artist);
  await sleep(REQUEST_DELAY_MS);
  const youtube = await searchYoutube(title, artist);
  await sleep(REQUEST_DELAY_MS);
  return { spotify: spotify ?? "", youtube: youtube ?? "" };
}

// ---------------------------------------------------------------------------
// Generic tree walk
//
// Rather than hard-coding the exact BandData/YearData/SectionData nesting
// (which is easy to get subtly wrong), we recursively scan every object in
// the parsed JSON. Any object that has a `links` property and a `title`
// property is treated as a resolvable node (covers both `single`
// arrangements and `Song` entries inside a `medley`). This is robust to
// however deep/shallow the actual file's top-level structure turns out to
// be relative to the BandData type.
// ---------------------------------------------------------------------------

function isResolvableNode(node) {
  return (
    node &&
    typeof node === "object" &&
    !Array.isArray(node) &&
    "links" in node &&
    typeof node.title === "string"
  );
}

async function walkAndFix(node, stats, filePath) {
  if (Array.isArray(node)) {
    for (const item of node) {
      await walkAndFix(item, stats, filePath);
    }
    return;
  }

  if (!node || typeof node !== "object") return;

  if (isResolvableNode(node)) {
    if (node.links === null) {
      const artist = typeof node.artist === "string" ? node.artist : undefined;
      console.log(`  Resolving "${node.title}"${artist ? ` — ${artist}` : ""} (${filePath})`);
      const links = await resolveLinks(node.title, artist);

      if (links.spotify || links.youtube) {
        node.links = links;
        stats.updated++;
        if (!links.spotify) console.warn(`    [warn] no Spotify match for "${node.title}"`);
        if (!links.youtube) console.warn(`    [warn] no YouTube Music match for "${node.title}"`);
      } else {
        stats.failed++;
        console.warn(`    [warn] could not resolve any links for "${node.title}"`);
      }
    }
    // A resolvable node might still contain nested arrays (e.g. a medley's
    // `songs` list living alongside `links`), so keep walking its children too.
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      await walkAndFix(value, stats, filePath);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processFile(filePath, stats) {
  const raw = await fs.readFile(filePath, "utf-8");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(`Skipping invalid JSON: ${filePath} (${err.message})`);
    return;
  }

  const before = JSON.stringify(data);
  await walkAndFix(data, stats, filePath);
  const after = JSON.stringify(data);

  if (before !== after) {
    if (DRY_RUN) {
      console.log(`[dry-run] Would update ${filePath}`);
    } else {
      await fs.writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
      console.log(`Updated ${filePath}`);
    }
  }
}

async function main() {
  let files;
  try {
    files = await walkFiles(DATA_DIR);
  } catch (err) {
    console.error(`Could not read data dir ${DATA_DIR}: ${err.message}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} JSON file(s) under ${DATA_DIR}${DRY_RUN ? " (dry run)" : ""}`);

  const stats = { updated: 0, failed: 0 };
  for (const file of files) {
    await processFile(file, stats);
  }

  console.log(`\nDone. ${stats.updated} link set(s) resolved, ${stats.failed} could not be resolved.`);
  if (stats.failed > 0) {
    console.log("Some items still need manual link entry.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
