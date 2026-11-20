/* ============================================================
   Core helpers
   ============================================================ */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const D2R = Math.PI / 180, R2D = 180 / Math.PI, EARTH_KM = 6371;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : null);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wrapLon = lon => ((lon % 360) + 540) % 360 - 180;
const num = n => Math.round(n).toLocaleString();
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

function fatal(msg) {
  const el = document.createElement('div');
  el.className = 'fatal'; el.textContent = msg;
  $('#app').appendChild(el);
}

function fmtLL(lat, lon) {
  return Math.abs(lat).toFixed(2) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + Math.abs(lon).toFixed(2) + '° ' + (lon >= 0 ? 'E' : 'W');
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 0) return until(t);
  if (s < 45) return 'just now';
  if (s < 5400) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 129600) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function until(t) {
  let s = Math.round((t - Date.now()) / 1000);
  if (s <= 0) return 'now';
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (d) return 'in ' + d + ' d ' + h + ' h';
  if (h) return 'in ' + h + ' h ' + m + ' min';
  return 'in ' + m + ' min ' + String(s).padStart(2, '0') + ' s';
}
function fmtTime(t) {
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}
/* wall-clock time at a UTC offset, e.g. "Thu 01:22" */
function clockAt(offsetSec, t) {
  const d = new Date((t || Date.now()) + offsetSec * 1000);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
const utcLabel = off => 'UTC' + (off >= 0 ? '+' : '−') + Math.floor(Math.abs(off) / 3600) + (Math.abs(off) % 3600 ? ':' + String(Math.round(Math.abs(off) % 3600 / 60)).padStart(2, '0') : '');

/* every request passes through here, so one thin bar at the top can show when anything is loading */
const net = { n: 0, bump(d) { this.n = Math.max(0, this.n + d); const b = document.getElementById('netbar'); if (b) b.classList.toggle('on', this.n > 0); } };
/* One place for every request: a quick retry for network blips, an optional saved copy for when a provider is down. */
async function getJSON(url, ms, asText, opts) {
  opts = opts || {};
  let lastErr;
  for (let attempt = 0; attempt < (opts.tries || 2); attempt++) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 20000), t0 = performance.now();
    net.bump(1);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
      const data = asText ? await r.text() : await r.json();
      if (opts.keep && !asText) bigStore.set('http:' + url, data);
      return data;
    } catch (e) { lastErr = e; }
    finally { clearTimeout(timer); net.bump(-1); }
    if ((lastErr.status && lastErr.status < 500) || performance.now() - t0 > 4000) break;      /* only retry failures that were quick and might be a blip */
    await sleep(600);
  }
  if (opts.stale) { try { return await savedCopy(url); } catch (e) {} }
  throw lastErr;
}
/* the last good answer from a URL, marked with when it was saved */
async function savedCopy(url) {
  const o = await bigStore.getAny('http:' + url);
  if (!o || o.v == null || typeof o.v !== 'object' || Date.now() - o.t > 3 * 864e5) throw new Error('no saved copy');
  Object.defineProperty(o.v, '__stale', { value: o.t });
  return o.v;
}
const KEEP = { keep: true, stale: true };
/* try each provider in turn; remember which one answered so the Sources tab can say so */
async function firstOf(src, providers) {
  let err;
  for (let i = 0; i < providers.length; i++) {
    try { const out = await providers[i][1](); SOURCES[src].via = i ? providers[i][0] : ''; return out; } catch (e) { err = e; }
  }
  throw err;
}
const errNote = e => (e && e.status ? 'error ' + e.status : 'unreachable');

/* small remembered values (per browser; everything still works without storage) */
const store = {
  get(key, maxAge) {
    try { const o = JSON.parse(localStorage.getItem('ern:' + key)); if (o && (!maxAge || Date.now() - o.t < maxAge)) return o.v; } catch (e) {}
    return null;
  },
  set(key, v) { try { localStorage.setItem('ern:' + key, JSON.stringify({ t: Date.now(), v })); } catch (e) {} }
};
/* larger cached downloads (orbit catalogues) live in IndexedDB so reloads do not hammer the providers */
const bigStore = {
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res, rej) => {
      try {
        const rq = indexedDB.open('earth-right-now', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
    return this.p;
  },
  async get(key, maxAge) {
    try {
      const db = await this.open();
      const o = await new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
      return o && Date.now() - o.t < maxAge ? o.v : null;
    } catch (e) { return null; }
  },
  async getAny(key) {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    } catch (e) { return null; }
  },
  async set(key, v) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').put({ t: Date.now(), v }, key); } catch (e) {} }
};

