/* ============================================================
   Tour: the globe flies itself round every notable event happening on the planet right now.

   The stops are chosen from live data each time the tour starts (and again on every lap), and put in an order that makes one
   flowing trip. The camera leaves the usual "whole Earth, north up" view and flies like a spacecraft: it climbs between
   stops, banks into its turns, comes in low over each place, looks across it toward the horizon and drifts round it. The
   caption for the next event appears as the flight begins, so there is something to read all the way there. A panel shows
   everything on the globe by kind, what else is happening near the event on screen, and what comes next.
   The rest of the interface steps aside for the duration and comes back untouched.

   The camera is described by seven numbers (tour.rig): the point on the ground it is interested in, how far to one side of
   that point it sits and in which compass direction, how high it is, and where it looks. The same compass direction decides
   which way is up on screen. Flying between two stops is a smooth blend of those numbers, so the view never snaps or rolls
   suddenly.
   ============================================================ */
const TP = ['flat', 'flon', 'off', 'bear', 'dist', 'lookR', 'lead'], T_ANG = { flon: 1, bear: 1 };
const tRig = () => ({ flat: 0, flon: 0, off: 0, bear: 180, dist: 4, lookR: 0, lead: 0 });
const TOUR_PACE = [['Relaxed', 0.72], ['Normal', 1], ['Brisk', 1.4]];
const tour = { on: false, paused: false, hover: false, leaving: false, list: [], i: -1, phase: 'idle', time: 0, t0: 0, dur: 1, held: 0, hold: 6000, lastNow: 0, hump: 0, capAt: 0, rate: 1,
  rig: tRig(), from: tRig(), to: tRig(), tmp: tRig(), vel: tRig(), v0: tRig(), prev: tRig(), prevOk: false, bank: 0,
  look: new THREE.Vector3(), ahead: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 1, 0), focus: new THREE.Vector3(),
  showRing: false, capShown: -1, fill: null, counts: [], teleAt: 0, warp: 0, power: 0, travel: 0, lead: 0, km: 0, lastC: null, trailN: 0, leg: false, off: 0, off0: 0, idleAt: 0, wake: null, fs: false, laps: 0, exit: null, spin: false, arcT: -1, fresh: false, ride: false, launch: 0 };
const tourEl = $('#tour'), tourRing = $('#tour-ring');
const TE = { kick: $('#tour-kick'), title: $('#tour-title'), text: $('#tour-text'), facts: $('#tour-facts'), place: $('#tour-place'), dots: $('#tour-dots'), count: $('#tour-count'),
  cats: $('#tour-cats'), near: $('#tour-near'), nearBox: $('#tour-near-box'), next: $('#tour-queue'), alt: $('#tt-alt'), pos: $('#tt-pos'), km: $('#tt-km'), clock: $('#tour-clock'), play: $('#tour-play'), pace: $('#tour-pace'), music: $('#tour-music'), sweep: $('#tour-sweep') };
const tSmooth = k => k * k * k * (k * (k * 6 - 15) + 10), tEase = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const tFly = k => 0.45 * k * k * (3 - 2 * k) + 0.55 * tSmooth(k);      /* how far along a flight is at each moment: a gentle start and finish, a steady middle */
const TQ = new THREE.Quaternion(), TV = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3() }, TO = { a: { lat: 0, lon: 0 }, b: { lat: 0, lon: 0 }, c: { lat: 0, lon: 0 } };
/* the path of the flight in progress, drawn on the ground from where the camera was to where it is going */
const TOUR_ARC = 72, tourArc = makeLine(TOUR_ARC, '#ffffff', null, 0); tourArc.visible = false;
/* and the way the tour has come so far this lap, left behind on the ground as a faint line from event to event */
const TRAIL_LEG = 24, TRAIL_MAX = 72, tourTrail = makeLine(TRAIL_LEG * 2 * TRAIL_MAX, '#ffffff', THREE.LineSegments, 0); tourTrail.visible = false; tourTrail.geometry.setDrawRange(0, 0);

/* a point a given angle away from another in a compass direction, and the compass direction from one point to another */
function offsetLL(lat, lon, deg, bearing, out) {
  out = out || { lat: 0, lon: 0 };
  if (!deg) { out.lat = lat; out.lon = lon; return out; }
  const f = lat * D2R, d = deg * D2R, b = bearing * D2R, la = Math.asin(clamp(Math.sin(f) * Math.cos(d) + Math.cos(f) * Math.sin(d) * Math.cos(b), -1, 1));
  out.lat = la * R2D; out.lon = wrapLon(lon + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(f), Math.cos(d) - Math.sin(f) * Math.sin(la)) * R2D);
  return out;
}
function bearingLL(la1, lo1, la2, lo2) {
  const f1 = la1 * D2R, f2 = la2 * D2R, dl = (lo2 - lo1) * D2R;
  return (Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) * R2D + 360) % 360;
}

/* ---------- where the camera should be for a stop, a given number of seconds after arriving ----------
   wide:  the whole Earth, north up, turning slowly, optionally pulling back
   low:   a low pass: the camera sits to one side of the subject and looks across it at the horizon, circling slowly
   chase: the same, but placed behind something that is moving (a space station, a satellite) */
function shotAt(s, t, o) {
  const sm = reduceMotion || t <= 0 ? 0 : t - 1.1 * (1 - Math.exp(-t / 1.1));          /* the drift eases in, so arriving and drifting join without a jolt */
  if (s.shot === 'wide') {
    const u = clamp(t * 1000 / (s.span || s.hold), 0, 1);
    if (s.sweep) {                                     /* the opening: one slow swing round the planet, rising over it and drawing back, then closing in again, still moving as it hands over */
      const e = reduceMotion ? 0 : 0.78 * u * u * (3 - 2 * u) + 0.22 * u * u, arc = reduceMotion ? 0 : Math.pow(Math.sin(Math.PI * u), 2);
      /* it starts with whatever turn the globe already had and lets that die away as its own swing gathers, so the globe never stops to begin */
      o.flat = s.lat + s.rise * arc; o.flon = wrapLon(s.lon + s.sweep * e + (s.v0 ? s.v0 * 1.2 * (1 - Math.exp(-t / 1.2)) : 0));
      o.dist = s.dist0 + (s.dist1 - s.dist0) * tEase(u) + s.back * arc;
    } else {
      o.flat = s.lat; o.flon = wrapLon(s.lon + (s.spin == null ? 3.6 : s.spin) * sm);
      o.dist = s.dist0 + ((s.dist1 || s.dist0) - s.dist0) * tEase(u);
    }
    o.off = 0; o.bear = 180; o.lookR = 0; o.lead = 0; return o;
  }
  const f = s.at();
  let bear = s.bearing;
  if (s.shot === 'chase') { const n = s.at(20000); bear = bearingLL(f.lat, f.lon, n.lat, n.lon) + 180 + (s.side || 0); }     /* behind it, whichever way it is travelling */
  o.flat = f.lat; o.flon = f.lon; o.off = s.off; o.bear = bear + (s.swing || 0) * sm;
  o.dist = 1 + s.alt * (1 - 0.15 * clamp(sm * 1000 / s.hold, 0, 1));
  o.lookR = f.r || 1; o.lead = s.lead; return o;
}
/* turn the numbers into a camera position, a point to look at, and the direction along the ground that should point up on screen */
function rigApply(P) {
  const c = offsetLL(P.flat, P.flon, P.off, P.bear, TO.a), a = offsetLL(P.flat, P.flon, P.lead, P.bear + 180, TO.b), n = offsetLL(P.flat, P.flon, 0.5, P.bear + 180, TO.c);
  ll(c.lat, c.lon, clamp(P.dist, controls.minDistance, controls.maxDistance), camera.position);
  ll(a.lat, a.lon, P.lookR, tour.look);
  ll(n.lat, n.lon, 1, tour.ahead).sub(ll(P.flat, P.flon, 1, TV.c)).normalize();
}

/* ---------- captions are built from plain text, which is escaped; H() marks ready-made markup that keeps itself up to date
   (a countdown, a clock), and N() a number that counts up when the caption appears ---------- */
