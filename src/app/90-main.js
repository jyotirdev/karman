/* ============================================================
   Wiring: toggles, pointer, scheduler, frame loop
   ============================================================ */
function onSelect(it) {
  if (it.layer === 'place' || it.layer === 'cities') loadPlace(it);
  else if (it.layer === 'cable' || it.layer === 'pipe') showCable(it);
  else if (it.layer === 'radio' && radio.current && radio.current !== it && radio.state !== 'idle' && radio.state !== 'error') playRadio(it);   /* already listening: hop to the new station */
  deepSelect(it);
  if (it.rec) orbitDrawnAt = 0;
}
function onDeselect(was) { orbitDrawnAt = 0; if (was && (was.layer === 'cable' || was.layer === 'pipe')) showCable(null); if (was && was.layer === 'cams') camClose(); }

$('#tab-layers').addEventListener('change', e => {
  if (e.target.id === 'quake-window') { prefs.win = e.target.value; savePrefs(); setCountLoading('quakes'); sched.usgs.next = 0; return; }
  if (e.target.id === 'overlay-pick') { e.target.closest('.layer').classList.toggle('off', !e.target.value); return setOverlay(e.target.value); }
  const label = e.target.closest('.layer'); if (!label) return;
  const key = label.dataset.layer, on = e.target.checked;
  prefs.on[key] = on; savePrefs();
  label.classList.toggle('off', !on);
  if (layers[key]) layers[key].show(on);
  if (key === 'plates') platesObj.visible = on;
  if (key === 'borders') bordersObj.visible = on;
  if (key === 'grid') gridObj.visible = on;
  if (key === 'storms') stormTracks.visible = on;
  if (sched[key] && on) sched[key].next = 0;
  if (key === 'aurora' && on && !aurora.ready) sched.aurora.next = 0;
  if (SAT_KEYS.includes(key) && on) { ensureSatLayer(key); if ((key === 'nav' || key === 'geo') && camLL().dist < view.fit * 2) { const c = camLL(); flyTo(c.lat, c.lon, view.fit * 4.2, true); } }
  if ((key === 'radio' || key === 'sounds') && !on && radio.current && radio.current.layer === key) playRadio(null);
  if (key === 'cables') { if (on) loadCables(); if (cablesObj) cablesObj.visible = on; if (!on && selected && selected.layer === 'cable') select(null); }
  if (ENERGY[key] && on) loadEnergy(key);
  if (key === 'lng' && on) loadLng();
  if (key === 'pipes') { if (on) loadPipes(); if (pipesObj) pipesObj.visible = on; if (!on && selected && selected.layer === 'pipe') select(null); }
  if (selected && selected.layer === key && !on) select(null);
  dirty.summary = dirty.feed = true;
});
stormTracks.visible = isOn('storms');

let uiPointerDown = false;
document.addEventListener('pointerdown', () => { uiPointerDown = true; }, true);
document.addEventListener('pointerup', () => { uiPointerDown = false; }, true);
document.addEventListener('pointercancel', () => { uiPointerDown = false; }, true);
document.addEventListener('click', e => {
  if (e.target.closest('#insp-close')) return select(null);
  if (e.target.closest('#insp-fly')) return selected && flyTo(selected.lat, selected.lon, Math.min(camLL().dist, view.fit * 0.62));
  if (e.target.closest('#radio-play')) return playRadio(selected);
  if (deepClick(e)) return;
  const go = e.target.closest('[data-go]');
  if (go) { const p = go.dataset.go === 'moon' ? moon : sun; select(null); return flyTo(p.lat, p.lon); }
  const open = e.target.closest('[data-open]');
  if (open) return select({ layer: open.dataset.open, id: open.dataset.open });
  const el = e.target.closest('[data-sel]');
  if (!el) return;
  const i = el.dataset.sel.indexOf(':');
  const it = findItem(el.dataset.sel.slice(0, i), el.dataset.sel.slice(i + 1));
  if (it) select(it);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && selected && document.activeElement.tagName !== 'INPUT') select(null); });

$('#view-spin').addEventListener('click', () => setSpin(!controls.autoRotate));
$('#view-reset').addEventListener('click', () => { select(null); flyTo(home.lat, home.lon, view.fit, true); });
$('#zoom-in').addEventListener('click', () => zoomBy(0.6));
$('#zoom-out').addEventListener('click', () => zoomBy(1.7));
$('#view-orbits').addEventListener('click', () => { const c = camLL(); flyTo(c.lat, c.lon, c.dist > view.fit * 2 ? view.fit : view.fit * 4.2, true); });

