/* ============================================================
   NASA satellite views draped over the globe (GIBS)
   A view is one picture of the whole Earth, built here from one or more of NASA's (OVERLAYS in 00-core.js says which).
   Zoomed in, a second, sharper picture of just the area on screen is laid over it (the "fine" window).
   NASA answers a day it has nothing for with an empty picture, or with an error; both are read as "nothing that day".
   ============================================================ */
const GIBS = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&STYLES=&TRANSPARENT=TRUE&SRS=EPSG:4326';
const WORLD = [-180, -90, 180, 90], OVER_W = 2048, OVER_H = 1024, OVER_SOME = 0.002;
const over = { id: '', want: '', tex: null, drawn: [], days: [], newest: {}, run: 0, answered: 0, refused: 0 };
const overDef = id => OVERLAYS.find(o => o.id === id && id);
const utcDay = back => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
const dayBack = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

/* A finished day is asked for again only every three hours, so the browser keeps its copy; today's passes and "newest" every half hour. */
function gibsURL(layers, day, box, w, h, fmt) {
  const stamp = Math.floor(Date.now() / (day && day !== utcDay(0) ? 10800000 : 1800000));
  return GIBS + '&LAYERS=' + layers + '&FORMAT=image/' + (fmt || 'png') + '&BBOX=' + box.join(',') + '&WIDTH=' + w + '&HEIGHT=' + h + (day ? '&TIME=' + day : '') + '&_=' + stamp;
}
/* how much of a picture has anything in it, judged from a thumbnail: 0 is empty, 1 is full. A photograph (JPEG) has no see-through parts, so there "nothing" is black. */
const overPad = document.createElement('canvas'); overPad.width = 64; overPad.height = 32;
function coverOf(im, photo) {
  try {
    const c = overPad.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, 64, 32); c.drawImage(im, 0, 0, 64, 32);
    const d = c.getImageData(0, 0, 64, 32).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (photo ? d[i] > 12 || d[i + 1] > 12 || d[i + 2] > 12 : d[i + 3] > 2) n++;
    return n / 2048;
  } catch (e) { return 1; }
}
/* one picture from NASA as { im, cover, day }, or null when it did not come */
const overLoad = (layers, day, box, w, h, fmt) => loadImage(gibsURL(layers, day, box, w, h, fmt), true).then(im => { over.answered++; return { im, cover: coverOf(im, fmt === 'jpeg'), day }; }, () => { over.refused++; return null; });
/* the newest day NASA has anything for, found from thumbnails of the last fortnight and remembered for three hours */
function overNewest(layers) {
  const had = over.newest[layers];
  if (had && Date.now() - had.at < 10800000) return Promise.resolve(had.day);
  const days = []; for (let k = 0; k <= 14; k++) days.push(utcDay(k));
  return Promise.all(days.map(d => overLoad(layers, d, WORLD, 64, 32))).then(a => {
    const hit = a.find(x => x && x.cover > OVER_SOME), day = hit ? hit.day : '';
    if (a.some(x => x)) over.newest[layers] = { day, at: Date.now() };              /* not remembered if nothing came back at all: that is the network, not NASA */
    return day;
  });
}
/* the pictures for one set of layers, oldest first; empty when NASA has nothing recent */
async function overSet(layers, days, seek, fmt) {
  if (!days) { const x = await overLoad(layers, '', WORLD, OVER_W, OVER_H, fmt); return x && x.cover > OVER_SOME ? [x] : []; }
  const stack = async last => {
    const want = []; for (let k = days - 1; k >= 0; k--) want.push(dayBack(last, k));
    return (await Promise.all(want.map(d => overLoad(layers, d, WORLD, OVER_W, OVER_H, fmt)))).filter(x => x && x.cover > OVER_SOME);
  };
  if (!seek) { const got = await stack(utcDay(0)); if (got.length) return got; }          /* nothing today or yesterday: NASA is behind, so look further back */
  const last = await overNewest(layers);
  return last ? stack(last) : [];
}
/* one part of a view. If a request naming several layers fails outright (one of them has been withdrawn), each is asked for by itself. */
async function overPart(part, fmt) {
  const spare = part[3] ? [].concat(part[3]) : null;                                /* a name, or [name, days] when it needs a different number of days */
  for (const set of [[part[0], part[1]], spare && [spare[0], spare.length > 1 ? spare[1] : part[1]]]) {
    if (!set) continue;
    const layers = set[0], days = set[1] | 0, refused = over.refused;
    const pics = await overSet(layers, days, part[2], fmt);
    if (pics.length) return [{ layers, pics }];
    if (layers.indexOf(',') > 0 && over.refused > refused) {                        /* refused, not merely empty: asking one at a time can help */
      const each = (await Promise.all(layers.split(',').map(async l => ({ layers: l, pics: await overSet(l, days, part[2], fmt) })))).filter(x => x.pics.length);
      if (each.length) return each;
    }
  }
  return [];
}
/* Recolourings, for measurements NASA paints across the whole globe in colours meant for a white map: left as they come, they hide
   the planet under a sheet of the "almost none" colour. Each takes straight RGBA pixels and clears that sheet, keeping the rest.
   The numbers come from NASA's colour tables for these layers (which shade stands for which amount), and every test is narrow:
   a pixel that is not in the colours expected is left exactly as it came. */
