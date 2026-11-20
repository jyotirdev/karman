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
| `80-deep.js` | Debris and catalogue records, the Sun, listening, carbon dioxide |
| `81-views.js` | NASA satellite views: fetching, stacking days, fallbacks, recolouring, the legend, the sharper zoom window |
| `82-infra.js` | Undersea cables and nuclear facilities, and the route drawing and clicking they share with the pipelines |
| `83-cams.js` | Live cameras and the viewer in their card |
| `84-energy.js` | Power stations by fuel, LNG terminals and gas pipelines, unpacked from the embedded list the first time each is switched on |
| `85-more.js` | Deep space antennas, US weather warnings, recent launches, most read |
| `86-open.js` | The opening sequence and loading read-out |
| `87-music.js` | Tour music, generated with Web Audio, and the steps that get it ready ahead of time |
| `88-tour.js` | Tour mode: route, camera, captions, controls, and the hand-over from the turning globe |
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

- The surface is a shaded sphere with night lights on the dark side; land is a field of dots placed from a Natural Earth land mask, sized by elevation. In the opening the dots fly in from north to south, each in its own time; they have all landed only when the count that drives them reaches `BUILT`, which is where it is left.
- Both the elevation image and the land mask stop short of the South Pole in their sources. `tools/fill-pole.py` fills the last few degrees in the two files themselves, so the page needs no special case.
- The sun's position is computed from the clock, so day and night on the globe are real.
- Satellites are propagated in a web worker and interpolated between samples on the GPU.
- Rendering quality steps down by itself on slow machines: fewer pixels, fewer wind streaks, no glass blur.

## Starting the tour

The press that starts the tour does almost nothing, because everything slow has been done before it arrives.

- **Music.** Working out the echo, starting the browser's sound engine and handing the echo to it each take tens of milliseconds. `musicWarm` does them one at a time in idle moments: the samples as soon as the globe has opened, the engine (made asleep) once the visitor has clicked or pressed anything, since browsers allow no sound before that. Pressing down on a tour button finishes whatever is left before the click itself arrives. The echo is kept and shared by every later tour.
- **Camera.** The frame loop measures how fast the globe is turning (`trackSpin`). The opening swing begins on the press with that speed and builds from it, so the globe never stops to begin, and the tour's clock starts with its first frame, however long the press took.
- **Interface.** The panels fade out together in a third of a second and are then hidden outright, because a glass panel that has only faded still costs its blur on every frame.

- **The press itself.** A ring of light leaves the button and a wave of light crosses the planet (`tourLaunch`), both drawn by the graphics card alone, so the click is answered before anything has had time to move.

`node tests/smoke.js ok tourwarm` reports how long the press and the click each hold the page up, and `ok tourprof` plays the first seconds on a pretend 60 Hz clock and reports any jolt in pixels.

## Built-in datasets

The cable map and the reactor list do not come from a live feed. `tools/make-data.py` turns the raw files in `data/` into the compact files in `assets/`, which the build embeds. See [`data/README.md`](../data/README.md). The energy map (the larger power stations, gas pipelines and LNG terminals) is built the same way by `tools/make-energy.py`, in two steps: Global Energy Monitor's files are first cut down to three readable extracts in `data/`, and those are packed into `assets/energy.json`.

## Tests

`tests/smoke.js` renders the built page in headless Chromium with every feed replaced by stand-in data. See [`tests/README.md`](../tests/README.md).

## NASA satellite views

A view is one picture of the whole Earth, 2048 by 1024, fetched from NASA GIBS and laid over the globe by the surface shader. `OVERLAYS` in `00-core.js` says what each view is made of; the engine is in `81-views.js`.

- **Which days.** Measurements made pass by pass are asked for by date, and the latest two or three days are stacked, oldest at the bottom, so a full day always lies under today's first passes. A measurement NASA publishes late is found by asking for thumbnails of the last fortnight and taking the newest day that has anything. NASA answers a day it has nothing for with an empty picture or an error; both are read as "nothing that day". Only gap-free analyses (rain, sea temperature) are asked for as "newest".
- **Fallbacks.** A view can name spare layers, used when the first set has had nothing for two weeks. A request naming two satellites that fails outright is retried one satellite at a time.
- **Recolouring.** NASA paints some measurements across the whole globe in colours meant for a white map: clean air in pale yellow, no volcanic gas in dark blue. `OVER_TONE` clears that colour and keeps the rest. Each function is written against NASA's colour table for its layer, and leaves any pixel that is not in the expected colours untouched. `tests/tones.js` checks them.
- **The sharper window.** One dot of the whole-Earth picture is 20 km. When the globe is still and close enough for that to show, the same layers and days are fetched again for a window around the centre of the screen (180° wide down to 11.25°, snapped to a grid), and the shader blends it over the coarse picture with a soft edge.
- **What it relies on.** Only instruments with years ahead of them: VIIRS and OMPS on NOAA-20 and NOAA-21, SMAP, Sentinel-5P, and NASA's multi-satellite rain and sea analyses. Nothing depends on Terra, Aqua or Aura, which are being retired.
