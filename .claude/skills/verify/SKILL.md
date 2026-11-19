---
name: verify
description: Build Kármán and run its checks. Use after any change to src/, assets/ or tools/, and before saying a piece of work is finished.
---

1. Build and syntax-check:
   ```bash
   node tools/build.js && node --check .build/app.check.js
   ```
2. Run the smoke tests that cover what changed, plus the two that always run. Each must end with `errors: none`.
   ```bash
   node tests/smoke.js ok quake
   node tests/smoke.js offline boot
   node tests/smoke.js ok quake phone
   ```
   Feature checks: `tour`, `open`, `nuclear`, `cable`, `camlive`, `infra`, `place`, `search`, `radio`, `news`, `launch`, `sat`, `orbit`, `zoom`, `overlay`. See `tests/README.md`.
3. If the change touches layout or motion, look at the screenshots in `tests/out/` at desktop and phone size.
4. Confirm `git status` shows the rebuilt `index.html` alongside the source change.
5. Report in three parts: what changed, what was checked and passed, and what could not be checked here. The tests use stand-in data, so real feeds, real video, sound and full-speed motion are always in the last part.