const OVER_TONE = {
  /* nitrogen dioxide: pale yellow (clean air) through orange to dark red, on a scale where green falls as the gas rises.
     Below 2.5e15 molecules per square centimetre (green 233) is cleared, which is where 97% of the planet sits; full colour from 5.5e15. */
  no2(d) {
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 249 && d[i + 1] > 200 && d[i + 2] < 205) d[i + 3] *= clamp((233 - d[i + 1]) / 22, 0, 1);
  },
  /* haze: the same family of colours. An optical depth under about 0.08 (green 235), a clear day, is cleared; full colour from about 0.2. */
  haze(d) {
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] > 249 && d[i + 1] > 185 && d[i + 2] < 210) d[i + 3] *= clamp((235 - d[i + 1]) / 45, 0, 1);
  },
  /* volcanic gas: a dark blue sheet that pales with the amount. Under 1 Dobson unit (green 40) is cleared; the rest runs sulphur yellow to white at 32. */
  so2(d) {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (!d[i + 3] || r > g + 4 || g > b + 4) continue;
      const k = clamp((g - 42) / 10, 0, 1), t = clamp((g - 40) / 211, 0, 1);
      d[i] = 255; d[i + 1] = 196 + 59 * t; d[i + 2] = 15 + 240 * t * t; d[i + 3] *= k * Math.min(1, 0.55 + 2.4 * t);
    }
  },
  /* night lights: white on black. The black is cleared so only the light is laid on the globe, in the colour of a street lamp. */
  lights(d) {
    for (let i = 0; i < d.length; i += 4) {
      const v = d[i];
      if (!d[i + 3] || Math.abs(v - d[i + 1]) > 8 || Math.abs(v - d[i + 2]) > 8) continue;
      const k = clamp((v - 44) / 120, 0, 1);
      d[i] = 255; d[i + 1] = 214 + 36 * k; d[i + 2] = 150 + 92 * k; d[i + 3] *= k * (2 - k);
    }
  },
  /* sea ice: open water comes as near-black, which would blot out the sea */
  ice(d) {
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && d[i] < 40 && d[i + 1] < 40 && d[i + 2] < 40) d[i + 3] = 0;
  },
  /* floods: "could not be seen" comes as solid grey over much of the land; it is thinned so the water stands out */
  flood(d) {
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && Math.abs(d[i] - 175) < 14 && Math.abs(d[i + 1] - 175) < 14 && Math.abs(d[i + 2] - 175) < 14) d[i + 3] *= 0.3;
  },
  /* a photograph: where the satellite has not been yet is black. Cleared, so the day underneath shows through; the soft step hides the dark fringe at the edge of a pass. */
  unseen(d) {
    for (let i = 0; i < d.length; i += 4) d[i + 3] *= clamp((Math.max(d[i], d[i + 1], d[i + 2]) - 6) / 18, 0, 1);
  }
};
/* run a recolouring over a canvas a strip at a time, so the globe keeps moving; false if the view changed meanwhile */
async function overToned(c, w, h, tone, live) {
  for (let y = 0; y < h; y += 128) {
    const n = Math.min(128, h - y), px = c.getImageData(0, y, w, n);
    tone(px.data); c.putImageData(px, 0, y);
    await new Promise(r => setTimeout(r, 0));
    if (!live()) return false;
  }
  return true;
}
/* Lay pictures over each other, oldest at the bottom, and recolour the result if the view asks for it.
   A single picture that needs no recolouring is used as it came. Photographs are cut out first, each on a spare canvas. */
