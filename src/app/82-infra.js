/* ============================================================
   Infrastructure: undersea internet cables and nuclear facilities.
   Both are reference maps rather than live feeds, so they travel inside this file and always draw, online or not.
   A second, live list of smaller nuclear sites (research reactors, fuel plants, waste stores) is added from Wikidata when it answers.
   ============================================================ */
Object.assign(SOURCES, {
  wikidata: { label: 'Wikidata', what: 'Research reactors, fuel plants, waste stores and other nuclear sites, added to the built-in list of power reactors', url: 'https://www.wikidata.org/wiki/Q1739545', lazy: true }
});
CREDITS.push(
  ['TeleGeography', 'Undersea cable routes, owners and dates from the Submarine Cable Map, 2026 edition, as cleaned by Tristan Hotham. Licensed CC BY-NC-SA: free to share with credit, not for commercial use', 'https://www.submarinecablemap.com/'],
  ['IAEA PRIS, via GeoNuclearData', 'Every power reactor on record with the International Atomic Energy Agency: place, type, output and status as of March 2024. Open Database License', 'https://github.com/cristianst85/GeoNuclearData']
);
Object.assign(PSEUDO, { cable: 'Undersea cable' });
SWATCH_AS.cable = 'cables';

/* ---------- undersea cables ---------- */
const cables = { list: [], hi: null, hiOf: null };
let cablesObj = null;
/* routes are packed as runs of small steps, two decimal places of a degree (about a kilometre) */
function unpackRoute(str) {
  const out = []; let i = 0, lat = 0, lon = 0;
  const next = () => { let b, shift = 0, r = 0; do { b = str.charCodeAt(i++) - 63; r |= (b & 31) << shift; shift += 5; } while (b >= 32); return (r & 1) ? ~(r >> 1) : (r >> 1); };
  while (i < str.length) { lat += next(); lon += next(); out.push([lon / 100, lat / 100]); }
  return out;
}
/* a route as the globe draws it: cut where it crosses the date line, with extra points on long straight runs so it hugs the sphere */
function routeLines(part, lines) {
  let line = [];
  for (const p of part) {
    const prev = line[line.length - 1];
    if (prev && Math.abs(p[0] - prev[0]) > 180) { if (line.length > 1) lines.push(line); line = []; }
    else if (prev) { const n = Math.floor(Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1])) / 2.5); for (let k = 1; k <= n; k++) line.push([prev[0] + (p[0] - prev[0]) * k / (n + 1), prev[1] + (p[1] - prev[1]) * k / (n + 1)]); }
    line.push(p);
  }
  if (line.length > 1) lines.push(line);
}
function loadCables() {
  if (cablesObj) return;
  const all = [], planned = [], v = new THREE.Vector3(), mid = new THREE.Vector3();
  for (const c of ASSET.cables) {
    const lines = []; for (const part of String(c[8]).split(' ')) if (part) routeLines(unpackRoute(part), lines);
    if (!lines.length) continue;
    /* for clicking: every drawn point as a direction from the centre of the Earth, and a cap that holds them all */
    let n = 0; for (const l of lines) n += l.length;
    const dirs = new Float32Array(n * 3), cuts = []; let k = 0; mid.set(0, 0, 0);
    for (const l of lines) { for (const p of l) { ll(p[1], p[0], 1, v); dirs[k++] = v.x; dirs[k++] = v.y; dirs[k++] = v.z; mid.add(v); } cuts.push(k / 3); }
    mid.normalize(); let reach = 1;
    for (let i = 0; i < k; i += 3) reach = Math.min(reach, dirs[i] * mid.x + dirs[i + 1] * mid.y + dirs[i + 2] * mid.z);
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a)), at = longest[longest.length >> 1];
    const it = { layer: 'cable', id: c[9], title: c[0], year: c[1], planned: !!c[2], km: c[3], measured: !!c[4], landings: c[5], countries: c[6] ? String(c[6]).split('; ') : [], owners: c[7] ? String(c[7]).split('; ') : [],
      lat: at[1], lon: at[0], v: ll(at[1], at[0], 1.002), lines, dirs, cuts, mid: mid.clone(), reach: Math.acos(clamp(reach, -1, 1)) };
    it.explain = 'A bundle of glass fibres about as thick as a garden hose, lying on the sea bed. Light pulses sent down the fibres carry phone calls, video and web pages between the places it lands. The route drawn here is a sketch, not the exact path.';
    cables.list.push(it);
    for (const l of lines) { all.push(l); planned.push(it.planned); }
  }
  if (!all.length) return;
  cablesObj = segmentsFrom(all, 1.0012, LAYERS.cables.color, 0.3); cablesObj.visible = isOn('cables');
  const alpha = cablesObj.geometry.attributes.aAlpha.array; let w = 0;                  /* cables not yet laid are drawn fainter */
  all.forEach((l, i) => { const n = (l.length - 1) * 2, a = planned[i] ? 0.42 : 1; for (let j = 0; j < n; j++) alpha[w++] = a; });
  cablesObj.geometry.attributes.aAlpha.needsUpdate = true;
  extra.cable = cables.list;
  setCount('cables', cables.list.length.toLocaleString());
}
/* the cable nearest a point on the globe, if one runs within reach (an angle in radians) */
function cableNear(lat, lon, reach) {
  if (!cablesObj || !cablesObj.visible) return null;
  const p = ll(lat, lon, 1), sinR = Math.sin(reach); let best = null, bd = reach;
  for (const c of cables.list) {
    if (Math.acos(clamp(p.x * c.mid.x + p.y * c.mid.y + p.z * c.mid.z, -1, 1)) > c.reach + reach) continue;
    const d = c.dirs; let cut = 0;
    for (let i = 0; i + 1 < d.length / 3; i++) {
      if (i + 1 === c.cuts[cut]) { cut++; continue; }          /* no segment joins one piece of the route to the next */
      const a = i * 3, b = a + 3;
      const ax = d[a], ay = d[a + 1], az = d[a + 2], bx = d[b], by = d[b + 1], bz = d[b + 2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const off = p.x * nx + p.y * ny + p.z * nz; if (Math.abs(off) > sinR) continue;
      /* inside the two ends of the segment? */
      const s1 = (ay * p.z - az * p.y) * nx + (az * p.x - ax * p.z) * ny + (ax * p.y - ay * p.x) * nz, s2 = (p.y * bz - p.z * by) * nx + (p.z * bx - p.x * bz) * ny + (p.x * by - p.y * bx) * nz;
      const dist = s1 >= 0 && s2 >= 0 ? Math.asin(Math.min(1, Math.abs(off))) : Math.min(Math.acos(clamp(p.x * ax + p.y * ay + p.z * az, -1, 1)), Math.acos(clamp(p.x * bx + p.y * by + p.z * bz, -1, 1)));
      if (dist < bd) { bd = dist; best = c; }
    }
  }
  return best;
}
/* how wide a few pixels are on the ground under the pointer, as an angle */
const pixelReach = px => Math.max(0.0012, px * (camera.position.length() - 1) * 2 * Math.tan(camera.fov * D2R / 2) / (view.h * camera.zoom));
function showCable(it) {
  if (cables.hi) { scene.remove(cables.hi); cables.hi.geometry.dispose(); cables.hi.material.dispose(); cables.hi = null; }
  cables.hiOf = it || null;
  if (!it) return;
  cables.hi = segmentsFrom(it.lines, 1.0022, '#ffffff', 0.95); cables.hi.renderOrder = 3;
}
const cableList = (a, max) => (a.length <= max ? a.join(', ') : a.slice(0, max).join(', ') + ' and ' + (a.length - max) + ' more');
DETAILS.cable = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div><p>' + (it.planned ? (it.year ? 'Planned for ' + it.year : 'Planned, no date announced') : it.year ? 'Carrying traffic since ' + it.year : 'In service') + '</p>',
  rows: [
    ['Length', it.km ? num(it.km) + ' km' + (it.measured ? ', measured from the drawn route' : '') : 'Not published'],
    ['Comes ashore at', it.landings ? it.landings + (it.landings === 1 ? ' place' : ' places') + (it.countries.length ? ' in ' + (it.countries.length === 1 ? esc(it.countries[0]) : it.countries.length + ' countries') : '') : 'Not published'],
    it.countries.length > 1 ? ['Countries', esc(cableList(it.countries, 14))] : null,
    ['Owned by', it.owners.length ? esc(cableList(it.owners, 10)) : 'Not published'],
    ['Map edition', 'TeleGeography, 2026']
  ],
  actions: '<button class="btn" data-spot="' + it.lat.toFixed(3) + ',' + it.lon.toFixed(3) + '">Weather at this spot</button>' + link('https://www.submarinecablemap.com/submarine-cable/' + encodeURIComponent(it.id), 'Open on the Submarine Cable Map')
});