const H = html => ({ html }), N = (n, suf, dec, pre) => (isFinite(n) ? { n: +n, suf: suf || '', dec: dec || 0, pre: pre || '' } : null);
const tNum = (n, dec) => (+n).toLocaleString(undefined, { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
const tHTML = v => (Array.isArray(v) ? v.map(tHTML).join('') : v && v.html != null ? v.html : v && v.n != null ? esc(v.pre) + '<span data-n="' + v.n + '" data-dec="' + v.dec + '">' + tNum(v.n, v.dec) + '</span>' + esc(v.suf) : esc(String(v)));
const tPlain = v => (Array.isArray(v) ? v.map(tPlain).join('') : v && v.html != null ? 'in 0 h 00 min' : v && v.n != null ? '000' : String(v));
const tClock = off => H('<span data-clock="' + (+off) + '">' + clockAt(+off) + '</span>');
const tClip = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, Math.max(8, s.lastIndexOf(' ', n - 2))).replace(/[,;:.\s]+$/, '') + '…' : s; };
const tWhere = (lat, lon) => { const c = nearestCity(lat, lon); return c ? c.charAt(0).toLowerCase() + c.slice(1) : fmtLL(lat, lon); };
const tDir = d => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((d % 360) + 360) % 360) / 45) % 8];
const tNth = n => n + (n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
/* the energy an earthquake radiates, by the standard relation, in terms people have a feel for */
const tTNT = m => { const t = Math.pow(10, 1.5 * m + 4.8) / 4.184e9; return t < 1 ? Math.max(1, Math.round(t * 1000)) + ' kg of TNT' : t < 1000 ? num(t) + ' tonnes of TNT' : t < 1e6 ? num(t / 1000) + ' kilotons of TNT' : (t / 1e6).toFixed(t < 1e7 ? 1 : 0) + ' megatons of TNT'; };
const tStormWord = k => (k < 34 ? 'Tropical depression' : k < 64 ? 'Tropical storm' : 'Category ' + (k < 83 ? 1 : k < 96 ? 2 : k < 113 ? 3 : k < 137 ? 4 : 5) + ' hurricane');
const T_LEVEL = { Red: '#ff453a', Orange: '#ff9f0a', Green: '#30d158', Extreme: '#ff453a', Severe: '#ff9f0a', Moderate: '#ffd60a' };
const tChip = (text, layer, level) => (text ? { text: String(text), c: T_LEVEL[level] || (LAYERS[layer] && LAYERS[layer].color) || '#f5f5f7' } : null);
/* the busiest squares on a grid laid over a set of points */
function clusters(items, cell, n) {
  const bins = new Map();
  for (const it of items) {
    if (!isFinite(it.lat) || !isFinite(it.lon)) continue;
    const k = Math.floor((it.lat + 90) / cell) * 1000 + Math.floor((wrapLon(it.lon) + 180) / cell); let b = bins.get(k);
    if (!b) bins.set(k, b = { n: 0, la: 0, lo: 0, items: [] });
    b.n++; b.la += it.lat; b.lo += wrapLon(it.lon); b.items.push(it);
  }
  return Array.from(bins.values()).sort((a, b) => b.n - a.n).slice(0, n).map(b => ({ n: b.n, lat: b.la / b.n, lon: b.lo / b.n, items: b.items }));
}
/* put the stops in an order that makes one flowing trip of them: nearest first from where the camera is, then untangled so the
   path does not cross itself */
function tourRoute(stops, lat0, lon0) {
  let P = [{ pt: { lat: lat0, lon: lon0 } }]; const left = stops.slice(), n = left.length + 1, D = new Float64Array(n * n).fill(-1);
  P[0].ri = 0; left.forEach((s, i) => { s.ri = i + 1; });
  /* each distance is worked out once and remembered: the untangling below asks for the same ones over and over */
  const d = (a, b) => { const k = a.ri * n + b.ri; return D[k] >= 0 ? D[k] : (D[k] = gcKm(a.pt.lat, a.pt.lon, b.pt.lat, b.pt.lon)); };
  const len = Q => { let t = 0; for (let i = 1; i < Q.length; i++) t += d(Q[i - 1], Q[i]); return t; };
  while (left.length) { const cur = P[P.length - 1]; let bi = 0, bd = Infinity; for (let i = 0; i < left.length; i++) { const x = d(cur, left[i]); if (x < bd) { bd = x; bi = i; } } P.push(left.splice(bi, 1)[0]); }
  for (let pass = 0, better = true; better && pass < 40; pass++) {
    better = false;
    /* turn a stretch of the route round wherever that shortens it */
    for (let i = 1; i < P.length - 1; i++) for (let j = i + 1; j < P.length; j++) {
      const was = d(P[i - 1], P[i]) + (j + 1 < P.length ? d(P[j], P[j + 1]) : 0), now = d(P[i - 1], P[j]) + (j + 1 < P.length ? d(P[i], P[j + 1]) : 0);
      if (now < was - 1) { let a = i, b = j; while (a < b) { const t = P[a]; P[a] = P[b]; P[b] = t; a++; b--; } better = true; }
    }
    /* and move any single stop to wherever in the route it costs least, so one far-off event does not drag the camera there and back */
    for (let i = 1; i < P.length; i++) {
      const s = P[i], rest = P.slice(0, i).concat(P.slice(i + 1)), base = len(P), without = len(rest); let best = base - 1, at = -1;
      for (let j = 1; j <= rest.length; j++) { const t = without + d(rest[j - 1], s) + (j < rest.length ? d(s, rest[j]) - d(rest[j - 1], rest[j]) : 0); if (t < best) { best = t; at = j; } }
      if (at >= 0) { rest.splice(at, 0, s); P = rest; better = true; }
    }
  }
  return P.slice(1);
}

/* ---------- the stops: every notable event on the globe right now, and nothing else ----------
   Earthquakes, storms, fires, volcanoes, disaster alerts, weather warnings, icebergs, fireballs, the news, rocket launches,
   and what is going on overhead (the aurora, a solar flare, a close pass between two satellites, an asteroid going by). */
function buildTour(opening) {
  const G = [], now = Date.now(), on = k => !!(layers[k] && layers[k].on && layers[k].items.length);
  const fin = s => {
    s.facts = (s.facts || []).filter(f => f && f[1] != null && f[1] !== '').slice(0, 4);
    /* long enough to read, no longer: the caption has already been up for the whole flight */
    if (!s.hold) s.hold = clamp(2500 + (s.title.length + (s.sub || '').length + tPlain(s.text).length) * 14 + s.facts.length * 160, 3900, 6800);
    return s;
  };
  /* an event at a fixed place: the camera comes in low beside it and looks across it at the horizon */
  const ev = (item, lat, lon, more) => { if (!isFinite(lat) || !isFinite(lon)) return null; const at = { lat, lon, r: 1 }, s = fin(Object.assign({ shot: 'low', alt: 0.5, off: 23, lead: 4, pt: { lat, lon }, at: () => at, item, also: folded }, more)); G.push(s); return s; };
  const sunV = U.uSun.value, sub = vecLL(sunV), c0 = camLL(), win = { hour: 'hour', day: 'day', week: 'week' }[prefs.win] || 'day';
  const alerts = on('alerts') ? layers.alerts.items.slice() : [];
  /* a UN alert about something that already has a stop of its own is folded into that stop instead of being told twice */
  const folded = [], fold = (type, lat, lon, km) => { const i = alerts.findIndex(a => String(a.id).slice(0, 2) === type && gcKm(lat, lon, a.lat, a.lon) < km); if (i < 0) return null; const a = alerts.splice(i, 1)[0]; folded.push(a); return a; };
  const unFact = a => (a ? ['UN alert level', a.level] : null);

  if (on('quakes')) {
    const all = layers.quakes.items.slice().sort((a, b) => b.mag - a.mag), picked = [];
    for (const q of all) { if (picked.length >= 4 || (picked.length >= 2 && q.mag < 5)) break; if (!picked.some(p => gcKm(p.lat, p.lon, q.lat, q.lon) < 250)) picked.push(q); }
    picked.forEach(q => {
      const rank = all.indexOf(q), a = fold('EQ', q.lat, q.lon, 250);
      ev(q, q.lat, q.lon, { key: 'quake:' + q.id, cat: 'quakes', layer: 'quakes', kick: 'Earthquake', chip: tChip(cap(quakeWord(q.mag)), 'quakes', a && a.level), time: q.time,
        title: 'Magnitude ' + q.mag.toFixed(1) + ' earthquake', sub: tClip(q.place || cap(tWhere(q.lat, q.lon)), 64),
        text: quakeMeaning(q.mag) + (q.tsunami ? ' A tsunami message was issued for it.' : '') + (rank === 0 ? ' It is the strongest of the past ' + win + '.' : ''),
        facts: [['Magnitude', N(q.mag, '', 1)], isFinite(q.depth) ? ['Depth', N(q.depth, ' km')] : null, ['Energy released', tTNT(q.mag)], q.felt ? ['Felt by', N(q.felt, ' people')] : unFact(a) || (q.alert ? ['Damage alert', cap(q.alert)] : ['Rank, past ' + win, (rank ? tNth(rank + 1) : 'Strongest') + ' of ' + all.length])] });
    });
  }
  if (on('storms')) layers.storms.items.slice().sort((a, b) => (b.mag || 0) - (a.mag || 0)).slice(0, 4).forEach(s => {
    const kts = s.mag && s.magUnit === 'kts' ? s.mag : null, tr = s.track && s.track.length > 1 ? s.track : null, a = fold('TC', s.lat, s.lon, 900);
    ev(s, s.lat, s.lon, { key: 'storm:' + s.id, cat: 'storms', layer: 'storms', alt: 0.66, off: 26, kick: 'Severe storm', chip: tChip(kts ? tStormWord(kts) : a && a.level + ' alert', 'storms', a && a.level), time: s.time, title: tClip(s.title, 70),
      text: 'A tropical storm being followed by NASA’s natural event tracker.' + (tr ? ' The line trailing behind it is the path it has taken so far.' : ''),
      facts: [kts ? ['Winds', N(kts * 1.852, ' km/h')] : null, tr ? ['Heading', cap(tDir(bearingLL(tr[tr.length - 2][1], tr[tr.length - 2][0], tr[tr.length - 1][1], tr[tr.length - 1][0])))] : null, tr ? ['Positions logged', N(tr.length)] : null, unFact(a), a && a.country ? ['Affecting', tClip(a.country, 30)] : null] });
  });
  if (on('fires')) layers.fires.items.slice().sort((a, b) => b.time - a.time).slice(0, 2).forEach(f => {
    const a = fold('WF', f.lat, f.lon, 300), hot = on('hotspots') ? layers.hotspots.items.filter(h => gcKm(f.lat, f.lon, h.lat, h.lon) < 200).length : 0;
    ev(f, f.lat, f.lon, { key: 'fire:' + f.id, cat: 'fires', layer: 'fires', kick: 'Wildfire', chip: tChip(a && a.level + ' alert', 'fires', a && a.level), time: f.time, title: tClip(f.title, 70),
      text: 'A wildfire large enough to be followed by NASA’s natural event tracker.' + (hot ? ' Satellites picked out ' + num(hot) + ' patches of heat within 200 km of it in the past day.' : ''),
      facts: [f.mag && f.magUnit === 'acres' ? ['Area burned', N(f.mag * 0.4047, ' hectares')] : null, hot ? ['Hot spots nearby', N(hot)] : null, ['Wildfires being followed', N(layers.fires.items.length)], unFact(a)] });
  });
  if (on('hotspots')) {
    const d = clusters(layers.hotspots.items, 6, 1)[0], frp = d ? Math.max.apply(null, d.items.map(x => +x.frp || 0)) : 0;
    if (d && d.n >= 3) ev(null, d.lat, d.lon, { key: 'hotspots', cat: 'hotspots', layer: 'hotspots', alt: 0.46, kick: 'Fires seen from orbit',
      title: d.n.toLocaleString() + ' fires burning in one region', text: 'Each orange dot is a patch of heat that a satellite picked out within the last day. Many are farm and grass fires. The big clusters are wildfires.',
      facts: [['In this region', N(d.n)], ['Seen worldwide today', N(layers.hotspots.items.length)], frp > 0 ? ['Fiercest here', N(frp, ' megawatts')] : null] });
  }
  if (on('volcanoes')) layers.volcanoes.items.slice(0, 3).forEach(v => {
    const a = fold('VO', v.lat, v.lon, 200);
    ev(v, v.lat, v.lon, { key: 'volcano:' + v.id, cat: 'volcanoes', layer: 'volcanoes', kick: 'Volcano', chip: tChip(a && a.level + ' alert', 'volcanoes', a && a.level), time: v.time, title: tClip(v.title, 70),
      text: 'Eruption or unrest reported here in recent weeks. Ash from a large eruption can close the sky to aircraft for hundreds of kilometres around.',
      facts: [['Last report', H(agoSpan(v.time))], ['Restless volcanoes listed', N(layers.volcanoes.items.length)], unFact(a)] });
  });
  if (on('ice')) { const i = layers.ice.items.slice().sort((a, b) => b.time - a.time)[0];
    ev(i, i.lat, i.lon, { key: 'ice:' + i.id, cat: 'ice', layer: 'ice', alt: 0.56, bearing: i.lat > 0 ? 180 : 0, fixed: true, swing: 1.6, kick: 'Iceberg', time: i.time, title: tClip(i.title, 70),
      text: 'A giant iceberg that broke off an ice shelf and is being followed as it drifts. The largest are bigger than cities and can last for years.',
      facts: [['Last report', H(agoSpan(i.time))], i.track && i.track.length > 1 ? ['Positions logged', N(i.track.length)] : null, ['Icebergs being followed', N(layers.ice.items.length)]] }); }
  if (on('other')) layers.other.items.slice().sort((a, b) => b.time - a.time).slice(0, 2).forEach(o => ev(o, o.lat, o.lon, { key: 'other:' + o.id, cat: 'other', layer: 'other', kick: o.kind || 'Natural event', time: o.time, title: tClip(o.title, 70),
    text: 'One of the natural events NASA is following from orbit at the moment.', facts: [['Last report', H(agoSpan(o.time))], ['Kind', o.kind || 'Natural event']] }));
  /* whatever the UN and EU alert system has flagged that was not told above, most serious first */
  const rank = x => (x.level === 'Red' ? 2 : x.level === 'Orange' ? 1 : 0);
  alerts.sort((x, y) => rank(y) - rank(x) || y.time - x.time).slice(0, 4).forEach(a => ev(a, a.lat, a.lon, { key: 'alert:' + a.id, cat: 'alerts', layer: 'alerts', alt: 0.52, kick: a.kind, chip: tChip(a.level + ' alert', 'alerts', a.level), time: a.time, title: tClip(a.title, 80),
    text: (a.desc ? tClip(a.desc, 150).replace(/[.\s]*$/, m => (/…$/.test(a.desc.slice(0, 151)) ? m : '.')).replace(/…\.$/, '…') + ' ' : '') + 'Flagged by the disaster alert system run for the United Nations and the European Union.',
    facts: [a.country ? ['Country', tClip(a.country, 30)] : null, a.severity ? ['Measured', tClip(a.severity, 34)] : null, isFinite(a.from) ? ['Began', H(agoSpan(a.from))] : null, ['Alerts in force', N(layers.alerts.items.length)]] }));
  if (on('warnings')) {
    const sev = x => ({ Extreme: 2, Severe: 1 }[x.sev] || 0), seen = {};
    layers.warnings.items.filter(w => sev(w) > 0).sort((x, y) => sev(y) - sev(x) || y.time - x.time).filter(w => !seen[w.title] && (seen[w.title] = 1)).slice(0, 2).forEach(w => ev(w, w.lat, w.lon, { key: 'warning:' + w.id, cat: 'warnings', layer: 'warnings', alt: 0.42, off: 21,
      kick: 'Weather warning, United States', chip: tChip(w.sev, 'warnings', w.sev), time: w.time, title: tClip(w.title, 60), text: tClip(w.headline || w.desc || 'Issued by the US National Weather Service for the area marked on the ground.', 190),
      facts: [w.area ? ['Area', tClip(w.area, 34)] : null, isFinite(w.until) && w.until > now ? ['Runs out', H(untilSpan(w.until))] : null, ['In force nationwide', N(extra.nwsTotal || layers.warnings.items.length)], w.by ? ['Issued by', tClip(String(w.by).replace(/^NWS\s+/, ''), 26)] : null] }));
  }
  if (on('fireballs')) { const f = layers.fireballs.items.slice().sort((a, b) => b.time - a.time)[0];
    if (now - f.time < 45 * 864e5) ev(f, f.lat, f.lon, { key: 'fireball:' + f.id, cat: 'fireballs', layer: 'fireballs', kick: 'Fireball', time: f.time, title: 'A fireball lit up the sky here',
      text: 'A piece of space rock hit the air' + (+f.vel > 0 ? ' at ' + (+f.vel).toFixed(1) + ' km a second' : '') + ' and blew apart' + (+f.alt > 0 ? ' about ' + Math.round(+f.alt) + ' km up' : '') + '. Government sensors that watch the sky for explosions caught the flash.',
      facts: [+f.impact > 0 ? ['Energy', (+f.impact < 1 ? Math.round(+f.impact * 1000) + ' tonnes of TNT' : (+f.impact).toFixed(1) + ' kilotons of TNT')] : null, +f.alt > 0 ? ['Height', N(+f.alt, ' km')] : null, +f.vel > 0 ? ['Speed', N(+f.vel * 3600, ' km/h')] : null, ['Recorded this year', N(layers.fireballs.items.length)]] }); }
  if (on('news')) { const told = {};
    layers.news.items.filter(n => !told[n.title] && (told[n.title] = 1)).slice(0, 6).forEach(n => {
      const links = (n.links || []).filter(l => l && l.length < 34).slice(0, 2);
      ev(n, n.lat, n.lon, { key: 'news:' + n.id, cat: 'news', layer: 'news', kick: 'In the news', chip: n.cat ? { text: tClip(n.cat, 36), c: 'rgba(235,235,245,.8)' } : null, title: tClip(n.title, 150), text: '',
        facts: [n.dateLabel ? ['Reported', n.dateLabel] : null, ['Stories on the globe', N(layers.news.items.length)], links.length ? ['Related on Wikipedia', links.join(', ')] : null] });
    }); }
  if (on('launches')) { const up = layers.launches.items.filter(l => l.time > now);
    up.filter((l, i) => i === 0 || l.time - now < 7 * 864e5).slice(0, 2).forEach((l, i) => ev(l, l.lat, l.lon, { key: 'launch:' + l.id, cat: 'launches', layer: 'launches', alt: 0.44, off: 21, kick: i ? 'Rocket launch' : 'Next rocket launch', chip: tChip(l.status, 'launches'), when: H(untilSpan(l.time)), title: tClip(l.title, 80),
      text: ['On the pad' + (l.site ? ' at ' + tClip(l.site, 60) : '') + ', due to leave the ground ', H(untilSpan(l.time)), '.', l.desc ? ' ' + tClip(l.desc, 130) : ''],
      facts: [['Lift-off', H(untilSpan(l.time))], l.provider ? ['Flown by', tClip(l.provider, 30)] : null, l.rocket ? ['Rocket', tClip(l.rocket, 26)] : null, l.orbit ? ['Heading for', tClip(l.orbit, 26)] : null] })); }

  /* overhead: the aurora where it is brightest in the dark, and the Sun's latest outburst over the side of the Earth that faces it */
  const kp = space.kp && space.kp.length ? space.kp[space.kp.length - 1].kp : null;
  if (aurora.ready && isOn('aurora') && aurora.max >= 15) {
    let best = null;
    for (let la = -84; la <= 84; la += 2) { if (Math.abs(la) < 46) continue; for (let lo = -180; lo < 180; lo += 4) { const p = aurora.at(la, lo); if (p > 6 && ll(la, lo, 1, TV.a).dot(sunV) < -0.1 && (!best || p > best.p)) best = { p, la, lo }; } }
    if (best) ev(null, best.la, best.lo, { key: 'aurora', cat: 'swx', layer: 'aurora', alt: 0.5, off: 27, lead: 9, bearing: best.la > 0 ? 180 : 0, fixed: true, swing: 1.5, kick: best.la > 0 ? 'Northern lights' : 'Southern lights', chip: tChip(kp != null ? 'Kp ' + kp.toFixed(1) : null, 'aurora'),
      title: (c => (c ? (/^In /.test(c) ? 'Aurora over ' : 'Aurora near ') + c.replace(/^In |^[\d,.\s]+km from /, '') : 'Aurora over the polar ' + (best.la > 0 ? 'north' : 'south')))(nearestCity(best.la, best.lo)),
      text: 'Particles thrown out by the Sun are striking the upper air here and making it glow. The green band ahead is where the lights are most likely at this moment.',
      facts: [['Chance of seeing it', N(best.p, '%')], kp != null ? ['Activity', kp.toFixed(1) + ' of 9'] : null, isFinite(space.wind) ? ['Solar wind', N(space.wind, ' km/s')] : null, space.scales ? ['Magnetic storm', space.scales.G + ' of 5'] : null] });
  }
  const fl = space.flare;
  if (fl && isFinite(fl.time) && now - fl.time < 48 * 3600000 && /^[MX]/.test(fl.cls)) ev(null, sub.lat, sub.lon, { key: 'flare', cat: 'swx', layer: 'fireballs', alt: 0.85, off: 20, lead: 3, kick: 'Solar flare', chip: tChip('Class ' + fl.cls, 'fireballs', fl.cls[0] === 'X' ? 'Red' : 'Orange'), time: fl.time,
    title: 'The Sun let off a class ' + fl.cls + ' flare', text: 'A ' + flareWord(fl.cls).replace(/^(medium|major)/, '$1 flare') + '. This is the side of the planet facing the Sun, which takes the burst of X-rays first.',
    facts: [['Class', fl.cls], isFinite(space.wind) ? ['Solar wind', N(space.wind, ' km/s')] : null, space.scales ? ['Radio blackout', space.scales.R + ' of 5'] : null, kp != null ? ['Magnetic activity', 'Kp ' + kp.toFixed(1)] : null] });

  /* one flowing trip round the ground stops, looking north and a little to alternate sides */
  /* the opening swings a good way round the planet (westward, so the ground turns the way the Earth does); the route then starts from wherever that leaves the camera */
  const swing = { lat: clamp(c0.lat, -16, 22), lon: c0.lon, sweep: -150 };
  const route = opening ? tourRoute(G, swing.lat, wrapLon(swing.lon + swing.sweep)) : tourRoute(G, c0.lat, c0.lon);
  route.forEach((s, i) => { if (!s.fixed) { const odd = i % 2 ? 1 : -1; s.bearing = 180 + 16 * odd; s.swing = -2.1 * odd; } });

  /* then up into orbit for a close pass, and out for an asteroid going by */
  const sky = [], calls = (extra.calls || []).filter(c => c.t > now).sort((a, b) => a.km - b.km), call = calls.find(c => findSat(c.ida) || findSat(c.idb));
  if (call) {
    const obj = findSat(call.ida) || findSat(call.idb);
    if (obj && obj.l1 && !obj.rec && window.satellite) { try { obj.rec = satellite.twoline2satrec(obj.l1, obj.l2); } catch (e) {} }
    if (obj && obj.rec && obj.layer !== 'stations' && satState(obj.rec, new Date())) sky.push(fin({ key: 'call', cat: 'calls', shot: 'chase', alt: 0.42, off: 13, lead: 4, swing: -1.5, side: 12, select: obj, layer: obj.layer, kick: 'Close pass in orbit', chip: tChip(distWord(call.km) + ' apart', 'debris', call.km < 0.1 ? 'Red' : call.km < 1 ? 'Orange' : null), when: H(untilSpan(call.t)),
      at: ahead => { const st = satState(obj.rec, new Date(Date.now() + (ahead || 0))); return st ? { lat: st.lat, lon: st.lon, r: 1 + st.alt / EARTH_KM } : { lat: obj.lat || 0, lon: obj.lon || 0, r: 1.08 }; },
      title: tClip(nice(call.a) + ' and ' + nice(call.b), 70), text: ['These two are predicted to pass within ' + distWord(call.km) + ' of each other ', H(untilSpan(call.t)), '. You are riding behind one of them. Operators watch passes like this and steer out of the way when they can.'],
      facts: [['Miss distance', distWord(call.km)], isFinite(call.v) && call.v > 0 ? ['Closing speed', N(call.v * 3600, ' km/h')] : null, ['When', H(untilSpan(call.t))], call.p > 0 && call.p < 1 ? ['Chance of a hit', '1 in ' + num(1 / call.p)] : ['Passes being watched', N(calls.length)]] }));
  }
  const rocks = (extra.flybys || []).filter(f => f.time > now && isFinite(f.ld)).sort((a, b) => a.ld - b.ld), rock = rocks[0];
  if (rock) {
    const size = m => (m < 10 ? Math.max(1, Math.round(m)) : m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 50) * 50) + ' m';
    sky.push(fin({ key: 'flyby', cat: 'flybys', shot: 'wide', lat: -12, lon: wrapLon(sub.lon - 70), dist0: view.fit * 1.5, dist1: view.fit * 2.3, spin: 5, layer: 'fireballs', kick: 'Asteroid flyby', chip: tChip(rock.ld.toFixed(1) + ' Moon distances', 'fireballs'), when: H(untilSpan(rock.time)),
      title: 'Asteroid ' + rock.name + ' is slipping past', text: [(isFinite(rock.size) ? 'A rock roughly ' + size(rock.size) + ' across' : 'A small asteroid') + ' will make its closest pass ', H(untilSpan(rock.time)), ', at ' + rock.ld.toFixed(1) + ' times the distance of the Moon. It will miss. Astronomers follow thousands like it.'],
      facts: [['Closest pass', H(untilSpan(rock.time))], ['Distance then', N(Math.round(rock.ld * 384.4) * 1000, ' km')], isFinite(rock.size) ? ['Size, roughly', size(rock.size)] : null, ['Passing in ten days', N(rocks.length)]] }));
  }

  const body = route.concat(sky), secs = body.reduce((t, s) => t + s.hold + 2700, 0) / 1000, counts = tourCounts();
  const open = fin({ key: 'open', cat: '', shot: 'wide', lat: swing.lat, lon: swing.lon, sweep: swing.sweep, rise: Math.min(17, 38 - swing.lat), dist0: view.fit * 1.12, dist1: view.fit * 1.04, back: view.fit * 0.2, hold: 8400, layer: 'cities', kick: 'Live tour',
    title: 'The planet, right now', text: body.length ? 'A fast flight round everything happening on the planet at this moment: ' + body.length + (body.length === 1 ? ' event' : ' events') + ' in about ' + Math.max(1, Math.round(secs / 60)) + (Math.round(secs / 60) > 1 ? ' minutes.' : ' minute.')
      : 'No events have arrived yet. The tour will set off as soon as the first feeds come in.',
    facts: ['quakes', 'hotspots', 'fires', 'storms', 'alerts', 'news', 'volcanoes', 'launches'].map(k => counts.find(c => c.cat === k)).filter(Boolean).slice(0, 4).map(c => [c.name, N(c.n)]) });
  return [open].concat(body);      /* with nothing to visit yet, the tour waits on the whole Earth and looks again every few seconds */
}
/* what is on the globe at this moment, kind by kind */
function tourCounts() {
  const n = k => (layers[k] && layers[k].on ? layers[k].items.length : 0), now = Date.now(), out = [];
  const add = (cat, layer, name, v) => { if (v) out.push({ cat, layer, name, n: v }); };
  add('quakes', 'quakes', 'Earthquakes', n('quakes')); add('hotspots', 'hotspots', 'Hotspots', n('hotspots')); add('fires', 'fires', 'Wildfires', n('fires')); add('storms', 'storms', 'Storms', n('storms'));
  add('volcanoes', 'volcanoes', 'Volcanoes', n('volcanoes')); add('alerts', 'alerts', 'Disaster alerts', n('alerts')); add('warnings', 'warnings', 'US warnings', layers.warnings && layers.warnings.on ? extra.nwsTotal || n('warnings') : 0);
  add('ice', 'ice', 'Icebergs', n('ice')); add('other', 'other', 'Other events', n('other')); add('news', 'news', 'News stories', n('news')); add('launches', 'launches', 'Launches', layers.launches && layers.launches.on ? layers.launches.items.filter(l => l.time > now).length : 0);
  add('fireballs', 'fireballs', 'Fireballs', n('fireballs')); add('calls', 'debris', 'Close passes', (extra.calls || []).filter(c => c.t > now).length); add('flybys', 'fireballs', 'Asteroids', (extra.flybys || []).filter(f => f.time > now).length);
  if (space.kp && space.kp.length) out.push({ cat: 'swx', layer: 'aurora', name: 'Kp index', n: space.kp[space.kp.length - 1].kp.toFixed(1) });
  return out;
}
/* other events close to the one on screen, nearest first, no more than two of a kind */
const TOUR_NEAR = ['quakes', 'storms', 'fires', 'volcanoes', 'alerts', 'warnings', 'news', 'launches', 'ice', 'other'];
function tourNear(s) {
  if (!s.pt) return [];
  const all = [], seen = {}, out = [];
  for (const k of TOUR_NEAR) { const L = layers[k]; if (!L || !L.on) continue; for (const it of L.items) { if (it === s.item || (s.also && s.also.includes(it)) || !isFinite(it.lat) || (k === 'quakes' && it.mag < 2.5)) continue; const d = gcKm(s.pt.lat, s.pt.lon, it.lat, it.lon); if (d < 1000 && d > 2 && it.title !== s.title) all.push({ it, d, k }); } }
  all.sort((a, b) => a.d - b.d);
  for (const o of all) { if ((seen[o.k] = (seen[o.k] || 0) + 1) > 2) continue; out.push(o); if (out.length >= 3) break; }
  return out;
}
/* one line about the place: the nearest big city, what time it is and what the weather is doing there, and whether it is day or night */
const T_PIN = '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M7 12.6s4-3.6 4-6.9a4 4 0 1 0-8 0c0 3.300 4 6.900 4 6.900z"/><circle cx="7" cy="5.700" r="1.400"/></svg>';
function tourPlace(s) {
  if (!s.pt) return '';
  const lat = s.pt.lat, lon = s.pt.lon, parts = []; let best = null, bd = Infinity;
  for (const c of cityItems) { const d = gcKm(lat, lon, c.lat, c.lon); if (d < bd) { bd = d; best = c; } }
  parts.push(esc(best && bd < 2500 ? (bd < 30 ? 'In ' + best.title : num(bd) + ' km from ' + best.title) : fmtLL(lat, lon)));
  if (best && bd < 900 && best.off != null) parts.push(esc(bd < 30 ? 'Local time ' : best.title + ' time ') + '<b data-clock="' + best.off + '">' + clockAt(best.off) + '</b>');
  if (best && bd < 400 && best.temp != null) parts.push('<b>' + Math.round(best.temp) + '°</b>' + (best.code != null ? ' ' + esc(wmo(best.code, best.isDay).text.toLowerCase()) : ''));
  const el = Math.asin(clamp(ll(lat, lon, 1, TV.d).dot(U.uSun.value), -1, 1)) * R2D;
  parts.push(el > 6 ? 'Daylight' : el > -6 ? 'Twilight' : 'Night');
  return T_PIN + parts.map(p => '<span>' + p + '</span>').join('');
}