/* ---------- pointer on the globe: drag to turn, wheel or pinch to zoom, click a marker or any place ---------- */
let down = null, hoverQueued = false, hoverXY = null, pinch = null;
const touches = new Map(), tip = $('#tip'), cursorEl = $('#cursor');
const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { const t = Array.from(touches.values()); pinch = { d: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y), h: zoomTarget - 1 }; down = null; return; }
  }
  down = { x: e.clientX, y: e.clientY, t: performance.now() }; fly = null; canvas.classList.add('dragging'); tip.setAttribute('data-off', '');
});
window.addEventListener('pointermove', e => {
  if (!touches.has(e.pointerId)) return;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2 && boot.entered) { const t = Array.from(touches.values()), d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1; zoomTarget = clamp(1 + pinch.h * pinch.d / d, controls.minDistance, controls.maxDistance); }
});
const endTouch = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; };
window.addEventListener('pointercancel', endTouch);
window.addEventListener('pointerup', e => {
  endTouch(e);
  canvas.classList.remove('dragging');
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 700;
  down = null;
  if (moved > 6) { setSpin(false); return; }
  if (!quick || e.target !== canvas || !boot.entered) return;
  camera.updateMatrixWorld(); VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const p = local(e), hit = pick(p.x, p.y);
  if (hit) return select(hit);
  const g = globePoint(p.x, p.y), cab = g && lineNear(g.lat, g.lon, pixelReach(e.pointerType === 'touch' ? 9 : 4.5));
  if (cab) { cab.lat = g.lat; cab.lon = g.lon; cab.v = ll(g.lat, g.lon, 1.002); return select(cab, { stay: true }); }      /* a cable or pipeline is marked where it was clicked */
  if (g) openPlace(g.lat, g.lon); else if (selected) select(null);
});
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || down) return;
  hoverXY = local(e);
  if (hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => {
    hoverQueued = false;
    if (!hoverXY || down) return;
    const g = globePoint(hoverXY.x, hoverXY.y), hit = pick(hoverXY.x, hoverXY.y) || (g && lineNear(g.lat, g.lon, pixelReach(4.5)));
    canvas.classList.toggle('hit', !!hit);
    cursorEl.textContent = g ? fmtLL(g.lat, g.lon) : '';
    if (hit) { tip.innerHTML = swatch(hit.layer) + '<span>' + esc(hit.title || kindOf(hit)) + '</span>'; tip.style.transform = 'translate3d(' + Math.min(hoverXY.x, view.w - 320) + 'px,' + hoverXY.y + 'px,0)'; tip.removeAttribute('data-off'); }
    else tip.setAttribute('data-off', '');
  });
});
canvas.addEventListener('pointerleave', () => { hoverXY = null; tip.setAttribute('data-off', ''); canvas.classList.remove('hit'); cursorEl.textContent = ''; });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); if (!boot.entered) return; fly = null;
  zoomTarget = clamp(1 + (zoomTarget - 1) * Math.exp(e.deltaY * (e.deltaMode === 1 ? 32 : 1) * 0.0013), controls.minDistance, controls.maxDistance);
}, { passive: false });
canvas.addEventListener('dblclick', e => { const p = local(e), g = globePoint(p.x, p.y); if (g) flyTo(g.lat, g.lon, 1 + (camLL().dist - 1) * 0.5); });

/* ---------- scheduler ---------- */
const sched = {
  usgs:   { every: 60000, fn: loadQuakes },
  eonet:  { every: 600000, fn: loadEvents },
  sats:   { every: 3 * 3600000, fn: loadSatellites },
  swpc:   { every: 300000, fn: loadSpaceWeather },
  cities: { every: 1200000, fn: loadCities },
  news:   { every: 1800000, fn: loadNews, when: () => layers.news.on, src: 'wiki' },
  ll2:    { every: 1200000, fn: loadLaunches },
  gdacs:  { every: 900000, fn: loadAlerts, when: () => layers.alerts.on, src: 'gdacs' },
  clouds: { every: 3 * 3600000, fn: loadClouds, when: () => isOn('clouds'), src: 'clouds' },
  aurora: { every: 900000, fn: loadAurora, when: () => isOn('aurora') },
  wind:   { every: 3600000, fn: loadWind, when: () => isOn('wind') },
  jpl:    { every: 6 * 3600000, fn: loadJPL },
  radio:  { every: 6 * 3600000, fn: loadRadio, when: () => layers.radio.on, src: 'radio' },
  hotspots: { every: 600000, fn: loadHotspots, when: () => layers.hotspots.on, src: 'kanari' },
  wildlife: { every: 600000, fn: loadWildlife, when: () => layers.wildlife.on, src: 'inat' },
  epic:   { every: 3 * 3600000, fn: loadEpic },
  snews:  { every: 1800000, fn: loadSpaceNews },
  sun:    { every: 600000, fn: loadSun },
  calls:  { every: 6 * 3600000, fn: loadSocrates },
  sounds: { every: 1200000, fn: loadSounds, when: () => layers.sounds.on, src: 'isounds' },
  co2:    { every: 12 * 3600000, fn: loadCO2 },
  cams:   { every: 6 * 3600000, fn: loadCams, when: () => layers.cams.on, src: 'cams' },
  overlay: { every: 1800000, fn: () => setOverlay(prefs.overlay, true), when: () => !!prefs.overlay, src: 'gibs' },
  nuclear: { every: 12 * 3600000, fn: () => { loadNuclear(); return loadNuclearMore(); }, when: () => layers.nuclear.on, src: 'wikidata' },
  dsn:    { every: 60000, fn: loadDSN, when: () => layers.dsn.on, src: 'dsn' },
  warnings: { every: 300000, fn: loadWarnings, when: () => layers.warnings.on, src: 'nws' },
  mostread: { every: 3 * 3600000, fn: loadMostRead },
  pastl:  { every: 1800000, fn: loadPastLaunches }
};
const SCHED_KEYS = Object.keys(sched);
Object.keys(sched).forEach(k => { sched[k].next = Infinity; });   /* the staged start-up runs each feed once, then hands over to these timers */
sched.alerts = sched.gdacs;                 /* so a layer switch can find its feed */

