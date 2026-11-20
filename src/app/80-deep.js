/* ============================================================
   Deeper sources: the full picture of what is in orbit (debris, spent rockets, close calls, catalogue records),
   the Sun, more to listen to (scan, wild sounds), NASA satellite views draped on the globe,
   live cameras, undersea cables, nuclear facilities, carbon dioxide and photos of any place
   ============================================================ */
Object.assign(SOURCES, {
  junk:     { label: 'CelesTrak debris', what: 'Every tracked debris fragment and spent rocket stage with a public orbit, loaded when you switch those layers on', url: 'https://celestrak.org/NORAD/elements/', lazy: true },
  socrates: { label: 'CelesTrak SOCRATES', what: 'Predicted close passes between objects in orbit over the coming week', url: 'https://celestrak.org/SOCRATES/' },
  satcat:   { label: 'CelesTrak SATCAT', what: 'The catalogue record (owner, launch date and site) for the object you select', url: 'https://celestrak.org/satcat/search.php', lazy: true },
  isounds:  { label: 'iNaturalist sounds', what: 'Newly identified wildlife sound recordings', url: 'https://www.inaturalist.org/observations?sounds' },
  gibs:     { label: 'NASA GIBS', what: 'Whole-Earth satellite views: rain, snow and ice, true colour, sea temperature and algae, haze, air pollution and volcanic gas, ground temperature, soil moisture, vegetation, floods and night lights', url: 'https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api', lazy: true },
  co2:      { label: 'global-warming.org', what: 'Daily global carbon dioxide level, from NOAA’s Global Monitoring Laboratory', url: 'https://global-warming.org/' },
  cams:     { label: 'Road cameras', what: 'Live video from Caltrans highway cameras, clips from Transport for London JamCams, and pictures from Fintraffic road weather cameras and Singapore LTA traffic cameras', url: 'https://www.digitraffic.fi/en/road-traffic/', lazy: true },
  commons:  { label: 'Wikimedia Commons', what: 'Photos taken near the place you select', url: 'https://commons.wikimedia.org/', lazy: true }
});
const glyph = d => '<svg class="swatch glyph" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
const G_ORBIT = '<circle cx="8" cy="8" r="2.1"/><ellipse cx="8" cy="8" rx="6.8" ry="3" transform="rotate(-28 8 8)"/>';
const G_SOUND = '<path d="M2.5 6.2v3.600h2.300l3.200 2.700V3.500L4.800 6.200Z"/><path d="M10.4 6a3 3 0 0 1 0 4M12.200 4.300a5.400 5.400 0 0 1 0 7.400"/>';
const G_AIR = '<path d="M2 5.500h7.200a1.900 1.900 0 1 0-1.900-1.900M2 8.500h10.400a1.900 1.900 0 1 1-1.900 1.900M2 11.500h4.600"/>';
const G_HOT = '<path d="M8 2.200v7.200"/><circle cx="8" cy="11.300" r="2.400"/><path d="M6.300 9.600V3.700a1.700 1.700 0 0 1 3.400 0v5.900"/>';
const G_STAR = '<path d="M13.800 2.200 7.400 8.600M9.400 2.800l-3 3M13.200 6.600l-3 3"/><circle cx="5.200" cy="10.800" r="2.300"/>';
const distWord = km => (km < 1 ? Math.max(1, Math.round(km * 1000)) + ' m' : km < 10 ? km.toFixed(1) + ' km' : Math.round(km) + ' km');
const nice = s => String(s).replace(/\b([A-Z])([A-Z]{4,})\b/g, (m, a, b) => a + b.toLowerCase());
const dayMonth = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/* ============================================================
   In orbit
   ============================================================ */
const BREAKUPS = [
  [/^FENGYUN 1C/, 'Fengyun-1C, a Chinese weather satellite that China destroyed with a missile in a weapons test in January 2007. It became the largest cloud of debris ever tracked, and most of it will stay up for decades.', '2007 weapons test'],
  [/^COSMOS 2251/, 'Cosmos 2251, a dead Russian communications satellite. In February 2009 it struck the working satellite Iridium 33 above Siberia at about 42,000 km/h, the first collision between two intact satellites.', '2009 collision'],
  [/^IRIDIUM 33/, 'Iridium 33, a working American phone satellite destroyed in February 2009 when the dead Russian satellite Cosmos 2251 ran into it above Siberia.', '2009 collision'],
  [/^COSMOS 1408/, 'Cosmos 1408, a dead Soviet satellite that Russia destroyed with a missile in a weapons test in November 2021. It flew low, so most of its pieces have already fallen and burned up.', '2021 weapons test'],
  [/^CZ-6A/, 'a Chinese Long March 6A rocket stage. Two of these stages broke apart after reaching orbit, in 2022 and 2024, each shedding hundreds of pieces.', 'rocket stages that broke apart'],
  [/^INTELSAT 33E/, 'Intelsat 33e, a communications satellite that broke apart in the geostationary belt in October 2024.', 'broke apart in 2024'],
  [/^MICROSAT-R/, 'Microsat-R, an Indian satellite that India destroyed with a missile in a weapons test in March 2019.', '2019 weapons test'],
  [/^YUNHAI 1-02/, 'Yunhai 1-02, a Chinese weather satellite that was hit by a small piece of an old rocket in 2021.', 'struck by debris in 2021'],
  [/^DMSP 5D-2 F13/, 'a retired American military weather satellite that exploded in 2015 when its battery failed.', 'battery explosion, 2015'],
  [/^NOAA 16/, 'NOAA 16, a retired American weather satellite that broke apart in 2015.', 'broke apart in 2015'],
  [/^BREEZE-M/, 'a Russian Breeze-M rocket stage. Several of these have exploded in orbit when leftover fuel ignited.', 'rocket stages that exploded'],
  [/^PEGASUS/, 'the upper stage of an American Pegasus rocket that exploded in 1996, two years after its launch.', 'exploded in 1996'],
  [/^(DELTA 1|THORAD|THOR )/, 'an American rocket stage from the 1960s or 70s. Several of them exploded years after launch when leftover fuel ignited.', 'old rocket stages that exploded']
];
const ROCKET_NAMES = { 'SL-3': 'Vostok', 'SL-4': 'Soyuz', 'SL-6': 'Molniya', 'SL-8': 'Kosmos-3M', 'SL-11': 'Tsyklon-2', 'SL-12': 'Proton', 'SL-14': 'Tsyklon-3', 'SL-16': 'Zenit', 'SL-19': 'Rokot', 'SL-24': 'Dnepr' };
const junkParent = name => String(name).replace(/\s+(DEB|R\/B)\b.*$/, '').trim();
function rocketName(name) {
  const n = junkParent(name);
  return ROCKET_NAMES[n] ? ROCKET_NAMES[n] + ' (catalogued as ' + n + ')' : nice(n.replace(/^CZ-/, 'Long March '));
}
function junkStory(it) {
  if (it.layer === 'rockets') return 'The used upper stage of a ' + rocketName(it.title) + ' rocket, left in orbit after it released its cargo. Low ones fall back and burn up within months or years; high ones can circle for centuries.';
  const parent = junkParent(it.title), known = BREAKUPS.find(b => b[0].test(parent));
  return known ? 'A fragment of ' + known[1] : 'A fragment of ' + nice(parent) + '. Fragments come from explosions, collisions, or parts that simply came loose from old hardware.';
}
/* lowest and highest point of an orbit, from its shape */
function orbitShape(noRadMin, ecc) {
  const a = Math.pow(398600.4418 / Math.pow(noRadMin / 60, 2), 1 / 3);
  return { alt: a - EARTH_KM, peri: a * (1 - ecc) - EARTH_KM, apo: a * (1 + ecc) - EARTH_KM };
}
function orbitSpan(rec) {
  const o = orbitShape(rec.no, rec.ecco || 0);
  return o.apo - o.peri < 25 ? 'About ' + num(o.alt) + ' km, nearly circular' : num(Math.max(0, o.peri)) + ' to ' + num(o.apo) + ' km';
}

