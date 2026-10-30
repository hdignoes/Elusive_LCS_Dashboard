# SV Elusive — Outliers, Victoria to Ketchikan

A static air-quality retrospective of the June 17–25, 2026 Race to Alaska. The route begins at the Victoria start and ends at the Ketchikan finish. Vancouver, pre-race measurements and the return leg are excluded.

## Data and positions

The exhibit includes 2,138 original air-quality/weather observations across nine Pacific-local dates. The official Outliers start is June 17 at 19:00 UTC / noon PDT; the finish is June 25 at 17:40 UTC / 10:40 a.m. PDT. These timestamps come from team 40 in https://cf.yb.tl/JSON/r2ak2026/RaceSetup .

**All displayed coordinates come exclusively from the R2AK YB Outliers tracker.** Sensor GPS is never used for the map. Every measurement is matched to the nearest recorded tracker timestamp within the race interval: 1,691 exact and 447 nearest-time matches, with a maximum difference of five minutes. Ties select the earlier fix. Measurements are neither added nor altered. There is no interpolation or extrapolation.

A complete neutral route of 2,261 tracker fixes is shown under the coloured measurement segments. This preserves the actual track through missing air-quality intervals, including approximately nine hours on June 23 and the final 35 minutes before finishing. Neutral sections have no pollutant value assigned. Day filters apply to both layers.

`data/june-2026.json` contains observations, position provenance, race bounds and the full race track in one roughly 325 KB file. It is fetched once; there are no live requests, timers or cache-busting queries. `data/position-matches-june-2026.json` audits every match and retains original sensor coordinates. `data/outliers-track-june-2026.json` preserves the full downloaded source track; the builder trims it to the race bounds before use. These two auxiliary files are not fetched by the page.

Original `data/history.geojson` and `data/latest.json` are left untouched and are not requested by the website.

## Run or rebuild locally

Use any static web server, or deploy the repository root to Netlify with the supplied `netlify.toml`. Leaflet 1.9.4 is bundled locally. Esri World Topographic Map tiles require internet and carry attribution. The canvas chart needs no additional library.

Rebuild the exhibit from the saved inputs, without any network request:

```sh
python scripts/build-june-archive.py
```

Requires Python 3.9+ and IANA timezone data (`pip install tzdata` on Windows if necessary). To intentionally refresh source positions, download https://cf.yb.tl/BIN/r2ak2026/AllPositions3, then run `python scripts/extract-outliers-track.py /path/to/AllPositions3.bin` before rebuilding. No remote JavaScript is executed.

The map/timeline link observations; filters, summaries, keyboard selection and downloads work entirely with the frozen archive. Colour bands are contextual; five-minute readings are not equivalent to standards with longer averaging periods.

## Editing the wording

Visible introduction, headings, team details and experiment description are in `index.html`. Styling is in `css/style.css`. Generated map/timeline text is in `js/app.js`. There is no build step. Change the text and redeploy. The nautical wording is deliberately plain.

Team/boat/crew source: https://r2ak.com/2026-teams-full-race/team-outliers/ . The 2026 result is seventh, elapsed 7d 22h 40m, from Outliers (team 40) in the overall race leaderboard: https://cf.yb.tl/JSON/r2ak2026/leaderboard . The fifth-place finish mentioned in the team profile refers to an earlier race, not 2026.

## Introductory coastlines and concise labels

The intro route is drawn over inline Natural Earth 1:50m land outlines, clipped to the Pacific coast region. Both use the same fixed equirectangular projection with a 52° standard parallel. This adds no runtime request or dependency. To regenerate, download `ne_50m_land.geojson` from the Natural Earth vector repository and run `python scripts/build-coastline.py /path/to/ne_50m_land.geojson`. Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_land.geojson .

The reading card says “At this point” and retains the coordinates, date/time and value. Timestamp-matching diagnostics stay in the download log. The explanatory banner is removed; the colour legend keeps its swatches, ranges and units with brief context. The agreed WHO/CAAQS 24-hour note is used for PM2.5; the other measurements have short, applicable notes.
