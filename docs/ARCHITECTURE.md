# How Kármán is put together

Kármán is a single HTML file. This page explains how the source in `src/` becomes that file and how the pieces inside it fit.

## The build

`node tools/build.js` does four things:

1. joins every script in `src/app/` in name order and wraps them in one function, so they share a scope without leaking globals;
2. replaces the placeholders in `src/app/05-assets.js` with the files in `assets/` (two small JPEGs as base64, packed line work, and the two reference datasets as literals);
3. inlines `src/style.css` and the joined script into `src/index.html`;
4. writes `index.html`, and a copy of the script without the embedded data to `.build/app.check.js` for a quick syntax check.

The build has no dependencies and is deterministic: the same source always gives the same bytes. GitHub's build check relies on that to confirm the committed `index.html` matches `src/`.

The number at the start of each script's name sets the order. Later files may use anything declared in earlier ones.

## The scripts

| File | What lives there |
|---|---|
| `00-core.js` | Small helpers, fetching with timeouts, retries and saved copies, storage, the `LAYERS` registry, layer groups, swatches |
| `05-assets.js` | The embedded map data |
| `10-scene.js` | three.js scene: the globe and its shaders, the land dots, borders and plates, the marker and line renderers, picking, quality steps |
| `30-ui.js` | Sources and their status, selection, detail cards (`DETAILS`), the "Right now" summary, the guide |
| `40-feeds.js` | Earthquakes, natural events, disaster alerts |
| `50-space.js` | Satellites (orbital elements, SGP4 in a worker), space weather, launches, fireballs |
| `60-people.js` | Cities and weather, wind, clouds, news, radio, the "any place" card, search |
| `70-more.js` | Fire hotspots, wildlife, Earth from deep space, space news, country facts, bedrock |
| `80-deep.js` | Debris and catalogue records, the Sun, listening, NASA satellite views, carbon dioxide |
| `82-infra.js` | Undersea cables and nuclear facilities |
| `83-cams.js` | Live cameras and the viewer in their card |
| `85-more.js` | Deep space antennas, US weather warnings, recent launches, most read |
| `86-open.js` | The opening sequence and loading read-out |
| `87-music.js` | Tour music, generated with Web Audio |
| `88-tour.js` | Tour mode: route, camera, captions, controls |
| `90-main.js` | Wiring: layer toggles, pointer, the feed scheduler, staged start-up, the frame loop |

## How a feed becomes markers

```
provider ──fetch──▶ loader ──items──▶ applyItems(layer, items) ──▶ MarkerLayer ──▶ one draw call
                      │                                   │
                      └── setStatus(source, state) ───────┴──▶ Sources tab, loading screen
```

- A **loader** (`loadQuakes`, `loadCams`, …) fetches with `getJSON`, which adds a timeout, one retry for quick failures and, when asked, a saved copy in IndexedDB to fall back on.
- It turns the response into **items**: plain objects with `layer`, `id`, `title`, `lat`, `lon`, a position vector `v`, a `size` and an `alpha`.
- `applyItems` hands them to the layer's `MarkerLayer`, which keeps one buffer per layer and draws every marker of that layer in a single call. Shape and colour come from `LAYERS`.
- `setStatus` records whether the source is loading, live, degraded or unreachable. Nothing a loader does may throw past it.

The **scheduler** in `90-main.js` refreshes each feed on its own period, at most three at a time, and skips feeds whose layer is switched off. At start-up the same feeds run once in a staged order, four at a time, and the globe opens when nine in ten have answered.

## Selection

A click on the globe is tested against markers in priority order (`pick`), then against undersea cables, and otherwise opens the place under the pointer. The selected item is rendered by `DETAILS[layer]`, which returns a title, rows, optional extra HTML and actions. Values that change every second are written into slots so the card is never rebuilt under the pointer.

## The globe

- The surface is a shaded sphere with night lights on the dark side; land is a field of dots placed from a Natural Earth land mask, sized by elevation.
- The sun's position is computed from the clock, so day and night on the globe are real.
- Satellites are propagated in a web worker and interpolated between samples on the GPU.
- Rendering quality steps down by itself on slow machines: fewer pixels, fewer wind streaks, no glass blur.

## Built-in datasets

The cable map and the reactor list do not come from a live feed. `tools/make-data.py` turns the raw files in `data/` into the compact files in `assets/`, which the build embeds. See [`data/README.md`](../data/README.md).

## Tests

`tests/smoke.js` renders the built page in headless Chromium with every feed replaced by stand-in data. See [`tests/README.md`](../tests/README.md).