/* ---------- the catalogue record for one object (CelesTrak SATCAT), fetched when it is selected ---------- */
const OWNERS = { US: 'United States', CIS: 'Russia (or the former Soviet Union)', PRC: 'China', UK: 'United Kingdom', FR: 'France', JPN: 'Japan', IND: 'India', ESA: 'European Space Agency', CA: 'Canada', GER: 'Germany', IT: 'Italy', SPN: 'Spain',
  ISRA: 'Israel', SKOR: 'South Korea', NKOR: 'North Korea', AUS: 'Australia', BRAZ: 'Brazil', ARGN: 'Argentina', LUXE: 'Luxembourg', SES: 'SES (Luxembourg)', ITSO: 'Intelsat', IM: 'Inmarsat', EUTE: 'Eutelsat', EUME: 'EUMETSAT',
  GLOB: 'Globalstar', O3B: 'O3b Networks', ORB: 'Orbcomm', IRID: 'Iridium', ISS: 'International Space Station partners', NATO: 'NATO', TURK: 'Türkiye', UAE: 'United Arab Emirates', INDO: 'Indonesia', NETH: 'Netherlands',
  SWED: 'Sweden', NOR: 'Norway', FIN: 'Finland', DEN: 'Denmark', BEL: 'Belgium', SWTZ: 'Switzerland', TWN: 'Taiwan', ROC: 'Taiwan', THAI: 'Thailand', MEX: 'Mexico', NZ: 'New Zealand', SING: 'Singapore', MALA: 'Malaysia',
  SAUD: 'Saudi Arabia', EGYP: 'Egypt', IRAN: 'Iran', PAKI: 'Pakistan', KAZ: 'Kazakhstan', UKR: 'Ukraine', CHLE: 'Chile', AB: 'Arabsat', AC: 'AsiaSat', SAFR: 'South Africa', NIG: 'Nigeria', VTNM: 'Vietnam', RP: 'Philippines',
  POL: 'Poland', CZCH: 'Czechia', HUN: 'Hungary', GREC: 'Greece', POR: 'Portugal', TBD: 'Not yet identified' };
const SITES = { AFETR: 'Cape Canaveral, Florida', AFWTR: 'Vandenberg, California', TYMSC: 'Baikonur, Kazakhstan', TTMTR: 'Baikonur, Kazakhstan', PLMSC: 'Plesetsk, Russia', PKMTR: 'Plesetsk, Russia', VOSTO: 'Vostochny, Russia',
  KYMSC: 'Kapustin Yar, Russia', DLS: 'Dombarovsky, Russia', JSC: 'Jiuquan, China', XICLF: 'Xichang, China', TAISC: 'Taiyuan, China', WSC: 'Wenchang, China', YSLA: 'a ship in the Yellow Sea', SCSLA: 'a ship in the South China Sea',
  FRGUI: 'Kourou, French Guiana', SRILR: 'Sriharikota, India', TANSC: 'Tanegashima, Japan', KSCUT: 'Uchinoura, Japan', WLPIS: 'Wallops Island, Virginia', RLLB: 'Mahia, New Zealand', KODAK: 'Kodiak, Alaska', KWAJ: 'Kwajalein Atoll',
  SEAL: 'a platform in the Pacific Ocean', NSC: 'Naro, South Korea', SEMLS: 'Semnan, Iran', SMTS: 'Shahrud, Iran', YUN: 'Sohae, North Korea', PALB: 'Palmachim, Israel', WOMRA: 'Woomera, Australia', HGSTR: 'Hammaguir, Algeria',
  SNMLP: 'the San Marco platform off Kenya', ERAS: 'an aircraft over the Atlantic', WRAS: 'an aircraft over the Pacific', SUBL: 'a submarine in the Barents Sea' };