let overSpare = null;
async function overCompose(pics, w, h, def, live) {
  const tone = OVER_TONE[def.tone], photo = def.fmt === 'jpeg';
  if (pics.length === 1 && !tone) return pics[0].im;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: !!tone });
  for (let i = 0; i < pics.length; i++) {
    if (!photo || !i) { c.drawImage(pics[i].im, 0, 0, w, h); continue; }
    if (!overSpare) { overSpare = document.createElement('canvas'); overSpare.width = w; overSpare.height = h; }
    const sc = overSpare.getContext('2d', { willReadFrequently: true });
    sc.clearRect(0, 0, w, h); sc.drawImage(pics[i].im, 0, 0, w, h);
    if (!(await overToned(sc, w, h, OVER_TONE.unseen, live))) return null;
    c.drawImage(overSpare, 0, 0);
  }
  if (tone && !(await overToned(c, w, h, tone, live))) return null;
  return cv;
}
/* a canvas holds its colours already multiplied by their opacity, which is how the globe's shader wants them */
function overTexture(src, clampEdge) {
  const t = tuneTexture(new THREE.Texture(src));
  if (src.getContext) t.premultiplyAlpha = true;
  if (clampEdge) t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}
/* "19 November", "19 and 20 November", "18 to 20 November", "30 November and 1 December" */
function overWhen(days) {
  const u = Array.from(new Set(days)).sort(); if (!u.length) return '';
  const f = (d, m) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', m ? { day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' });
  if (u.length === 1) return f(u[0], 1);
  const a = u[0], b = u[u.length - 1], same = a.slice(0, 7) === b.slice(0, 7);
  return f(a, !same) + (u.length === 2 ? ' and ' : ' to ') + f(b, 1);
}
function paintLegend() {
  const el = $('#legend'), def = overDef(over.want);
  el.hidden = !def;
  if (!def) return;
  const on = over.id === over.want, when = on ? overWhen(over.days || []) : '';
  const scale = def.bar ? '<span class="lg-bar"><i style="background:linear-gradient(90deg,' + def.bar[0] + ')"></i><em>' + def.bar[1] + '</em><em>' + def.bar[2] + '</em></span>'
    : def.keys ? '<span class="lg-keys">' + def.keys.map(k => '<em><i style="background:' + k[0] + '"></i>' + k[1] + '</em>').join('') + '</span>' : '';
  el.innerHTML = '<span class="lg-text"><b>' + def.name + (on ? '' : over.failed ? ' could not be loaded' : ' <i class="spin"></i>') + '</b><span>' +
    (over.failed === 'none' ? 'NASA has published nothing for this view in the last two weeks. Pick another, or try again later.' : over.failed ? 'NASA’s image service did not answer. Pick the view again to retry.' : def.text) + '</span>' + (over.failed ? '' : scale) +
    '<small>NASA GIBS' + (!on ? '' : ', ' + (when ? (over.days.length > 1 ? 'passes of ' : '') + when : 'newest available') + (over.sharp ? ', sharpened for this area' : '')) + '</small></span>' +
    '<button class="icon-btn" data-act="overlay-off" aria-label="Turn this view off" title="Turn this view off"><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M3 3l8 8M11 3l-8 8"/></svg></button>';
}
function setOverlay(id, refresh) {
  const def = overDef(id); id = def ? id : '';
  prefs.overlay = id; savePrefs(); over.want = id; over.failed = false; over.answered = 0;
  const run = ++over.run, live = () => over.run === run;
  const pick = $('#overlay-pick'); if (pick && pick.value !== id) { pick.value = id; pick.closest('.layer').classList.toggle('off', !id); }
  if (!id) { over.id = ''; fineDrop(); setCount('overlay', ''); setStatus('gibs', 'off'); return paintLegend(); }
  if (refresh && over.id === id) over.keep = true; else { over.id = ''; fineDrop(); }
  paintLegend(); setStatus('gibs', 'load');
  const el = $('#count-overlay'); if (el) el.innerHTML = '<i class="spin"></i>';
  try { sched.overlay.next = Date.now() + sched.overlay.every; } catch (e) {}
  return Promise.all(def.parts.map(p => overPart(p, def.fmt))).then(async parts => {
    if (!live()) return;
    const drawn = [].concat(...parts), pics = [].concat(...drawn.map(x => x.pics));
    if (!pics.length) throw new Error(over.answered ? 'none' : 'down');                /* empty pictures came back, or nothing did */
    const src = await overCompose(pics, OVER_W, OVER_H, def, live);
    if (!live() || !src) return;
    const t = overTexture(src), old = over.tex;
    over.tex = t; globeU.tOver.value = t; over.id = id;
    over.drawn = drawn.map(x => ({ layers: x.layers, days: x.pics.map(p => p.day) }));
    over.days = [].concat(...over.drawn.map(x => x.days)).filter(Boolean);
    if (old) setTimeout(() => old.dispose(), 1500);
    fine.key = fine.failed = '';                                                    /* the sharper window is fetched again from the same days */
    setCount('overlay', ''); setStatus('gibs', 'ok'); paintLegend();
  }).catch(e => {
    if (!live()) return;
    const none = e && e.message === 'none';
    if (!over.keep) { over.id = ''; over.failed = none ? 'none' : true; }
    setCount('overlay', over.keep ? '' : '–'); setStatus('gibs', none ? 'warn' : 'err', none ? 'nothing recent for this view' : 'the image did not load'); paintLegend();
  }).then(() => { if (live()) over.keep = false; });
}

