# Smoke tests

`smoke.js` opens the built `index.html` in headless Chromium at desktop and phone size. The libraries the page loads from CDNs are served from `node_modules`, and every live feed is answered with stand-in data in the real response shape, so the parsing and drawing code runs without the network.

```bash
npm install
npx playwright install chromium
node tools/build.js

node tests/smoke.js ok quake            # select an earthquake
node tests/smoke.js offline boot        # no network at all
node tests/smoke.js ok tour phone       # tour mode at phone size
```

Each run ends with a line such as `desktop ok quake errors: none`. Screenshots are written to `tests/out/`.

## Arguments

`node tests/smoke.js <mode> [action] [desktop|phone]`

| Mode | Simulates |
|---|---|
| `ok` | Every provider answers |
| `offline` | No network |
| `backup` | The first-choice providers are down, so backups are used |
| `nocors` | Some providers refuse the browser |

| Action | Exercises |
|---|---|
| `boot` | The loading sequence, captured at the times in `BOOT_AT` (milliseconds) |
| `open` | The opening animation held at the moments in `OPEN_AT` (seconds) |
| `tour` | Tour mode. `TOUR_SMOOTH=all` simulates a full lap and reports camera smoothness |
| `tourin` | The tour buttons at rest and under the pointer (it prints how the play disc sits in each), then the first moments of a tour with the fades and the launch ring held at the instants in `TOURIN_AT` (milliseconds), then paused, left and back. `TOURIN_TOP=1` uses the button beside the name |
| `tourwarm` | Whether the music is ready before the press, and how long the press and the click each hold the page up. `WARM_KEY=1` starts with the T key, `WARM_NOGESTURE=1` plays a visitor who has not clicked anything yet |
| `tourprof` | The start of a tour on a pretend 60 Hz clock: the speed of the ground across the screen frame by frame, and the largest jolt |
| `tourcpu` | What the page's own code spends its time on during the first seconds of a tour |
| `musictest` | Loudness of the tour music, and two tours sharing one echo, rendered faster than real time |
| `quake`, `iss`, `sat`, `orbit`, `launch`, `news`, `radio` | Selecting one item of that kind |
| `place`, `search` | The card for any place, and the search box |
| `nuclear`, `cable`, `camlive`, `infra` | Nuclear sites, undersea cables, the camera viewer, and the infrastructure group |
| `toggle` | Layer switches worked with a real pointer: a press on the switch or the name flips it, and on the earthquake row the hour, day or week list neither steals the press nor flips the switch |
| `energy` | Power stations, LNG terminals and gas pipelines: off at first, unpacked when switched on, their cards, a pipeline under the pointer, search, and off again |
| `zoom`, `overlay` | Zooming, and one NASA satellite view |
| `views` | Every NASA view in turn (or the ones in `VIEW=a,b`): which layers and days it was built from, how many pictures it took, what the legend says, and a colour check: at a few places, is the colour on the globe the colour that was sent, after the page's recolouring? |
| `fine` | The sharper window: zooms in on `LOOK=lat,lon` through the distances in `DIST` and reports the window fetched at each. With `GIBS_GRID=1` it also measures where ruled lines land on the globe, which must be within one dot of the picture |
| `south` | The far south and the South Pole, and a count of land dots that are not sitting on the globe (it must be none) |

`DPR=3` renders at three times the pixel density, for looking closely at small things.

### NASA's image service

`tests/gibs-standin.js` answers the page's requests the way NASA GIBS does for the layers it uses: the area and day asked for, NASA's real colours, each layer's real publishing delay, an empty picture for a day with nothing, and an error for a layer it does not know. These make it misbehave:

| Setting | What it plays |
|---|---|
| `GIBS=down` | The service does not answer at all |
| `GIBS=stale` | Every layer is listed but has had nothing new for weeks |
| `GIBS_QUIET=layer,layer` | Those layers have had nothing new for weeks, so their spares should take over |
| `GIBS_GONE=layer,layer` | Those layers have been withdrawn, so a request naming them fails outright |
| `GIBS_GRID=1` | A line is ruled along every 15th meridian and parallel, for the `fine` test |

`node tests/tones.js` needs no browser: it runs the page's recolouring functions over the colours NASA uses for known amounts and fails if an amount that should be cleared is kept, or the other way round.

What these tests cannot show: real data, real video streams, sound, and motion at full frame rate. Check those in a browser.