/* ---------- staged start-up: one feed at a time, each shown as it loads ---------- */
const count = keys => keys.reduce((n, k) => n + layers[k].items.length, 0);
const BOOT = [
  { label: 'Globe, borders and city lights', from: 'this file', run: () => assetsReady, text: () => 'ready', core: true },
  { label: 'Earthquakes', from: 'the US Geological Survey', sched: 'usgs', src: 'usgs', core: true, text: () => count(['quakes']) + ' in the past ' + prefs.win },
  { label: 'Fires, storms and volcanoes', from: 'NASA', sched: 'eonet', src: 'eonet', core: true, text: () => count(EVENT_KEYS) + ' active' },
  { label: 'Fire hotspots', from: 'kanari.io', sched: 'hotspots', src: 'kanari', text: () => count(['hotspots']).toLocaleString() + ' in 24 hours' },
  { label: 'Disaster alerts', from: 'the United Nations and EU', sched: 'gdacs', src: 'gdacs', text: () => count(['alerts']) + ' active' },
  { label: 'Space stations', from: 'CelesTrak', sched: 'sats', src: 'sats', core: true, ok: () => layers.stations.items.length > 0, text: () => layers.stations.items.map(s => s.short).join(' and ') },
  { label: 'Space weather', from: 'NOAA', sched: 'swpc', src: 'swpc', text: () => (space.kp && space.kp.length ? 'Kp ' + space.kp[space.kp.length - 1].kp.toFixed(1) + ', ' + kpWord(space.kp[space.kp.length - 1].kp).toLowerCase() : 'ready') },
  { label: 'The Sun', from: 'NOAA', sched: 'sun', ok: () => !!(space.flare || space.scales), text: () => (space.flare ? 'last flare ' + space.flare.cls : 'ready') },
  { label: 'US weather warnings', from: 'the National Weather Service', sched: 'warnings', src: 'nws', text: () => count(['warnings']) + ' in force' },
  { label: 'Aurora forecast', from: 'NOAA', sched: 'aurora', ok: () => aurora.ready, text: () => 'peak ' + Math.round(aurora.max) + '%' },
  { label: 'Rocket launches', from: 'Launch Library', sched: 'll2', src: 'll2', text: () => count(['launches']) + ' coming up' },
  { label: 'Recent launches', from: 'Launch Library', sched: 'pastl', ok: () => (extra.pastlaunch || []).length > 0, text: () => extra.pastlaunch.length + ' this week or so' },
  { label: 'City weather', from: 'Open-Meteo', sched: 'cities', src: 'meteo', text: () => cityItems.filter(c => c.temp != null).length + ' cities' },
  { label: 'Wind', from: 'Open-Meteo', sched: 'wind', ok: () => wind.has(), text: () => 'flowing' },
  { label: 'Clouds', from: 'weather satellites', sched: 'clouds', src: 'clouds', text: () => 'ready' },
  { label: 'World news', from: 'Wikipedia', sched: 'news', src: 'wiki', text: () => newsAll.length + ' stories' },
  { label: 'Most read today', from: 'Wikipedia', sched: 'mostread', src: 'wikiread', text: () => (extra.mostread || []).length + ' articles' },
  { label: 'Space news', from: 'Spaceflight News', sched: 'snews', src: 'snews', text: () => (extra.snews || []).length + ' articles' },
  { label: 'Wildlife sightings', from: 'iNaturalist', sched: 'wildlife', src: 'inat', text: () => count(['wildlife']) + ' new' },
  { label: 'Earth from deep space', from: 'NASA', sched: 'epic', src: 'epic', text: () => 'photo from ' + ago(extra.epic[0].time) },
  { label: 'Fireballs and asteroids', from: 'NASA', sched: 'jpl', src: 'jpl', text: () => count(['fireballs']) + ' fireballs' },
  { label: 'Every active satellite', from: 'CelesTrak', solo: true, run: () => loadAllSatellites(), when: () => SAT_KEYS.some(k => !JUNK[k] && layers[k].on), ok: () => !!SOURCES.sats.fullOK, max: 30000,
    text: () => count(SAT_KEYS).toLocaleString() + ' tracked' },
  { label: 'Space debris', from: 'CelesTrak', solo: true, run: () => ensureSatLayer('debris'), when: () => layers.debris.on, ok: () => !!(layers.debris.sat && layers.debris.sat.started), max: 45000,
    text: () => count(['debris']).toLocaleString() + (layers.debris.partial ? ' in four clouds' : ' pieces') },
  { label: 'Spent rocket stages', from: 'CelesTrak', run: () => ensureSatLayer('rockets'), when: () => layers.rockets.on, ok: () => !!(layers.rockets.sat && layers.rockets.sat.started), max: 30000, text: () => count(['rockets']).toLocaleString() + ' stages' },
  { label: 'Dead satellites', from: 'CelesTrak', run: () => ensureSatLayer('dead'), when: () => layers.dead.on, ok: () => !!(layers.dead.sat && layers.dead.sat.started), max: 45000, text: () => count(['dead']).toLocaleString() + ' found' },
  { label: 'Deep space antennas', from: 'NASA', sched: 'dsn', src: 'dsn', text: () => dsnTalking().length + ' spacecraft in contact' },
  { label: 'Close calls in orbit', from: 'CelesTrak', sched: 'calls', src: 'socrates', text: () => ((extra.calls || []).length ? 'closest ' + distWord(extra.calls[0].km) : 'ready') },
  { label: 'Radio stations', from: 'Radio Browser', sched: 'radio', src: 'radio', text: () => count(['radio']) + ' stations' },
  { label: 'Wild sounds', from: 'iNaturalist', sched: 'sounds', src: 'isounds', text: () => count(['sounds']) + ' recordings' },
  { label: 'Carbon dioxide', from: 'NOAA', sched: 'co2', src: 'co2', text: () => (extra.co2 ? extra.co2.trend.toFixed(1) + ' ppm' : 'ready') },
  { label: 'NASA satellite view', from: 'NASA', sched: 'overlay', src: 'gibs', text: () => 'ready' },
  { label: 'Live cameras', from: 'road agencies', sched: 'cams', src: 'cams', text: () => count(['cams']).toLocaleString() + ' cameras' },
  { label: 'Undersea cables', from: 'this file', run: () => loadCables(), when: () => isOn('cables'), ok: () => !!cablesObj, text: () => cables.list.length + ' cables' },
  { label: 'Power stations and pipelines', from: 'this file', run: () => loadEnergyOn(), when: () => ENERGY_KEYS.some(isOn), ok: () => energyCount() > 0, text: () => energyCount().toLocaleString() + ' sites and pipelines' },
  { label: 'Nuclear facilities', from: 'this file', run: () => { loadNuclear(); sched.nuclear.next = Date.now() + 3000; }, when: () => layers.nuclear.on, ok: () => layers.nuclear.items.length > 0, text: () => nukeSites.length + ' power stations' }
];
/* feeds whose layer is switched off are left out of the start-up list */
const skipped = st => { const s = st.sched && sched[st.sched]; return !!((s && s.when && !s.when()) || (st.when && !st.when())); };
let steps = BOOT;
const boot = { done: false, entered: false, log: [] };
const BOOT_WORD = { wait: '', load: '', slow: 'still loading', err: 'unreachable', off: 'switched off' };
const bootEls = [];
const bootRow = (s, i) => '<li data-state="' + (s.state || 'wait') + '" style="--i:' + i + '"><i class="st"></i><span class="t">' + s.label + '</span><span class="s"></span></li>';
function buildBootList() {
  const half = Math.ceil(steps.length / 2);
  $('#boot-a').innerHTML = steps.slice(0, half).map(bootRow).join('');
  $('#boot-b').innerHTML = steps.slice(half).map((s, i) => bootRow(s, i + half)).join('');
  bootEls.length = 0; $$('#boot-a li, #boot-b li').forEach(el => bootEls.push(el));
  bootRing.u.uN.value = steps.length;
}
const bootText = s => { const st = s.state || 'wait'; if (st !== 'ok') return BOOT_WORD[st]; try { return s.text(); } catch (e) { return 'ready'; } };
function paintBoot() {
  const fin = steps.filter(s => s.state && s.state !== 'load'), cur = steps.filter(s => s.state === 'load'), failed = steps.filter(s => s.state === 'err').length;
  steps.forEach((s, i) => {                          /* only touch the rows that changed, so each one animates once */
    const el = bootEls[i]; if (!el) return;
    const st = s.state || 'wait', txt = bootText(s);
    if (el.dataset.state !== st) el.dataset.state = st;
    if (el.lastChild.textContent !== txt) el.lastChild.textContent = txt;
  });
  $('#boot-pct').textContent = (boot.done ? 100 : Math.round(fin.length / steps.length * 100)) + '%';
  bootRing.u.uDone.value = boot.done ? steps.length : fin.length; bootRing.u.uActive.value = cur.length;
  $('#boot-now').textContent = boot.done ? (failed ? 'Loaded, but ' + failed + (failed === 1 ? ' feed' : ' feeds') + ' could not be reached. The Sources tab shows which.' : 'Everything is live.')
    : cur.length ? 'Loading ' + cur[0].label.toLowerCase() + ' from ' + cur[0].from + (cur.length > 1 ? ' and ' + (cur.length - 1) + ' more' : '') + '…' : !fin.length ? 'Starting…' : steps.some(x => !x.state) ? 'Loading the next feed…' : 'Finishing…';
  $('#boot-log').innerHTML = cur.concat(boot.log).slice(0, 4).map((s, i) => '<li data-state="' + (s.state || 'wait') + '"><i class="st"></i><span class="t">' + s.label + '</span><span class="s">' + esc(bootText(s)) + '</span></li>').join('');
  const go = $('#boot-go');
  go.textContent = boot.done ? 'Start exploring' : 'Skip and start exploring';
  go.classList.toggle('primary', boot.done);
  paintOpening(fin, cur);
  const mini = $('#boot-mini');
  mini.hidden = boot.done || !boot.entered;
  if (!mini.hidden && cur.length) mini.innerHTML = '<i class="spin"></i>Loading ' + Math.min(steps.length, fin.length + 1) + ' of ' + steps.length + ': ' + esc(cur[0].label.toLowerCase());
}
/* one feed: run it, give up waiting after a while (it carries on in the background), and report how it went */
async function runStep(st) {
  const s = st.sched && sched[st.sched];
  st.state = 'load'; paintBoot();
  const r = await Promise.race([Promise.resolve().then(st.run || s.fn).then(() => 'done', () => 'done'), sleep(st.max || 16000).then(() => 'slow')]);
  if (s) s.next = Date.now() + s.every;
  st.state = r === 'slow' ? 'slow' : (st.ok ? st.ok() : !(st.src && SOURCES[st.src].state === 'err')) ? 'ok' : 'err';
  boot.log.unshift(st);
  if (st.state === 'ok') ping();
  paintBoot(); maybeEnter();
}
/* The feeds load four at a time, in order, so the page fills quickly without flooding the browser.
   The heaviest (the satellite catalogue and the debris) wait for a clear lane and load alone. */
