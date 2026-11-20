/* ============================================================
   The opening, with a few things added. The assembly sequence in the scene and wiring files is untouched: the globe is
   framed and built exactly as before. Everything here is laid over it.

   A faint field of stars drifts behind the planet. A spark runs once round the ring as it appears, light races round the
   edge of the planet as its atmosphere comes on, and every feed that lands sends a pulse down a spoke into the globe. When
   the planet goes live the ring flares, a shock of light crosses the surface, the stars surge once, and they are gone.
   The words are kept to a minimum: one large figure for how far along it is, and the last few feeds to arrive.
   ============================================================ */
const opening = { on: !reduceMotion, gone: reduceMotion, travel: 0, done: 0, hitSeg: -1, hitAt: -1e9, push: 0, pct: 0, shown: -1, things: 0, thingsF: 0, thingsShown: -1, sec: -1, gate: 0.9, groups: [],
  flash: $('#boot-flash'), big: $('#bo-pct'), bar: $('#bo-bar'), head: $('#bo-head'), gateEl: $('#bo-gate'), gateWord: $('#bo-gate-word'), phase: $('#bo-phase'), time: $('#bo-time'),
  count: $('#bo-count'), live: $('#bo-live'), thingsEl: $('#bo-things'), now: $('#bo-now'), gl: $('#bo-groups'), log: $('#bo-log') };
/* the feeds, sorted into five kinds for the read-out beside the globe; anything not listed counts with the first */
const BOOT_GROUPS = [
  ['Earth and hazards', ['Globe, borders and city lights', 'Earthquakes', 'Fires, storms and volcanoes', 'Fire hotspots', 'Disaster alerts', 'US weather warnings', 'Fireballs and asteroids', 'Carbon dioxide', 'NASA satellite view', 'Earth from deep space', 'Wildlife sightings', 'Wild sounds']],
  ['Weather and Sun', ['City weather', 'Wind', 'Clouds', 'Aurora forecast', 'Space weather', 'The Sun']],
  ['Infrastructure', ['Nuclear facilities', 'Undersea cables', 'Power stations and pipelines', 'Live cameras']],
  ['In orbit', ['Space stations', 'Every active satellite', 'Space debris', 'Spent rocket stages', 'Dead satellites', 'Deep space antennas', 'Close calls in orbit', 'Rocket launches', 'Recent launches']],
  ['News and radio', ['World news', 'Most read today', 'Space news', 'Radio stations']]
];

/* stars that ride with the camera: points when it is still, streaks when it is moving fast. The planet hides the ones
   behind it, and none comes close enough to cross in front of it. Each field is laid out by the function it is given. */
function streakField(N, seed0, place) {
  const P = new Float32Array(N * 3), PB = new Float32Array(N), PT = new Float32Array(N), L = new Float32Array(N * 6), LB = new Float32Array(N * 2), LT = new Float32Array(N * 2);
  let seed = seed0; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const xy = place(rnd), x = xy[0], y = xy[1], z = rnd(), b = 0.22 + 0.78 * Math.pow(rnd(), 2.4);
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; PB[i] = b;
    L[i * 6] = L[i * 6 + 3] = x; L[i * 6 + 1] = L[i * 6 + 4] = y; L[i * 6 + 2] = L[i * 6 + 5] = z; LB[i * 2] = LB[i * 2 + 1] = b; LT[i * 2 + 1] = 1;
  }
  const u = { uTravel: { value: 0 }, uStreak: { value: 0 }, uFade: { value: 0 }, uLine: { value: 0 }, uPx: { value: 1.7 * renderer.getPixelRatio() } };
  const vs = ['attribute float aT; attribute float aB; uniform float uTravel; uniform float uStreak; uniform float uPx; varying float vA;',
    'void main(){',
    '  float z=fract(position.z+uTravel/72.0);',                                   /* 0 far ahead, 1 about to pass the camera */
    '  gl_Position=projectionMatrix*modelViewMatrix*vec4(position.xy,-(72.0*(1.0-z)+2.0)-aT*uStreak,1.0);',
    '  vA=aB*smoothstep(0.0,0.14,z)*(1.0-smoothstep(0.94,1.0,z))*(1.0-aT);',
    '  gl_PointSize=uPx*(0.7+1.5*aB)*(0.55+0.9*z);',
    '}'].join('\n');
  const mat = fs => new THREE.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const geo = (pos, b, t) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aB', new THREE.BufferAttribute(b, 1)); g.setAttribute('aT', new THREE.BufferAttribute(t, 1)); return g; };
  const points = new THREE.Points(geo(P, PB, PT), mat('uniform float uFade; varying float vA; void main(){ vec2 p=gl_PointCoord*2.0-1.0; float r=dot(p,p); if(r>1.0) discard; gl_FragColor=vec4(0.82,0.88,1.0,vA*uFade*(1.0-r)); }'));
  const lines = new THREE.LineSegments(geo(L, LB, LT), mat('uniform float uFade; uniform float uLine; varying float vA; void main(){ gl_FragColor=vec4(0.82,0.88,1.0,vA*uFade*uLine); }'));
  const g = new THREE.Group(); g.add(points, lines); g.renderOrder = -5; points.renderOrder = lines.renderOrder = -5; points.frustumCulled = lines.frustumCulled = false;
  g.visible = false; scene.add(g);
  return { g, u };
}
/* the opening's stars sit in a ring round the middle of the view */
const openStars = streakField(1500, 20261119, rnd => { const a = rnd() * Math.PI * 2, r = 1.7 + 30 * Math.sqrt(rnd()); return [Math.cos(a) * r, Math.sin(a) * r]; });
openStars.g.visible = !reduceMotion;
/* the tour's fill the whole view, so there is always sky rushing past whichever way the camera is looking */
const tourStars = streakField(1400, 77123, rnd => { for (;;) { const x = (rnd() * 2 - 1) * 27, y = (rnd() * 2 - 1) * 16; if (x * x + y * y > 2.9) return [x, y]; } });

