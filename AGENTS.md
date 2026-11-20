# Kármán: instructions for coding agents

Kármán is a live 3D globe of what is happening on the planet, shipped as **one HTML file** with no backend, no API keys and no tracking. The browser calls each public data provider directly.

This file is the single source of truth for any AI agent working here. People-facing docs: [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Commands

```bash
node tools/build.js                 # src/ + assets/  ->  index.html (no dependencies)
node --check .build/app.check.js    # syntax check of the joined program
python3 -m http.server 8080         # serve locally at http://localhost:8080
python3 tools/make-data.py          # rebuild assets/cables.json and assets/nuclear.json from data/
python3 tools/fill-pole.py          # only after replacing assets/surf.jpg or assets/land.b64: fills the South Pole again

npm install && npx playwright install chromium   # once, for tests only
node tests/smoke.js ok quake        # expect "errors: none"
node tests/smoke.js offline boot
```

## Rules that must not be broken

1. **Never edit `index.html` by hand.** It is generated. Edit `src/`, run the build, and commit the rebuilt `index.html` in the same commit. CI fails if they differ.
2. **One file, no server.** The app must keep working opened from disk (`file://`). No backend, proxy, bundler, framework or runtime dependency. Libraries load only from the CDNs already allowed by the Content-Security-Policy in `src/index.html`.
3. **Sources are public, keyless and browser-reachable.** A new source needs no key or account, sends CORS headers, and comes from a publisher people can trust. If you cannot confirm it answers a browser, say so plainly; never present it as working.
4. **Feeds fail quietly.** Every loader reports through `setStatus`, never throws past it, and never blocks another feed. Prefer a backup provider or a saved copy over an error.
5. **Leave what works alone.** Make the smallest change that does the job. Do not refactor, rename or "tidy" code that was not part of the request, and recheck what already worked.
6. **Do not bring back aircraft, ships, trains or bike sharing.** They were removed on purpose.
7. **Cameras and people.** Only cameras a public agency publishes as open data. Nothing that identifies or tracks a private person.
8. **Data keeps its licence.** The cable map is CC BY-NC-SA 4.0 and the reactor list is ODbL; the MIT licence covers code only. Every source is credited in the app's Sources tab, `README.md` and `NOTICE.md`.

## Ask before you do any of these

- Add a dependency, a CDN, or any new external host.
- Remove a data source or a layer, or change which layers are on by default.
- Change the brand: name, mark, wordmark, colours.
- Change anything in `LICENSE`, `NOTICE.md` or a licence statement.
- Commit, tag, push or publish.

## Design and writing

- The globe is monochrome; colour is for data. A new layer gets one colour and one shape nothing else uses.
- Interface text is plain words a newcomer understands: no jargon, sentence case, British spelling (colour, licence, kilometre).
- Dark, quiet, information-dense, in the spirit of Apple and JetBrains interfaces. Motion is smooth and has a purpose.
- Respect `prefers-reduced-motion`, and check phone width as well as desktop.

## Code style

- Plain JavaScript, no modules and no build-time transforms. Scripts in `src/app/` are joined in name order into one scope, so a later file may use anything an earlier one declares.
- Two-space indentation, single quotes, semicolons. Long lines are normal in this codebase; do not reflow them.
- Comments say why, in plain words. Escape anything from a feed with `esc()` before it reaches the page, and pass URLs through `safeUrl()`.

## Where things live

| Path | What |
|---|---|
| `src/app/00-core.js` | Helpers, fetching, storage, the `LAYERS` registry |
| `src/app/10-scene.js` | three.js scene, shaders, markers, lines, picking |
| `src/app/30-ui.js` | `SOURCES`, selection, detail cards (`DETAILS`), guide |
| `src/app/40` … `85` | Feed loaders, one file per family |
| `src/app/82-infra.js`, `83-cams.js` | Cables and nuclear sites; live cameras |
| `src/app/86-open.js`, `87-music.js`, `88-tour.js` | Opening sequence, tour music, tour mode |
| `src/app/90-main.js` | Wiring, scheduler (`sched`), start-up steps (`BOOT`), frame loop |
| `src/index.html` (`#wm`), `docs/brand/` | The wordmark, drawn as outlines and reused wherever the name appears; the mark, icon and banner |
| `assets/`, `data/` | Embedded map data, and the raw files it is built from |
| `tools/` | `build.js` (the build), `make-data.py` (cables and reactors), `landmask.js` and `fill-pole.py` (the land dots and the South Pole) |
| `tests/smoke.js` | Headless tests with stand-in feeds |

Adding a layer is described step by step in `CONTRIBUTING.md`.

## Done means

- `node tools/build.js` ran and `node --check .build/app.check.js` passes.
- The relevant smoke tests print `errors: none`, at desktop and phone size.
- `index.html` is rebuilt and staged with the source change.
- New sources are credited in `README.md` and `NOTICE.md`, and have a stand-in in `tests/smoke.js`.
- Your report says exactly what was checked and what was not. The tests use stand-in data: they cannot show real feeds, real video, sound or full-speed motion.

## Commits and releases

- Conventional Commits, imperative, 50 characters or fewer: `feat(layers): add tide gauges`, `fix(cams): fall back when a stream stalls`, `docs(readme): update credits`.
- One idea per commit.
- Releases are tagged `vMAJOR.MINOR.PATCH`. Update `CHANGELOG.md` and the version in `package.json` in the release commit.