/* ---------- astronomy (low-precision almanac formulas, good to a few hundredths of a degree) ---------- */
const J2000 = Date.UTC(2000, 0, 1, 12);
function sunEcl(d) { const g = (357.529 + 0.98560028 * d) * D2R; return (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R; }
const gmstDeg = d => (280.46061837 + 360.98564736629 * d) % 360;
function subsolar(date) {
  const d = (date.getTime() - J2000) / 864e5, L = sunEcl(d), e = (23.439 - 3.6e-7 * d) * D2R;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) * R2D, dec = Math.asin(Math.sin(e) * Math.sin(L)) * R2D;
  return { lat: dec, lon: wrapLon(ra - gmstDeg(d)) };
}
function moonInfo(date) {
  const d = (date.getTime() - J2000) / 864e5;
  const L = (218.316 + 13.176396 * d) * D2R, M = (134.963 + 13.064993 * d) * D2R, F = (93.272 + 13.229350 * d) * D2R;
  const lon = L + 6.289 * D2R * Math.sin(M), lat = 5.128 * D2R * Math.sin(F), e = 23.439 * D2R;
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(e) * Math.cos(lat) * Math.sin(lon) - Math.sin(e) * Math.sin(lat);
  const z = Math.sin(e) * Math.cos(lat) * Math.sin(lon) + Math.cos(e) * Math.sin(lat);
  const el = (((lon - sunEcl(d)) * R2D) % 360 + 360) % 360;
  const name = el < 12 || el > 348 ? 'New moon' : el < 78 ? 'Waxing crescent' : el < 102 ? 'First quarter' : el < 168 ? 'Waxing gibbous'
    : el < 192 ? 'Full moon' : el < 258 ? 'Waning gibbous' : el < 282 ? 'Last quarter' : 'Waning crescent';
  return { lat: Math.asin(z) * R2D, lon: wrapLon(Math.atan2(y, x) * R2D - gmstDeg(d)), frac: (1 - Math.cos(el * D2R)) / 2, name };
}

/* ---------- geometry ---------- */
/* lat/lon in degrees -> point on a sphere of radius r (north is +y, lon 0 is +x, lon 90°E is -z) */
function ll(lat, lon, r, out) {
  const a = lat * D2R, o = lon * D2R, c = Math.cos(a);
  return (out || new THREE.Vector3()).set(r * c * Math.cos(o), r * Math.sin(a), -r * c * Math.sin(o));
}
function vecLL(v) { const d = v.length() || 1; return { lat: Math.asin(clamp(v.y / d, -1, 1)) * R2D, lon: Math.atan2(-v.z, v.x) * R2D }; }
function gcKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * D2R / 2) ** 2 + Math.cos(lat1 * D2R) * Math.cos(lat2 * D2R) * Math.sin((lon2 - lon1) * D2R / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* ---------- weather codes (WMO) ---------- */
const ICONS = {
  sun: '<circle cx="8" cy="8" r="3.1"/><path d="M8 1.2v1.9M8 12.9v1.9M1.2 8h1.9M12.9 8h1.9M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M3.2 12.8l1.3-1.3M11.5 4.5l1.3-1.3"/>',
  moon: '<path d="M12.6 9.8A5.3 5.3 0 0 1 6.2 3.4a5.4 5.4 0 1 0 6.4 6.4Z"/>',
  part: '<circle cx="5.6" cy="5.4" r="2.2"/><path d="M5.6 1.3v.9M1.5 5.4h.9M2.7 2.5l.6.6M8.5 2.5l-.6.6"/><path d="M5.4 13h5.9a2.4 2.4 0 0 0 .2-4.8 3.4 3.4 0 0 0-6.4.9A2 2 0 0 0 5.4 13Z"/>',
  cloud: '<path d="M4.4 12.4h7a2.8 2.8 0 0 0 .3-5.6 4 4 0 0 0-7.6 1A2.3 2.3 0 0 0 4.4 12.4Z"/>',
  fog: '<path d="M2 5.5h12M3.5 8.5h9M2 11.5h12"/>',
  rain: '<path d="M4.4 9.4h7a2.6 2.6 0 0 0 .3-5.2 3.8 3.8 0 0 0-7.2.9 2.2 2.2 0 0 0-.1 4.3Z"/><path d="M5.5 11.6l-.8 2M8.3 11.6l-.8 2M11.1 11.6l-.8 2"/>',
  snow: '<path d="M4.4 9.4h7a2.6 2.6 0 0 0 .3-5.2 3.8 3.8 0 0 0-7.2.9 2.2 2.2 0 0 0-.1 4.3Z"/><path d="M5.2 12.4h.01M8 13.4h.01M10.8 12.4h.01" stroke-width="1.8"/>',
  storm: '<path d="M4.4 9.4h7a2.6 2.6 0 0 0 .3-5.2 3.8 3.8 0 0 0-7.2.9 2.2 2.2 0 0 0-.1 4.3Z"/><path d="M8.6 10.4l-1.6 2.2h2l-1.4 2.2"/>'
};
const icon = (k, cls) => '<svg class="wx ' + (cls || '') + '" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + '</svg>';
function wmo(code, isDay) {
  const day = isDay !== 0 && isDay !== false;
  if (code === 0) return { text: 'Clear', icon: day ? 'sun' : 'moon' };
  if (code === 1) return { text: 'Mostly clear', icon: day ? 'sun' : 'moon' };
  if (code === 2) return { text: 'Partly cloudy', icon: day ? 'part' : 'cloud' };
  if (code === 3) return { text: 'Overcast', icon: 'cloud' };
  if (code === 45 || code === 48) return { text: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { text: 'Drizzle', icon: 'rain' };
  if (code >= 61 && code <= 67) return { text: 'Rain', icon: 'rain' };
  if (code >= 71 && code <= 77) return { text: 'Snow', icon: 'snow' };
  if (code >= 80 && code <= 82) return { text: 'Rain showers', icon: 'rain' };
  if (code === 85 || code === 86) return { text: 'Snow showers', icon: 'snow' };
  if (code >= 95) return { text: 'Thunderstorm', icon: 'storm' };
  return { text: 'Unknown', icon: 'cloud' };
}
const compass = deg => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) + 360) % 360 / 45) % 8];