function runBoot() {
  return new Promise(res => {
    const queue = steps.slice(); let active = 0, solo = false;
    const pump = () => {
      if (!queue.length && !active) return res();
      while (queue.length && active < 4 && !solo) {
        if (queue[0].solo && active) break;
        const st = queue.shift(); active++; solo = !!st.solo;
        runStep(st).then(() => { active--; if (st.solo) solo = false; setTimeout(pump, 70); });
      }
    };
    pump();
  }).then(() => { boot.done = true; perf.hold = performance.now() + 6000; paintBoot(); setTimeout(enter, prefs.seen ? 500 : 1500); });
}
/* The globe opens by itself once the planet has assembled and nine feeds in ten have answered (the last few carry on behind,
   and "Skip" opens it at once). A short pause first lets the stragglers land if they are about to. */
function maybeEnter() {
  if (boot.entered || boot.arming || !intro.done) return;
  if (steps.filter(s => s.state && s.state !== 'load').length >= Math.ceil(steps.length * 0.9)) { boot.arming = true; setTimeout(enter, 1200); }
}
function enter() {
  if (boot.entered) return;
  boot.entered = true; prefs.seen = true; savePrefs();
  intro.rush = 5; intro.exitAt = performance.now();  /* if the visitor skipped ahead, the globe finishes assembling quickly */
  openingEnter(intro.exitAt);
  zoomTarget = view.fit;
  app.classList.remove('booting');
  const el = $('#boot'); el.classList.add('gone'); setTimeout(() => { el.hidden = true; }, 900);
  paintBoot();
}
$('#boot-go').addEventListener('click', enter);

