# How Kármán is put together

Kármán is a single HTML file. This page explains how the source in `src/` becomes that file and how the pieces inside it fit.

## The build

`node tools/build.js` does four things:

1. joins every script in `src/app/` in name order and wraps them in one function, so they share a scope without leaking globals;
2. replaces the placeholders in `src/app/05-assets.js` with the files in `assets/` (two small JPEGs as base64, packed line work, the star catalogue, and the reference datasets as literals);
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
| `35-sky.js` | The sky: the real stars, the Moon and the Sun's glare, each placed from the date; the Moon's card and the camera move that brings it into view |
| `40-feeds.js` | Earthquakes, natural events, disaster alerts |
| `50-space.js` | Satellites (orbital elements, SGP4 in a worker), the gate every CelesTrak request goes through, the passes of a station over a place, space weather, launches, fireballs |
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
| `89-cinema.js` | Cinema mode, saving a picture, the link to a view, keyboard shortcuts |
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

The cable map, the reactor list and the stars do not come from a live feed. `tools/make-data.py` turns the raw files in `data/` into the compact files in `assets/`, which the build embeds. See [`data/README.md`](../data/README.md). The energy map (the larger power stations, gas pipelines and LNG terminals) is built the same way by `tools/make-energy.py`, in two steps: Global Energy Monitor's files are first cut down to three readable extracts in `data/`, and those are packed into `assets/energy.json`.

## Tests

`tests/smoke.js` renders the built page in headless Chromium with every feed replaced by stand-in data. See [`tests/README.md`](../tests/README.md).

## NASA satellite views

A view is one picture of the whole Earth, 2048 by 1024, fetched from NASA GIBS and laid over the globe by the surface shader. `OVERLAYS` in `00-core.js` says what each view is made of; the engine is in `81-views.js`.

- **Which days.** Measurements made pass by pass are asked for by date, and the latest two or three days are stacked, oldest at the bottom, so a full day always lies under today's first passes. A measurement NASA publishes late is found by asking for thumbnails of the last fortnight and taking the newest day that has anything. NASA answers a day it has nothing for with an empty picture or an error; both are read as "nothing that day". Only gap-free analyses (rain, sea temperature) are asked for as "newest".
- **Fallbacks.** A view can name spare layers, used when the first set has had nothing for two weeks. A request naming two satellites that fails outright is retried one satellite at a time.
- **Recolouring.** NASA paints some measurements across the whole globe in colours meant for a white map: clean air in pale yellow, no volcanic gas in dark blue. `OVER_TONE` clears that colour and keeps the rest. Each function is written against NASA's colour table for its layer, and leaves any pixel that is not in the expected colours untouched. `tests/tones.js` checks them.
- **The sharper window.** One dot of the whole-Earth picture is 20 km. When the globe is still and close enough for that to show, the same layers and days are fetched again for a window around the centre of the screen (180° wide down to 11.25°, snapped to a grid), and the shader blends it over the coarse picture with a soft edge.
- **What it relies on.** Only instruments with years ahead of them: VIIRS and OMPS on NOAA-20 and NOAA-21, SMAP, Sentinel-5P, and NASA's multi-satellite rain and sea analyses. Nothing depends on Terra, Aqua or Aura, which are being retired.

## The sky

The scene is fixed to the Earth: the globe never turns, and the Sun goes round it. So the sky turns instead, once a sidereal day. `skyTick`, called once a second with the clock, does three things.

- **Stars.** `assets/stars.b64` holds the 8,404 stars of the Yale Bright Star Catalogue down to magnitude 6.5, six bytes each: right ascension, declination, brightness, colour temperature. They are built once as points on a sphere of radius 200 with longitude equal to right ascension. Two turns bring that sphere to the present: precession since the year 2000 (a turn about the pole of the ecliptic, 50.29 seconds of arc a year), then the Earth's spin (a turn about the axis by sidereal time).
- **The Moon.** `moonInfo` in `00-core.js` is the Astronomical Almanac's short series: good to a third of a degree and about 1,200 km. The Moon is a sphere at its true direction and distance (about 60 Earth radii, inside the camera's far plane of 400), three times its true size. Its shader takes the same Sun direction as the globe, so the phase is not computed: it is simply what the lighting shows. The dark seas are ten soft patches placed in a frame that faces the Earth with the pole of the ecliptic up.
- **The Sun.** A glare on a camera-facing square, 190 units out along the Sun's direction.

The stars and the glare are tested against the depth the globe and the Moon have already written, so neither shows through them. That order matters: both are see-through objects, and three.js draws those after the solid ones.

Nothing here is downloaded. `tests/smoke.js ok sky` checks every part against PyEphem (see [`tests/README.md`](../tests/README.md)).

`stationPasses` in `50-space.js` uses the same Sun: it steps a station's orbit through the coming week in 40-second steps, walks each rise in 4-second steps, and keeps the stretch where the station is at least 10° up, outside the cylinder of shadow behind the Earth, and the Sun is at least 6° below the watcher's horizon.

## CelesTrak

CelesTrak refuses a list fetched twice within two hours and shuts out addresses that go on asking after a refusal. Every request to it therefore goes through `celestrak()` in `50-space.js`, and nothing else may fetch from celestrak.org.

- One request at a time, half a second apart, and never a second try.
- A named list is not asked for again within two hours, even if saving the first answer failed. The times are kept in the browser (`ern:ct-asked`).
- Any refusal starts a rest: two hours after a 4xx, thirty minutes after a 5xx or no answer at all (a shut-out address gets silence, not an error). The rest is kept in the browser (`ern:ct-hold`), so reloading the page does not end it.
- `fetchGP` uses the saved copy of a list while it is fresh, and falls back to it when CelesTrak cannot or should not be asked, up to a fortnight old (36 hours for the stations). The source then shows a warning that says why and when CelesTrak will be asked again.

`tests/smoke.js ok limits` reloads the page through each of these cases and counts the requests.

## Cinema mode, pictures and links

`89-cinema.js`. Cinema mode adds the class `cinema` to `#app`, which fades the panels the same way the tour does, sets `view.bare` so that `resize()` lets the globe use the whole window, and shows a caption. A picture is made by drawing one more frame and copying the canvas in the same task (the drawing buffer is not kept between frames), then writing the wordmark and the date over it. A link is `#@latitude,longitude,distance,view`; on arrival the opening sequence plays as usual and the globe then flies to the view.

