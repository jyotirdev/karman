// A stand-in for NASA's GIBS image service, for the test harness.
// It answers a WMS GetMap request the way the real service does for the layers the page uses: the right area, the right
// day, the real colour tables, the real publishing delays, an empty picture for a day with nothing, and an error for a
// layer name it does not know. That lets the harness exercise day stacking, fallbacks, recolouring and the sharper
// zoom window without the network. Colours and delays were read from NASA's own lists in November 2026.
const sharp = require('sharp');
const fs = require('fs'), path = require('path');

/* the page's own land mask, so sea layers stay at sea and land layers on land */
const LAND = (() => {
  const file = ['../assets/land.b64', '../land.b64'].map(p => path.join(__dirname, p)).find(p => fs.existsSync(p));
  const bits = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64'), step = 0.6, rows = 300, cols = 600, start = [], n = [];
  let bit = 0;
  for (let i = 0; i < rows; i++) { const k = Math.max(1, Math.round(cols * Math.cos((-90 + (i + 0.5) * step) * Math.PI / 180))); start.push(bit); n.push(k); bit += k; }
  return (lat, lon) => {
    const i = Math.min(rows - 1, Math.max(0, Math.floor((lat + 90) / step))), j = Math.min(n[i] - 1, Math.floor(((lon + 180) / 360) * n[i])), b = start[i] + j;
    return (bits[b >> 3] >> (b & 7)) & 1;
  };
})();

const hex = s => s.split(',').map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const ramp = stops => { const c = hex(stops); return t => { const x = Math.min(0.9999, Math.max(0, t)) * (c.length - 1), i = Math.floor(x), f = x - i; return [c[i][0] + (c[i + 1][0] - c[i][0]) * f, c[i][1] + (c[i + 1][1] - c[i][1]) * f, c[i][2] + (c[i + 1][2] - c[i][2]) * f]; }; };
const R = {
  sst: ramp('#2b001a,#65035d,#510963,#1f1c5d,#21499b,#2a88d7,#20a371,#b0e500,#ffb900,#f05b00,#b51d00,#6b0200'),
  ssta: ramp('#6b00db,#9600ca,#414be6,#00aeff,#18fce5,#76ff8c,#b1ff98,#bfdbb0,#d5d5ac,#fff679,#ffc209,#ff9100,#ff3d00,#f3002d,#d30085,#88000f'),
  chl: ramp('#93006c,#5a00a5,#1e00e1,#0035ff,#00a0ff,#00ffef,#00ff4f,#58ff00,#f8ff00,#ffb300,#ff6300,#ff1300,#b40000,#690000'),
  aod: ramp('#fffdcd,#ffe77b,#ffc94c,#ff992a,#ff671c,#f72d10,#d7090b,#a1000e'),
  so2: ramp('#082864,#083573,#0b3d7b,#104786,#155191,#195c9c,#1e66a7,#2370b2,#2c7aba,#4498c4,#69acd4,#93c1e0,#bdd6ec,#e0ebf6,#f7fbff'),
  lst: ramp('#c900ff,#7d00ff,#2d00ff,#0033ff,#0099ff,#00ffff,#4dff4d,#95ff00,#e2ff00,#ffdc00,#ffa000,#ff6100,#ff2500,#ff0100'),
  soil: ramp('#ffa200,#ffd000,#fffb00,#9acc00,#249100,#00ab57,#00e9d3,#00beff,#0047ff,#0000e2,#00009a'),
  ndvi: ramp('#e1d2c6,#b09f8f,#9a6e5a,#80b006,#438d01,#0a6901,#002401'),
  ice: ramp('#0e000e,#950095,#bf00ff,#1500ff,#00adff,#00de9c,#0faf00,#bce900,#ff9500,#ff1a1a,#ffe6e6,#ffffff'),
  snow: ramp('#f0f080,#f0f092,#f0d288,#f0b488,#f09688,#f08080,#ff0000'),
  rain: ramp('#008c00,#00c800,#96e600,#ffff00,#ffaa00,#ff0000'),
  no2: ramp('#fffcab,#fff69c,#ffed8a,#ffe67a,#ffde6a,#ffd65c,#ffce50,#ffc145,#ffb339,#ffa42f,#ff9628,#ff8a24,#ff7c20,#ff6f1d,#ff5a19,#ff4815,#fe3612,#f52810,#ed1c0d,#e5110a')
};
const CITIES = [[50, 8], [40.7, -74], [34, -118.2], [25.2, 55.3], [1.3, 103.8], [35.7, 139.7], [28.6, 77.2], [19, 72.9], [51.5, -0.1], [41.9, -87.6], [-23.5, -46.6], [-33.9, 151.2], [31.2, 121.5], [13, 80.2], [30, 31.2], [55.7, 37.6], [-26.2, 28], [6.5, 3.4], [19.4, -99.1], [48.9, 2.3]];
const VOLCANO = [-7.5, 110.4], FIRE = [58, 110], FLOOD = [24.5, 90.5];          /* a gas plume, a smoke plume and a flood to find */
const wave = (lon, lat, k) => 0.5 + 0.25 * Math.sin((lon + k * 37) * 0.045) * Math.cos((lat - k * 11) * 0.07) + 0.25 * Math.sin((lon * 0.6 + lat + k * 53) * 0.11);
const near = (lat, lon, p, deg) => { const d = Math.hypot(lat - p[0], (lon - p[1]) * Math.cos(lat * Math.PI / 180)); return Math.max(0, 1 - d / deg); };
const cloud = (lon, lat, k) => wave(lon * 1.7 + 40, lat * 1.9, k + 3) > 0.62;

