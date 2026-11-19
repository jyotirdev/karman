---
name: add-layer
description: Add a new data layer or data source to the Kármán globe. Use when asked to add, wire up or evaluate a new layer, feed or provider.
argument-hint: "[what to add]"
---

Add this to Kármán: $ARGUMENTS

1. **Qualify the source.** It must be public, need no key or account, send CORS headers and come from a publisher people can trust. Find its licence. If any of these fail, or you cannot confirm that a browser can reach it, stop and say so.
2. **Register the layer** in `LAYERS` in `src/app/00-core.js`: group, name, singular name, one colour and one shape nothing else uses, and an `about` text in plain words. Add it to `PICK_ORDER`.
3. **Register the source** in `SOURCES` (label, what it provides, link).
4. **Write the loader** next to its relatives in `src/app/`, following `.claude/rules/feeds.md`.
5. **Give it a card** in `DETAILS`, and an `explain` case if the layer text is not enough.
6. **Schedule it** in `src/app/90-main.js`: a `sched` entry with a sensible period and, if it should load at start-up, a `BOOT` step. Add its label to a group in `BOOT_GROUPS` in `src/app/86-open.js`.
7. **Credit it** in `README.md` (credits table) and `NOTICE.md` (what it provides and its terms).
8. **Add a stand-in response** for its host in `tests/smoke.js`, in the real response shape.
9. **Run `/verify`.**
10. **Report** what the layer shows, where the data comes from and under what terms, and that it has been tested against stand-in data only.
