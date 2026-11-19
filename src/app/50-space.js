/* ============================================================
   Feeds: satellites (CelesTrak + SGP4 in the browser), space weather, launches, fireballs
   ============================================================ */
const space = { kp: null, wind: null, people: null };
const SAT_STEP = 20000;                             /* satellites are propagated every 20 s; the GPU glides them in between */
const SAT_STYLE = { starlink: [2.4, 0.9], constel: [2.5, 0.85], nav: [6, 0.95], geo: [3.2, 0.9], sats: [2.5, 0.85], debris: [1.7, 0.46], rockets: [2.8, 0.66], dead: [2.2, 0.6] };

function parseTLE(text) {
  const lines = String(text).split('\n').map(s => s.replace(/\s+$/, '')), out = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ') && !/^[12] /.test(lines[i])) { out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] }); i += 2; }
  }
  return out;
}
/* CelesTrak publishes each orbit in two forms. The table form (CSV) carries every object. The classic two-line form cannot hold
   catalogue numbers above 99,999, which everything catalogued since July 2026 receives, so it now misses the newest satellites.
   The table is read first and each row is written out as the two lines the orbit library expects; the two-line form is the backup. */
const tleNum = (v, n, d) => (+v).toFixed(d).padStart(n);
function bstarField(b) {
  if (!b || !isFinite(b)) return ' 00000+0';
  const a = Math.abs(b); let e = Math.floor(Math.log10(a)) + 1, m = Math.round(a / Math.pow(10, e) * 1e5);
  if (m >= 100000) { m = 10000; e++; }
  if (e > 9 || e < -9) return ' 00000+0';
  return (b < 0 ? '-' : ' ') + String(m).padStart(5, '0') + (e < 0 ? '-' : '+') + Math.abs(e);
}
function ommToTLE(o) {
  const t = Date.parse(/[zZ]$/.test(o.EPOCH) ? o.EPOCH : o.EPOCH + 'Z'), y = new Date(t).getUTCFullYear();
  if (!isFinite(t)) throw new Error('bad epoch');
  const doy = ((t - Date.UTC(y, 0, 1)) / 864e5 + 1).toFixed(8).padStart(12, '0');
  const id = +o.NORAD_CAT_ID, sat = String(id % 100000).padStart(5, '0'), nd = +o.MEAN_MOTION_DOT || 0;
  const m = /^(\d{4})-(\d{3})(\w*)/.exec(o.OBJECT_ID || ''), intl = (m ? m[1].slice(2) + m[2] + m[3] : '').padEnd(8).slice(0, 8);
  return { name: String(o.OBJECT_NAME || 'Object ' + id).trim(), id: String(id), intl: intl.trim(),
    l1: '1 ' + sat + 'U ' + intl + ' ' + String(y % 100).padStart(2, '0') + doy + ' ' + (nd < 0 ? '-' : ' ') + Math.abs(nd).toFixed(8).slice(1) + '  00000-0 ' + bstarField(+o.BSTAR) + ' 0  9990',
    l2: '2 ' + sat + ' ' + tleNum(o.INCLINATION, 8, 4) + ' ' + tleNum(o.RA_OF_ASC_NODE, 8, 4) + ' ' + String(Math.min(9999999, Math.round(+o.ECCENTRICITY * 1e7))).padStart(7, '0') + ' ' +
      tleNum(o.ARG_OF_PERICENTER, 8, 4) + ' ' + tleNum(o.MEAN_ANOMALY, 8, 4) + ' ' + tleNum(o.MEAN_MOTION, 11, 8) + '    10' };
}
async function parseGPcsv(text) {
  const lines = String(text).trim().split(/\r?\n/), head = csvLine(lines[0]).map(h => h.trim());
  for (const k of ['OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY']) if (!head.includes(k)) throw new Error('not orbit data');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (i % 1500 === 0) await sleep(0);              /* thousands of rows: work in slices so the globe never stutters */
    const c = lines[i].indexOf('"') < 0 ? lines[i].split(',') : csvLine(lines[i]), o = {};
    for (let k = 0; k < head.length; k++) o[head[k]] = c[k];
    if (!(+o.MEAN_MOTION > 0) || !(+o.NORAD_CAT_ID > 0)) continue;
    try { out.push(ommToTLE(o)); } catch (e) {}
  }
  if (!out.length) throw new Error('empty');
  return out;
}
const netFail = e => !!e && !e.status && (e.name === 'TypeError' || e.name === 'AbortError');       /* no answer at all, as opposed to an answer that says no */
const isGPcsv = text => /^\s*"?OBJECT_NAME/.test(text || '');
/* one CelesTrak query (a named group, or every object whose name contains a word), kept in the browser so the provider is asked rarely */
async function fetchGP(query, maxAge) {
  const key = 'gp:' + query, base = 'https://celestrak.org/NORAD/elements/gp.php?' + query;
  let text = await bigStore.get(key, maxAge || 6 * 3600000), rows = null;
  if (text) { try { rows = isGPcsv(text) ? await parseGPcsv(text) : parseTLE(text); } catch (e) {} }
  if (!rows || !rows.length) {
    try { text = await getJSON(base + '&FORMAT=csv', 90000, true); rows = await parseGPcsv(text); }
    catch (e) {
      if (e && e.status === 403) throw e;              /* asked too often: do not ask again in another form */
      text = await getJSON(base + '&FORMAT=tle', 90000, true);
      if (!/^1 \d{5}/m.test(text)) throw new Error('not orbit data');
      rows = parseTLE(text);
    }
    bigStore.set(key, text);
  }
  return rows;
}
const fetchGroup = (group, maxAge) => fetchGP('GROUP=' + group, maxAge);
/* sort the full catalogue into layers a visitor can make sense of: by fleet name first, then by how high it flies */
function categorize(tles) {
  const out = { starlink: [], constel: [], nav: [], geo: [], sats: [] };
  for (const t of tles) {
    const n = t.name.toUpperCase(), revs = parseFloat(t.l2.slice(52, 63));
    if (/^(ISS |CSS |TIANHE|WENTIAN|MENGTIAN|PROGRESS|SOYUZ|CREW DRAGON|CARGO DRAGON|SHENZHOU|TIANZHOU|CYGNUS)/.test(n)) continue;   /* the stations and craft docked to them have their own layer */
    if (n.startsWith('STARLINK')) out.starlink.push(t);
    else if (/^(ONEWEB|KUIPER|IRIDIUM|GLOBALSTAR|ORBCOMM|QIANFAN|HULIANWANG|GUOWANG|O3B|LYNK|BLUEWALKER|BLUEBIRD|E-SPACE)/.test(n)) out.constel.push(t);
    else if (/^(NAVSTAR|GPS |GLONASS|COSMOS \d+ \(7\d\d\)|GSAT0|GALILEO|BEIDOU|QZS|IRNSS|NVS-)/.test(n)) out.nav.push(t);
    else if (revs > 0.9 && revs < 1.1) out.geo.push(t);
    else out.sats.push(t);
  }
  return out;
}
function satVec(rec, date, gmst, arr, o) {
  const pv = satellite.propagate(rec, date), p = pv && pv.position;
  if (!p || !isFinite(p.x)) return false;
  const e = satellite.eciToEcf(p, gmst);
  arr[o] = e.x / EARTH_KM; arr[o + 1] = e.z / EARTH_KM; arr[o + 2] = -e.y / EARTH_KM;
  return true;
}
function satState(rec, date) {
  const pv = satellite.propagate(rec, date);
  if (!pv || !pv.position || !isFinite(pv.position.x)) return null;
  const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date)), vel = pv.velocity;
  return { lat: satellite.degreesLat(geo.latitude), lon: satellite.degreesLong(geo.longitude), alt: geo.height, speed: Math.hypot(vel.x, vel.y, vel.z) };
}
const _tmp3 = new Float32Array(3);