/* name: [days NASA runs behind, what it draws: (lon, lat, day number) -> [r, g, b, a] or null for nothing]
   A layer listed with `swath` has only part of today (the orbits flown so far); `ended` means it stopped long ago. */
const LAYERS = {
  IMERG_Precipitation_Rate: { late: 0, px: (x, y, k) => { const v = wave(x * 2.1, y * 2.3, k); return v > 0.7 ? [...R.rain((v - 0.7) / 0.3), 255] : null; } },
  GHRSST_L4_MUR_Sea_Surface_Temperature: { late: 1, px: (x, y) => (LAND(y, x) ? null : [...R.sst(1 - Math.abs(y) / 80 + 0.06 * Math.sin(x * 0.1)), 255]) },
  GHRSST_L4_MUR25_Sea_Surface_Temperature_Anomalies: { late: 1, px: (x, y, k) => (LAND(y, x) ? null : [...R.ssta(wave(x, y, 2)), 255]) },
  GHRSST_L4_MUR_Sea_Ice_Concentration: { late: 1, px: (x, y) => (LAND(y, x) ? null : Math.abs(y) > 62 ? [...R.ice(Math.floor((Math.abs(y) - 62) / 18 * 4) / 4), 255] : [17, 17, 17, 255]) },
  GHRSST_L4_MUR25_Sea_Ice_Concentration: { late: 1, px: (x, y) => (LAND(y, x) ? null : Math.abs(y) > 62 ? [...R.ice(Math.floor((Math.abs(y) - 62) / 18 * 4) / 4), 255] : [17, 17, 17, 255]) },
  AMSRU2_Sea_Ice_Concentration_12km: { ended: true },
  MODIS_Terra_NDSI_Snow_Cover: { ended: true },          /* Terra: no observations after 1 December 2026 */
  VIIRS_NOAA21_NDSI_Snow_Cover: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) && y > 44 && !cloud(x, y, k + 9) ? [...R.snow((y - 40) / 35), 255] : null) },
  VIIRS_NOAA20_NDSI_Snow_Cover: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) && y > 44 && !cloud(x, y, k + 1) ? [...R.snow((y - 40) / 35), 255] : null) },
  MODIS_Combined_Value_Added_AOD: { late: 1, px: (x, y, k) => (cloud(x, y, k) ? null : [...R.aod(Math.max(0, wave(x, y, k + 5) - 0.35) * 1.4 + near(y, x, FIRE, 18)), 255]) },
  VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean: { late: 0, swath: true, px: (x, y, k) => (cloud(x, y, k) || Math.abs(y) > 70 ? null : [...R.aod(Math.max(0, wave(x, y, 5) - 0.35) * 1.4 + near(y, x, FIRE, 18)), 255]) },
  VIIRS_NOAA21_AOD_Deep_Blue_Land_Ocean: { late: 0, swath: true, px: (x, y, k) => (cloud(x, y, k + 7) || Math.abs(y) > 70 ? null : [...R.aod(Math.max(0, wave(x, y, 5) - 0.35) * 1.4 + near(y, x, FIRE, 18)), 255]) },
  /* as the real one comes: every measured place painted, clean air in pale yellow, with pepper-like holes where the retrieval was rejected and thin gaps between passes */
  TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column: { late: 7, px: (x, y, k) => { if (Math.abs(y) > 72 || cloud(x, y, k) || Math.abs(((x + k * 9) % 25.7)) < 0.25 || Math.sin(x * 127.1 + y * 311.7 + k) * 43758.5453 % 1 > 0.82) return null; let v = 0.03 + 0.05 * wave(x * 3, y * 3, k); for (const c of CITIES) v = Math.max(v, near(y, x, c, 6)); return [...R.no2(v), 255]; } },
  VIIRS_NOAA20_CorrectedReflectance_TrueColor: { late: 0, swath: true, px: (x, y, k) => (cloud(x, y, k) ? [225, 228, 232, 255] : LAND(y, x) ? [70 + 60 * wave(x, y, 1), 92, 48, 255] : [9, 24, 52, 255]) },
  VIIRS_NOAA21_CorrectedReflectance_TrueColor: { late: 0, swath: true, px: (x, y, k) => (cloud(x, y, k + 7) ? [225, 228, 232, 255] : LAND(y, x) ? [70 + 60 * wave(x, y, 1), 92, 48, 255] : [9, 24, 52, 255]) },
  VIIRS_NOAA20_Chlorophyll_a: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) || cloud(x, y, k) ? null : [...R.chl(0.25 + 0.5 * wave(x * 1.5, y * 1.5, 4) * (0.4 + Math.abs(y) / 90)), 255]) },
  VIIRS_NOAA21_Chlorophyll_a: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) || cloud(x, y, k + 7) ? null : [...R.chl(0.25 + 0.5 * wave(x * 1.5, y * 1.5, 4) * (0.4 + Math.abs(y) / 90)), 255]) },
  OMPS_NOAA20_SO2_Middle_Troposphere: { late: 0, swath: true, px: (x, y) => (Math.abs(y) > 75 ? null : [...R.so2(Math.pow(near(y, x, VOLCANO, 16), 1.5)), 255]) },
  VIIRS_NOAA20_L3_Land_Surface_Temp_8Day_Day: { late: 9, px: (x, y) => (LAND(y, x) ? [...R.lst(0.72 - Math.abs(y - 8) / 150 + 0.05 * Math.sin(x * 0.08)), 255] : null) },
  VIIRS_NOAA20_Land_Surface_Temp_Day: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) && !cloud(x, y, k) ? [...R.lst(0.74 - Math.abs(y - 8) / 150 + 0.05 * Math.sin(x * 0.08)), 255] : null) },
  VIIRS_NOAA21_Land_Surface_Temp_Day: { late: 0, swath: true, px: (x, y, k) => (LAND(y, x) && !cloud(x, y, k + 7) ? [...R.lst(0.74 - Math.abs(y - 8) / 150 + 0.05 * Math.sin(x * 0.08)), 255] : null) },
  SMAP_L4_Analyzed_Surface_Soil_Moisture: { late: 3, px: (x, y) => (LAND(y, x) && Math.abs(y) < 72 ? [...R.soil(wave(x, y, 6)), 255] : null) },
  VIIRS_NOAA20_NDVI_8Day: { late: 1, px: (x, y) => (LAND(y, x) && y > -60 ? [...R.ndvi(Math.max(0.02, 1 - Math.abs(y - 2) / 55) * (0.5 + 0.5 * wave(x, y, 8))), 255] : null) },
  VIIRS_NOAA21_NDVI_8Day: { late: 1, px: (x, y) => (LAND(y, x) && y > -60 ? [...R.ndvi(Math.max(0.02, 1 - Math.abs(y - 2) / 55) * (0.5 + 0.5 * wave(x, y, 8))), 255] : null) },
  'VIIRS_Combined_Flood_2-Day': { late: 0, swath: true, px: (x, y, k) => (!LAND(y, x) ? null : near(y, x, FLOOD, 1.6) > 0.2 ? [250, 30, 36, 255] : near(y, x, FLOOD, 3) > 0.2 ? [255, 255, 0, 255] : wave(x * 9, y * 9, 1) > 0.9 ? [50, 210, 245, 255] : cloud(x, y, k) ? [175, 175, 175, 255] : null) },
  'MODIS_Combined_Flood_2-Day': { late: 0, swath: true, px: (x, y, k) => (!LAND(y, x) ? null : near(y, x, FLOOD, 1.6) > 0.2 ? [250, 30, 36, 255] : cloud(x, y, k) ? [175, 175, 175, 255] : null) },
  VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance: { late: 1, px: (x, y) => { let v = 0; for (const c of CITIES) v = Math.max(v, near(y, x, c, 2.2)); const g = 7 + 248 * Math.pow(v, 0.6); return [g, g, g, 255]; } },
  VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance: { late: 0, swath: true, px: (x, y, k) => { let v = cloud(x, y, k) ? 0.12 : 0; for (const c of CITIES) v = Math.max(v, near(y, x, c, 2.2)); const g = 7 + 248 * Math.pow(v, 0.6); return [g, g, g, 255]; } }
};