if (!window.THREE || !THREE.OrbitControls) { fatal('The 3D engine could not be loaded. Check your connection, then reload the page.'); return; }

/* ============================================================
   Layer registry
   shape: 0 disc, 1 ring, 2 diamond, 3 triangle, 4 square, 5 spark
   ============================================================ */
const GROUPS = [['earth', 'Earth'], ['sky', 'Atmosphere'], ['orbit', 'In orbit'], ['people', 'People and nature'], ['infra', 'Infrastructure'], ['map', 'Map']];
const LAYERS = {
  quakes:    { g: 'earth', name: 'Earthquakes', one: 'Earthquake', color: '#ff9f0a', shape: 1,
    about: 'Every earthquake located by the US Geological Survey. A bigger ring is a stronger quake, and a ring that pulses happened in the last hour. Below magnitude 3 people rarely feel anything; from about 6, buildings can be damaged.' },
  plates:    { g: 'earth', name: 'Plate boundaries', color: '#ff9f0a', line: true,
    about: 'The Earth’s crust is broken into huge slabs called plates. These lines are where they meet and grind against each other, which is why most earthquakes and volcanoes line up along them.' },
  fires:     { g: 'earth', name: 'Wildfires', one: 'Wildfire', color: '#ff453a', shape: 0,
    about: 'Large wildfires that NASA is tracking from satellite images and fire agency reports.' },
  hotspots:  { g: 'earth', name: 'Fire hotspots', one: 'Fire hotspot', color: '#ff6a3d', shape: 0, small: true,
    about: 'Patches of intense heat that satellites picked up in the past 24 hours. Most are wildfires or farmers burning fields; a few are gas flares and volcanoes.' },
  storms:    { g: 'earth', name: 'Severe storms', one: 'Severe storm', color: '#bf5af2', shape: 0,
    about: 'Tropical storms. Hurricanes, typhoons and cyclones are the same kind of storm, named differently in each ocean. The purple line is the path the storm has taken so far.' },
  volcanoes: { g: 'earth', name: 'Volcanoes', one: 'Volcano', color: '#ffd60a', shape: 3,
    about: 'Volcanoes that are erupting or showing signs of unrest, as tracked by NASA.' },
  ice:       { g: 'earth', name: 'Sea ice', one: 'Iceberg', color: '#64d2ff', shape: 2,
    about: 'Giant icebergs that have broken off Antarctica or Greenland and are followed as they drift.' },
  other:     { g: 'earth', name: 'Other events', one: 'Natural event', color: '#30d158', shape: 2,
    about: 'Other natural events NASA is tracking, such as dust storms and floods.' },
  alerts:    { g: 'earth', name: 'Disaster alerts', one: 'Disaster alert', color: '#ff375f', shape: 4,
    about: 'Alerts from GDACS, a United Nations and European Union system. Orange means the disaster may need international help; red means it very likely does.' },
  fireballs: { g: 'earth', name: 'Fireballs', one: 'Fireball', color: '#ffe08a', shape: 5,
    about: 'Very bright meteors: space rocks that burned up or exploded high in the atmosphere, picked up by US government sensors over the past year. They are harmless by the time they are seen.' },
  warnings:  { g: 'sky', name: 'US weather warnings', one: 'Weather warning', color: '#ff8fb1', shape: 2,
    about: 'Severe and extreme weather warnings in force in the United States right now, such as tornado, flash flood and severe thunderstorm warnings, from the National Weather Service. Each marker sits in the middle of the warned area.' },
  clouds:    { g: 'sky', name: 'Clouds', color: '#d1d1d6', tex: true,
    about: 'Cloud cover as seen by weather satellites, refreshed every three hours.' },
  wind:      { g: 'sky', name: 'Wind', color: '#d1d1d6', flow: true,
    about: 'The moving streaks follow the wind near the ground right now. Where they race, the wind is strong; where they crawl, the air is calm.' },
  aurora:    { g: 'sky', name: 'Aurora', color: '#4ff0a8', glow: true,
    about: 'The green glow shows where the northern or southern lights are likely to be visible in the next half hour, from the US weather agency NOAA.' },
  stations:  { g: 'orbit', name: 'Space stations', one: 'Space station', color: '#ffffff', shape: 0, halo: true,
    about: 'The two space stations where people live: the International Space Station and China’s Tiangong. The circle on the ground is the area from which the station is above the horizon, and the line is its path over the next orbit.' },
  starlink:  { g: 'orbit', name: 'Starlink', one: 'Starlink internet satellite', color: '#b9ccff', shape: 0, small: true, sat: true,
    about: 'SpaceX’s internet satellites. Thousands of them fly about 550 km up, which is why they form a shell around the globe.' },
  constel:   { g: 'orbit', name: 'Other constellations', one: 'Constellation satellite', color: '#b9b4ec', shape: 0, small: true, sat: true,
    about: 'Other fleets of satellites that work together for internet and phone service, such as OneWeb, Kuiper, Iridium and Globalstar.' },
  nav:       { g: 'orbit', name: 'Navigation', one: 'Navigation satellite', color: '#b6f2c8', shape: 2, small: true, sat: true,
    about: 'The satellites that let a phone find its position: GPS (United States), Galileo (Europe), GLONASS (Russia) and BeiDou (China). They orbit about 20,000 km up, so zoom out to see them.' },
  geo:       { g: 'orbit', name: 'Geostationary', one: 'Geostationary satellite', color: '#ffd9a8', shape: 4, small: true, sat: true,
    about: 'Satellites about 36,000 km up that circle exactly once a day, so each one stays above the same spot on the equator. They carry television, communications and weather cameras. Zoom out to see the ring they form.' },
  sats:      { g: 'orbit', name: 'All other satellites', one: 'Satellite', color: '#e5e5ea', shape: 0, small: true, sat: true,
    about: 'Every other working satellite: cameras that photograph the Earth, weather and science missions, military satellites and small research craft.' },
  debris:    { g: 'orbit', name: 'Space debris', one: 'Piece of space debris', color: '#ff8a80', shape: 0, small: true, sat: true,
    about: 'Every tracked fragment left in orbit by explosions, collisions and weapon tests. A piece the size of a marble hits with the energy of a bowling ball dropped from a tall building, so each one is followed by radar.' },
  rockets:   { g: 'orbit', name: 'Spent rocket stages', one: 'Spent rocket stage', color: '#ffb86b', shape: 3, small: true, sat: true,
    about: 'The used upper stages of rockets, left to drift after releasing their satellites. They are the largest pieces of junk in orbit, some as big as a bus.' },
  dsn:       { g: 'orbit', name: 'Deep space antennas', one: 'Deep space antenna site', color: '#ffe27a', shape: 1,
    about: 'NASA’s three giant antenna sites, spaced a third of the way round the world from each other so that one always faces any distant spacecraft. Click one to see which craft it is talking to right now, how far away they are and how long the signal takes.' },
  dead:      { g: 'orbit', name: 'Dead satellites', one: 'Dead satellite', color: '#a6a9b3', shape: 4, small: true, sat: true,
    about: 'Satellites that have stopped working but are still up there in one piece. Nobody publishes an open list of them all, so this layer gathers the families that can be looked up by name: mostly Soviet and Russian Cosmos satellites, plus old American, Molniya, Meteor, Raduga and Gorizont craft.' },
  launches:  { g: 'orbit', name: 'Rocket launches', one: 'Rocket launch', color: '#8e8cff', shape: 3,
    about: 'Rockets scheduled to lift off soon, shown at their launch pads with a countdown.' },
  cities:    { g: 'people', name: 'Cities and weather', one: 'City', color: '#f5f5f7', shape: 0, small: true,
    about: 'Major cities with the temperature right now. Click one for a full weather report.' },
  news:      { g: 'people', name: 'News', one: 'News', color: '#d9a56c', shape: 1,
    about: 'Today’s and yesterday’s world events as summarised by Wikipedia editors, each pinned to the first place the story mentions.' },
  wildlife:  { g: 'people', name: 'Wildlife sightings', one: 'Wildlife sighting', color: '#7ee081', shape: 0, small: true,
    about: 'Plants and animals that people photographed in the last few hours and other naturalists confirmed, from the iNaturalist community.' },
  radio:     { g: 'people', name: 'Radio stations', one: 'Radio station', color: '#c3e85c', shape: 0, small: true,
    about: 'Live radio stations around the world. Click a yellow-green dot, press Listen live, and hop from station to station.' },
  sounds:    { g: 'people', name: 'Wild sounds', one: 'Wildlife recording', color: '#c9a7ff', shape: 2, small: true,
    about: 'Birdsong, frogs, insects and other animals that people recorded in the last few days and naturalists identified. Click a violet diamond and press play to hear that spot.' },
  cams:      { g: 'people', name: 'Live cameras', one: 'Live camera', color: '#9ad0ff', shape: 4, small: true,
    about: 'Public roadside cameras you can look through right now. California’s play live video, London’s play a clip from the last few minutes, Finland’s can replay the past day, and Singapore’s send a new picture every minute.' },
  borders:   { g: 'map', name: 'Country borders', color: '#8e8e93', line: true, about: 'Thin lines between countries. They get clearer as you zoom in.' },
  nuclear:   { g: 'infra', name: 'Nuclear facilities', one: 'Nuclear site', color: '#4c9bff', shape: 6,
    about: 'Every nuclear power station on record with the International Atomic Energy Agency, as of March 2024. A bright hexagon has reactors running, and the bigger it is the more electricity it makes; a faint one is planned, paused or shut down. Small hexagons are research reactors, fuel plants and waste stores listed on Wikidata. Click one for its reactors.' },
  coal:      { g: 'infra', name: 'Coal power stations', one: 'Coal power station', color: '#c9a383', shape: 4, off: true,
    about: 'Every coal-fired power station of 1,000 megawatts or more, and the biggest being built, from Global Energy Monitor. The bigger the square, the more electricity it can make; a faint one is still under construction.' },
  gas:       { g: 'infra', name: 'Gas and oil power stations', one: 'Gas power station', color: '#ff9d6c', shape: 4, off: true,
    about: 'Every power station of 1,000 megawatts or more that burns natural gas or oil, and the biggest being built, from Global Energy Monitor.' },
  hydro:     { g: 'infra', name: 'Hydropower dams', one: 'Hydropower station', color: '#5ec8ff', shape: 4, off: true,
    about: 'Every hydropower station of 500 megawatts or more, and the biggest being built, from Global Energy Monitor.' },
  solar:     { g: 'infra', name: 'Solar farms', one: 'Solar farm', color: '#ffd84d', shape: 4, off: true,
    about: 'Every solar farm of 300 megawatts or more, and the biggest being built, from Global Energy Monitor.' },
  wind:      { g: 'infra', name: 'Wind farms', one: 'Wind farm', color: '#9ff0d0', shape: 4, off: true,
    about: 'Every wind farm of 300 megawatts or more, on land and at sea, and the biggest being built, from Global Energy Monitor.' },
  lng:       { g: 'infra', name: 'LNG terminals', one: 'LNG terminal', color: '#f7b6ff', shape: 2, off: true,
    about: 'The ports where natural gas is chilled into a liquid and loaded onto tankers, and the ports that take it off them, from Global Energy Monitor. A faint diamond is still being built.' },
  pipes:     { g: 'infra', name: 'Gas pipelines', color: '#e2a03f', line: true, off: true,
    about: 'The long-distance pipelines that carry natural gas across countries and under seas: every one of 200 km or more, as mapped by Global Energy Monitor. Fainter lines are being built or standing idle. Click a pipeline for its length and what it can carry.' },
  cables:    { g: 'infra', name: 'Undersea internet cables', color: '#6fd6e8', line: true,
    about: 'The fibre-optic cables on the sea floor that carry almost all internet traffic between continents, as mapped by TeleGeography. Fainter lines are cables not yet laid. Click a cable for its name, age and owners.' },
  overlay:   { g: 'map', name: 'NASA satellite view', color: '#ff7ab6', tex: true, pick: true,
    about: 'Drape one of NASA’s latest whole-Earth measurements over the globe: rain, snow and ice, sea temperature and algae, haze, air pollution and volcanic gas, ground temperature, soil moisture, vegetation, floods, or last night’s lights. Zoom in and the picture sharpens.' },
  lights:    { g: 'map', name: 'City lights at night', color: '#ffe9c4', tex: true, about: 'On the dark side of the planet, the lights of towns and cities as photographed by NASA.' },
  grid:      { g: 'map', name: 'Latitude and longitude grid', color: '#8e8e93', line: true, off: true, about: 'Reference lines every 15 degrees.' }
};
/* NASA satellite views, grouped as the picker shows them. Each is drawn from one or more GIBS layers.
   parts   what to draw, bottom first, each [layers, days, seek, spare]
             layers  the names for one request, drawn left to right
             days    0 takes whatever NASA has newest; n lays the n latest days over each other, so a full day sits under today's first passes
             seek    1 for a measurement NASA publishes days late: the newest day it has is looked for first
             spare   layers to fall back on when the first set has gone quiet, or [layers, days] if they need a different number of days
   tone    a recolouring of the finished picture (OVER_TONE in 81-views.js), for measurements NASA paints over the whole globe
   bar     the colour scale in the legend: [colours low to high, low label, high label]
   keys    or [colour, meaning] pairs, for a view that shows classes rather than a scale
   fine    the narrowest window, in degrees of longitude, worth fetching when zoomed in; left out where the measurement is too coarse to sharpen
   Layer names, colour scales and publishing delays were checked against NASA's own service in November 2026. Only instruments with years
   ahead of them are used: VIIRS and OMPS on NOAA-20 and NOAA-21, SMAP, Sentinel-5P, and NASA's multi-satellite rain and sea analyses.
   Nothing here depends on Terra (switched off on 1 December 2026) or on Aqua and Aura, which follow it. */
