---
paths:
  - "index.html"
  - "assets/**"
---

# Generated files

- `index.html` is written by `node tools/build.js`. Never edit it directly: change `src/` and rebuild.
- `assets/cables.json` and `assets/nuclear.json` are written by `python3 tools/make-data.py` from the raw files in `data/`. Change the script or the raw data, not the output.
- The other files in `assets/` are embedded map data. Leave them alone unless asked.