/* ---------- the opening sequence: the globe assembles itself while the feeds arrive ----------
   Land dots spiral in, a scan line uncovers the surface from pole to pole, the atmosphere lights up, and a ring around the
   planet fills one segment per feed. Each arriving feed sends a ring of light across the surface. */
const intro = { start: performance.now(), t0: 0, clock: 0, last: 0, rush: 1, done: reduceMotion, exitAt: 0, pulseAt: -1e9, allow: 0, measured: 0 };
const easeIO = k => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2), easeOut = k => 1 - Math.pow(1 - k, 3), span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
if (!reduceMotion) { introU.build.value = 0; introU.reveal.value = 0; introU.wire.value = 1; introU.glow.value = 0; introU.lines = 0; introU.spark.value = 1; introU.ghost.forEach(g => { g.value = 0; }); }
assetsReady.then(() => { intro.t0 = performance.now(); });
function ping() {
  const now = performance.now();
  if (reduceMotion || boot.entered || now - intro.pulseAt < 420) return;     /* the rings of light belong to the opening sequence only */
  intro.pulseAt = now; introU.pulseDir.value.copy(camera.position).normalize();
}
/* how far back the camera sits while loading: far enough that the ring clears the heading above and the status lines below */
function bootDistance(now) {
  if (!intro.allow || now - intro.measured > 600) {
    intro.measured = now;
    const cy = view.h * (view.phone ? 0.35 : 0.5), footEl = $('.boot-foot'), topEl = $('.boot-top');      /* measured where they come to rest, not where the opening animation has them at this moment */
    intro.allow = Math.max(90, Math.min(0.47 * view.w, footEl.offsetTop - cy - 14, cy - (view.phone ? 0 : topEl.offsetTop + topEl.offsetHeight) - 14));
  }
  return clamp(1.47 * (view.h / 2) / (Math.tan(camera.fov * D2R / 2) * intro.allow), view.fit * 1.02, controls.maxDistance * 0.9);
}
function stepIntro(now) {
  if (intro.freeze != null) { now = (intro.freeze < 0 ? intro.exitAt - intro.freeze * 1000 : intro.start + intro.freeze * 1000); if (intro.freeze >= 0) intro.clock = intro.freeze * 1000; }     /* test only: hold the opening at one moment */
  const dtm = Math.min(250, now - (intro.last || now)); intro.last = now;
  if (!intro.done) {
    if (intro.t0) intro.clock += dtm * intro.rush;
    const t = intro.clock / 1000;
    /* the dots take three and a half seconds to stream in and land, at a steady pace (the count runs on past 1 so the flash
       of the last to land has time to fade); the rest of the sequence then follows as it always has */
    const flow = k => k * k * (3 - 2 * k);
    introU.build.value = BUILT * flow(span(t, 0, 5.2));
    introU.ghost.forEach((g, i) => { g.value = BUILT * flow(span(t - 0.06 * (i + 1), 0, 5.2)); });
    introU.spark.value = 1 - span(t, 4.9, 5.4);
    introU.reveal.value = 1.2 * easeIO(span(t, 2.2, 4.6));
    introU.glow.value = span(t, 3.2, 4.8);
    introU.lines = span(t, 3.5, 4.6);
    introU.wire.value = 1 - span(t, 4.3, 5.4);
    if (t >= 5.4) {
      intro.done = true; introU.build.value = BUILT; introU.reveal.value = 1.3; introU.glow.value = 1; introU.lines = 1; introU.wire.value = 0; introU.spark.value = 0;
      if (introU.tails) { for (const q of introU.tails) { scene.remove(q); q.material.dispose(); } introU.tails = null; }
      maybeEnter();
    }
  }
  const pk = (now - intro.pulseAt) / 1500;
  introU.pulse.value = pk >= 1 ? 1 : easeOut(pk);
  const R = bootRing.u, ring = bootRing.mesh;
  if (ring.visible) {
    if (!boot.entered) R.uFade.value = Math.min(1, R.uFade.value + dtm / 800);
    else { const k = span(now - intro.exitAt, 0, 1100); R.uBurst.value = easeOut(k); R.uFade.value = 1 - k; if (k >= 1) ring.visible = false; }
    ring.quaternion.copy(camera.quaternion);
  }
  if (!boot.entered) {
    const d = bootDistance(now);
    zoomTarget = reduceMotion ? d : d * (1 + 0.6 * (1 - easeOut(span(now - intro.start, 0, 4200))));
    controls.autoRotateSpeed = 1.15;
  } else if (controls.autoRotateSpeed > 0.221) controls.autoRotateSpeed += (0.22 - controls.autoRotateSpeed) * 0.035;
  stepOpening(now, dtm);
}

