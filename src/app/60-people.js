/* ============================================================
   Feeds: cities and weather, wind, clouds, news, radio, and the "any place" lookup
   ============================================================ */
const METEO = 'https://api.open-meteo.com/v1/forecast';

/* cities are on the globe from the start; temperatures arrive when Open-Meteo answers */
const cityItems = CITIES.map(c => ({ layer: 'cities', id: c[0], title: c[0], named: true, lat: c[1], lon: c[2], v: ll(c[1], c[2], 1.004), size: 3.4, alpha: 0.9 }));
async function loadCities() {
  setStatus('meteo', 'load');
  try {
    const d = await getJSON(METEO + '?latitude=' + CITIES.map(c => c[1]).join(',') + '&longitude=' + CITIES.map(c => c[2]).join(',') +
      '&current=temperature_2m,weather_code,is_day&timezone=auto', 30000, false, KEEP);
    (Array.isArray(d) ? d : [d]).forEach((o, i) => {
      const c = cityItems[i]; if (!c || !o.current) return;
      c.temp = o.current.temperature_2m; c.code = o.current.weather_code; c.isDay = o.current.is_day; c.off = o.utc_offset_seconds;
    });
    okStatus('meteo', d);
  } catch (e) { setStatus('meteo', e.status === 429 ? 'warn' : 'err', e.status === 429 ? 'daily limit reached' : errNote(e)); }
}

/* a coarse grid of surface wind for the whole planet, turned into drifting streaks */
async function loadWind() {
  const G = { lat0: -80, dLat: 10, rows: 17, lon0: -180, dLon: 15, cols: 24 };
  let uv = store.get('wind', 55 * 60000);
  if (!uv) {
    const pts = [];
    for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) pts.push([G.lat0 + r * G.dLat, G.lon0 + c * G.dLon]);
    uv = [];
    try {
      for (let i = 0; i < pts.length; i += 102) {
        const part = pts.slice(i, i + 102);
        const d = await getJSON(METEO + '?latitude=' + part.map(p => p[0]).join(',') + '&longitude=' + part.map(p => p[1]).join(',') +
          '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms', 30000);
        for (const o of Array.isArray(d) ? d : [d]) {
          const s = o.current.wind_speed_10m || 0, dir = (o.current.wind_direction_10m || 0) * D2R;
          uv.push(+(-s * Math.sin(dir)).toFixed(1), +(-s * Math.cos(dir)).toFixed(1));       /* direction is where the wind comes from */
        }
        await sleep(250);
      }
      if (uv.length !== pts.length * 2) throw new Error('short');
      store.set('wind', uv);
    } catch (e) { if (SOURCES.meteo.state !== 'ok') setStatus('meteo', 'err', errNote(e)); return; }
  }
  G.u = new Float32Array(uv.length / 2); G.v = new Float32Array(uv.length / 2);
  for (let i = 0; i < G.u.length; i++) { G.u[i] = uv[i * 2]; G.v[i] = uv[i * 2 + 1]; }
  wind.setField(G);
}

/* near-live clouds: a greyscale image of the whole planet, refreshed every three hours */
let cloudsReady = false;
async function loadClouds() {
  setStatus('clouds', 'load');
  try {
    const im = await loadImage('https://clouds.matteason.co.uk/images/2048x1024/clouds.jpg?t=' + Math.floor(Date.now() / 10800000), true);
    const old = globeU.tClouds.value;
    globeU.tClouds.value = tuneTexture(new THREE.Texture(im)); cloudsReady = true;
    if (old && old !== blank) old.dispose();
    setStatus('clouds', 'ok');
  } catch (e) { setStatus('clouds', 'err', 'unreachable'); }
}

