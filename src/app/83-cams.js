/* ============================================================
   Live cameras: public roadside cameras that transport agencies publish as open data.
   California plays live video, London a clip from the last few minutes, Finland can replay the past day
   picture by picture, and Singapore sends a fresh picture every minute.
   ============================================================ */
const camName = n => { const p = String(n || '').split('_'), road = (p[0].match(/\d+/) || [''])[0]; return p.length > 1 ? p.slice(1).join(' ') + (road ? ', road ' + road : '') : String(n || 'Camera'); };
const CAM_NETS = 4;
async function camsCalifornia(items) {
  /* Caltrans lists every highway camera; the ones kept here are those with a live video stream */
  const base = 'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/CCTV/MapServer/0/query?outFields=' + encodeURIComponent('locationName,nearbyPlace,county,longitude,latitude,direction,inService,streamingVideoURL,currentImageUpdateFrequency,currentImageURL') +
    '&returnGeometry=false&orderByFields=OBJECTID&resultRecordCount=2000&f=json&where=';
  let rows = [], where = "streamingVideoURL LIKE 'http%'";
  for (let off = 0; off < 8000; off += 2000) {
    let d = await getJSON(base + encodeURIComponent(where) + '&resultOffset=' + off, 30000, false, off ? null : KEEP);
    if (d.error && !off && where !== '1=1') { where = '1=1'; d = await getJSON(base + encodeURIComponent(where) + '&resultOffset=0', 30000); }      /* if the server will not filter, take everything and filter here */
    if (d.error) throw new Error('refused');
    const f = d.features || []; rows = rows.concat(f);
    if (!d.exceededTransferLimit || !f.length) break;
  }
  const found = [];
  for (const f of rows) {
    const a = f.attributes || {}, live = safeUrl(String(a.streamingVideoURL || '').trim().replace(/^http:/i, 'https:')), img = safeUrl(String(a.currentImageURL || '').trim().replace(/^http:/i, 'https:'));
    if (!live || !/\.m3u8(\?|$)/i.test(live) || !img || /^false$/i.test(String(a.inService)) || !isFinite(+a.latitude) || !isFinite(+a.longitude) || !+a.latitude) continue;
    const name = String(a.locationName || 'Highway camera').replace(/\s*\([A-Z]?\d+\)\s*$/, '').replace(/\s*:\s*/, ', ').replace(/\s+-\s+Looking.*$/i, '').trim(), mins = +a.currentImageUpdateFrequency;
    found.push({ id: 'ca' + found.length + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40), title: name.slice(0, 70), place: [a.nearbyPlace, 'California'].filter(Boolean).join(', '), view: a.direction ? String(a.direction).toLowerCase() : '',
      img, live, by: 'Caltrans, the California Department of Transportation', every: mins > 0 ? 'every ' + (mins === 1 ? 'minute' : mins + ' minutes') : 'every few minutes', home: 'https://quickmap.dot.ca.gov/', lat: +a.latitude, lon: +a.longitude });
  }
  const step = Math.max(1, Math.ceil(found.length / 900));                    /* a state full of cameras is thinned so it does not bury the map */
  for (let i = 0; i < found.length; i += step) items.push(found[i]);
}
async function loadCams() {
  setStatus('cams', 'load');
  const items = []; let ok = 0, err = null;
  try {
    const d = await getJSON('https://tie.digitraffic.fi/api/weathercam/v1/stations', 30000, false, KEEP);
    for (const f of d.features || []) {
      const p = f.properties || {}, c = f.geometry && f.geometry.coordinates, pre = (p.presets || []).find(x => x.inCollection);
      if (!c || !pre || (p.collectionStatus && p.collectionStatus !== 'GATHERING')) continue;
      items.push({ id: 'fi' + f.id, title: camName(p.name), place: 'Finland', img: 'https://weathercam.digitraffic.fi/' + encodeURIComponent(pre.id) + '.jpg', preset: pre.id, hist: 'https://tie.digitraffic.fi/api/weathercam/v1/stations/' + encodeURIComponent(f.id) + '/history',
        tz: 'Europe/Helsinki', by: 'Fintraffic', every: 'about every 10 minutes', home: 'https://liikennetilanne.fintraffic.fi/', lat: +c[1], lon: +c[0] });
    }
    ok++;
  } catch (e) { err = e; }
  try {
    const d = await getJSON('https://api.tfl.gov.uk/Place/Type/JamCam', 40000, false, KEEP);
    for (const p of d) {
      const ap = {}; for (const a of p.additionalProperties || []) ap[a.key] = a.value;
      if (ap.available !== 'true' || !safeUrl(ap.imageUrl) || !isFinite(+p.lat)) continue;
      items.push({ id: 'ldn' + p.id, title: p.commonName, place: 'London', view: ap.view, img: ap.imageUrl, video: safeUrl(ap.videoUrl), by: 'Transport for London', every: 'every few minutes', home: 'https://tfl.gov.uk/traffic/status/', lat: +p.lat, lon: +p.lon });
    }
    ok++;
  } catch (e) { err = e; }
  try { camsSingapore(await getJSON('https://api.data.gov.sg/v1/transport/traffic-images', 20000), items); ok++; } catch (e) { err = e; }
  try { await camsCalifornia(items); ok++; } catch (e) { err = e; }
  applyItems('cams', items.map(c => Object.assign(c, { layer: 'cams', v: ll(c.lat, c.lon, 1.0035), size: c.live || c.video ? 3.9 : 3.6, alpha: 0.85 })));
  ok === CAM_NETS ? setStatus('cams', 'ok') : ok ? setStatus('cams', 'warn', ok + ' of ' + CAM_NETS + ' camera networks reachable') : setStatus('cams', 'err', errNote(err));
}
function camsSingapore(d, items) {
  for (const c of (d.items && d.items[0] && d.items[0].cameras) || []) {
    const l = c.location || {}; if (!safeUrl(c.image) || !isFinite(+l.latitude)) continue;
    items.push({ id: 'sg' + c.camera_id, title: 'Expressway camera ' + c.camera_id, place: 'Singapore', img: c.image, fresh: true, taken: Date.parse(c.timestamp) || Date.now(), by: 'Land Transport Authority of Singapore', every: 'about every minute',
      home: 'https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html', lat: +l.latitude, lon: +l.longitude });
  }
}

