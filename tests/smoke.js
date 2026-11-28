// Smoke tests. Renders the built page (index.html) in headless Chromium, on a desktop and a phone-sized screen.
// The libraries the page loads from CDNs are served from node_modules, and every live feed is replaced by stand-in data
// in the real response shape, so the parsing and drawing code runs without touching the network.
//   node tests/smoke.js <mode> [action] [desktop|phone]
//   modes:   ok | offline | backup | nocors          actions: see tests/README.md
// Screenshots go to tests/out/. The run prints "errors: none" when the page raised no errors.
const { chromium } = require('playwright');
const sharp = require('sharp');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const nm = p => fs.readFileSync(path.join(__dirname, '..', 'node_modules', p));
const gibs = require('./gibs-standin.js');          /* NASA's image service: GIBS=down|stale, GIBS_GONE=<layer,...>, GIBS_QUIET=<layer,...>, GIBS_GRID=1, GIBS_WAIT=<ms> */
const list = v => (v || '').split(',').filter(Boolean);
/* choose a NASA view the way the picker does (on a phone the picker sits in a tab that may not be open) */
const pickView = (page, id) => page.evaluate(id => { const el = document.querySelector('#overlay-pick'); el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }, id);
/* places where the stand-in is known to send something particular, for the colour check: [what, lat, lon] */
const SPOTS = {
  no2: [['clean air over the ocean', -22, 78], ['the middle of a polluted city', 28.6, 77.2], ['its outskirts', 28.6, 80.2], ['its far edge', 28.6, 81.6]],
  haze: [['the middle of a smoke plume', 58, 110], ['clear air', -30, 60], ['its edge', 44, 100]],
  so2: [['the middle of a gas plume', -7.5, 110.4], ['part way out', -7.5, 104], ['no gas', 12, 62]],
  night: [['a city centre', 19, 72.9], ['dark ocean', -22, 78], ['the edge of a city', 19, 74.2]],
  snow: [['open sea', -10, 75], ['pack ice', 73.2, 40], ['snow on land', 62, 95]],
  flood: [['a flood', 24.5, 90.5]],
  sst: [['tropical sea', -5, 75], ['cold sea', -48, 75]], chl: [['open ocean', -22, 78]], lst: [['a continent', 22, 78]], soil: [['a continent', 22, 78]], ndvi: [['a continent', 22, 78]],
  true: [['open ocean', -22, 78], ['land', 22, 78]]
};
const GIBS = { down: process.env.GIBS === 'down', stale: process.env.GIBS === 'stale', gone: list(process.env.GIBS_GONE), quiet: list(process.env.GIBS_QUIET), grid: !!process.env.GIBS_GRID };
const now = Date.now();
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const belts = [[35,-118],[61,-150],[19,-155],[36,139],[-6,128],[-20,-70],[38,27],[-18,-175],[28,84],[45,150],[13,-90]];
const quakes = { features: Array.from({ length: 220 }, (_, i) => { const b = belts[i % belts.length];
  return { id: 'q' + i, properties: { mag: +(Math.pow(rnd(), 2.2) * 6.4 + 0.4).toFixed(1), place: (5 + i) + ' km S of Test Town ' + i, time: now - Math.pow(rnd(), 1.6) * 864e5, url: 'https://earthquake.usgs.gov/', type: 'earthquake', status: 'reviewed', felt: i % 9 ? null : 42, tsunami: 0, sig: 300, alert: i % 40 ? null : 'yellow' },
    geometry: { coordinates: [b[1] + (rnd() - .5) * 14, b[0] + (rnd() - .5) * 10, rnd() * 80] } }; }) };
const ev = (id, cat, title, pts) => ({ id, title, categories: [{ id: cat, title: cat }], sources: [{ id: 'GDACS', url: 'https://www.gdacs.org/' }],
  geometry: pts.map((c, i) => ({ type: 'Point', coordinates: c, date: new Date(now - (pts.length - i) * 6 * 36e5).toISOString(), magnitudeValue: cat === 'severeStorms' ? 35 + i * 5 : null, magnitudeUnit: cat === 'severeStorms' ? 'kts' : null })) });
const events = { events: [
  ev('s1', 'severeStorms', 'Tropical Cyclone Akvan', [[88, 8], [87, 10], [86, 12], [85.5, 14], [86, 16.5], [87.5, 18.5]]),
  ev('s2', 'severeStorms', 'Typhoon Example', [[140, 12], [136, 15], [132, 18], [129, 22]]),
  ...Array.from({ length: 13 }, (_, i) => ev('f' + i, 'wildfires', 'Wildfire ' + i + ', Somewhere County', [[[-120, 145, 20, 78, -60][i % 5] + rnd() * 12, [38, -30, 5, 22, -12][i % 5] + rnd() * 8]])),
  ...Array.from({ length: 6 }, (_, i) => ev('i' + i, 'seaLakeIce', 'Iceberg A' + (20 + i), [[-60 + i * 25, -66 + rnd() * 6]])),
  ev('v1', 'volcanoes', 'Mount Example Volcano', [[110.4, -7.5]])
] };
const gdacs = { type: 'FeatureCollection', bbox: null, features: [['TC', 'Tropical Cyclone AKVAN-26', 'Orange', 86.4, 13.8, 'India'], ['DR', 'Drought in Southern Africa', 'Orange', 26, -18, 'Zambia, Zimbabwe'], ['FL', 'Flood in Testland', 'Red', 100.5, 14, 'Thailand']].map((a, i) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [a[3], a[4]] }, properties: { eventtype: a[0], eventid: 1001351 + i, name: a[1], description: a[1], htmldescription: 'Orange alert for <b>' + a[1] + '</b> affecting many people', alertlevel: a[2], alertscore: 2,
    iscurrent: 'true', country: a[5], fromdate: '2026-11-16T18:00:00', todate: '2026-11-18T18:00:00', datemodified: '2026-11-18T12:00:00', url: { report: 'https://www.gdacs.org/report.aspx?eventid=1', details: '', geometry: '' }, severitydata: { severity: 83.3, severitytext: 'Tropical Storm (maximum wind speed of 83 km/h)', severityunit: 'km/h' } } })) };
const hubs = [[50,8],[40,-75],[34,-118],[25,55],[1,104],[35,139],[28,77],[19,73],[51,0],[41,-87],[-23,-46],[-33,151],[31,121],[13,80]];
const states = { time: Math.floor(now / 1000), states: Array.from({ length: 9000 }, (_, i) => { const h = hubs[i % hubs.length];
  const r = Math.pow(rnd(), 1.4) * 34, a = rnd() * 6.283;
  return [(0x400000 + i).toString(16), 'TST' + (100 + i % 900) + ' ', 'Testland', Math.floor(now / 1000), Math.floor(now / 1000), h[1] + r * Math.cos(a) * 1.5, h[0] + r * Math.sin(a), 10500, false, 230, rnd() * 360, 0, null, 10800, '1000', false, 0]; }) };
const doy = ((now - Date.UTC(new Date(now).getUTCFullYear(), 0, 1)) / 864e5 + 1 - 0.3).toFixed(8).padStart(12, '0');
const tle = (n, name, incl, raan, ma, mm) => { const id = String(n).padStart(5, '0');
  return name + '\n1 ' + id + 'U 20001A   26' + doy + '  .00001000  00000-0  10000-4 0  9990\n2 ' + id + ' ' + incl.toFixed(4).padStart(8) + ' ' + raan.toFixed(4).padStart(8) + ' 0005000 ' + (0).toFixed(4).padStart(8) + ' ' + ma.toFixed(4).padStart(8) + ' ' + mm.toFixed(8).padStart(11) + '    10\n'; };
const sl = Array.from({ length: 7000 }, (_, i) => tle(44000 + i, 'STARLINK-' + (1000 + i), i % 5 ? 53.05 : 70, (i % 72) * 5 + rnd(), rnd() * 360, 15.06)).join('');
const active = tle(25544, 'ISS (ZARYA)', 51.64, 59.2, 347.6, 15.5) + tle(48274, 'CSS (TIANHE)', 41.47, 120, 100, 15.6) + sl +
  Array.from({ length: 640 }, (_, i) => tle(52000 + i, 'ONEWEB-' + String(i).padStart(4, '0'), 87.9, (i % 12) * 15, rnd() * 360, 13.1)).join('') +
  Array.from({ length: 31 }, (_, i) => tle(30000 + i, 'GPS BIIF-' + i + '  (PRN ' + i + ')', 55, (i % 6) * 60, rnd() * 360, 2.0056)).join('') +
  Array.from({ length: 24 }, (_, i) => tle(31000 + i, 'COSMOS 24' + (30 + i) + ' (7' + (20 + i) + ')', 64.8, (i % 3) * 120, rnd() * 360, 2.1310)).join('') +
  Array.from({ length: 28 }, (_, i) => tle(32000 + i, 'GSAT02' + String(i).padStart(2, '0') + ' (GALILEO ' + i + ')', 56, (i % 3) * 120 + 40, rnd() * 360, 1.7047)).join('') +
  Array.from({ length: 520 }, (_, i) => tle(33000 + i, 'COMSAT ' + i, 0.05, rnd() * 360, rnd() * 360, 1.0027)).join('') +
  Array.from({ length: 2600 }, (_, i) => tle(60000 + i, i % 9 ? 'EARTH OBSERVER ' + i : 'HUBBLE-LIKE ' + i, 97.5 - (i % 7) * 6, rnd() * 360, rnd() * 360, 14.2 + rnd() * 1.1)).join('');
const debris = Array.from({ length: 900 }, (_, i) => tle(29700 + i, 'FENGYUN 1C DEB', 98.6, rnd() * 360, rnd() * 360, 14.1 + rnd())).join('');
const fam = (n0, name, n, incl, mm) => Array.from({ length: n }, (_, i) => tle(n0 + i, name, incl, rnd() * 360, rnd() * 360, typeof mm === 'function' ? mm(i) : mm + rnd() * 0.6)).join('');
const debrisAll = fam(29700, 'FENGYUN 1C DEB', 900, 98.6, 14.1) + fam(33700, 'COSMOS 2251 DEB', 520, 74, 14.3) + fam(34700, 'IRIDIUM 33 DEB', 160, 86.4, 14.4) + fam(64000, 'CZ-6A DEB', 310, 88, 13.9) + fam(8000, 'SL-8 DEB', 210, 82.9, 13.7) +
  fam(41000, 'COSMOS 1408 DEB', 9, 82.5, i => 16.05 + i * 0.03) + tle(47000, 'DEBUT (ORIGAMI)', 51.6, 10, 10, 15.4);
const rocketsAll = fam(20000, 'FALCON 9 R/B', 60, 28.5, 12.2) + fam(21000, 'CZ-2C R/B', 140, 63, 14.6) + fam(22000, 'SL-8 R/B', 180, 74, 13.8) + fam(23000, 'ATLAS 5 CENTAUR R/B', 40, 26, 2.3) + fam(24000, 'SL-16 R/B', 22, 71, 14.15) + tle(24900, 'ELECTRON R/B', 97.5, 5, 5, 16.2);
const deadCosmos = fam(13000, 'COSMOS 1500', 900, 74, 13.6) + fam(33700, 'COSMOS 2251 DEB', 50, 74, 14.3) + fam(31000, 'COSMOS 2430 (720)', 24, 64.8, 2.131) + fam(16000, 'COSMOS 1700 COOLANT', 5, 65, 13.5) + fam(17000, 'COSMOSAT X', 3, 65, 14);
const tca = k => new Date(now + k * 36e5).toISOString().replace('T', ' ').slice(0, 23);
const socrates = 'NORAD_CAT_ID_1,OBJECT_NAME_1,DSE_1,NORAD_CAT_ID_2,OBJECT_NAME_2,DSE_2,TCA,TCA_RANGE,TCA_RELATIVE_SPEED,MAX_PROB,DILUTION\n' +
  [[44001, 'STARLINK-1001 [+]', 29701, 'FENGYUN 1C DEB [-]', 31, 0.012, 14.211], [60003, 'EARTH OBSERVER 3 [+]', 22004, 'SL-8 R/B [-]', 52, 0.038, 11.02], [52010, 'ONEWEB-0010 [+]', 33710, 'COSMOS 2251 DEB [-]', 7, 0.061, 9.87],
   [44100, '"STARLINK-1100, TEST" [+]', 64010, 'CZ-6A DEB [-]', 101, 0.094, 13.3], [60020, 'EARTH OBSERVER 20 [P]', 60500, 'EARTH OBSERVER 500 [+]', 140, 0.21, 5.2], [99991, 'OLD SAT [-]', 99992, 'PAST EVENT [-]', -30, 0.004, 12]]
    .map(r => [r[0], r[1], 1.9, r[2], r[3], 3.1, tca(r[4]), r[5].toFixed(3), r[6].toFixed(3), '1.234E-03', '0.012'].join(',')).join('\n') + '\n';
const station = { id: 4, name: 'International Space Station', orbit: 'Low Earth Orbit', onboard_crew: 7, docked_vehicles: 3, docking_location: [
  { name: 'Harmony forward', currently_docked: { docking: new Date(now - 49 * 864e5).toISOString(), flight_vehicle_chaser: { spacecraft: { name: 'Crew Dragon Grace' } } } }, { name: 'Zarya nadir', currently_docked: null },
  { name: 'Zvezda aft', currently_docked: { docking: new Date(now - 200 * 864e5).toISOString(), flight_vehicle_chaser: { spacecraft: { name: 'Progress MS-34' } } } }, { name: 'Poisk zenith', currently_docked: { docking: new Date(now - 60 * 864e5).toISOString(), flight_vehicle_chaser: { spacecraft: { name: 'Progress MS-35' } } } }] };
const co2 = { co2: Array.from({ length: 3950 }, (_, i) => { const d = new Date(Date.UTC(2016, 0, 25) + i * 864e5); return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1), day: String(d.getUTCDate()), cycle: (402 + i * 0.0067 + 3 * Math.sin(i / 58)).toFixed(2), trend: (402 + i * 0.0067).toFixed(2) }; }) };
const trainsFi = Array.from({ length: 86 }, (_, i) => ({ trainNumber: 20 + i, departureDate: '2026-11-18', timestamp: new Date(now - 4000).toISOString(), location: { type: 'Point', coordinates: [22 + rnd() * 7, 60.2 + rnd() * 6] }, speed: Math.round(rnd() * 160), accuracy: 0 }));
const amtrak = {}; for (let i = 0; i < 120; i++) amtrak[String(i + 1)] = [{ routeName: ['Southwest Chief', 'Coast Starlight', 'Acela', 'Empire Builder'][i % 4], trainNum: String(i + 1), trainID: (i + 1) + '-18', lat: 30 + rnd() * 17, lon: -120 + rnd() * 45, trainTimely: '', velocity: 20 + rnd() * 60, heading: ['N', 'SE', 'W'][i % 3],
  trainState: i % 11 ? 'Active' : 'Predeparture', origName: 'Chicago Union Station', destName: 'Los Angeles Union Station', provider: i % 9 ? 'Amtrak' : 'Via', lastValTS: new Date(now - 60000).toISOString(), stations: [] }];
const camsFi = { type: 'FeatureCollection', dataUpdatedTime: new Date().toISOString(), features: Array.from({ length: 420 }, (_, i) => ({ type: 'Feature', id: 'C' + String(1000 + i).padStart(5, '0'), geometry: { type: 'Point', coordinates: [21.5 + rnd() * 8.5, 60 + rnd() * 8, 0] },
  properties: { id: 'C' + String(1000 + i).padStart(5, '0'), name: ['vt4_Oulu_Lintula', 'kt51_Inkoo', 'st101_Helsinki'][i % 3], collectionStatus: i % 30 ? 'GATHERING' : 'REMOVED_TEMPORARILY', state: null, presets: [{ id: 'C' + String(1000 + i).padStart(5, '0') + '01', inCollection: true }] } })) };