/* where the words are on screen, so the dots streaming in can thin out over them: the read-out, the list of feeds and the
   heading. Measured a few times a second while the dots are in the air, and eased toward what was measured, so an area never
   jumps. Nothing is kept clear round the way in at the bottom: the dots for the far south arrive through there, and the button
   has its own dark glass to sit on. */
const keepWant = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
function openingKeep(dtm) {
  const real = performance.now();
  if (real >= (opening.keepAt || 0)) {
    opening.keepAt = real + 400;
    const box = renderer.domElement.getBoundingClientRect();
    opening.keepEls = opening.keepEls || [[$('#boot .boot-read'), 44, 40], [opening.log, 44, 40], [$('#boot .boot-top'), 46, 24]];
    opening.keepEls.forEach((e, i) => {
      const r = e[0].getBoundingClientRect(), w = r.right - r.left, h = r.bottom - r.top, v = keepWant[i];
      if (!(w > 0 && h > 0) || !box.width) { v.z = v.w = 0; return; }
      v.set(((r.left + r.right) / 2 - box.left) / box.width * 2 - 1, 1 - ((r.top + r.bottom) / 2 - box.top) / box.height * 2, (w / 2 + e[1]) / box.width * 2, (h / 2 + e[2]) / box.height * 2);
    });
  }
  const k = Math.min(1, Math.max(0, dtm) / 240);
  introU.keep.forEach((v, i) => { const w = keepWant[i]; if (!(v.z > 0 || v.w > 0)) { v.x = w.x; v.y = w.y; } v.lerp(w, k); });      /* a new area grows in place from nothing */
}
/* once a frame while the opening lasts, after the assembly sequence has had its say */
function stepOpening(now, dtm) {
  if (introU.spark.value > 0 && !boot.entered) openingKeep(Math.min(dtm, 100));
  /* the large figure counts up smoothly toward the true value */
  if (!boot.entered && opening.big) {
    const real = performance.now(), dr = Math.min(250, real - (opening.last || real)); opening.last = real;      /* the page's own clock, so the figures keep counting even if the sequence is held */
    const want = boot.done ? 100 : opening.pct; opening.shownF = (opening.shownF || 0) + (want - (opening.shownF || 0)) * Math.min(1, dr / 260);
    const v = Math.round(opening.shownF);
    if (v !== opening.shown) { opening.shown = v; opening.big.textContent = v; opening.bar.style.transform = 'scaleX(' + (v / 100).toFixed(3) + ')'; opening.head.style.transform = 'translateX(' + v + '%)'; }
    /* how many things are on the globe so far, counting up, and how long it has taken */
    opening.thingsF += (opening.things - opening.thingsF) * Math.min(1, dr / 420);
    const n = Math.round(opening.thingsF); if (n !== opening.thingsShown) { opening.thingsShown = n; opening.thingsEl.textContent = n.toLocaleString(); }
    const sec = Math.floor((now - intro.start) / 1000);
    if (sec !== opening.sec) { opening.sec = sec; opening.time.textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); openingPhase(); }
  }
  if (opening.gone) return;
  const s = (now - intro.start) / 1000, tc = intro.clock / 1000, te = boot.entered ? (now - intro.exitAt) / 1000 : -1, R = bootRing.u, S = openStars.u;
  const k = (a, b, x) => clamp((x - a) / (b - a), 0, 1);
  /* stars: a slow drift while loading; one surge as the planet goes live, and they fade */
  let speed = 0.55;
  if (te >= 0) speed += 64 * Math.pow(1 - k(0, 1.0, te), 2);
  opening.travel += speed * Math.min(dtm, 100) / 1000;
  S.uTravel.value = opening.travel; S.uStreak.value = Math.min(4.6, speed * 0.055); S.uLine.value = clamp((speed - 2) / 9, 0, 1);
  S.uFade.value = 0.8 * k(3.7, 5.8, tc) * (te >= 0 ? 1.25 * (1 - k(0.3, 1.45, te)) : 1);      /* the sky stays black while the dots stream in, as it used to, and the stars come out once the continents have formed */
  openStars.g.position.copy(camera.position); openStars.g.quaternion.copy(camera.quaternion);
  /* a spark runs round the ring as it appears, the edge of the planet lights, and each feed that lands fires a spoke */
  R.uIgnite.value = k(0.1, 1.2, s) * 1.1;
  R.uRim.value = k(3.1, 3.8, tc) * (1 - 0.7 * k(4.4, 5.4, tc));
  if (R.uDone.value > opening.done && s > 0.9) { opening.hitSeg = R.uDone.value - 1; opening.hitAt = now; }
  opening.done = R.uDone.value;
  R.uHit.value = opening.hitSeg; R.uHitAge.value = clamp((now - opening.hitAt) / 640, 0, 1);
  /* going live: the atmosphere and the ring flare, the wave across the surface is stronger, and the camera pushes in a touch
     past its resting place and settles back, so the planet arrives with some weight */
  if (te >= 0) {
    introU.glow.value = (intro.done ? 1 : k(3.2, 4.8, tc)) * (1 + 1.1 * Math.exp(-te / 0.3));
    R.uFlash.value = Math.pow(1 - k(0, 0.5, te), 2); introU.pulseGain.value = 1 + 2.2 * (1 - k(0.2, 1.5, te));
    /* if anything else moves the zoom meanwhile (the visitor scrolling, the window resizing), the push stops and leaves the zoom to them */
    if (opening.zt != null && Math.abs(zoomTarget - opening.zt) > 1e-6) { opening.pushOff = true; opening.push = 0; }
    if (!opening.pushOff) { const push = -0.05 * view.fit * Math.pow(Math.sin(Math.PI * k(0, 1.5, te)), 2); zoomTarget += push - opening.push; opening.push = push; opening.zt = zoomTarget; }
  }
  if (te > 1.6) { opening.gone = true; if (!opening.pushOff && Math.abs(zoomTarget - opening.zt) < 1e-6) zoomTarget -= opening.push; opening.push = 0; openStars.g.visible = false; introU.pulseGain.value = 1; if (intro.done) introU.glow.value = 1; R.uFlash.value = 0; }
}
/* which stage the loading has reached, in a few words */
function openingPhase() {
  const w = boot.done ? 'Everything is live' : boot.arming ? 'Opening the globe' : !intro.done && intro.clock < 3600 ? 'Forming the continents' : opening.pct >= 60 ? 'Nearly there' : 'Bringing in live feeds';
  if (opening.phase.textContent !== w) opening.phase.textContent = w;
}
/* the feeds laid out by kind, one small square each (rebuilt only if the list of feeds itself changes) */
function openingGroups() {
  const sig = steps.map(s => s.label).join('|'); if (sig === opening.gsig) return; opening.gsig = sig;
  const where = {}; BOOT_GROUPS.forEach((g, i) => g[1].forEach(l => { where[l] = i; }));
  const groups = BOOT_GROUPS.map(g => ({ name: g[0], steps: [] }));
  for (const st of steps) groups[where[st.label] == null ? 0 : where[st.label]].steps.push(st);
  opening.groups = groups.filter(g => g.steps.length);
  opening.gl.innerHTML = opening.groups.map(g => '<li><span class="n">' + g.name + '</span><span class="cells">' + g.steps.map(() => '<i></i>').join('') + '</span><b class="mono"></b></li>').join('');
  opening.groups.forEach((g, i) => { const li = opening.gl.children[i]; g.li = li; g.cells = Array.from(li.children[1].children); g.count = li.lastChild; });
  /* the mark on the bar where the globe opens by itself */
  opening.gate = Math.ceil(steps.length * 0.9) / steps.length; opening.gateEl.style.left = (opening.gate * 100).toFixed(2) + '%';
}
/* the words beside the globe: how far along, what is loading, each kind of feed, and the last few to arrive (newest first) */
function paintOpening(fin, cur) {
  if (!opening.big) return;
  opening.pct = boot.done ? 100 : Math.round(fin.length / steps.length * 100);
  const count = fin.length + ' of ' + steps.length, line = $('#boot-now').textContent, live = String(cur.length);
  if (opening.count.textContent !== count) opening.count.textContent = count;
  if (opening.live.textContent !== live) opening.live.textContent = live;
  if (opening.now.textContent !== line) opening.now.textContent = line;
  let things = 0; for (const k in layers) { const L = layers[k]; if (L && L.on && L.items) things += L.items.length; }
  opening.things = things;
  openingGroups();
  for (const g of opening.groups) {
    let done = 0, busy = 0;
    g.steps.forEach((st, i) => { const state = st.state || 'wait'; if (g.cells[i].dataset.state !== state) g.cells[i].dataset.state = state; if (state === 'load') busy++; else if (state !== 'wait') done++; });
    const txt = done + '/' + g.steps.length, state = done === g.steps.length ? 'done' : busy ? 'live' : done ? 'part' : 'wait';
    if (g.count.textContent !== txt) g.count.textContent = txt;
    if (g.li.dataset.state !== state) g.li.dataset.state = state;
  }
  const past = fin.length / steps.length >= opening.gate - 1e-9, word = boot.done ? 'Everything loaded' : past ? 'Opening' : 'Globe opens here';
  if (opening.gateWord.textContent !== word) opening.gateWord.textContent = word;
  opening.gateEl.classList.toggle('on', past);
  openingPhase();
  /* Rows are kept, not rebuilt. One that has left the list is taken out; one whose state has changed is taken out and put
     back where it now belongs, so it is the row that animates (it slides in when it starts loading and flashes when it
     lands). The rows around it stay exactly as they are. */
  const rows = cur.concat(boot.log).slice(0, 6), have = new Map(), L = opening.log;
  for (const li of Array.from(L.children)) have.set(li.dataset.k, li);
  for (const [k, li] of have) { const r = rows.find(x => x.label === k); if (!r || (r.state || 'wait') !== li.dataset.state) li.remove(); if (!r) have.delete(k); }
  rows.forEach((r, i) => {
    let li = have.get(r.label);
    if (!li) { li = document.createElement('li'); li.dataset.k = r.label; li.innerHTML = '<i class="st"></i><span class="t"></span><span class="s"></span>'; li.children[1].textContent = r.label; }
    const st = r.state || 'wait', tx = bootText(r);
    if (li.dataset.state !== st) li.dataset.state = st;
    if (li.lastChild.textContent !== tx) li.lastChild.textContent = tx;
    if (L.children[i] !== li) L.insertBefore(li, L.children[i] || null);
  });
}
/* the moment the planet goes live: a soft bloom from the globe, and a wave of light across its surface from the centre of the view */
function openingEnter(now) {
  if (!opening.on || opening.gone) return;
  introU.pulseDir.value.copy(camera.position).normalize(); intro.pulseAt = now;
  if (opening.flash && project(TV0)) { opening.flash.style.transform = 'translate3d(' + scr.x.toFixed(1) + 'px,' + scr.y.toFixed(1) + 'px,0)'; opening.flash.classList.add('go'); setTimeout(() => { opening.flash.hidden = true; }, 1500); }
}
const TV0 = new THREE.Vector3(0, 0, 0);