let lastRestyle = 0, lastSources = 0;
function tick() {
  const now = Date.now(), d = new Date(now);
  Object.assign(sun, subsolar(d)); Object.assign(moon, moonInfo(d));
  ll(sun.lat, sun.lon, 1, U.uSun.value);
  $('#clock-time').textContent = d.toISOString().slice(11, 19) + ' UTC';
  $('#clock-date').textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (boot.done && !document.hidden && !(tour.on && tour.phase === 'fly')) {      /* while the tour is in flight, refreshes wait a few seconds for it to land, so nothing interrupts the motion */
    let running = 0;
    for (const key of SCHED_KEYS) if (sched[key].busy) running++;
    for (const key of SCHED_KEYS) {
      const s = sched[key];
      if (s.busy || now < s.next) continue;
      if (s.when && !s.when()) { if (s.src && SOURCES[s.src].state !== 'off') setStatus(s.src, 'off'); continue; }
      if (running >= 3) break;                       /* the rest wait their turn; they are still due, so they start as soon as a lane frees */
      running++; s.busy = true; s.next = now + s.every * (0.96 + Math.random() * 0.08);      /* a little spread, so feeds with the same period drift apart */
      Promise.resolve().then(s.fn).catch(() => {}).then(() => { s.busy = false; });
    }
  }
  if (now - lastRestyle > 60000 && layers.quakes.items.length) {         /* quakes fade as they age */
    lastRestyle = now;
    for (const q of layers.quakes.items) styleQuake(q, now);
    layers.quakes.set(layers.quakes.items);
  }
  if (!uiPointerDown) {
    if (dirty.summary) { dirty.summary = false; renderSummary(); }
    if (dirty.feed) { dirty.feed = false; renderFeed(); }
    if (dirty.news) { dirty.news = false; renderNews(); }
    if (dirty.sources || now - lastSources > 15000) { dirty.sources = false; lastSources = now; renderSources(); }
  }
  refreshLive();
}