/* ---------- news: Wikipedia's Current events portal, pinned to the first place each story mentions ---------- */
const WIKI = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let newsAll = [];
function parseNewsDay(html, dateLabel, dayKey) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.current-events-content') || doc.querySelector('.mw-parser-output') || doc.body;
  const out = [];
  const wikiLinks = el => Array.from(el.querySelectorAll('a[href^="/wiki/"]')).map(a => decodeURIComponent(a.getAttribute('href').slice(6)).replace(/_/g, ' ').split('#')[0]).filter(t => t && !t.includes(':'));
  const leaf = (li, cat, parents) => {
    const c = li.cloneNode(true), ext = c.querySelector('a.external, a[rel~="nofollow"]');
    const src = ext ? { url: ext.getAttribute('href'), name: ext.textContent.replace(/[()]/g, '').trim() } : null;
    c.querySelectorAll('a.external, a[rel~="nofollow"], sup, style').forEach(a => a.remove());
    const text = c.textContent.replace(/\s*\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
    if (text.length < 25) return;
    out.push({ layer: 'news', id: dayKey + '-' + out.length, title: text, cat, dateLabel, links: Array.from(new Set(wikiLinks(c).concat(parents))), src });
  };
  const walk = (ul, cat, parents) => {
    for (const li of Array.from(ul.children)) {
      if (li.tagName !== 'LI') continue;
      const sub = Array.from(li.children).find(x => x.tagName === 'UL');
      if (sub) { const head = li.cloneNode(true); head.querySelectorAll('ul').forEach(u => u.remove()); walk(sub, cat, parents.concat(wikiLinks(head))); }
      else leaf(li, cat, parents);
    }
  };
  let cat = '';
  const scan = node => {
    for (const el of Array.from(node.children)) {
      if (el.tagName === 'UL') walk(el, cat, []);
      else if (el.tagName === 'DIV' && el.querySelector('ul') && !/heading/.test(el.className)) scan(el);
      else { const t = el.textContent.trim(); if (t && t.length < 70 && (el.querySelector('b') || /heading/.test(el.className) || el.getAttribute('role') === 'heading')) cat = t; }
    }
  };
  scan(root);
  return out;
}
async function loadNews() {
  setStatus('wiki', 'load');
  try {
    const all = [];
    let reached = false, lastErr = null;
    for (let k = 0; k < 2; k++) {
      const d = new Date(Date.now() - k * 864e5);
      const page = 'Portal:Current_events/' + d.getUTCFullYear() + '_' + MONTHS[d.getUTCMonth()] + '_' + d.getUTCDate();
      try {
        const r = await getJSON(WIKI + '&action=parse&prop=text&disabletoc=1&page=' + encodeURIComponent(page), 20000, false, KEEP);
        reached = true;
        const html = r.parse && (typeof r.parse.text === 'string' ? r.parse.text : r.parse.text && r.parse.text['*']);
        if (html) all.push.apply(all, parseNewsDay(html, k === 0 ? 'Today' : 'Yesterday', d.toISOString().slice(0, 10)));
      } catch (e) { lastErr = e; }
    }
    if (!reached) throw lastErr || new Error('unreachable');
    /* look up coordinates for every linked article, 50 titles per request */
    const titles = Array.from(new Set([].concat.apply([], all.map(n => n.links)))).slice(0, 400), coord = {}, alias = {};
    for (let i = 0; i < titles.length; i += 50) {
      try {
        const r = await getJSON(WIKI + '&action=query&prop=coordinates&colimit=max&redirects=1&titles=' + encodeURIComponent(titles.slice(i, i + 50).join('|')), 20000);
        const q = r.query || {};
        for (const m of (q.normalized || []).concat(q.redirects || [])) alias[m.from] = m.to;
        for (const p of q.pages || []) if (p.coordinates && p.coordinates[0]) coord[p.title] = p.coordinates[0];
      } catch (e) {}
    }
    const resolve = t => { for (let i = 0; i < 4 && alias[t]; i++) t = alias[t]; return t; };
    const used = {};
    for (const n of all) {
      for (const t of n.links) {
        const c = coord[resolve(t)];
        if (!c) continue;
        const key = Math.round(c.lat) + ',' + Math.round(c.lon), k = used[key] = (used[key] || 0) + 1;
        n.lat = c.lat + (k > 1 ? 0.9 * Math.cos(k * 2.4) * Math.sqrt(k - 1) : 0); n.lon = c.lon + (k > 1 ? 0.9 * Math.sin(k * 2.4) * Math.sqrt(k - 1) : 0);
        n.placeName = resolve(t); n.v = ll(n.lat, n.lon, 1.005); n.size = 10; n.alpha = 0.95;
        break;
      }
    }
    newsAll = all;
    extra.news = all.filter(n => n.lat == null);
    applyItems('news', all.filter(n => n.lat != null));
    setCount('news', String(all.length));
    dirty.news = true;
    setStatus('wiki', 'ok');
  } catch (e) { dirty.news = true; setStatus('wiki', 'err', errNote(e)); }
}

/* ---------- live radio ----------
   Tuning plays soft radio static (made in the browser) until the station's stream starts, then cross-fades into it. */