/* ---------- captions ---------- */
function paintCaption(s) {
  TE.kick.innerHTML = swatch(s.layer) + '<span class="k">' + esc(s.kick) + '</span>' + (s.chip ? '<span class="tour-chip" style="--c:' + esc(s.chip.c) + '">' + esc(s.chip.text) + '</span>' : '') +
    (s.time ? '<span class="when">' + agoSpan(s.time) + '</span>' : s.when ? '<span class="when">' + tHTML(s.when) + '</span>' : '');
  TE.title.innerHTML = esc(s.title) + (s.sub ? '<small>' + esc(s.sub) + '</small>' : ''); TE.title.classList.toggle('long', s.title.length > 40); TE.title.classList.toggle('xlong', s.title.length > 78);
  TE.text.innerHTML = tHTML(s.text);
  TE.facts.classList.remove('two'); TE.facts.innerHTML = s.facts.map(f => '<div><dt>' + esc(f[0]) + '</dt><dd>' + tHTML(f[1]) + '</dd></div>').join('');
  if (s.facts.length === 4 && TE.facts.lastChild.offsetTop > TE.facts.firstChild.offsetTop + 4) TE.facts.classList.add('two');      /* four that will not fit on one line are set two by two, never three and one */
  const place = tourPlace(s); TE.place.innerHTML = place; TE.place.hidden = !place;
  /* the panel: everything on the globe by kind, what else is near this event, and what comes next */
  const cats = tourCounts(), sig = cats.map(c => c.cat).join();
  if (TE.cats.dataset.sig !== sig) { TE.cats.dataset.sig = sig; TE.cats.innerHTML = cats.map(c => '<li>' + swatch(c.layer) + '<span>' + esc(c.name) + '</span><b></b></li>').join(''); }
  cats.forEach((c, i) => { const li = TE.cats.children[i], v = typeof c.n === 'number' ? num(c.n) : c.n; li.classList.toggle('now', c.cat === s.cat); if (li.lastChild.textContent !== v) li.lastChild.textContent = v; });      /* updated in place, so the highlight glides from one kind to the next */
  const near = tourNear(s);
  TE.near.innerHTML = near.map(o => '<li>' + swatch(o.k) + '<span>' + esc(o.k === 'quakes' ? 'Magnitude ' + o.it.mag.toFixed(1) + ' earthquake' : o.it.title) + '</span><b>' + num(o.d) + ' km</b></li>').join('');
  TE.nearBox.hidden = !near.length;
  let next = '';
  for (let k = 1, n = tour.list.length; k <= 3 && k < n; k++) { let j = tour.i + k; if (j >= n) j = j - n + 1; if (j === tour.i || j >= n) break; const x = tour.list[j]; next += '<li><button data-tour-go="' + j + '" title="' + esc(x.kick) + '">' + swatch(x.layer) + '<span>' + esc(x.title) + '</span></button></li>'; }
  TE.next.innerHTML = next;
  /* numbers count up from nothing as the caption arrives */
  tour.counts = reduceMotion ? [] : $$('[data-n]', TE.facts).map(el => ({ el, n: +el.dataset.n, dec: +el.dataset.dec, t0: performance.now() + 220 }));
  for (const c of tour.counts) c.el.textContent = tNum(0, c.dec);
  tour.fill = null;
  $$('li', TE.dots).forEach((li, i) => { li.dataset.state = i < tour.i ? 'done' : i === tour.i ? 'now' : ''; const f = li.querySelector('i'); f.style.transform = i < tour.i ? 'none' : 'scaleX(0)'; if (i === tour.i) tour.fill = f; });
  TE.count.textContent = (tour.i + 1) + ' of ' + tour.list.length;
  refreshLive();
}
function paintDots() {
  TE.dots.innerHTML = tour.list.map((s, k) => '<li><button data-tour-go="' + k + '" aria-label="' + esc(s.kick + ': ' + s.title) + '" title="' + esc(s.kick + ': ' + s.title) + '"><i></i></button></li>').join('');
}
function paintTourControls() {
  const label = tour.paused ? 'Resume the tour' : 'Pause the tour';
  TE.play.setAttribute('aria-label', label); TE.play.title = label + ' (Space)'; TE.play.dataset.state = tour.paused ? 'paused' : 'playing';
  tourEl.classList.toggle('paused', tour.paused);
  const p = TOUR_PACE[prefs.tourPace == null ? 1 : prefs.tourPace] || TOUR_PACE[1];
  TE.pace.textContent = p[0]; TE.pace.title = 'Pace: ' + p[0].toLowerCase() + '. Click to change, or press , and .'; tour.rate = p[1];
  const snd = !!music.M, word = snd ? 'Turn the music off' : 'Turn the music on';
  TE.music.dataset.state = snd ? 'on' : 'off'; TE.music.setAttribute('aria-pressed', String(snd)); TE.music.setAttribute('aria-label', word); TE.music.title = word + ' (M)';
}
/* music plays unless it has been switched off, or the radio is on (the radio wins; the button still turns the music on over it) */
function tourMusic(flip) {
  if (flip) { prefs.tourMusic = !music.M; savePrefs(); if (prefs.tourMusic) musicStart(); else musicStop(); }
  else if (prefs.tourMusic !== false && radio.state === 'idle') musicStart();
  paintTourControls(); tourPoke();
}
function tourPace(d) {
  const n = TOUR_PACE.length, cur = prefs.tourPace == null ? 1 : prefs.tourPace;
  prefs.tourPace = d == null ? (cur + 1) % n : clamp(cur + d, 0, n - 1); savePrefs(); paintTourControls(); tourPoke();
}
/* how fast the globe is turning under the camera at this moment, in degrees of longitude a second: measured every frame
   outside the tour, so the tour can take the motion over as it is instead of stopping it dead */