const OPS = { '+': 'working', '-': 'no longer working', P: 'partly working', B: 'kept as a backup', S: 'kept as a spare', X: 'on an extended mission', D: 'fallen from orbit', '?': 'status unknown' };
const satcat = {};
function paintSatcat(it, r) {
  const kind = { PAY: 'Satellite', 'R/B': 'Rocket stage', DEB: 'Debris', UNK: 'Unidentified object' }[r.OBJECT_TYPE] || 'Object';
  slot(it, 'sc-kind', esc(kind + (r.OBJECT_TYPE === 'PAY' && OPS[r.OPS_STATUS_CODE] ? ', ' + OPS[r.OPS_STATUS_CODE] : '')));
  slot(it, 'sc-owner', esc(OWNERS[r.OWNER] || r.OWNER || 'Not listed'));
  const t = Date.parse(r.LAUNCH_DATE);
  slot(it, 'sc-launch', isFinite(t) ? esc(dayMonth(t)) + (r.LAUNCH_SITE ? '<br><small>from ' + esc(SITES[r.LAUNCH_SITE] || r.LAUNCH_SITE) + '</small>' : '') : 'Not listed');
  const rcs = r.RCS == null || r.RCS === '' ? NaN : +r.RCS;
  slot(it, 'sc-size', !isFinite(rcs) ? 'Not published' : rcs < 0.1 ? 'Small on radar, under 0.1 m²' : rcs < 1 ? 'Medium on radar, ' + rcs.toFixed(2) + ' m²' : 'Large on radar, ' + rcs.toFixed(1) + ' m²');
}
function loadSatcat(it) {
  const id = String(+it.id);
  if (satcat[id]) return paintSatcat(it, satcat[id]);
  const none = () => { slot(it, 'sc-kind', esc(LAYERS[it.layer].one)); slot(it, 'sc-owner', 'Unavailable'); slot(it, 'sc-size', 'Unavailable'); const el = $('[data-slot="sc-launch"]', detailEl); if (el && el.querySelector('.skel')) slot(it, 'sc-launch', 'Unavailable'); };
  getJSON('https://celestrak.org/satcat/records.php?CATNR=' + encodeURIComponent(id) + '&FORMAT=json', 15000).then(d => {
    const r = Array.isArray(d) ? d[0] : null;
    if (!r) throw new Error('empty');
    satcat[id] = r; setStatus('satcat', 'ok'); paintSatcat(it, r);
  }).catch(e => { setStatus('satcat', 'err', errNote(e)); none(); });
}
function findSat(id) {
  for (const k of SAT_KEYS.concat('stations')) { const it = layers[k].items.find(x => +x.id === +id); if (it) return it; }
  return null;
}

/* ---------- predicted close passes (CelesTrak SOCRATES) ---------- */
function csvLine(s) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
async function loadSocrates() {
  setStatus('socrates', 'load');
  try {
    let rows = store.get('calls', 5 * 3600000);
    if (!rows) {
      const text = await getJSON('https://celestrak.org/SOCRATES/sort-minRange.csv', 40000, true);
      const lines = String(text).trim().split(/\r?\n/), head = csvLine(lines[0]).map(h => h.trim()), ix = n => head.indexOf(n);
      if (ix('TCA') < 0 || ix('TCA_RANGE') < 0) throw new Error('unexpected format');
      const name = s => String(s || '').replace(/\s*\[[^\]]*\]\s*$/, '').trim();
      rows = [];
      for (const ln of lines.slice(1, 301)) {
        const c = csvLine(ln), t = parseUTC(c[ix('TCA')]), km = +c[ix('TCA_RANGE')];
        if (!isFinite(t) || !isFinite(km)) continue;
        rows.push({ a: name(c[ix('OBJECT_NAME_1')]), ida: +c[ix('NORAD_CAT_ID_1')], b: name(c[ix('OBJECT_NAME_2')]), idb: +c[ix('NORAD_CAT_ID_2')], t, km, v: +c[ix('TCA_RELATIVE_SPEED')], p: +c[ix('MAX_PROB')] });
      }
      if (!rows.length) throw new Error('empty');
      rows = rows.sort((x, y) => x.km - y.km).slice(0, 40);
      store.set('calls', rows);
    }
    extra.calls = rows.filter(r => r.t > Date.now() - 1800000).slice(0, 12);
    setStatus('socrates', 'ok'); orbitChanged();
  } catch (e) {
    const old = store.get('calls');
    if (old && old.length) { extra.calls = old.filter(r => r.t > Date.now()).slice(0, 12); setStatus('socrates', 'warn', 'provider unreachable, showing the last saved list'); }
    else setStatus('socrates', 'err', errNote(e));
  }
}

/* ---------- everything in orbit: counts, where it flies, the biggest debris clouds, what is about to fall ---------- */
const BANDS = [[400, 'Below 400 km', 'space stations'], [600, '400 to 600 km', 'Starlink, most new satellites'], [800, '600 to 800 km', 'Earth-watching satellites'], [1000, '800 to 1,000 km', 'the most littered region'],
  [2000, '1,000 to 2,000 km', ''], [30000, 'Medium orbits', 'navigation satellites'], [40000, 'Geostationary belt', 'TV and weather satellites'], [Infinity, 'Higher still', '']];
const FLEETS = { STARLINK: 'Starlink, SpaceX internet', ONEWEB: 'OneWeb internet', KUIPER: 'Kuiper, Amazon internet', QIANFAN: 'Qianfan, Chinese internet', HULIANWANG: 'Guowang, Chinese internet', GUOWANG: 'Guowang, Chinese internet',
  IRIDIUM: 'Iridium satellite phones', GLOBALSTAR: 'Globalstar satellite phones', ORBCOMM: 'Orbcomm machine messaging', FLOCK: 'Planet’s Dove cameras', SKYSAT: 'Planet’s SkySat cameras', LEMUR: 'Spire weather and ship trackers',
  COSMOS: 'Russian government satellites', YAOGAN: 'Yaogan, Chinese military observation', JILIN: 'Jilin, Chinese cameras', NAVSTAR: 'GPS', GPS: 'GPS', GSAT: 'Galileo navigation', BEIDOU: 'BeiDou navigation', GLONASS: 'GLONASS navigation',
  SPACEBEE: 'SpaceBEE trackers', ICEYE: 'ICEYE radar cameras', USA: 'United States military', HAWK: 'HawkEye radio mappers', CAPELLA: 'Capella radar cameras', SHIJIAN: 'Shijian, Chinese experiments', TIANMU: 'Tianmu weather sensors' };