const camsLdn = Array.from({ length: 300 }, (_, i) => ({ id: 'JamCams_00001.0' + (4000 + i), commonName: 'Test Road / Camera ' + i, placeType: 'JamCam', lat: 51.38 + rnd() * 0.25, lon: -0.4 + rnd() * 0.6, additionalProperties: [{ key: 'available', value: i % 20 ? 'true' : 'false' },
  { key: 'imageUrl', value: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/0000' + i + '.jpg' }, { key: 'videoUrl', value: 'https://s3-eu-west-1.amazonaws.com/jamcams.tfl.gov.uk/0000' + i + '.mp4' }, { key: 'view', value: 'SOUTH - A214 Trinity Rd' }] }));
const camsSg = { items: [{ timestamp: new Date().toISOString(), cameras: Array.from({ length: 8 }, (_, i) => ({ timestamp: new Date().toISOString(), image: 'https://images.data.gov.sg/api/traffic-images/x' + i + '.jpg', location: { latitude: 1.29 + rnd() * 0.1, longitude: 103.7 + rnd() * 0.25 }, camera_id: String(2701 + i) })) }] };
const cableLine = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n + 4 * Math.sin(Math.PI * i / n)]);
const cables = { type: 'FeatureCollection', features: [['atl-1', [-74, 40], [-9, 39]], ['atl-2', [-80, 26], [-5, 50]], ['ind-1', [72.9, 19], [32, 30]], ['ind-2', [80, 13], [103.8, 1.3]], ['pac-1', [139.7, 35], [202, 21]], ['pac-2', [-158, 21], [-118, 34]], ['afr-1', [-17, 14.7], [18.4, -33.9]], ['sam-1', [-43, -23], [-9, 38.7]]]
  .map((c, i) => ({ type: 'Feature', properties: { id: c[0], name: c[0].toUpperCase(), color: '#939597', feature_id: c[0] + '-0', coordinates: c[1] }, geometry: { type: 'MultiLineString', coordinates: [cableLine(c[1], c[2], i % 2 ? 6 : 40)] } })) };
const sounds = { total_results: 60, results: Array.from({ length: 60 }, (_, i) => ({ id: 7000 + i, uri: 'https://www.inaturalist.org/observations/' + (7000 + i), species_guess: 'Test frog', taxon: { name: 'Hyla testus', preferred_common_name: ['spring peeper', 'common nightingale', 'field cricket'][i % 3], iconic_taxon_name: ['Amphibia', 'Aves', 'Insecta'][i % 3], wikipedia_url: 'https://en.wikipedia.org/wiki/Frog' },
  place_guess: 'Test Marsh, Testland', time_observed_at: new Date(now - i * 4e6).toISOString(), created_at: new Date(now - i * 3e6).toISOString(), geojson: { type: 'Point', coordinates: [-100 + rnd() * 240, -40 + rnd() * 100] }, user: { login: 'naturalist' + i },
  photos: i % 2 ? [{ url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/square.jpg', attribution: '(c) someone' }] : [], sounds: i % 10 ? [{ id: i, license_code: 'cc-by-nc', attribution: '(c) naturalist, some rights reserved (CC BY-NC)', file_url: 'https://example.org/stream-sound' + i + '.wav', file_content_type: 'audio/x-wav' }] : [{ id: i, file_url: null }] })) };
// the same stand-in orbits as CelesTrak's table form (CSV); some get six-digit catalogue numbers, which the two-line form cannot carry
const toCsv = t => { const L = t.trim().split('\n'), out = ['OBJECT_NAME,OBJECT_ID,EPOCH,MEAN_MOTION,ECCENTRICITY,INCLINATION,RA_OF_ASC_NODE,ARG_OF_PERICENTER,MEAN_ANOMALY,EPHEMERIS_TYPE,CLASSIFICATION_TYPE,NORAD_CAT_ID,ELEMENT_SET_NO,REV_AT_EPOCH,BSTAR,MEAN_MOTION_DOT,MEAN_MOTION_DDOT'];
  const ep = new Date(Date.UTC(new Date(now).getUTCFullYear(), 0, 1) + (parseFloat(doy) - 1) * 864e5).toISOString().replace('Z', '') + '000';
  for (let i = 0; i + 2 < L.length; i += 3) { const a = L[i + 1], b = L[i + 2], id = +a.slice(2, 7), big = id >= 50000 && id < 50300 ? id + 60000 : id;
    out.push([L[i].includes(',') ? '"' + L[i] + '"' : L[i], '2020-001A', ep, +b.slice(52, 63), '.' + b.slice(26, 33), +b.slice(8, 16), +b.slice(17, 25), +b.slice(34, 42), +b.slice(43, 51), 0, 'U', big, 999, 1, '.10000E-3', '.00001', 0].join(',')); }
  return out.join('\r\n') + '\r\n'; };
const dsnXml = '<?xml version="1.0"?><dsn><station name="gdscc" friendlyName="Goldstone" timeUTC="1794988453000" timeZoneOffset="-28800000.0"/>' +
  '<dish name="DSS14" azimuthAngle="90" elevationAngle="45" windSpeed="5" isMSPA="false" isArray="false" isDDOR="false" activity="Engineering Upgrades"><target name="DSN" id="99" uplegRange="-1" downlegRange="-1" rtlt="-1"/></dish>' +
  '<dish name="DSS25" azimuthAngle="200" elevationAngle="30" windSpeed="5" isMSPA="false" isArray="false" isDDOR="false" activity="TT&amp;C"><upSignal active="true" signalType="data" dataRate="2000" frequency="7.1e9" band="X" power="4.9" spacecraft="JNO" spacecraftID="-61"/><downSignal active="true" signalType="data" dataRate="120000" frequency="8.4e9" band="X" power="-130" spacecraft="JNO" spacecraftID="-61"/><target name="JNO" id="61" uplegRange="8.1e8" downlegRange="8.1e8" rtlt="5400"/></dish>' +
  '<station name="mdscc" friendlyName="Madrid" timeUTC="1794988453000" timeZoneOffset="3600000.0"/><dish name="DSS63" azimuthAngle="10" elevationAngle="20" windSpeed="3" isMSPA="false" isArray="false" isDDOR="false" activity="TT&amp;C"><downSignal active="true" signalType="data" dataRate="245000" frequency="2.2e9" band="S" power="-120" spacecraft="SOHO" spacecraftID="-21"/><target name="SOHO" id="21" uplegRange="1.5e6" downlegRange="1.5e6" rtlt="10"/></dish>' +
  '<station name="cdscc" friendlyName="Canberra" timeUTC="1794988453000" timeZoneOffset="39600000.0"/><dish name="DSS43" azimuthAngle="10" elevationAngle="20" windSpeed="3" isMSPA="false" isArray="false" isDDOR="false" activity="TT&amp;C"><downSignal active="true" signalType="data" dataRate="160" frequency="8.4e9" band="X" power="-158" spacecraft="VGR2" spacecraftID="-32"/><target name="VGR2" id="32" uplegRange="2.11e10" downlegRange="2.11e10" rtlt="140500"/></dish>' +
  '<dish name="DSS35" azimuthAngle="10" elevationAngle="20" windSpeed="3" isMSPA="false" isArray="false" isDDOR="false" activity="TT&amp;C"><downSignal active="false" signalType="none" dataRate="0" frequency="0" band="X" power="0" spacecraft="NHPC" spacecraftID="-98"/><target name="NHPC" id="98" uplegRange="9.5e9" downlegRange="9.5e9" rtlt="63000"/></dish><timestamp>1794988453000</timestamp></dsn>';
const nws = { type: 'FeatureCollection', features: Array.from({ length: 30 }, (_, i) => { const lo = -100 + rnd() * 20, la = 30 + rnd() * 12; return { id: 'https://api.weather.gov/alerts/urn:oid:' + i, type: 'Feature', geometry: i % 3 === 2 ? null : { type: 'Polygon', coordinates: [[[lo, la], [lo + .6, la], [lo + .6, la + .5], [lo, la + .5], [lo, la]]] },
  properties: { id: 'urn:oid:' + i, areaDesc: 'Test County, TX; Other County, TX', sent: new Date(now - i * 9e5).toISOString(), effective: new Date(now - i * 9e5).toISOString(), expires: new Date(now + 36e5).toISOString(), ends: new Date(now + 54e5).toISOString(), status: 'Actual', messageType: 'Alert',
    severity: i % 7 ? 'Severe' : 'Extreme', certainty: 'Observed', urgency: 'Immediate', event: ['Severe Thunderstorm Warning', 'Flash Flood Warning', 'Tornado Warning'][i % 3], senderName: 'NWS Fort Worth TX', headline: 'Warning issued until 9 PM CST by NWS Fort Worth TX', description: 'At 742 PM CST, a severe thunderstorm was located near Test Town, moving east at 35 mph.\n\nHAZARD...60 mph wind gusts and quarter size hail.', instruction: 'For your protection move to an interior room on the lowest floor of a building.' } }; }) };
const mostread = { mostread: { date: '2026-11-18Z', articles: [['Main_Page', 5e6], ['Example_person', 1234567], ['Another_topic', 654321], ['Third_thing', 43210], ['Special:Search', 99999], ['Fourth_item', 32100]].map((a, i) => ({ views: a[1], rank: i + 1, type: 'standard', title: a[0], normalizedtitle: a[0].replace(/_/g, ' '),
  description: 'short description of the topic', extract: 'A long opening paragraph about this topic that explains what it is and why people might be reading about it today, taken from the top of the article.', thumbnail: { source: 'https://upload.wikimedia.org/thumb' + i + '.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/' + a[0] } } })) }, news: [], onthisday: [] };
const pastL = { count: 6, results: [['Long March 2D | Shijian 24', 0.3, 'Launch Successful'], ['Vulcan VC6L | Amazon Leo (LV-01)', 3.2, 'Launch Failure'], ['Electron | The Mountain God Rises', 4.9, 'Launch Successful'], ['Starship | Starlink Group 31-2', 5.6, 'Launch Successful']].map((l, i) => ({ id: 'p' + i, name: l[0], net: new Date(now - l[1] * 864e5).toISOString(), status: { id: 3, name: l[2], abbrev: 'x' }, image: { image_url: 'https://upload.wikimedia.org/l' + i + '.jpg', thumbnail_url: 'https://upload.wikimedia.org/lt' + i + '.jpg' } })) };
const groups = {
  stations: tle(25544, 'ISS (ZARYA)', 51.64, 59.2, 347.6, 15.5) + tle(48274, 'CSS (TIANHE)', 41.47, 120, 100, 15.6) + tle(49044, 'ISS (NAUKA)', 51.64, 59.2, 347.6, 15.5),
  active, 'fengyun-1c-debris': debris
};
const ovation = { 'Observation Time': '2026-11-18T19:52:00Z', 'Forecast Time': '2026-11-18T21:00:00Z', 'Data Format': '[Longitude, Latitude, Aurora]', coordinates: [] };
for (let lo = 0; lo < 360; lo++) for (let la = -90; la <= 90; la++) { const c = 67 + 4 * Math.cos((lo - 80) * Math.PI / 180); ovation.coordinates.push([lo, la, Math.round(Math.max(0, 62 * Math.exp(-Math.pow((Math.abs(la) - c) / 3.2, 2)) * (0.6 + 0.4 * Math.sin(lo / 9))))]); }
const kp = Array.from({ length: 30 }, (_, i) => ({ time_tag: new Date(now - (30 - i) * 3 * 36e5).toISOString().slice(0, 19), Kp: +(1.5 + 3.5 * Math.abs(Math.sin(i / 4))).toFixed(2), a_running: 9, station_count: 8 }));
const alerts = [['EF3A', 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu'], ['A20F', 'WATCH: Geomagnetic Storm Category G1 Predicted']].map((a, i) => ({ product_id: a[0], issue_datetime: new Date(now - (i + 1) * 9 * 36e5).toISOString().replace('T', ' ').slice(0, 23), message: 'Space Weather Message Code: ' + a[0] + '\r\nSerial Number: 1\r\nIssue Time: 2026 Nov 17 0848 UTC\r\n\r\n' + a[1] + '\r\nPotential Impacts: test text.' }));
const launches = { count: 474, results: [['Long March 2D | Unknown Payload', 0.14, 38.86, 111.59, 'Taiyuan Satellite Launch Center, China'], ['Falcon 9 Block 5 | USSF-317', 1.3, 28.56, -80.58, 'Cape Canaveral SFS, FL, USA'], ['Electron | Test Mission', 3, -39.26, 177.86, 'Rocket Lab LC-1, Mahia Peninsula, New Zealand'], ['Ariane 62 | Sentinel', 6, 5.24, -52.77, 'Guiana Space Centre, French Guiana']].map((l, i) => ({
  id: 'l' + i, name: l[0], net: new Date(now + l[1] * 864e5).toISOString(), status: { id: 1, name: 'Go for Launch', abbrev: 'Go' }, launch_service_provider: { name: 'Test Agency' }, rocket: { configuration: { name: l[0].split(' | ')[0], full_name: l[0].split(' | ')[0] } },
  mission: { name: 'M', description: 'A test payload heading to orbit for demonstration purposes.', orbit: { name: 'Low Earth Orbit' }, vid_urls: [], info_urls: [] }, pad: { name: 'Pad ' + i, latitude: l[2], longitude: l[3], location: { name: l[4] } }, image: null })) };
const people = { count: 12, results: ['Jessica Watkins|NASA', 'Starman|SpX', 'Joshua Kutryk|CSA', 'Anna Kikina|RFSA', 'Zhu Yangzhu|CNSA', 'Laika|CCCP'].map(s => ({ name: s.split('|')[0], agency: { name: 'x', abbrev: s.split('|')[1] }, type: { id: 1, name: /Starman|Laika/.test(s) ? 'Non-Human' : 'Government' } })) };
const newsHtml = '<div class="mw-parser-output"><div class="current-events-main vevent"><div class="current-events-content description">' +
  '<p><b>Armed conflicts and attacks</b></p><ul><li><a href="/wiki/Example_war" title="Example war">Example war</a><ul><li>Forces strike a fuel depot near <a href="/wiki/Kharkiv" title="Kharkiv">Kharkiv</a>, and officials say power is out across the region. <a rel="nofollow" class="external text" href="https://example.org/a">(Reuters)</a></li></ul></li></ul>' +
  '<p><b>Disasters and accidents</b></p><ul><li>A magnitude 6.1 earthquake strikes western <a href="/wiki/Nepal" title="Nepal">Nepal</a>, damaging hundreds of homes. <a rel="nofollow" class="external text" href="https://example.org/b">(BBC News)</a></li><li>Flooding in <a href="/wiki/Bangkok" title="Bangkok">Bangkok</a> forces thousands to leave their homes. <a rel="nofollow" class="external text" href="https://example.org/c">(AP)</a></li></ul>' +
  '<p><b>Science and technology</b></p><ul><li>Researchers announce a new result with no place attached to it at all today. <a rel="nofollow" class="external text" href="https://example.org/d">(Nature)</a></li><li><a href="/wiki/Brazil" title="Brazil">Brazil</a> launches its first homegrown satellite from <a href="/wiki/Alc%C3%A2ntara_Space_Center" title="Alcântara Space Center">Alcântara</a>. <a rel="nofollow" class="external text" href="https://example.org/e">(G1)</a></li></ul></div></div></div>';
const coords = { Kharkiv: [49.99, 36.23], Nepal: [28, 84], Bangkok: [13.75, 100.5], Brazil: [-10, -52] };
const ships = { type: 'FeatureCollection', dataUpdatedTime: new Date().toISOString(), features: Array.from({ length: 300 }, (_, i) => ({ mmsi: 230000000 + i, type: 'Feature', geometry: { type: 'Point', coordinates: [19 + rnd() * 8, 58.5 + rnd() * 6] }, properties: { mmsi: 230000000 + i, sog: rnd() * 14, cog: rnd() * 360, navStat: 0, rot: 0, posAcc: false, raim: false, heading: 104, timestamp: 1, timestampExternal: now - rnd() * 6e5 } })) };
const radios = Array.from({ length: 300 }, (_, i) => ({ stationuuid: 'r' + i, name: 'Radio Test ' + i, url_resolved: 'https://example.org/stream' + i, homepage: 'https://example.org', favicon: '', country: 'Testland', state: 'Test State', tags: 'pop,news,talk', language: 'english', hls: 0, codec: 'MP3', bitrate: 128, geo_lat: -40 + rnd() * 100, geo_long: -120 + rnd() * 260, clickcount: 400 - i }));
const wav = (() => { const n = 8000 * 6, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(6 * Math.sin(i / 3)); return b; })();
const fireballs = { fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'], data: Array.from({ length: 20 }, (_, i) => [new Date(now - i * 12 * 864e5).toISOString().replace('T', ' ').slice(0, 19), '2.2', (0.08 + rnd() * 2).toFixed(2), (rnd() * 60).toFixed(1), rnd() < .5 ? 'S' : 'N', (rnd() * 170).toFixed(1), rnd() < .5 ? 'W' : 'E', '37.0', null]) };
const cad = { fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h'], count: 3, data: [['2026 WH', '1', '2461362.57', '2026-Nov-19 01:52', '0.0117446', '0.0117', '0.0117', '8.96', '8.94', '< 00:01', '27.017'], ['2026 WA', '1', '2461363', '2026-Nov-21 11:02', '0.031', '0.03', '0.03', '12', '12', '< 00:01', '24.2'], ['2021 AB', '1', '2461365', '2026-Nov-24 09:10', '0.044', '0.04', '0.04', '6', '6', '< 00:01', '22.9']] };
const meteoOne = (la, lo, full) => { const o = { latitude: la, longitude: lo, elevation: 216, utc_offset_seconds: Math.round(lo / 15) * 3600, timezone: 'Etc/GMT', current: { time: '2026-11-19T01:00', temperature_2m: Math.round(28 - Math.abs(la) * 0.45 + rnd() * 4), apparent_temperature: 21, relative_humidity_2m: 62, precipitation: 0, weather_code: [0, 2, 3, 61, 95][Math.floor(rnd() * 5)], cloud_cover: 40, wind_speed_10m: 4 + 9 * Math.abs(Math.sin(la / 14)), wind_direction_10m: la > 30 || la < -30 ? 250 + 40 * Math.sin(lo / 30) : 70 + 30 * Math.cos(lo / 25), is_day: 1 } };
  if (full) { o.hourly = { time: [], temperature_2m: Array.from({ length: 24 }, (_, i) => 19 + 7 * Math.sin((i - 6) / 24 * 6.283)) }; o.daily = { time: Array.from({ length: 6 }, (_, i) => new Date(now + i * 864e5).toISOString().slice(0, 10)), weather_code: [0, 2, 61, 3, 95, 1], temperature_2m_max: [31, 32, 29, 30, 28, 31], temperature_2m_min: [22, 23, 22, 21, 22, 23], precipitation_probability_max: [0, 10, 80, 30, 65, 5], sunrise: ['2026-11-19T06:42'], sunset: ['2026-11-19T17:31'] }; }
  return o; };

(async () => {
  const cloudJpg = await sharp(Buffer.from(Array.from({ length: 128 * 64 }, () => (rnd() < 0.3 ? 255 : 0))), { raw: { width: 128, height: 64, channels: 1 } }).blur(3.2).resize(1024, 512, { kernel: 'cubic' }).jpeg({ quality: 70 }).toBuffer();
  const ctLog = [], ct = { status: 0, silent: false }; let refuse = true;
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const mode = process.argv[2] || 'ok', action = process.argv[3] || '';
  const only = process.argv[4];
  for (const [name, vp] of [['desktop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    if (only && only !== name) continue;
    if (process.env.VW && name === 'desktop') { vp.width = +process.env.VW; vp.height = +process.env.VH || vp.height; }
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: +process.env.DPR || (name === 'phone' ? 2 : 1) });
    if (process.env.WARM_NOGESTURE) await page.addInitScript(() => { Object.defineProperty(navigator, 'userActivation', { get: () => ({ hasBeenActive: !!window.__gesture, isActive: false }) }); });      /* a visitor who has not clicked or pressed anything yet */
    const errors = [], unknown = new Set(), gibsLog = []; let satLib = 0;
    page.on('requestfailed', r => { if (process.env.NETLOG && !/fonts/.test(r.url())) console.log('FAILED', r.url().slice(0, 90)); });
    page.on('requestfinished', r => { if (process.env.NETLOG && /met\.no|open-meteo\.com\/v1\/forecast\?latitude=19/.test(r.url())) console.log('OK', r.url().slice(0, 90)); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.route('**/*', route => {
      const u = route.request().url(), U = new URL(u);
      const js = body => route.fulfill({ contentType: 'application/javascript', body });
      const cors = { 'access-control-allow-origin': '*' };
      const json = o => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(o) });
      const text = t => route.fulfill({ contentType: 'text/plain', headers: cors, body: t });
      if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
      if (u.includes('three.min.js')) return js(nm('three/build/three.min.js'));
      if (u.includes('OrbitControls')) return js(nm('three/examples/js/controls/OrbitControls.js'));
      if (u.includes('satellite.min.js')) { satLib++; return js(nm('satellite.js/dist/satellite.min.js')); }
      if (u.includes('hls.light.min.js')) return mode === 'offline' ? route.abort() : js(nm('hls.js/dist/hls.light.min.js'));
      if (mode === 'offline') return route.abort();
      const h = U.hostname, q = U.searchParams;
      const primary = ['earthquake.usgs.gov', 'opensky-network.org', 'celestrak.org', 'geocoding-api.open-meteo.com', 'nominatim.openstreetmap.org', 'api.inaturalist.org', 'api.frankfurter.dev', 'caldays.com', 'get.geojs.io', 'api.adsbdb.com', 'api.adsb.lol'];
      if (mode === 'backup' && (primary.includes(h) || (h === 'api.open-meteo.com' && !q.get('latitude').includes(',')) || (h === 'services.swpc.noaa.gov' && u.includes('k-index')))) return route.abort();
      if (h === 'kanari.io') return json({ events: Array.from({ length: 1400 }, (_, i) => { const z = [[-8, 22], [8, 5], [-12, -55], [15, 100], [-20, 130], [45, -110], [60, 100]][i % 7]; return { id: 'k' + i, centroid: [z[1] + (rnd() - .5) * 26, z[0] + (rnd() - .5) * 14], count: 1 + Math.floor(rnd() * 9), firstSeen: new Date(now - 9e6).toISOString(), lastSeen: new Date(now - rnd() * 6e6).toISOString(), maxFrp: rnd() * rnd() * 400, confidence: ['possible', 'probable', 'corrobore'][i % 3] }; }), meta: { truncated: false } });
      if (h === 'api.inaturalist.org' && q.get('sounds')) return json(sounds);
      if (h === 'api.inaturalist.org') return json({ total_results: 99, results: Array.from({ length: 140 }, (_, i) => ({ id: 9000 + i, uri: 'https://www.inaturalist.org/observations/' + (9000 + i), species_guess: 'Test finch', taxon: { name: 'Fringilla testus', preferred_common_name: ['house sparrow', 'monarch butterfly', 'red fox', 'oak tree'][i % 4], iconic_taxon_name: ['Aves', 'Insecta', 'Mammalia', 'Plantae'][i % 4], wikipedia_url: 'https://en.wikipedia.org/wiki/House_sparrow' }, place_guess: 'Test Park, Somewhere', geojson: { coordinates: [-120 + rnd() * 260, -40 + rnd() * 100] }, time_observed_at: new Date(now - rnd() * 2e7).toISOString(), photos: [{ url: 'https://example.org/photos/1/square.jpg', attribution: '(c) tester, some rights reserved (CC BY-NC)' }], user: { login: 'naturalist' + i } })) });
      if (h === 'api.gbif.org') return json({ results: Array.from({ length: 80 }, (_, i) => ({ key: 5000 + i, species: 'Passer domesticus', vernacularName: 'House Sparrow', class: 'Aves', kingdom: 'Animalia', country: 'Testland', eventDate: new Date(now - 9e7).toISOString(), decimalLatitude: -40 + rnd() * 100, decimalLongitude: -120 + rnd() * 260, media: [{ identifier: 'https://example.org/p.jpg', rightsHolder: 'tester' }], recordedBy: 'tester' })) });
      if (h === 'api.citybik.es') return u.includes('/networks/') ? json({ network: { stations: Array.from({ length: 40 }, () => ({ free_bikes: 5, empty_slots: 7 })) } }) : json({ networks: Array.from({ length: 300 }, (_, i) => ({ id: 'net' + i, name: 'Bike Net ' + i, location: { city: 'City ' + i, country: 'TL', latitude: -35 + rnd() * 95, longitude: -120 + rnd() * 260 } })) });
      if (h === 'epic.gsfc.nasa.gov') return u.includes('/api/') ? json([{ identifier: '1', caption: 'x', image: 'epic_1b_20261113201540', date: '2026-11-13 20:10:52', centroid_coordinates: { lat: -12.63, lon: -136.69 } }]) : route.fulfill({ contentType: 'image/jpeg', body: cloudJpg });
      if (h === 'api.spaceflightnewsapi.net') return json({ count: 2, results: [{ id: 1, title: 'Insufficient fuel flow may have doomed test rocket', url: 'https://example.org/n1', image_url: null, news_site: 'SpaceNews', summary: 'A short summary of the article for testing.', published_at: new Date(now - 4e6).toISOString() }, { id: 2, title: 'New logistics centre announced for launch site', url: 'https://example.org/n2', image_url: null, news_site: 'SpacePolicyOnline.com', summary: 'Another summary.', published_at: new Date(now - 9e6).toISOString() }] });
      if (h === 'statisticsoftheworld.com') return json({ country: { id: 'IND', iso2: 'IN', name: 'India', region: 'South Asia', incomeLevel: 'Lower middle income', capitalCity: 'New Delhi' }, indicators: [{ id: 'SP.POP.TOTL', label: 'Population, total', value: 1450935791, year: 2025 }, { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita (current US$)', value: 2711.4, year: 2025 }, { id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth, total (years)', value: 72.2, year: 2024 }], meta: { attribution: 'x' } });
      if (h === 'api.frankfurter.dev' || h === 'open.er-api.com') return json({ amount: 1, base: 'USD', date: '2026-11-18', rates: { INR: 93.48, EUR: 0.9 } });
      if (h === 'caldays.com') return json([{ date: '2026-01-26', name: 'Republic Day' }, { date: '2026-12-25', name: 'Christmas Day' }]);
      if (h === 'date.nager.at') return json([{ date: '2026-12-25', localName: 'Christmas', name: 'Christmas Day' }]);
      if (h === 'macrostrat.org') return json({ success: { v: 2, data: [{ map_id: 1, name: 'Deccan Traps', lith: 'basalt; volcanic rocks', best_int_name: 'Late Cretaceous', t_age: 66, b_age: 68 }] } });
      if (h === 'get.geojs.io' || h === 'ipwho.is') return json({ latitude: '19.07', longitude: '72.88', city: 'Mumbai', country: 'India', success: true });
      if (h === 'flagcdn.com') return route.fulfill({ contentType: 'image/jpeg', body: cloudJpg });
      if (h === 'www.seismicportal.eu') return json({ features: Array.from({ length: 150 }, (_, i) => { const b = belts[i % belts.length]; return { id: 'e' + i, properties: { unid: 'e' + i, mag: +(1 + rnd() * 5).toFixed(1), flynn_region: 'TEST REGION ' + i, time: new Date(now - rnd() * 8e7).toISOString(), depth: 10, lat: b[0] + (rnd() - .5) * 10, lon: b[1] + (rnd() - .5) * 14 } }; }) });
      if (h === 'db.satnogs.org') { const tl = (q.get('norad_cat_id') ? groups.stations : active).trim().split('\n'), out = []; for (let i = 0; i + 2 < tl.length; i += 3) out.push({ tle0: '0 ' + tl[i], tle1: tl[i + 1], tle2: tl[i + 2] }); return json(q.get('norad_cat_id') ? out.filter(x => +x.tle1.slice(2, 7) === +q.get('norad_cat_id')) : out.slice(0, 3000)); }
      if (h === 'kp.gfz-potsdam.de') return json({ datetime: kp.map(k => k.time_tag + 'Z'), Kp: kp.map(k => k.Kp) });
      if (h === 'api.met.no') return json({ geometry: { coordinates: [72.88, 19.07, 14] }, properties: { timeseries: Array.from({ length: 30 }, (_, i) => ({ time: 'x', data: { instant: { details: { air_temperature: 24 + 4 * Math.sin(i / 4), relative_humidity: 70, cloud_area_fraction: 30, wind_speed: 3.2, wind_from_direction: 250 } }, next_1_hours: { summary: { symbol_code: 'partlycloudy_night' } } } })) } });
      if (h === 'api.bigdatacloud.net') return json({ city: 'Thane', principalSubdivision: 'Maharashtra', countryName: 'India', countryCode: 'IN' });
      if (h === 'hexdb.io') return u.includes('/route/') ? json({ flight: 'X', route: 'EGLL-KJFK' }) : json({ airport: 'Test Airport', region_name: u.includes('EGLL') ? 'London' : 'New York', iata: u.includes('EGLL') ? 'LHR' : 'JFK', icao: 'XXXX', latitude: u.includes('EGLL') ? 51.47 : 40.64, longitude: u.includes('EGLL') ? -0.46 : -73.78 });
      if (h === 'earthquake.usgs.gov') return json(quakes);
      if (h === 'eonet.gsfc.nasa.gov') return json(events);
      if (h === 'www.gdacs.org') return json(gdacs);
      if (h === 'opensky-network.org') return mode === 'nocors' ? route.abort() : json(states);
      if (h === 'api.adsb.lol') return mode === 'nocors' ? route.abort() : json({ ac: [] });
      if (h === 'opendata.adsb.fi') return json({ ac: Array.from({ length: 25 }, (_, i) => ({ hex: 'fi' + i + u.length, flight: 'FIN' + i, lat: +U.pathname.split('/')[4] + rnd() * 3, lon: +U.pathname.split('/')[6] + rnd() * 3, alt_baro: 34000, gs: 440, track: 45, seen_pos: 2 })) });
      if (h === 'api.airplanes.live') return json({ ac: Array.from({ length: 60 }, (_, i) => ({ hex: 'ab' + i + u.length, flight: 'REG' + i, r: 'VT-ABC', t: 'A320', lat: 18 + rnd() * 8, lon: 78 + rnd() * 8, alt_baro: 36000, gs: 450, track: 90, seen_pos: 1 })) });
      if (h === 'api.adsbdb.com') return u.includes('/callsign/') ? json({ response: { flightroute: { callsign: 'X', airline: { name: 'Test Airways', icao: 'TST' }, origin: { name: 'London Heathrow Airport', iata_code: 'LHR', municipality: 'London', latitude: 51.47, longitude: -0.46 }, destination: { name: 'John F Kennedy International Airport', iata_code: 'JFK', municipality: 'New York', latitude: 40.64, longitude: -73.78 } } } })
        : json({ response: { aircraft: { type: 'A320-214', manufacturer: 'Airbus', registration: 'G-TEST', registered_owner: 'Test Airways', url_photo_thumbnail: null } } });
      if (h === 'celestrak.org') {
        ctLog.push((q.get('GROUP') || q.get('NAME') || (u.includes('SOCRATES') ? 'socrates' : u.includes('satcat') ? 'satcat' : '?')) + (refuse ? '' : ''));
        if (ct.silent) return route.abort();
        if (ct.status) return route.fulfill({ status: ct.status, headers: cors, contentType: 'text/plain', body: 'GP data has not updated since your last successful download' });
        if (mode === 'refused' && refuse && q.get('GROUP') === 'active') return route.fulfill({ status: 403, headers: cors, contentType: 'text/plain', body: 'GP data has not updated since your last successful download' });
        if (u.includes('SOCRATES')) return text(socrates);
        if (u.includes('satcat')) return setTimeout(() => json([{ OBJECT_NAME: 'TEST OBJECT', OBJECT_ID: '1999-025AAA', NORAD_CAT_ID: +q.get('CATNR'), OBJECT_TYPE: +q.get('CATNR') > 43000 ? 'PAY' : +q.get('CATNR') < 25000 ? 'R/B' : 'DEB', OPS_STATUS_CODE: '+', OWNER: 'PRC', LAUNCH_DATE: '1999-05-10', LAUNCH_SITE: 'TAISC', DECAY_DATE: '', PERIOD: 100.1, INCLINATION: 98.6, APOGEE: 880, PERIGEE: 840, RCS: 0.043 }]), 700);
        if (q.get('NAME') === 'DEB' && mode === 'nocors') return route.abort();
        const body = q.get('NAME') === 'DEB' ? debrisAll : q.get('NAME') === 'R/B' ? rocketsAll : q.get('NAME') === 'COSMOS' ? deadCosmos : q.get('NAME') === 'MOLNIYA' ? fam(12000, 'MOLNIYA 1-80', 40, 62.8, 2.0) : q.get('NAME') ? '' : groups[(q.get('GROUP') || '').toLowerCase()] || '';
        if ((q.get('FORMAT') || '').toLowerCase() !== 'csv') return text(body);
        if (mode === 'nocors') return route.abort();                    /* CelesTrak silent: the app rests it and turns to its backups */
        return text(toCsv(body));
      }
      if (h === 'gibs.earthdata.nasa.gov') return GIBS.down ? route.abort() : gibs.answer(u, GIBS, gibsLog).then(r => setTimeout(() => route.fulfill({ contentType: r.contentType, headers: cors, body: r.body }), +process.env.GIBS_WAIT || 250), () => route.abort());
      if (h === 's3-eu-west-1.amazonaws.com' && /\.mp4/.test(u)) return process.env.NOCLIP ? route.abort() : route.fulfill({ contentType: 'video/webm', headers: cors, body: fs.readFileSync(path.join(__dirname, 'clip.webm')) });
      if (h === 'wzmedia.dot.ca.gov') return process.env.HLS_OK ? route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: cors, body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:4.0,\nseg1.ts\n' }) : route.abort();
      if (h === 'caltrans-gis.dot.ca.gov') { if (mode === 'nocors') return route.abort(); const off = +q.get('resultOffset') || 0, all = Array.from({ length: 2600 }, (_, i) => ({ attributes: { locationName: 'I-' + (5 + i % 90) + ' : At Test Street ' + i + ' - Looking North (C' + String(i).padStart(3, '0') + ')', nearbyPlace: ['Los Angeles', 'Sacramento', 'San Diego', 'Oakland'][i % 4], county: 'Test', longitude: -122.4 + (i % 53) / 53 * 5.2, latitude: 32.7 + (i % 47) / 47 * 6.6, direction: 'North', inService: i % 40 ? 'True' : 'False',
          streamingVideoURL: i % 3 ? 'https://wzmedia.dot.ca.gov/D7/CCTV-' + i + '.stream/playlist.m3u8' : null, currentImageUpdateFrequency: '5', currentImageURL: 'https://cwwp2.dot.ca.gov/data/d7/cctv/image/test' + i + '/test' + i + '.jpg' } })).filter(f => !/LIKE/.test(q.get('where')) || f.attributes.streamingVideoURL);
        return json({ features: all.slice(off, off + 2000), exceededTransferLimit: off + 2000 < all.length }); }
      if (h === 'cwwp2.dot.ca.gov') return route.fulfill({ contentType: 'image/jpeg', body: cloudJpg });
      if (h === 'tie.digitraffic.fi' && /\/history/.test(u)) { const id = u.split('/stations/')[1].split('/')[0]; return json({ id, dataUpdatedTime: new Date().toISOString(), presets: [{ id: id + '01', history: Array.from({ length: 144 }, (_, i) => ({ lastModified: new Date(Date.now() - (143 - i) * 600000).toISOString(), imageUrl: 'https://weathercam.digitraffic.fi/' + id + '01.jpg?versionId=v' + i, sizeBytes: 150000 })) }] }); }
      if (h === 'sdo.gsfc.nasa.gov' || h === 'weathercam.digitraffic.fi' || h === 's3-eu-west-1.amazonaws.com' || h === 'images.data.gov.sg' || h === 'upload.wikimedia.org' || h === 'inaturalist-open-data.s3.amazonaws.com') return route.fulfill({ contentType: 'image/jpeg', body: cloudJpg });
      if (h === 'rata.digitraffic.fi') return json(trainsFi);
      if (h === 'api-v3.amtraker.com') return mode === 'nocors' ? route.abort() : json(amtrak);
      if (h === 'tie.digitraffic.fi') return json(camsFi);
      if (h === 'api.tfl.gov.uk') return json(camsLdn);
      if (h === 'api.data.gov.sg') return json(camsSg);
      if (h === 'www.submarinecablemap.com') return json(cables);
      if (h === 'query.wikidata.org') { if (mode === 'nocors') return route.abort(); const B = (id, name, lon, lat, type, country) => ({ i: { value: 'http://www.wikidata.org/entity/' + id }, iLabel: { value: name }, c: { value: 'Point(' + lon + ' ' + lat + ')' }, tLabel: { value: type }, countryLabel: { value: country } });
        return json({ results: { bindings: [B('Q1', 'Test research reactor', 11.67, 48.27, 'research reactor', 'Germany'), B('Q1', 'Test research reactor', 11.67, 48.27, 'neutron source', 'Germany'), B('Q2', 'Test waste store', -103.79, 32.37, 'radioactive waste repository', 'United States'), B('Q3', 'Test enrichment plant', 6.86, 52.23, 'uranium enrichment facility', 'Netherlands'),
          B('Q4', 'Test icebreaker', 33.07, 68.97, 'nuclear-powered icebreaker', 'Russia'), B('Q5', 'Vogtle Electric Generating Plant', -81.76, 33.14, 'nuclear power plant', 'United States'), B('Q6', 'Q6', 10, 10, 'research reactor', 'X'), B('Q7', 'Test tokamak', 5.77, 43.71, 'tokamak', 'France'),
          B('Q8', 'Test new power station', 30.1, 50.1, 'nuclear power plant', 'Ukraine'), B('Q9', 'Test site with no type', 139.7, 35.6, 'Q999', 'Japan') ] } }); }
      if (h === 'global-warming.org') return json(co2);
      if (h === 'commons.wikimedia.org') return json({ batchcomplete: true, query: { pages: Array.from({ length: 8 }, (_, i) => ({ pageid: i, ns: 6, title: 'File:Test place ' + i + (i === 5 ? '.ogg' : '.jpg'), imageinfo: [{ thumburl: 'https://upload.wikimedia.org/t' + i + '.jpg', url: 'https://upload.wikimedia.org/f' + i + '.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:T' + i, mime: i === 5 ? 'application/ogg' : 'image/jpeg', extmetadata: { Artist: { value: '<a href="x">Some Person</a>' }, LicenseShortName: { value: 'CC BY-SA 4.0' } } }] })) } });
      if (h === 'api.wheretheiss.at') return json({ line1: groups.stations.split('\n')[1], line2: groups.stations.split('\n')[2] });
      if (h === 'services.swpc.noaa.gov' && u.includes('xray-flares')) return json([{ time_tag: new Date(now - 3e5).toISOString(), satellite: 18, current_class: 'C1.4', begin_time: new Date(now - 95e6).toISOString(), max_time: new Date(now - 94e6).toISOString().slice(0, 19) + 'Z', max_class: 'M2.6', end_time: new Date(now - 93e6).toISOString() }]);
      if (h === 'services.swpc.noaa.gov' && u.includes('noaa-scales')) return json({ '-1': {}, '0': { DateStamp: '2026-11-18', TimeStamp: '03:17:00', R: { Scale: '1', Text: 'minor', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '0', Text: 'none' } }, '1': { R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '5' }, G: { Scale: '1', Text: 'minor' } } });
      if (h === 'services.swpc.noaa.gov' && u.includes('10cm-flux')) return json([{ flux: 121, time_tag: '2026-11-17T20:00:00' }]);
      if (h === 'services.swpc.noaa.gov') return u.includes('ovation') ? json(ovation) : u.includes('k-index') ? json(kp) : u.includes('solar-wind') ? json([{ proton_speed: 375, time_tag: '2026-11-18T19:40:00Z' }]) : json(alerts);
      if (h === 'll.thespacedevs.com') return json(u.includes('space_stations') ? station : u.includes('astronauts') ? people : u.includes('/previous') ? pastL : launches);
      if (h === 'api.open-meteo.com') { const la = q.get('latitude').split(','), lo = q.get('longitude').split(','); return la.length > 1 ? json(la.map((v, i) => meteoOne(+v, +lo[i]))) : setTimeout(() => json(meteoOne(+la[0], +lo[0], true)), process.env.SLOW ? 9000 : 900); }
      if (h === 'air-quality-api.open-meteo.com') return json({ current: { us_aqi: 112, pm2_5: 40 } });
      if (h === 'marine-api.open-meteo.com') return json({ current: { wave_height: 1.4, sea_surface_temperature: 27.6 } });
      if (h === 'geocoding-api.open-meteo.com') return setTimeout(() => json({ results: [{ name: 'Mumbai', latitude: 19.07, longitude: 72.88, country: 'India', admin1: 'Maharashtra', population: 12691836 }, { name: 'Mumbai Suburban', latitude: 19.1, longitude: 72.9, country: 'India', admin1: 'Maharashtra' }] }), process.env.SLOW ? 9000 : 700);
      if (h === 'nominatim.openstreetmap.org') return setTimeout(() => json({ display_name: 'x', address: { city: 'Nagpur', state: 'Maharashtra', country: 'India', country_code: 'in' } }), 800);
      if (h === 'eyes.nasa.gov') return mode === 'nocors' ? route.abort() : route.fulfill({ contentType: 'text/xml', headers: cors, body: dsnXml });
      if (h === 'api.weather.gov') return json(nws);
      if (h === 'en.wikipedia.org' && U.pathname.includes('/feed/featured/')) return json(mostread);
      if (h === 'en.wikipedia.org' && U.pathname.includes('/page/summary/')) return json({ type: 'standard', title: 'Mumbai', description: 'Capital of Maharashtra, India', extract: 'Mumbai is the capital city of the Indian state of Maharashtra. It is the financial capital and the most populous city proper of India, with an estimated population of 12.5 million. The city lies on the Konkan coast on the west coast of India and has a deep natural harbour.', thumbnail: { source: 'https://upload.wikimedia.org/m.jpg' }, content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Mumbai' } }, coordinates: { lat: 19.076, lon: 72.877 } });
      if (h === 'en.wikipedia.org') {
        if (q.get('action') === 'parse') return json({ parse: { title: q.get('page'), text: newsHtml } });
        if (q.get('list') === 'geosearch') return json({ query: { geosearch: [{ pageid: 1, title: 'Deekshabhoomi', dist: 800 }, { pageid: 2, title: 'Zero Mile Stone (Nagpur)', dist: 1200 }, { pageid: 3, title: 'Futala Lake', dist: 3000 }] } });
        return json({ query: { normalized: [], redirects: [{ from: 'Example war', to: 'Example War' }], pages: q.get('titles').split('|').map(t => coords[t] ? { title: t, coordinates: [{ lat: coords[t][0], lon: coords[t][1], primary: true }] } : { title: t }) } });
      }
      if (h === 'meri.digitraffic.fi') return u.includes('/vessels/') ? json({ mmsi: 1, name: 'MS TESTSHIP', destination: 'HELSINKI', shipType: 70, callSign: 'OJAB', draught: 60 }) : json(ships);
      if (h.endsWith('radio-browser.info')) return u.includes('/json/url/') ? json({ ok: true }) : json(radios);
      if (h === 'example.org' && U.pathname.startsWith('/stream')) return setTimeout(() => route.fulfill({ contentType: 'audio/wav', body: wav }), 1500);
      if (h === 'ssd-api.jpl.nasa.gov') return json(u.includes('fireball') ? fireballs : cad);
      if (h === 'clouds.matteason.co.uk') return route.fulfill({ contentType: 'image/jpeg', headers: cors, body: cloudJpg });
      if (!/fonts\.g/.test(h)) unknown.add(h);
      return route.abort();
    });
    if (process.env.SEEN) await page.addInitScript(() => { try { localStorage.setItem('ern:prefs', JSON.stringify({ t: Date.now(), v: { on: {}, win: 'day', tab: 'layers', seen: true, overlay: 'rain' } })); } catch (e) {} });
    if (process.env.REDUCED) await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('file://' + (process.env.PAGE || path.join(__dirname, '..', 'index.html')) + '#' + (process.env.HASH || 'test'));
    if (action === 'open') {
      await page.waitForTimeout(2500);
      if (process.env.OPEN_LOOK) await page.evaluate(v => window.__ern.look(+v[0], +v[1]), process.env.OPEN_LOOK.split(','));
      for (const t of (process.env.OPEN_AT || '0.3,0.8,1.3,1.8,2.4,3.3').split(',')) { await page.evaluate(t => window.__ern.openAt(+t), t); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/shot-${name}-open-${t}.png` }); }
      for (const t of (process.env.OPEN_EXIT || '0.12,0.4,0.9').split(',').filter(Boolean)) { await page.evaluate(t => window.__ern.openExit(+t), t); await page.waitForTimeout(1500); await page.screenshot({ path: `${OUT}/shot-${name}-open-exit-${t}.png` }); }
      console.log(name, 'open errors:', errors.length ? errors.join('\n') : 'none'); await page.close(); continue;
    }
    if (action === 'boot') { for (const ms of (process.env.BOOT_AT || '1500,3500,6500,11000,17000').split(',')) { await page.waitForTimeout(+ms - (page.__t || 0)); page.__t = +ms; await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-boot-${ms}.png` }); if (process.env.BOOT_DUMP) console.log('  @' + ms, await page.evaluate(() => 'booting=' + document.querySelector('#app').classList.contains('booting') + ' pct=' + document.querySelector('#bo-pct').textContent + ' | ' + Array.from(document.querySelectorAll('#bo-log li')).map(li => li.dataset.state + ':' + li.children[1].textContent + ':op' + getComputedStyle(li).opacity + ':h' + li.offsetHeight + ':' + getComputedStyle(li).animationName).join(' ; '))); } }
    const t0 = Date.now();
    try { await page.waitForFunction(() => document.querySelector('#boot-go').textContent === 'Start exploring', null, { timeout: 150000 }); } catch (e) { errors.push('boot did not finish'); }
    const bootMs = Date.now() - t0;
    if (action === 'bootdone' || action === 'boot') await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-bootdone.png` });
    if (action === 'boot') { await page.evaluate(() => document.querySelector('#boot-go').click()); await page.waitForTimeout(650); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-boot-exit.png` }); }
    const bootStates = await page.evaluate(() => [...document.querySelectorAll('#boot-a li, #boot-b li')].map(l => l.dataset.state[0] + ':' + l.querySelector('.s').textContent).join(' | '));
    await page.evaluate(() => document.querySelector('#boot-go').click()); await page.waitForTimeout(mode === 'nocors' ? 4200 : 3600);
    const cx = vp.width / 2, cy = name === 'phone' ? vp.height * 0.3 : vp.height / 2;
    const tab = async t => { await page.click('.tabs [data-tab="' + t + '"]'); await page.waitForTimeout(300); };
    if (action === 'quake') { await tab('latest'); await page.click('#tab-latest .row[data-sel^="quakes"] >> nth=0'); await page.waitForTimeout(2000); }
    if (action === 'place') { await page.mouse.click(cx + 150, cy + 130); await page.waitForTimeout(2500); if (await page.$('#detail [data-spot]')) { console.log('  the click met a cable:', await page.evaluate(() => document.querySelector('#detail .big').textContent)); await page.click('#detail [data-spot]'); await page.waitForTimeout(2500); }
      console.log('  place card:', await page.evaluate(() => (document.querySelector('#detail .insp-head .type') || {}).textContent + ' || ' + (document.querySelector('#detail .big') || {}).textContent + ' || ' + [...document.querySelectorAll('#detail [data-slot="pnear"] .row .s')].map(x => x.textContent).join(' / ')));
      { if (mode === 'ok') try { await page.waitForFunction(() => { const el = document.querySelector('#detail [data-slot="ppass"]'); return el && el.textContent.length > 20; }, null, { timeout: 60000 }); } catch (e) {}      /* a week of orbits is worked out in slices between frames, which are slow here */
        const pass = await page.evaluate(() => { const el = document.querySelector('#detail [data-slot="ppass"]'); return el ? el.innerText.replace(/\s*\n\s*/g, ' | ') : null; });
        console.log('  station passes:', pass ? pass.slice(0, 700) : 'none');
        if (mode === 'ok' && pass != null && !pass.includes('See a space station from here')) errors.push('place: no space station passes in the card');      /* on a phone the press lands on the sheet, not the globe, so no place opens: the cities below cover it */
        /* somewhere in the world has a pass this week: find it, read the rows, and follow one to the station */
        if (mode === 'ok' && process.env.PASS_ROWS !== '0') {
          let found = null;
          for (const pl of [[51.5, -0.13, 'London'], [40.7, -74, 'New York'], [-33.9, 151.2, 'Sydney'], [35.7, 139.7, 'Tokyo'], [55.75, 37.6, 'Moscow'], [-34.6, -58.4, 'Buenos Aires'], [19.4, -99.1, 'Mexico City'], [-26.2, 28, 'Johannesburg'], [1.35, 103.8, 'Singapore'], [47.6, -122.3, 'Seattle']]) {
            await page.evaluate(p => window.__ern.place(p[0], p[1], p[2]), pl);
            try { await page.waitForFunction(() => { const el = document.querySelector('#detail [data-slot="ppass"]'); return el && el.textContent.length > 20; }, null, { timeout: 60000 }); } catch (e) {}
            const rows = await page.evaluate(() => [...document.querySelectorAll('#detail [data-slot="ppass"] .row')].map(r => r.innerText.replace(/\s*\n\s*/g, ' | ')));
            if (rows.length) { found = pl[2]; console.log('  passes over ' + pl[2] + ':\n      ' + rows.join('\n      ')); break; }
          }
          if (!found) errors.push('place: no city of ten has a visible station pass this week'); else {
            await page.evaluate(() => document.querySelector('#detail [data-slot="ppass"]').scrollIntoView({ block: 'center' })); await page.waitForTimeout(700);
            await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-passes.png` });
            await page.evaluate(() => document.querySelector('#detail [data-slot="ppass"] .row').click()); await page.waitForTimeout(2000);
            const kind = await page.evaluate(() => (document.querySelector('#detail .insp-head .type') || {}).textContent);
            if (!/station/i.test(kind || '')) errors.push('place: a pass row did not open the station, but ' + kind); else console.log('  a pass row opens:', kind);
          }
        } }
    }
    if (action === 'placeload') { await page.mouse.click(cx + 150, cy + 130); await page.waitForTimeout(260); }
    if (action === 'search') { await page.fill('#search-input', 'Mumbai'); await page.waitForTimeout(1500); await page.keyboard.press('Enter'); await page.waitForTimeout(3200); console.log('  place: photos', await page.evaluate(() => document.querySelectorAll('#detail .photos img').length + ' | week ' + document.querySelectorAll('#detail .week > div').length + ' | about: ' + (document.querySelector('#detail [data-slot="pabout"]') || {}).textContent.slice(0, 70) + ' | around: ' + [...document.querySelectorAll('#detail [data-slot="pnear"] .row')].map(r => r.textContent.slice(0, 60)).join(' / '))); await page.evaluate(() => { const sc = document.querySelector('#detail .scroll'); sc.scrollTop = sc.scrollHeight; }); await page.waitForTimeout(500); }
    if (action === 'plane') { await page.evaluate(() => document.querySelector('#view-spin').click()); await page.mouse.move(cx, cy); const hit = await page.evaluate(() => 1); await page.waitForTimeout(200);
      for (let i = 0; i < 400; i++) { const x = cx - 150 + (i % 20) * 15, y = cy - 150 + Math.floor(i / 20) * 15; await page.mouse.move(x, y); await page.waitForTimeout(25); if (await page.evaluate(() => /TST/.test(document.querySelector('#tip').textContent) && !document.querySelector('#tip').hasAttribute('data-off'))) { await page.mouse.click(x, y); break; } }
      await page.waitForTimeout(2600); }
    if (action === 'sat') { await page.click('#view-orbits'); await page.waitForTimeout(4500); }
    if (action === 'satsearch') { await page.fill('#search-input', 'hubble'); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-satsearch-open.png` }); await page.keyboard.press('Enter'); await page.waitForTimeout(3000); }
    if (action === 'skeleton') { await page.fill('#search-input', 'Mum'); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-skeleton-search.png`, clip: { x: 480, y: 0, width: 480, height: 260 } }); await page.keyboard.press('Enter'); await page.waitForTimeout(900); }
    if (action === 'debugplace') { await page.fill('#search-input', 'Mumbai'); await page.waitForTimeout(1500); await page.keyboard.press('Enter'); await page.waitForTimeout(20000); console.log('FXHOL:', await page.evaluate(() => ['cfx', 'chol'].map(k => document.querySelector('#detail [data-slot="' + k + '"]').outerHTML).join(' || ') + ' SRC ' + [...document.querySelectorAll('#tab-sources .src')].map(e => e.querySelector('.t').textContent).filter(t => /Frank|caldays|Exchange|Nager/.test(t)).join(';'))); console.log('WX:', await page.evaluate(() => [...document.querySelectorAll('#detail [data-slot]')].map(e => e.dataset.slot + '=' + e.textContent.trim().slice(0, 60)).join(' | '))); }
    const side = name === 'phone' ? '#tab-now' : '#summary';
    if (name === 'phone' && ['orbit', 'debris', 'listen', 'sound', 'co2', 'scan'].includes(action)) await tab('now');
    if (action === 'orbit' || action === 'debris') { await page.click(side + ' [data-open="orbit"]'); await page.waitForTimeout(500); if (await page.$('#detail [data-layers-on]')) { await page.click('#detail [data-layers-on]'); await page.waitForTimeout(+process.env.ORBIT_WAIT || 9000); } else await page.waitForTimeout(1500);
      console.log('  orbit:', await page.evaluate(() => [...document.querySelectorAll('#detail .kv > div')].map(d => d.textContent).join(' | ') + ' || rows ' + document.querySelectorAll('#detail .row').length + ' || clouds ' + [...document.querySelectorAll('#detail .tbl tr')].map(r => r.textContent).join(' / ')));
      if (action === 'debris') { await page.click('#detail .row[data-sel^="debris"], #detail .row[data-sel^="rockets"]'); await page.waitForTimeout(3000); console.log('  debris:', await page.evaluate(() => document.querySelector('#detail .explain').textContent.slice(0, 120) + ' || ' + [...document.querySelectorAll('#detail .kv > div')].map(d => d.textContent).join(' | '))); } }
    if (action === 'call') { await page.click(side + ' [data-open="orbit"]'); await page.waitForTimeout(500); await page.click('#detail .row[data-sat] >> nth=0'); await page.waitForTimeout(3000); console.log('  call ->', await page.evaluate(() => document.querySelector('#detail .big').textContent + ' || ' + [...document.querySelectorAll('#detail .kv > div')].map(d => d.textContent).join(' | '))); }
    if (action === 'iss') { await page.evaluate(() => window.__ern.pick('stations', 0)); await page.waitForTimeout(2500); console.log('  docked:', await page.evaluate(() => (document.querySelector('#detail [data-slot="docked"]') || {}).textContent)); }
    if (action === 'listen' || action === 'scan' || action === 'sound') { await page.click(side + ' [data-open="listen"]'); await page.waitForTimeout(600);
      if (action === 'scan') { await page.click('#detail [data-act="scan"]'); await page.waitForTimeout(5000); console.log('  scan:', await page.evaluate(() => document.querySelector('#player').dataset.state + ' / ' + document.querySelector('#pl-state').textContent + ' / pressed ' + document.querySelector('#pl-scan').getAttribute('aria-pressed') + ' / ' + (document.querySelector('#detail [data-slot="there"]') || {}).textContent)); }
      if (action === 'sound') { await page.click('#detail .row[data-sel^="sounds"] >> nth=0'); await page.waitForTimeout(1500); await page.click('#radio-play'); await page.waitForTimeout(600); const a = await page.evaluate(() => document.querySelector('#player').dataset.state + ' / ' + document.querySelector('#radio-play').textContent); await page.waitForTimeout(3000);
        console.log('  sound:', a, '->', await page.evaluate(() => document.querySelector('#player').dataset.state + ' / ' + document.querySelector('#radio-play').textContent + ' / ' + document.querySelector('#pl-state').textContent)); } }
    if (action === 'co2') { await page.click(side + ' [data-open="co2"]'); await page.waitForTimeout(700); }
    if (action === 'toggle') {
      /* Layer switches worked with a real pointer, the way a visitor does. The earthquake row also holds a list (hour, day, week): a press on its
         switch must turn earthquakes off, not open the list, and choosing from the list must not flip the switch. */
      const state = k => page.evaluate(k => ({ checked: document.querySelector('#layer-' + k).checked, row: document.querySelector('[data-layer="' + k + '"]').classList.contains('off') ? 'off' : 'on', focus: (document.activeElement || {}).id || '', win: (document.querySelector('#quake-window') || {}).value }), k);
      const ok = (what, cond, got) => { console.log('  ' + (cond ? 'ok   ' : 'WRONG') + ' ' + what + (cond ? '' : ' -> ' + JSON.stringify(got))); if (!cond) errors.push(what); };
      if (name === 'phone') { await page.click('.tabs [data-tab="layers"], [data-tab="layers"]'); await page.waitForTimeout(600); }
      for (const k of ['quakes', 'fires', 'nuclear']) {
        const sw = page.locator('[data-layer="' + k + '"] .switch'); await sw.scrollIntoViewIfNeeded();
        const before = await state(k); await sw.click(); await page.waitForTimeout(500); const off = await state(k);
        ok(k + ': a press on the switch turns it ' + (before.checked ? 'off' : 'on'), off.checked === !before.checked && off.row === (before.checked ? 'off' : 'on') && off.focus !== 'quake-window', off);
        await page.locator('[data-layer="' + k + '"] .name').click(); await page.waitForTimeout(500); const back = await state(k);
        ok(k + ': a press on its name turns it back', back.checked === before.checked, back);
      }
      const q0 = await state('quakes');
      await page.selectOption('#quake-window', 'week'); await page.waitForTimeout(800); const q1 = await state('quakes');
      ok('choosing "week" changes the list and leaves the switch alone', q1.win === 'week' && q1.checked === q0.checked, q1);
      await page.locator('#quake-window').click(); await page.waitForTimeout(300); await page.keyboard.press('Escape'); const q2 = await state('quakes');
      ok('a press on the list itself does not flip the switch', q2.checked === q0.checked, q2);
      await page.selectOption('#quake-window', q0.win);
      ok('the NASA view row has no switch to mislabel', await page.evaluate(() => !document.querySelector('[data-layer="overlay"]').hasAttribute('for')), '');
      const loose = await page.evaluate(() => [...document.querySelectorAll('label.layer')].filter(l => l.querySelector('input[type=checkbox]') && l.htmlFor !== l.querySelector('input[type=checkbox]').id).map(l => l.dataset.layer));
      ok('every row with a switch is a label for that switch', loose.length === 0, loose);
      console.log(name, 'toggle errors:', errors.length ? errors.join('\n') : 'none'); await page.close(); continue;
    }
    if (action === 'sky') {
      /* 1. the Sun, the Moon and the brightest stars against PyEphem's answers for fixed moments (tools/make-sky-ref.py) */
      const book = JSON.parse(fs.readFileSync(path.join(__dirname, 'sky-ref.json'), 'utf8')), ref = book.moments;
      const arc = (a, b) => { const r = Math.PI / 180, h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 2 * Math.asin(Math.min(1, Math.sqrt(h))) / r; };
      let worst = { sun: 0, moon: 0, km: 0, lit: 0, star: 0, full: 0, dark: 0, drawn: 0 };
      for (const r of ref) {
        const s = await page.evaluate(ms => window.__ern.sky(ms), r.at);
        if (s.n !== 8404) errors.push('sky: ' + s.n + ' stars, expected 8404');
        worst.sun = Math.max(worst.sun, arc([s.sun.lat, s.sun.lon], r.sun)); worst.moon = Math.max(worst.moon, arc([s.moon.lat, s.moon.lon], r.moon));
        worst.km = Math.max(worst.km, Math.abs(s.moon.km - r.km)); worst.lit = Math.max(worst.lit, Math.abs(s.moon.frac - r.lit));
        worst.full = Math.max(worst.full, Math.min(...r.full.map(t => Math.abs(s.full - t))) / 60000); worst.dark = Math.max(worst.dark, Math.min(...r.new.map(t => Math.abs(s.dark - t))) / 60000);
        s.stars.forEach((st, i) => { worst.star = Math.max(worst.star, arc([st.lat, st.lon], r.stars[i])); });
        /* and what is drawn is where the numbers say: the Moon's ball, the Sun's glare */
        worst.drawn = Math.max(worst.drawn, arc([s.moonAt.lat, s.moonAt.lon], [s.moon.lat, s.moon.lon]), arc([s.sunAt.lat, s.sunAt.lon], [s.sun.lat, s.sun.lon]), Math.abs(s.moonAt.r - s.moon.km / 6378.14));
      }
      console.log('  sky against PyEphem, worst over', ref.length, 'moments: Sun', worst.sun.toFixed(3) + '°, Moon', worst.moon.toFixed(3) + '° and', Math.round(worst.km), 'km, lit', worst.lit.toFixed(4) + ', stars', worst.star.toFixed(3) + '°, next full moon', worst.full.toFixed(0), 'min, next new moon', worst.dark.toFixed(0), 'min, drawn', worst.drawn.toFixed(4));
      if (worst.sun > 0.05) errors.push('sky: the Sun is ' + worst.sun.toFixed(3) + '° out');
      if (worst.moon > 0.45 || worst.km > 1500) errors.push('sky: the Moon is ' + worst.moon.toFixed(3) + '° and ' + Math.round(worst.km) + ' km out');
      if (worst.lit > 0.01) errors.push('sky: the lit share of the Moon is ' + worst.lit.toFixed(4) + ' out');
      if (worst.star > 0.06) errors.push('sky: a star is ' + worst.star.toFixed(3) + '° out');
      if (worst.full > 90 || worst.dark > 90) errors.push('sky: next full or new moon is ' + Math.max(worst.full, worst.dark).toFixed(0) + ' minutes out');
      if (worst.drawn > 0.001) errors.push('sky: the Moon or the Sun is not drawn where the numbers say');
      /* station passes against PyEphem: a week over six cities. A pass that only just qualifies (barely high enough, or under a minute) may fall
         either side of the line in the two programs, so those need not match; every solid one must, to a few seconds and a fraction of a degree.
         Where a pass begins or ends at the edge of the Earth's shadow the two differ by up to 20 s: PyEphem counts the half-shadow as lit, the app does not. */
      {
        let n = 0, tops = 0, dt = 0, del = 0; const solid = p => p[3] >= 11.5 && p[1] - p[0] >= 60000, lines = [];
        for (const pl of book.places) {
          const got = (await page.evaluate(a => window.__ern.passes(a[0], a[1], a[2], a[3], a[4], a[5]), [book.orbit[0], book.orbit[1], pl.lat, pl.lon, book.from, book.days])).map(p => [p.t0, p.t1, p.top, p.el]);
          lines.push(pl.name + ' ' + got.length + '/' + pl.passes.length);
          const pair = (a, list) => list.find(b => Math.abs(b[2] - a[2]) < 180000);
          for (const a of pl.passes) { const b = pair(a, got); if (!b) { if (solid(a)) errors.push('sky: ' + pl.name + ': a pass PyEphem finds at ' + new Date(a[0]).toISOString() + ' is missing'); continue; }
            if (process.env.PASS_DEBUG && (Math.abs(a[0] - b[0]) > 8000 || Math.abs(a[1] - b[1]) > 8000 || Math.abs(a[3] - b[3]) > 0.3)) console.log('   ', pl.name, 'ref', new Date(a[0]).toISOString(), (a[1] - a[0]) / 1000, 's top', a[3], '@', (a[2] - a[0]) / 1000, '| app start', (b[0] - a[0]) / 1000, 'end', (b[1] - a[1]) / 1000, 'top', b[3].toFixed(2), '@', (b[2] - a[0]) / 1000);
            const inside = p => p[2] - p[0] > 8000 && p[1] - p[2] > 8000;      /* the highest point is a true summit, not the moment it came out of, or went into, the Earth's shadow */
            n++; dt = Math.max(dt, Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); if (inside(a) && inside(b)) { tops++; del = Math.max(del, Math.abs(a[3] - b[3])); } }
          for (const b of got) if (solid(b) && !pair(b, pl.passes)) errors.push('sky: ' + pl.name + ': a pass at ' + new Date(b[0]).toISOString() + ' that PyEphem does not find');
        }
        console.log('  station passes against PyEphem (found/expected): ' + lines.join(', ') + ' | ' + n + ' matched, worst ' + (dt / 1000).toFixed(0) + ' s; ' + tops + ' summits, worst ' + del.toFixed(2) + '°');
        if (n < 20) errors.push('sky: only ' + n + ' station passes matched'); if (dt > 25000) errors.push('sky: a station pass is ' + (dt / 1000).toFixed(0) + ' s out'); if (tops < 8) errors.push('sky: only ' + tops + ' summits compared'); if (del > 0.6) errors.push('sky: a station pass is ' + del.toFixed(2) + '° out');
      }
      /* the Earth hides whatever is behind it: with the Sun, then the brightest star, dead behind the globe, the middle of the picture stays dark */
      const through = await page.evaluate(() => [window.__ern.behind('sun'), window.__ern.behind('star')]);
      console.log('  brightness at the middle of the globe with the Sun behind it:', through[0], '| with Sirius behind it:', through[1]);
      if (through[0] > 90 || through[1] > 90) errors.push('sky: the ' + (through[0] > 90 ? 'Sun' : 'brightest star') + ' shines through the Earth');
      await page.waitForTimeout(2500);                                           /* the clock puts the sky back to now */
      /* 2. the Moon from the Now tab: its card opens and the camera turns until the Moon stands clear of the Earth, in the open */
      const nowTab = name === 'phone' ? '#tab-now' : '#summary';
      if (name === 'phone') await tab('now');
      await page.click(nowTab + ' [data-act="moon"]'); await page.waitForTimeout(+(process.env.SKY_WAIT || 6000));
      const seen = async label => {
        const s = await page.evaluate(() => { const s = window.__ern.sky(); const m = s.screen.moon; s.under = m ? (document.elementFromPoint(m.x, m.y) || {}).id || (document.elementFromPoint(m.x, m.y) || {}).tagName : null; return s; });
        const m = s.screen.moon, e = s.screen.earth, gap = m && e ? Math.hypot(m.x - e.x, m.y - e.y) - s.screen.earthPx - s.screen.moonPx : null;
        console.log('  ' + label + ': Moon at', m ? Math.round(m.x) + ',' + Math.round(m.y) : 'off screen', 'of', s.screen.w + 'x' + s.screen.h, '| radius', s.screen.moonPx.toFixed(1), 'px | clear of the Earth by', gap == null ? '-' : Math.round(gap), 'px | hidden:', s.screen.hidden, '| under the pointer:', s.under);
        return { s, m, gap };
      };
      let v = await seen('brought into view');
      if (!v.m || v.s.screen.hidden) errors.push('sky: the Moon is not in view after "' + 'Bring the Moon into view' + '"');
      else {
        if (v.gap < 6) errors.push('sky: the Moon is not clear of the Earth (' + Math.round(v.gap) + ' px)');
        if (v.m.x < v.s.screen.moonPx + 8 || v.m.x > v.s.screen.w - v.s.screen.moonPx - 8 || v.m.y < v.s.screen.moonPx + 8 || v.m.y > v.s.screen.h - v.s.screen.moonPx - 8) errors.push('sky: the Moon is cut off by the edge of the screen');
        if (v.s.under !== 'gl') errors.push('sky: the Moon is behind ' + v.s.under);
      }
      const card = v.s.card || '';
      console.log('  card:', card.replace(/\s*\n\s*/g, ' | ').slice(0, 520));
      for (const want of ['The Moon', v.s.moon.name, 'Distance', 'Next full moon', 'Next new moon', 'Overhead at', 'Bring the Moon into view', 'Stand under it']) if (!card.includes(want)) errors.push('sky: the Moon card lacks "' + want + '"');
      await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-sky-moon.png` });
      /* 3. close the card, then click the Moon itself: the card comes back and the camera stays put */
      await page.click('#insp-close'); await page.waitForTimeout(600);
      if (await page.evaluate(() => !!window.__ern.sky().card)) errors.push('sky: the Moon card did not close');
      if (v.m && !v.s.screen.hidden) {
        const before = await page.evaluate(() => window.__ern.cam());
        await page.mouse.click(v.m.x, v.m.y); await page.waitForTimeout(1500);
        const after = await page.evaluate(() => ({ card: window.__ern.sky().card, cam: window.__ern.cam() }));
        if (!after.card) errors.push('sky: clicking the Moon did not open its card, but: ' + await page.evaluate(() => (document.querySelector('#detail .type') || {}).textContent || 'nothing')); else console.log('  clicking the Moon opens its card: yes');
        if (Math.abs(after.cam.dist - before.dist) > 0.05) errors.push('sky: clicking the Moon moved the camera');
      }
      /* 4. "Stand under it" turns the globe to the place the Moon is overhead */
      if (name === 'phone') await page.evaluate(() => { const b = document.querySelector('#detail [data-go="moon"]'); if (b) b.click(); }); else await page.click('#detail [data-go="moon"]');
      await page.waitForTimeout(+(process.env.SKY_WAIT || 6000));
      const under = await page.evaluate(() => ({ cam: window.__ern.camAt(), moon: window.__ern.sky().moon, card: !!window.__ern.sky().card }));
      console.log('  stand under it: camera over', JSON.stringify(under.cam), 'Moon over', under.moon.lat.toFixed(1) + ',' + under.moon.lon.toFixed(1), '| card still open:', under.card);
      if (arc([under.cam.lat, under.cam.lon], [under.moon.lat, under.moon.lon]) > 3) errors.push('sky: "Stand under it" did not go to where the Moon is overhead');
      if (!under.card) errors.push('sky: "Stand under it" closed the Moon card');
      /* 5. the Moon can be found by name */
      await page.click('#insp-close').catch(() => {}); await page.fill('#search-input', 'moon'); await page.waitForTimeout(1500); await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
      if (!(await page.evaluate(() => !!window.__ern.sky().card))) errors.push('sky: searching for "moon" did not open the Moon'); else console.log('  searching for "moon" opens its card: yes');
      /* 6. the Sun's glare: look from the night side, a little off the line, so it shows past the edge of the Earth */
      if (process.env.SKY_SUN !== '0') {
        const sn = v.s.sun, fit = (await page.evaluate(() => window.__ern.cam())).fit;
        await page.evaluate(p => { window.__ern.look(p[0], p[1]); window.__ern.zoomTo(p[2]); }, [-sn.lat, ((sn.lon + 180 + (name === 'phone' ? 7 : 11) + 540) % 360) - 180, fit * 2.2]); await page.waitForTimeout(3000);
        await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-sky-sun.png` });
      }
    }
    if (action === 'limits') {
      /* CelesTrak must never be pestered: each list once, nothing again while a copy is fresh, and after a refusal or silence nothing at all
         until the rest is over, however often the page is reloaded. Whatever was saved keeps the satellites on the globe meanwhile. */
      const lists = () => ctLog.filter(x => x !== 'satcat');
      const again = async (label, want) => {
        const from = ctLog.length;
        await page.reload();
        try { await page.waitForFunction(() => document.querySelector('#boot-go').textContent === 'Start exploring', null, { timeout: 150000 }); } catch (e) { errors.push('limits: boot did not finish (' + label + ')'); }
        await page.evaluate(() => document.querySelector('#boot-go').click()); await page.waitForTimeout(+(process.env.LIMITS_WAIT || 9000));
        const asked = ctLog.slice(from), st = await page.evaluate(() => ({
          counts: [...document.querySelectorAll('.layer')].filter(e => /Starlink|Space debris|Spent rocket|Space stations/.test(e.querySelector('.name').textContent)).map(e => e.querySelector('.name').textContent + '=' + e.querySelector('.count').textContent).join(', '),
          hold: JSON.parse(localStorage.getItem('ern:ct-hold') || 'null'), src: window.__ern.src(['sats', 'junk', 'socrates']) }));
        const rest = st.hold && st.hold.v.until > Date.now() ? Math.round((st.hold.v.until - Date.now()) / 60000) + ' min (' + st.hold.v.why + ')' : 'none';
        console.log('  ' + label + ': asked CelesTrak ' + asked.length + ' time' + (asked.length === 1 ? '' : 's') + (asked.length ? ' [' + asked.join(', ') + ']' : '') + ' | resting: ' + rest + '\n      ' + st.counts + '\n      ' + st.src.join(' | '));
        if (want.asked != null && asked.length !== want.asked) errors.push('limits: ' + label + ': CelesTrak was asked ' + asked.length + ' times, expected ' + want.asked);
        if (want.max != null && asked.length > want.max) errors.push('limits: ' + label + ': CelesTrak was asked ' + asked.length + ' times, more than ' + want.max);
        if (new Set(asked).size !== asked.length) errors.push('limits: ' + label + ': a list was asked for twice');
        if (want.rest != null && (rest !== 'none') !== want.rest) errors.push('limits: ' + label + ': resting is ' + rest);
        if (want.drawn) for (const k of want.drawn) if (!new RegExp(k + '=[\\d,]*\\d|' + k + '=Live').test(st.counts)) errors.push('limits: ' + label + ': ' + k + ' is not on the globe');
        if (want.note && !st.src.join(' | ').includes(want.note)) errors.push('limits: ' + label + ': no note saying "' + want.note + '"');
        return st;
      };
      const age = hours => page.evaluate(h => new Promise(done => {
        localStorage.removeItem('ern:ct-asked'); try { const c = JSON.parse(localStorage.getItem('ern:calls')); if (c) { c.t -= h * 3600000; localStorage.setItem('ern:calls', JSON.stringify(c)); } } catch (e) {}
        const rq = indexedDB.open('earth-right-now', 1);
        rq.onsuccess = () => { const st = rq.result.transaction('kv', 'readwrite').objectStore('kv'), cur = st.openCursor(); let n = 0;
          cur.onsuccess = () => { const c = cur.result; if (!c) return done(n); if (String(c.key).startsWith('gp:')) { const v = c.value; v.t -= h * 3600000; c.update(v); n++; } c.continue(); }; };
      }), hours);
      const wipe = () => page.evaluate(() => new Promise(done => { const rq = indexedDB.open('earth-right-now', 1); rq.onsuccess = () => { const tx = rq.result.transaction('kv', 'readwrite'); tx.objectStore('kv').clear(); tx.oncomplete = () => done(); }; }));
      const all = ['Starlink', 'Space debris', 'Spent rocket stages', 'Space stations'];
      const first = lists();
      console.log('  first visit: asked CelesTrak ' + first.length + ' times [' + first.join(', ') + ']');
      if (new Set(first).size !== first.length) errors.push('limits: first visit: a list was asked for twice');
      await page.waitForTimeout(1500);
      await again('reload straight away', { asked: 0, rest: false, drawn: all });
      console.log('  saved lists made 30 hours old:', await age(30)); ct.status = 403;
      await again('reload, lists stale, CelesTrak refusing (403)', { asked: 1, rest: true, drawn: all, note: 'saved' });
      await again('reload again while it rests', { asked: 0, rest: true, drawn: all });
      await again('and again', { asked: 0, rest: true, drawn: all });
      await wipe();
      await again('resting with nothing saved at all', { asked: 0, rest: true, drawn: ['Starlink', 'Space stations'], note: 'backup' });
      await page.evaluate(() => localStorage.removeItem('ern:ct-hold')); ct.status = 0;
      await again('rest over, CelesTrak answering', { max: first.length, rest: false, drawn: all });
      await age(30); ct.silent = true;
      await again('lists stale, CelesTrak silent (shut out)', { asked: 1, rest: true, drawn: all, note: 'saved' });
      await again('reload again while it rests', { asked: 0, rest: true, drawn: all });
      ct.silent = false;
    }
    if (action === 'cinema') {
      /* keys, cinema mode, a saved picture and a copied link */
      const st = () => page.evaluate(() => { const vis = s => { const e = document.querySelector(s), c = e && getComputedStyle(e); return !!e && c.visibility !== 'hidden' && +c.opacity > 0.5 && c.display !== 'none'; };
        return { cinema: document.querySelector('#app').classList.contains('cinema'), dock: vis('#dock'), insp: vis('#inspector'), bar: vis('.viewctl'), cap: vis('#cine'), cam: window.__ern.cam(), at: window.__ern.camAt(), spin: window.__ern.spinning(), toast: document.querySelector('#toast').hasAttribute('data-off') ? '' : document.querySelector('#toast').textContent,
          time: document.querySelector('#cine-time').textContent, what: document.querySelector('#cine-what').textContent, kind: (document.querySelector('#detail .type') || {}).textContent || '' }; });
      const key = async (k, ms) => { await page.keyboard.press(k); await page.waitForTimeout(ms || 1200); return st(); };
      if (name !== 'phone') { await tab('guide'); await page.evaluate(() => { const p = document.querySelector('#tab-guide'); p.scrollTop = p.scrollHeight; }); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-guide-keys.png` });
        if ((await page.evaluate(() => document.querySelectorAll('#tab-guide .keys > div').length)) < 10) errors.push('guide: the list of keys is missing'); await tab('layers'); }
      /* a short drag on the globe: the keyboard must come away from the tab that was just pressed */
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 12, cy, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(600);
      { const had = await page.evaluate(() => { const e = document.activeElement; return e.tagName + (e.id ? '#' + e.id : '') + (e.closest('.dock, .inspector') ? ' in a panel' : '') + (e.className ? ' .' + String(e.className).split(' ')[0] : ''); }); if (name !== 'phone' && / in a panel/.test(had)) errors.push('keys: pressing the globe did not take the keyboard from the panels (' + had + ')'); else console.log('  after a press on the globe the keyboard is with:', had); }
      const a0 = await st();
      if (name === 'phone') {
        const a = await key('c'); if (a.cinema) errors.push('cinema: a phone should not go into cinema mode');
        if (!(await page.$('#tab-now [data-do="link"]'))) errors.push('cinema: the phone has no share button'); else console.log('  phone: share and picture buttons are in the Now list; cinema mode is not offered');
      } else {
        let a = await key('s'); if (a.spin === a0.spin) errors.push('keys: S did not toggle the spin'); a = await key('s');
        a = await key('ArrowRight', 2500); const moved = ((a.at.lon - a0.at.lon + 540) % 360) - 180; if (!(moved > 5)) errors.push('keys: the right arrow did not turn the globe (' + moved.toFixed(1) + '°)');
        a = await key('ArrowUp', 2500); if (!(a.at.lat > a0.at.lat + 3)) errors.push('keys: the up arrow did not tilt the globe');
        const z0 = a.cam.target; a = await key('+', 1500); if (!(a.cam.target < z0)) errors.push('keys: + did not zoom in'); a = await key('-', 1500); a = await key('o', 2500); if (!(a.cam.target > z0 * 1.5)) errors.push('keys: O did not pull back'); a = await key('r', 2500);
        if (Math.abs(a.cam.target - a.cam.fit) > 0.05) errors.push('keys: R did not reset the view');
        a = await key('m', 5000); if (!/Moon/.test(a.kind)) errors.push('keys: M did not open the Moon, but ' + a.kind); await key('Escape', 800); await key('r', 2500);
        console.log('  keys: S, arrows, +, -, O, R, M all answer');
        const fit0 = a.cam.fit;
        a = await key('c', 3500);
        console.log('  cinema on:', JSON.stringify({ cinema: a.cinema, dock: a.dock, inspector: a.insp, toolbar: a.bar, caption: a.cap, time: a.time, what: a.what, fit: [fit0, a.cam.fit], target: a.cam.target }));
        if (!a.cinema || a.dock || a.insp || a.bar || !a.cap) errors.push('cinema: the panels did not step aside');
        if (!/UTC$/.test(a.time)) errors.push('cinema: the caption has no clock');
        if (!(a.cam.fit < fit0) || Math.abs(a.cam.target - a.cam.fit) > 0.05) errors.push('cinema: the globe did not grow to fill the window');
        await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-cine-on.png` });
        await page.waitForTimeout(3200);
        if (!(await page.evaluate(() => document.querySelector('#app').classList.contains('cine-idle')))) errors.push('cinema: the buttons did not fade after the pointer went still');
        await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-cine-idle.png` });
        await page.mouse.move(cx + 40, cy + 40); await page.waitForTimeout(300);
        if (await page.evaluate(() => document.querySelector('#app').classList.contains('cine-idle'))) errors.push('cinema: moving the pointer did not bring the buttons back');
        await page.mouse.move(cx + 60, cy + 50); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-cine-ctl.png` });
        /* a picture: the download arrives, is the size of the drawing, and is not blank */
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), page.keyboard.press('p')]);
        if (!dl) errors.push('picture: nothing was saved'); else {
          const saved = { path: `${OUT}/shot-${name}-${mode}-picture.png` }; await dl.saveAs(saved.path);
          const buf = fs.readFileSync(saved.path), w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
          console.log('  picture:', dl.suggestedFilename(), w + 'x' + h, buf.length, 'bytes');
          if (!/^karman-\d{8}-\d{4}utc\.png$/.test(dl.suggestedFilename())) errors.push('picture: odd file name ' + dl.suggestedFilename());
          if (w !== vp.width * (+process.env.DPR || 1) || h !== vp.height * (+process.env.DPR || 1) || buf.length < 60000) errors.push('picture: wrong size or blank');
        }
        await page.waitForTimeout(600);
        a = await key('l', 900); console.log('  link:', await page.evaluate(() => window.__ern.link()), '| notice:', a.toast);
        if (!/copied|address bar/.test(a.toast)) errors.push('link: no notice after copying');
        if (!/#@-?\d+\.\d\d,-?\d+\.\d\d,\d+\.\d\d$/.test(await page.evaluate(() => window.__ern.link()))) errors.push('link: odd link');
        a = await key('Escape', 2500);
        console.log('  cinema off:', JSON.stringify({ cinema: a.cinema, dock: a.dock, inspector: a.insp, toolbar: a.bar, caption: a.cap, fit: a.cam.fit }));
        if (a.cinema || !a.dock || !a.insp || !a.bar || a.cap) errors.push('cinema: the panels did not come back');
        if (Math.abs(a.cam.fit - fit0) > 0.01) errors.push('cinema: the globe did not go back to its size');
        await page.click('#view-cinema'); await page.waitForTimeout(1500); if (!(await st()).cinema) errors.push('cinema: the toolbar button did not work');
        /* rest the pointer on the buttons: they must not fade from under it, however long it stays */
        const box = await page.evaluate(() => { const r = document.querySelector('.cine-ctl [data-do="cinema"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
        await page.mouse.move(box.x - 40, box.y - 40); await page.mouse.move(box.x, box.y); await page.waitForTimeout(4200);
        if (await page.evaluate(() => document.querySelector('#app').classList.contains('cine-idle'))) errors.push('cinema: the buttons faded from under the pointer');
        await page.mouse.click(box.x, box.y); await page.waitForTimeout(1500); if ((await st()).cinema) errors.push('cinema: its own button did not leave it');
      }
    }
    if (action === 'linked') {
      /* arriving by a link (HASH=@lat,lon,dist,view): after the opening the globe turns to that view; read off the status bar what is under the middle of the screen */
      const want = (process.env.HASH || '').replace(/^@/, '').split(',');
      await page.waitForTimeout(+(process.env.LINK_WAIT || 9000));
      await page.mouse.move(cx + 1, cy + 1); await page.waitForTimeout(700); await page.mouse.move(cx, cy); await page.waitForTimeout(1200);
      const got = await page.evaluate(() => ({ cursor: document.querySelector('#cursor').textContent, view: (document.querySelector('#overlay-pick') || {}).value, legend: (document.querySelector('#legend') || {}).hidden === false }));
      console.log('  arrived by link ' + want.join(',') + ': middle of the screen is over', got.cursor, '| NASA view:', got.view || 'none');
      const m = /([\d.]+)° ([NS]), ([\d.]+)° ([EW])/.exec(got.cursor || '');
      if (!m) errors.push('linked: could not read where the globe is looking'); else {
        const lat = +m[1] * (m[2] === 'S' ? -1 : 1), lon = +m[3] * (m[4] === 'W' ? -1 : 1);
        if (Math.abs(lat - +want[0]) > 1.5 || Math.abs(((lon - +want[1] + 540) % 360) - 180) > 1.5) errors.push('linked: looking at ' + lat + ',' + lon + ' instead of ' + want[0] + ',' + want[1]);
      }
      if ((want[3] || '') !== (got.view || '')) errors.push('linked: NASA view is ' + got.view + ', expected ' + want[3]);
      await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-linked.png` });
    }
    if (action === 'energy') {
      /* power stations, LNG terminals and gas pipelines: off to begin with, unpacked when switched on, findable, clickable, and gone again when switched off */
      const info = () => page.evaluate(() => window.__ern.energy()), card = () => page.evaluate(() => { const d = document.querySelector('#detail'); return (d.querySelector('.big') || {}).textContent + ' || ' + (d.querySelector('.big + p') || {}).textContent + ' || ' + [...d.querySelectorAll('.kv > div')].map(x => x.textContent).join(' | ') + ' || ' + [...d.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(h => /gem\.wiki/.test(h)).join(' '); });
      console.log('  at first:', JSON.stringify(await info()));
      await page.evaluate(() => window.__ern.spin(false));
      if (name === 'phone') await page.click('[data-tab="layers"]').catch(() => {});
      for (const k of ['coal', 'gas', 'hydro', 'solar', 'wind', 'lng', 'pipes']) await page.evaluate(k => document.querySelector('#layer-' + k).click(), k);
      await page.waitForTimeout(4000);
      console.log('  all on:  ', JSON.stringify(await info()), '| counts shown:', await page.evaluate(() => ['coal', 'gas', 'hydro', 'solar', 'wind', 'lng', 'pipes'].map(k => (document.querySelector('#count-' + k) || {}).textContent).join(' ')));
      await page.evaluate(() => window.__ern.look(30, 105)); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/shot-${name}-energy-asia.png` });
      for (const [layer, title] of [['hydro', 'Three Gorges Dam hydroelectric plant'], ['coal', 'Taichung power station'], ['wind', 'Hornsea wind farm'], ['solar', 'Bhadla III Solar Park'], ['gas', 'Surgut GRES-2 power station'], ['lng', 'Sabine Pass LNG Terminal'], ['pipe', 'Nord Stream Gas Pipeline']]) {
        const ok = await page.evaluate(v => window.__ern.find(v[0], v[1]), [layer, title]); await page.waitForTimeout(1200);
        console.log('  ' + layer.padEnd(5), ok ? await card() : 'NOT FOUND: ' + title);
        if (!ok) errors.push('not found: ' + title);
        if (layer === 'hydro' || layer === 'pipe') await page.screenshot({ path: `${OUT}/shot-${name}-energy-${layer}.png` });
      }
      /* a pipeline is found under the pointer along its drawn route, and not far from it */
      const mid = await page.evaluate(() => { const it = window.__ern.pipeMid('Yamal-Europe Gas Pipeline'); return it; });
      if (mid) console.log('  under the pointer on the Yamal-Europe route:', await page.evaluate(m => window.__ern.lineAt(m[0], m[1], 6), mid), '| 3 degrees north of it:', await page.evaluate(m => window.__ern.lineAt(m[0] + 3, m[1], 6), mid));
      else errors.push('no Yamal-Europe pipeline');
      const box = await page.$('#search-input, #search input, input[type="search"]');
      if (box) { await box.click(); await box.type('nord stream', { delay: 30 }); await page.waitForTimeout(1800); console.log('  search "nord stream":', await page.evaluate(() => [...document.querySelectorAll('#search-results .row, .results .row, [role="option"]')].slice(0, 6).map(r => r.textContent.trim().replace(/\s+/g, ' ').slice(0, 60)).join(' ; '))); await page.screenshot({ path: `${OUT}/shot-${name}-energy-search.png` }); await page.keyboard.press('Escape'); }
      for (const k of ['coal', 'gas', 'hydro', 'solar', 'wind', 'lng', 'pipes']) await page.evaluate(k => document.querySelector('#layer-' + k).click(), k);
      await page.waitForTimeout(1500);
      console.log('  all off: ', JSON.stringify(await info()), '| selected card still open:', await page.evaluate(() => !!document.querySelector('#detail .big')));
      console.log(name, 'energy errors:', errors.length ? errors.join('\n') : 'none'); await page.close(); continue;
    }
    if (action === 'views') {
      /* every NASA view in turn: does it load, from which layers and days, with how many requests, and what does the legend say */
      const settled = () => page.waitForFunction(() => { const o = window.__ern.over(); return o.want && (o.id === o.want || o.failed); }, null, { timeout: 120000 }).catch(() => errors.push('a view never settled'));
      const ids = (process.env.VIEW ? process.env.VIEW.split(',') : await page.evaluate(() => window.__ern.views()));
      await page.evaluate(() => window.__ern.spin(false));
      if (process.env.LOOK) await page.evaluate(v => window.__ern.look(+v[0], +v[1]), process.env.LOOK.split(','));
      for (const id of ids) {
        gibsLog.length = 0; const t0 = Date.now();
        await pickView(page, id); await settled(); await page.waitForTimeout(1800);
        const o = await page.evaluate(() => window.__ern.over()), full = gibsLog.filter(r => r.w > 64), thumbs = gibsLog.length - full.length;
        console.log('  ' + id.padEnd(6), o.failed ? 'FAILED (' + o.failed + ')' : 'on', '| ' + ((Date.now() - t0 - 1800) / 1000).toFixed(1) + ' s | pictures ' + full.length + (thumbs ? ' + ' + thumbs + ' thumbnails' : '') + ' | ' + (o.canvas ? 'combined' : 'as sent') +
          ' | days ' + (o.days.join(' ') || '(newest)') + '\n         from ' + o.drawn.map(d => d.layers + (d.days.filter(Boolean).length ? ' x' + d.days.length : '')).join(' + ') + '\n         legend: ' + (await page.evaluate(() => { const l = document.querySelector('#legend'); return l.querySelector('b').textContent.trim() + ' / ' + l.querySelector('small').textContent + ' / scale ' + (l.querySelector('.lg-bar') ? 'bar ' + [...l.querySelectorAll('.lg-bar em')].map(e => e.textContent).join('..') : l.querySelector('.lg-keys') ? 'keys ' + l.querySelectorAll('.lg-keys em').length : 'none'); })));
        await page.screenshot({ path: `${OUT}/shot-${name}-view-${id}.png` });
        /* End to end: at a few places, is the colour on the globe the colour NASA sent, after the page's recolouring, mixed in the way the shader
           says it mixes (seven-eighths of the picture, dimmed on the night side)? The stand-in knows what it sent, so the answer can be worked out. */
        if (!o.failed && !GIBS.grid && SPOTS[id]) {
          const bad = [];
          for (const [what, lat, lon] of SPOTS[id]) {
            const raw = gibs.shown(o.drawn, lon, lat, GIBS), on = (await page.evaluate(v => window.__ern.probe([v], false), [lat, lon]))[0], off = (await page.evaluate(v => window.__ern.probe([v], true), [lat, lon]))[0];
            if (!on || !off) { bad.push(what + ': not in view'); continue; }
            const t = raw ? await page.evaluate(v => window.__ern.tone(v[0], v[1]), [id, raw]) : [0, 0, 0, 0], a = t[3] / 255 * 0.88, c = t.indexOf(Math.max(t[0], t[1], t[2]));
            if (a < 0.02) { if (Math.max(...on.map((v, i) => Math.abs(v - off[i]))) > 3) bad.push(what + ': should be clear, drawn ' + on + ' over ' + off); continue; }
            const K = (on[c] - off[c] * (1 - a)) / (a * t[c]), want = [0, 1, 2].map(i => off[i] * (1 - a) + a * K * t[i]), miss = Math.max(...want.map((v, i) => Math.abs(v - on[i])));
            if (!(K > 0.56 && K < 0.99) || miss > 7) bad.push(what + ': sent ' + raw.slice(0, 3).map(Math.round) + ', recoloured ' + t.map(Math.round) + ', drawn ' + on + ' over ' + off + ', light ' + K.toFixed(2) + ', off by ' + miss.toFixed(0));
          }
          console.log('         colour check at ' + SPOTS[id].length + ' places: ' + (bad.length ? 'WRONG\n           ' + bad.join('\n           ') : 'right'));
          if (bad.length) errors.push('colours wrong in ' + id);
        }
      }
      console.log(name, 'views errors:', errors.length ? errors.join('\n') : 'none'); await page.close(); continue;
    }
    if (action === 'fine') {
      /* the sharper window: zoom in on a place in steps and watch a window of the right size arrive, line up and fade in */
      const id = process.env.VIEW || 'chl', at = (process.env.LOOK || '12,-28').split(',').map(Number);
      await page.evaluate(() => window.__ern.spin(false));
      await pickView(page, id);
      await page.waitForFunction(() => { const o = window.__ern.over(); return o.id === o.want || o.failed; }, null, { timeout: 120000 }).catch(() => errors.push('the view never settled'));
      await page.evaluate(v => window.__ern.look(v[0], v[1]), at);
      for (const d of (process.env.DIST || '2.6,1.9,1.5,1.3,1.18,1.13,2.2,5').split(',').map(Number)) {
        gibsLog.length = 0;
        await page.evaluate(d => window.__ern.zoomTo(d), d);
        await page.waitForTimeout(+process.env.FINE_WAIT || 9000);
        const o = await page.evaluate(() => window.__ern.over());
        console.log('  dist ' + String(d).padEnd(5), '| window', o.box ? o.box.join(',') + ' (' + (o.box[2] - o.box[0]) + '° wide)' : 'none', '| shown', o.fineOn, '| asked', gibsLog.length ? gibsLog.map(r => r.box + (r.time ? ' ' + r.time.slice(5) : '')).join(' ; ') : 'nothing', '| legend:', await page.evaluate(() => document.querySelector('#legend small').textContent));
        await page.screenshot({ path: `${OUT}/shot-${name}-fine-${id}-${d}.png` });
        /* With GIBS_GRID=1 the stand-in rules a line along every 15th meridian and parallel. Where on the globe does the page draw them?
           Each is searched for across two degrees; the answer should be the line's own longitude or latitude to within one dot of the picture. */
        if (GIBS.grid) {
          const box = o.box || [-180, -90, 180, 90], dot = (box[2] - box[0]) / 2048, mid = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], out = [];
          const lon15 = Math.round(at[1] / 15) * 15, lat15 = Math.round(at[0] / 15) * 15, offLine = v => v + (Math.abs(v - Math.round(v / 15) * 15) < 1.5 ? 2.5 : 0);
          for (const [axis, line, other, lo, hi] of [['meridian', lon15, offLine(at[0]), box[0], box[2]], ['parallel', lat15, offLine(at[1]), box[1], box[3]]]) {
            if (line - 1 < lo || line + 1 > hi) continue;
            let best = -1e9, where = null, seen = 0; const all = [];
            const vs = Array.from({ length: 201 }, (_, k) => line + (k - 100) * 0.01), cs = await page.evaluate(q => window.__ern.probe(q, false), vs.map(v => (axis === 'meridian' ? [other, v] : [v, other])));
            for (let k = 0; k < vs.length; k++) {
              const v = vs[k], c = cs[k];
              if (!c) continue; seen++;
              const score = c[0] + c[2] - 2 * c[1]; all.push(score); if (score > best + 0.5) { best = score; where = [v, v]; } else if (Math.abs(score - best) <= 0.5 && where) where[1] = v;
            }
            if (seen < 150) { out.push(axis + ' ' + line + '° is off the screen here'); continue; }
            const usual = all.slice().sort((p, q) => p - q)[all.length >> 1];          /* a thin line is half blended into the ground beside it, so it is judged against that ground */
            if (best - usual < 80) { out.push(axis + ' ' + line + '° NOT DRAWN (stands out by ' + (best - usual) + ' over ' + seen + ' samples)'); errors.push('no ' + axis + ' at ' + line + '° at distance ' + d); continue; }
            const found = (where[0] + where[1]) / 2, err = Math.abs(found - line);
            out.push(axis + ' ' + line + '° drawn at ' + found.toFixed(3) + '° (off by ' + (err / dot).toFixed(2) + ' dots of ' + (dot * 111).toFixed(1) + ' km)');
            if (!(err <= dot * 1.01)) errors.push('the ' + axis + ' at ' + line + '° is drawn ' + (err / dot).toFixed(2) + ' dots away at distance ' + d);
          }
          console.log('         lines: ' + (out.join(' | ') || 'none inside this window'));
        }
      }
      console.log(name, 'fine errors:', errors.length ? errors.join('\n') : 'none'); await page.close(); continue;
    }
    if (action === 'overlay') { await page.selectOption('#overlay-pick', 'sst'); await page.waitForTimeout(400); await page.screenshot({ path: `${OUT}/shot-${name}-${mode}-overlay-loading.png` }); await page.waitForTimeout(4000); console.log('  legend:', await page.evaluate(() => document.querySelector('#legend').textContent.slice(0, 90))); }
    if (action === 'cam' || action === 'train' || action === 'cables') { const k = action === 'cam' ? 'cams' : action === 'train' ? 'trains' : 'cables'; await page.evaluate(k => document.querySelector('#layer-' + k).click(), k); await page.waitForTimeout(5000);
      if (action !== 'cables') { await page.evaluate(k => window.__ern.pick(k, k === 'cams' ? 400 : 90), k); await page.waitForTimeout(3000); console.log('  ' + action + ':', await page.evaluate(() => document.querySelector('#detail .big').textContent + ' || ' + [...document.querySelectorAll('#detail .kv > div')].map(d => d.textContent).join(' | '))); } }
    if (action === 'tourprof') {
      /* the start of a tour on a pretend 60 Hz clock (how the ground moves across the screen, frame by frame), and how long the start itself takes */
      const gl = async tag => console.log('  gl', tag, JSON.stringify(await page.evaluate(() => window.__tour.gl())));
      await gl('before any tour');
      for (const stall of [0, 100]) {
        console.log('  entry sim, one frame ' + stall + ' ms late', JSON.stringify(await page.evaluate(st => window.__tour.entry(60, st, 3), stall), null, 1).replace(/\n\s*/g, ' '));
        await page.evaluate(() => window.__tour.stop()); await page.waitForFunction(() => !window.__tour.state().on, null, { timeout: 30000 }); await page.waitForTimeout(2500);
      }
      for (let run = 0; run < 3; run++) {
        const ms = await page.evaluate(() => { const t0 = performance.now(); window.__tour.start(); return +(performance.now() - t0).toFixed(1); });
        await page.waitForTimeout(2500); await gl('run ' + run + ' after start');
        console.log('  tour start', run, 'took', ms, 'ms | music', await page.evaluate(() => window.__tour.musicOn()));
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__tour.state().on, null, { timeout: 30000 }); await page.waitForTimeout(2500);
      }
    }
    if (action === 'tourwarm') {
      /* is the sound engine made ready ahead of the press, and how long do the press and the click each hold the page up? */
      const warm = async tag => console.log('  ' + tag + ':', JSON.stringify(await page.evaluate(() => window.__tour.warm())));
      const watch = () => page.evaluate(() => { window.__ev = []; if (!window.__evo) { window.__evo = new PerformanceObserver(l => l.getEntries().forEach(e => window.__ev.push(e.name + ' ' + (e.processingEnd - e.processingStart).toFixed(1)))); window.__evo.observe({ type: 'event', durationThreshold: 16, buffered: false }); } });
      const events = async tag => console.log('  ' + tag + ' handlers (ms):', (await page.evaluate(() => window.__ev.filter(x => /^(pointerdown|mousedown|pointerup|mouseup|click|keydown)/.test(x)).join(' | '))) || 'none slower than 16 ms');
      await page.waitForTimeout(3500); await warm('before any click'); await page.waitForTimeout(+process.env.WARM_WAIT || 5000); await warm('a few seconds later, still no click');
      if (process.env.WARM_IDLE) {
        await page.mouse.click(260, 22); await warm('just after a click on the name');
        await page.waitForTimeout(+process.env.WARM_IDLE); await warm('after ' + process.env.WARM_IDLE + ' ms of quiet');
      }
      for (let run = 0; run < (process.env.WARM_RUNS ? +process.env.WARM_RUNS : 3); run++) {
        await watch();
        if (process.env.WARM_KEY) await page.keyboard.press('t'); else { const bx = await page.locator(name === 'phone' ? '.tour-pill' : run === 1 ? '#view-tour' : '#dock-tour').boundingBox(); await page.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2); await page.mouse.down(); await warm('run ' + run + ', pressed, not yet released'); await page.waitForTimeout(90); await page.mouse.up(); }
        await page.waitForTimeout(2500); await events('run ' + run); await warm('run ' + run + ' touring=' + await page.evaluate(() => window.__tour.state().on) + ' music=' + await page.evaluate(() => window.__tour.musicOn()));
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__tour.state().on, null, { timeout: 30000 }); await page.waitForTimeout(run === 1 ? 300 : 6000);      /* the third tour begins as soon as the second has let go, while its echo is still ringing out */
      }
      await page.waitForTimeout(11000); await warm('eleven seconds after the last tour');
      if (process.env.WARM_CANCEL && name !== 'phone') { const bx = await page.locator('#dock-tour').boundingBox(); await page.mouse.move(bx.x + 14, bx.y + 14); await warm('before the cancelled press'); await page.mouse.down(); await warm('pressed'); await page.mouse.move(bx.x + 14, bx.y - 200); await page.mouse.up(); await warm('let go elsewhere, touring=' + await page.evaluate(() => window.__tour.state().on)); await page.waitForTimeout(5500); await warm('five seconds on'); }
    }
    if (action === 'musictest') {
      for (let n = 0; n < (process.env.PAGE ? 0 : 3); n++) {
        console.log('   two tours on one echo ', (await page.evaluate(() => window.__tour.musicShare())).perSecondDb);
        console.log('   the second tour alone ', (await page.evaluate(() => window.__tour.musicShare(true))).perSecondDb);
      }
      for (let n = 0; n < 3; n++) console.log('   probe', JSON.stringify(await page.evaluate(() => window.__tour.musicProbe(60))));
    }
    if (action === 'tourcpu') {
      /* what the page's own code does in the first seconds of a tour, by function, leaving out the drawing itself (which this machine does in software) */
      await page.waitForTimeout(3000);
      const cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      for (let run = 0; run < 2; run++) {
        await cdp.send('Profiler.start'); await page.click('#dock-tour'); await page.waitForTimeout(+process.env.CPU_MS || 4000);
        const { profile } = await cdp.send('Profiler.stop'), byId = new Map(profile.nodes.map(n => [n.id, n])), parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
        const self = new Map(), under = new Map(); let total = 0, frames = 0;
        const chain = id => { const out = []; for (let x = id; x != null; x = parent.get(x)) out.push(byId.get(x).callFrame.functionName || '(anon)'); return out; };
        profile.samples.forEach((id, k) => {
          const d = profile.timeDeltas[k] / 1000, f = byId.get(id).callFrame, name = f.functionName || '(anon)', ch = chain(id);
          if (name === '(idle)' || name === '(program)' || name === '(garbage collector)' && false) return;
          if (ch.includes('render') && f.url === '') return;      /* native graphics calls made while drawing */
          total += d; self.set(name + ':' + f.lineNumber, (self.get(name + ':' + f.lineNumber) || 0) + d);
          const top = ch.find(n => ['paintCaption', 'paintTelemetry', 'startTour', 'placeLabels', 'tourMarks', 'stepTour', 'render', 'stepSatLayer', 'updateStations', 'musicFill', 'tickFade', 'stepIntro'].includes(n)) || 'other'; under.set(top, (under.get(top) || 0) + d);
        });
        console.log('  run ' + run + ': page code ' + total.toFixed(0) + ' ms in ' + (+process.env.CPU_MS || 4000) + ' ms | by part: ' + [...under].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', '));
        console.log('     heaviest: ' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + v.toFixed(1)).join(' | '));
        await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__tour.state().on, null, { timeout: 30000 }); await page.waitForTimeout(3000);
      }
    }
    if (action === 'south') {
      /* the far south, where the land dots are the last to land in the opening: are they all sitting on the globe? */
      await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/shot-${name}-south-wide.png` });
      await page.evaluate(() => { document.querySelector('#view-spin').getAttribute('aria-pressed') === 'true' && document.querySelector('#view-spin').click(); });
      for (const [lat, lon, wheel, tag] of [[-52, 150, -900, 'australia'], [-80, 20, -500, 'pole'], [-20, -60, 0, 'america']]) {
        await page.evaluate(([la, lo]) => window.__ern.look(la, lo), [lat, lon]);
        if (wheel) { await page.mouse.move(vp.width / 2, vp.height / 2); for (let n = 0; n < 6; n++) { await page.mouse.wheel(0, wheel / 6); await page.waitForTimeout(250); } }
        await page.waitForTimeout(3500); await page.screenshot({ path: `${OUT}/shot-${name}-south-${tag}.png` });
        if (wheel) { for (let n = 0; n < 6; n++) { await page.mouse.wheel(0, -wheel / 6); await page.waitForTimeout(250); } await page.waitForTimeout(1500); }
      }
      console.log('  land dots off the ground:', JSON.stringify(await page.evaluate(() => window.__ern.dots ? window.__ern.dots() : 'no hook')));
    }
    if (action === 'tourin') {
      /* the first moments of the tour, with the interface's fades held at chosen instants so each can be looked at */
      await page.waitForTimeout(4000);
      const sel = name === 'phone' ? '.tour-pill' : (process.env.TOURIN_TOP ? '#view-tour' : '#dock-tour');
      await page.screenshot({ path: `${OUT}/shot-${name}-tourin-rest.png` });
      console.log('  play disc in each tour button (px from the button\'s left, top and bottom edges):', await page.evaluate(() => [...document.querySelectorAll('[data-act="tour"]')].filter(el => el.offsetParent).map(el => { const r = el.getBoundingClientRect(), d = el.querySelector('.tour-disc').getBoundingClientRect(); return (el.id || el.className.split(' ').pop()) + ' ' + [d.left - r.left, d.top - r.top, r.bottom - d.bottom].map(v => +v.toFixed(1)).join('/'); }).join(' | ')));
      await page.hover(sel).catch(() => {}); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/shot-${name}-tourin-hover.png` });
      await page.evaluate(sel => { document.querySelector(sel).addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(() => { window.__held = document.getAnimations().filter(a => a.transitionProperty || (a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#tour-burst'))); window.__held.forEach(a => a.pause()); })), { once: true }); }, sel);
      await page.click(sel); await page.waitForTimeout(900);
      console.log('  held:', await page.evaluate(() => window.__held.map(a => (a.effect.target.id || a.effect.target.className.toString().split(' ')[0] || a.effect.target.parentNode.id) + ':' + (a.transitionProperty || 'launch')).join(' ')));
      for (const ms of (process.env.TOURIN_AT || '100,220,340,480,700,950').split(',')) {
        await page.evaluate(ms => window.__held.forEach(a => { try { a.currentTime = ms; } catch (e) {} }), +ms); await page.waitForTimeout(1300);
        await page.screenshot({ path: `${OUT}/shot-${name}-tourin-${ms}.png` });
      }
      await page.evaluate(() => window.__held.forEach(a => { try { a.finish(); } catch (e) {} })); await page.waitForTimeout(2500);
      const vis = () => page.evaluate(() => ['.dock', '.inspector', '.search', '.clock', '.brand', '.statusbar', '.viewctl', '.tour-pill'].map(q => { const el = document.querySelector(q), c = el && getComputedStyle(el); return q + '=' + (c ? c.visibility + '/' + c.opacity : 'none'); }).join(' '));
      console.log('  in the tour:', await vis(), '| mask:', await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#overlay')); return c.getPropertyValue('--tour-m0') + ' ' + c.getPropertyValue('--tour-m1'); }));
      await page.screenshot({ path: `${OUT}/shot-${name}-tourin-settled.png` });
      await page.evaluate(() => window.__tour.pause()); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/shot-${name}-tourin-paused.png` });
      console.log('  header word when paused:', await page.evaluate(() => getComputedStyle(document.querySelector('.tour-state'), '::after').content + ' opacity ' + getComputedStyle(document.querySelector('.tour-state')).opacity));
      await page.evaluate(() => window.__tour.pause()); await page.waitForTimeout(600);
      console.log('  header word when playing:', await page.evaluate(() => getComputedStyle(document.querySelector('.tour-state'), '::after').content + ' opacity ' + getComputedStyle(document.querySelector('.tour-state')).opacity));
      await page.keyboard.press('Escape'); await page.waitForTimeout(500); await page.screenshot({ path: `${OUT}/shot-${name}-tourin-leaving.png` });
      await page.waitForTimeout(5000);
      console.log('  back out:', await vis(), '| touring classes:', await page.evaluate(() => document.querySelector('#app').className), '| spin:', await page.evaluate(() => document.querySelector('#view-spin').getAttribute('aria-pressed')));
      await page.screenshot({ path: `${OUT}/shot-${name}-tourin-after.png` });
    }
    if (action === 'tour') {
      await page.waitForTimeout(+process.env.TOUR_WAIT || 5000);
      if (process.env.TOUR_BEFORE) await page.screenshot({ path: `${OUT}/shot-${name}-tour-before.png` });
      if (process.env.TOUR_KEY) await page.keyboard.press('t'); else if (name === 'phone') await page.click('.tour-pill'); else await page.click('#view-tour');
      await page.waitForTimeout(300);
      const st0 = await page.evaluate(() => window.__tour.state());
      console.log('  tour on:', st0.on, '| stops:', st0.n, st0.keys.join(' '));
      if (process.env.TOUR_FRAMES) { let at = 300; for (const ms of process.env.TOUR_FRAMES.split(',')) { await page.waitForTimeout(Math.max(0, +ms - at)); at = +ms; await page.screenshot({ path: `${OUT}/shot-${name}-tour-frame-${ms}.png` }); const st = await page.evaluate(() => window.__tour.state()); console.log('   frame', ms, st.phase, 'stop', st.i, JSON.stringify(Object.fromEntries(Object.entries(st.rig).map(([k, v]) => [k, +v.toFixed(1)])))); } }
      const want = (process.env.TOUR_STOPS || '0').split(',');
      for (let n = 0; n < want.length; n++) {
        const w = want[n], i = /^\d+$/.test(w) ? +w : st0.keys.indexOf(w);
        if (!(i >= 0 && i < st0.n)) { console.log('  no stop', w); continue; }
        if (n > 0 || i !== 0) await page.evaluate(i => window.__tour.go(i), i);
        for (const ms of (process.env.TOUR_MID || '').split(',').filter(Boolean)) { await page.waitForTimeout(+ms); await page.screenshot({ path: `${OUT}/shot-${name}-tour-${st0.keys[i]}-mid${ms}.png` }); }
        await page.waitForFunction(() => window.__tour.state().phase === 'dwell', null, { timeout: 90000 });
        await page.waitForTimeout(+process.env.TOUR_DWELL || 2600);
        const st = await page.evaluate(() => window.__tour.state());
        console.log('  ', st.i, st0.keys[i], '|', st.title, '| rig', JSON.stringify(Object.fromEntries(Object.entries(st.rig).map(([k, v]) => [k, +v.toFixed(2)]))));
        await page.screenshot({ path: `${OUT}/shot-${name}-tour-${/^\d+$/.test(w) ? i + '-' : ''}${st0.keys[i]}.png` });
        if (process.env.TOUR_HIDE) { console.log('   dbg', JSON.stringify(await page.evaluate(() => window.__tour.dbg()))); for (const h of process.env.TOUR_HIDE.split(',')) { await page.evaluate(h => window.__tour.hide(h), h); await page.waitForTimeout(1200); await page.screenshot({ path: `${OUT}/shot-${name}-tour-${st0.keys[i]}-hide-${h}.png` }); } }
        if (process.env.TOUR_LATE) { await page.waitForTimeout(+process.env.TOUR_LATE); await page.screenshot({ path: `${OUT}/shot-${name}-tour-${st0.keys[i]}-late.png` }); }
      }
      if (process.env.TOUR_SMOOTH) {
        if (process.env.TOUR_LINGER) await page.evaluate(v => { window.__linger = v; }, +process.env.TOUR_LINGER);
        const stops = process.env.TOUR_SMOOTH === 'all' ? st0.keys.map((k, i) => i).slice(1).concat(0) : process.env.TOUR_SMOOTH.split(',').map(w => st0.keys.indexOf(w)).filter(i => i >= 0);
        console.log('  smoothness', JSON.stringify(await page.evaluate(stops => window.__tour.sim(stops, 60, +(window.__linger || 2500)), stops), null, 1).replace(/\n\s*/g, ' '));
      }
      if (process.env.TOUR_KEYS) {
        const st = async label => { const s = await page.evaluate(() => { const s = window.__tour.state(); return s.on + ' i=' + s.i + ' ' + s.phase + ' paused=' + document.querySelector('#tour').classList.contains('paused') + ' idle=' + document.querySelector('#app').classList.contains('tour-idle') + ' cap=' + document.querySelector('#tour').classList.contains('cap-in'); }); console.log('   keys:', label, '->', s); };
        await st('start'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300); await st('right'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(300); await st('right');
        await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(300); await st('left'); await page.keyboard.press(' '); await page.waitForTimeout(300); await st('space'); await page.keyboard.press(' '); await page.waitForTimeout(300); await st('space');
        await page.evaluate(() => window.__tour.go(window.__tour.state().n)); await page.waitForTimeout(400); await st('past the last stop (new lap)');
        await page.evaluate(() => window.__tour.go(-1)); await page.waitForTimeout(400); await st('before the first stop');
        await page.waitForTimeout(4000); await st('left alone 4 s');
        await page.keyboard.press('Escape'); await page.waitForTimeout(3600); await st('escape');
        await page.keyboard.press('t'); await page.waitForTimeout(600); await st('T again'); await page.keyboard.press('/'); await page.waitForTimeout(3600); await st('slash');
        console.log('   focus after slash:', await page.evaluate(() => document.activeElement.id), '| cam', JSON.stringify(await page.evaluate(() => window.__ern.cam())));
      }
      if (process.env.TOUR_PACE) {
        const pace = async label => console.log('   pace:', label, '->', await page.evaluate(() => window.__tour.state().rate + ' "' + document.querySelector('#tour-pace').textContent + '" held=' + document.querySelector('#tour').classList.contains('held') + ' word="' + getComputedStyle(document.querySelector('.tour-state') || document.querySelector('.tour-live span'), '::after').content + '"'));
        await pace('start'); await page.keyboard.press('.'); await pace('faster'); await page.keyboard.press('.'); await pace('faster again'); await page.keyboard.press(','); await page.keyboard.press(','); await pace('slower twice');
        await page.evaluate(() => document.querySelector('#tour-pace').click()); await pace('button');
        const box = await page.evaluate(() => { const r = document.querySelector('.tour-cap').getBoundingClientRect(); return { x: r.left + 60, y: r.top + 60 }; });
        await page.mouse.move(box.x, box.y); await page.waitForTimeout(300); await pace('mouse on the words'); await page.screenshot({ path: `${OUT}/shot-${name}-tour-held.png` });
        await page.mouse.move(box.x + 500, box.y - 300); await page.waitForTimeout(300); await pace('mouse away');
        console.log('   prefs saved:', await page.evaluate(() => (JSON.parse(localStorage.getItem('ern:prefs') || '{}').v || {}).tourPace));
      }
      if (process.env.TOUR_MUSIC) {
        console.log('   music playing after start:', await page.evaluate(() => window.__tour.musicOn() + ' | button ' + document.querySelector('#tour-music').dataset.state + ' | context ' + (window.AudioContext ? 'yes' : 'no')));
        console.log('   music probe', JSON.stringify(await page.evaluate(s => window.__tour.musicProbe(s), +process.env.TOUR_MUSIC)));
        console.log('   two tours on one echo ', JSON.stringify(await page.evaluate(() => window.__tour.musicShare())));
        console.log('   the second tour alone', JSON.stringify(await page.evaluate(() => window.__tour.musicShare(true))));
        await page.keyboard.press('m'); await page.waitForTimeout(200);
        console.log('   after M:', await page.evaluate(() => window.__tour.musicOn() + ' | button ' + document.querySelector('#tour-music').dataset.state + ' | saved ' + (JSON.parse(localStorage.getItem('ern:prefs') || '{}').v || {}).tourMusic));
        await page.keyboard.press('m'); await page.waitForTimeout(200);
        console.log('   after M again:', await page.evaluate(() => window.__tour.musicOn() + ' | button ' + document.querySelector('#tour-music').dataset.state));
      }
      if (process.env.TOUR_PAUSE) { await page.keyboard.press(' '); await page.mouse.move(700, 400); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/shot-${name}-tour-paused.png` }); await page.keyboard.press(' '); }
      if (process.env.TOUR_EXIT_TIME) {
        const fps0 = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(+(n / 1.5).toFixed(1)); }; requestAnimationFrame(f); }));
        await page.keyboard.press('Escape');
        const r = await page.evaluate(() => new Promise(res => { const t0 = performance.now(); let off = 0, n = 0; const f = () => { n++; const now = performance.now() - t0; if (!off && !window.__tour.state().on) off = now; if (document.querySelector('#tour').hidden || now > 9000) res({ tourOffMs: Math.round(off), hiddenMs: Math.round(now), fps: +(n / (now / 1000)).toFixed(1) }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
        console.log('   exit timing: fps before', fps0, JSON.stringify(r));
      }
      if (process.env.TOUR_EXIT) { await page.keyboard.press('Escape'); await page.waitForTimeout(700); await page.screenshot({ path: `${OUT}/shot-${name}-tour-exiting.png` }); await page.waitForTimeout(2600); console.log('  after exit', JSON.stringify(await page.evaluate(() => Object.assign(window.__ern.cam(), { tour: window.__tour.state().on, touring: document.querySelector('#app').className, tourHidden: document.querySelector('#tour').hidden })))); }
    }
    if (action === 'searching') { await page.fill('#search-input', 'Mum'); await page.waitForTimeout(120); }
    if (action === 'news') { await tab('news'); await page.click('#tab-news .row >> nth=1'); await page.waitForTimeout(2200); }
    if (action === 'swx') { await page.click(name === 'phone' ? '#tab-now [data-open="swx"]' : '#summary [data-open="swx"]'); await page.waitForTimeout(600); await tab('sources'); }
    if (action === 'launch') { await tab('latest'); await page.click('#tab-latest .row[data-sel^="launches"] >> nth=0'); await page.waitForTimeout(2200); }
    if (action === 'zoom') { console.log('  cam before', JSON.stringify(await page.evaluate(() => window.__ern.cam()))); await page.mouse.move(cx, cy); for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(60); } await page.waitForTimeout(2500); console.log('  cam after', JSON.stringify(await page.evaluate(() => window.__ern.cam()))); }
    if (action === 'day') { await page.click((name === 'phone' ? '#tab-now' : '#summary') + ' [data-go="sun"]'); await page.waitForTimeout(2600); }
    if (action === 'relief' || action === 'relief-clouds') { await page.click((name === 'phone' ? '#tab-now' : '#summary') + ' [data-go="sun"]'); await page.waitForTimeout(2200);
      await page.mouse.move(cx + 120, cy); await page.mouse.down(); await page.mouse.move(cx - 190, cy - 20, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(900);
      if (action === 'relief') await page.evaluate(() => document.querySelector('#layer-clouds').click());
      await page.mouse.move(cx, cy); for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -260); await page.waitForTimeout(60); } await page.waitForTimeout(2200); }
    if (action === 'radio') { await page.fill('#search-input', 'Radio Test 7'); await page.waitForTimeout(900); await page.keyboard.press('Enter'); await page.waitForTimeout(2500); await page.click('#radio-play'); await page.waitForTimeout(700);
      console.log('  radio state after click:', await page.evaluate(() => document.querySelector('#player').dataset.state + ' / ' + document.querySelector('#radio-play').textContent));
      await page.waitForTimeout(3500); console.log('  radio state later:', await page.evaluate(() => document.querySelector('#player').dataset.state + ' / ' + document.querySelector('#radio-play').textContent + ' / ' + document.querySelector('#pl-state').textContent)); }
    if (process.env.HASH) { await page.waitForTimeout(6000); console.log('  with #' + process.env.HASH + ' app class: "' + await page.evaluate(() => document.querySelector('#app').className + '" | caption: ' + document.querySelector('#tour-title').textContent + ' | hook: ' + typeof window.__tour)); }
    await page.screenshot({ path: `${OUT}/shot-${name}-${mode}${action ? '-' + action : ''}.png` });
    console.log(name, mode, action, 'errors:', errors.length ? '\n' + errors.join('\n') : 'none', unknown.size ? 'UNMOCKED: ' + [...unknown].join(', ') : '', '| boot', bootMs + 'ms', '| satellite.js loads', satLib);
    console.log('  boot: ' + bootStates);
    console.log('  ' + await page.evaluate(() => document.querySelector('#src-summary').textContent + ' | ' + [...document.querySelectorAll('#tab-sources .src')].filter(e => e.querySelector('.dot').dataset.state !== 'ok' && e.querySelector('.dot').dataset.state !== 'static').map(e => e.querySelector('.t').textContent).join(' ; ')));
    console.log('  ' + await page.evaluate(() => [...document.querySelectorAll('.layer')].filter(e => !e.hidden && e.querySelector('.count').textContent).map(e => e.querySelector('.name').textContent + '=' + e.querySelector('.count').textContent).join(', ')));
    await page.close();
  }
  await browser.close();
})();
