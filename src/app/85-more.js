/* ============================================================
   Still more: NASA's deep space antennas, US severe weather warnings, recent launches, what the world is reading,
   and a fuller picture of any place (the coming days, a short introduction)
   ============================================================ */
Object.assign(SOURCES, {
  dsn:      { label: 'NASA Deep Space Network', what: 'Which distant spacecraft each of NASA’s giant antennas is talking to right now', url: 'https://eyes.nasa.gov/apps/dsn-now/' },
  nws:      { label: 'US National Weather Service', what: 'Severe and extreme weather warnings in force across the United States', url: 'https://www.weather.gov/' },
  wikiread: { label: 'Wikipedia most read', what: 'The articles read most on English Wikipedia yesterday, and a short introduction to a place you select', url: 'https://en.wikipedia.org/wiki/Wikipedia:Top_25_Report' }
});
const G_DISH = '<path d="M3 9.500a5.500 5.500 0 0 0 7.800 3.300L4.700 6.700A5.500 5.500 0 0 0 3 9.500Z"/><path d="M7.800 9.700l3-3"/><circle cx="11.600" cy="5.900" r="1.100"/><path d="M11 1.800a4 4 0 0 1 3.200 3.200"/>';
const recEpoch = rec => Date.UTC(rec.epochyr < 57 ? 2000 + rec.epochyr : 1900 + rec.epochyr, 0, 1) + (rec.epochdays - 1) * 864e5;

/* ---------- NASA's Deep Space Network: three antenna sites and the spacecraft each dish is in contact with ---------- */
const DSN_SITES = { gdscc: ['Goldstone, California', 35.4267, -116.89], mdscc: ['near Madrid, Spain', 40.4314, -4.248], cdscc: ['near Canberra, Australia', -35.4014, 148.9817] };
const CRAFT = { VGR1: 'Voyager 1', VGR2: 'Voyager 2', NHPC: 'New Horizons', JNO: 'Juno at Jupiter', EURC: 'Europa Clipper', JUICE: 'JUICE', PSYC: 'Psyche', LUCY: 'Lucy', ORX: 'OSIRIS-APEX', MRO: 'Mars Reconnaissance Orbiter',
  M01O: 'Mars Odyssey', MVN: 'MAVEN at Mars', MSL: 'Curiosity rover on Mars', M20: 'Perseverance rover on Mars', MEX: 'Mars Express', TGO: 'ExoMars Trace Gas Orbiter', EMM: 'Hope, the Emirates Mars orbiter', ESCB: 'ESCAPADE Blue', ESCG: 'ESCAPADE Gold',
  SPP: 'Parker Solar Probe', SOHO: 'SOHO solar observatory', STA: 'STEREO-A', SOLO: 'Solar Orbiter', ACE: 'ACE', WIND: 'Wind', DSCO: 'DSCOVR', JWST: 'James Webb Space Telescope', TESS: 'TESS planet hunter', CHDR: 'Chandra X-ray Observatory',
  XMM: 'XMM-Newton', BEPI: 'BepiColombo', HYB2: 'Hayabusa2', LRO: 'Lunar Reconnaissance Orbiter', KPLO: 'Danuri, Korea’s Moon orbiter', CAPS: 'CAPSTONE', THB: 'THEMIS-B', THC: 'THEMIS-C', MMS1: 'MMS 1', MMS2: 'MMS 2', MMS3: 'MMS 3', MMS4: 'MMS 4' };