const OVERLAYS = [
  { id: '', name: 'Off' },
  { id: 'rain', g: 'Weather', name: 'Rain and snow', parts: [['IMERG_Precipitation_Rate']], fine: 90,
    text: 'Rain and snow falling in the last few hours, measured from orbit by a fleet of weather satellites. Green is light rain, yellow and red are heavy. Blue shades are snow.' },
  { id: 'snow', g: 'Weather', name: 'Snow and sea ice', tone: 'ice', fine: 22.5,
    parts: [['GHRSST_L4_MUR_Sea_Ice_Concentration', 0, 0, 'GHRSST_L4_MUR25_Sea_Ice_Concentration'], ['VIIRS_NOAA20_NDSI_Snow_Cover', 2, 0, 'VIIRS_NOAA21_NDSI_Snow_Cover']],
    text: 'Snow lying on land and ice floating on the sea. Snow runs from pale yellow where it is patchy to red where it is complete; sea ice from purple where it is loose, through blue and green, to white where it is solid. Gaps on land were under cloud or in polar darkness.' },
  { id: 'true', g: 'Weather', name: 'True colour', fmt: 'jpeg', fine: 11.25,
    parts: [['VIIRS_NOAA20_CorrectedReflectance_TrueColor', 3, 0, 'VIIRS_NOAA21_CorrectedReflectance_TrueColor']],
    text: 'The Earth as a camera in orbit photographed it on its daytime passes. Today’s passes lie over yesterday’s, so the whole globe is covered; where the two meet, the clouds can jump. Places in polar night stay dark.' },
  { id: 'sst', g: 'Sea', name: 'Sea temperature', parts: [['GHRSST_L4_MUR_Sea_Surface_Temperature']], fine: 22.5,
    bar: ['#2b001a,#65035d,#510963,#1f1c5d,#21499b,#2a88d7,#20a371,#b0e500,#ffb900,#f05b00,#b51d00,#6b0200', '0 °C', '32 °C'],
    text: 'The temperature of the sea surface. Purple and blue water is cold, yellow and red water is warm.' },
  { id: 'ssta', g: 'Sea', name: 'Sea warmer than usual', parts: [['GHRSST_L4_MUR25_Sea_Surface_Temperature_Anomalies']],
    bar: ['#6b00db,#9600ca,#414be6,#00aeff,#18fce5,#76ff8c,#b1ff98,#bfdbb0,#d5d5ac,#fff679,#ffc209,#ff9100,#ff3d00,#f3002d,#d30085,#88000f', '3 °C cooler', '3 °C warmer'],
    text: 'How the sea surface compares with the long-term average for this date. Red is warmer than usual, blue is cooler. Large red patches are marine heatwaves.' },
  { id: 'chl', g: 'Sea', name: 'Ocean plant life', parts: [['VIIRS_NOAA20_Chlorophyll_a,VIIRS_NOAA21_Chlorophyll_a', 3]], fine: 11.25,
    bar: ['#93006c,#5a00a5,#1e00e1,#0035ff,#00a0ff,#00ffef,#00ff4f,#58ff00,#f8ff00,#ffb300,#ff6300,#ff1300,#b40000,#690000', '0.01', '20 mg of chlorophyll per m³'],
    text: 'Chlorophyll in the top of the sea: the microscopic plants that feed almost everything else in it. Purple and blue water is nearly empty, green is rich, and yellow, orange and red are thick blooms of algae. Gaps were under cloud or in the glare of the Sun.' },
  { id: 'haze', g: 'Air', name: 'Smoke, dust and haze', tone: 'haze', parts: [['VIIRS_NOAA20_AOD_Deep_Blue_Land_Ocean,VIIRS_NOAA21_AOD_Deep_Blue_Land_Ocean', 2]], fine: 45,
    bar: ['rgba(255,235,135,0),#ffc94c,#ff992a,#ff671c,#f72d10,#d7090b,#a1000e', 'Hazy', 'Thick'],
    text: 'Tiny particles hanging in the air: wildfire smoke, desert dust and city haze. Clear air is left uncoloured; the deeper the colour, the thicker the haze. Under cloud nothing can be measured.' },
  { id: 'no2', g: 'Air', name: 'Air pollution', tone: 'no2', parts: [['TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column', 2, 1]], fine: 45,
    bar: ['rgba(255,230,122,0),#ffd65c,#ffc145,#ffa42f,#ff8a24,#ff6f1d,#ff4815,#f52810,#e5110a,#7f000e', 'Raised', 'Severe'],
    text: 'Nitrogen dioxide, a gas from engines, power stations, industry and fires. Clean air is left uncoloured; yellow is a raised level, orange and red are heavy pollution. It gathers over big cities and industrial regions. NASA publishes this one about a week late.' },
  { id: 'so2', g: 'Air', name: 'Volcanic gas', tone: 'so2', parts: [['OMPS_NOAA20_SO2_Middle_Troposphere', 2]],
    bar: ['rgba(255,200,21,.5),#ffd425,#ffe251,#fff19c,#ffffff', '1', '32 Dobson units'],
    text: 'Sulphur dioxide, the gas that erupting and smouldering volcanoes pour out, measured about eight kilometres up. The brighter the patch, the more gas. Lone faint specks are noise in the instrument.' },
  { id: 'lst', g: 'Land', name: 'Ground temperature', parts: [['VIIRS_NOAA20_Land_Surface_Temp_Day,VIIRS_NOAA21_Land_Surface_Temp_Day', 3]], fine: 11.25,
    bar: ['#c900ff,#7d00ff,#2d00ff,#0033ff,#0099ff,#00ffff,#4dff4d,#95ff00,#e2ff00,#ffdc00,#ffa000,#ff6100,#ff2500,#ff0100', '−73 °C', '77 °C'],
    text: 'How hot the ground itself is in daylight, which can be far hotter than the air above it. Purple and blue ground is frozen hard, green is near freezing, yellow is warm, and orange and red are scorching. Gaps were under cloud on every pass.' },
  { id: 'soil', g: 'Land', name: 'Soil moisture', parts: [['SMAP_L4_Analyzed_Surface_Soil_Moisture', 1, 1]], fine: 90,
    bar: ['#ffa200,#ffd000,#fffb00,#9acc00,#249100,#00ab57,#00e9d3,#00beff,#0047ff,#0000e2,#00009a', 'Dry', 'Soaked'],
    text: 'How wet the top few centimetres of soil are, from NASA’s SMAP satellite blended with a weather model. Orange and yellow soil is dry, green is damp, and blue is soaked. NASA publishes this one about three days late.' },
  { id: 'ndvi', g: 'Land', name: 'Vegetation', parts: [['VIIRS_NOAA20_NDVI_8Day', 1, 1, 'VIIRS_NOAA21_NDVI_8Day']], fine: 11.25,
    bar: ['#e1d2c6,#b09f8f,#9a6e5a,#80b006,#438d01,#0a6901,#002401', 'Bare', 'Dense forest'],
    text: 'How green and leafy the land is, averaged over the eight days up to the date below. Pale and brown land is bare, green land is growing, and the darkest green is dense forest.' },
  { id: 'flood', g: 'Land', name: 'Floods', tone: 'flood', parts: [['VIIRS_Combined_Flood_2-Day', 2]], fine: 11.25,
    keys: [['#fa1e24', 'Flood'], ['#ffff00', 'Floods most years'], ['#32d2f5', 'Usual water'], ['rgba(175,175,175,.45)', 'Not seen']],
    text: 'Water lying where there is normally dry land, as two satellites saw it over the last two days. Grey could not be checked, because of cloud or steep hills. Floods are small from this far out: zoom in on a river or a coast.' },
  { id: 'night', g: 'Land', name: 'Lights last night', tone: 'lights', fine: 11.25,
    parts: [['VIIRS_NOAA20_GapFilled_BRDF_Corrected_DayNightBand_Radiance', 1, 1, ['VIIRS_NOAA20_DayNightBand_At_Sensor_Radiance', 2]]],
    bar: ['rgba(255,214,150,0),#ffdc9c,#fff0d8,#fffaf2', 'Dim', 'Bright'],
    text: 'Light from towns, roads, gas flares and fishing fleets, measured by a camera in orbit on its latest night passes, with moonlight taken out. A city that has lost its power after a storm or an earthquake shows as a dark gap where there was light.' }
];
const OVERLAY_GROUPS = ['Weather', 'Sea', 'Air', 'Land'];
const MARKER_KEYS = Object.keys(LAYERS).filter(k => LAYERS[k].shape != null);
const EONET_MAP = { wildfires: 'fires', severeStorms: 'storms', volcanoes: 'volcanoes', seaLakeIce: 'ice' };
const EVENT_KEYS = ['fires', 'storms', 'volcanoes', 'ice', 'other'];
const SAT_KEYS = Object.keys(LAYERS).filter(k => LAYERS[k].sat);
const DENSE = { starlink: 1, constel: 1, sats: 1, debris: 1, rockets: 1, dead: 1 };
const JUNK = { debris: 1, rockets: 1, dead: 1 };                                   /* loaded on request, not with the active catalogue */          /* too crowded to click through when they sit over the globe */
const PICK_ORDER = ['stations', 'dsn', 'launches', 'storms', 'volcanoes', 'alerts', 'warnings', 'news', 'quakes', 'fires', 'fireballs', 'ice', 'other', 'nuclear', 'lng', 'hydro', 'coal', 'gas', 'solar', 'wind', 'wildlife', 'sounds', 'cities', 'radio', 'cams', 'nav', 'geo', 'hotspots', 'constel', 'sats', 'starlink', 'rockets', 'dead', 'debris'];

