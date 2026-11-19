/* ============================================================
   More feeds: fire hotspots, wildlife sightings, Earth from deep space, space news,
   and the country and bedrock details shown for any place
   ============================================================ */
Object.assign(SOURCES, {
  kanari:   { label: 'kanari.io', what: 'Fire hotspots detected by NASA, NOAA and EUMETSAT satellites. Source: kanari.io', url: 'https://kanari.io/' },
  inat:     { label: 'iNaturalist', what: 'Newly confirmed wildlife sightings from citizen naturalists', url: 'https://www.inaturalist.org/' },
  epic:     { label: 'NASA EPIC', what: 'The latest photo of the whole Earth from the DSCOVR spacecraft', url: 'https://epic.gsfc.nasa.gov/' },
  snews:    { label: 'Spaceflight News', what: 'Space news headlines', url: 'https://spaceflightnewsapi.net/' },
  stats:    { label: 'Statistics of the World', what: 'Country facts from the IMF and World Bank, loaded for the place you select', url: 'https://statisticsoftheworld.com/', lazy: true },
  fx:       { label: 'Frankfurter', what: 'Exchange rates from central banks, for the selected country', url: 'https://frankfurter.dev/', lazy: true },
  holidays: { label: 'caldays', what: 'Public holidays for the selected country', url: 'https://caldays.com/', lazy: true },
  geology:  { label: 'Macrostrat', what: 'The kind and age of rock under the place you select', url: 'https://macrostrat.org/', lazy: true },
  geoip:    { label: 'GeoJS', what: 'Your approximate location, only when you press “Go to my area”', url: 'https://www.geojs.io/', lazy: true }
});
Object.assign(PSEUDO, { epic: 'Photo of Earth', snews: 'Space news' });