const spin = { lon: 0, at: 0, rate: 0 };
function trackSpin(now) {
  const p = camera.position, lon = Math.atan2(-p.z, p.x) * R2D, ms = now - spin.at;
  if (ms > 4 && ms < 120) spin.rate += (wrapLon(lon - spin.lon) * 1000 / ms - spin.rate) * 0.3; else if (ms >= 120) spin.rate = 0;
  spin.lon = lon; spin.at = now;
}
/* ---------- ready before the press ----------
   The slow parts of starting the music (see musicWarm) are done ahead of time, one step per idle moment: never while the
   globe is being dragged, during the opening, or in a hidden tab. The first step needs nothing and is taken soon after the
   globe opens; the rest wait until the visitor has clicked or pressed something. Pressing down on a tour button finishes
   whatever is left, in the instant before the click itself arrives. */
const warm = { busy: false, down: false };
const whenIdle = window.requestIdleCallback ? f => window.requestIdleCallback(f, { timeout: 2500 }) : f => setTimeout(f, 250);
function tourWarm() {
  if (warm.busy || tour.on || musicReady() || prefs.tourMusic === false) return;
  warm.busy = true;
  whenIdle(() => {
    warm.busy = false;
    if (tour.on || music.M) return;
    if (warm.down || !boot.entered || document.hidden || performance.now() - intro.exitAt < 3000) { setTimeout(tourWarm, 1200); return; }
    if (musicWarm()) setTimeout(tourWarm, 350);
  });
}
setTimeout(tourWarm, 6000);
window.addEventListener('pointerdown', e => {
  warm.down = true;
  if (!tour.on && e.target && e.target.closest && e.target.closest('[data-act="tour"]')) { if (e.pointerType === 'mouse') music.touched = true; if (musicMay()) { let n = 0; while (musicWarm(true) && n++ < 3); musicWake(); } }
}, { capture: true, passive: true });
for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, () => { warm.down = false; tourWarm(); }, { capture: true, passive: true });
window.addEventListener('keydown', tourWarm, { capture: true, passive: true });
/* where the camera is, a few times a second: how high, and over what */
function paintTelemetry(now) {
  if (now < tour.teleAt) return; tour.teleAt = now + 130;
  const R = tour.rig, c = offsetLL(R.flat, R.flon, R.off, R.bear, TO.a), set = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  set(TE.alt, num((clamp(R.dist, controls.minDistance, controls.maxDistance) - 1) * EARTH_KM) + ' km');
  set(TE.pos, Math.abs(c.lat).toFixed(1) + '° ' + (c.lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(c.lon).toFixed(1) + '° ' + (c.lon >= 0 ? 'E' : 'W'));
  /* how far over the ground the camera has come since the tour began */
  if (tour.lastC) tour.km += gcKm(tour.lastC.lat, tour.lastC.lon, c.lat, c.lon); else tour.lastC = { lat: 0, lon: 0 };
  tour.lastC.lat = c.lat; tour.lastC.lon = c.lon;
  set(TE.km, num(Math.round(tour.km / 10) * 10) + ' km');
}

/* ---------- running the tour ---------- */
function tourGo(i) {
  if (i >= tour.list.length || i < 0) {                /* round again, with whatever has changed since the last lap */
    const fresh = buildTour(); tour.laps++; tour.trailN = 0; tourTrail.geometry.setDrawRange(0, 0);
    if (fresh.length) tour.list = fresh;
    i = i < 0 ? tour.list.length - 1 : (tour.list.length > 1 ? 1 : 0);
    paintDots();
  }
  const was = tour.list[tour.i], s = tour.list[i], A = tour.from, R = tour.rig, B = tour.to;
  if (was && was.select && selected === was.select) select(null);
  for (const p of TP) { A[p] = R[p]; tour.v0[p] = tour.vel[p]; }
  tour.i = i; tour.phase = 'fly'; tour.t0 = tour.time; tour.held = 0; tour.showRing = false; tour.hold = s.hold; tour.capShown = -1;
  shotAt(s, 0, B);
  const ang = gcKm(A.flat, A.flon, B.flat, B.flon) / 111.19, top = Math.max(A.dist, B.dist);
  tour.hump = Math.max(0, Math.min(controls.maxDistance * 0.9, 1.5 + 2.7 * Math.pow(Math.min(1, ang / 160), 0.8)) - top) * Math.min(1, ang / 18);
  /* how far the view itself swings round along the way, measured by walking the route in ten steps; a big turn gets more time, so the camera never whips */
  let turn = 0; const M = tour.tmp, bank = tour.bank; tour.bank = 0; rigApply(R); tourLook(); TQ.copy(camera.quaternion);
  for (let n = 1; n <= 10; n++) {
    const e = n / 10; for (const p of TP) M[p] = A[p] + (T_ANG[p] ? wrapLon(B[p] - A[p]) : B[p] - A[p]) * e;
    M.dist += tour.hump * Math.pow(Math.sin(Math.PI * e), 2); rigApply(M); tourLook(); turn += TQ.angleTo(camera.quaternion) * R2D; TQ.copy(camera.quaternion);
  }
  tour.bank = bank; rigApply(R); tourLook();
  tour.dur = reduceMotion ? 1 : Math.min(5000, Math.max(1900 + 1500 * Math.min(1, ang / 170) + 400 * Math.min(1, Math.abs(B.dist - A.dist) / 6), turn * 1000 / 38));
  tour.capAt = Math.min(tour.laps || was ? 420 : 700, tour.dur * 0.3);
  /* the camera starts on its drift round the next place while it is still arriving, so a flight never ends in a standstill */
  /* The very first leg is different: the opening swing begins on the press itself, and the camera's longitude simply follows it
     (tour.ride) while height and latitude ease across, so the turn the globe had carries straight on into the tour. */
  tour.ride = !was && !tour.laps && !!s.sweep && !reduceMotion; if (!tour.ride && s.v0) s.v0 = 0;
  tour.lead = reduceMotion ? 0 : (tour.ride ? 1 : 0.4) * tour.dur; s.span = s.hold + tour.lead;
  tour.leg = !!(was && was.pt && s.pt);              /* a hop from one place on the ground to another is added to the trail when it is done */
  /* the rush between two events: stars streak past and the air rushes by, more for a longer flight */
  tour.power = was ? clamp(0.35 + ang / 70 + Math.abs(B.dist - A.dist) / 4, 0.35, 1) : 0;
  if (tour.power && !reduceMotion) musicWhoosh(tour.dur / tour.rate / 1000, tour.power);
  tourEl.classList.remove('cap-in'); if (was) tourEl.classList.add('cap-out');      /* the old words slide away to the left; the new ones will come in from the right */
  if (tour.power && !reduceMotion) { const b = TE.sweep; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = 'tourSweep ' + Math.round(clamp(tour.dur / tour.rate * 0.42, 620, 1100)) + 'ms cubic-bezier(.45, 0, .3, 1) both'; }
  /* the route, along the ground from the last subject to the next */
  const a = ll(A.flat, A.flon, 1, TV.a), b = ll(B.flat, B.flon, 1, TV.b), pos = tourArc.geometry.attributes.position.array, far = a.angleTo(b);
  if (far > 0.05 && far < 3.1 && !reduceMotion) {
    for (let n = 0; n < TOUR_ARC; n++) { const v = TV.c.copy(a).lerp(b, n / (TOUR_ARC - 1)).normalize().multiplyScalar(1.006); pos[n * 3] = v.x; pos[n * 3 + 1] = v.y; pos[n * 3 + 2] = v.z; }
    tourArc.geometry.attributes.position.needsUpdate = true; tourArc.visible = true; tour.arcT = 0;
  } else { tourArc.visible = false; tour.arcT = -1; }
}
/* The press is answered at once, before anything has had time to move: a ring of light leaves the button that was pressed
   (or the Tour button beside the name, when it was the T key), and a wave of light crosses the planet from the middle of the
   view, the same wave that marks each arrival but stronger. Both are drawn by the graphics card alone. */
const tourBurst = $('#tour-burst');
function tourLaunch(from) {
  if (reduceMotion) return;
  const now = performance.now();
  introU.pulseDir.value.copy(camera.position).normalize(); introU.pulseGain.value = 1.8; intro.pulseAt = now; tour.launch = now;
  if (!from || !from.offsetParent) from = [$('#view-tour'), $('.tour-pill'), $('#dock-tour')].find(el => el && el.offsetParent);
  const disc = from && from.querySelector('.tour-disc'), r = disc && disc.getBoundingClientRect();
  if (!r || !r.width || !tourBurst.animate) return;
  tourBurst.style.transform = 'translate(' + (r.left + r.width / 2).toFixed(1) + 'px,' + (r.top + r.height / 2).toFixed(1) + 'px)';
  const ease = 'cubic-bezier(.16, .7, .2, 1)';
  tourBurst.children[0].animate([{ transform: 'scale(.02)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0 }], { duration: 950, easing: ease });
  tourBurst.children[1].animate([{ transform: 'scale(.04)', opacity: 0 }, { transform: 'scale(.45)', opacity: 1, offset: 0.16 }, { transform: 'scale(1.25)', opacity: 0 }], { duration: 1150, easing: ease });
}
function startTour(from) {
  if (tour.on || !boot.entered) return;
  tourMusic();                                         /* first of all, so the music answers the press itself */
  const list = buildTour(true); if (!list.length) return;
  tourLaunch(from);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (selected) select(null);
  $('#tip').setAttribute('data-off', '');
  const c = camLL(), R = tour.rig, now = performance.now();
  Object.assign(R, tRig(), { flat: c.lat, flon: c.lon, dist: c.dist }); for (const p of TP) tour.vel[p] = 0;
  /* the opening carries on from the way the globe was already turning */
  if (list[0].sweep) list[0].v0 = reduceMotion || now - spin.at > 250 ? 0 : clamp(spin.rate, -6, 6);
  Object.assign(tour, { on: true, paused: false, hover: false, leaving: false, list, i: -1, laps: 0, prevOk: false, bank: 0, teleAt: 0, lastNow: now, fresh: true, capShown: -1, spin: controls.autoRotate, km: 0, lastC: null, trailN: 0, lead: 0, warp: 0 });
  tourTrail.geometry.setDrawRange(0, 0); tourTrail.visible = true;
  tour.up.set(0, 1, 0);
  controls.autoRotate = false; controls.enabled = false; fly = null;
  paintDots();
  tourEl.hidden = false; void tourEl.offsetWidth;
  app.classList.remove('tour-out'); app.classList.add('touring'); tourEl.classList.remove('cap-out'); tourEl.classList.add('on'); tourAside(true);
  tourWake(); tourPoke(); paintTourControls();
  tourGo(0);
}
function stopTour() {
  if (!tour.on || tour.leaving) return;
  const s = tour.list[tour.i]; if (s && s.select && selected === s.select) select(null);
  tour.leaving = true; tour.paused = false; tour.hover = false; tour.showRing = false; musicStop();
  tourEl.classList.remove('on', 'cap-in', 'paused', 'held'); tourEl.classList.add('cap-out'); app.classList.remove('touring', 'tour-idle'); tourAside(false);
  for (const p of TP) { tour.from[p] = tour.rig[p]; tour.v0[p] = tour.vel[p]; }
  const wide = tour.rig.off < 1;                         /* settle on a normal view of whatever the tour was showing */
  tour.exit = { shot: 'wide', lat: wide ? tour.rig.flat : clamp(tour.rig.flat * 0.7, -32, 32), lon: tour.rig.flon, dist0: view.fit, spin: 0, hold: 1000 };
  tour.phase = 'fly'; tour.t0 = tour.time; tour.dur = reduceMotion ? 1 : 1700; tour.hump = 0; tour.rate = 1; tour.lead = 0; tour.off0 = tour.off;
  app.classList.add('tour-out');
  if (tour.wake) { try { tour.wake.release(); } catch (e) {} tour.wake = null; }
  if (document.fullscreenElement && tour.fs) { try { document.exitFullscreen(); } catch (e) {} }
  tour.fs = false;
}
function tourDone() {                                  /* hand the globe back exactly as the visitor expects it */
  tour.on = false; tour.leaving = false; tour.phase = 'idle'; tour.off = 0; tour.bank = 0; tour.counts = []; tour.launch = 0; introU.pulseGain.value = 1;
  camera.up.set(0, 1, 0); camera.position.setLength(view.fit); zoomTarget = view.fit;
  if (view.phone) camera.setViewOffset(view.w, view.h, 0, Math.round(view.h * 0.15), view.w, view.h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  controls.enabled = true; fly = null; setSpin(!!tour.spin);
  tourRing.setAttribute('data-off', ''); tourArc.visible = false; tourTrail.visible = false; tour.warp = 0; tourStars.g.visible = false;
  if (camera.zoom !== 1) { camera.zoom = 1; camera.updateProjectionMatrix(); }
  setTimeout(() => { if (!tour.on) { tourEl.hidden = true; app.classList.remove('tour-out'); } }, 900);
}
const TOUR_ASIDE = ['.topbar', '#dock', '#inspector', '.viewctl', '.statusbar', '#legend', '#player', '.tour-pill', '#labels'];
function tourAside(on) { for (const q of TOUR_ASIDE) { const el = $(q); if (el) el.inert = on; } }
function tourPause(p) { if (!tour.on || tour.leaving) return; tour.paused = p == null ? !tour.paused : p; paintTourControls(); tourPoke(); }
function tourSkip(d) { if (!tour.on || tour.leaving) return; tour.paused = false; paintTourControls(); tourGo(tour.i + d); }
function tourWake() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { if (tour.on && !tour.leaving) tour.wake = w; else w.release(); w.addEventListener('release', () => { if (tour.wake === w) tour.wake = null; }); }).catch(() => {}); } catch (e) {} }
function tourPoke() { tour.idleAt = performance.now() + 3200; if (app.classList.contains('tour-idle')) app.classList.remove('tour-idle'); }
/* the globe moves aside a little to leave room for the caption. This is checked against the camera itself every frame, so
   anything that resets it (a resized window, a restored graphics context) is put right at once. In a low pass the subject sits
   well right of centre; a whole-Earth view moves less, so the planet clears the panel on the right. */
function tourOffset(k) {
  /* in small fractions of a pixel, not whole ones: moved a whole pixel at a time, the planet would cross the screen in little steps */
  const ox = view.phone ? 0 : -Math.round(view.w * (0.012 + 0.078 * clamp(tour.rig.off / 14, 0, 1)) * k * 256) / 256, oy = Math.round(view.h * (view.phone ? 0.15 - 0.02 * k : 0.03 * k) * 256) / 256, v = camera.view;
  if (v && v.enabled && v.offsetX === ox && v.offsetY === oy && v.fullWidth === view.w && v.fullHeight === view.h) return;
  camera.setViewOffset(view.w, view.h, ox, oy, view.w, view.h); camera.updateProjectionMatrix();
}

/* once a frame, before the usual controls: move the camera along its flight or its drift */
function stepTour(now) {
  if (tour.launch && now - tour.launch > 1500) { tour.launch = 0; introU.pulseGain.value = 1; }
  if (tour.fresh) { tour.fresh = false; tour.lastNow = now; }      /* the tour's clock starts with its first frame, however long the press took to deal with */
  const raw = now - tour.lastNow, real = clamp(raw, 0, 250), dms = real * tour.rate; tour.lastNow = now; tour.time += dms;      /* the tour's own clock: a stall or a hidden tab never makes the camera leap */
  const s = tour.leaving ? tour.exit : tour.list[tour.i], R = tour.rig, B = tour.to;
  /* a steady slide, eased at both ends below, which a slow frame cannot make jump; on the way out it keeps step with the flight home, so the two end together */
  if (tour.leaving) tour.off = tour.off0 * (1 - clamp((tour.time - tour.t0) / tour.dur, 0, 1)); else if (tour.off < 1) tour.off = Math.min(1, tour.off + Math.min(real, 100) / 1200);
  tourOffset(tSmooth(tour.off));
  if (now > tour.idleAt && !tour.leaving && !tour.paused && !tour.hover && !app.classList.contains('tour-idle')) app.classList.add('tour-idle');

  let prog = 0;
  if (tour.phase === 'fly') {
    const t = tour.time - tour.t0, k = clamp(t / tour.dur, 0, 1), e = tFly(k), A = tour.from, v = tour.v0;
    const g = 0.7 * (1 - Math.exp(-t / 700));          /* the camera keeps gliding the way it was going, slowing down, while the new flight takes over */
    shotAt(s, Math.max(0, t - (tour.dur - tour.lead)) / 1000, B);
    for (const p of TP) { const a = A[p] + v[p] * g; R[p] = a + (T_ANG[p] ? wrapLon(B[p] - a) : B[p] - a) * e; }
    if (tour.ride && !tour.leaving) R.flon = B.flon;
    R.flon = wrapLon(R.flon); R.flat = clamp(R.flat, -89.5, 89.5); R.off = Math.max(0, R.off);
    R.dist += tour.hump * Math.pow(Math.sin(Math.PI * k), 2);
    if (!tour.leaving) {
      if (t >= tour.capAt && tour.capShown !== tour.i + ':' + tour.laps) { tour.capShown = tour.i + ':' + tour.laps; paintCaption(s); tourEl.classList.remove('cap-out'); void TE.title.offsetWidth; tourEl.classList.add('cap-in'); }
      if (k > 0.78 && !tour.showRing && s.shot !== 'wide' && !s.select) tour.showRing = true;
      prog = Math.max(0, t - tour.capAt) / (tour.dur - tour.capAt + tour.hold);
      if (tour.arcT >= 0) tour.arcT = e;
      tour.warp = tour.power * Math.pow(Math.sin(Math.PI * k), 1.4);
    } else tour.warp = 0;
    if (k >= 1) {
      if (tour.leaving) { rigApply(R); return tourDone(); }
      tour.phase = 'dwell'; tour.t0 += tour.dur; tour.held = 0;      /* counted from the moment the flight was due to end, not from this frame, so the drift carries straight on */
      if (s.shot !== 'wide' && !reduceMotion) { const f = s.at(); introU.pulseDir.value.copy(ll(f.lat, f.lon, 1, TV.c)); intro.pulseAt = now; }
      if (s.select) select(s.select, { stay: true });
      musicChime();
      if (tour.leg && tour.arcT >= 0 && tour.trailN < TRAIL_MAX && !reduceMotion) {
        const src = tourArc.geometry.attributes.position.array, dst = tourTrail.geometry.attributes.position.array; let w = tour.trailN * TRAIL_LEG * 6;
        for (let n = 0; n < TRAIL_LEG; n++) for (const q of [n, n + 1]) { const j = Math.round(q * (TOUR_ARC - 1) / TRAIL_LEG) * 3; dst[w++] = src[j]; dst[w++] = src[j + 1]; dst[w++] = src[j + 2]; }
        tour.trailN++; tourTrail.geometry.attributes.position.needsUpdate = true; tourTrail.geometry.setDrawRange(0, tour.trailN * TRAIL_LEG * 2);
      }
    }
  } else {
    if (!tour.paused && !tour.hover) tour.held += dms;
    tour.warp *= Math.max(0, 1 - real / 300);
    shotAt(s, (tour.time - tour.t0 + tour.lead) / 1000, R);
    prog = (tour.dur - tour.capAt + tour.held) / (tour.dur - tour.capAt + tour.hold);
    if (tour.arcT >= 0) { tour.arcT += real / 900; if (tour.arcT >= 2) { tour.arcT = -1; tourArc.visible = false; } }
    if (tour.held >= tour.hold) { if (tour.fill) tour.fill.style.transform = 'none'; tourGo(tour.i + 1); prog = -1; }
  }
  if (prog >= 0 && tour.fill) tour.fill.style.transform = 'scaleX(' + Math.min(1, prog).toFixed(4) + ')';

  /* the route line: a bright head with a fading tail while flying, then the whole line fades once the camera has arrived */
  if (tourArc.visible && tour.arcT >= 0) {
    const al = tourArc.geometry.attributes.aAlpha.array, head = Math.min(1, tour.arcT);
    for (let n = 0; n < TOUR_ARC; n++) { const u = n / (TOUR_ARC - 1); al[n] = u > head ? 0 : clamp(1 - (head - u) * 1.6, 0.16, 1); }
    tourArc.geometry.attributes.aAlpha.needsUpdate = true;
    tourArc.material.uniforms.uFade.value = 0.8 * (tour.arcT <= 1 ? Math.min(1, tour.arcT * 6) : Math.max(0, 2 - tour.arcT));
  }
  /* numbers in the caption count up */
  if (tour.counts.length) {
    let live = 0;
    for (const c of tour.counts) { const u = clamp((now - c.t0) / 850, 0, 1); if (u < 1) live++; if (u > 0 && !c.done) { c.el.textContent = tNum(c.n * (1 - Math.pow(1 - u, 3)), c.dec); if (u >= 1) c.done = true; } }
    if (!live) tour.counts = [];
  }

  /* remember how fast everything is moving, for the glide at the start of the next flight and for the lean into turns */
  const P = tour.prev;
  if (tour.prevOk && dms > 4) { const q = 1000 / dms, v = tour.vel; for (const p of TP) v[p] = (T_ANG[p] ? wrapLon(R[p] - P[p]) : R[p] - P[p]) * q; }
  for (const p of TP) P[p] = R[p];
  tour.prevOk = true;
  const low = Math.min(1, R.off / 8), lean = reduceMotion || tour.leaving ? 0 : clamp(tour.vel.bear * tour.rate * 0.13, -7, 7) * low + clamp(tour.vel.flon * tour.rate * 0.14, -3.5, 3.5) * (1 - low);
  tour.bank += (lean - tour.bank) * Math.min(1, real / 320);
  /* a flight: stars streak past for as long as it lasts, and the view widens a touch at its fastest, the way speed feels */
  if (!reduceMotion) {
    const S = tourStars.u, speed = 50 * tour.warp;
    if (tour.warp > 0.004) { tour.travel += (0.5 + speed) * real / 1000; S.uTravel.value = tour.travel; S.uStreak.value = Math.min(6, speed * 0.085); S.uLine.value = clamp((speed - 2) / 9, 0, 1); S.uFade.value = Math.min(1, tour.warp * 2.4); tourStars.g.visible = true; }
    else if (tourStars.g.visible) tourStars.g.visible = false;
    const zoom = 1 - 0.065 * tour.warp; if (Math.abs(zoom - camera.zoom) > 0.0004) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
  }
  tourTrail.material.uniforms.uFade.value = 0.2 * tSmooth(tour.off);

  rigApply(R);
  if (s && s.shot !== 'wide' && !tour.leaving) { const f = s.at(); ll(f.lat, f.lon, f.r || 1.003, tour.focus); }
  if (!tour.leaving) paintTelemetry(now);
}
/* after the usual controls have had their say, point the camera where the tour wants it. "Up" on screen is the direction
   along the ground leading away from the camera: north in a wide view, toward the horizon in a low one, which also keeps the
   horizon level. In a turn the camera leans a few degrees into it, like an aircraft. If "up" is unusable for a moment, the
   last good one is kept. */
function tourLook() {
  const fwd = TV.b.copy(tour.look).sub(camera.position).normalize();
  const ref = TV.a.copy(tour.ahead);
  ref.addScaledVector(fwd, -ref.dot(fwd));
  if (ref.lengthSq() > 0.003) tour.up.copy(ref).normalize();
  else { tour.up.addScaledVector(fwd, -tour.up.dot(fwd)); if (tour.up.lengthSq() < 1e-6) tour.up.set(0, 1, 0); tour.up.normalize(); }
  camera.up.copy(tour.up);
  if (tour.bank) { const b = tour.bank * D2R; camera.up.multiplyScalar(Math.cos(b)).addScaledVector(TV.c.copy(fwd).cross(tour.up), Math.sin(b)); }
  camera.lookAt(tour.look);
  if (tourStars.g.visible) { tourStars.g.position.copy(camera.position); tourStars.g.quaternion.copy(camera.quaternion); }
}
function tourMarks() {
  if (tour.on && tour.showRing && !tour.leaving) place(tourRing, tour.focus); else if (!tourRing.hasAttribute('data-off')) tourRing.setAttribute('data-off', '');
}

/* ---------- controls ---------- */
tourEl.addEventListener('click', e => {
  const b = e.target.closest('button'); tourPoke();
  if (!b) return;
  if (b.id === 'tour-exit') stopTour();
  else if (b.id === 'tour-play') tourPause();
  else if (b.id === 'tour-next') tourSkip(1);
  else if (b.id === 'tour-prev') tourSkip(-1);
  else if (b.id === 'tour-full') tourFull();
  else if (b.id === 'tour-pace') tourPace();
  else if (b.id === 'tour-music') tourMusic(true);
  else if (b.dataset.tourGo != null) { tour.paused = false; paintTourControls(); tourGo(+b.dataset.tourGo); }
});
/* resting the mouse on the words holds the tour on this stop until it moves away, so nothing is whisked off mid-sentence */
for (const q of ['.tour-cap', '.tour-side']) {
  const el = $(q, tourEl);
  el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { tour.hover = true; tourEl.classList.add('held'); } });
  el.addEventListener('pointerleave', () => { tour.hover = false; tourEl.classList.remove('held'); });
}
function tourFull() {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else { const el = document.documentElement, p = el.requestFullscreen && el.requestFullscreen(); if (p && p.then) p.then(() => { tour.fs = true; }).catch(() => {}); }
  } catch (e) {}
}
if (!document.documentElement.requestFullscreen) $('#tour-full').hidden = true;
document.addEventListener('click', e => { const b = e.target.closest('[data-act="tour"]'); if (b) startTour(b); });
window.addEventListener('pointermove', () => { if (tour.on) tourPoke(); }, { passive: true });
window.addEventListener('pointerdown', () => { if (tour.on) tourPoke(); }, { passive: true });
window.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
  if (!tour.on) { if ((e.key === 't' || e.key === 'T') && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && boot.entered) { e.preventDefault(); startTour(); } return; }
  if (e.key === '/' || ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey))) { stopTour(); return; }     /* reaching for the search box ends the tour */
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  tourPoke();
  let used = true;
  if (e.key === 'Escape') stopTour();
  else if (e.key === ' ' || e.key === 'k' || e.key === 'K') { if (e.target && e.target.closest && e.target.closest('#tour button')) return; tourPause(); }
  else if (e.key === 'ArrowRight') tourSkip(1);
  else if (e.key === 'ArrowLeft') tourSkip(-1);
  else if (e.key === 'f' || e.key === 'F') tourFull();
  else if (e.key === 'm' || e.key === 'M') tourMusic(true);
  else if (e.key === '.' || e.key === '>' || e.key === '+' || e.key === '=') tourPace(1);
  else if (e.key === ',' || e.key === '<' || e.key === '-') tourPace(-1);
  else used = false;
  if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);
