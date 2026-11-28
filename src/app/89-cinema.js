/* ============================================================
   Cinema mode, pictures, links and keys
   Cinema mode puts the panels away and leaves the planet; a picture saves what the globe shows, with the date written on it;
   a link reopens Kármán looking at the same place from the same height with the same NASA view on.
   None of it talks to the network.
   ============================================================ */
const cine = { on: false, timer: 0, time: $('#cine-time'), what: $('#cine-what') };

/* a short notice that goes away by itself */
let toastTimer = 0;
function toast(text) {
  const el = $('#toast');
  el.textContent = text; el.removeAttribute('data-off');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.setAttribute('data-off', ''), 2600);
}

/* ---------- a link to this view: #@latitude,longitude,distance,view ---------- */
function viewLink() {
  const c = camLL();
  return location.href.split('#')[0] + '#@' + c.lat.toFixed(2) + ',' + c.lon.toFixed(2) + ',' + c.dist.toFixed(2) + (over.want ? ',' + over.want : '');
}
function copyText(text) {            /* for pages a browser will not give the clipboard to, such as a file opened from disk */
  try {
    const t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.appendChild(t); t.select();
    const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch (e) { return false; }
}
function shareView() {
  const url = viewLink();
  if (view.phone && navigator.share) { navigator.share({ title: 'Kármán', text: 'The Earth right now', url }).catch(() => {}); return; }
  const done = ok => {
    if (ok) return toast('Link to this view copied');
    try { history.replaceState(null, '', url); toast('The link to this view is now in the address bar'); } catch (e) { toast('This browser would not hand over a link'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => done(true), () => done(copyText(url)));
  else done(copyText(url));
}
/* arriving by such a link: the opening sequence plays as usual, then the globe turns to the view that was shared */
const linked = (function () {
  const m = /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?(?:,([a-z0-9]+))?$/.exec(location.hash || '');
  if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return null;
  return { lat: clamp(+m[1], -84, 84), lon: +m[2], dist: m[3] ? +m[3] : 0, view: m[4] || '' };
})();
if (linked) {
  home.lat = linked.lat; home.lon = linked.lon;                     /* "Reset view" comes back here as well */
  ll(home.lat, home.lon, camera.position.length(), camera.position);
  const wait = setInterval(() => {
    if (tour.on) return clearInterval(wait);
    if (!boot.entered || performance.now() - intro.exitAt < 2600) return;
    clearInterval(wait);
    flyTo(linked.lat, linked.lon, linked.dist || view.fit);
    if (linked.view && overDef(linked.view) && over.want !== linked.view) setOverlay(linked.view);
  }, 300);
}

/* ---------- a picture of the globe as it is now ---------- */
function pictureStamp(d) { return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) + ', ' + d.toISOString().slice(11, 16) + ' UTC'; }
function savePicture() {
  let out;
  try {
    camera.updateMatrixWorld(); renderer.render(scene, camera);         /* a fresh frame: the drawing can only be read back in the moment it is made */
    const src = renderer.domElement, k = src.height / view.h, g = (out = document.createElement('canvas')).getContext('2d');
    out.width = src.width; out.height = src.height;
    g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height); g.drawImage(src, 0, 0);
    /* bottom left: the wordmark, then the moment and, if one is on, the NASA view */
    const d = new Date(), def = overDef(over.id), pad = Math.round(Math.max(18, view.h * 0.035) * k), h = Math.round(15 * k), mark = $('#wm path');
    if (mark && window.Path2D) {
      g.save(); g.translate(pad, out.height - pad - Math.round(21 * k) - h); g.scale(h / 161.9, h / 161.9);
      g.fillStyle = 'rgba(245,245,247,.92)'; g.fill(new Path2D(mark.getAttribute('d'))); g.restore();
    }
    g.font = '500 ' + Math.round(11.5 * k) + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    g.fillStyle = 'rgba(235,235,245,.62)'; g.textBaseline = 'alphabetic';
    g.fillText(pictureStamp(d) + (def ? '   ' + def.name + ', NASA' : ''), pad, out.height - pad);
    const name = 'karman-' + d.toISOString().slice(0, 10).replace(/-/g, '') + '-' + d.toISOString().slice(11, 16).replace(':', '') + 'utc.png';
    out.toBlob(b => {
      if (!b) return toast('The picture could not be made');
      const a = document.createElement('a'), url = URL.createObjectURL(b);
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast('Picture saved as ' + name);
    }, 'image/png');
  } catch (e) { toast('The picture could not be made'); }
}

/* ---------- cinema mode: the panels step aside, the planet takes the window ---------- */
function cinePoke() {
  if (!cine.on) return;
  app.classList.remove('cine-idle'); clearTimeout(cine.timer);
  cine.timer = setTimeout(() => {
    if (!cine.on) return;
    if ($('.cine-ctl:hover') || $('.cine-ctl :focus-visible')) return cinePoke();      /* never fade the buttons from under a pointer resting on them */
    app.classList.add('cine-idle');
  }, 2800);
}
function setCinema(on) {
  on = !!on && !view.phone && !tour.on && boot.entered;
  if (on === cine.on) return;
  cine.on = view.bare = on;
  app.classList.toggle('cinema', on); app.classList.remove('cine-idle');
  $('#view-cinema').setAttribute('aria-pressed', on ? 'true' : 'false');
  /* the globe may fill more of the window with the panels gone: glide to the new size rather than jump */
  const fitted = Math.abs(zoomTarget - view.fit) < 0.02, d = camera.position.length();
  resize(); camera.position.setLength(d);
  if (fitted) zoomTarget = view.fit;
  if (on) { cineTick(new Date()); cinePoke(); } else clearTimeout(cine.timer);
}
/* the caption's clock, once a second */
function cineTick(d) {
  if (!cine.on) return;
  if (tour.on || view.phone) return setCinema(false);               /* the tour has a screen of its own, and a phone has no room for this */
  cine.time.textContent = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) + '  ' + d.toISOString().slice(11, 19) + ' UTC';
  const def = overDef(over.id), text = def ? def.name + ', from NASA' : '';
  if (cine.what.textContent !== text) cine.what.textContent = text;
}
function fullScreen() {
  try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
}
window.addEventListener('pointermove', cinePoke, { passive: true });
window.addEventListener('pointerdown', cinePoke, { passive: true });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-do]');
  if (!b) return;
  const what = b.dataset.do;
  if (what === 'link') shareView(); else if (what === 'shot') savePicture(); else if (what === 'cinema') setCinema(!cine.on); else if (what === 'full') fullScreen();
});
if (!document.documentElement.requestFullscreen) $$('[data-do="full"]').forEach(b => { b.hidden = true; });