/* ---------- fire hotspots: every patch of intense heat satellites saw in the last 24 hours ---------- */
async function loadHotspots() {
  setStatus('kanari', 'load');
  try {
    const d = await getJSON('https://kanari.io/api/events?hours=24', 30000, false, KEEP), items = [];
    for (const e of d.events || []) {
      const c = e.centroid; if (!c || !isFinite(c[0]) || !isFinite(c[1])) continue;
      const frp = +e.maxFrp || 0;
      items.push({ layer: 'hotspots', id: e.id, title: 'Fire hotspot', lat: +c[1], lon: +c[0], time: parseUTC(e.lastSeen) || Date.now(), first: parseUTC(e.firstSeen), count: e.count, frp, conf: e.confidence,
        size: clamp(2.3 + Math.sqrt(frp) / 5, 2.3, 8), alpha: e.confidence === 'possible' ? 0.45 : 0.8, v: ll(+c[1], +c[0], 1.0035) });
    }
    applyItems('hotspots', items);
    okStatus('kanari', d);
  } catch (e) { setStatus('kanari', 'err', errNote(e)); }
}
DETAILS.hotspots = it => ({
  title: '<div class="big word">Fire seen from space</div>',
  rows: [
    ['Last seen', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
    isFinite(it.first) ? ['First seen', agoSpan(it.first)] : null,
    it.count ? ['Satellite detections', num(it.count)] : null,
    it.frp ? ['Heat output', num(it.frp) + ' megawatts' + (it.frp > 500 ? ', very intense' : it.frp > 100 ? ', intense' : it.frp > 20 ? ', moderate' : ', small')] : null,
    ['Certainty', it.conf === 'corrobore' ? 'Confirmed by witnesses on the ground' : it.conf === 'probable' ? 'Probably a real fire' : 'Possible fire, seen once'],
    nearestCity(it.lat, it.lon) ? ['Nearest big city', esc(nearestCity(it.lat, it.lon))] : null,
    ['Location', esc(fmtLL(it.lat, it.lon))]
  ],
  actions: link('https://kanari.io/', 'Source: kanari.io')
});

/* ---------- wildlife: the newest confirmed sightings from iNaturalist ---------- */
const TAXON = { Aves: 'Bird', Plantae: 'Plant', Insecta: 'Insect', Mammalia: 'Mammal', Reptilia: 'Reptile', Amphibia: 'Amphibian', Fungi: 'Fungus', Arachnida: 'Spider or relative', Mollusca: 'Mollusc', Actinopterygii: 'Fish', Animalia: 'Animal', Chromista: 'Seaweed or relative', Protozoa: 'Microorganism' };
async function wildlifeINat() {
  const d = await getJSON('https://api.inaturalist.org/v1/observations?geo=true&photos=true&quality_grade=research&order=desc&order_by=created_at&per_page=200&locale=en', 30000, false, { keep: true });
  return (d.results || []).map(o => {
    let lat, lon;
    if (o.geojson && o.geojson.coordinates) { lon = +o.geojson.coordinates[0]; lat = +o.geojson.coordinates[1]; }
    else if (o.location) { const p = String(o.location).split(','); lat = +p[0]; lon = +p[1]; }
    const t = o.taxon || {}, ph = o.photos && o.photos[0];
    return { id: o.id, title: cap(t.preferred_common_name || o.species_guess || t.name || 'Unidentified species'), sci: t.name, kindWord: TAXON[t.iconic_taxon_name] || 'Living thing', place: o.place_guess,
      time: Date.parse(o.time_observed_at || o.observed_on || o.created_at) || Date.now(), img: ph && safeUrl(String(ph.url || '').replace('/square.', '/medium.')), credit: ph && ph.attribution,
      by: o.user && o.user.login, url: safeUrl(o.uri) || 'https://www.inaturalist.org/observations/' + o.id, wiki: t.wikipedia_url, lat, lon };
  });
}
/* backup: the Global Biodiversity Information Facility, which gathers sightings from many projects */
async function wildlifeGBIF() {
  const day = t => new Date(t).toISOString().slice(0, 10);
  const d = await getJSON('https://api.gbif.org/v1/occurrence/search?hasCoordinate=true&mediaType=StillImage&basisOfRecord=HUMAN_OBSERVATION&limit=200&eventDate=' + day(Date.now() - 6 * 864e5) + ',' + day(Date.now()), 30000);
  return (d.results || []).map(o => {
    const m = o.media && o.media[0];
    return { id: 'g' + o.key, title: cap(o.vernacularName || o.species || o.scientificName || 'Unidentified species'), sci: o.species || o.scientificName, kindWord: TAXON[o.class] || TAXON[o.kingdom] || 'Living thing',
      place: [o.stateProvince, o.country].filter(Boolean).join(', '), time: Date.parse(o.eventDate) || Date.now(), img: m && safeUrl(m.identifier), credit: m && (m.rightsHolder || m.creator), by: o.recordedBy,
      url: 'https://www.gbif.org/occurrence/' + o.key, lat: +o.decimalLatitude, lon: +o.decimalLongitude };
  });
}
async function loadWildlife() {
  setStatus('inat', 'load');
  try {
    const list = await firstOf('inat', [['iNaturalist', wildlifeINat], ['GBIF', wildlifeGBIF]]);
    const seen = new Set(), items = [];
    for (const o of list) {
      if (!isFinite(o.lat) || !isFinite(o.lon)) continue;
      const cell = Math.round(o.lat * 4) + ',' + Math.round(o.lon * 4); if (seen.has(cell)) continue; seen.add(cell);
      items.push(Object.assign(o, { layer: 'wildlife', v: ll(o.lat, o.lon, 1.0045), size: 4.6, alpha: 0.9 }));
    }
    applyItems('wildlife', items);
    okStatus('inat');
  } catch (e) { setStatus('inat', 'err', errNote(e)); }
}
DETAILS.wildlife = it => ({
  title: (it.img ? '<img class="thumb tall" src="' + esc(it.img) + '" alt="" loading="lazy">' + (it.credit ? '<small class="credit">' + esc(it.credit) + '</small>' : '') : '') +
    '<div class="big word">' + esc(it.title) + '</div>' + (it.sci ? '<p><i>' + esc(it.sci) + '</i></p>' : ''),
  rows: [
    ['Kind', esc(it.kindWord)],
    ['Seen', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'],
    it.place ? ['Where', esc(it.place)] : null,
    it.by ? ['Spotted by', esc(it.by)] : null,
    ['Location', esc(fmtLL(it.lat, it.lon))]
  ],
  actions: link(it.url, /gbif/.test(it.url) ? 'Open on GBIF' : 'Open on iNaturalist') + link(it.wiki, 'About this species')
});

/* ---------- Earth from deep space: NASA's EPIC camera, 1.5 million km away ---------- */
async function loadEpic() {
  setStatus('epic', 'load');
  try {
    const d = await getJSON('https://epic.gsfc.nasa.gov/api/natural', 25000, false, KEEP), e = d[d.length - 1];
    if (!e || !e.image) throw new Error('empty');
    const day = String(e.date).slice(0, 10).replace(/-/g, '/'), base = 'https://epic.gsfc.nasa.gov/archive/natural/' + day, c = e.centroid_coordinates || {};
    extra.epic = [{ layer: 'epic', id: 'epic', title: 'Earth from 1.5 million km', time: parseUTC(e.date), lat: isFinite(+c.lat) ? +c.lat : null, lon: +c.lon, img: base + '/jpg/' + e.image + '.jpg', thumb: base + '/thumbs/' + e.image + '.jpg',
      explain: 'A real photograph, not a drawing. NASA’s EPIC camera rides on a spacecraft parked 1.5 million km away, between the Earth and the Sun, so it always sees the sunlit side of the planet.' }];
    dirty.summary = true;
    setStatus('epic', 'ok');
  } catch (e) { setStatus('epic', 'err', errNote(e)); }
}
DETAILS.epic = it => ({
  title: '<img class="thumb square" src="' + esc(it.img) + '" alt="The sunlit side of the Earth photographed from deep space" loading="lazy"><div class="big word">The whole Earth, photographed ' + agoSpan(it.time) + '</div>',
  rows: [['Taken', esc(fmtTime(it.time))], it.lat != null ? ['Centre of the picture', esc(fmtLL(it.lat, it.lon))] : null, ['Camera', 'EPIC, on the DSCOVR spacecraft']],
  actions: link('https://epic.gsfc.nasa.gov/', 'Open the NASA gallery')
});

/* ---------- space news ---------- */
async function loadSpaceNews() {
  setStatus('snews', 'load');
  try {
    const d = await getJSON('https://api.spaceflightnewsapi.net/v4/articles/?limit=8', 20000, false, KEEP);
    extra.snews = (d.results || []).map(a => ({ layer: 'snews', id: a.id, title: a.title, site: a.news_site, time: Date.parse(a.published_at) || Date.now(), url: a.url, img: safeUrl(a.image_url), summary: a.summary }));
    dirty.news = true;
    okStatus('snews', d);
  } catch (e) { setStatus('snews', 'err', errNote(e)); }
}
DETAILS.snews = it => ({
  title: (it.img ? '<img class="thumb" src="' + esc(it.img) + '" alt="" loading="lazy">' : '') + '<div class="big word news">' + esc(it.title) + '</div>' + (it.summary ? '<p>' + esc(it.summary) + '</p>' : ''),
  rows: [['Published', esc(fmtTime(it.time)) + ' (' + agoSpan(it.time) + ')'], it.site ? ['By', esc(it.site)] : null],
  actions: link(it.url, 'Read the article' + (it.site ? ' at ' + it.site : ''))
});

/* ---------- "Go to my area": an approximate position from the visitor's internet address, only on request ---------- */
$('#view-me').addEventListener('click', async function () {
  if (this.classList.contains('busy')) return;
  this.classList.add('busy'); setStatus('geoip', 'load');
  try {
    const d = await firstOf('geoip', [['GeoJS', () => getJSON('https://get.geojs.io/v1/ip/geo.json', 12000)], ['ipwho.is', () => getJSON('https://ipwho.is/', 12000)]]), lat = +d.latitude, lon = +d.longitude;
    if (!isFinite(lat) || !isFinite(lon)) throw new Error('no position');
    okStatus('geoip');
    openPlace(lat, lon, d.city || d.region || d.country || 'Your area', 'Your approximate area, judged from your internet connection');
  } catch (e) { setStatus('geoip', 'err', errNote(e)); }
  this.classList.remove('busy');
});

/* ---------- country facts and bedrock for a selected place ---------- */
const COUNTRY = {};
(function () { const s = ASSET.countries; for (let i = 0; i + 8 <= s.length; i += 8) COUNTRY[s.slice(i, i + 2)] = [s.slice(i + 2, i + 5), s.slice(i + 5, i + 8)]; })();
const bigNum = n => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' billion' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' million' : num(n));
let fxCache = null;
function fxRates() {
  if (fxCache) return fxCache;
  const saved = store.get('fx', 12 * 3600000);
  fxCache = saved ? Promise.resolve(saved) : firstOf('fx', [['Frankfurter', () => getJSON('https://api.frankfurter.dev/v1/latest?base=USD', 15000)], ['ExchangeRate-API', () => getJSON('https://open.er-api.com/v6/latest/USD', 15000)]]).then(d => { store.set('fx', d.rates || {}); okStatus('fx'); return d.rates || {}; });
  fxCache.catch(() => { fxCache = null; setStatus('fx', 'err', 'unreachable'); });
  return fxCache;
}
function loadCountry(it, cc, name) {
  const info = COUNTRY[cc] || [], cur = info[1] && info[1] !== '---' ? info[1] : null;
  slot(it, 'pcountry', '<h3>Country</h3><div class="country"><img class="flag" src="https://flagcdn.com/w80/' + esc(cc.toLowerCase()) + '.png" alt="" loading="lazy"><span><b>' + esc(name || cc) + '</b><small ' + slotAttr('cregion') + '>' + SK(130) + '</small></span></div>' +
    kv([['Capital', SK(80), slotAttr('ccap')], ['Population', SK(90), slotAttr('cpop')], ['Income per person', SK(110), slotAttr('cgdp')], ['Life expectancy', SK(70), slotAttr('clife')],
      cur ? ['Currency', SK(140), slotAttr('cfx')] : null, ['Next public holiday', SK(150), slotAttr('chol')]]));
  if (info[0]) {
    setStatus('stats', 'load');
    getJSON('https://statisticsoftheworld.com/api/v1/countries/' + info[0], 20000).then(d => {
      const c = d.country || {}, ind = d.indicators || [];
      const pick = (ids, re) => ind.find(x => ids.includes(x.id)) || ind.find(x => re.test(x.label || ''));
      const pop = pick(['SP.POP.TOTL'], /^population, total/i), gdp = pick(['NY.GDP.PCAP.CD', 'IMF.NGDPDPC'], /GDP per capita.*(current|US\$|USD)/i), life = pick(['SP.DYN.LE00.IN'], /life expectancy at birth, total/i);
      const yr = x => (x && x.year ? ' <small>' + esc(x.year) + '</small>' : '');
      slot(it, 'cregion', esc([c.region, c.incomeLevel].filter(Boolean).join(', ') || 'Country'));
      slot(it, 'ccap', esc(c.capitalCity || 'Unknown'));
      slot(it, 'cpop', pop && isFinite(+pop.value) ? bigNum(+pop.value) + yr(pop) : 'Unknown');
      slot(it, 'cgdp', gdp && isFinite(+gdp.value) ? '$' + num(+gdp.value) + ' a year' + yr(gdp) : 'Unknown');
      slot(it, 'clife', life && isFinite(+life.value) ? (+life.value).toFixed(1) + ' years' + yr(life) : 'Unknown');
      setStatus('stats', 'ok');
    }).catch(e => { slot(it, 'cregion', ''); ['ccap', 'cpop', 'cgdp', 'clife'].forEach(k => slot(it, k, 'Unavailable')); setStatus('stats', 'err', errNote(e)); });
  } else { slot(it, 'cregion', ''); ['ccap', 'cpop', 'cgdp', 'clife'].forEach(k => slot(it, k, 'Unknown')); }
  if (cur) fxRates().then(r => slot(it, 'cfx', cur === 'USD' ? 'US dollar' : r[cur] ? '1 US dollar = ' + (+r[cur]).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + cur : cur))
    .catch(() => slot(it, 'cfx', cur));
  setStatus('holidays', 'load');
  firstOf('holidays', [['caldays', () => getJSON('https://caldays.com/api/holidays/' + cc.toLowerCase(), 15000)], ['Nager.Date', () => getJSON('https://date.nager.at/api/v3/NextPublicHolidays/' + cc, 15000)]]).then(d => {
    const list = (Array.isArray(d) ? d : d.holidays || d.data || []).filter(h => h && h.date).sort((a, b) => (a.date < b.date ? -1 : 1)), today = new Date().toISOString().slice(0, 10);
    const next = list.find(h => String(h.date).slice(0, 10) >= today);
    slot(it, 'chol', next ? esc(next.name || next.localName || 'Holiday') + ', ' + esc(new Date(String(next.date).slice(0, 10) + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })) : 'None left this year');
    okStatus('holidays');
  }).catch(e => { slot(it, 'chol', 'Unavailable'); setStatus('holidays', 'err', errNote(e)); });
}
const rockAge = ma => (ma >= 1000 ? (ma / 1000).toFixed(1) + ' billion' : ma >= 1 ? num(ma) + ' million' : num(ma * 1000) + ' thousand');
function loadBedrock(it) {
  setStatus('geology', 'load');
  getJSON('https://macrostrat.org/api/v2/geologic_units/map?lat=' + it.lat.toFixed(4) + '&lng=' + it.lon.toFixed(4), 15000).then(d => {
    const u = d.success && d.success.data && d.success.data[0];
    setStatus('geology', 'ok');
    if (!u) return slot(it, 'pgeo', 'No data here');
    const t = +u.t_age, b = +u.b_age;
    slot(it, 'pgeo', esc(cap(String(u.lith || u.name || 'Rock').split(/[;,]/)[0].trim())) + (isFinite(b) && b > 0 ? ', ' + (isFinite(t) && t > 0 && rockAge(t) !== rockAge(b) ? rockAge(t) + ' to ' : '') + rockAge(b) + ' years old' : ''));
  }).catch(e => { slot(it, 'pgeo', 'Unavailable'); setStatus('geology', 'err', errNote(e)); });
}