/* ---------- the sharper window ----------
   The whole-Earth picture has one dot every 20 km. Once the globe is still and close enough for those dots to show, the same
   layers are asked for again over just the area on screen, in a window from a fixed set of sizes snapped to a grid (so a small
   nudge of the view asks for nothing new). It fades in over the coarse picture and is dropped when the view moves on. */
const FINE_SPANS = [180, 90, 45, 22.5, 11.25];
const fine = { key: '', tex: null, box: null, busy: false, still: 0, x: 0, y: 0, z: 0, failed: '' };
function fineDrop() {
  fine.key = fine.failed = ''; fine.box = null; over.sharp = false; globeU.uFineOn.value = 0;
  if (fine.tex) { const t = fine.tex; fine.tex = null; globeU.tFine.value = blank; setTimeout(() => t.dispose(), 400); }
}
/* the window that suits the view right now: [west, south, east, north], or null when the whole-Earth picture is sharp enough */
function fineWant() {
  const def = overDef(over.id);
  if (!def || !def.fine || over.id !== over.want || tour.on || !boot.entered || controls.autoRotate || document.hidden) return null;
  const g = globePoint(view.w / 2, view.h / 2); if (!g) return null;
  const perDeg = view.h / (2 * Math.tan(camera.fov * D2R / 2)) / (camera.position.length() - 1) * D2R;          /* screen pixels per degree at the centre */
  if (perDeg * 360 / OVER_W < 1.6) return null;
  const hx = view.w / 2 / perDeg / Math.max(0.2, Math.cos(g.lat * D2R)), hy = view.h / 2 / perDeg;
  /* the smallest window that still covers the screen with a margin, allowing for the snap to the grid below */
  let span = 0; for (const sp of FINE_SPANS) if (sp >= def.fine && sp * 0.4375 >= hx * 1.1 && sp * 0.21875 >= hy * 1.1) span = sp;
  if (!span) return null;
  const west = clamp(Math.round((g.lon - span / 2) / (span / 8)) * (span / 8), -180, 180 - span), south = clamp(Math.round((g.lat - span / 4) / (span / 16)) * (span / 16), -90, 90 - span / 2);
  return [west, south, west + span, south + span / 2];
}
/* called every frame; does nothing unless a view is on, the globe has been still for half a second and it wants a window it does not have */
function stepFine(now) {
  if (!over.id && !fine.box) return;
  const p = camera.position;
  if (Math.abs(p.x - fine.x) + Math.abs(p.y - fine.y) + Math.abs(p.z - fine.z) > 1e-5) { fine.x = p.x; fine.y = p.y; fine.z = p.z; fine.still = now; return; }
  if (now - fine.still < 500 || fine.busy) return;
  fine.still = now;
  const box = over.id ? fineWant() : null, key = box ? over.id + '|' + box.join(',') : '';
  if (key === fine.key || (key && key === fine.failed)) return;
  if (!box) { fine.key = ''; fine.box = null; if (over.sharp) { over.sharp = false; paintLegend(); } return; }          /* fades out; see FADES in 90-main.js */
  const def = overDef(over.id), run = over.run, live = () => over.run === run && over.id === def.id;
  fine.busy = true;
  Promise.all([].concat(...over.drawn.map(x => x.days.map(d => overLoad(x.layers, d, box, OVER_W, OVER_H, def.fmt))))).then(async got => {
    const pics = got.filter(x => x && x.cover > 0);
    if (!live()) return;
    if (!pics.length) { fine.failed = key; return; }
    const src = await overCompose(pics, OVER_W, OVER_H, def, live);
    if (!live() || !src) return;
    const old = fine.tex;
    if (!fine.box) globeU.uFineOn.value = 0;                                        /* a first window fades in; one that replaces another just takes its place */
    fine.tex = overTexture(src, true); fine.key = key; fine.box = box; fine.failed = '';
    globeU.tFine.value = fine.tex;
    globeU.uFine.value.set((box[0] + 180) / 360, (box[1] + 90) / 180, 360 / (box[2] - box[0]), 180 / (box[3] - box[1]));
    if (old) setTimeout(() => old.dispose(), 400);
    if (!over.sharp) { over.sharp = true; paintLegend(); }
  }).catch(() => { fine.failed = key; }).then(() => { fine.busy = false; });
}