/* ---------- keys ---------- */
const KEYS = [['/', 'Search'], ['T', 'Take the live tour'], ['C', 'Hide or show the panels'], ['P', 'Save a picture'], ['L', 'Copy a link to this view'], ['F', 'Full screen'],
  ['S', 'Spin or stop the globe'], ['O', 'Pull back to see every orbit'], ['M', 'Bring the Moon into view'], ['R', 'Reset the view'], ['+  −', 'Zoom in and out'], ['Arrows', 'Turn the globe'], ['Esc', 'Close a card, or leave the tour']];
window.addEventListener('keydown', e => {
  if (tour.on) { if (cine.on) setCinema(false); return; }          /* the tour has keys of its own */
  if (!boot.entered || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
  const el = document.activeElement, tag = (el && el.tagName) || '';
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (el && el.isContentEditable)) return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key, c = camLL();
  let used = true;
  if (k === 'Escape') { if (cine.on) setCinema(false); else used = false; }
  else if (k === 'c') setCinema(!cine.on);
  else if (k === 'p') savePicture();
  else if (k === 'l') shareView();
  else if (k === 'f') fullScreen();
  else if (k === 's') setSpin(!controls.autoRotate);
  else if (k === 'o') $('#view-orbits').click();
  else if (k === 'm') { selectMoon(); seeMoon(); }
  else if (k === 'r') $('#view-reset').click();
  else if (k === '+' || k === '=') zoomBy(0.6);
  else if (k === '-' || k === '_') zoomBy(1.7);
  else if (/^Arrow/.test(k) && !(el && el.closest && el.closest('.scroll, .search, [role="listbox"]'))) {       /* not when a list that scrolls has the arrows */
    const step = clamp(40 * (c.dist - 1) / (view.fit - 1), 2, 40);              /* smaller steps when close in */
    flyTo(clamp(c.lat + (k === 'ArrowUp' ? step * 0.6 : k === 'ArrowDown' ? -step * 0.6 : 0), -84, 84), wrapLon(c.lon + (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0)), c.dist);
  } else used = false;
  if (used) e.preventDefault();
});
$('#tab-guide').insertAdjacentHTML('beforeend', '<h3>The sky</h3><ul class="how">' +
  '<li>The stars are the real ones: all ' + num(sky.stars.geometry.attributes.position.count) + ' that the eye can see under a dark sky, in their true places, colours and brightness. They wheel once a day, as they do overhead.</li>' +
  '<li><b>The Moon</b> is where it really is, at its real distance, lit by the Sun, so it shows tonight’s phase. Click it, or its row under Right now, for when it is next full or new.</li>' +
  '<li>The glare of <b>the Sun</b> marks where the Sun is. Pull back and look from the night side to see it rise past the edge of the Earth.</li>' +
  '<li>Click any place to see when a <b>space station</b> will next cross its sky as a bright moving light.</li></ul>' +
  '<h3>Pictures, links and keys</h3><ul class="how">' +
  '<li>The three buttons beside the spin button copy a link to exactly this view, save a picture of the globe, and hide the panels so only the planet is left.</li></ul>' +
  '<dl class="keys">' + KEYS.map(r => '<div><dt>' + r[0].split('  ').map(x => '<kbd>' + esc(x) + '</kbd>').join(' ') + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('') + '</dl>');