const SWATCH_AS = { pastlaunch: 'launches', mostread: 'news' };
function swatch(key) {
  const L = LAYERS[SWATCH_AS[key] || key] || { color: '#f5f5f7', shape: 0 }, c = L.color;
  let inner;
  if (L.line) inner = '<path d="M1.5 10.5c3-6 6 2 11-7" fill="none" stroke="' + c + '" stroke-width="1.5" stroke-linecap="round"/>';
  else if (L.tex) inner = '<rect x="2" y="2" width="10" height="10" rx="3" fill="' + c + '" fill-opacity=".85"/>';
  else if (L.flow) inner = '<path d="M1.5 4.5h7a2 2 0 1 0-2-2M1.5 8h10M1.5 11.5h5a1.8 1.8 0 1 1-1.8 1.8" fill="none" stroke="' + c + '" stroke-width="1.3" stroke-linecap="round"/>';
  else if (L.glow) inner = '<path d="M2 11c1-6 9-6 10 0" fill="none" stroke="' + c + '" stroke-width="2.2" stroke-linecap="round"/>';
  else if (L.halo) inner = '<circle cx="7" cy="7" r="2.6" fill="' + c + '"/><circle cx="7" cy="7" r="5.4" fill="none" stroke="' + c + '" stroke-opacity=".5"/>';
  else if (L.small && L.shape === 4) inner = '<rect x="3" y="5.5" width="3.2" height="3.2" fill="' + c + '"/><rect x="8" y="8.5" width="3.2" height="3.2" fill="' + c + '"/>';
  else if (L.small && L.shape === 2) inner = '<path d="M4 6.5 6 4.5 8 6.5 6 8.5ZM8.5 10 10.5 8 12.5 10 10.5 12Z" fill="' + c + '"/>';
  else if (L.small) inner = '<circle cx="4.5" cy="9" r="1.6" fill="' + c + '"/><circle cx="8.5" cy="5" r="1.6" fill="' + c + '"/><circle cx="10.5" cy="10" r="1.6" fill="' + c + '"/>';
  else if (L.shape === 1) inner = '<circle cx="7" cy="7" r="4.6" fill="' + c + '" fill-opacity=".18" stroke="' + c + '" stroke-width="1.6"/>';
  else if (L.shape === 2) inner = '<path d="M7 1.8 12.2 7 7 12.2 1.8 7Z" fill="' + c + '"/>';
  else if (L.shape === 3) inner = '<path d="M7 2 12.4 11.6H1.6Z" fill="' + c + '"/>';
  else if (L.shape === 4) inner = '<rect x="2.6" y="2.6" width="8.8" height="8.8" rx="1.2" fill="' + c + '"/>';
  else if (L.shape === 5) inner = '<path d="M7 1c.6 3.6 2.4 5.4 6 6-3.6.6-5.4 2.4-6 6-.6-3.6-2.4-5.4-6-6 3.6-.6 5.4-2.4 6-6Z" fill="' + c + '"/>';
  else if (L.shape === 6) inner = '<path d="M3.9 1.7h6.200L13.200 7l-3.100 5.300H3.900L.8 7Z" fill="' + c + '" fill-opacity=".2" stroke="' + c + '" stroke-width="1.4" stroke-linejoin="round"/><circle cx="7" cy="7" r="1.7" fill="' + c + '"/>';
  else inner = '<circle cx="7" cy="7" r="4.4" fill="' + c + '"/>';
  return '<svg class="swatch" viewBox="0 0 14 14" aria-hidden="true">' + inner + '</svg>';
}