let orbitCache = null;
function orbitChanged() { orbitCache = null; dirty.summary = true; if (selected && selected.layer === 'orbit' && !uiPointerDown) renderDetail(); }
function orbitStats() {
  if (orbitCache) return orbitCache;
  const st = { live: 0, debris: 0, rockets: 0, dead: 0, bands: BANDS.map(b => ({ label: b[1], note: b[2], live: 0, junk: 0 })), low: [], top: [], fleets: [] }, fam = {}, fleet = {};
  for (const key of SAT_KEYS) {
    const S = layers[key].sat; if (!S || !S.started) continue;
    for (const it of layers[key].items) {
      const mm = parseFloat(it.l2.slice(52, 63)), ecc = parseFloat('0.' + it.l2.slice(26, 33).trim()) || 0;
      if (!(mm > 0)) continue;
      const o = orbitShape(mm * 2 * Math.PI / 1440, ecc), b = st.bands[BANDS.findIndex(x => o.alt < x[0])];
      if (JUNK[key]) {
        b.junk++; st[key]++;
        if (o.peri > 90 && o.peri < 260) st.low.push([o.peri, it]);
        if (key === 'debris') { const f = junkParent(it.title); fam[f] = (fam[f] || 0) + 1; }
      } else { b.live++; st.live++; const fk = (/^[A-Z]{3,}/.exec(it.title) || [''])[0]; if (fk) fleet[fk] = (fleet[fk] || 0) + 1; }
    }
  }
  st.low = st.low.sort((x, y) => x[0] - y[0]).slice(0, 5);
  st.top = Object.keys(fam).map(k => [k, fam[k]]).sort((x, y) => y[1] - x[1]).slice(0, 6);
  st.fleets = Object.keys(fleet).map(k => [k, fleet[k]]).filter(f => f[1] >= 12).sort((x, y) => y[1] - x[1]).slice(0, 8);
  return (orbitCache = st);
}
DETAILS.orbit = () => {
  const st = orbitStats(), total = st.live + st.debris + st.rockets + st.dead, calls = extra.calls || [];
  const junkLoaded = layers.debris.sat && layers.debris.sat.started, rocketsLoaded = layers.rockets.sat && layers.rockets.sat.started, deadLoaded = layers.dead.sat && layers.dead.sat.started;
  const max = Math.max.apply(null, st.bands.map(b => b.live + b.junk).concat(1));
  let x = '';
  if (!junkLoaded || !rocketsLoaded || !deadLoaded) x += '<div class="insp-actions"><button class="btn primary" data-layers-on="debris,rockets,dead">Add debris, spent rockets and dead satellites</button></div>';
  if (total) x += '<h3>How high everything flies</h3><div class="hbars">' + st.bands.map(b => '<div class="hb"><span class="l">' + b.label + (b.note ? '<small>' + b.note + '</small>' : '') + '</span><span class="n mono">' + (b.live + b.junk).toLocaleString() + '</span><span class="bar"><i style="width:' + (b.live / max * 100).toFixed(1) +
    '%"></i><i class="junk" style="width:' + (b.junk / max * 100).toFixed(1) + '%"></i></span></div>').join('') +
    '</div><p class="keyline"><i class="sw"></i>working satellites<i class="sw junk"></i>debris, spent rockets and dead satellites</p>';
  if (st.fleets.length) x += '<h3>Largest fleets of working satellites</h3><table class="tbl"><tbody>' + st.fleets.map(f => '<tr><td>' + esc(FLEETS[f[0]] || nice(f[0])) + '</td><td class="num">' + f[1].toLocaleString() + '</td></tr>').join('') + '</tbody></table>';
  if (calls.length) x += '<h3>Closest predicted passes this week</h3><p class="hint">Worked out by CelesTrak from public orbit data, which is only good to within about a kilometre. Operators have better data and steer working satellites out of the way.</p>' +
    calls.slice(0, 6).map(c => '<button class="row" data-sat="' + c.ida + ',' + c.idb + '">' + swatch(/DEB|R\/B/.test(c.a + c.b) ? 'debris' : 'sats') + '<span><span class="t">' + esc(nice(c.a)) + ' and ' + esc(nice(c.b)) + '</span><span class="s">' +
      distWord(c.km) + ' apart, ' + untilSpan(c.t) + (isFinite(c.v) ? ', passing at ' + c.v.toFixed(1) + ' km/s' : '') + '</span></span></button>').join('');
  if (st.top.length) x += '<h3>Largest debris clouds' + (layers.debris.partial ? '' : ' still in orbit') + '</h3><table class="tbl"><tbody>' + st.top.map(f => { const k = BREAKUPS.find(b => b[0].test(f[0]));
    return '<tr><td>' + esc(nice(f[0])) + (k ? '<br><small>' + esc(cap(k[2])) + '</small>' : '') + '</td><td class="num">' + f[1].toLocaleString() + ' pieces</td></tr>'; }).join('') + '</tbody></table>';
  if (st.low.length) x += '<h3>Next to fall</h3><p class="hint">The lowest junk being tracked. Thin air at this height drags it down within days or weeks, and nearly all of it burns up on the way.</p>' +
    st.low.map(l => row(l[1], esc(nice(l[1].title)), 'dips to ' + num(l[0]) + ' km', LAYERS[l[1].layer].one)).join('');
  x += '<p class="hint">Shown here: every working satellite, every tracked debris fragment and every spent rocket stage with a public orbit. Dead satellites that are still in one piece are not published as one open list, so that layer gathers the largest families by name and a few hundred others are missing.</p>';
  x += '<p class="hint">Radar can only follow pieces larger than about 10 cm. The European Space Agency estimates more than a million smaller fragments, each still able to wreck a satellite.</p>';
  return {
    title: '<div class="big">' + (total ? total.toLocaleString() : '–') + '</div><p>Objects being tracked on this globe right now' + (junkLoaded ? '' : ', counting working satellites only until the debris layers are switched on') + '.</p>',
    rows: [
      ['Working satellites', st.live ? st.live.toLocaleString() : 'Loading…'],
      ['Debris fragments', junkLoaded ? st.debris.toLocaleString() + (layers.debris.partial ? ' (four largest clouds)' : '') : layers.debris.loadingSat ? 'Loading…' : 'Not loaded'],
      ['Spent rocket stages', rocketsLoaded ? st.rockets.toLocaleString() : layers.rockets.loadingSat ? 'Loading…' : 'Not loaded'],
      ['Dead satellites', deadLoaded ? st.dead.toLocaleString() + ' (largest families)' : layers.dead.loadingSat ? 'Loading…' : 'Not loaded'],
      calls.length ? ['Closest pass predicted', distWord(calls[0].km) + ', ' + untilSpan(calls[0].t)] : null,
      space.flux ? ['Sun’s effect on debris', space.flux > 150 ? 'Active Sun: falling faster' : space.flux > 100 ? 'Moderate' : 'Quiet Sun: falling slower'] : null
    ],
    extra: x,
    actions: link('https://celestrak.org/SOCRATES/', 'All close passes') + link('https://www.esa.int/Space_Safety/Space_Debris', 'ESA on space debris')
  };
};