/* Orbit maths for thousands of satellites runs in a background worker so the globe never stutters.
   If a worker cannot start (some browsers refuse on file pages), the same work is done here in small slices. */
const WORKER_SRC = [
  "importScripts('https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js');",
  "var sets = {}, R = 6371;",
  "function fill(recs, t) { var date = new Date(t), gmst = satellite.gstime(date), out = new Float32Array(recs.length * 3);",
  "  for (var i = 0; i < recs.length; i++) { var pv = satellite.propagate(recs[i], date), p = pv && pv.position;",
  "    if (p && isFinite(p.x)) { var e = satellite.eciToEcf(p, gmst); out[i * 3] = e.x / R; out[i * 3 + 1] = e.z / R; out[i * 3 + 2] = -e.y / R; } }",
  "  return out; }",
  "onmessage = function (ev) { var m = ev.data;",
  "  if (m.type === 'init') { var recs = sets[m.key], keep = null;",
  "    if (m.l1) { recs = []; keep = []; var date = new Date(m.t);",
  "      for (var i = 0; i < m.l1.length; i++) { var r; try { r = satellite.twoline2satrec(m.l1[i], m.l2[i]); } catch (e) { continue; }",
  "        if (!r || r.error) continue; var pv = satellite.propagate(r, date); if (!pv || !pv.position || !isFinite(pv.position.x)) continue; recs.push(r); keep.push(i); }",
  "      sets[m.key] = recs; }",
  "    if (!recs) return; var A = fill(recs, m.t), B = fill(recs, m.t + m.step);",
  "    postMessage({ type: 'ready', key: m.key, keep: keep, A: A, B: B, t: m.t }, [A.buffer, B.buffer]); }",
  "  else if (m.type === 'frame') { var rs = sets[m.key]; if (!rs) return; var P = fill(rs, m.t); postMessage({ type: 'frame', key: m.key, t: m.t, P: P }, [P.buffer]); }",
  "};"
].join('\n');
let satWorker = null, satWorkerOK = typeof Worker !== 'undefined' && typeof Blob !== 'undefined';
const satWait = {};
function satReady(key) { if (satWait[key]) { satWait[key](); delete satWait[key]; } orbitChanged(); }
function getSatWorker() {
  if (satWorker || !satWorkerOK) return satWorker;
  try {
    satWorker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })));
    satWorker.onmessage = onSatMessage;
    satWorker.onerror = () => {                      /* fall back to doing the maths on this thread */
      satWorkerOK = false; satWorker = null;
      for (const key of SAT_KEYS) { const S = layers[key].sat; if (S && S.mode === 'worker') { S.mode = 'main'; S.phase = 'parse'; S.parsed = 0; S.valid = []; } }
    };
  } catch (e) { satWorkerOK = false; satWorker = null; }
  return satWorker;
}
function showSatLayer(key, A, B) {
  const L = layers[key], S = L.sat;
  if (!S.started) {
    for (let i = 0; i < S.n; i++) S.items[i].v.set(A[i * 3], A[i * 3 + 1], A[i * 3 + 2]);
    applyItems(key, S.items); S.started = true;
  } else L.pos.set(A.subarray(0, S.n * 3));
  L.posB.set(B.subarray(0, S.n * 3));
  L.geo.attributes.position.needsUpdate = true; L.geo.attributes.aPosB.needsUpdate = true;
  L.mat.uniforms.uMix.value = 0;
  satReady(key);
}
function onSatMessage(ev) {
  const m = ev.data, L = layers[m.key], S = L && L.sat;
  if (!S) return;
  if (m.type === 'ready') {
    if (m.keep) S.items = m.keep.map(i => S.items[i]);
    S.n = S.items.length;
    showSatLayer(m.key, m.A, m.B);
    S.tA = m.t; S.tB = m.t + SAT_STEP; S.C = null; S.phase = 'run';
    S.asked = S.tB + SAT_STEP; satWorker.postMessage({ type: 'frame', key: m.key, t: S.asked });
  } else if (m.type === 'frame' && m.t === S.asked) S.C = m.P;
}
function startSatLayer(key, tles) {
  const L = layers[key], st = SAT_STYLE[key];
  const items = tles.map(t => ({ layer: key, id: t.id || t.l1.slice(2, 7).trim(), title: t.name, intl: t.intl != null ? t.intl : t.l1.slice(9, 17).trim(), l1: t.l1, l2: t.l2, v: new THREE.Vector3(), size: st[0], alpha: st[1] }));
  const S = L.sat = { items, n: 0, started: false, phase: 'wait' };
  L.sync = function () {
    if (S.phase !== 'run') return;
    const m = clamp(L.mat.uniforms.uMix.value, 0, 1.5), a = L.pos, b = L.posB;
    for (let i = 0; i < L.items.length; i++) L.items[i].v.set(a[i * 3] + (b[i * 3] - a[i * 3]) * m, a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * m, a[i * 3 + 2] + (b[i * 3 + 2] - a[i * 3 + 2]) * m);
  };
  const done = new Promise(res => { satWait[key] = res; });
  if (!items.length) { applyItems(key, []); S.phase = 'run'; S.empty = true; satReady(key); return done; }
  const w = getSatWorker();
  if (w) { S.mode = 'worker'; w.postMessage({ type: 'init', key, t: Date.now(), step: SAT_STEP, l1: items.map(i => i.l1), l2: items.map(i => i.l2) }); }
  else { S.mode = 'main'; S.phase = 'parse'; S.parsed = 0; S.valid = []; }
  return done;
}
function stepSatLayer(key, now) {
  const L = layers[key], S = L.sat;
  if (!S || !L.on || S.empty || S.phase === 'wait') return;
  if (S.mode === 'worker') {
    const mix = (now - S.tA) / SAT_STEP;
    if (mix > 3) { S.phase = 'wait'; satWorker.postMessage({ type: 'init', key, t: now, step: SAT_STEP }); return; }   /* the tab was asleep */
    L.mat.uniforms.uMix.value = mix;
    if (now >= S.tB && S.C) {
      L.pos.set(L.posB.subarray(0, S.n * 3)); L.posB.set(S.C.subarray(0, S.n * 3));
      L.geo.attributes.position.needsUpdate = true; L.geo.attributes.aPosB.needsUpdate = true;
      S.tA = S.tB; S.tB += SAT_STEP; S.C = null; L.mat.uniforms.uMix.value = (now - S.tA) / SAT_STEP;
      S.asked = S.tB + SAT_STEP; satWorker.postMessage({ type: 'frame', key, t: S.asked });
    }
    return;
  }
  /* main-thread fallback, a few hundred satellites per frame */
  if (S.phase === 'parse') {
    const end = Math.min(S.items.length, S.parsed + 300), date = new Date(now), gmst = satellite.gstime(date);
    for (; S.parsed < end; S.parsed++) {
      const it = S.items[S.parsed];
      try { it.rec = satellite.twoline2satrec(it.l1, it.l2); } catch (e) { continue; }
      if (it.rec && !it.rec.error && satVec(it.rec, date, gmst, _tmp3, 0)) S.valid.push(it);
    }
    if (S.parsed >= S.items.length) { S.items = S.valid; S.n = S.items.length; S.A = new Float32Array(S.n * 3); S.B = new Float32Array(S.n * 3); S.C = new Float32Array(S.n * 3); S.phase = 'A'; S.i = 0; S.t0 = now; }
    return;
  }
  const fill = (arr, t) => {
    const date = new Date(t), gmst = satellite.gstime(date), end = Math.min(S.n, S.i + 500);
    for (; S.i < end; S.i++) satVec(S.items[S.i].rec, date, gmst, arr, S.i * 3);
    return S.i >= S.n;
  };
  if (S.phase === 'A') { if (fill(S.A, S.t0)) { S.phase = 'B'; S.i = 0; } return; }
  if (S.phase === 'B') { if (!fill(S.B, S.t0 + SAT_STEP)) return; showSatLayer(key, S.A, S.B); S.tA = S.t0; S.tB = S.t0 + SAT_STEP; S.i = 0; S.phase = 'run'; return; }
  const mix = (now - S.tA) / SAT_STEP;
  if (mix > 3) { S.phase = 'A'; S.i = 0; S.t0 = now; return; }
  L.mat.uniforms.uMix.value = mix;
  if (S.i < S.n) fill(S.C, S.tB + SAT_STEP);
  else if (now >= S.tB) {
    L.pos.set(L.posB.subarray(0, S.n * 3)); L.posB.set(S.C);
    L.geo.attributes.position.needsUpdate = true; L.geo.attributes.aPosB.needsUpdate = true;
    S.tA = S.tB; S.tB += SAT_STEP; S.i = 0; L.mat.uniforms.uMix.value = (now - S.tA) / SAT_STEP;
  }
}
/* the whole active catalogue: one download, sorted into layers */
let satCats = null, satLoading = null;
function loadAllSatellites() {
  if (satLoading) return satLoading;
  if (!window.satellite) return Promise.resolve();
  const keys = SAT_KEYS.filter(k => !JUNK[k]);
  keys.forEach(k => { if (!layers[k].sat) setCountLoading(k); });
  satLoading = (async () => {
    try {
      if (!satCats) satCats = categorize(await firstOf('sats', [['CelesTrak', () => fetchGroup('active')],
        ['SatNOGS', async () => { const d = await getJSON('https://db.satnogs.org/api/tle/?format=json', 60000); if (!Array.isArray(d) || !d.length) throw new Error('empty'); return d.map(x => ({ name: String(x.tle0 || '').replace(/^0 /, '').trim(), l1: x.tle1, l2: x.tle2 })).filter(x => x.l1 && x.l2); }]]));
      const waits = [];
      for (const k of keys) { if (layers[k].sat) continue; if (layers[k].on) waits.push(startSatLayer(k, satCats[k])); else setCount(k, satCats[k].length.toLocaleString()); }
      await Promise.race([Promise.all(waits), sleep(25000)]);
      SOURCES.sats.fullOK = true; okStatus('sats');
    } catch (e) {
      keys.forEach(k => { if (!layers[k].sat) setCount(k, '–'); });
      setStatus('sats', layers.stations.items.length ? 'warn' : 'err', 'full catalogue ' + errNote(e));
    }
    satLoading = null;
  })();
  return satLoading;
}
/* debris and spent rocket stages are loaded only when asked for: every tracked piece if CelesTrak answers the name search,
   otherwise the four largest debris clouds, which it publishes as ready-made groups */
