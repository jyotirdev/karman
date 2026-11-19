# Instructions for GitHub Copilot

The project's rules for AI agents are in [`AGENTS.md`](../AGENTS.md) at the repository root. Read it first and follow it. The points that matter most:

- `index.html` is generated. Never edit it: change `src/`, run `node tools/build.js`, and commit both.
- The app is one HTML file with no backend, no API keys and no runtime dependencies. Keep it that way.
- A data source must be public, keyless, CORS-open and from a trustworthy publisher, and must be credited in `README.md` and `NOTICE.md`.
- Every feed loader reports through `setStatus` and never throws past it.
- Interface text is plain words, sentence case, British spelling.
- Commits follow Conventional Commits, for example `fix(cams): fall back when a stream stalls`.
