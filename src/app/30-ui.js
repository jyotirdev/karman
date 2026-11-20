/* ============================================================
   Interface state
   ============================================================ */
let selected = null;
const dirty = { summary: true, feed: true, news: true, sources: true };
const inspector = $('#inspector'), summaryEl = $('#summary'), detailEl = $('#detail');
const sun = { lat: 0, lon: 0 }, moon = { lat: 0, lon: 0, frac: 0, name: '' };
const PSEUDO = { pastlaunch: 'Recent rocket launch', mostread: 'Most read on Wikipedia', place: 'Place', swx: 'Sun and space weather', flybys: 'Asteroid flybys', swxalert: 'Space weather alert', orbit: 'Everything in orbit', listen: 'Listen', co2: 'Carbon dioxide' };
const kindOf = it => it.kind || (LAYERS[it.layer] ? LAYERS[it.layer].one : PSEUDO[it.layer]) || 'Details';
const extra = {};                                   /* non-marker item lists: extra.swxalert, extra.flybys */
const findItem = (layer, id) => (layers[layer] ? layers[layer].items : []).concat(extra[layer] || []).find(it => String(it.id) === String(id));

function nearestCity(lat, lon) {
  let best = null, bd = 1e9;
  for (const c of CITIES) { const d = gcKm(lat, lon, c[1], c[2]); if (d < bd) { bd = d; best = c; } }
  return bd < 2500 ? (bd < 30 ? 'In ' + best[0] : num(bd) + ' km from ' + best[0]) : null;
}

/* ---------- sources ---------- */
const SOURCES = {
  usgs:   { label: 'USGS', what: 'Earthquakes from the U.S. Geological Survey', url: 'https://earthquake.usgs.gov/earthquakes/map/' },
  eonet:  { label: 'NASA EONET', what: 'Wildfires, storms, volcanoes and sea ice', url: 'https://eonet.gsfc.nasa.gov/' },
  gdacs:  { label: 'GDACS', what: 'UN and EU disaster alerts: cyclones, floods, droughts, volcanoes, fires', url: 'https://www.gdacs.org/' },
  sats:   { label: 'CelesTrak', what: 'Orbits of the space stations and every active satellite', url: 'https://celestrak.org/' },
  swpc:   { label: 'NOAA SWPC', what: 'Aurora forecast, geomagnetic activity, solar wind and space weather alerts', url: 'https://www.swpc.noaa.gov/' },
  ll2:    { label: 'Launch Library', what: 'Upcoming rocket launches and the people in space', url: 'https://thespacedevs.com/llapi' },
  meteo:  { label: 'Open-Meteo', what: 'City weather, the wind field, air quality and place search', url: 'https://open-meteo.com/' },
  osm:    { label: 'OpenStreetMap', what: 'Names for any point you click, from Nominatim', url: 'https://www.openstreetmap.org/copyright', lazy: true },
  wiki:   { label: 'Wikipedia', what: 'World news from the Current events portal, and articles near a place', url: 'https://en.wikipedia.org/wiki/Portal:Current_events' },
  radio:  { label: 'Radio Browser', what: 'Live radio stations around the world', url: 'https://www.radio-browser.info/' },
  jpl:    { label: 'NASA JPL', what: 'Fireballs and asteroid close approaches', url: 'https://cneos.jpl.nasa.gov/' },
  clouds: { label: 'EUMETSAT', what: 'Near-live cloud cover via Matt Eason’s live cloud maps. Contains modified EUMETSAT data.', url: 'https://github.com/matteason/live-cloud-maps' }
};
const CREDITS = [
  ['Natural Earth', 'Land outline and country borders', 'https://www.naturalearthdata.com/'],
  ['NASA Earth Observatory', 'Night lights (Black Marble) and elevation', 'https://earthobservatory.nasa.gov/features/NightLights'],
  ['Peter Bird, 2003', 'Plate boundary model, converted by Hugo Ahlenius, Nordpil', 'https://github.com/fraxen/tectonicplates']
];
function setStatus(key, state, note) {
  const s = SOURCES[key];
  s.state = state; s.note = note || ''; if (state === 'ok') s.at = Date.now();
  dirty.sources = true;
  const dead = ['usgs', 'eonet', 'sats', 'meteo'].every(k => SOURCES[k].state === 'err');
  const b = $('#banner');
  b.hidden = !dead;
  if (dead) b.textContent = 'The live feeds cannot be reached from here. Open this file in your own browser with an internet connection and the data will load.';
}
/* mark a feed as healthy, noting when a backup provider or a saved copy stood in */
function okStatus(src, data) {
  if (data && data.__stale) setStatus(src, 'warn', 'provider unreachable, showing a copy saved ' + ago(data.__stale));
  else setStatus(src, 'ok', SOURCES[src].via ? 'backup: ' + SOURCES[src].via : '');
}
const stateWord = s => (s.state === 'ok' ? (s.note ? s.note + ', ' : '') + (s.at ? 'updated ' + ago(s.at) : 'live') : s.state === 'load' ? (s.at ? 'refreshing' : 'connecting') : s.state === 'err' ? (s.note || 'unreachable')
  : s.state === 'warn' ? s.note : s.state === 'off' ? 'layer is off' : s.lazy ? 'loads on demand' : 'waiting');
function renderSources() {
  const keys = Object.keys(SOURCES);
  let live = 0, bad = 0;
  for (const k of keys) { if (SOURCES[k].state === 'ok') live++; else if (SOURCES[k].state === 'err') bad++; }
  $('#src-summary').innerHTML = '<i class="dot" data-state="' + (bad ? (live ? 'warn' : 'err') : live ? 'ok' : 'load') + '"></i>' + keys.length + ' sources, ' + live + ' live' + (bad ? ', ' + bad + ' unreachable' : '');
  $('#tab-sources').innerHTML = '<p class="hint">Every feed is public and needs no key. A red dot means that provider could not be reached from this browser.</p>' +
    keys.map(k => { const s = SOURCES[k]; return '<a class="src" href="' + esc(s.url) + '" target="_blank" rel="noopener"><i class="dot" data-state="' + (s.state || 'idle') + '"></i><span><span class="t">' + esc(s.label) +
      '<small>' + esc(stateWord(s)) + '</small></span><span class="s">' + esc(s.what) + '</span></span></a>'; }).join('') +
    '<h3>Built-in map data</h3>' + CREDITS.map(c => '<a class="src" href="' + c[2] + '" target="_blank" rel="noopener"><i class="dot" data-state="static"></i><span><span class="t">' + c[0] + '</span><span class="s">' + c[1] + '</span></span></a>').join('');
}