const craftName = c => CRAFT[c] || c;
const bigKm = km => (km < 2e6 ? num(km) + ' km' : km < 2e9 ? (km / 1e6).toFixed(km < 2e7 ? 1 : 0) + ' million km' : (km / 1e9).toFixed(1) + ' billion km');
const lightTime = s => (s < 90 ? Math.max(1, Math.round(s)) + ' seconds' : s < 5400 ? Math.round(s / 60) + ' minutes' : (s / 3600).toFixed(1) + ' hours');
const bitRate = r => (r >= 1e6 ? (r / 1e6).toFixed(1) + ' megabits' : r >= 1000 ? Math.round(r / 1000) + ' kilobits' : Math.round(r) + ' bits') + ' a second';
async function loadDSN() {
  setStatus('dsn', 'load');
  try {
    const xml = await getJSON('https://eyes.nasa.gov/dsn/data/dsn.xml?r=' + Math.floor(Date.now() / 5000), 20000, true);
    const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement;
    if (!root || root.nodeName !== 'dsn') throw new Error('unexpected format');
    const sites = []; let cur = null;
    for (const el of Array.from(root.children)) {
      if (el.nodeName === 'station') {
        const k = el.getAttribute('name'), def = DSN_SITES[k];
        cur = def ? { layer: 'dsn', id: k, title: (el.getAttribute('friendlyName') || k) + ' deep space antennas', place: def[0], lat: def[1], lon: def[2], off: (+el.getAttribute('timeZoneOffset') || 0) / 1000, dishes: [] } : null;
        if (cur) sites.push(cur);
      } else if (el.nodeName === 'dish' && cur) {
        const live = n => Array.from(el.getElementsByTagName(n)).filter(s => s.getAttribute('active') === 'true'), up = live('upSignal'), down = live('downSignal'), names = [];
        for (const s of up.concat(down)) { const c = String(s.getAttribute('spacecraft') || '').toUpperCase(); if (c && !/^(DSN|DSS|TEST)/.test(c) && !names.includes(c)) names.push(c); }
        const targets = Array.from(el.getElementsByTagName('target')).map(t => ({ code: String(t.getAttribute('name') || '').toUpperCase(), rtlt: +t.getAttribute('rtlt'), km: +t.getAttribute('downlegRange') || +t.getAttribute('uplegRange') })).filter(t => t.code && !/^(DSN|DSS|TEST)/.test(t.code));
        cur.dishes.push({ name: String(el.getAttribute('name') || '').replace(/^DSS/, 'DSS '), big: /^DSS(14|43|63)$/.test(el.getAttribute('name') || ''), activity: el.getAttribute('activity') || '', craft: names, up: up.length > 0, down: down.length > 0,
          rate: Math.max.apply(null, down.map(s => +s.getAttribute('dataRate') || 0).concat(0)), targets });
      }
    }
    if (!sites.length) throw new Error('empty');
    for (const s of sites) { s.talking = []; for (const d of s.dishes) for (const c of d.craft) if (!s.talking.includes(c)) s.talking.push(c); Object.assign(s, { v: ll(s.lat, s.lon, 1.005), size: 10, alpha: 0.95, pulse: s.talking.length > 0 }); }
    applyItems('dsn', sites); setStatus('dsn', 'ok');
  } catch (e) { setStatus('dsn', 'err', errNote(e)); }
}
function dsnTalking() { const out = []; for (const s of layers.dsn.items) for (const c of s.talking || []) if (!out.includes(c)) out.push(c); return out; }
DETAILS.dsn = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div><p>' + esc(cap(it.place)) + '</p>',
  rows: [
    ['Local time', '<span data-clock="' + it.off + '">' + clockAt(it.off) + '</span>'],
    ['In contact with', it.talking.length ? it.talking.length + ' spacecraft' : 'Nothing at this moment'],
    ['Dishes on this site', String(it.dishes.length)]
  ],
  extra: '<h3>What each dish is doing</h3>' + it.dishes.map(d => {
    const t = d.targets.find(x => d.craft.includes(x.code)) || d.targets[0], who = d.craft.length ? d.craft.map(craftName).join(' and ') : null;
    const facts = [];
    if (who && t && t.km > 0) facts.push(bigKm(t.km) + ' away');
    if (who && t && t.rtlt > 0) facts.push('a signal takes ' + lightTime(t.rtlt / 2) + ' each way');
    if (who && d.rate > 0) facts.push('receiving ' + bitRate(d.rate));
    if (who && d.up && !d.down) facts.push('sending commands');
    const idle = /maint|upgrade/i.test(d.activity) ? 'Out of service for ' + d.activity.toLowerCase() : t ? 'Pointed at ' + esc(craftName(t.code)) + ', no signal at this moment' : 'Idle';
    return '<div class="row' + (who ? '' : ' dim') + '">' + swatch('dsn') + '<span><span class="t">' + esc(d.name) + (who ? ': ' + esc(who) : '') + '</span><span class="s wrap">' + (who ? esc(cap(facts.join(', ')) || 'In contact') : idle) +
      (d.big ? ', 70 m dish' : '') + '</span></span></div>';
  }).join(''),
  actions: link('https://eyes.nasa.gov/apps/dsn-now/', 'Open NASA’s DSN Now')
});