const radio = { el: $('#radio'), current: null, state: 'idle', vol: prefs.vol == null ? 0.8 : prefs.vol, timer: 0, fade: 0, host: 'de1' };
const tuner = { ctx: null, src: null, gain: null, lfo: null };
function staticOn() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || tuner.src) return;
    const ctx = tuner.ctx || (tuner.ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    if (!tuner.buf) {                                /* two seconds of hiss with a little low rumble, looped */
      const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), ch = buf.getChannelData(0);
      let low = 0;
      for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; low = (low + 0.03 * w) / 1.03; ch[i] = w * 0.5 + low * 5 + (Math.random() < 0.0006 ? (Math.random() - 0.5) * 3 : 0); }
      tuner.buf = buf;
    }
    const t = ctx.currentTime, src = ctx.createBufferSource(), band = ctx.createBiquadFilter(), gain = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    src.buffer = tuner.buf; src.loop = true;
    band.type = 'bandpass'; band.Q.value = 0.55;
    band.frequency.setValueAtTime(420, t); band.frequency.exponentialRampToValueAtTime(2400, t + 0.9);   /* the dial sweeping up the band */
    lfo.frequency.value = 0.45; depth.gain.value = 700; lfo.connect(depth); depth.connect(band.frequency);        /* then drifting, as if hunting for the signal */
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(0.085 * Math.max(0.25, radio.vol), t + 0.2);
    src.connect(band); band.connect(gain); gain.connect(ctx.destination);
    src.start(); lfo.start();
    tuner.src = src; tuner.gain = gain; tuner.lfo = lfo;
  } catch (e) {}
}
function staticOff(fade) {
  if (!tuner.src) return;
  try {
    const t = tuner.ctx.currentTime, f = fade == null ? 0.45 : fade;
    tuner.gain.gain.cancelScheduledValues(t); tuner.gain.gain.setValueAtTime(tuner.gain.gain.value, t); tuner.gain.gain.linearRampToValueAtTime(0, t + f);
    tuner.src.stop(t + f + 0.05); tuner.lfo.stop(t + f + 0.05);
    tuner.quietAt = performance.now() + (f + 0.4) * 1000;      /* the sound engine must not be put to sleep (87-music.js) before this has died away */
  } catch (e) {}
  tuner.src = tuner.gain = tuner.lfo = null;
}
function fadeTo(target, ms) {
  clearInterval(radio.fade);
  const el = radio.el, from = el.volume, t0 = performance.now();
  radio.fade = setInterval(() => { const k = Math.min(1, (performance.now() - t0) / ms); el.volume = clamp(from + (target - from) * k, 0, 1); if (k >= 1) clearInterval(radio.fade); }, 30);
}
const RADIO_WORD = { tuning: 'Tuning in…', live: 'Live', buffering: 'Buffering…', paused: 'Paused', error: 'This station is not answering' };
function paintRadio() {
  const it = radio.current, pl = $('#player'), st = radio.state;
  pl.hidden = !it;
  if (it) {
    pl.dataset.state = st;
    $('#pl-title').textContent = it.title;
    const rec = it.layer === 'sounds';
    $('#pl-state').textContent = (scan.on && st === 'live' ? 'Scanning, live' : rec && st === 'live' ? 'Playing a recording' : rec && st === 'error' ? 'This recording would not play' : RADIO_WORD[st]) + (st === 'live' || st === 'paused' ? ' from ' + (it.country || it.place || 'somewhere on Earth') : '');
    $('#pl-scan').setAttribute('aria-pressed', String(scan.on));
    $('#pl-toggle').setAttribute('aria-label', st === 'paused' || st === 'error' ? 'Play' : 'Pause');
  }
  const btn = $('#radio-play');                     /* the button inside the station's detail view, if one is open */
  if (btn && selected && (selected.layer === 'radio' || selected.layer === 'sounds')) {
    const mine = selected === it, s = mine ? st : 'idle', rec = selected.layer === 'sounds';
    btn.innerHTML = s === 'tuning' || s === 'buffering' ? '<i class="spin dark"></i>' + (rec ? 'Loading…' : RADIO_WORD[s]) : s === 'live' ? 'Pause' : s === 'error' ? 'Try again' : rec ? 'Play recording' : 'Listen live';
    const line = $('#radio-state'); if (line) line.textContent = s === 'error' ? (rec ? 'This recording would not play here.' : 'No answer from this station. Try again, or pick another.') : s === 'live' ? (rec ? 'Playing' : 'On air now') : s === 'tuning' ? (rec ? 'Fetching the recording' : 'Finding the signal') : '';
    const eq = $('#radio-eq'); if (eq) eq.dataset.state = s;
  }
}
function setRadioState(state) { radio.state = state; paintRadio(); }
function markStation(it) {
  const L = layers.radio; if (!L.items.length) return;
  for (const x of L.items) { x.pulse = x === it; x.size = x === it ? 7 : 4.2; }
  L.set(L.items);
}
function radioFail() { clearTimeout(radio.timer); clearInterval(radio.fade); radio.el.pause(); radio.el.removeAttribute('src'); staticOff(0.25); setRadioState('error'); if (scan.on) scanSoon(1400); }
function playRadio(it) {
  const el = radio.el;
  clearTimeout(radio.timer); clearInterval(radio.fade);
  if (!it) { el.pause(); el.removeAttribute('src'); try { el.load(); } catch (e) {} staticOff(0.2); markStation(null); radio.current = null; setScan(false); return setRadioState('idle'); }
  if (radio.current === it && (radio.state === 'live' || radio.state === 'tuning' || radio.state === 'buffering')) { el.pause(); el.removeAttribute('src'); staticOff(0.2); setScan(false); return setRadioState('paused'); }
  if (radio.current !== it) markStation(it.layer === 'radio' ? it : null);
  radio.current = it; setRadioState('tuning');
  staticOn();
  el.volume = 0; el.src = it.url;
  const p = el.play(); if (p && p.catch) p.catch(() => {});
  radio.timer = setTimeout(() => { if (radio.state === 'tuning') radioFail(); }, 15000);
  if (it.layer === 'radio') fetch('https://' + radio.host + '.api.radio-browser.info/json/url/' + encodeURIComponent(it.id)).catch(() => {});      /* tells the directory this station was played */
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: [it.state, it.country || it.place].filter(Boolean).join(', '), album: 'Kármán' });
      navigator.mediaSession.setActionHandler('pause', () => playRadio(radio.current));
      navigator.mediaSession.setActionHandler('play', () => playRadio(radio.current));
      navigator.mediaSession.setActionHandler('nexttrack', () => radioShuffle());
    }
  } catch (e) {}
}
radio.el.addEventListener('playing', () => { if (!radio.current || radio.state === 'paused') return; clearTimeout(radio.timer); staticOff(0.55); fadeTo(radio.vol, 650); setRadioState('live'); if (scan.on) scanSoon(SCAN_MS); });
radio.el.addEventListener('waiting', () => { if (radio.state === 'live') setRadioState('buffering'); });
radio.el.addEventListener('error', () => { if (radio.current && (radio.state === 'tuning' || radio.state === 'live' || radio.state === 'buffering')) radioFail(); });
radio.el.addEventListener('ended', () => { if (radio.state !== 'live') return; if (radio.current && radio.current.layer === 'sounds') { radio.el.removeAttribute('src'); setRadioState('paused'); } else radioFail(); });
/* scan: stay with each station for a short while, then hop somewhere else on the planet, until stopped */
const SCAN_MS = 24000, scan = { on: false, timer: 0 };
function scanSoon(ms) { clearTimeout(scan.timer); scan.timer = setTimeout(() => { if (scan.on) radioShuffle(); }, ms); }
function setScan(on) {
  if (scan.on === on) return;
  scan.on = on; clearTimeout(scan.timer);
  $('#pl-scan').setAttribute('aria-pressed', String(on));
  if (on && !(radio.current && radio.current.layer === 'radio' && radio.state === 'live')) radioShuffle(); else if (on) scanSoon(SCAN_MS);
  paintRadio();
  if (selected && selected.layer === 'listen') renderDetail();
}
function radioShuffle(pool) {
  const list = pool && pool.length ? pool : layers.radio.items; if (!list.length) return;
  let it = list[Math.floor(Math.random() * list.length)];
  for (let i = 0; i < 6 && radio.current && (it === radio.current || it.country === radio.current.country); i++) it = list[Math.floor(Math.random() * list.length)];
  select(it); playRadio(it);
}
$('#pl-toggle').addEventListener('click', () => playRadio(radio.current));
$('#pl-close').addEventListener('click', () => playRadio(null));
$('#pl-shuffle').addEventListener('click', () => radioShuffle());
$('#pl-scan').addEventListener('click', () => setScan(!scan.on));
$('#pl-open').addEventListener('click', () => { if (radio.current) select(radio.current); });
$('#pl-vol').value = radio.vol;
$('#pl-vol').addEventListener('input', e => { radio.vol = +e.target.value; prefs.vol = radio.vol; savePrefs(); clearInterval(radio.fade); if (radio.state === 'live' || radio.state === 'buffering') radio.el.volume = radio.vol; });

