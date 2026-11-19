// Rasterises Natural Earth 50m land into a bit mask on an equal-area dot grid.
const topo = require('topojson-client');
const land = require('world-atlas/land-50m.json');
const STEP = 0.6, COLS = 600;
const fc = topo.feature(land, land.objects.land);
const feats = fc.features || [fc];
const rings = [];
let straddling = 0;
for (const f of feats) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) for (const ring of poly) {
    // Walk the ring so longitudes are continuous across the antimeridian.
    let wraps = false, x = ring[0][0];
    const pts = [[x, ring[0][1]]];
    for (let i = 1; i < ring.length; i++) {
      let dx = ring[i][0] - ring[i - 1][0];
      if (dx > 180) { dx -= 360; wraps = true; } else if (dx < -180) { dx += 360; wraps = true; }
      x += dx; pts.push([x, ring[i][1]]);
    }
    // A ring that circles a pole (Antarctica) does not close when unwrapped; its raw coordinates already work.
    const closes = Math.abs(pts[pts.length - 1][0] - pts[0][0]) < 1;
    if (wraps && closes) straddling++;
    rings.push(wraps && closes ? { wraps: true, pts } : { wraps: false, pts: ring });
  }
}
const rows = Math.round(180 / STEP);
const bits = [];
let landCount = 0;
for (let i = 0; i < rows; i++) {
  const lat = -90 + (i + 0.5) * STEP;
  const xs = [];
  for (const r of rings) {
    const own = [];
    for (let k = 0; k < r.pts.length - 1; k++) {
      const a = r.pts[k], b = r.pts[k + 1];
      if ((a[1] > lat) !== (b[1] > lat)) own.push(a[0] + (lat - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    if (!r.wraps) { xs.push(...own); continue; }
    own.sort((p, q) => p - q);
    for (let k = 0; k + 1 < own.length; k += 2) {        // bring each inside-span back into -180..180, splitting at the seam
      const m = Math.floor((own[k] + 180) / 360);
      const p = own[k] - 360 * m, q = own[k + 1] - 360 * m;
      if (q > 180) xs.push(p, 180, -180, q - 360); else xs.push(p, q);
    }
  }
  xs.sort((a, b) => a - b);
  const n = Math.max(1, Math.round(COLS * Math.cos(lat * Math.PI / 180)));
  let k = 0;
  for (let j = 0; j < n; j++) {
    const lon = -180 + (j + 0.5) * 360 / n;
    while (k < xs.length && xs[k] < lon) k++;
    const on = k % 2 === 1;
    bits.push(on ? 1 : 0);
    if (on) landCount++;
  }
}
const bytes = Buffer.alloc(Math.ceil(bits.length / 8));
bits.forEach((b, i) => { if (b) bytes[i >> 3] |= 1 << (i & 7); });
process.stderr.write(`grid ${bits.length} points, land ${landCount}, ${bytes.length} bytes, ${straddling} rings cross the antimeridian\n`);
process.stdout.write(bytes.toString('base64'));