document.addEventListener('visibilitychange', () => { if (tour.on && !tour.leaving && !document.hidden && !tour.wake) tourWake(); });
liveFns.push(o => {
  if (!tour.on) return;
  TE.clock.textContent = new Date().toISOString().slice(11, 19);
});

$('#tab-guide .how').insertAdjacentHTML('beforeend', '<li>Press <b>Tour</b> (or the <b>T</b> key) and the globe flies itself round every notable event happening right now: earthquakes, storms, fires, eruptions, alerts, the news, launches and what is going on overhead, with the facts of each. ' +
  'It runs until you stop it, so it works as a screensaver or on a television. <b>Space</b> pauses, the <b>arrow keys</b> step back and forward, <b>,</b> and <b>.</b> change the pace, <b>M</b> turns the music and the rush of air between stops on and off, <b>F</b> fills the screen and <b>Esc</b> ends it. Resting the mouse on the words holds the tour there. ' +
  'Add <b>#tour</b> to the end of the page address to start it as soon as the page has loaded.</li>');

/* #tour in the address starts the tour once the globe has opened and the feeds have arrived (or after a wait, if some never do) */
if (location.hash === '#tour') { const iv = setInterval(() => { const since = performance.now() - intro.exitAt; if (boot.entered && since > 3000 && (boot.done || since > 25000)) { clearInterval(iv); startTour(); } }, 400); }
/* test only: run the camera through some stops on a pretend 60 Hz clock, without drawing, and report how evenly it moves */
function tourSim(stops, fps, linger) {
  const rows = [], dt = 1000 / (fps || 60); let t = tour.lastNow = performance.now();
  const run = done => { for (let g = 0; g < 6000; g++) { t += dt; stepTour(t); if (!tour.on) break; controls.update(); tourLook(); const p = camera.position, q = camera.quaternion; rows.push([t, p.x, p.y, p.z, q.x, q.y, q.z, q.w, tour.phase, tour.i]); if (done()) break; } };
  for (const i of stops) { tourGo(i); let d0 = 0; run(() => { if (tour.phase === 'dwell' && !d0) d0 = t; return d0 && t - d0 > (linger || 2500); }); }
  const turn = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[4] * b[4] + a[5] * b[5] + a[6] * b[6] + a[7] * b[7]))) * R2D, spikes = [];
  let maxV = 0, maxW = 0, pv = null, pw = null; const flights = {};
  for (let k = 1; k < rows.length; k++) {
    const a = rows[k - 1], b = rows[k], h = dt / 1000, v = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / h, w = turn(a, b) / h;
    maxV = Math.max(maxV, v); maxW = Math.max(maxW, w);
    if (b[8] === 'fly') { const key = b[9] + ':' + (tour.list[b[9]] || {}).key, fl = flights[key] || (flights[key] = { n: 0, peak: 0 }); fl.n++; fl.peak = Math.max(fl.peak, w); }
    if (pv != null) spikes.push([Math.abs(w - pw) / h, Math.abs(v - pv) / h, b[8], tour.list[b[9]] ? tour.list[b[9]].key : '?', +((b[0] - rows[0][0]) / 1000).toFixed(2), +pw.toFixed(1), +w.toFixed(1)]);
    pv = v; pw = w;
  }
  const byTurn = spikes.slice().sort((x, y) => y[0] - x[0]).slice(0, 4).map(x => x[3] + ' ' + x[2] + ' @' + x[4] + 's ' + x[5] + '>' + x[6] + ' deg/s (' + Math.round(x[0]) + ' deg/s2)');
  tour.lastNow = performance.now();
  return { frames: rows.length, seconds: +((t - rows[0][0]) / 1000).toFixed(1), maxSpeed: +maxV.toFixed(2), maxTurn: +maxW.toFixed(1), flights: Object.keys(flights).map(k => k.split(':')[1] + ' ' + (flights[k].n * dt / 1000).toFixed(1) + 's ' + Math.round(flights[k].peak)).join(' | '), worstTurnChanges: byTurn,
    holds: tour.list.map(s => s.key + ' ' + (s.hold / 1000).toFixed(1)).join(' ') };
}
/* test only: the moment the tour begins, on a pretend clock. Some frames of the globe turning by itself, the press, then the
   first frames of the tour, one of which can be made to arrive late ("stall" milliseconds). It reports how far a point on the
   ground moves across the screen from each frame to the next, so a jolt or a standstill shows up as a number. */