const prefs = Object.assign({ on: {}, win: 'day', tab: 'layers' }, store.get('prefs') || {});
const savePrefs = () => store.set('prefs', prefs);
const isOn = key => (prefs.on[key] == null ? !LAYERS[key].off : prefs.on[key]);

/* major cities, ordered so the first few dozen spread across the globe */
const CITIES = [
  ['Tokyo', 35.68, 139.69], ['Delhi', 28.61, 77.21], ['New York', 40.71, -74.01], ['São Paulo', -23.55, -46.63], ['London', 51.51, -0.13],
  ['Cairo', 30.04, 31.24], ['Beijing', 39.90, 116.41], ['Mexico City', 19.43, -99.13], ['Lagos', 6.52, 3.38], ['Moscow', 55.76, 37.62],
  ['Sydney', -33.87, 151.21], ['Los Angeles', 34.05, -118.24], ['Mumbai', 19.08, 72.88], ['Jakarta', -6.21, 106.85], ['Johannesburg', -26.20, 28.05],
  ['Paris', 48.86, 2.35], ['Istanbul', 41.01, 28.98], ['Buenos Aires', -34.60, -58.38], ['Shanghai', 31.23, 121.47], ['Dubai', 25.20, 55.27],
  ['Nairobi', -1.29, 36.82], ['Singapore', 1.35, 103.82], ['Toronto', 43.65, -79.38], ['Lima', -12.05, -77.04], ['Tehran', 35.69, 51.39],
  ['Seoul', 37.57, 126.98], ['Kinshasa', -4.44, 15.27], ['Chicago', 41.88, -87.63], ['Bangkok', 13.76, 100.50], ['Madrid', 40.42, -3.70],
  ['Karachi', 24.86, 67.01], ['Bogotá', 4.71, -74.07], ['Honolulu', 21.31, -157.86], ['Auckland', -36.85, 174.76], ['Cape Town', -33.92, 18.42],
  ['Berlin', 52.52, 13.41], ['Dhaka', 23.81, 90.41], ['Manila', 14.60, 120.98], ['Rio de Janeiro', -22.91, -43.17], ['Riyadh', 24.71, 46.68],
  ['Anchorage', 61.22, -149.90], ['Reykjavik', 64.15, -21.94], ['Perth', -31.95, 115.86], ['Santiago', -33.45, -70.67], ['Kolkata', 22.57, 88.36],
  ['Hong Kong', 22.32, 114.17], ['Rome', 41.90, 12.50], ['Addis Ababa', 9.03, 38.74], ['Vancouver', 49.28, -123.12], ['Novosibirsk', 55.01, 82.93],
  ['Bengaluru', 12.97, 77.59], ['Chennai', 13.08, 80.27], ['Hyderabad', 17.39, 78.49], ['Lahore', 31.55, 74.34], ['Osaka', 34.69, 135.50],
  ['Melbourne', -37.81, 144.96], ['Baghdad', 33.31, 44.37], ['Dar es Salaam', -6.79, 39.21], ['Khartoum', 15.50, 32.56], ['Casablanca', 33.57, -7.59],
  ['Algiers', 36.75, 3.06], ['Accra', 5.60, -0.19], ['Abidjan', 5.36, -4.01], ['Dakar', 14.72, -17.47], ['Luanda', -8.84, 13.23],
  ['Tel Aviv', 32.09, 34.78], ['Ankara', 39.93, 32.86], ['Kyiv', 50.45, 30.52], ['Warsaw', 52.23, 21.01], ['Vienna', 48.21, 16.37],
  ['Stockholm', 59.33, 18.07], ['Oslo', 59.91, 10.75], ['Helsinki', 60.17, 24.94], ['Amsterdam', 52.37, 4.90], ['Lisbon', 38.72, -9.14],
  ['Athens', 37.98, 23.73], ['Dublin', 53.35, -6.26], ['Zurich', 47.38, 8.54], ['Kabul', 34.56, 69.21], ['Tashkent', 41.30, 69.24],
  ['Almaty', 43.24, 76.89], ['Ulaanbaatar', 47.89, 106.91], ['Kathmandu', 27.72, 85.32], ['Colombo', 6.93, 79.86], ['Yangon', 16.84, 96.17],
  ['Hanoi', 21.03, 105.85], ['Ho Chi Minh City', 10.82, 106.63], ['Kuala Lumpur', 3.14, 101.69], ['Taipei', 25.03, 121.57], ['Guangzhou', 23.13, 113.26],
  ['Chengdu', 30.57, 104.07], ['San Francisco', 37.77, -122.42], ['Seattle', 47.61, -122.33], ['Denver', 39.74, -104.99], ['Houston', 29.76, -95.37],
  ['Miami', 25.76, -80.19], ['Washington', 38.91, -77.04], ['Montreal', 45.50, -73.57], ['Havana', 23.11, -82.37], ['Panama City', 8.98, -79.52],
  ['Caracas', 10.48, -66.90], ['Quito', -0.18, -78.47], ['La Paz', -16.49, -68.12], ['Brasília', -15.79, -47.88], ['Montevideo', -34.90, -56.16],
  ['Vladivostok', 43.12, 131.89], ['Nuuk', 64.18, -51.72], ['Port Moresby', -9.44, 147.18], ['Suva', -18.14, 178.44], ['Antananarivo', -18.88, 47.51],
  ['Ahmedabad', 23.02, 72.57], ['Pune', 18.52, 73.86]
];