/* ---------- selection ---------- */
function select(item, opts) {
  if (selected && selected !== item && typeof onDeselect === 'function') onDeselect(selected);
  if (item && item.l1 && !item.rec && window.satellite) { try { item.rec = satellite.twoline2satrec(item.l1, item.l2); } catch (e) {} }
  if (item && item.rec && item.lat == null) { const st = satState(item.rec, new Date()); if (st) Object.assign(item, st); }
  selected = item || null;
  $('#reticle').innerHTML = $('#reticle').innerHTML;      /* restart the lock-on animation */
  renderDetail();
  detailEl.classList.remove('enter'); void detailEl.offsetWidth; detailEl.classList.add('enter');
  markSelectedRows();
  if (item && item.lat != null && !(opts && opts.stay)) flyTo(item.lat, item.lon);
  if (item && typeof onSelect === 'function') onSelect(item);
}
function markSelectedRows() {
  const id = selected ? selected.layer + ':' + selected.id : '';
  $$('[data-sel]').forEach(el => el.classList.toggle('is-sel', el.dataset.sel === id));
}
function applyItems(key, items) {
  layers[key].set(items);
  setCount(key, items.length.toLocaleString());
  if (key === 'other') { const r = $('[data-layer="other"]'); if (r) r.hidden = !items.length; }
  if (selected && selected.layer === key) {
    const again = items.find(it => String(it.id) === String(selected.id));
    if (again) { Object.assign(again, { extraData: selected.extraData }); selected = again; if (!LAYERS[key].small) renderDetail(); }
    else select(null);
  }
  dirty.summary = true; if (FEED_KEYS[key]) dirty.feed = true;
}
const FEED_KEYS = { quakes: 1, fires: 1, storms: 1, volcanoes: 1, ice: 1, other: 1, alerts: 1, warnings: 1, fireballs: 1, launches: 1 };
function setCount(key, text) { const el = $('#count-' + key); if (el) el.textContent = text; }
function setCountLoading(key) { const el = $('#count-' + key); if (el && !/\d/.test(el.textContent)) el.innerHTML = '<i class="spin"></i>'; }
const SK = (w, h) => '<span class="skel" style="width:' + w + 'px' + (h ? ';height:' + h + 'px' : '') + '"></span>';

/* ---------- building blocks ---------- */
function kv(rows) {
  return '<dl class="kv">' + rows.filter(Boolean).map(r => '<div><dt>' + esc(r[0]) + '</dt><dd' + (r[2] ? ' ' + r[2] : '') + '>' + r[1] + '</dd></div>').join('') + '</dl>';
}
const live = k => 'data-live="' + k + '"';
const slotAttr = k => 'data-slot="' + k + '"';
const agoSpan = t => '<span data-t="' + t + '">' + ago(t) + '</span>';
const untilSpan = t => '<span data-until="' + t + '">' + until(t) + '</span>';
function row(item, title, sub, tag) {
  return '<button class="row" data-sel="' + esc(item.layer + ':' + item.id) + '">' + swatch(item.layer) +
    '<span><span class="t">' + title + '</span><span class="s">' + (tag ? esc(tag) + ', ' : '') + sub + '</span></span></button>';
}
const link = (url, text) => (safeUrl(url) ? '<a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(text) + '</a>' : '');
function slot(item, name, html) {
  if (selected !== item) return;
  const el = $('[data-slot="' + name + '"]', detailEl);
  if (el) { el.innerHTML = html; el.hidden = !html; }
}
/* a small area chart, e.g. 24 hours of temperature */
function spark(vals, labelFn, dotLast) {
  const w = 280, h = 54, min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
  const pt = (v, i) => [(i / (vals.length - 1) * (w - 8) + 4).toFixed(1), (h - 14 - (v - min) / span * (h - 26)).toFixed(1)];
  const line = vals.map((v, i) => (i ? 'L' : 'M') + pt(v, i).join(' ')).join(' ');
  const iMax = vals.indexOf(max), iMin = vals.indexOf(min), a = pt(max, iMax), b = pt(min, iMin);
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(labelFn(min) + ' to ' + labelFn(max)) + '">' +
    '<path d="' + line + ' L' + (w - 4) + ' ' + (h - 12) + ' L4 ' + (h - 12) + 'Z" fill="rgba(255,255,255,.07)"/><path d="' + line + '" fill="none" stroke="#f5f5f7" stroke-width="1.4" stroke-linejoin="round"/>' +
    '<circle cx="' + pt(vals[dotLast ? vals.length - 1 : 0], dotLast ? vals.length - 1 : 0)[0] + '" cy="' + pt(vals[dotLast ? vals.length - 1 : 0], dotLast ? vals.length - 1 : 0)[1] + '" r="2.6" fill="#f5f5f7"/>' +
    '<text x="' + clamp(+a[0], 14, w - 14) + '" y="' + (+a[1] - 5) + '" text-anchor="middle">' + esc(labelFn(max)) + '</text>' +
    '<text x="' + clamp(+b[0], 14, w - 14) + '" y="' + (h - 1) + '" text-anchor="middle">' + esc(labelFn(min)) + '</text></svg>';
}
function bars(vals, max, colorFn) {
  const w = 280, h = 56, bw = (w - (vals.length - 1) * 3) / vals.length;
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' + vals.map((v, i) => {
    const bh = Math.max(2, v / max * (h - 14));
    return '<rect x="' + (i * (bw + 3)).toFixed(1) + '" y="' + (h - bh).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="2" fill="' + colorFn(v) + '"/>' +
      '<text x="' + (i * (bw + 3) + bw / 2).toFixed(1) + '" y="' + (h - bh - 3).toFixed(1) + '" text-anchor="middle">' + v.toFixed(1) + '</text>';
  }).join('') + '</svg>';
}


