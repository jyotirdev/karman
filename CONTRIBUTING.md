# Contributing to Kármán

Thank you for wanting to make it better. This page is short on purpose.

## The rules that shape everything

1. **One file, no server.** The app must keep working as a single HTML file opened from disk. Nothing may need a backend, a proxy or a build step on the host.
2. **No keys, no accounts.** A data source must be public, free, need no API key and answer browsers directly (it must send CORS headers). If it only works through a proxy, it does not belong here.
3. **Publishers people can trust.** Prefer the agency that makes the measurement: a geological survey, a space agency, a weather service, a road authority. Say where the data comes from, in the app and in `NOTICE.md`.
4. **It must fail quietly.** Any source can be down. A new feed reports its state in the Sources tab, never throws, and never stops another feed.
5. **Plain words.** Every marker explains itself to someone who has never heard of it. No jargon, no abbreviations without the long form.
6. **Colour is for data.** The globe is monochrome so that what is happening stands out. A new layer gets one colour and one shape that nothing else uses.
7. **Respect what cameras and people are.** Only cameras that a public agency publishes as open data. Nothing that identifies or tracks a private person.

## Getting set up

You need Node 18 or newer. Python 3 is only needed to rebuild the two built-in datasets.

```bash
node tools/build.js          # src/ + assets/  ->  index.html
python3 -m http.server 8080  # then open http://localhost:8080
```

Edit files in `src/`, rebuild, reload. Never edit `index.html` by hand: it is generated, and the build check on GitHub fails if it does not match the source.

## Adding a layer

1. Register it in `LAYERS` in `src/app/00-core.js`: group, name, colour, shape and the plain-words `about` text.
2. Add its source to `SOURCES` so it appears in the Sources tab.
3. Write the loader next to its relatives in `src/app/` (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). It should call `setStatus`, build items with `lat`, `lon`, `v`, `size`, `alpha`, and hand them to `applyItems`.
4. Give it a card in `DETAILS` and, if it loads at start-up, a row in `BOOT` and a timer in `sched` in `src/app/90-main.js`.
5. Credit the publisher in `README.md` and `NOTICE.md`, with its licence.
6. Add a stand-in response to `tests/smoke.js` so the layer is exercised without the network.

## Before you open a pull request

```bash
npm install                  # once: test tooling only, the app itself has no dependencies
npx playwright install chromium
node tools/build.js
node tests/tones.js          # NASA view recolouring; no browser needed
node tests/smoke.js ok quake # expect "errors: none"
node tests/smoke.js ok sky   # the sky against PyEphem's answers
node tests/smoke.js offline boot
```

- Commit the rebuilt `index.html` together with your source change.
- If you touched a NASA satellite view, also run `node tests/smoke.js ok views`; for the built-in energy map, `node tests/smoke.js ok energy`; for anything that asks CelesTrak, `node tests/smoke.js ok limits`.
- Check it at phone width as well as on a desktop.
- If motion is involved, check it with "reduce motion" switched on in your system settings.
- Keep pull requests to one idea each, and say in a sentence what a visitor will notice.

## Using an AI coding agent

Agents are welcome here, under the same rules as people. [AGENTS.md](AGENTS.md) is the file they read: build and test commands, the rules that must not be broken, and what "done" means. Claude Code also picks up the path-scoped rules in `.claude/rules/` and the `/add-layer`, `/verify` and `/release` workflows in `.claude/skills/`. Whoever opens the pull request is responsible for what is in it, so read the diff and fill in "Not verified" honestly.

## Reporting a problem

Open an issue with what you did, what you expected and what happened. For a feed that will not load, the Sources tab says which provider failed and why; include that line and your browser.

## Licence

By contributing you agree that your code is released under the [MIT licence](LICENSE). Data you add keeps its publisher's licence and must be listed in `NOTICE.md`.