/* ---------- severe weather warnings in the United States (National Weather Service) ---------- */
async function loadWarnings() {
  setStatus('nws', 'load');
  try {
    const d = await getJSON('https://api.weather.gov/alerts/active?status=actual&message_type=alert&severity=Extreme,Severe', 30000, false, KEEP), items = [];
    for (const f of d.features || []) {
      const g = f.geometry, p = f.properties || {};
      const ring = !g ? null : g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null;
      if (!ring || !ring.length) continue;            /* warnings issued for whole counties carry no outline; those are counted, not placed */
      let lo = 0, la = 0; for (const c of ring) { lo += +c[0]; la += +c[1]; } lo /= ring.length; la /= ring.length;
      if (!isFinite(lo) || !isFinite(la)) continue;
      items.push({ layer: 'warnings', id: p.id || f.id, title: p.event || 'Weather warning', area: p.areaDesc, headline: p.headline, desc: p.description, todo: p.instruction, sev: p.severity, by: p.senderName,
        time: Date.parse(p.sent) || Date.now(), until: Date.parse(p.ends || p.expires), lat: la, lon: lo, v: ll(la, lo, 1.0042), size: p.severity === 'Extreme' ? 9 : 6.5, alpha: 0.95, pulse: p.severity === 'Extreme' });
      if (items.length >= 160) break;
    }
    extra.nwsTotal = (d.features || []).length;
    items.sort((a, b) => b.time - a.time);
    applyItems('warnings', items); okStatus('nws', d);
  } catch (e) { setStatus('nws', 'err', errNote(e)); }
}
DETAILS.warnings = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div>' + (it.area ? '<p>' + esc(it.area) + '</p>' : ''),
  rows: [
    ['Severity', it.sev === 'Extreme' ? '<span class="chip" style="--c:#ff453a">Extreme</span> threat to life or property' : 'Severe'],
    ['Issued', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
    isFinite(it.until) ? ['In force until', esc(fmtTime(it.until))] : null,
    it.by ? ['Issued by', esc(it.by)] : null,
    extra.nwsTotal > layers.warnings.items.length ? ['Also in force', (extra.nwsTotal - layers.warnings.items.length) + ' county-wide warnings without an outline'] : null
  ],
  extra: (it.todo ? '<h3>What to do</h3><p class="note">' + esc(it.todo) + '</p>' : '') + (it.desc ? '<h3>The warning</h3><pre class="msg">' + esc(it.desc) + '</pre>' : ''),
  actions: link('https://www.weather.gov/', 'National Weather Service')
});

