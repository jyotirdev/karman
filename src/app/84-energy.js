/* ============================================================
   Energy: the world's largest power stations, its gas pipelines and its LNG terminals.
   A reference map from Global Energy Monitor's trackers (CC BY 4.0), cut down to the bigger ones by tools/make-energy.py
   and carried inside this file like the cables and reactors, so it draws online or not. Nuclear stations are not repeated here.
   Every layer starts switched off and is only unpacked when it is first switched on.
   ============================================================ */
const NRG = ASSET.energy;
const nrgEdition = ym => { const d = new Date(ym + '-01T00:00:00Z'); return isNaN(d) ? ym : d.toLocaleDateString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
CREDITS.push(['Global Energy Monitor', 'Power stations from the Global Integrated Power Tracker (' + nrgEdition(NRG.power) + '), gas pipelines and LNG terminals from the Global Gas Infrastructure Tracker (' + nrgEdition(NRG.gas) + '). Only the larger ones are carried here. Licensed CC BY 4.0', 'https://globalenergymonitor.org/']);
Object.assign(PSEUDO, { pipe: 'Gas pipeline' });
SWATCH_AS.pipe = 'pipes';
const GEM_WIKI = 'https://www.gem.wiki/';
/* a name as packed: its usual ending is one character, and the wiki address is only given when it is not simply the name */
const nrgName = (s, ends) => (s.endsWith('~') ? s.slice(0, -1) + ends[0] : s.endsWith('^') && ends[1] ? s.slice(0, -1) + ends[1] : s);
const nrgWiki = (name, odd) => GEM_WIKI + encodeURI(odd || name.replace(/ /g, '_'));

/* ---------- power stations: one layer per fuel ---------- */
const ENERGY = {
  coal:  { one: 'Coal power station', full: 6000, explain: 'Burns coal to boil water, and the steam spins turbines. Coal makes about a third of the world’s electricity, more than anything else, and more of the carbon dioxide that is warming the planet than any other single source.' },
  gas:   { one: 'Gas power station', full: 6000, explain: 'Burns natural gas in turbines much like jet engines. The best ones use the hot exhaust to raise steam and drive a second turbine. Gas gives off about half the carbon dioxide of coal for the same electricity.' },
  hydro: { one: 'Hydropower station', full: 12000, explain: 'Water held back by a dam falls through turbines. It burns nothing, and it can be turned up and down in minutes, which makes it the grid’s favourite way to follow demand.' },
  solar: { one: 'Solar farm', full: 3000, explain: 'Fields of panels that turn sunlight straight into electricity. The figure is the most the site can make under a full midday sun; over a year it averages around a fifth of that.' },
  wind:  { one: 'Wind farm', full: 3000, explain: 'Turbines turned by the wind, on land or standing in the sea. The figure is the most the site can make in a strong wind; over a year it averages a quarter to a half of that.' }
};
const NRG_KIND = {
  subcritical: 'Standard steam boiler (subcritical)', supercritical: 'High-pressure boiler (supercritical)', 'ultra-supercritical': 'Hottest, most efficient boiler (ultra-supercritical)', cfb: 'Fluidised-bed boiler',
  'combined cycle': 'Combined cycle: gas turbines plus a steam turbine', 'gas turbine': 'Gas turbines', 'steam turbine': 'Steam turbines', 'internal combustion': 'Engines', iscc: 'Combined cycle with solar heat',
  'conventional storage': 'Dam with a reservoir', 'run-of-river': 'Run of the river, with little or no reservoir', 'pumped storage': 'Pumped storage: water is pumped uphill when power is cheap and run back down when it is needed',
  'conventional and run-of-river': 'Reservoir and run of the river', 'conventional and pumped storage': 'Reservoir with pumped storage',
  pv: 'Solar panels (photovoltaic)', 'assumed pv': 'Solar panels (photovoltaic)', 'solar thermal': 'Mirrors that focus sunlight to raise steam',
  onshore: 'On land', 'offshore hard mount': 'At sea, fixed to the sea bed', 'offshore floating': 'At sea, floating', 'offshore mount unknown': 'At sea'
};
function nrgPlant(key, r, i) {
  const title = nrgName(r[0], NRG.ends[key]), kind = NRG.kinds[r[8]] || '', oil = kind.startsWith('oil, '), k = oil ? kind.slice(5) : kind, mw = r[3], sea = key === 'wind' && k.startsWith('offshore');
  return { layer: key, id: key + i, title, kind: oil ? 'Oil power station' : sea ? 'Offshore wind farm' : ENERGY[key].one, lat: r[1], lon: r[2], v: ll(r[1], r[2], 1.0036), mw, year: r[4], units: r[5], building: r[6],
    country: NRG.countries[r[7]], how: k.replace(/\/ccs$/, ''), ccs: /\/ccs$/.test(k), oil, wiki: nrgWiki(title, r[9]), explain: ENERGY[key].explain,
    size: mw ? 3.5 + 4.3 * Math.sqrt(Math.min(1, mw / ENERGY[key].full)) : 3.6, alpha: mw ? 0.92 : 0.5 };
}
function loadEnergy(key) {
  if (!ENERGY[key] || ENERGY[key].done) return;
  ENERGY[key].done = true;
  applyItems(key, NRG.plants[key].map((r, i) => nrgPlant(key, r, i)));
}
for (const key of Object.keys(ENERGY)) DETAILS[key] = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div><p>' + esc(it.kind + ', ' + it.country) + (it.mw ? '' : ', being built') + '</p>',
  rows: [
    it.mw ? ['Output', num(it.mw) + ' MW at full power'] : null,
    it.building ? [it.mw ? 'Being added' : 'Being built', num(it.building) + ' MW'] : null,
    it.units > 1 ? [it.layer === 'solar' || it.layer === 'wind' ? 'Built in' : 'Generating units', it.units + (it.layer === 'solar' || it.layer === 'wind' ? ' phases' : '')] : null,
    it.how && it.how !== 'unknown' ? ['Type', esc(NRG_KIND[it.how] || cap(it.how)) + (it.ccs ? ', with carbon capture' : '')] : null,
    it.year ? ['Start year', String(it.year)] : null,
    ['Location', esc(fmtLL(it.lat, it.lon))],
    ['Record', 'Global Energy Monitor, ' + nrgEdition(NRG.power)]
  ],
  actions: '<button class="btn" data-spot="' + it.lat.toFixed(3) + ',' + it.lon.toFixed(3) + '">Weather at this spot</button>' + link(it.wiki, 'Open on Global Energy Monitor’s wiki')
});