const JUNK_SRC = {
  debris: { qs: ['NAME=DEB'], test: /\bDEB\b/, groups: ['fengyun-1c-debris', 'cosmos-2251-debris', 'iridium-33-debris', 'cosmos-1408-debris'] },
  rockets: { qs: ['NAME=R%2FB'], test: /R\/B/, groups: [] },
  dead: { qs: ['NAME=COSMOS', 'NAME=OPS', 'NAME=MOLNIYA', 'NAME=METEOR', 'NAME=RADUGA', 'NAME=GORIZONT'], test: /^(COSMOS \d|OPS \d|MOLNIYA|METEOR[ -]|RADUGA|GORIZONT)/, groups: [], notActive: true }
};
async function ensureSatLayer(key) {
  const L = layers[key];
  if (L.sat || L.loadingSat || !window.satellite) return;
  if (!JUNK[key]) { if (satCats) startSatLayer(key, satCats[key]); else loadAllSatellites(); return; }
  const src = JUNK_SRC[key];
  L.loadingSat = true; setCountLoading(key); setStatus('junk', 'load');
  try {
    let all = [], partial = false;
    const seen = new Set();
    if (src.notActive) {                              /* "dead" means not in the catalogue of working satellites, so that catalogue has to be in first */
      if (!satCats) await loadAllSatellites();
      if (!satCats) throw new Error('needs the active catalogue');
      for (const k in satCats) for (const t of satCats[k]) seen.add(+(t.id || t.l1.slice(2, 7)));
      for (const s of layers.stations.items) seen.add(+s.id);
    }
    let silent = 0;
    for (const q of src.qs) {
      try {
        for (const t of await fetchGP(q, 24 * 3600000)) {
          const id = +(t.id || t.l1.slice(2, 7));
          if (seen.has(id) || !src.test.test(t.name) || (src.notActive && /\b(DEB|R\/B)\b/.test(t.name))) continue;
          seen.add(id); all.push(t);
        }
        silent = 0;
      } catch (e) { if (netFail(e) && ++silent >= 2) break; }      /* two unanswered requests in a row: stop asking rather than queue up more */
      if (src.qs.length > 1) await sleep(350);
    }
    if (!all.length) {
      partial = true;
      for (const g of src.groups) { try { all = all.concat(await fetchGroup(g, 24 * 3600000)); } catch (e) { if (netFail(e) && !all.length) break; } await sleep(300); }
    }
    if (!all.length) throw new Error('unreachable');
    L.partial = partial;
    await Promise.race([startSatLayer(key, all), sleep(30000)]);
    setStatus('junk', partial ? 'warn' : 'ok', partial ? 'full list unavailable, showing the four largest debris clouds' : '');
  } catch (e) { setCount(key, '–'); setStatus('junk', 'err', errNote(e)); }
  L.loadingSat = false;
}