/* ---------- launches of the past days (Launch Library; cached, because the free tier allows 15 requests an hour) ---------- */
async function loadPastLaunches() {
  try {
    let list = store.get('pastlaunch', 30 * 60000);
    if (!list) {
      const d = await getJSON('https://ll.thespacedevs.com/2.3.0/launches/previous/?limit=8&mode=list&format=json', 30000);
      list = (d.results || []).map(l => ({ id: l.id, title: l.name, time: Date.parse(l.net), status: (l.status && l.status.name) || 'Unknown', img: l.image && (typeof l.image === 'string' ? l.image : l.image.thumbnail_url || l.image.image_url) })).filter(l => isFinite(l.time));
      if (list.length) store.set('pastlaunch', list);
    }
    use(list);
  } catch (e) { const old = store.get('pastlaunch'); if (old) use(old); }
  function use(list) {
    extra.pastlaunch = list.filter(l => Date.now() - l.time < 21 * 864e5).map(l => Object.assign({ layer: 'pastlaunch', kind: /success/i.test(l.status) ? 'Launch, reached orbit' : /fail/i.test(l.status) ? 'Launch, failed' : 'Launch',
      explain: 'A rocket that lifted off in the past few days, as recorded by the Launch Library.' }, l, { img: safeUrl(l.img) }));
    dirty.feed = true;
  }
}
DETAILS.pastlaunch = it => ({
  title: (it.img ? '<img class="thumb" src="' + esc(it.img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<div class="big word">' + esc(it.title) + '</div>',
  rows: [['Lifted off', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'], ['Result', /fail/i.test(it.status) ? '<span class="chip" style="--c:#ff453a">' + esc(it.status) + '</span>' : esc(it.status)]],
  actions: link('https://thespacedevs.com/llapi', 'Launch Library')
});

/* ---------- what the world is reading: yesterday's most read Wikipedia articles ---------- */
async function loadMostRead() {
  setStatus('wikiread', 'load');
  try {
    let list = store.get('mostread', 3 * 3600000);
    if (!list) {
      const p2 = n => String(n).padStart(2, '0');
      for (const back of [0, 1, 2]) {                 /* today's list appears a few hours after midnight UTC, so step back if it is not there yet */
        const d = new Date(Date.now() - back * 864e5);
        try {
          const r = await getJSON('https://en.wikipedia.org/api/rest_v1/feed/featured/' + d.getUTCFullYear() + '/' + p2(d.getUTCMonth() + 1) + '/' + p2(d.getUTCDate()), 25000, false, { tries: 1 }), a = r.mostread && r.mostread.articles;
          if (a && a.length) {
            list = a.filter(x => x.title && !/^(Main_Page|Special:|Wikipedia:|Portal:|File:)/.test(x.title)).slice(0, 10).map((x, i) => ({ id: x.title, rank: i + 1, title: x.normalizedtitle || (x.titles && x.titles.normalized) || String(x.title).replace(/_/g, ' '),
              views: +x.views || 0, desc: x.description, text: x.extract, img: x.thumbnail && x.thumbnail.source, url: x.content_urls && x.content_urls.desktop && x.content_urls.desktop.page }));
            break;
          }
        } catch (e) {}
      }
      if (!list || !list.length) throw new Error('empty');
      store.set('mostread', list);
    }
    extra.mostread = list.map(x => Object.assign({ layer: 'mostread', explain: 'One of the ten articles people opened most on English Wikipedia yesterday. A sudden surge of readers usually follows the news.' }, x, { img: safeUrl(x.img) }));
    dirty.news = true; setStatus('wikiread', 'ok');
  } catch (e) { setStatus('wikiread', 'err', errNote(e)); }
}
const viewsWord = v => (v >= 1e6 ? (v / 1e6).toFixed(1) + ' million' : v >= 1000 ? Math.round(v / 1000) + ' thousand' : String(v)) + ' readers';
function newsMore() {
  const m = extra.mostread || [];
  return m.length ? '<h3>Most read on Wikipedia yesterday</h3>' + m.map(a => '<button class="row news" data-sel="mostread:' + esc(a.id) + '">' + swatch('news') + '<span><span class="t wrap">' + esc(a.title) + '</span><span class="s">' + viewsWord(a.views) + (a.desc ? ', ' + esc(a.desc) : '') + '</span></span></button>').join('') : '';
}
DETAILS.mostread = it => ({
  title: (it.img ? '<img class="thumb tall" src="' + esc(it.img) + '" alt="" loading="lazy" onerror="this.remove()">' : '') + '<div class="big word">' + esc(it.title) + '</div>' + (it.desc ? '<p>' + esc(cap(it.desc)) + '</p>' : ''),
  rows: [['Read yesterday by', viewsWord(it.views)], ['Rank', 'Number ' + it.rank + ' on English Wikipedia']],
  extra: it.text ? '<p class="note">' + esc(it.text.length > 520 ? it.text.slice(0, it.text.lastIndexOf(' ', 500)) + '…' : it.text) + '</p>' : '',
  actions: link(it.url, 'Read on Wikipedia')
});

/* ---------- any place: the next five days, and a short introduction when the place has a name ---------- */
function weekHTML(dy) {
  if (!dy || !dy.time || !dy.temperature_2m_max || dy.time.length < 3) return '';
  let h = '<h3>The next days</h3><div class="week">';
  for (let i = 1; i < Math.min(6, dy.time.length); i++) {
    if (dy.temperature_2m_max[i] == null) continue;
    const w = wmo(dy.weather_code ? dy.weather_code[i] : 0, 1), d = new Date(dy.time[i] + 'T12:00:00Z'), rain = dy.precipitation_probability_max ? dy.precipitation_probability_max[i] : null;
    h += '<div title="' + esc(w.text) + '"><span class="d">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + '</span>' + icon(w.icon) + '<span class="hi mono">' + Math.round(dy.temperature_2m_max[i]) + '°</span><span class="lo mono">' +
      Math.round(dy.temperature_2m_min[i]) + '°</span><span class="r">' + (rain != null && rain >= 20 ? rain + '% rain' : '&nbsp;') + '</span></div>';
  }
  return h + '</div>';
}
function placeAbout(it) {
  if (!it.title) return;                             /* only named places: the built-in cities and search results */
  getJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(String(it.title).replace(/ /g, '_')) + '?redirect=true', 12000, false, { tries: 1 }).then(d => {
    if (d.type !== 'standard' || !d.extract) return;
    const c = d.coordinates;
    if (c ? gcKm(it.lat, it.lon, c.lat, c.lon) > 600 : !it.named) return;      /* a different place with the same name */
    const text = d.extract.length > 340 ? d.extract.slice(0, d.extract.lastIndexOf(' ', 320)) + '…' : d.extract, url = d.content_urls && d.content_urls.desktop && safeUrl(d.content_urls.desktop.page);
    setStatus('wikiread', 'ok');
    slot(it, 'pabout', esc(text) + (url ? ' <a href="' + esc(url) + '" target="_blank" rel="noopener">Wikipedia</a>' : ''));
  }).catch(() => {});
}

/* ---------- extra rows for "Right now" ---------- */
function deepRows() {
  let h = '';
  const talk = layers.dsn.on ? dsnTalking() : [];
  if (talk.length) {
    const site = layers.dsn.items.find(s => s.talking.length) || layers.dsn.items[0], names = talk.map(craftName);
    h += '<button class="row" data-sel="dsn:' + esc(site.id) + '">' + glyph(G_DISH) + '<span><span class="t">In contact with ' + talk.length + ' deep space craft</span><span class="s">' + esc(names.slice(0, 3).join(', ') + (names.length > 3 ? ' and ' + (names.length - 3) + ' more' : '')) + '</span></span></button>';
  }
  const w = layers.warnings.on ? layers.warnings.items : [];
  if (w.length) h += row(w[0], w.length + ' severe weather warnings in the United States', esc(w[0].title) + ', ' + agoSpan(w[0].time), 'Newest');
  return h;
}