/* ---------- nuclear facilities ---------- */
const NUKE = ASSET.nuclear, N_RUN = 0, N_BUILD = 1, N_PLAN = 2, N_PAUSE = 3, N_SHUT = 4;
const NUKE_WORD = ['running', 'being built', 'planned', 'stopped for now', 'shut down', 'taken apart', 'building halted', 'cancelled', 'never started'];
const NUKE_TYPE = t => { const d = NUKE.types[t]; return d ? d.toLowerCase() + ' (' + t + ')' : t; };
const nukeEdition = (function () { const d = new Date(NUKE.edition + 'T00:00:00Z'); return isNaN(d) ? 'March 2024' : d.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }); })();
function nukeSite(s, i) {
  const units = s[5].map(u => ({ name: u[0], st: u[1], type: u[2], model: u[3], mw: u[4], begun: u[5], from: u[6], to: u[7], iaea: u[8] }));
  const n = k => units.filter(u => u.st === k).length, mw = units.filter(u => u.st === N_RUN).reduce((a, u) => a + u.mw, 0), lead = units[0].st;
  return { layer: 'nuclear', id: 'npp' + i + '-' + s[0].toLowerCase().replace(/[^a-z0-9]+/g, '-'), title: s[0], kind: 'Nuclear power station', country: s[4], cc: s[3], lat: s[1], lon: s[2], v: ll(s[1], s[2], 1.004),
    units, lead, mw, running: n(N_RUN), building: n(N_BUILD),
    size: lead === N_RUN ? 4.6 + 3.4 * Math.sqrt(Math.min(1, mw / 8000)) : lead === N_BUILD ? 4.4 : 3.6,
    alpha: lead === N_RUN ? 0.96 : lead === N_BUILD ? 0.84 : lead === N_PAUSE ? 0.66 : lead === N_PLAN ? 0.52 : 0.4 };
}
const nukeSites = NUKE.sites.map(nukeSite);
let nukeMore = [];
function loadNuclear() { applyItems('nuclear', nukeSites.concat(nukeMore)); }
/* "2 reactors running, 1 being built" */
function nukeCounts(it) {
  const by = {}; for (const u of it.units) by[u.st] = (by[u.st] || 0) + 1;
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(k => by[k] + (by[k] === 1 ? ' reactor ' : ' reactors ') + NUKE_WORD[k]).join(', ');
}
function nukeExplain(it) {
  if (it.wd) return it.note;
  if (it.lead === N_RUN) return 'A nuclear power station makes electricity from the heat of splitting uranium atoms: the heat boils water and the steam spins turbines. It burns nothing, so the plumes above its towers are water vapour, not smoke.';
  if (it.lead === N_BUILD) return 'A nuclear power station under construction. Reactors take around six to ten years to build, and often longer.';
  if (it.lead === N_PLAN) return 'A nuclear power station that has been announced or approved, but where building has not begun.';
  if (it.lead === N_PAUSE) return 'The reactors here are intact but switched off for a long period, for repairs, safety reviews or a political decision. They could be restarted.';
  if (it.lead === N_SHUT) return 'The reactors here have stopped for good. Taking a nuclear power station apart safely takes decades, so the buildings and their used fuel are usually still on the site.';
  return 'A nuclear power station that was started but never made electricity for the grid.';
}
function nukeUnitLine(u) {
  const bits = [];
  if (u.st === N_RUN) bits.push(u.from ? 'Running since ' + u.from : 'Running');
  else if (u.st === N_SHUT || u.st === 5) bits.push(u.from && u.to ? 'Ran ' + u.from + ' to ' + u.to : u.from ? 'Ran from ' + u.from + ', now shut down' : u.to ? 'Closed in ' + u.to : cap(NUKE_WORD[u.st]));
  else if (u.st === N_BUILD) bits.push(u.begun ? 'Being built since ' + u.begun : 'Being built');
  else if (u.st === N_PAUSE) bits.push('Stopped for now' + (u.from ? ', ran from ' + u.from : ''));
  else bits.push(cap(NUKE_WORD[u.st]));
  if (u.mw) bits.push(num(u.mw) + ' MW');
  if (u.type) bits.push(u.type + (u.model && u.model !== u.type ? ' ' + u.model : ''));
  return bits.join(', ');
}
DETAILS.nuclear = it => {
  if (it.wd) return {
    title: '<div class="big word">' + esc(it.title) + '</div><p>' + esc([it.kind, it.country].filter(Boolean).join(', ')) + '</p>',
    rows: [['Listed as', esc(cap(it.type || 'nuclear facility'))], it.country ? ['Country', esc(it.country)] : null, ['Location', esc(fmtLL(it.lat, it.lon))], ['Record', 'Wikidata, a database anyone can edit']],
    actions: link('https://www.wikidata.org/wiki/' + encodeURIComponent(it.wd), 'Open the Wikidata record')
  };
  const types = Array.from(new Set(it.units.map(u => u.type).filter(Boolean))), first = it.units.map(u => u.from).filter(Boolean).sort()[0], last = it.units.map(u => u.to).filter(Boolean).sort().pop();
  const all = it.units.reduce((a, u) => a + (u.st === N_BUILD || u.st === N_PLAN ? u.mw : 0), 0);
  return {
    title: '<div class="big word">' + esc(it.title) + '</div><p>Nuclear power station, ' + esc(it.country) + '</p>',
    rows: [
      ['Reactors', esc(nukeCounts(it))],
      it.mw ? ['Output', num(it.mw) + ' MW of electricity at full power'] : null,
      all ? ['Still to come', num(all) + ' MW'] : null,
      types.length ? [types.length === 1 ? 'Reactor type' : 'Reactor types', esc(types.map(NUKE_TYPE).map(cap).join('; '))] : null,
      first ? ['First power', String(first)] : null,
      !it.running && !it.building && last ? ['Last reactor closed', String(last)] : null,
      ['Location', esc(fmtLL(it.lat, it.lon))],
      ['Record', 'IAEA, as of ' + nukeEdition]
    ],
    extra: '<h3>' + (it.units.length === 1 ? 'The reactor' : 'Reactor by reactor') + '</h3>' + it.units.map(u => '<div class="row unit" data-st="' + u.st + '">' + swatch('nuclear') + '<span><span class="t">' + esc(u.name) + '</span><span class="s">' + esc(nukeUnitLine(u)) + '</span></span></div>').join(''),
    actions: link('https://pris-stats.iaea.org/', 'IAEA reactor database') + link('https://github.com/cristianst85/GeoNuclearData', 'About this list')
  };
};
/* the smaller sites, from Wikidata: anything filed there as a nuclear facility or a research reactor that has a position */
const NUKE_KINDS = [
  [/fusion|tokamak|stellarator/, 'Fusion experiment', 'An experiment that tries to release energy the way the Sun does, by fusing light atoms together instead of splitting heavy ones.'],
  [/waste|repositor|storage|disposal|interim/, 'Nuclear waste store', 'A place where radioactive waste or used reactor fuel is stored or buried.'],
  [/enrich|reprocess|fuel|conversion|uranium|plutonium|centrifuge/, 'Nuclear fuel plant', 'A plant that prepares uranium for reactors, or recovers usable material from fuel that has been through one.'],
  [/weapon|test site|bomb|warhead/, 'Nuclear weapons site', 'A site built for nuclear weapons: making, storing or testing them.'],
  [/research|reactor|pile|institute|laborator/, 'Research reactor', 'A small reactor used for science, training and making medical isotopes rather than electricity.']
];
async function loadNuclearMore() {
  setStatus('wikidata', 'load');
  try {
    const q = 'SELECT ?i ?iLabel ?c ?tLabel ?countryLabel WHERE { { ?i wdt:P31/wdt:P279* wd:Q1739545 } UNION { ?i wdt:P31/wdt:P279* wd:Q1438105 } ?i wdt:P625 ?c . OPTIONAL { ?i wdt:P31 ?t } OPTIONAL { ?i wdt:P17 ?country } SERVICE wikibase:label { bd:serviceParam wikibase:language "en" } } LIMIT 9000';
    const d = await getJSON('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), 45000, false, KEEP), seen = {};
    for (const b of (d.results && d.results.bindings) || []) {
      const id = String((b.i && b.i.value) || '').split('/').pop(), name = b.iLabel && b.iLabel.value, m = /Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)/.exec((b.c && b.c.value) || '');
      if (!/^Q\d+$/.test(id) || !name || /^Q\d+$/.test(name) || !m) continue;
      const o = seen[id] || (seen[id] = { id, name, lat: +m[2], lon: +m[1], types: [], country: b.countryLabel && !/^Q\d+$/.test(b.countryLabel.value) ? b.countryLabel.value : '' });
      const t = b.tLabel && b.tLabel.value; if (t && !/^Q\d+$/.test(t) && !o.types.includes(t)) o.types.push(t);
    }
    const out = [];
    for (const id of Object.keys(seen)) {
      const o = seen[id], T = o.types.join(' ').toLowerCase();
      if (!isFinite(o.lat) || !isFinite(o.lon) || Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180) continue;
      if (/ship|submarine|vessel|icebreaker|carrier|cruiser|boat|\bclass\b|satellite|spacecraft/.test(T)) continue;                    /* nuclear-powered craft are not places */
      const power = /power (plant|station)|nuclear power|electricity generat/.test(T) && !/research|waste|storage|reprocess|enrich|fuel/.test(T);
      const near = (list, km) => list.some(s => Math.abs(s.lat - o.lat) < 0.2 && gcKm(s.lat, s.lon, o.lat, o.lon) < km);
      if (power ? near(nukeSites, 8) : near(out, 0.4)) continue;                    /* a power station already on the built-in list, or the same place filed twice */
      const kind = power ? [0, 'Nuclear power station', 'A nuclear power station that is on Wikidata but not in the built-in list of reactors, usually because it is planned, very old or very new.'] : NUKE_KINDS.find(k => k[0].test(T)) || [0, 'Nuclear facility', 'A site that handles nuclear material or belongs to the nuclear industry.'];
      out.push({ layer: 'nuclear', id: 'wd' + o.id, wd: o.id, title: o.name.slice(0, 80), kind: kind[1], note: kind[2], type: o.types[0] || '', country: o.country, lat: o.lat, lon: o.lon, v: ll(o.lat, o.lon, 1.0038), size: 3.3, alpha: 0.6 });
      if (out.length >= 2500) break;
    }
    nukeMore = out; loadNuclear(); okStatus('wikidata', d);
  } catch (e) { setStatus('wikidata', 'warn', 'no answer, so only power reactors are shown'); }
}
