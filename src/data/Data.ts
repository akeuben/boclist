const files = import.meta.glob("./*/*/*.json", {
  eager: true,
  import: "default",
});

console.log(files)

export const fetchData = (band: Band): BandData => {
    const result: BandData = {};

    for (const [path, data] of Object.entries(files)) {
        const match = path.match(/([^/]+)\/([^/]+)\/([^/]+)\.json$/);

        console.log(match)

        if (!match) continue;

        const [, fileBand, year, type] = match;

        if (fileBand !== band) continue;

        result[year] ??= {};
        result[year][type] = data as SectionData;
    }

    return result;
}