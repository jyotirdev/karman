---
paths:
  - "src/app/10-scene.js"
  - "src/app/86-open.js"
  - "src/app/88-tour.js"
  - "src/style.css"
---

# Rendering and motion

- One draw call per layer. Do not create an object per marker.
- Allocate nothing inside the frame loop: reuse vectors and arrays.
- The opening sequence and the tour are tuned by eye. Change timings, easing or camera paths only when asked, and keep the finished state identical.
- Everything animated must have a still fallback under `prefers-reduced-motion`.
- Colour is for data. Interface chrome stays neutral.
- Check at phone width and at a narrow desktop width; the loading read-out hides below 1240 px.
