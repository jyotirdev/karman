// Checks the recolouring of NASA's satellite views against NASA's own colour tables. No browser needed:
//   node tests/tones.js
// Several measurements come painted across the whole globe in colours meant for a white map (clean air in pale yellow, no
// volcanic gas in dark blue, an unlit place in black). The page clears that "almost none" colour and keeps the rest; the
// functions that do it live in src/app/81-views.js (OVER_TONE). This runs those very functions over the colours NASA uses
// for known amounts, read from its colour tables in November 2026 (gibs.earthdata.nasa.gov/colormaps/v1.3/), and fails if
// an amount that should be cleared is kept, one that should be kept is cleared, or a colour is changed that should not be.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', '81-views.js'), 'utf8');
const a = src.indexOf('const OVER_TONE = {'), b = src.indexOf('/* run a recolouring over a canvas');
if (a < 0 || b < a) { console.error('OVER_TONE not found in src/app/81-views.js'); process.exit(1); }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const TONE = new Function('clamp', src.slice(a, b) + '; return OVER_TONE;')(clamp);

/* [amount, NASA's colour for it, what should happen: 'clear' (gone), 'faint' (partly see-through), 'keep' (solid, colour untouched) or 'solid' (solid, recoloured)] */
const CASES = {
  /* OMI_Nitrogen_Dioxide_Tropo_Column.xml, used for the TROPOMI layer too: molecules per square centimetre */
  no2: [['below zero', [255, 252, 199], 'clear'], ['0', [255, 252, 171], 'clear'], ['0.9e15', [255, 246, 156], 'clear'], ['1.9e15', [255, 237, 138], 'clear'], ['3.0e15', [255, 230, 122], 'faint'], ['4.0e15', [255, 222, 106], 'faint'],
    ['6.2e15', [255, 206, 80], 'keep'], ['1.04e16', [255, 150, 40], 'keep'], ['1.57e16', [255, 72, 21], 'keep'], ['2.0e16', [229, 17, 10], 'keep'], ['over 2e16', [127, 0, 14], 'keep']],
  /* MODIS_VIIRS_AOD.xml: aerosol optical depth */
  haze: [['below zero', [255, 253, 205], 'clear'], ['0', [255, 252, 199], 'clear'], ['0.09', [255, 231, 123], 'faint'], ['0.19', [255, 201, 76], 'faint'], ['0.29', [255, 153, 42], 'keep'], ['0.49', [247, 45, 16], 'keep'], ['0.69', [161, 0, 14], 'keep'], ['5', [125, 0, 14], 'keep']],
  /* OMPS_SO2_Middle_Troposphere.xml: Dobson units */
  so2: [['under 1', [8, 40, 100], 'clear'], ['1.0', [8, 53, 115], 'faint'], ['2.0', [11, 61, 123], 'faint'], ['4.5', [21, 81, 145], 'solid'], ['12', [68, 142, 196], 'solid'], ['32', [247, 251, 255], 'solid']],
  /* VIIRS_DayNightBand_At_Sensor_Radiance.xml: nanowatts per square centimetre per steradian */
  lights: [['0', [7, 7, 7], 'clear'], ['0.1', [13, 13, 13], 'clear'], ['1.9', [77, 77, 77], 'faint'], ['8.2', [155, 155, 155], 'solid'], ['38', [255, 255, 255], 'solid']],
  /* GHRSST_Sea_Ice_Concentration.xml over MODIS_NDSI_Snow_Cover.xml */
  ice: [['open sea', [17, 17, 17], 'clear'], ['9% ice', [149, 0, 149], 'keep'], ['49% ice', [0, 222, 156], 'keep'], ['100% ice', [255, 255, 255], 'keep'], ['thin snow', [240, 240, 128], 'keep'], ['full snow', [255, 0, 0], 'keep']],
  /* MODIS_Flood.xml */
  flood: [['flood', [250, 30, 36], 'keep'], ['floods most years', [255, 255, 0], 'keep'], ['usual water', [50, 210, 245], 'keep'], ['could not be seen', [175, 175, 175], 'faint']],
  /* a photograph: black is where no pass has been yet */
  unseen: [['no pass yet', [0, 0, 0], 'clear'], ['deep sea', [5, 14, 34], 'keep'], ['land', [90, 92, 48], 'keep'], ['cloud', [225, 228, 232], 'keep']]
};
let bad = 0, n = 0;
for (const name of Object.keys(CASES)) {
  if (typeof TONE[name] !== 'function') { console.log('MISSING  ' + name); bad++; continue; }
  for (const [amount, rgb, want] of CASES[name]) {
    const d = new Uint8ClampedArray([rgb[0], rgb[1], rgb[2], 255]); TONE[name](d); n++;
    const same = d[0] === rgb[0] && d[1] === rgb[1] && d[2] === rgb[2];
    const got = d[3] === 0 ? 'clear' : d[3] < 250 ? 'faint' : same ? 'keep' : 'solid';
    if (got !== want) { bad++; console.log('WRONG    ' + name + ' at ' + amount + ': NASA sends ' + rgb + ', expected ' + want + ', got ' + got + ' (' + Array.from(d) + ')'); }
  }
  /* a colour that is not in the table at all must come through exactly as it was */
  if (name !== 'unseen' && name !== 'ice') { const d = new Uint8ClampedArray([40, 200, 90, 255]); TONE[name](d); n++; if (d.join() !== '40,200,90,255') { bad++; console.log('WRONG    ' + name + ' changed a colour it does not know: ' + Array.from(d)); } }
}
console.log(bad ? bad + ' of ' + n + ' checks failed' : 'tones: ' + n + ' checks, all right');
process.exit(bad ? 1 : 0);