/* ---------- the viewer in a camera's card ---------- */
const cam = { it: null, mode: 'still', state: 'idle', hls: null, lib: null, timer: 0, token: 0, clip: 0, sgAt: 0, sgBusy: false };
const camSrc = it => it.img + (it.fresh ? '' : (it.img.includes('?') ? '&' : '?') + 't=' + Math.floor(Date.now() / 60000));
/* what a camera can show beyond its latest picture: [kind, the button's words, the label on the picture] */
const camOffer = it => (it.live ? ['live', 'Watch live', 'Live'] : it.video ? ['clip', 'Play the latest clip', 'Latest clip'] : it.hist ? ['lapse', 'Replay the past 24 hours', 'Past 24 hours'] : null);
DETAILS.cams = it => {
  const offer = camOffer(it);
  return {
    title: '<div class="cam-stage" id="cam-stage" data-mode="still" data-state="idle">' +
      '<img id="cam-img" src="' + esc(camSrc(it)) + '" alt="Latest picture from this camera" onerror="this.classList.add(\'gone\')" onload="this.classList.remove(\'gone\')">' +
      '<video id="cam-video" muted playsinline hidden></video>' +
      '<span class="cam-tag"><i></i><b id="cam-word">Latest picture</b></span><span class="cam-clock mono" id="cam-clock"></span>' +
      '<button class="cam-full" data-cam="full" aria-label="Fill the screen" title="Fill the screen"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.500 5V1.500H5M9 1.500h3.500V5M12.500 9v3.500H9M5 12.500H1.500V9"/></svg></button></div>' +
      '<div class="big word">' + esc(it.title) + '</div><p>' + esc(it.view ? it.place + ', looking ' + it.view : it.place) + '</p>' +
      '<div class="tuner">' + (offer ? '<button class="btn primary" data-cam="play" id="cam-play">' + offer[1] + '</button>' : '') + '<button class="btn" data-cam="next">Another camera</button></div><p class="cam-note" id="cam-note" aria-live="polite"></p>',
    rows: [
      ['There right now', SK(150), slotAttr('there')],
      ['Shows', esc(it.live ? 'Live video, and a picture ' + it.every : it.video ? 'A short clip and a picture, renewed ' + it.every : 'A new picture ' + it.every)],
      ['Operated by', esc(it.by)],
      ['Location', esc(fmtLL(it.lat, it.lon))]
    ],
    actions: link(it.home, 'More from this network')
  };
};
function camPaint(mode, state, note) {
  cam.mode = mode; cam.state = state;
  const stage = $('#cam-stage'); if (!stage || !cam.it) return;
  const offer = camOffer(cam.it), play = $('#cam-play');
  stage.dataset.mode = mode; stage.dataset.state = state;
  $('#cam-word').textContent = mode === 'live' ? (state === 'on' ? 'Live' : 'Connecting') : mode === 'clip' ? (state === 'on' ? 'Latest clip' : 'Loading the clip') : mode === 'lapse' ? offer[2] : 'Latest picture';
  if (play && offer) play.textContent = mode === 'still' ? offer[1] : mode === 'lapse' ? 'Back to now' : 'Stop';
  $('#cam-video').hidden = !(mode === 'live' || mode === 'clip');
  if (mode !== 'lapse') $('#cam-clock').textContent = '';
  if (note != null) $('#cam-note').textContent = note;
}
function camStop() {
  cam.token++; clearTimeout(cam.timer); cam.timer = 0;
  if (cam.hls) { try { cam.hls.destroy(); } catch (e) {} cam.hls = null; }
  const v = $('#cam-video');
  if (v) { v.onplaying = v.onerror = null; try { v.pause(); } catch (e) {} if (v.getAttribute('src')) { v.removeAttribute('src'); try { v.load(); } catch (e) {} } }
}
/* the player for live streams, fetched the first time one is opened; Safari plays these streams by itself and never needs it */
function camPlayer() {
  if (!cam.lib) cam.lib = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.light.min.js';
    s.onload = () => (window.Hls ? res(window.Hls) : rej(new Error('no player'))); s.onerror = () => { cam.lib = null; rej(new Error('no player')); };
    document.head.appendChild(s);
  });
  return cam.lib;
}
function camStart() {
  const it = cam.it, offer = it && camOffer(it), v = $('#cam-video'); if (!offer || !v) return;
  camStop(); const my = cam.token;
  const back = why => { if (my !== cam.token) return; camStop(); camPaint('still', 'idle', why); const im = $('#cam-img'); if (im) im.src = camSrc(it); };
  const go = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
  v.muted = true; v.autoplay = true;
  if (offer[0] === 'clip') {
    camPaint('clip', 'wait', ''); cam.clip = Math.floor(Date.now() / 180000);
    v.loop = true; v.onplaying = () => { if (my === cam.token) camPaint('clip', 'on', ''); }; v.onerror = () => back('The clip would not play here, so this is the latest picture.');
    v.src = it.video + (it.video.includes('?') ? '&' : '?') + 't=' + cam.clip; go();
    cam.timer = setTimeout(() => { if (my === cam.token && cam.state !== 'on') back('The clip did not load, so this is the latest picture.'); }, 20000);
  } else if (offer[0] === 'live') {
    camPaint('live', 'wait', ''); v.loop = false;
    v.onplaying = () => { if (my === cam.token) { clearTimeout(cam.timer); camPaint('live', 'on', ''); } };
    cam.timer = setTimeout(() => { if (my === cam.token && cam.state !== 'on') back('The live stream did not start, so this is the latest picture.'); }, 25000);
    /* the stream player first, wherever the browser can run it; the browser's own player where it cannot (iPhones), or if the player cannot be fetched */
    const own = () => {
      if (my !== cam.token) return;
      if (!v.canPlayType('application/vnd.apple.mpegurl')) return back('Live video could not start in this browser, so this is the latest picture.');
      v.onerror = () => back('The live stream would not play here, so this is the latest picture.'); v.src = it.live; go();
    };
    if (!(window.MediaSource || window.ManagedMediaSource)) own();
    else camPlayer().then(Hls => {
      if (my !== cam.token) return;
      if (!Hls.isSupported()) return own();
      const h = cam.hls = new Hls({ maxBufferLength: 12, backBufferLength: 10, liveSyncDurationCount: 3 });
      h.on(Hls.Events.ERROR, (ev, data) => { if (data && data.fatal) back('The live stream is not answering, so this is the latest picture.'); });
      h.on(Hls.Events.MANIFEST_PARSED, go);
      h.loadSource(it.live); h.attachMedia(v);
    }).catch(own);
  } else camLapse(my, back);
}
/* Finland keeps a day of pictures for each camera: fetch a spread of them and flip through, oldest to newest, holding on the newest */
async function camLapse(my, back) {
  const it = cam.it; camPaint('lapse', 'wait', 'Fetching the past day…');
  let list = [];
  try {
    const d = await getJSON(it.hist, 20000), p = (d.presets || []).find(x => x.id === it.preset) || (d.presets || [])[0];
    const h = ((p && p.history) || []).filter(x => safeUrl(x.imageUrl) && isFinite(Date.parse(x.lastModified))).sort((a, b) => Date.parse(a.lastModified) - Date.parse(b.lastModified));
    const step = Math.max(1, Math.round(h.length / 36));
    for (let i = (h.length - 1) % step; i < h.length; i += step) list.push({ src: h[i].imageUrl, t: Date.parse(h[i].lastModified), ok: false });
  } catch (e) {}
  if (my !== cam.token) return;
  if (list.length < 4) return back('Earlier pictures are not available for this camera right now.');
  let next = 0, busy = 0, got = 0, at = -1;
  const fmt = t => new Date(t).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: it.tz || 'UTC' });
  const pump = () => {
    while (my === cam.token && next < list.length && busy < 4) {
      const f = list[next++], im = new Image(); busy++;
      im.onload = () => { f.ok = true; got++; busy--; note(); pump(); }; im.onerror = () => { busy--; note(); pump(); };
      im.src = f.src; f.im = im;                 /* kept, so the browser holds the picture ready */
    }
  };
  const note = () => { if (my === cam.token && cam.mode === 'lapse') $('#cam-note').textContent = next < list.length || busy ? 'Loaded ' + got + ' of ' + list.length + ' pictures' : ''; };
  const tick = () => {
    if (my !== cam.token || cam.mode !== 'lapse') return;
    const img = $('#cam-img'), clock = $('#cam-clock'); if (!img) return;
    let n = at;
    for (let k = 1; k <= list.length; k++) { const j = (at + k) % list.length; if (list[j].ok) { n = j; break; } }
    if (n !== at && n >= 0) { at = n; img.src = list[n].src; clock.textContent = fmt(list[n].t) + (it.tz ? ' there' : ''); if (cam.state !== 'on' && got >= 4) camPaint('lapse', 'on', null); }
    const last = list.map(f => f.ok).lastIndexOf(true);
    cam.timer = setTimeout(tick, at === last && got > 3 ? 1700 : got < 4 ? 300 : 190);
  };
  pump(); tick();
}
function camNext() {
  const all = layers.cams.items; if (!all.length) return;
  const moving = all.filter(x => (x.live || x.video) && x !== cam.it), pool = moving.length ? moving : all.filter(x => x !== cam.it);
  if (!pool.length) return;
  let it = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 8 && cam.it && it.place === cam.it.place; i++) it = pool[Math.floor(Math.random() * pool.length)];      /* hop to another city when there is one */
  select(it);
}
function camFull() {
  const s = $('#cam-stage'), v = $('#cam-video'); if (!s) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) return (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  const ask = s.requestFullscreen || s.webkitRequestFullscreen;
  if (ask) { const p = ask.call(s); if (p && p.catch) p.catch(() => {}); } else if (v && !v.hidden && v.webkitEnterFullscreen) v.webkitEnterFullscreen();
}
/* a camera's card opens: start what moves by itself (live video, the latest clip); the past day waits to be asked for */
function camOpen(it) {
  camStop(); cam.it = it; cam.mode = 'still'; cam.state = 'idle';
  const offer = camOffer(it);
  if (offer && offer[0] !== 'lapse' && !reduceMotion) camStart();
}
function camClose() { camStop(); cam.it = null; cam.mode = 'still'; cam.state = 'idle'; }
function camClick(e) {
  const el = e.target.closest('[data-cam]'); if (!el) return false;
  const a = el.dataset.cam;
  if (a === 'next') camNext();
  else if (a === 'full') camFull();
  else if (a === 'play' && cam.it) { if (cam.mode === 'still') camStart(); else { camStop(); camPaint('still', 'idle', ''); const im = $('#cam-img'); if (im) im.src = camSrc(cam.it); } }
  return true;
}
liveFns.push(() => {                                 /* keep the open camera fresh */
  const it = selected && selected.layer === 'cams' ? selected : null, im = it && $('#cam-img'); if (!im) return;
  if (cam.mode === 'still' && !it.fresh) { const src = camSrc(it); if (im.getAttribute('src') !== src) im.src = src; }
  if (cam.mode === 'clip' && cam.state === 'on' && Math.floor(Date.now() / 180000) !== cam.clip) camStart();      /* London renews its clips every few minutes */
  if (it.fresh && cam.mode === 'still' && !cam.sgBusy && Date.now() - cam.sgAt > 55000) {          /* Singapore: ask for the newest pictures once a minute while one is open */
    cam.sgBusy = true; cam.sgAt = Date.now();
    getJSON('https://api.data.gov.sg/v1/transport/traffic-images', 15000).then(d => {
      const now = []; camsSingapore(d, now);
      for (const n of now) { const old = layers.cams.items.find(x => x.id === n.id); if (old) { old.img = n.img; old.taken = n.taken; } }
      const pic = selected === it && $('#cam-img'); if (pic && cam.mode === 'still' && pic.getAttribute('src') !== it.img) pic.src = it.img;
    }).catch(() => {}).then(() => { cam.sgBusy = false; });
  }
});