/* ---------- frame loop ---------- */
const reticle = $('#reticle');
function place(el, v) {
  if (!v || occluded(v) || !project(v)) { if (!el.hasAttribute('data-off')) el.setAttribute('data-off', ''); return; }
  el.style.transform = 'translate3d(' + scr.x.toFixed(1) + 'px,' + scr.y.toFixed(1) + 'px,0)';
  if (el.hasAttribute('data-off')) el.removeAttribute('data-off');
}
const FADES = [
  [() => (isOn('lights') ? 1 : 0), globeU.uLights],
  [() => (isOn('clouds') && cloudsReady ? 1 : 0), globeU.uClouds],
  [() => (over.id && over.id === over.want ? 1 : 0), globeU.uOver],
  [() => (fine.box && over.id ? 1 : 0), globeU.uFineOn],
  [() => (isOn('aurora') && aurora.ready ? 1 : 0), aurora.u.uFade, aurora.mesh],
  [() => (isOn('wind') && wind.has() ? (view.phone ? 0.26 : 0.34) : 0), wind.obj.material.uniforms.uFade, wind.obj]
];
let lastFrame = 0, frameNo = 0;
const perf = { t: 0, n: 0, hold: performance.now() + 8000, good: 0, drops: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  const focused = document.hasFocus();
  if (!focused && (++frameNo & 1)) return;           /* half the frame rate while another window has focus */
  const raw = now - lastFrame;
  const dt = clamp(raw / 16.7, 0.2, 3); lastFrame = now;
  if (focused && raw < 250 && now > perf.hold && boot.done) {
    perf.t += raw;
    if (++perf.n >= 120) {
      const avg = perf.t / perf.n; perf.t = perf.n = 0;
      if (avg > 30 && quality.level < 2) { setQuality(quality.level + 1); perf.hold = now + 6000; perf.drops++; perf.good = 0; }
      else if (avg < 21 && quality.level > 0 && perf.drops < 3) { if (++perf.good >= 5) { setQuality(quality.level - 1); perf.hold = now + 6000; perf.good = 0; } }
      else perf.good = 0;
    }
  }
  const wall = Date.now();
  U.uTime.value = now / 1000;
  stepIntro(now);
  if (tour.on) stepTour(now);
  else if (fly) stepFly(now);
  else { const d = camera.position.length(); if (Math.abs(zoomTarget - d) > 1e-4) camera.position.setLength(d + (zoomTarget - d) * (reduceMotion ? 1 : Math.min(1, (boot.entered && now - intro.exitAt < 2600 ? 0.05 : 0.16) * dt))); }
  const dist = camera.position.length();
  controls.rotateSpeed = clamp(0.55 * (dist - 1) / (view.fit - 1), 0.03, 0.9);
  controls.update();
  if (tour.on) tourLook(); else trackSpin(now);
  stepFine(now);
  const zk = view.zoomK = clamp((view.fit - dist) / (view.fit - controls.minDistance), 0, 1);
  U.uZoom.value = clamp(Math.pow(view.fit / dist, 0.4), 0.7, 1.9) * (view.phone ? 0.85 : 1);
  dotsU.uFade.value = 0.85 - 0.6 * zk;
  bordersObj.material.uniforms.uFade.value = (0.2 + 0.3 * zk) * introU.lines;
  for (const f of FADES) { const t = f[0](), u = f[1]; if (u.value !== t) { u.value += (t - u.value) * 0.08; if (Math.abs(t - u.value) < 0.004) u.value = t; } if (f[2]) f[2].visible = u.value > 0.004; }
  for (const key of MARKER_KEYS) layers[key].tickFade();
  if (wind.obj.visible && !reduceMotion) wind.step(dt);
  if (window.satellite) {
    for (const key of SAT_KEYS) stepSatLayer(key, wall);
    if (layers.stations.items.length) updateStations(wall);
    updateFocus(wall);
  }
  camera.updateMatrixWorld();
  VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  placeLabels();
  place(reticle, selected && selected.v && layerOn(selected.layer) ? selected.v : null);
  tourMarks();
  renderer.render(scene, camera);
}

/* ---------- staying up when things go wrong ---------- */
window.addEventListener('offline', () => { const b = $('#banner'); b.hidden = false; b.textContent = 'You are offline. The globe is showing the last data it received and will catch up when the connection returns.'; });
window.addEventListener('online', () => { $('#banner').hidden = true; for (const k of SCHED_KEYS) if (isFinite(sched[k].next)) sched[k].next = 0; });
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); const b = $('#banner'); b.hidden = false; b.textContent = 'The graphics were interrupted. Restoring the globe…'; });
canvas.addEventListener('webglcontextrestored', () => { $('#banner').hidden = true; resize(); });