const DAY = 864e5, dayNo = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / DAY);
const xml = msg => ({ contentType: 'text/xml', body: '<?xml version="1.0"?><ServiceExceptionReport version="1.1.1"><ServiceException code="LayerNotDefined">' + msg + '</ServiceException></ServiceExceptionReport>' });

/* which day each layer of a request shows: the day asked for if it has been published, else nothing; with no day asked for, its newest */
function planFor(names, time, opts) {
  const today = Math.round((Date.now() - (Date.now() % DAY)) / DAY);
  return names.map(n => {
    const L = LAYERS[n], newest = today - (L.late || 0);
    if (L.ended || opts.stale || (opts.quiet || []).includes(n)) return null;
    const k = time ? dayNo(time) : newest;
    return k > newest ? null : { L, k, part: L.swath && k === today };
  });
}
/* the colour one request shows at one place, or null for nothing. Part of today is the orbits flown so far: stripes that begin at the date line and march west. */
function colourAt(plan, lon, lat) {
  const flown = (Date.now() % DAY) / DAY; let c = null;
  for (const p of plan) {
    if (!p || (p.part && (180 - lon) / 360 > flown)) continue;
    const v = p.L.px(lon, lat, p.k); if (v) c = v;
  }
  return c;
}
/* opts: { gone: [layer names NASA has withdrawn], quiet: [layers still listed but with nothing new for weeks], stale: true when that goes for every layer, grid: true to rule lines every 15 degrees }
   Returns { contentType, body } for route.fulfill, and notes the request in `log`. */
