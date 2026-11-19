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
| `quake`, `iss`, `sat`, `orbit`, `launch`, `news`, `radio` | Selecting one item of that kind |
| `place`, `search` | The card for any place, and the search box |
| `nuclear`, `cable`, `camlive`, `infra` | Nuclear sites, undersea cables, the camera viewer, and the infrastructure group |
| `zoom`, `overlay` | Zooming, and NASA satellite views |

What these tests cannot show: real data, real video streams, sound, and motion at full frame rate. Check those in a browser.