/* ---------- go ---------- */
window.addEventListener('resize', resize);
resize();
zoomTarget = bootDistance(performance.now()) * (reduceMotion ? 1 : 1.6); camera.position.setLength(zoomTarget);
setSpin(controls.autoRotate);
applyItems('cities', cityItems);
for (const st of BOOT) if (skipped(st)) { const s = st.sched && sched[st.sched]; if (s && s.src) setStatus(s.src, 'off'); }
steps = BOOT.filter(st => !skipped(st));
buildBootList();
paintBoot();
tick();
renderDetail();
setInterval(tick, 1000);
setInterval(() => { camera.updateMatrixWorld(); VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); refreshLabels(); }, 320);
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
requestAnimationFrame(now => { lastFrame = now; frame(now); canvas.classList.add('ready'); });
if (location.hash === '#test') window.__ern = { pick: (k, i) => select(layers[k].items[i || 0]), cam: () => ({ dist: +camera.position.length().toFixed(3), target: +zoomTarget.toFixed(3), fit: +view.fit.toFixed(3), quality: quality.level, entered: boot.entered, introDone: intro.done, under: (document.elementFromPoint(view.w / 2, view.h / 2) || {}).id }) };   /* lets the automated checks open an item directly */
/* test only: show the opening (t seconds in) or the moment of going live (t seconds after), held still */
if (location.hash === '#test') Object.assign(window.__ern, {
  openAt(t) {
    let tr = 0; for (let x = 0; x < t; x += 0.01) tr += (46 * Math.pow(1 - clamp((x - 0.1) / 2, 0, 1), 2.4) + 0.3) * 0.01;
    intro.freeze = t; intro.done = false; intro.last = 0; opening.gone = false; opening.travel = tr; openStars.g.visible = true; bootRing.mesh.visible = true;
    bootRing.u.uFade.value = clamp(t / 0.8, 0, 1); bootRing.u.uBurst.value = 0;
    $$('.boot-top, .boot-read, .boot-feed, .boot-foot').forEach(el => { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; });
    document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = t * 1000; } catch (e) {} });
  },
  find: (layer, title) => { const it = (layers[layer] ? layers[layer].items : extra[layer] || []).find(x => x.title === title); if (it) select(it); return !!it; },
  cableAt: (lat, lon, px) => { const c = cableNear(lat, lon, pixelReach(px || 6)); return c ? c.title : null; },
  pipeMid: title => { const it = pipes.list.find(x => x.title === title); if (!it) return null; const l = it.lines.reduce((a, b) => (b.length > a.length ? b : a)), q = l[l.length >> 1]; return [q[1], q[0]]; },
  lineAt: (lat, lon, px) => { const c = lineNear(lat, lon, pixelReach(px || 6)); return c ? c.layer + ': ' + c.title : null; },
  energy: () => { const o = { pipes: pipes.list.length, pipesShown: !!(pipesObj && pipesObj.visible) }; for (const k of Object.keys(ENERGY).concat('lng')) o[k] = layers[k].items.length; return o; },
  cableInfo: () => ({ n: cables.list.length, shown: !!(cablesObj && cablesObj.visible), hi: !!cables.hi, mid: cables.list.slice(0, 3).map(c => [c.title, c.lat, c.lon]) }),
  kinds: () => { const k = {}; for (const x of layers.nuclear.items) k[x.kind] = (k[x.kind] || 0) + 1; return JSON.stringify(k); },
  camKinds: () => { const k = {}; for (const x of layers.cams.items) { const w = x.place.split(', ').pop() + (x.live ? ' live' : x.video ? ' clip' : x.hist ? ' day' : ' still'); k[w] = (k[w] || 0) + 1; } return JSON.stringify(k); },
  camFirst: place => { const it = layers.cams.items.find(x => x.place.endsWith(place)); if (it) select(it); return it ? it.title : null; },
  camState: () => JSON.stringify({ it: !!cam.it, mode: cam.mode, state: cam.state, hls: !!cam.hls, timer: !!cam.timer }),
  look(lat, lon) { ll(lat, lon, camera.position.length(), camera.position); controls.update(); },
  views: () => OVERLAYS.filter(o => o.id).map(o => o.id),
  /* the colour of the globe's surface alone at each of a list of places [lat, lon], as it reaches the screen: everything else is hidden for one extra frame.
     `bare` leaves the NASA view out as well, to give the surface underneath. */
  probe(places, bare) {
    for (const f of FADES) f[1].value = f[0]();                                       /* fades take a minute at two frames a second */
    const was = [globeU.uOver.value, globeU.uFineOn.value, globeU.uPulseK.value]; globeU.uPulseK.value = 0; if (bare) globeU.uOver.value = globeU.uFineOn.value = 0;
    const hid = scene.children.filter(o => o.visible && o !== globe); hid.forEach(o => { o.visible = false; });
    camera.updateMatrixWorld(); VP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    renderer.render(scene, camera);
    const gl = renderer.getContext(), px = new Uint8Array(4), k = gl.drawingBufferHeight / view.h;
    const out = places.map(q => {
      const v = ll(q[0], q[1], 1); if (!project(v) || occluded(v) || scr.x < 0 || scr.y < 0 || scr.x >= view.w || scr.y >= view.h) return null;
      gl.readPixels(Math.round(scr.x * k), Math.round((view.h - scr.y) * k), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [px[0], px[1], px[2]];
    });
    hid.forEach(o => { o.visible = true; }); globeU.uOver.value = was[0]; globeU.uFineOn.value = was[1]; globeU.uPulseK.value = was[2];
    return out;
  },
  /* what a view's recolouring makes of one of NASA's colours */
  tone(id, rgba) { const d = new Uint8ClampedArray(rgba), f = OVER_TONE[(overDef(id) || {}).tone]; if (f) f(d); return Array.from(d); },
  over: () => ({ id: over.id, want: over.want, failed: over.failed || false, days: over.days, drawn: over.drawn, sharp: !!over.sharp, canvas: !!(over.tex && over.tex.image && over.tex.image.getContext), box: fine.box, fineOn: +globeU.uFineOn.value.toFixed(2), shown: +globeU.uOver.value.toFixed(2) }),
  spin: on => setSpin(on),
  fine: () => ({ want: fineWant(), key: fine.key, busy: fine.busy, failed: fine.failed, still: Math.round(performance.now() - fine.still), spin: controls.autoRotate, centre: globePoint(view.w / 2, view.h / 2) }),
  /* the headless browser draws a couple of frames a second, so the glide left over from spinning would take half a minute to die away: it is run out here */
  zoomTo(d) { zoomTarget = clamp(d, controls.minDistance, controls.maxDistance); camera.position.setLength(zoomTarget); for (let i = 0; i < 300; i++) controls.update(); },
  /* how many land dots are not sitting on the globe, worked out the way the shader does it (see DOTS_VS) */
  dots() {
    let pts = null; scene.traverse(o => { if (o.isPoints && o.material.uniforms && o.material.uniforms.uBuild === introU.build) pts = o; });
    if (!pts) return null;
    const a = pts.geometry.attributes.position.array, b = introU.build.value, fr = x => x - Math.floor(x); let off = 0, worst = 0, south = 0;
    for (let i = 0; i < a.length; i += 3) { const x = a[i], y = a[i + 1], z = a[i + 2], r = Math.hypot(x, y, z), h = fr(Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453), ku = b * 2 - ((1 - y / r) * 0.5 + h * 0.5), far = Math.pow(1 - clamp(ku, 0, 1), 2.4); if (far > 1e-4) { off++; worst = Math.max(worst, far); if (y < 0) south++; } }
    return { dots: a.length / 3, offTheGround: off, inTheSouth: south, farthest: +worst.toFixed(3), build: b };
  },
  openExit(t) { if (!boot.entered) enter(); intro.freeze = -Math.max(t, 0.001); intro.last = 0; setTimeout(() => document.getAnimations().forEach(a => { try { a.pause(); a.currentTime = t * 1000; } catch (e) {} }), 120); }
});
runBoot();