/* ---------- plain-language explanations ---------- */
const onLand = it => it.layer === 'cities' || isLand(it.lat, it.lon);          /* the land mask is coarse; a named city is always land */
const quakeWord = m => (m < 3 ? 'very small' : m < 4 ? 'minor' : m < 5 ? 'light' : m < 6 ? 'moderate' : m < 7 ? 'strong' : m < 8 ? 'major' : 'great');
const quakeMeaning = m => (m < 3 ? 'Too small for most people to feel. Only instruments notice it.' : m < 4 ? 'Felt by some people nearby. It almost never causes damage.'
  : m < 5 ? 'Felt by most people nearby. It can rattle windows and shelves, but damage is rare.' : m < 6 ? 'Can damage weak buildings close to its centre.'
  : m < 7 ? 'Can cause serious damage in towns and cities near its centre.' : m < 8 ? 'A major earthquake that can cause heavy damage over a wide area.' : 'One of the largest kinds of earthquake, able to destroy communities near its centre.');
function tnt(m) {
  const tons = Math.pow(10, 1.5 * m + 4.8) / 4.184e9;
  return tons < 1 ? num(tons * 1000) + ' kg' : tons < 1000 ? num(tons) + ' tonnes' : tons < 1e6 ? (tons / 1000).toFixed(tons < 1e4 ? 1 : 0) + ' thousand tonnes' : (tons / 1e6).toFixed(tons < 1e7 ? 1 : 0) + ' million tonnes';
}
const stormClass = k => (k < 34 ? 'Tropical depression: an organised storm with winds under 63 km/h.' : k < 64 ? 'Tropical storm: strong enough to be given a name, with winds of 63 to 118 km/h.'
  : 'Category ' + (k < 83 ? 1 : k < 96 ? 2 : k < 113 ? 3 : k < 137 ? 4 : 5) + ' on the five-step hurricane scale' + (k >= 96 ? ', which counts as a major storm.' : '.'));
function orbitWord(rec) {
  const revs = rec.no * 1440 / (2 * Math.PI);
  return revs > 11.25 ? 'Low Earth orbit: close to the planet, circling it about ' + Math.round(revs) + ' times a day.' : revs > 1.1 ? 'Medium Earth orbit: far above the space stations, circling about ' + revs.toFixed(1) + ' times a day.'
    : revs > 0.9 ? 'Geostationary orbit: it circles once a day, in step with the Earth’s spin, so it stays over one region.' : 'A very high orbit, taking more than a day to go round once.';
}
function explain(it) {
  const L = LAYERS[it.layer];
  switch (it.layer) {
    case 'quakes': return cap(quakeWord(it.mag)) + ' earthquake. ' + quakeMeaning(it.mag) + ' It released about as much energy as ' + tnt(it.mag) + ' of TNT.';
    case 'storms': return (it.magUnit === 'kts' && it.mag != null ? stormClass(it.mag) + ' ' : '') + L.about;
    case 'alerts': return L.about;
    case 'stations': return it.id === 25544 ? 'A laboratory about the size of a football pitch where astronauts live and work. It circles the Earth roughly 16 times a day, fast enough to cross a continent in minutes.'
      : 'China’s space station, usually home to three astronauts. Like the ISS it circles the Earth roughly 16 times a day.';
    case 'launches': return 'A rocket scheduled to lift off from this pad. Launch times often slip because of weather or technical checks, so the countdown can change.';
    case 'news': return 'A summary written by Wikipedia editors for its Current events page. The marker sits on the first place the story mentions, which can be approximate.';
    case 'radio': return 'A live internet stream from this station. You will hear static while it tunes in. Once you are listening, clicking another station switches to it.';
    case 'place': case 'cities': return 'Live conditions for this spot. Air quality uses the US index: under 50 is good, 51 to 100 is acceptable, and above 150 is unhealthy for everyone.';
    case 'flybys': return 'Distances are given in Moon distances: 1 is as far away as the Moon (384,000 km).';
    case 'debris': case 'rockets': return junkStory(it) + (it.rec ? ' ' + orbitWord(it.rec) : '');
    case 'nuclear': return nukeExplain(it);
    case 'sounds': return 'A recording uploaded to iNaturalist and identified by its community. You will hear static while it loads.';
    default: return SAT_KEYS.includes(it.layer) ? L.about + (it.rec ? ' ' + orbitWord(it.rec) : '') : L ? L.about : it.explain || '';
  }
}
function renderGuide() {
  let h = '<p class="hint">Kármán is named after the Kármán line, 100 km above the sea, where the sky is said to end and space to begin. This is the planet as it is right now, seen from there. Below: what everything on the globe means, in plain words.</p>' +
    '<h3>Getting around</h3><ul class="how">' +
    '<li><b>Drag</b> to turn the globe. <b>Scroll</b> or pinch to zoom. Double-click to zoom in on a spot.</li>' +
    '<li><b>Click any marker</b> to see what it is. A marker that pulses is new or urgent.</li>' +
    '<li><b>Click any place</b> on land or sea for its weather, local time and what is happening nearby.</li>' +
    '<li><b>Search</b> for a city, a country or a satellite by name.</li>' +
    '<li>Satellites crowd the sky, so click them where they show against black space, or find one by name.</li>' +
    '<li>The dark half of the globe is where it is night right now.</li></ul>';
  for (const g of GROUPS) {
    h += '<h3>' + g[1] + '</h3>';
    for (const key of Object.keys(LAYERS)) { const L = LAYERS[key]; if (L.g === g[0] && key !== 'other') h += '<div class="guide">' + swatch(key) + '<span><b>' + L.name + '</b>' + esc(L.about) + '</span></div>'; }
  }
  $('#tab-guide').innerHTML = h;
}
renderGuide();

/* ---------- detail views ---------- */
const kpWord = k => (k >= 9 ? 'Extreme storm (G5)' : k >= 8 ? 'Severe storm (G4)' : k >= 7 ? 'Strong storm (G3)' : k >= 6 ? 'Moderate storm (G2)' : k >= 5 ? 'Minor storm (G1)' : k >= 4 ? 'Active' : k >= 3 ? 'Unsettled' : 'Quiet');
const kpColor = k => (k >= 7 ? '#ff453a' : k >= 5 ? '#ff9f0a' : k >= 4 ? '#ffd60a' : '#30d158');