async function loadRadio() {
  setStatus('radio', 'load');
  let lastErr = null;
  for (const host of ['de1', 'fi1', 'de2', 'at1', 'nl1']) {
    try {
      const d = await getJSON('https://' + host + '.api.radio-browser.info/json/stations/search?has_geo_info=true&is_https=true&hidebroken=true&order=clickcount&reverse=true&limit=900', 30000, false, { tries: 1 });
      const seen = new Set(), items = [];
      for (const s of d) {
        const la = +s.geo_lat, lo = +s.geo_long;
        if (s.geo_lat == null || s.geo_long == null || !isFinite(la) || !isFinite(lo) || +s.hls === 1 || !safeUrl(s.url_resolved || s.url)) continue;
        const key = Math.round(la * 2) + ',' + Math.round(lo * 2);
        if (seen.has(key)) continue; seen.add(key);
        items.push({ layer: 'radio', id: s.stationuuid, title: (s.name || 'Radio station').trim().slice(0, 60), url: s.url_resolved || s.url, home: s.homepage, country: s.country, state: s.state,
          tags: s.tags || '', lang: s.language, codec: s.codec, bitrate: s.bitrate, clicks: +s.clickcount || 0, icon: /^https:\/\//i.test(s.favicon || '') ? s.favicon : null,
          lat: la, lon: lo, v: ll(la, lo, 1.004), size: 4.2, alpha: 0.9 });
      }
      radio.host = host;
      const playing = radio.current && items.find(x => x.id === radio.current.id);
      if (playing) { playing.pulse = true; playing.size = 7; radio.current = playing; }
      applyItems('radio', items);
      return setStatus('radio', 'ok', host === 'de1' ? '' : 'backup server');
    } catch (e) { lastErr = e; }
  }
  setStatus('radio', 'err', errNote(lastErr));
}