function tourEntrySim(fps, stall, secs) {
  const dt = 1000 / (fps || 60), rows = [], P = new THREE.Vector3(), M4 = new THREE.Matrix4(), c0 = camLL(), g = ll(c0.lat, c0.lon, 1, new THREE.Vector3()).clone(), PRE = 40;
  let t = performance.now();
  const snap = tag => { camera.updateMatrixWorld(); M4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); P.copy(g).applyMatrix4(M4); rows.push([t, (P.x * 0.5 + 0.5) * view.w, (0.5 - P.y * 0.5) * view.h, camLL().lon, camera.position.length(), tag]); };
  for (let n = 0; n < PRE; n++) { t += dt; controls.update(); trackSpin(t); snap('spin'); }
  const real = performance.now; performance.now = () => t;      /* the press lands just after a frame */
  try { startTour(); } finally { performance.now = real; }
  for (let n = 0; n < (secs || 3) * 1000 / dt; n++) { t += dt + (n === 6 ? stall || 0 : 0); stepTour(t); controls.update(); tourLook(); snap(tour.phase); }
  const per = k => 1000 / (rows[k][0] - rows[k - 1][0]), px = rows.map((r, k) => (k ? Math.hypot(r[1] - rows[k - 1][1], r[2] - rows[k - 1][2]) * per(k) : 0)), lon = rows.map((r, k) => (k ? wrapLon(r[3] - rows[k - 1][3]) * per(k) : 0));
  let jolt = 0, at = 0; for (let k = 2; k < px.length; k++) { const d = Math.abs(px[k] - px[k - 1]) / 60; if (d > jolt) { jolt = d; at = k - PRE; } }
  const pick = a => a.slice(PRE - 4, PRE + 180).filter((v, k) => k < 44 || k % 6 === 0).map(v => +v.toFixed(1)).join(' ');
  tour.lastNow = performance.now();
  return { spinBefore: +spin.rate.toFixed(2), carried: tour.list[0].v0, pxPerSecond: pick(px), lonDegPerSecond: pick(lon), worstJoltPxPerFrame: +jolt.toFixed(2), joltFrame: at, slowestLon: +Math.min.apply(null, lon.slice(PRE + 1, PRE + 110).map(Math.abs)).toFixed(2),
    dist: [rows[PRE - 1][4], rows[rows.length - 1][4]].map(v => +v.toFixed(3)), firstLeg: Math.round(tour.dur), ride: tour.ride };
}
if (location.hash === '#test') window.__tour = { entry: tourEntrySim, gl: () => ({ programs: renderer.info.programs.length, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }), warm: () => ({ samples: music.echo ? music.echo.rate : 0, engine: tuner.ctx ? tuner.ctx.state + ' ' + tuner.ctx.sampleRate : 'none', echo: !!music.rack, ready: musicReady(), may: musicMay(), desk: musicDesk.matches }), musicShare: musicShareProbe, musicProbe, musicOn: () => !!music.M, sim: tourSim, cam: () => camera.position.toArray().concat(camera.quaternion.toArray()), start: () => startTour(), stop: stopTour, go: tourGo, pause: tourPause, pace: tourPace,
  dbg: () => ({ warp: tour.warp, stars: tourStars.g.visible, trail: tourTrail.visible, trailN: tour.trailN, arc: tourArc.visible, zoom: camera.zoom, lines: scene.children.filter(o => o.visible && (o.isLine || o.isLineSegments)).length }), hide: w => { const o = { stars: tourStars.g, trail: tourTrail, arc: tourArc }[w]; if (o) o.visible = false; else { let n = 0; scene.traverse(c => { if ((c.isLine || c.isLineSegments) && c.visible && c !== tourTrail && c !== tourArc && n++ === +w) c.visible = false; }); } },
  state: () => ({ on: tour.on, i: tour.i, n: tour.list.length, phase: tour.phase, rate: tour.rate, keys: tour.list.map(s => s.key.split(':')[0]), cats: tour.list.map(s => s.cat), rig: Object.assign({}, tour.rig), title: tour.list[tour.i] && tour.list[tour.i].title }) };