const DETAILS = {
  quakes(it) {
    return {
      title: '<div class="big">M ' + it.mag.toFixed(1) + '</div><p>' + esc(it.place) + '</p>' +
        '<div class="scale" aria-hidden="true"><i style="left:' + clamp(it.mag / 9 * 100, 0, 100).toFixed(1) + '%"></i></div>',
      rows: [
        ['Strength', cap(quakeWord(it.mag))],
        ['When', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
        ['Depth', it.depth == null ? 'Unknown' : it.depth.toFixed(1) + ' km' + (it.depth < 70 ? ', shallow, so shaking is stronger' : it.depth < 300 ? ', intermediate' : ', deep, so shaking is weaker')],
        ['Location', esc(fmtLL(it.lat, it.lon))],
        nearestCity(it.lat, it.lon) ? ['Nearest big city', esc(nearestCity(it.lat, it.lon))] : null,
        it.felt ? ['Felt reports', num(it.felt)] : null,
        it.alert ? ['Impact alert', '<span class="chip" style="--c:' + ({ green: '#30d158', yellow: '#ffd60a', orange: '#ff9f0a', red: '#ff453a' }[it.alert] || '#8e8e93') + '">' + esc(cap(it.alert)) + '</span>'] : null,
        it.tsunami ? ['Tsunami', 'Check tsunami.gov for advisories'] : null,
        it.sig ? ['Significance', num(it.sig) + ' of 1,000'] : null,
        ['Review status', esc(cap(it.status || 'unknown'))]
      ],
      actions: link(it.url, /seismicportal/.test(it.url || '') ? 'Open on EMSC' : 'Open on USGS')
    };
  },
  event(it) {
    return {
      title: '<div class="big word">' + esc(it.title) + '</div>',
      rows: [
        ['Last reported', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
        ['Location', esc(fmtLL(it.lat, it.lon))],
        nearestCity(it.lat, it.lon) ? ['Nearest big city', esc(nearestCity(it.lat, it.lon))] : null,
        it.mag != null ? [it.magUnit === 'kts' ? 'Wind speed' : it.magUnit === 'acres' ? 'Area burned' : 'Size',
          it.magUnit === 'kts' ? num(it.mag) + ' kts (' + num(it.mag * 1.852) + ' km/h)' : num(it.mag) + ' ' + esc(it.magUnit || '')] : null,
        it.track && it.track.length > 1 ? ['Tracked positions', String(it.track.length)] : null
      ],
      actions: (it.sources || []).map(s => link(s.url, 'Source: ' + s.id)).join('')
    };
  },
  alerts(it) {
    return {
      title: '<div class="big word">' + esc(it.title) + '</div>' + (it.desc ? '<p>' + esc(it.desc) + '</p>' : ''),
      rows: [
        ['Alert level', '<span class="chip" style="--c:' + (it.level === 'Red' ? '#ff453a' : '#ff9f0a') + '">' + esc(it.level) + '</span>'],
        it.severity ? ['Severity', esc(it.severity)] : null,
        it.country ? ['Where', esc(it.country)] : null,
        ['Started', esc(fmtTime(it.from))],
        ['Last update', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
        ['Location', esc(fmtLL(it.lat, it.lon))]
      ],
      actions: link(it.url, 'Open the GDACS report')
    };
  },
  fireballs(it) {
    return {
      title: '<div class="big word">Fireball over ' + esc(isLand(it.lat, it.lon) ? 'land' : 'the ocean') + '</div><p>A meteor bright enough to be picked up by US government sensors.</p>',
      rows: [
        ['When', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
        ['Location', esc(fmtLL(it.lat, it.lon))],
        nearestCity(it.lat, it.lon) ? ['Nearest big city', esc(nearestCity(it.lat, it.lon))] : null,
        it.impact != null ? ['Impact energy', it.impact + ' kt of TNT'] : null,
        it.alt != null ? ['Exploded at', it.alt + ' km up'] : null,
        it.vel != null ? ['Speed', it.vel + ' km/s'] : null
      ],
      actions: link('https://cneos.jpl.nasa.gov/fireballs/', 'Open the NASA fireball log')
    };
  },
  stations(it) {
    const crew = space.people;
    return {
      title: '<div class="big word">' + esc(it.title) + '</div><p>Position computed live from its published orbit.</p>',
      rows: [
        ['Over', SK(120), live('sel-pos')], ['Altitude', SK(60), live('sel-alt')], ['Speed', SK(80), live('sel-speed')], ['Lighting', SK(80), live('sel-light')],
        ['One orbit takes', it.period ? it.period.toFixed(1) + ' min' : 'About 92 min'],
        it.epoch ? ['Orbit data from', agoSpan(it.epoch)] : null
      ],
      extra: (it.id === 25544 ? '<div ' + slotAttr('docked') + '><h3>Docked right now</h3><ul class="plain"><li>' + SK(150) + SK(60) + '</li><li>' + SK(120) + SK(60) + '</li></ul></div>' : '') +
        (crew && crew.length ? '<h3>' + crew.length + ' people in space right now</h3><ul class="plain">' + crew.map(p => '<li>' + esc(p.name) + '<small>' + esc(p.agency) + '</small></li>').join('') + '</ul>' : ''),
      actions: it.id === 25544 ? link('https://spotthestation.nasa.gov/', 'See it from your city') : ''
    };
  },
  sat(it) {
    const r = it.rec || { no: 1, inclo: 0 };
    const yr = /^\d\d/.test(it.intl || '') ? (+it.intl.slice(0, 2) < 57 ? 2000 : 1900) + +it.intl.slice(0, 2) : null;
    return {
      title: '<div class="big word">' + esc(it.title) + '</div>',
      rows: [
        ['Over', SK(120), live('sel-pos')], ['Altitude', SK(60), live('sel-alt')], ['Speed', SK(80), live('sel-speed')], ['Lighting', SK(80), live('sel-light')],
        ['One orbit takes', (2 * Math.PI / r.no).toFixed(1) + ' min'],
        it.rec ? ['Lowest and highest point', orbitSpan(r)] : null,
        it.rec ? ['Orbit last measured', agoSpan(recEpoch(r))] : null,
        ['Tilt of the orbit', (r.inclo * R2D).toFixed(1) + '°' + (r.inclo * R2D > 96 && r.inclo * R2D < 102 ? ', passing near both poles' : r.inclo * R2D < 12 ? ', staying near the equator' : '')],
        ['Kind', SK(110), slotAttr('sc-kind')],
        ['Owner', SK(120), slotAttr('sc-owner')],
        ['Launched', yr ? String(yr) : SK(90), slotAttr('sc-launch')],
        ['Size', SK(80), slotAttr('sc-size')],
        ['Catalogue number', esc(it.id)]
      ],
      actions: '<button class="btn" data-open="orbit">Everything in orbit</button>' + link('https://www.n2yo.com/satellite/?s=' + encodeURIComponent(it.id), 'Open on N2YO')
    };
  },
  launches(it) {
    return {
      title: (it.img ? '<img class="thumb" src="' + esc(it.img) + '" alt="" loading="lazy">' : '') + '<div class="big word">' + esc(it.title) + '</div>' +
        '<p class="count mono">' + untilSpan(it.time) + '</p>' + (it.desc ? '<p>' + esc(it.desc) + '</p>' : ''),
      rows: [
        ['Lift-off', esc(fmtTime(it.time))],
        ['Status', esc(it.status || 'Unknown')],
        it.provider ? ['Operator', esc(it.provider)] : null,
        it.rocket ? ['Rocket', esc(it.rocket)] : null,
        it.orbit ? ['Target orbit', esc(it.orbit)] : null,
        ['Pad', esc(it.pad || 'Unknown')],
        it.site ? ['Site', esc(it.site)] : null
      ],
      actions: link(it.video, 'Watch') + link(it.info, 'Mission page')
    };
  },
  news(it) {
    return {
      title: '<div class="big word news">' + esc(it.title) + '</div>',
      rows: [
        ['Topic', esc(it.cat || 'World')],
        ['Listed', esc(it.dateLabel)],
        it.lat != null ? ['Placed at', esc(it.placeName || fmtLL(it.lat, it.lon))] : ['Placed at', 'No location found for this story']
      ],
      extra: it.links.length ? '<h3>Background on Wikipedia</h3><div class="links">' + it.links.slice(0, 6).map(l => link('https://en.wikipedia.org/wiki/' + encodeURIComponent(l.replace(/ /g, '_')), l)).join('') + '</div>' : '',
      actions: link(it.src && it.src.url, 'Read the report' + (it.src && it.src.name ? ' at ' + it.src.name : ''))
    };
  },
  radio(it) {
    const tags = String(it.tags || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
    const near = layers.radio.items.filter(x => x !== it).map(x => [gcKm(it.lat, it.lon, x.lat, x.lon), x]).sort((a, b) => a[0] - b[0]).slice(0, 4);
    return {
      title: '<div class="station">' + (it.icon ? '<img class="logo" src="' + esc(it.icon) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<div><div class="big word">' + esc(it.title) + '</div><p>' + esc([it.state, it.country].filter(Boolean).join(', ') || 'Radio station') + '</p></div></div>' +
        '<div class="tuner"><button class="btn primary" id="radio-play">Listen live</button><span class="eq" id="radio-eq" data-state="idle"><i></i><i></i><i></i><i></i></span><span class="muted" id="radio-state"></span></div>' +
        (tags.length ? '<div class="chips">' + tags.map(t => '<span class="chip plain">' + esc(t) + '</span>').join('') + '</div>' : ''),
      rows: [
        ['Stream', esc([it.codec, it.bitrate ? it.bitrate + ' kbps' : ''].filter(Boolean).join(', ') || 'Unknown')],
        it.lang ? ['Language', esc(cap(it.lang.split(',')[0]))] : null,
        it.clicks ? ['Played', num(it.clicks) + ' times in the past day'] : null,
        ['There right now', SK(150), slotAttr('there')],
        ['Location', esc(fmtLL(it.lat, it.lon))]
      ],
      extra: near.length ? '<h3>Stations nearby</h3>' + near.map(n => row(n[1], esc(n[1].title), num(n[0]) + ' km away', n[1].country)).join('') : '',
      actions: '<button class="btn" data-open="listen">More to hear</button>' + link(it.home, 'Station website')
    };
  },
  place(it) {
    return {
      title: '<div class="big word" ' + slotAttr('pname') + '>' + (it.title ? esc(it.title) : SK(190, 24)) + '</div><p ' + slotAttr('psub') + '>' + esc(it.sub || fmtLL(it.lat, it.lon)) + '</p><p class="about" ' + slotAttr('pabout') + ' hidden></p>' +
        '<div ' + slotAttr('wx') + '><div class="wx-now">' + SK(86, 40) + '<span>' + SK(130) + '<br>' + SK(190) + '</span></div><span class="skel block" style="height:58px;margin-top:14px"></span></div>',
      rows: [
        ['Local time', SK(110), slotAttr('ptime')],
        ['Today', SK(170), slotAttr('ptoday')],
        ['Wind', SK(120), slotAttr('pwind')],
        ['Sun', SK(140), live('place-sun')],
        ['Sunrise and sunset', SK(110), slotAttr('psunrise')],
        ['Air quality', SK(120), slotAttr('paqi')],
        ['UV index', SK(70), slotAttr('puv')],
        onLand(it) ? ['Elevation', SK(120), slotAttr('pelev')] : ['Sea', SK(130), slotAttr('psea')],
        onLand(it) ? ['Bedrock', SK(170), slotAttr('pgeo')] : null,
        ['Space Station', SK(100), live('place-iss')],
        aurora.ready && Math.abs(it.lat) > 45 ? ['Aurora chance', Math.round(aurora.at(it.lat, it.lon)) + '%'] : null,
        ['Coordinates', esc(fmtLL(it.lat, it.lon))]
      ],
      extra: '<div ' + slotAttr('pweek') + '></div><div ' + slotAttr('pnear') + '></div><div ' + slotAttr('pphotos') + '></div><div ' + slotAttr('pcountry') + '>' + (onLand(it) ? '<h3>Country</h3><span class="skel block" style="height:40px"></span>' : '') + '</div><div ' + slotAttr('pwiki') + '>' + (onLand(it) ? '<h3>Nearby on Wikipedia</h3><div class="links">' + SK(96, 28) + SK(130, 28) + SK(80, 28) + '</div>' : '') + '</div>'
    };
  },
  swx() {
    const k = space.kp || [];
    return {
      title: '<div class="big">Kp ' + (k.length ? k[k.length - 1].kp.toFixed(1) : '–') + '</div><p>' + (k.length ? kpWord(k[k.length - 1].kp) + ' geomagnetic conditions. ' : '') +
        'Kp runs from 0 to 9. From about 5 upward the aurora reaches lower latitudes and radio and GPS can be disturbed.</p>' +
        (k.length ? '<h3>Last ' + Math.min(8, k.length) * 3 + ' hours</h3>' + bars(k.slice(-8).map(o => o.kp), 9, kpColor) : ''),
      rows: [
        space.wind ? ['Solar wind speed', num(space.wind) + ' km/s' + (space.wind > 600 ? ' (fast)' : space.wind > 450 ? ' (elevated)' : ' (calm)')] : null,
        aurora.ready ? ['Peak aurora chance', Math.round(aurora.max) + '%'] : null
      ],
      extra: (extra.swxalert || []).length ? '<h3>Recent alerts from NOAA</h3>' + extra.swxalert.slice(0, 8).map(a => row(a, esc(a.title), agoSpan(a.time))).join('') : '',
      actions: link('https://www.swpc.noaa.gov/', 'Open NOAA space weather')
    };
  },
  swxalert(it) {
    return { title: '<div class="big word">' + esc(it.title) + '</div>', rows: [['Issued', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')']], extra: '<pre class="msg">' + esc(it.message) + '</pre>', actions: link('https://www.swpc.noaa.gov/products/alerts-watches-and-warnings', 'All NOAA alerts') };
  },
  flybys() {
    const f = extra.flybys || [];
    return {
      title: '<div class="big">' + f.length + '</div><p>Asteroids passing within 7.5 million km of Earth over the next ten days. None of them is a threat.</p>',
      rows: [],
      extra: '<table class="tbl"><thead><tr><th>Asteroid</th><th>When</th><th>Distance</th><th>Size</th></tr></thead><tbody>' + f.map(a =>
        '<tr><td>' + esc(a.name) + '</td><td>' + esc(new Date(a.time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + '</td><td>' + a.ld.toFixed(1) + ' × Moon</td><td>~' + num(a.size) + ' m</td></tr>').join('') + '</tbody></table>',
      actions: link('https://cneos.jpl.nasa.gov/ca/', 'Open NASA close approaches')
    };
  }
};
function detailFor(it) {
  if (DETAILS[it.layer]) return DETAILS[it.layer](it);
  if (it.layer === 'cities') return DETAILS.place(it);
  if (SAT_KEYS.includes(it.layer)) return DETAILS.sat(it);
  return DETAILS.event(it);
}
function renderDetail() {
  inspector.classList.toggle('has-detail', !!selected);
  detailEl.hidden = !selected;
  if (!selected) { detailEl.innerHTML = ''; return; }
  const it = selected, d = detailFor(it);
  detailEl.innerHTML = '<div class="insp-head"><span class="type">' + swatch(it.layer) + esc(kindOf(it)) + '</span><span class="tools">' +
    (it.lat != null ? '<button class="icon-btn" id="insp-fly" aria-label="Centre on the globe" title="Centre on the globe"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="8" cy="8" r="4.2"/><path d="M8 1v2.6M8 12.4V15M1 8h2.6M12.4 8H15"/></svg></button>' : '') +
    '<button class="icon-btn" id="insp-close" aria-label="Close details" title="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg></button></span></div>' +
    '<div class="scroll"><div class="insp-title">' + d.title + '</div>' + (explain(it) ? '<p class="explain">' + esc(explain(it)) + '</p>' : '') + (d.rows.filter(Boolean).length ? kv(d.rows) : '') + (d.extra || '') + (d.actions ? '<div class="insp-actions">' + d.actions + '</div>' : '') + '</div>';
  if (it.layer === 'radio' || it.layer === 'sounds') paintRadio();
  refreshLive();
}

/* ---------- "Right now" summary ---------- */
function tile(label, value, sub, sel) {
  return '<' + (sel ? 'button data-open="' + sel + '"' : 'div') + ' class="tile"><span class="k">' + label + '</span><span class="v mono">' + value + '</span><span class="u">' + (sub || '&nbsp;') + '</span></' + (sel ? 'button' : 'div') + '>';
}
function renderSummary() {
  const q = layers.quakes.on ? layers.quakes.items : [];
  const events = EVENT_KEYS.concat('alerts').reduce((n, k) => n + (layers[k].on ? layers[k].items.length : 0), 0);
  const sats = SAT_KEYS.reduce((n, k) => n + (layers[k].on ? layers[k].items.length : 0), 0) + (layers.stations.on ? layers.stations.items.length : 0);
  const kp = space.kp && space.kp.length ? space.kp[space.kp.length - 1].kp : null;
  let h = '<div class="insp-head"><span class="type">Right now</span></div><div class="scroll"><div class="tiles">' +
    tile('Earthquakes', q.length.toLocaleString(), 'past ' + prefs.win) +
    tile('Fire hotspots', layers.hotspots.on ? layers.hotspots.items.length.toLocaleString() : '–', 'past 24 hours') +
    tile('In orbit', sats ? sats.toLocaleString() : '–', 'tracked live', 'orbit') +
    tile('Active events', String(events), 'on the map') +
    tile('Kp index', kp == null ? '–' : kp.toFixed(1), kp == null ? 'space weather' : kpWord(kp).toLowerCase(), 'swx') +
    tile('In space', space.people ? String(space.people.length) : '–', 'people') + '</div>';
  if (layers.stations.on) for (const s of layers.stations.items) h += row(s, esc(s.title), '<span ' + live('st-' + s.id) + '>…</span>');
  if (layers.launches.on && layers.launches.items.length) { const l = layers.launches.items[0]; h += row(l, esc(l.title), untilSpan(l.time), 'Next launch'); }
  if (q.length) {
    const top = q.reduce((a, b) => (b.mag > a.mag ? b : a)), last = q[0];
    h += row(top, '<b>M ' + top.mag.toFixed(1) + '</b>' + esc(top.place), agoSpan(top.time), 'Strongest this ' + prefs.win);
    if (last !== top) h += row(last, '<b>M ' + last.mag.toFixed(1) + '</b>' + esc(last.place), agoSpan(last.time), 'Most recent');
  }
  for (const key of ['storms', 'alerts', 'volcanoes']) if (layers[key].on) for (const it of layers[key].items.slice(0, 3)) h += row(it, esc(it.title), agoSpan(it.time), kindOf(it));
  if (layers.news.on && layers.news.items.length) { const n = layers.news.items[0]; h += row(n, esc(n.title), esc(n.dateLabel), 'Headline'); }
  if ((extra.flybys || []).length) { const a = extra.flybys.reduce((x, y) => (y.ld < x.ld ? y : x)); h += '<button class="row" data-open="flybys">' + swatch('fireballs') + '<span><span class="t">' + extra.flybys.length + ' asteroid flybys in 10 days</span><span class="s">Closest: ' + esc(a.name) + ' at ' + a.ld.toFixed(1) + ' × the Moon’s distance</span></span></button>'; }
  if ((extra.epic || []).length) { const e = extra.epic[0]; h += '<button class="row pic" data-sel="epic:epic"><img src="' + esc(e.thumb) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'"><span><span class="t">Earth photographed from deep space</span><span class="s">Taken ' + agoSpan(e.time) + ' by NASA’s EPIC camera</span></span></button>'; }
  h += summaryMore();
  h += '<button class="row" data-go="sun"><span class="swatch glyph">' + icon('sun') + '</span><span><span class="t">Noon is here</span><span class="s">Sun overhead at <span ' + live('sun-pos') + '>…</span></span></span></button>';
  h += '<button class="row" data-go="moon"><span class="swatch glyph">' + icon('moon') + '</span><span><span class="t"><span ' + live('moon-name') + '>Moon</span></span><span class="s">Overhead at <span ' + live('moon-pos') + '>…</span></span></span></button>';
  summaryEl.innerHTML = h + '</div>';
  refreshLive(); markSelectedRows();
}

/* ---------- Latest and News tabs ---------- */
function renderFeed() {
  const list = [];
  if (layers.quakes.on) for (const q of layers.quakes.items) if (q.mag >= 2.5) list.push(q);
  for (const key of EVENT_KEYS.concat('alerts', 'warnings')) if (layers[key].on) for (const it of layers[key].items) list.push(it);
  if (layers.fireballs.on) for (const f of layers.fireballs.items) if (Date.now() - f.time < 45 * 864e5) list.push(f);
  for (const a of extra.swxalert || []) if (Date.now() - a.time < 3 * 864e5) list.push(a);
  list.sort((a, b) => b.time - a.time);
  let h = '';
  const up = layers.launches.on ? layers.launches.items.slice(0, 4) : [];
  if (up.length) h += '<h3>Coming up</h3>' + up.map(l => row(l, esc(l.title), untilSpan(l.time), 'Launch')).join('');
  const past = (extra.pastlaunch || []).slice(0, 6);
  if (past.length) h += '<h3>Launched in the past days</h3>' + past.map(l => row(l, esc(l.title), agoSpan(l.time), /fail/i.test(l.status) ? 'Failed' : /success/i.test(l.status) ? 'Reached orbit' : l.status)).join('');
  h += '<h3>Just happened</h3>';
  h += list.length ? list.slice(0, 140).map(it => it.layer === 'quakes'
    ? row(it, '<b>M ' + it.mag.toFixed(1) + '</b>' + esc(it.place), agoSpan(it.time), cap(quakeWord(it.mag)) + ' earthquake')
    : row(it, esc(it.title), agoSpan(it.time), kindOf(it))).join('') : '<p class="empty">Nothing yet. Events appear here as the feeds load.</p>';
  $('#tab-latest').innerHTML = '<p class="hint">Earthquakes of magnitude 2.5 and up, natural events, alerts and space weather, newest first.</p>' + h;
  markSelectedRows();
}
const overOption = o => '<option value="' + o.id + '"' + ((prefs.overlay || '') === o.id ? ' selected' : '') + '>' + o.name + '</option>';
function renderNews() {
  const items = newsAll;
  let h = '<p class="hint">Stories from Wikipedia’s Current events portal. Each one is pinned to the first place it mentions.</p>', day = '';
  if (!items.length) h += '<p class="empty">' + (SOURCES.wiki.state === 'err' ? 'Wikipedia could not be reached.' : 'Loading today’s stories…') + '</p>';
  for (const n of items) {
    if (n.dateLabel !== day) { day = n.dateLabel; h += '<h3>' + esc(day) + '</h3>'; }
    h += '<button class="row news" data-sel="news:' + esc(n.id) + '">' + swatch('news') + '<span><span class="t wrap">' + esc(n.title) + '</span><span class="s">' + esc(n.cat || 'World') + (n.placeName ? ', ' + esc(n.placeName) : '') + '</span></span></button>';
  }
  const sn = extra.snews || [];
  if (sn.length) { h += '<h3>Space news</h3>'; for (const a of sn) h += '<button class="row news" data-sel="snews:' + esc(a.id) + '">' + swatch('launches') + '<span><span class="t wrap">' + esc(a.title) + '</span><span class="s">' + esc(a.site || 'Space news') + ', ' + agoSpan(a.time) + '</span></span></button>'; }
  $('#tab-news').innerHTML = h + newsMore();
  markSelectedRows();
}

/* ---------- Layers tab ---------- */
(function buildLayerRows() {
  let h = '';
  for (const g of GROUPS) {
    h += '<section class="grp"><h3>' + g[1] + '</h3><div class="card">';
    for (const key of Object.keys(LAYERS)) {
      const L = LAYERS[key]; if (L.g !== g[0]) continue;
      /* the row is a label for its switch, named outright: left to itself a label works its first control, which on the earthquake row is the hour, day or week list */
      h += '<label class="layer' + (L.pick ? (prefs.overlay ? '' : ' off') : isOn(key) ? '' : ' off') + '" data-layer="' + key + '"' + (L.pick ? '' : ' for="layer-' + key + '"') + (key === 'other' ? ' hidden' : '') + (L.about ? ' title="' + esc(L.about) + '"' : '') + '>' + swatch(key) +
        '<span class="name">' + L.name + '</span>' +
        (key === 'quakes' ? '<select class="pick" id="quake-window" aria-label="Show earthquakes from the past" title="Show earthquakes from the past hour, day or week">' + [['hour', 'Hour'], ['day', 'Day'], ['week', 'Week']].map(w => '<option value="' + w[0] + '"' + (prefs.win === w[0] ? ' selected' : '') + '>' + w[1] + '</option>').join('') + '</select>' : '') +
        '<span class="count" id="count-' + key + '"></span>' +
        (L.pick ? '<select class="pick wide" id="overlay-pick" aria-label="Choose a NASA satellite view">' + overOption(OVERLAYS[0]) + OVERLAY_GROUPS.map(g => '<optgroup label="' + g + '">' + OVERLAYS.filter(o => o.g === g).map(overOption).join('') + '</optgroup>').join('') + '</select>'
          : '<input type="checkbox" role="switch" id="layer-' + key + '"' + (isOn(key) ? ' checked' : '') + '><span class="switch"></span>') + '</label>';
    }
    h += '</div></section>';
  }
  $('#tab-layers').innerHTML = h;
})();

/* scrollbars differ by system (overlay on a Mac, a gutter on Windows); measure once so both sides of a list keep the same inset */
(function () { const d = document.createElement('div'); d.style.cssText = 'position:absolute;top:-99px;width:60px;height:60px;overflow:scroll;scrollbar-width:thin'; document.body.appendChild(d); document.documentElement.style.setProperty('--sbw', (d.offsetWidth - d.clientWidth) + 'px'); d.remove(); })();

/* ---------- tabs ---------- */
function showTab(name) {
  if (name === 'now' && !view.phone) name = 'layers';
  prefs.tab = name; savePrefs();
  $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'));
  $$('.tabpanel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
}
$('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
$('#src-summary').addEventListener('click', () => showTab('sources'));
function onResize() {
  /* on a phone the summary lives in the sheet's first tab; on a desktop it sits in the right-hand panel */
  const host = view.phone ? $('#tab-now') : inspector;
  if (summaryEl.parentNode !== host) host.insertBefore(summaryEl, host.firstChild);
  showTab(view.phone && (prefs.tab === 'layers' || !prefs.tab) && !onResize.done ? 'now' : prefs.tab || 'layers');
  onResize.done = true;
}

/* ---------- live text: values that change every second are written into slots, so the DOM is never rebuilt under the pointer ---------- */
const liveFns = [];
function refreshLive() {
  const o = { 'sun-pos': fmtLL(sun.lat, sun.lon), 'moon-pos': fmtLL(moon.lat, moon.lon), 'moon-name': moon.name + ', ' + Math.round(moon.frac * 100) + '% lit' };
  for (const fn of liveFns) fn(o);
  $$('[data-live]').forEach(el => { const v = o[el.dataset.live]; if (v !== undefined && el.textContent !== v) el.textContent = v; });
  $$('[data-t]').forEach(el => { const s = ago(+el.dataset.t); if (el.textContent !== s) el.textContent = s; });
  $$('[data-until]').forEach(el => { const s = until(+el.dataset.until); if (el.textContent !== s) el.textContent = s; });
  $$('[data-clock]').forEach(el => { const s = clockAt(+el.dataset.clock); if (el.textContent !== s) el.textContent = s; });
}

/* ---------- labels that follow points on the globe ---------- */
const labelHost = $('#labels'), labelEls = [];
let labelList = [];
function refreshLabels() {
  const cands = [];
  if (layers.stations.on) for (const s of layers.stations.items) cands.push({ v: s.v, text: s.short, cls: 'lbl strong', item: s, lifted: true });
  if (layers.storms.on) for (const s of layers.storms.items) cands.push({ v: s.v, text: s.title.replace(/^(Tropical|Subtropical) (Storm|Cyclone|Depression) /, ''), cls: 'lbl storm', item: s });
  if (layers.launches.on && layers.launches.items.length && layers.launches.items[0].time - Date.now() < 2 * 864e5) { const l = layers.launches.items[0]; cands.push({ v: l.v, text: 'Launch ' + until(l.time), cls: 'lbl launch', item: l }); }
  const maxCities = view.phone ? 6 : Math.round(12 + view.zoomK * 46);
  if (layers.cities.on) layers.cities.items.slice(0, 120).forEach(c => cands.push({ v: c.v, text: c.title + (c.temp != null ? '  ' + Math.round(c.temp) + '°' : ''), cls: 'lbl city', item: c, city: true }));
  const boxes = [], out = [], cam = camera.position, cl = cam.length();
  let cities = 0;
  for (const c of cands) {
    if (c.city && cities >= maxCities) continue;
    if (occluded(c.v) || !project(c.v)) continue;
    if (!c.lifted && (c.v.x * cam.x + c.v.y * cam.y + c.v.z * cam.z) / cl < 0.38) continue;        /* skip the crowded limb */
    if (scr.x < 8 || scr.x > view.w - 60 || scr.y < 60 || scr.y > view.h - 44) continue;
    const w = c.text.length * 6.3 + 20, b = [scr.x + 4, scr.y - 11, scr.x + 12 + w, scr.y + 11];
    if (boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
    boxes.push(b); out.push(c); if (c.city) cities++;
  }
  labelList = out;
  while (labelEls.length < out.length) { const el = document.createElement('button'); el.tabIndex = -1; labelHost.appendChild(el); labelEls.push(el); }
  labelEls.forEach((el, i) => {
    const c = out[i];
    if (!c) { el.hidden = true; return; }
    el.hidden = false; if (el.textContent !== c.text) el.textContent = c.text; if (el.className !== c.cls) el.className = c.cls;
    el._item = c.item;
  });
}
function placeLabels() {
  for (let i = 0; i < labelList.length; i++) {
    const el = labelEls[i], c = labelList[i];
    if (occluded(c.v) || !project(c.v)) { el.style.opacity = 0; continue; }
    el.style.opacity = 1; el.style.transform = 'translate3d(' + scr.x.toFixed(1) + 'px,' + scr.y.toFixed(1) + 'px,0)';
  }
}
labelHost.addEventListener('click', e => { const el = e.target.closest('button'); if (el && el._item) select(el._item); });