/* ---------- LNG terminals ---------- */
function loadLng() {
  if (loadLng.done) return; loadLng.done = true;
  applyItems('lng', NRG.lng.map((r, i) => {
    const title = nrgName(r[0], [' LNG Terminal']), out = !!r[3], mt = r[4];
    return { layer: 'lng', id: 'lng' + i, title, kind: out ? 'LNG export terminal' : 'LNG import terminal', lat: r[1], lon: r[2], v: ll(r[1], r[2], 1.0036), out, mt, building: r[5], year: r[6], country: NRG.countries[r[7]], wiki: nrgWiki(title, r[8]),
      explain: out ? 'Chills natural gas to 162 degrees below zero, where it becomes a liquid six hundred times smaller, and loads it onto tankers bound for countries no pipeline reaches.' : 'Takes liquefied natural gas off tankers, warms it back into gas and feeds it into the country’s pipelines.',
      size: mt ? 4 + 3.6 * Math.sqrt(Math.min(1, mt / 30)) : 3.8, alpha: mt ? 0.92 : 0.5 };
  }));
}
DETAILS.lng = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div><p>' + esc(it.kind + ', ' + it.country) + (it.mt ? '' : ', being built') + '</p>',
  rows: [
    it.mt ? [it.out ? 'Can ship' : 'Can take in', (+it.mt.toFixed(1)).toLocaleString() + ' million tonnes of LNG a year'] : null,
    it.building ? [it.mt ? 'Being added' : 'Being built', (+it.building.toFixed(1)).toLocaleString() + ' million tonnes a year'] : null,
    it.year ? ['Opened', String(it.year)] : null,
    ['Location', esc(fmtLL(it.lat, it.lon))],
    ['Record', 'Global Energy Monitor, ' + nrgEdition(NRG.gas)]
  ],
  actions: '<button class="btn" data-spot="' + it.lat.toFixed(3) + ',' + it.lon.toFixed(3) + '">Weather at this spot</button>' + link(it.wiki, 'Open on Global Energy Monitor’s wiki')
});

