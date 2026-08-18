type Band = "showband" | "stetsons" | "roundup"

type Links = {
    spotify: string,
    youtube: string,
}

type Song = {
    title: string,
    artist: string,
    links: Links
}

type Arrangement = {
    type: "medley",
    title: string,
    arranger: string,
    songs: Song[]
} | {
    type: "single",
    title: string,
    artist: string,
    arranger: string,
    links: Links
}

type SectionData = {
    title: string,
    arrangements: Arrangement[]
}

type YearData = Record<string, SectionData>
type BandData = Record<string, YearData>