/* the two crewed stations get exact positions every frame, plus an orbit line, a tether and a visibility circle */
const STATIONS = [[25544, 'International Space Station', 'ISS'], [48274, 'Tiangong space station', 'Tiangong']];
const ORBIT_N = 200;
const orbitLine = makeLine(ORBIT_N, '#ffffff'), tether = makeLine(2, '#ffffff'), footprint = makeLine(97, '#ffffff');
tether.geometry.attributes.aAlpha.array.set([0.5, 0.05]); footprint.geometry.attributes.aAlpha.array.fill(0.22);
orbitLine.visible = tether.visible = footprint.visible = false;
let orbitFor = null, orbitDrawnAt = 0;

function stationItem(def, t) {
  const rec = satellite.twoline2satrec(t.l1, t.l2);
  const yr = rec.epochyr < 57 ? 2000 + rec.epochyr : 1900 + rec.epochyr;
  return { layer: 'stations', id: def[0], title: def[1], short: def[2], rec, v: new THREE.Vector3(0, 2, 0), lat: 0, lon: 0, alt: 420, speed: 7.66, sunlit: true,
    size: 9, alpha: 1, pulse: true, period: 2 * Math.PI / rec.no, epoch: Date.UTC(yr, 0, 1) + (rec.epochdays - 1) * 864e5 };
}
async function loadSatellites() {
  if (!window.satellite) return setStatus('sats', 'err', 'orbit library did not load');
  setStatus('sats', 'load');
  let items = [];
  try {
    const tles = await fetchGroup('stations', 3 * 3600000);
    for (const def of STATIONS) { const t = tles.find(x => +(x.id || x.l1.slice(2, 7)) === def[0]); if (t) items.push(stationItem(def, t)); }
    SOURCES.sats.note = '';
  } catch (e) {
    try {                                             /* backups: two other public sources of station orbits */
      items = await firstOf('sats', [['CelesTrak', () => Promise.reject(e)],
        ['SatNOGS', async () => { const out = []; for (const def of STATIONS) { const d = await getJSON('https://db.satnogs.org/api/tle/?format=json&norad_cat_id=' + def[0], 15000); if (d[0]) out.push(stationItem(def, { l1: d[0].tle1, l2: d[0].tle2 })); } if (!out.length) throw new Error('empty'); return out; }],
        ['wheretheiss.at', async () => { const d = await getJSON('https://api.wheretheiss.at/v1/satellites/25544/tles'); return [stationItem(STATIONS[0], { l1: d.line1, l2: d.line2 })]; }]]);
      SOURCES.sats.note = 'backup: ' + SOURCES.sats.via;
    } catch (e2) { return setStatus('sats', 'err', errNote(e)); }
  }
  items = items.filter(s => satState(s.rec, new Date()));
  if (!items.length) return setStatus('sats', 'err', 'no usable orbit data');
  updateStations(Date.now(), items);
  applyItems('stations', items); setCount('stations', 'Live'); orbitDrawnAt = 0;
  setStatus('sats', SOURCES.sats.state === 'warn' ? 'warn' : 'ok', SOURCES.sats.note);
}
function sunlitAt(v) { const d = v.dot(U.uSun.value); return !(d < 0 && v.lengthSq() - d * d < 1); }
function updateStations(now, list) {
  const date = new Date(now);
  for (const s of list || layers.stations.items) {
    const st = satState(s.rec, date); if (!st) continue;
    s.lat = st.lat; s.lon = st.lon; s.alt = st.alt; s.speed = st.speed;
    ll(st.lat, st.lon, 1 + st.alt / EARTH_KM, s.v); s.sunlit = sunlitAt(s.v);
  }
  if (!list) layers.stations.movePositions();
}
function drawOrbit(rec, now) {
  const pos = orbitLine.geometry.attributes.position.array, al = orbitLine.geometry.attributes.aAlpha.array, v = new THREE.Vector3();
  const period = 2 * Math.PI / rec.no, from = -0.13 * period, to = period * 0.98, past = Math.round(ORBIT_N * 0.13 / 1.11);
  let n = 0;
  for (let i = 0; i < ORBIT_N; i++) {
    const s = satState(rec, new Date(now + (from + (to - from) * i / (ORBIT_N - 1)) * 60000));
    if (!s) continue;
    ll(s.lat, s.lon, 1 + s.alt / EARTH_KM, v);
    pos[n * 3] = v.x; pos[n * 3 + 1] = v.y; pos[n * 3 + 2] = v.z;
    al[n] = i < past ? 0.06 + 0.2 * (i / past) : 0.62 * Math.pow(1 - (i - past) / (ORBIT_N - past), 1.3);
    n++;
  }
  orbitLine.geometry.setDrawRange(0, n);
  orbitLine.geometry.attributes.position.needsUpdate = true; orbitLine.geometry.attributes.aAlpha.needsUpdate = true;
}
const _n3 = new THREE.Vector3();
/* the satellite the orbit line follows: whatever is selected, otherwise the ISS */
function updateFocus(now) {
  let f = selected && selected.rec && layerOn(selected.layer) ? selected : (layers.stations.on && layers.stations.items[0]) || null;
  if (f && f.layer !== 'stations') {                 /* exact position for a selected satellite */
    const st = satState(f.rec, new Date(now));
    if (st) { f.lat = st.lat; f.lon = st.lon; f.alt = st.alt; f.speed = st.speed; ll(st.lat, st.lon, 1 + st.alt / EARTH_KM, f.v); f.sunlit = sunlitAt(f.v); } else f = null;
  }
  orbitLine.visible = tether.visible = footprint.visible = !!f;
  if (!f) { orbitFor = null; return; }
  const tp = tether.geometry.attributes.position.array;
  _n3.copy(f.v).normalize();
  tp[0] = f.v.x; tp[1] = f.v.y; tp[2] = f.v.z; tp[3] = _n3.x * 1.001; tp[4] = _n3.y * 1.001; tp[5] = _n3.z * 1.001;
  tether.geometry.attributes.position.needsUpdate = true;
  circleInto(footprint, _n3, Math.acos(1 / (1 + f.alt / EARTH_KM)), 1.002);
  if (orbitFor !== f || now - orbitDrawnAt > 20000) { orbitFor = f; orbitDrawnAt = now; drawOrbit(f.rec, now); }
}
liveFns.push(o => {
  for (const s of layers.stations.items) o['st-' + s.id] = num(s.speed * 3600) + ' km/h, ' + Math.round(s.alt) + ' km up, over ' + fmtLL(s.lat, s.lon);
  const f = selected;
  if (f && f.rec) {
    o['sel-pos'] = fmtLL(f.lat, f.lon); o['sel-alt'] = num(f.alt) + ' km'; o['sel-speed'] = num(f.speed * 3600) + ' km/h';
    o['sel-light'] = f.sunlit ? 'In sunlight' : 'In Earth’s shadow';
  }
});