async function answer(url, opts, log) {
  const q = new URL(url).searchParams, names = (q.get('LAYERS') || '').split(','), time = q.get('TIME') || '', jpeg = /jpeg/.test(q.get('FORMAT') || '');
  const w = +q.get('WIDTH') || 256, h = +q.get('HEIGHT') || 128, box = (q.get('BBOX') || '-180,-90,180,90').split(',').map(Number);
  if (log) log.push({ layers: names.join(','), time, w, h, box: box.join(',') });
  for (const n of names) if (!LAYERS[n] || (opts.gone || []).includes(n)) return xml('msWMSLoadGetMapParams(): WMS server error. Invalid layer(s) given in the LAYERS parameter. ' + n);
  const px = Buffer.alloc(w * h * 4), plan = planFor(names, time, opts);
  for (let j = 0; j < h; j++) {
    const lat = box[3] - (j + 0.5) / h * (box[3] - box[1]);
    for (let i = 0; i < w; i++) {
      const lon = box[0] + (i + 0.5) / w * (box[2] - box[0]), o = (j * w + i) * 4;
      let c = colourAt(plan, lon, lat);
      if (opts.grid && c) { const gx = Math.abs(((lon % 15) + 15) % 15), gy = Math.abs(((lat % 15) + 15) % 15), t = (box[2] - box[0]) / w * 0.75; if (Math.min(gx, 15 - gx) < t || Math.min(gy, 15 - gy) < t) c = [255, 0, 255, 255]; }
      if (c) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3]; }
      else if (jpeg) px[o + 3] = 255;
    }
  }
  const img = sharp(px, { raw: { width: w, height: h, channels: 4 } });
  return jpeg ? { contentType: 'image/jpeg', body: await img.flatten({ background: '#000' }).jpeg({ quality: 80 }).toBuffer() } : { contentType: 'image/png', body: await img.png({ compressionLevel: 1 }).toBuffer() };
}
/* what the stacked pictures of a view show at one place: `drawn` is the page's own record of which layers and days it used, bottom first */
function shown(drawn, lon, lat, opts) {
  let c = null;
  for (const d of drawn) for (const day of d.days) { const v = colourAt(planFor(d.layers.split(','), day, opts), lon, lat); if (v) c = v; }
  return c;
}
module.exports = { answer, shown, LAYERS };