/* ---------- gas pipelines: drawn and clicked like the undersea cables ---------- */
const pipes = { list: [] };
let pipesObj = null;
function loadPipes() {
  if (pipesObj) return;
  const all = [], faint = [];
  NRG.pipes.forEach((r, i) => {
    const lines = []; for (const part of String(r[6]).split(' ')) if (part) routeLines(unpackRoute(part), lines);
    if (!lines.length) return;
    const title = nrgName(r[0], [' Gas Pipeline', ' Pipeline']);
    const it = Object.assign({ layer: 'pipe', id: 'pipe' + i, title, state: r[1], year: r[2], km: r[3], bcm: r[4], countries: String(NRG.countries[r[5]] || '').split('; ').filter(Boolean), wiki: nrgWiki(title, r[7]) }, routeShape(lines));
    it.explain = 'A steel pipe, often more than a metre across and usually buried, that carries natural gas at high pressure from gas fields and ports to cities, power stations and factories. Pumping stations every hundred kilometres or so keep it moving. The route drawn here is a sketch, accurate to a few kilometres.';
    pipes.list.push(it);
    for (const l of lines) { all.push(l); faint.push(r[1] === 1 ? 0.45 : r[1] === 2 ? 0.3 : 1); }
  });
  if (!all.length) return;
  pipesObj = segmentsFrom(all, 1.0011, LAYERS.pipes.color, 0.34); pipesObj.visible = isOn('pipes');
  const alpha = pipesObj.geometry.attributes.aAlpha.array; let w = 0;                   /* pipelines being built or standing idle are drawn fainter */
  all.forEach((l, i) => { const n = (l.length - 1) * 2; for (let j = 0; j < n; j++) alpha[w++] = faint[i]; });
  pipesObj.geometry.attributes.aAlpha.needsUpdate = true;
  extra.pipe = pipes.list;
  setCount('pipes', pipes.list.length.toLocaleString());
}
const pipeNear = (lat, lon, reach) => (pipesObj && pipesObj.visible ? routeNear(pipes.list, lat, lon, reach) : null);
DETAILS.pipe = it => ({
  title: '<div class="big word">' + esc(it.title) + '</div><p>' + (it.state === 1 ? 'Being built' : it.state === 2 ? 'Standing idle' : it.year ? 'Carrying gas since ' + it.year : 'Carrying gas') + '</p>',
  rows: [
    ['Length', num(it.km) + ' km'],
    it.bcm ? ['Can carry', (+it.bcm.toFixed(1)).toLocaleString() + ' billion cubic metres of gas a year'] : null,
    it.countries.length ? [it.countries.length === 1 ? 'Country' : 'Countries', esc(cableList(it.countries, 12))] : null,
    ['Record', 'Global Energy Monitor, ' + nrgEdition(NRG.gas)]
  ],
  actions: '<button class="btn" data-spot="' + it.lat.toFixed(3) + ',' + it.lon.toFixed(3) + '">Weather at this spot</button>' + link(it.wiki, 'Open on Global Energy Monitor’s wiki')
});
/* everything that was left switched on last time is unpacked when the page opens */
const ENERGY_KEYS = Object.keys(ENERGY).concat('lng', 'pipes');
function loadEnergyOn() {
  for (const key of Object.keys(ENERGY)) if (isOn(key)) loadEnergy(key);
  if (isOn('lng')) loadLng();
  if (isOn('pipes')) loadPipes();
}
const energyCount = () => Object.keys(ENERGY).concat('lng').reduce((n, k) => n + layers[k].items.length, 0) + pipes.list.length;
$('#tab-guide').insertAdjacentHTML('beforeend', '<h3>Power and pipelines</h3><ul class="how"><li>In the Layers tab, under Infrastructure, switch on the world’s largest <b>coal, gas, hydro, solar and wind</b> power stations, its <b>gas pipelines</b> and its <b>LNG terminals</b>. They start switched off. A square is a power station, bigger for more output; a faint one is still being built.</li>' +
  '<li>Click a station, a terminal or a pipeline for its size and age. The list is Global Energy Monitor’s, as it stood in ' + nrgEdition(NRG.power) + ', and holds only the bigger ones: the Credits say exactly which.</li></ul>');
