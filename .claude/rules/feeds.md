---
paths:
  - "src/app/{40,50,60,70,80,82,83,85}-*.js"
---

# Feed loaders

- Fetch with `getJSON(url, timeoutMs, asText, opts)`. Pass `KEEP` for large responses worth falling back to.
- Call `setStatus(source, 'load')` first, then `okStatus(source, data)` or `setStatus(source, 'err', errNote(e))`. Wrap the whole loader in `try`/`catch`; nothing may throw past it.
- Build items as plain objects with `layer`, `id`, `title`, `lat`, `lon`, `v` (from `ll(lat, lon, radius)`), `size` and `alpha`, then call `applyItems(layer, items)`.
- Validate every field from a provider: finite numbers for coordinates, `safeUrl()` for links, `esc()` before any text reaches HTML.
- A provider must be public, keyless and CORS-open. Add a backup with `firstOf` when a second trustworthy provider exists.
- Register the source in `SOURCES`, credit it in `README.md` and `NOTICE.md`, and add a stand-in response to `tests/smoke.js`.