/* ---------- any place: click the globe or search, and gather what is known about that spot ---------- */
function openPlace(lat, lon, name, sub) {
  select({ layer: 'place', id: lat.toFixed(3) + ',' + lon.toFixed(3), lat, lon, v: ll(lat, lon, 1.004), title: name || '', sub: sub || '', named: !!name });
}
const aqiWord = a => (a <= 50 ? ['Good', '#30d158'] : a <= 100 ? ['Moderate', '#ffd60a'] : a <= 150 ? ['Unhealthy for sensitive groups', '#ff9f0a'] : a <= 200 ? ['Unhealthy', '#ff453a'] : a <= 300 ? ['Very unhealthy', '#bf5af2'] : ['Hazardous', '#ff375f']);
function loadPlaceName(it, land) {
  setStatus('osm', 'load');
  const done = (name, state, country, cc) => {
    if (!it.named) {
      it.title = name || (land ? 'Unnamed place' : 'Open water');
      it.sub = [state && state !== it.title ? state : null, country && country !== it.title ? country : null].filter(Boolean).join(', ') || fmtLL(it.lat, it.lon);
      slot(it, 'pname', esc(it.title)); slot(it, 'psub', esc(it.sub));
    }
    if (cc) loadCountry(it, String(cc).toUpperCase(), country); else slot(it, 'pcountry', '');
  };
  getJSON('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=en&lat=' + it.lat.toFixed(4) + '&lon=' + it.lon.toFixed(4), 15000).then(d => {
    const a = d.address || {};
    setStatus('osm', 'ok');
    done(a.city || a.town || a.village || a.municipality || a.county || a.state_district || a.state || a.country, a.state, a.country, a.country_code);
  }).catch(() => getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + it.lat.toFixed(4) + '&longitude=' + it.lon.toFixed(4) + '&localityLanguage=en', 12000).then(b => {
    setStatus('osm', 'ok', 'backup: BigDataCloud');
    done(b.city || b.locality || b.principalSubdivision || b.countryName, b.principalSubdivision, b.countryName, b.countryCode);
  })).catch(e => { setStatus('osm', 'err', errNote(e)); done(null, null, null, null); });
}
/* backup weather for one place: the Norwegian Meteorological Institute, reshaped to look like the usual answer */
function weatherBackup(it) {
  return getJSON('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + it.lat.toFixed(3) + '&lon=' + it.lon.toFixed(3), 15000).then(d => {
    const ts = d.properties.timeseries, n = ts[0].data.instant.details, sym = ((ts[0].data.next_1_hours || ts[0].data.next_6_hours || {}).summary || {}).symbol_code || '';
    return { backup: true, elevation: d.geometry && d.geometry.coordinates ? d.geometry.coordinates[2] : 0, utc_offset_seconds: Math.round(it.lon / 15) * 3600,
      current: { temperature_2m: n.air_temperature, apparent_temperature: n.air_temperature, relative_humidity_2m: n.relative_humidity, cloud_cover: n.cloud_area_fraction, wind_speed_10m: n.wind_speed * 3.6, wind_direction_10m: n.wind_from_direction,
        weather_code: /thunder/.test(sym) ? 95 : /snow|sleet/.test(sym) ? 71 : /rain|drizzle/.test(sym) ? 61 : /fog/.test(sym) ? 45 : /partlycloudy/.test(sym) ? 2 : /cloudy/.test(sym) ? 3 : /fair/.test(sym) ? 1 : 0, is_day: /night/.test(sym) ? 0 : 1 },
      hourly: { temperature_2m: ts.slice(0, 24).map(x => x.data.instant.details.air_temperature) } };
  });
}
function loadPlace(it) {
  const q = 'latitude=' + it.lat.toFixed(3) + '&longitude=' + it.lon.toFixed(3), land = onLand(it);
  loadPlaceName(it, land);
  if (land) loadBedrock(it);
  getJSON(METEO + '?' + q + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,is_day' +
    '&hourly=temperature_2m&forecast_hours=24&daily=weather_code,sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=6&timezone=auto', 20000).catch(() => weatherBackup(it)).then(d => {
    const c = d.current, w = wmo(c.weather_code, c.is_day), off = d.utc_offset_seconds || 0;
    slot(it, 'wx', '<div class="wx-now"><span class="wx-temp mono">' + Math.round(c.temperature_2m) + '°</span><span class="wx-desc">' + icon(w.icon, 'lg') + '<b>' + w.text + '</b><small>Feels like ' +
      Math.round(c.apparent_temperature) + '°, humidity ' + Math.round(c.relative_humidity_2m) + '%, cloud ' + Math.round(c.cloud_cover) + '%</small></span></div>' +
      (d.hourly && d.hourly.temperature_2m && d.hourly.temperature_2m.length > 3 ? '<h3>Temperature, next 24 hours</h3>' + spark(d.hourly.temperature_2m.slice(0, 24), v => Math.round(v) + '°') : ''));
    slot(it, 'ptime', '<span data-clock="' + off + '">' + clockAt(off) + '</span> <small>' + (d.backup ? 'approximate' : utcLabel(off)) + '</small>');
    slot(it, 'pwind', Math.round(c.wind_speed_10m) + ' km/h from the ' + compass(c.wind_direction_10m));
    if (d.daily && d.daily.sunrise && d.daily.sunrise[0]) slot(it, 'psunrise', esc(d.daily.sunrise[0].slice(11, 16)) + ' and ' + esc(d.daily.sunset[0].slice(11, 16)));
    else slot(it, 'psunrise', d.backup ? 'Unavailable' : 'No sunrise or sunset today');
    slot(it, 'pelev', num(d.elevation) + ' m above sea level');
    const dy = d.daily || {};
    slot(it, 'pweek', weekHTML(dy));
    slot(it, 'ptoday', dy.temperature_2m_max && dy.temperature_2m_max[0] != null ? 'High ' + Math.round(dy.temperature_2m_max[0]) + '°, low ' + Math.round(dy.temperature_2m_min[0]) + '°' +
      (dy.precipitation_probability_max && dy.precipitation_probability_max[0] != null ? ', ' + dy.precipitation_probability_max[0] + '% chance of rain' : '') : 'No forecast');
  }).catch(() => { slot(it, 'wx', '<p class="muted">The weather service could not be reached.</p>'); ['ptime', 'ptoday', 'pwind', 'psunrise', 'pelev'].forEach(k => slot(it, k, 'Unavailable')); });
  getJSON('https://air-quality-api.open-meteo.com/v1/air-quality?' + q + '&current=us_aqi,pm2_5,uv_index', 15000).then(d => {
    const a = d.current && d.current.us_aqi, uv = d.current && d.current.uv_index;
    if (a == null) slot(it, 'paqi', 'No data here');
    else { const w = aqiWord(a), pm = d.current.pm2_5; slot(it, 'paqi', '<span class="chip" style="--c:' + w[1] + '">AQI ' + Math.round(a) + '</span> ' + w[0] + (pm != null ? '<br><small>Fine particles: ' + Math.round(pm) + ' µg/m³</small>' : '')); }
    slot(it, 'puv', uv == null ? 'No data here' : uv.toFixed(1) + ', ' + (uv < 3 ? 'low' : uv < 6 ? 'moderate' : uv < 8 ? 'high' : uv < 11 ? 'very high' : 'extreme'));
  }).catch(() => { slot(it, 'paqi', 'Unavailable'); slot(it, 'puv', 'Unavailable'); });
  if (!land) getJSON('https://marine-api.open-meteo.com/v1/marine?' + q + '&current=wave_height,sea_surface_temperature', 15000).then(d => {
    const c = d.current || {};
    slot(it, 'psea', [c.sea_surface_temperature != null ? Math.round(c.sea_surface_temperature) + '° water' : null, c.wave_height != null ? c.wave_height.toFixed(1) + ' m waves' : null].filter(Boolean).join(', ') || 'No data here');
  }).catch(() => slot(it, 'psea', 'Unavailable'));
  /* what else is around, from the layers already loaded */
  const near = [];
  let bq = null, bd = 1500;
  for (const x of layers.quakes.items) { const d = gcKm(it.lat, it.lon, x.lat, x.lon); if (d < bd) { bd = d; bq = x; } }
  if (bq) near.push(row(bq, '<b>M ' + bq.mag.toFixed(1) + '</b>' + esc(bq.place), agoSpan(bq.time), 'Nearest earthquake, ' + num(bd) + ' km away'));
  let bn = null; bd = 900;
  for (const x of layers.news.items) { const d = gcKm(it.lat, it.lon, x.lat, x.lon); if (d < bd) { bd = d; bn = x; } }
  if (bn) near.push(row(bn, esc(bn.title), esc(bn.dateLabel), 'In the news nearby'));
  if (layers.nuclear.on) {
    let bs = null, bk = 500;
    for (const x of layers.nuclear.items) { if (x.wd || Math.abs(x.lat - it.lat) > 5) continue; const d = gcKm(it.lat, it.lon, x.lat, x.lon); if (d < bk) { bk = d; bs = x; } }
    if (bs) near.push(row(bs, esc(bs.title), esc(nukeCounts(bs)), 'Nearest nuclear power station, ' + num(bk) + ' km away'));
  }
  placeMore(it, near, land); placeAbout(it);
  slot(it, 'pnear', near.length ? '<h3>Around here</h3>' + near.join('') : '');
  if (land) getJSON(WIKI + '&action=query&list=geosearch&gsradius=10000&gslimit=7&gscoord=' + it.lat.toFixed(4) + '%7C' + it.lon.toFixed(4), 15000).then(d => {
    const g = (d.query && d.query.geosearch) || [];
    slot(it, 'pwiki', g.length ? '<h3>Nearby on Wikipedia</h3><div class="links">' + g.map(p => link('https://en.wikipedia.org/?curid=' + p.pageid, p.title)).join('') + '</div>' : '');
  }).catch(() => slot(it, 'pwiki', ''));
}
liveFns.push(o => {
  const f = selected;
  if (!f || (f.layer !== 'place' && f.layer !== 'cities')) return;
  const el = Math.asin(clamp(ll(f.lat, f.lon, 1).dot(U.uSun.value), -1, 1)) * R2D;
  o['place-sun'] = el > 0 ? Math.round(el) + '° above the horizon' : el > -6 ? 'Just below the horizon, twilight' : 'Below the horizon, night';
  const iss = layers.stations.items[0];
  if (iss) { const d = gcKm(f.lat, f.lon, iss.lat, iss.lon); o['place-iss'] = d < Math.acos(1 / (1 + iss.alt / EARTH_KM)) * EARTH_KM ? 'Above the horizon right now' : num(d) + ' km away'; }
  else o['place-iss'] = 'Position not loaded';
});