/* ---------- spacecraft docked at the International Space Station (Launch Library; asked only when the station is opened) ---------- */
function loadDocked(it) {
  const paint = d => slot(it, 'docked', d.list.length ? '<h3>Docked right now</h3><ul class="plain">' + d.list.map(c => '<li>' + esc(c.name) + '<small>' + esc(c.port) + (isFinite(c.since) ? ', since ' + esc(new Date(c.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) : '') + '</small></li>').join('') + '</ul>' : '');
  const saved = store.get('docked', 6 * 3600000);
  if (saved) return paint(saved);
  getJSON('https://ll.thespacedevs.com/2.3.0/space_stations/4/?format=json', 30000).then(r => {
    const d = { list: (r.docking_location || []).filter(p => p.currently_docked).map(p => {
      const c = p.currently_docked, fv = c.flight_vehicle_chaser || c.flight_vehicle || {};
      return { port: p.name, name: (fv.spacecraft && fv.spacecraft.name) || 'Spacecraft', since: Date.parse(c.docking) };
    }) };
    store.set('docked', d); paint(d);
  }).catch(() => { const old = store.get('docked'); old ? paint(old) : slot(it, 'docked', ''); });
}

/* ============================================================
   The Sun: latest flare, NOAA's three storm scales, radio output
   ============================================================ */
const SWPC = 'https://services.swpc.noaa.gov/';
const flareWord = c => ({ A: 'barely measurable', B: 'very small', C: 'small', M: 'medium, able to disturb shortwave radio on the sunlit side of Earth', X: 'major, able to black out shortwave radio across the sunlit side of Earth' }[String(c || '').charAt(0)] || 'unclassified');
async function loadSun() {
  try { const d = await getJSON(SWPC + 'json/goes/primary/xray-flares-latest.json', 20000, false, KEEP), f = Array.isArray(d) ? d[0] : d; if (f && f.max_class) space.flare = { cls: f.max_class, time: parseUTC(f.max_time), now: f.current_class }; } catch (e) {}
  try {
    const d = await getJSON(SWPC + 'products/noaa-scales.json', 20000, false, KEEP), n = d['0'] || {}, t = d['1'] || {}, v = o => (o && o.Scale != null ? +o.Scale : 0), p = x => (x == null || x === '' ? null : +x);
    space.scales = { R: v(n.R), S: v(n.S), G: v(n.G), rMinor: p(t.R && t.R.MinorProb), rMajor: p(t.R && t.R.MajorProb), sProb: p(t.S && t.S.Prob), gNext: v(t.G) };
  } catch (e) {}
  try { const d = await getJSON(SWPC + 'products/summary/10cm-flux.json', 20000, false, KEEP), o = Array.isArray(d) ? d[0] : d, f = +(o.flux != null ? o.flux : o.Flux); if (isFinite(f)) space.flux = f; } catch (e) {}
  dirty.summary = true;
  if (selected && (selected.layer === 'swx' || selected.layer === 'listen') && !uiPointerDown) renderDetail();
}
const radioWord = () => { const s = space.scales; return !s ? null : s.R >= 3 ? 'Strong blackout on the sunlit side (R' + s.R + ')' : s.R >= 1 ? 'Patchy on the sunlit side (R' + s.R + ')' : 'Normal'; };
const swxBase = DETAILS.swx;
DETAILS.swx = it => {
  const d = swxBase(it), s = space.scales, f = space.flare, pic = (file, text) => '<figure><img src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_' + file + '.jpg" alt="" loading="lazy" onerror="this.parentNode.remove()"><figcaption>' + text + '</figcaption></figure>';
  d.rows = d.rows.concat([
    f ? ['Latest solar flare', esc(f.cls) + (isFinite(f.time) ? ', ' + agoSpan(f.time) : '') + '<br><small>' + cap(flareWord(f.cls)) + '</small>'] : null,
    s ? ['Shortwave radio', esc(radioWord()) + (s.rMinor != null ? '<br><small>' + s.rMinor + '% chance of a blackout in the next day</small>' : '')] : null,
    s ? ['Radiation storm', (s.S ? 'In progress (S' + s.S + ')' : 'None') + (s.sProb != null ? '<br><small>' + s.sProb + '% chance in the next day</small>' : '')] : null,
    s ? ['Magnetic storm', (s.G ? 'In progress (G' + s.G + ')' : 'None') + (s.gNext ? '<br><small>G' + s.gNext + ' forecast for tomorrow</small>' : '')] : null,
    space.flux ? ['Sun’s radio output', Math.round(space.flux) + ' units<br><small>' + (space.flux > 150 ? 'An active Sun' : space.flux > 100 ? 'A moderately active Sun' : 'A quiet Sun') + '</small>'] : null
  ]);
  d.extra = '<h3>The Sun a few minutes ago</h3><div class="sunpics">' + pic('0193', 'Its outer atmosphere. Bright patches are active regions, where flares erupt.') + pic('HMIIC', 'Its surface in ordinary light. Dark specks are sunspots.') + '</div>' +
    '<p class="hint">Photographed by NASA’s Solar Dynamics Observatory. A more active Sun heats and swells Earth’s upper atmosphere, which drags low satellites and debris down sooner.</p>' + (d.extra || '');
  return d;
};

/* ============================================================
   Listening: local conditions at a station, the hub, and wild sound recordings
   ============================================================ */
function loadThere(it) {
  getJSON(METEO + '?latitude=' + it.lat.toFixed(2) + '&longitude=' + it.lon.toFixed(2) + '&current=temperature_2m,weather_code,is_day&timezone=auto', 12000).then(d => {
    const c = d.current, w = wmo(c.weather_code, c.is_day), off = d.utc_offset_seconds || 0;
    slot(it, 'there', '<span data-clock="' + off + '">' + clockAt(off) + '</span>, ' + Math.round(c.temperature_2m) + '°, ' + esc(w.text.toLowerCase()));
  }).catch(() => slot(it, 'there', 'Unavailable'));
}
const MOODS = [['news', 'News'], ['talk', 'Talk'], ['pop', 'Pop'], ['rock', 'Rock'], ['jazz', 'Jazz'], ['classical', 'Classical'], ['electronic|dance|house|techno', 'Electronic'], ['folk|traditional|world', 'Folk and world'],
  ['hip.?hop|rap', 'Hip-hop'], ['oldies|80s|70s|60s', 'Oldies'], ['ambient|chill|lounge', 'Calm']];
const moodPool = pat => { const re = new RegExp('(^|[\\s,])(' + pat + ')([\\s,]|$)', 'i'); return layers.radio.items.filter(x => re.test(x.tags || '')); };
DETAILS.listen = () => {
  const st = layers.radio.on ? layers.radio.items : [], snd = layers.sounds.on ? layers.sounds.items : [];
  const top = st.slice().sort((a, b) => b.clicks - a.clicks).slice(0, 6), moods = MOODS.map(m => [m, moodPool(m[0]).length]).filter(m => m[1] >= 3);
  let x = '';
  if (moods.length) x += '<h3>Tune by mood</h3><div class="chips pad">' + moods.map(m => '<button class="chip plain tap" data-tag="' + esc(m[0][0]) + '">' + m[0][1] + ' <small>' + m[1] + '</small></button>').join('') + '</div>';
  if (top.length) x += '<h3>Most played today</h3>' + top.map(s => row(s, esc(s.title), num(s.clicks) + ' plays', s.country)).join('');
  if (snd.length) x += '<h3>Wild sounds, newest first</h3>' + snd.slice(0, 7).map(s => row(s, esc(s.title), agoSpan(s.time), s.place ? String(s.place).split(',').pop().trim() : s.kindWord)).join('');
  if (!st.length && !snd.length) x += '<p class="empty">Switch on Radio stations or Wild sounds in the Layers tab to have something to hear.</p>';
  return {
    title: '<div class="big word">Listen to the planet</div><p>Live radio from ' + st.length.toLocaleString() + ' places and ' + snd.length + ' fresh wildlife recordings. Static plays while each one tunes in.</p>' +
      (st.length ? '<div class="tuner"><button class="btn primary" data-act="scan">' + (scan.on ? 'Stop scanning' : 'Scan the world') + '</button><button class="btn" data-act="shuffle">Random station</button></div>' +
        '<p class="muted small">Scanning stays with each station for 24 seconds, then hops somewhere else.</p>' : ''),
    rows: [radioWord() ? ['Shortwave conditions', esc(radioWord())] : null],
    extra: x
  };
};

/* wild sounds: recent recordings from iNaturalist that its community has identified */
const AUDIO_OK = /mpeg|mp3|mp4|m4a|aac|wav|ogg/i;
async function loadSounds() {
  setStatus('isounds', 'load');
  try {
    const d = await getJSON('https://api.inaturalist.org/v1/observations?sounds=true&geo=true&quality_grade=research&order=desc&order_by=created_at&per_page=80&locale=en', 30000, false, KEEP), items = [];
    for (const o of d.results || []) {
      const s = (o.sounds || []).find(x => safeUrl(x.file_url) && AUDIO_OK.test((x.file_content_type || '') + ' ' + x.file_url));
      if (!s) continue;
      let lat, lon;
      if (o.geojson && o.geojson.coordinates) { lon = +o.geojson.coordinates[0]; lat = +o.geojson.coordinates[1]; }
      else if (o.location) { const p = String(o.location).split(','); lat = +p[0]; lon = +p[1]; }
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const t = o.taxon || {}, ph = o.photos && o.photos[0];
      items.push({ layer: 'sounds', id: o.id, title: cap(t.preferred_common_name || o.species_guess || t.name || 'Unidentified animal'), sci: t.name, kindWord: TAXON[t.iconic_taxon_name] || 'Animal', place: o.place_guess,
        time: Date.parse(o.time_observed_at || o.observed_on || o.created_at) || Date.now(), url: s.file_url, credit: s.attribution, lic: s.license_code, by: o.user && o.user.login,
        img: ph && safeUrl(String(ph.url || '').replace('/square.', '/medium.')), page: safeUrl(o.uri) || 'https://www.inaturalist.org/observations/' + o.id, wiki: t.wikipedia_url,
        lat, lon, v: ll(lat, lon, 1.0045), size: 5.2, alpha: 0.92 });
    }
    const playing = radio.current && radio.current.layer === 'sounds' && items.find(x => x.id === radio.current.id);
    if (playing) radio.current = playing;
    applyItems('sounds', items);
    okStatus('isounds', d);
  } catch (e) { setStatus('isounds', 'err', errNote(e)); }
}
DETAILS.sounds = it => ({
  title: (it.img ? '<img class="thumb" src="' + esc(it.img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<div class="big word">' + esc(it.title) + '</div>' + (it.sci ? '<p><i>' + esc(it.sci) + '</i></p>' : '') +
    '<div class="tuner"><button class="btn primary" id="radio-play">Play recording</button><span class="eq" id="radio-eq" data-state="idle"><i></i><i></i><i></i><i></i></span><span class="muted" id="radio-state"></span></div>',
  rows: [
    ['Kind', esc(it.kindWord)],
    ['Recorded', agoSpan(it.time)],
    it.place ? ['Where', esc(it.place)] : null,
    it.by ? ['Recorded by', esc(it.by)] : null,
    ['Licence', esc(it.lic ? String(it.lic).toUpperCase() : 'All rights reserved by the recordist')],
    ['Location', esc(fmtLL(it.lat, it.lon))]
  ],
  actions: '<button class="btn" data-open="listen">More to hear</button>' + link(it.page, 'Open on iNaturalist') + link(it.wiki, 'Wikipedia')
});

/* ============================================================
   Carbon dioxide, meteor showers, and the extra "Right now" rows
   ============================================================ */
async function loadCO2() {
  setStatus('co2', 'load');
  try {
    let s = store.get('co2', 12 * 3600000);
    if (!s) {
      const d = await getJSON('https://global-warming.org/api/co2-api', 40000), a = d.co2 || [];
      if (a.length < 400) throw new Error('empty');
      const last = a[a.length - 1], yr = a[a.length - 366], series = [];
      for (let i = a.length - 1; i >= 0; i -= 30) series.unshift(+a[i].trend);
      s = { now: +last.cycle, trend: +last.trend, date: Date.UTC(+last.year, +last.month - 1, +last.day), yearAgo: yr ? +yr.trend : null, first: +a[0].trend, firstYear: +a[0].year, series: series.filter(isFinite) };
      if (!isFinite(s.trend)) throw new Error('empty');
      store.set('co2', s);
    }
    extra.co2 = s; dirty.summary = true; setStatus('co2', 'ok');
  } catch (e) { const old = store.get('co2'); if (old) { extra.co2 = old; setStatus('co2', 'warn', 'provider unreachable, showing the last saved reading'); } else setStatus('co2', 'err', errNote(e)); }
}
DETAILS.co2 = () => {
  const c = extra.co2 || {};
  return {
    title: '<div class="big">' + (c.trend ? c.trend.toFixed(1) : '–') + ' <small>ppm</small></div><p>Carbon dioxide in the air, averaged over the globe: parts per million, with the seasons smoothed out. Before industry it was about 280. It climbs every year because burning coal, oil and gas adds more than forests and oceans can soak up.</p>' +
      (c.series && c.series.length > 12 ? '<h3>Since ' + c.firstYear + '</h3>' + spark(c.series, v => v.toFixed(0), true) : ''),
    rows: [
      c.date ? ['Latest reading', esc(dayMonth(c.date))] : null,
      c.now ? ['With the season included', c.now.toFixed(1) + ' ppm'] : null,
      c.yearAgo ? ['Change in a year', '+' + (c.trend - c.yearAgo).toFixed(1) + ' ppm'] : null,
      c.first ? ['Change since ' + c.firstYear, '+' + (c.trend - c.first).toFixed(1) + ' ppm'] : null,
      c.trend ? ['Above the level before industry', '+' + Math.round((c.trend / 280 - 1) * 100) + '%'] : null
    ],
    actions: link('https://gml.noaa.gov/ccgg/trends/global.html', 'NOAA’s measurements') + link('https://global-warming.org/', 'Source: global-warming.org')
  };
};
/* the main yearly meteor showers: name, month, day of the usual peak, meteors an hour under a dark sky */
const SHOWERS = [['Quadrantid', 1, 3, 80], ['Lyrid', 4, 22, 18], ['Eta Aquariid', 5, 6, 50], ['Delta Aquariid', 7, 30, 25], ['Perseid', 8, 12, 100], ['Orionid', 10, 21, 20], ['Leonid', 11, 17, 15], ['Geminid', 12, 14, 150], ['Ursid', 12, 22, 10]];
function meteorNote() {
  const now = Date.now(), y = new Date(now).getUTCFullYear();
  let near = null, next = null;
  for (const s of SHOWERS) for (const yy of [y - 1, y, y + 1]) {
    const d = (Date.UTC(yy, s[1] - 1, s[2], 12) - now) / 864e5;
    if (Math.abs(d) <= 3 && (!near || Math.abs(d) < Math.abs(near[1]))) near = [s, d];
    if (d > 0 && (!next || d < next[1])) next = [s, d];
  }
  const rate = s => 'Up to about ' + s[3] + ' meteors an hour under a dark sky';
  if (near) { const d = Math.round(near[1]); return ['The ' + near[0][0] + ' meteor shower ' + (d === 0 ? 'peaks about now' : d > 0 ? 'peaks in about ' + d + (d === 1 ? ' day' : ' days') : 'peaked about ' + -d + (d === -1 ? ' day ago' : ' days ago')), rate(near[0]) + ', best after midnight']; }
  return next ? ['Next meteor shower: the ' + next[0][0] + 's, in ' + Math.round(next[1]) + ' days', rate(next[0])] : null;
}
function summaryMore() {
  let h = deepRows();
  const calls = extra.calls || [], f = space.flare, c = extra.co2;
  h += '<button class="row" data-open="orbit">' + glyph(G_ORBIT) + '<span><span class="t">Everything in orbit</span><span class="s">' + (calls.length ? 'Closest pass this week: ' + distWord(calls[0].km) + ', ' + untilSpan(calls[0].t) : 'Satellites, debris and close calls') + '</span></span></button>';
  if (layers.radio.on || layers.sounds.on) h += '<button class="row" data-open="listen">' + glyph(G_SOUND) + '<span><span class="t">Listen to the planet</span><span class="s">' +
    [layers.radio.on && layers.radio.items.length ? layers.radio.items.length + ' radio stations' : '', layers.sounds.on && layers.sounds.items.length ? layers.sounds.items.length + ' wild recordings' : ''].filter(Boolean).join(', ') + '</span></span></button>';
  if (f) h += '<button class="row" data-open="swx"><span class="swatch glyph">' + icon('sun') + '</span><span><span class="t">The Sun: last flare ' + esc(f.cls) + '</span><span class="s">' + (isFinite(f.time) ? agoSpan(f.time) + ', ' : '') + esc(flareWord(f.cls).split(',')[0]) + '</span></span></button>';
  if (c) h += '<button class="row" data-open="co2">' + glyph(G_AIR) + '<span><span class="t">Carbon dioxide: ' + c.trend.toFixed(1) + ' ppm</span><span class="s">' + (c.yearAgo ? 'Up ' + (c.trend - c.yearAgo).toFixed(1) + ' in a year. ' : '') + 'It was 280 before industry</span></span></button>';
  const temps = layers.cities.on ? cityItems.filter(x => x.temp != null) : [];
  if (temps.length > 20) {
    const hot = temps.reduce((a, b) => (b.temp > a.temp ? b : a)), cold = temps.reduce((a, b) => (b.temp < a.temp ? b : a));
    h += '<button class="row" data-sel="cities:' + esc(hot.id) + '">' + glyph(G_HOT) + '<span><span class="t"><b>' + Math.round(hot.temp) + '°</b>' + esc(hot.title) + '</span><span class="s">Hottest of ' + temps.length + ' big cities right now</span></span></button>' +
      '<button class="row" data-sel="cities:' + esc(cold.id) + '">' + glyph(G_HOT) + '<span><span class="t"><b>' + Math.round(cold.temp) + '°</b>' + esc(cold.title) + '</span><span class="s">Coldest right now</span></span></button>';
  }
  const m = meteorNote();
  if (m) h += '<div class="row">' + glyph(G_STAR) + '<span><span class="t">' + m[0] + '</span><span class="s">' + m[1] + '</span></span></div>';
  return h;
}

/* ---------- any place: radio stations within reach and photos taken nearby ---------- */
function placeMore(it, near, land) {
  if (layers.radio.on && layers.radio.items.length) {
    const st = layers.radio.items.map(x => [gcKm(it.lat, it.lon, x.lat, x.lon), x]).filter(x => x[0] < 400).sort((a, b) => a[0] - b[0]).slice(0, 2);
    for (const s of st) near.push(row(s[1], esc(s[1].title), num(s[0]) + ' km away', 'Local radio'));
  }
  if (layers.sounds.on) { const s = layers.sounds.items.map(x => [gcKm(it.lat, it.lon, x.lat, x.lon), x]).filter(x => x[0] < 500).sort((a, b) => a[0] - b[0])[0]; if (s) near.push(row(s[1], esc(s[1].title), num(s[0]) + ' km away', 'Wild sound recorded nearby')); }
  if (!land) return slot(it, 'pphotos', '');
  slot(it, 'pphotos', '<h3>Photos from around here</h3><div class="photos">' + SK(84, 64) + SK(84, 64) + SK(84, 64) + '</div>');
  getJSON('https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&origin=*&action=query&generator=geosearch&ggsnamespace=6&ggsradius=10000&ggslimit=14&ggscoord=' + it.lat.toFixed(4) + '%7C' + it.lon.toFixed(4) +
    '&prop=imageinfo&iiprop=url%7Cmime%7Cextmetadata&iiurlwidth=240&iiextmetadatafilter=Artist%7CLicenseShortName', 15000).then(d => {
    const pics = ((d.query && d.query.pages) || []).map(p => { const i = p.imageinfo && p.imageinfo[0]; return i && /^image\/(jpeg|png)/.test(i.mime || '') && safeUrl(i.thumburl) ? { src: i.thumburl, page: safeUrl(i.descriptionurl), name: String(p.title || '').replace(/^File:|\.\w+$/g, ''),
      by: i.extmetadata && i.extmetadata.Artist ? String(i.extmetadata.Artist.value).replace(/<[^>]*>/g, '').trim().slice(0, 60) : '', lic: i.extmetadata && i.extmetadata.LicenseShortName ? i.extmetadata.LicenseShortName.value : '' } : null; }).filter(Boolean).slice(0, 9);
    setStatus('commons', 'ok');
    slot(it, 'pphotos', pics.length ? '<h3>Photos from around here</h3><div class="photos">' + pics.map(p => '<a href="' + esc(p.page || p.src) + '" target="_blank" rel="noopener" title="' + esc(p.name + (p.by ? ', by ' + p.by : '') + (p.lic ? ' (' + p.lic + ')' : '')) + '"><img src="' + esc(p.src) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.parentNode.remove()"></a>').join('') +
      '</div><p class="hint">From Wikimedia Commons. Open a photo for its author and licence.</p>' : '');
  }).catch(e => { setStatus('commons', 'err', errNote(e)); slot(it, 'pphotos', ''); });
}

/* ---------- wiring for everything above ---------- */
function deepSelect(it) {
  if (SAT_KEYS.includes(it.layer)) loadSatcat(it);
  else if (it.layer === 'stations' && it.id === 25544) loadDocked(it);
  else if (it.layer === 'radio' || it.layer === 'cams') { loadThere(it); if (it.layer === 'cams') camOpen(it); }
}
function deepClick(e) {
  if (camClick(e)) return true;
  const spot = e.target.closest('[data-spot]');
  if (spot) { const p = spot.dataset.spot.split(','); openPlace(+p[0], +p[1]); return true; }      /* a cable was clicked, but the visitor wanted the place under it */
  let el = e.target.closest('[data-layers-on]');
  if (el) {
    for (const k of el.dataset.layersOn.split(',')) { const cb = $('#layer-' + k); if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } }
    el.disabled = true; el.innerHTML = '<i class="spin dark"></i>Loading…'; return true;
  }
  el = e.target.closest('[data-sat]');
  if (el) { const ids = el.dataset.sat.split(','), it = findSat(ids[0]) || findSat(ids[1]); if (it) select(it); else { const sub = el.querySelector('.s'); if (sub && !el.dataset.told) { el.dataset.told = 1; sub.textContent = 'Not on the globe yet. Switch on its layer (satellites, debris or spent rockets) to find it.'; } } return true; }
  el = e.target.closest('[data-tag]');
  if (el) { setScan(false); radioShuffle(moodPool(el.dataset.tag)); return true; }
  el = e.target.closest('[data-act]');
  if (!el) return false;
  const a = el.dataset.act;
  if (a === 'scan') setScan(!scan.on);
  else if (a === 'shuffle') { setScan(false); radioShuffle(); }
  else if (a === 'overlay-off') setOverlay('');
  return true;
}

/* a few more lines for the Guide */
$('#tab-guide').insertAdjacentHTML('beforeend', '<h3>Reading the orbit</h3><ul class="how">' +
  '<li><b>Everything in orbit</b>, in the panel on the right, counts what is up there, shows how high it flies and lists the closest passes predicted for the coming week.</li>' +
  '<li><b>Debris</b> is anything broken: fragments from explosions, collisions and weapon tests. <b>Spent rocket stages</b> are whole but dead. Neither can steer.</li>' +
  '<li>Click any object for who owns it, when and where it was launched, and how high it climbs and dips.</li>' +
  '<li>The lower an object flies, the sooner thin air drags it down. Below about 400 km that takes months; above 1,000 km it takes centuries.</li></ul>' +
  '<h3>Listening</h3><ul class="how"><li><b>Radio stations</b> play live. Press the scan button in the player to hop to a new station every 24 seconds.</li>' +
  '<li><b>Wild sounds</b> are short recordings of animals, made in the last few days at the spot marked.</li></ul>' +
  '<h3>NASA satellite views</h3><ul class="how"><li>In the Layers tab, under Map, pick a view to colour the globe with a real measurement: ' + OVERLAYS.slice(1).map(o => o.name.toLowerCase()).join(', ') + '. A note at the top explains the colours and says which days the picture is from.</li><li>Zoom in and stop: after a moment the picture sharpens for the area on screen.</li></ul>');