/* ---------- space weather (NOAA SWPC) ---------- */
async function loadSpaceWeather() {
  setStatus('swpc', 'load');
  let ok = 0, err = null;
  try {
    const rows = await firstOf('swpc', [['NOAA', async () => {
      const d = await getJSON('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', 20000, false, KEEP);
      return Array.isArray(d[0]) ? d.slice(1).map(r => ({ t: parseUTC(r[0]), kp: +r[1] })) : d.map(o => ({ t: parseUTC(o.time_tag), kp: +(o.Kp != null ? o.Kp : o.kp_index) }));
    }], ['GFZ Potsdam', async () => {
      const iso = t => new Date(t).toISOString().slice(0, 19) + 'Z';
      const d = await getJSON('https://kp.gfz-potsdam.de/app/json/?start=' + iso(Date.now() - 3 * 864e5) + '&end=' + iso(Date.now()) + '&index=Kp', 20000);
      return (d.datetime || []).map((t, i) => ({ t: Date.parse(t), kp: +d.Kp[i] }));
    }]]);
    space.kp = rows.filter(r => isFinite(r.kp)); if (!space.kp.length) throw new Error('empty'); ok++;
  } catch (e) { err = e; }
  try {
    const d = await getJSON('https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json', 20000, false, KEEP);
    const o = Array.isArray(d) ? d[0] : d; const v = +(o.proton_speed != null ? o.proton_speed : o.WindSpeed);
    if (isFinite(v)) space.wind = v; ok++;
  } catch (e) { err = e; }
  try {
    const d = await getJSON('https://services.swpc.noaa.gov/products/alerts.json', 20000, false, KEEP);
    extra.swxalert = d.slice(0, 30).map((a, i) => {
      const lines = String(a.message || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const head = lines.find(l => /^(CONTINUED |EXTENDED |CANCEL )?(ALERT|WARNING|WATCH|SUMMARY):/.test(l)) || lines[0] || 'Space weather message';
      return { layer: 'swxalert', id: a.product_id + '-' + a.issue_datetime, title: cap(head.replace(/^([A-Z ]+):\s*/, (m, w) => cap(w.toLowerCase()) + ': ')), message: lines.join('\n'), time: parseUTC(a.issue_datetime) };
    }).filter(a => isFinite(a.time)).sort((a, b) => b.time - a.time);
    ok++;
  } catch (e) { err = e; }
  dirty.summary = dirty.feed = true;
  if (selected && selected.layer === 'swx') renderDetail();
  ok ? okStatus('swpc') : setStatus('swpc', 'err', errNote(err));
}
async function loadAurora() {
  try {
    const d = await getJSON('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', 40000, false, KEEP);
    if (d && Array.isArray(d.coordinates)) aurora.set(d.coordinates);
  } catch (e) {}
}

/* ---------- launches and the people in space (Launch Library 2; cached because the free tier allows 15 requests an hour) ---------- */
async function loadLaunches() {
  setStatus('ll2', 'load');
  try {
    let list = store.get('launches', 20 * 60000), old = false;
    if (!list) try {
      const d = await getJSON('https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=14&format=json', 30000);
      list = (d.results || []).map(l => {
        const pad = l.pad || {}, m = l.mission || {}, img = l.image;
        return { id: l.id, title: l.name, time: Date.parse(l.net), status: l.status && l.status.name, provider: l.launch_service_provider && l.launch_service_provider.name,
          rocket: l.rocket && l.rocket.configuration && (l.rocket.configuration.full_name || l.rocket.configuration.name), desc: m.description, orbit: m.orbit && m.orbit.name,
          pad: pad.name, site: pad.location && pad.location.name, lat: +pad.latitude, lon: +pad.longitude,
          img: img && (typeof img === 'string' ? img : img.thumbnail_url || img.image_url), video: m.vid_urls && m.vid_urls[0] && m.vid_urls[0].url, info: m.info_urls && m.info_urls[0] && m.info_urls[0].url };
      });
      store.set('launches', list);
    } catch (e) { list = store.get('launches'); old = true; if (!list) throw e; }
    const items = list.filter(l => isFinite(l.lat) && isFinite(l.lon) && l.time > Date.now() - 3600000).sort((a, b) => a.time - b.time)
      .map(l => Object.assign({ layer: 'launches', size: 11, alpha: 0.95, pulse: l.time - Date.now() < 864e5, v: ll(l.lat, l.lon, 1.005) }, l, { img: safeUrl(l.img) }));
    applyItems('launches', items);
    old ? setStatus('ll2', 'warn', 'provider busy, showing the last saved list') : setStatus('ll2', 'ok');
  } catch (e) { setStatus('ll2', e.status === 429 ? 'warn' : 'err', e.status === 429 ? 'hourly limit reached, retrying later' : errNote(e)); }
  try {
    let people = store.get('people', 6 * 3600000);
    if (!people) {
      const d = await getJSON('https://ll.thespacedevs.com/2.3.0/astronauts/?in_space=true&limit=40&format=json&mode=list', 30000);
      people = (d.results || []).filter(a => !(a.type && /non-human/i.test(a.type.name || '')) && !/^(Starman|Laika)$/i.test(a.name)).map(a => ({ name: a.name, agency: (a.agency && (a.agency.abbrev || a.agency.name)) || '' }));
      store.set('people', people);
    }
    space.people = people; dirty.summary = true;
  } catch (e) {}
}

/* ---------- fireballs and asteroid flybys (NASA JPL) ---------- */
async function loadJPL() {
  setStatus('jpl', 'load');
  let ok = 0, err = null;
  try {
    let rows = store.get('fireballs', 6 * 3600000);
    if (!rows) try {
      const d = await getJSON('https://ssd-api.jpl.nasa.gov/fireball.api?limit=60', 25000), f = d.fields;
      rows = (d.data || []).map(r => { const o = {}; f.forEach((k, i) => { o[k] = r[i]; }); return o; });
      store.set('fireballs', rows);
    } catch (e) { rows = store.get('fireballs'); if (!rows) throw e; }
    const items = [];
    for (const o of rows) {
      if (o.lat == null || o.lon == null) continue;
      const it = { layer: 'fireballs', id: o.date, title: 'Fireball, ' + (o['impact-e'] || '?') + ' kt', time: parseUTC(o.date),
        lat: +o.lat * (o['lat-dir'] === 'S' ? -1 : 1), lon: +o.lon * (o['lon-dir'] === 'W' ? -1 : 1), impact: o['impact-e'], alt: o.alt, vel: o.vel, alpha: 0.9 };
      if (!isFinite(it.time) || Date.now() - it.time > 366 * 864e5) continue;
      it.size = clamp(9 + 4 * Math.log10(1 + (+o['impact-e'] || 0) * 10), 9, 22); it.v = ll(it.lat, it.lon, 1.006); items.push(it);
    }
    applyItems('fireballs', items); ok++;
  } catch (e) { err = e; }
  try {
    let rows = store.get('flybys', 6 * 3600000);
    if (!rows) {
      const d = await getJSON('https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B10&dist-max=0.05&sort=date', 25000), f = d.fields;
      rows = (d.data || []).map(r => { const o = {}; f.forEach((k, i) => { o[k] = r[i]; }); return o; });
      store.set('flybys', rows);
    }
    extra.flybys = rows.map(o => {
      const m = /(\d+)-(\w+)-(\d+) (\d+):(\d+)/.exec(o.cd || '');
      return { name: o.des, time: m ? Date.parse(m[3] + ' ' + m[2] + ' ' + m[1] + ' ' + m[4] + ':' + m[5] + ' UTC') : NaN, ld: +o.dist * 389.17, size: 1329000 / Math.sqrt(0.14) * Math.pow(10, -(+o.h) / 5) };
    }).filter(a => isFinite(a.time) && isFinite(a.ld));
    dirty.summary = true; ok++;
  } catch (e) { err = e; }
  ok ? setStatus('jpl', 'ok') : setStatus('jpl', 'err', errNote(err));
}