/* ---------- search: places and satellites. Local matches appear instantly; the place service fills in behind a loading state ---------- */
(function () {
  const wrap = $('#search'), input = $('#search-input'), box = $('#search-results');
  let timer = 0, seq = 0, flat = [], idx = -1, state = { q: '', local: [], sats: [], radio: [], infra: [], remote: [], loading: false, failed: false };
  const hide = () => { box.hidden = true; input.setAttribute('aria-expanded', 'false'); idx = -1; };
  const opt = (r, i) => '<button role="option" data-i="' + i + '" class="' + (i === idx ? 'is-on' : '') + '">' + (r.sw ? swatch(r.sw) : '<span class="swatch pin"></span>') +
    '<span><span class="t">' + esc(r.name) + '</span><span class="s">' + esc(r.sub) + '</span></span></button>';
  function paint() {
    if (document.activeElement !== input) return;       /* results that arrive after the visitor has moved on stay closed */
    flat = state.local.concat(state.remote, state.sats, state.radio, state.infra);
    let h = '', i = 0;
    if (!state.q) h += '<h3>Popular places</h3>';
    else if (state.local.length || state.remote.length || state.loading) h += '<h3>Places</h3>';
    for (const r of state.local.concat(state.remote)) h += opt(r, i++);
    if (state.loading) h += '<div class="skel-row">' + SK(150) + SK(100) + '</div><div class="skel-row">' + SK(120) + SK(140) + '</div>';
    if (state.sats.length) { h += '<h3>In orbit</h3>'; for (const r of state.sats) h += opt(r, i++); }
    if (state.radio.length) { h += '<h3>Radio stations</h3>'; for (const r of state.radio) h += opt(r, i++); }
    if (state.infra.length) { h += '<h3>Nuclear sites and cables</h3>'; for (const r of state.infra) h += opt(r, i++); }
    if (state.failed && !flat.length) h += '<p class="empty">The place search could not be reached. Try again in a moment.</p>';
    else if (state.q && !state.loading && !flat.length) h += '<p class="empty">Nothing by that name. Try a city, a country, a satellite or a radio station.</p>';
    if (!state.q) h += '<p class="hint">Type a city, a country, a satellite or a radio station.</p>';
    box.innerHTML = h; box.hidden = false; input.setAttribute('aria-expanded', 'true');
    wrap.classList.toggle('loading', state.loading);
  }
  function locals(q) {
    const ql = q.toLowerCase();
    state.local = (q ? cityItems.filter(c => c.title.toLowerCase().includes(ql)) : cityItems.slice(0, 6)).slice(0, q ? 3 : 6)
      .map(c => ({ name: c.title, sub: c.temp != null ? Math.round(c.temp) + '° right now' : 'City on the globe', item: c, sw: 'cities' }));
    state.sats = [];
    state.radio = ql.length >= 3 && layers.radio.on ? layers.radio.items.filter(x => x.title.toLowerCase().includes(ql)).slice(0, 3).map(x => ({ name: x.title, sub: [x.state, x.country].filter(Boolean).join(', ') || 'Radio station', item: x, sw: 'radio' })) : [];
    state.infra = [];
    if (ql.length >= 3) {
      if (layers.nuclear.on) for (const x of layers.nuclear.items) { if (x.title.toLowerCase().includes(ql)) { state.infra.push({ name: x.title, sub: [x.kind, x.country].filter(Boolean).join(', '), item: x, sw: 'nuclear' }); if (state.infra.length >= 3) break; } }
      if (isOn('cables')) { let n = 0; for (const x of cables.list) { if (x.title.toLowerCase().includes(ql)) { state.infra.push({ name: x.title, sub: 'Undersea cable' + (x.year ? ', ' + (x.planned ? 'planned for ' : 'since ') + x.year : ''), item: x, sw: 'cables' }); if (++n >= 3) break; } } }
    }
    if (ql.length >= 2) for (const key of ['stations'].concat(SAT_KEYS)) {
      for (const it of layers[key].items) { if ((it.title + ' ' + (it.short || '')).toLowerCase().includes(ql)) { state.sats.push({ name: it.title, sub: LAYERS[key].one, item: it, sw: key }); if (state.sats.length >= 4) break; } }
      if (state.sats.length >= 4) break;
    }
  }
  function choose(r) {
    if (!r) return;
    clearTimeout(timer); seq++; state.loading = false; wrap.classList.remove('loading');
    input.value = r.name; hide(); input.blur();
    if (r.item) select(r.item); else openPlace(r.lat, r.lon, r.name, r.sub);
  }
  function query() {
    const q = input.value.trim();
    clearTimeout(timer); seq++;
    state.q = q; state.remote = []; state.failed = false; idx = -1; locals(q);
    state.loading = q.length >= 2;
    paint();
    if (q.length < 2) return;
    const my = seq;
    timer = setTimeout(async () => {
      try {
        let d;
        try { d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=7&language=en&format=json&name=' + encodeURIComponent(q), 12000); }
        catch (e) {                                  /* backup: OpenStreetMap's search */
          const n = await getJSON('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&q=' + encodeURIComponent(q), 12000);
          d = { results: n.map(x => { const parts = String(x.display_name || '').split(', '); return { name: parts[0], admin1: parts.slice(1, -1).slice(0, 1)[0], country: parts.length > 1 ? parts[parts.length - 1] : '', latitude: +x.lat, longitude: +x.lon }; }) };
        }
        if (my !== seq) return;
        const have = new Set(state.local.map(l => l.name.toLowerCase()));
        state.remote = (d.results || []).filter(r => !(have.has(String(r.name).toLowerCase()) && r.population > 3e5)).slice(0, 6)
          .map(r => ({ name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', ') + (r.population ? ', ' + num(r.population) + ' people' : ''), lat: r.latitude, lon: r.longitude }));
      } catch (e) { if (my !== seq) return; state.failed = true; }
      state.loading = false; paint();
    }, 240);
  }
  input.addEventListener('input', query);
  input.addEventListener('focus', query);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!flat.length) return; e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length; paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[Math.max(idx, 0)]); }
    else if (e.key === 'Escape') { hide(); input.blur(); }
  });
  box.addEventListener('pointerdown', e => { const b = e.target.closest('[data-i]'); if (b) { e.preventDefault(); choose(flat[+b.dataset.i]); } else e.preventDefault(); });
  input.addEventListener('blur', () => setTimeout(() => { hide(); wrap.classList.remove('loading'); }, 120));
  document.addEventListener('keydown', e => {
    if ((e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); input.select(); }
  });
})();
