/* ============================================================
   Music for the tour, made in the browser as it plays. There is no recording and nothing is downloaded: a handful of
   oscillators play slow chords through a long synthetic echo, the way ambient "space" music is usually built.

   Four layers: a low drone that breathes; a pad that drifts through a loop of wide, open chords, each one fading in over
   several seconds as the last fades out; an occasional high bell, far off; and a soft chime whenever the camera arrives at
   an event. It never repeats exactly, because the bells and the small variations in the chords are chosen at random.
   It begins the instant the tour is started, with a deep note, a rising chord of bells and the first chord already sounding.
   Each flight between two events gets a rush of air that passes from one ear to the other, with a note that bends upward
   and falls as it goes by, and each arrival a soft, low thud under the chime.
   ============================================================ */
const music = { M: null, timer: 0, level: 0.62, rack: null, rest: 0, echo: null };
const mHz = m => 440 * Math.pow(2, (m - 69) / 12);
/* D minor, voiced wide: low root and fifth, then the colour notes higher up */
const M_CHORDS = [[38, 45, 53, 57, 64], [34, 46, 53, 57, 62], [41, 48, 55, 57, 64], [36, 43, 52, 55, 62], [38, 45, 53, 60, 64], [34, 46, 50, 57, 65], [33, 45, 52, 55, 60], [36, 43, 52, 55, 62]];
const M_BELLS = [74, 77, 79, 81, 84, 86, 89];

/* the echo: a few seconds of noise that dies away, different in each ear. The dying away is worked out once every hundred
   or so samples and drawn straight in between, which sounds the same and takes a fraction of the time. The samples are plain
   numbers until a sound engine wants them, so they can be worked out before there is one (musicWarm). */
function musicEcho(rate, secs) {
  const n = Math.floor(rate * secs), STEP = 128, slope = 0.5 / n, ears = [new Float32Array(n), new Float32Array(n)];
  for (const d of ears) {
    let low = 0;
    for (let i0 = 0; i0 < n; i0 += STEP) {
      const i1 = Math.min(n, i0 + STEP), e0 = Math.pow(1 - i0 / n, 3.4), de = (Math.pow(1 - i1 / n, 3.4) - e0) / (i1 - i0);
      for (let i = i0; i < i1; i++) { low += (Math.random() * 2 - 1 - low) * (0.6 - slope * i); d[i] = low * (e0 + de * (i - i0)); }
    }
    for (let i = 0; i < 400 && i < n; i++) d[i] *= i / 400;
  }
  return { rate, secs, ears };
}
function musicImpulse(ctx, secs) {
  const made = music.echo && music.echo.rate === ctx.sampleRate && music.echo.secs === secs ? music.echo : musicEcho(ctx.sampleRate, secs), buf = ctx.createBuffer(2, made.ears[0].length, ctx.sampleRate);
  made.ears.forEach((d, c) => { if (buf.copyToChannel) buf.copyToChannel(d, c); else buf.getChannelData(c).set(d); });
  return buf;
}
/* The echo and the noise for the rush of air are the slow things to make, so they are made once for each sound engine and
   kept: every tour after the first starts with them already there, and so does the first if there was a quiet moment to
   make them in beforehand (musicWarm, below). */
function musicRack(ctx) {
  const verb = ctx.createConvolver(); verb.buffer = musicImpulse(ctx, 6.5);
  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate), nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  return { ctx, verb, noise };
}
function musicBuild(ctx, rack) {
  rack = rack || musicRack(ctx);
  const t = ctx.currentTime, M = { ctx, rack, live: new Set(), chordAt: t + 0.05, bellAt: t + 5, step: 0, chord: M_CHORDS[0], noise: rack.noise };
  const out = M.out = ctx.createGain(), comp = ctx.createDynamicsCompressor(), tone = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), verb = rack.verb, send = M.send = ctx.createGain(), wet = M.wet = ctx.createGain(), dry = ctx.createGain(), bus = M.bus = ctx.createGain();
  out.gain.value = 0;
  comp.threshold.value = -25; comp.knee.value = 20; comp.ratio.value = 4; comp.attack.value = 0.04; comp.release.value = 0.6;
  tone.type = 'lowpass'; tone.frequency.value = 5600; tone.Q.value = 0.3; hp.type = 'highpass'; hp.frequency.value = 36;
  wet.gain.value = 0.7; dry.gain.value = 0.5;
  bus.connect(dry); bus.connect(send); send.connect(verb); verb.connect(wet); dry.connect(tone); wet.connect(tone); tone.connect(hp); hp.connect(comp); comp.connect(out); out.connect(ctx.destination);
  /* the drone: root, fifth and octave, each swelling and sinking at its own slow pace */
  for (const [m, vol, rate] of [[38, 0.05, 0.043], [45, 0.036, 0.061], [50, 0.034, 0.037]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), depth = ctx.createGain();
    o.type = 'sine'; o.frequency.value = mHz(m); g.gain.value = vol * 0.6; lfo.frequency.value = rate; depth.gain.value = vol * 0.4;
    lfo.connect(depth); depth.connect(g.gain); o.connect(g); g.connect(bus); o.start(t); lfo.start(t); M.live.add(o); M.live.add(lfo);
  }
  return M;
}
const mKeep = (M, o, end) => { M.live.add(o); o.onended = () => M.live.delete(o); o.stop(end); };
/* one chord of the pad: every note is two slightly mistuned bright waves and a pure one, behind a filter that opens and closes */
function musicPad(M, t, notes, dur, attack) {
  const ctx = M.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass'; f.Q.value = 0.6; f.frequency.setValueAtTime(attack ? 620 : 300, t); f.frequency.linearRampToValueAtTime(1350, t + dur * 0.45); f.frequency.linearRampToValueAtTime(340, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + (attack || dur * 0.34)); g.gain.setValueAtTime(1, t + dur * 0.58); g.gain.linearRampToValueAtTime(0, t + dur);
  notes.forEach((m, i) => {
    const vol = i === 0 ? 0.05 : 0.03;
    for (const [type, cents, k] of i === 0 ? [['sine', 0, 1], ['triangle', 4, 0.5]] : [['sawtooth', -7, 0.42], ['sawtooth', 6, 0.42], ['sine', 0, 0.9]]) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.frequency.value = mHz(m); o.detune.value = cents + (Math.random() - 0.5) * 3; og.gain.value = vol * k;
      o.connect(og); og.connect(f); o.start(t); mKeep(M, o, t + dur + 0.2);
    }
  });
  f.connect(g); g.connect(M.bus);
}
/* a bell: a pure note and a quieter one an octave up, struck and left to ring, somewhere between the ears */
function musicBell(M, t, m, vol, ring) {
  const ctx = M.ctx, g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0004, t + ring);
  for (const [mult, k] of [[1, 1], [2, 0.22], [3.01, 0.06]]) { const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = mHz(m) * mult; og.gain.value = k; o.connect(og); og.connect(g); o.start(t); mKeep(M, o, t + ring + 0.1); }
  if (pan) { pan.pan.value = (Math.random() - 0.5) * 1.3; g.connect(pan); pan.connect(M.bus); } else g.connect(M.bus);
}
/* write the next few seconds of music: called once a second, and once for the whole piece when it is being rendered for a test */
function musicFill(M, until) {
  while (M.chordAt < until) {
    const c = M.chord = M_CHORDS[M.step % M_CHORDS.length].slice(); M.step++;
    if (Math.random() < 0.35) c[4] += Math.random() < 0.5 ? 12 : -12;          /* now and then the top note moves an octave */
    musicPad(M, M.chordAt, c, 17, M.step === 1 ? 1.3 : 0); M.chordAt += 11.5;      /* the very first chord comes straight in; the rest take their time */
  }
  while (M.bellAt < until) {
    const m = M_BELLS[Math.floor(Math.random() * M_BELLS.length)];
    musicBell(M, M.bellAt, m, 0.036 + Math.random() * 0.03, 3.6);
    if (Math.random() < 0.4) musicBell(M, M.bellAt + 0.42, m + (Math.random() < 0.5 ? 7 : 5), 0.022, 3.2);
    M.bellAt += 3.5 + Math.random() * 6;
  }
}
/* a smooth swell: nothing, up to a peak part of the way through, and away again */
function mSwell(peakAt, n) { const c = new Float32Array(n || 48); for (let i = 0; i < c.length; i++) { const x = i / (c.length - 1), u = x < peakAt ? x / peakAt : 1 - (x - peakAt) / (1 - peakAt); c[i] = u * u * (3 - 2 * u); } return c; }
const M_SWELL = mSwell(0.46), M_SWELL_LATE = mSwell(0.62);
/* the camera sets off for the next event: a rush of air for as long as the flight lasts, louder for a longer one. Four
   layers: wind (low noise that brightens and darkens), air (a quiet hiss above it), a note from the chord that bends up a
   fifth and falls back as it passes, and a low swell underneath. All of it crosses from one ear to the other. */
function musicWhoosh(secs, power, at, target) {
  const M = target || music.M; if (!M || (!target && M.ctx.state !== 'running')) return;
  const ctx = M.ctx, t = at == null ? ctx.currentTime + 0.02 : at, d = clamp(secs, 1.3, 4.8), p = clamp(power, 0.3, 1), dir = Math.random() < 0.5 ? -1 : 1, mid = t + d * 0.46;
  const out = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pan) { pan.pan.setValueAtTime(-0.7 * dir, t); pan.pan.linearRampToValueAtTime(0.7 * dir, t + d); out.connect(pan); pan.connect(M.bus); } else out.connect(M.bus);
  const layer = (node, level, curve) => { const g = ctx.createGain(); g.gain.value = 0; g.gain.setValueCurveAtTime(curve.map(v => v * level), t, d); node.connect(g); g.connect(out); };
  const noise = () => { const n = ctx.createBufferSource(); n.buffer = M.noise; n.loop = true; n.loopStart = Math.random(); n.start(t, Math.random() * 1.5); mKeep(M, n, t + d + 0.1); return n; };
  /* wind */
  const wind = ctx.createBiquadFilter(), soft = ctx.createBiquadFilter(); wind.type = 'bandpass'; wind.Q.value = 0.8; soft.type = 'lowpass'; soft.frequency.value = 2600;
  wind.frequency.setValueAtTime(150, t); wind.frequency.exponentialRampToValueAtTime(520 + 620 * p, mid); wind.frequency.exponentialRampToValueAtTime(170, t + d);
  noise().connect(wind); wind.connect(soft); layer(soft, 0.12 * p, M_SWELL);
  /* air */
  const air = ctx.createBiquadFilter(); air.type = 'bandpass'; air.Q.value = 0.6;
  air.frequency.setValueAtTime(2200, t); air.frequency.exponentialRampToValueAtTime(4200 + 1800 * p, mid); air.frequency.exponentialRampToValueAtTime(2400, t + d);
  noise().connect(air); layer(air, 0.016 * p, M_SWELL_LATE);
  /* the note going by */
  const f0 = mHz(M.chord[1] + 12), tone = ctx.createGain();
  for (const cents of [-6, 7]) { const o = ctx.createOscillator(); o.type = 'sine'; o.detune.value = cents; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, mid); o.frequency.exponentialRampToValueAtTime(f0 * 0.94, t + d); o.connect(tone); o.start(t); mKeep(M, o, t + d + 0.1); }
  layer(tone, 0.02 * p, M_SWELL);
  /* and the weight underneath */
  const low = ctx.createOscillator(); low.type = 'sine'; low.frequency.setValueAtTime(62, t); low.frequency.exponentialRampToValueAtTime(96, mid); low.frequency.exponentialRampToValueAtTime(55, t + d); low.start(t); mKeep(M, low, t + d + 0.1);
  layer(low, 0.055 * p, M_SWELL);
}
/* a low, soft thud */
function musicThud(M, t, level, from, to, secs) {
  const o = M.ctx.createOscillator(), g = M.ctx.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + secs * 0.6);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(level, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0004, t + secs);
  o.connect(g); g.connect(M.bus); o.start(t); mKeep(M, o, t + secs + 0.1);
}
/* the tour begins: a deep note, bells climbing through the first chord, and a rush of air as the camera draws away */
function musicOpen(M, t) {
  musicThud(M, t, 0.2, 118, 73.4, 2.6);
  [62, 69, 74, 76, 81].forEach((m, i) => musicBell(M, t + 0.02 + i * 0.085, m, 0.058 - i * 0.006, 4.6));
  musicWhoosh(2.6, 0.8, t + 0.05, M);
}
/* the camera has arrived: two notes from the chord that is sounding, an octave up, over a soft thud */
function musicChime() {
  const M = music.M; if (!M || M.ctx.state !== 'running') return;
  const t = M.ctx.currentTime + 0.03, c = M.chord;
  musicThud(M, t, 0.085, 104, 58, 0.5);
  musicBell(M, t, c[2] + 12, 0.05, 2.8); musicBell(M, t + 0.16, c[4] + 12, 0.04, 3.2);
}
function musicStart() {
  if (music.M) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  try {
    const ctx = tuner.ctx || (tuner.ctx = new AC());
    clearTimeout(music.rest);
    if (ctx.state === 'suspended') {                    /* browsers hold sound back until the page has been clicked or a key pressed */
      ctx.resume().catch(() => {});
      const kick = () => { ctx.resume().catch(() => {}); window.removeEventListener('pointerdown', kick, true); window.removeEventListener('keydown', kick, true); };
      window.addEventListener('pointerdown', kick, true); window.addEventListener('keydown', kick, true);
    }
    if (!music.rack || music.rack.ctx !== ctx) { music.rack = musicRack(ctx); music.echo = null; }
    const M = music.M = musicBuild(ctx, music.rack), t = ctx.currentTime;
    /* no slow fade in: the sound is there within half a second of the press */
    M.out.gain.setValueAtTime(0, t); M.out.gain.linearRampToValueAtTime(music.level, t + 0.45);
    musicFill(M, t + 4); musicOpen(M, t + 0.04);
    music.timer = setInterval(() => { const N = music.M; if (N && N.ctx.state === 'running') { if (N.chordAt < N.ctx.currentTime - 1) { N.chordAt = N.ctx.currentTime + 0.1; N.bellAt = Math.max(N.bellAt, N.ctx.currentTime + 2); } musicFill(N, N.ctx.currentTime + 4); } }, 1000);
  } catch (e) { music.M = null; }
}
/* The music fades, and so does what it sends into the echo, which is shared with the next tour. The notes stop once
   nothing can be heard; the wiring stays a few seconds longer, silent, while the echo rings itself out, so that none of
   this tour is left in it to be heard at the start of the next. Then the engine goes back to sleep. */
function musicFade(M, t) { for (const g of [M.out.gain, M.send.gain]) { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 1.8); } }
function musicHush(M) { for (const o of Array.from(M.live)) { try { o.onended = null; o.stop(); } catch (e) {} } }
function musicUnplug(M) {
  for (const cut of [() => M.bus.disconnect(), () => M.send.disconnect(), () => M.rack.verb.disconnect(M.wet), () => M.out.disconnect()]) { try { cut(); } catch (e) {} }
  const N = music.M; if (N && N !== M && N.rack === M.rack) { try { N.rack.verb.connect(N.wet); } catch (e) {} }      /* a tour that began in the meantime keeps its echo, whatever an old browser made of the line above */
}
function musicStop() {
  const M = music.M; if (!M) return; music.M = null; clearInterval(music.timer);
  try { musicFade(M, M.ctx.currentTime); } catch (e) {}
  setTimeout(() => musicHush(M), 2100);
  setTimeout(() => { musicUnplug(M); musicNap(0); }, 9500);
}
/* ---------- getting ready before the press ----------
   Working out the echo, starting the browser's sound engine and handing it the echo each hold the page up for a moment. On
   the press itself that moment is a stutter just as the camera sets off; a little earlier, nobody sees it. One step is done
   per call, so the caller can spread them over idle moments:
     1. the echo's samples, for the most usual sample rate. Needs nothing, so it can happen at any time.
     2. the engine, made asleep, so that nothing is switched on in the visitor's sound system for a tour they may never take.
        Browsers allow no sound before the page has been clicked or a key pressed, and making the engine sooner only earns a
        warning, so this waits for that. Unless the press itself has come ("now"), it is also left alone on phones and
        tablets, where a page that opens a sound engine can interrupt music playing in another app.
     3. the echo, handed to the engine.
   Returns true while there is more that it could do. */
function musicMay() { const ua = navigator.userActivation; return ua ? !!ua.hasBeenActive : !!music.touched; }
const musicReady = () => !!(tuner.ctx && music.rack && music.rack.ctx === tuner.ctx);
const musicDesk = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : { matches: true };
function musicWarm(now) {
  if (music.M || musicReady() || prefs.tourMusic === false) return false;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
  try {
    if (!tuner.ctx) {
      if (!now && !music.echo) { music.echo = musicEcho(48000, 6.5); return true; }
      if (!musicMay() || (!now && !musicDesk.matches)) return false;
      const ctx = tuner.ctx = new AC();
      if (now) musicNap(); else if (ctx.suspend) ctx.suspend().catch(() => {});
      return true;
    }
    music.rack = musicRack(tuner.ctx); music.echo = null;      /* the engine keeps its own copy of the echo */
  } catch (e) {}
  return false;
}
/* the press has come: wake the engine now, so that the first note is not kept waiting for it */
function musicWake() { const ctx = tuner.ctx; try { if (ctx && !music.M && ctx.state === 'suspended' && musicMay() && prefs.tourMusic !== false) { ctx.resume().catch(() => {}); musicNap(); } } catch (e) {} }
/* nothing is playing and nothing is about to: put the engine back to sleep (the radio's tuning noise and the next tour each wake it again) */
function musicNap(ms) {
  clearTimeout(music.rest);
  music.rest = setTimeout(() => {
    const ctx = tuner.ctx; if (!ctx || music.M || tuner.src || ctx.state !== 'running' || !ctx.suspend) return;
    if (performance.now() < (tuner.quietAt || 0)) return musicNap(600);      /* the tuning noise is still dying away */
    ctx.suspend().catch(() => {});
  }, ms == null ? 4000 : ms);
}
for (const ev of ['mousedown', 'pointerup', 'touchend', 'keydown']) window.addEventListener(ev, () => { music.touched = true; }, { capture: true, passive: true, once: true });
/* test only: two tours one after the other on one echo, rendered faster than real time. The first is stopped at 5 s and
   cleared away at 14.5 s, the second begins at 8 s. Reports the loudness of each second, so it can be seen that the first
   fades to nothing, that none of it leaks into the second, and that the second keeps its echo when the first is unplugged. */
function musicShareProbe(alone) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 22050, secs = 20, ctx = new OC(2, sr * secs, sr), rack = musicRack(ctx), keep = music.M;
  let A = null, B = null;
  const begin = t => { const M = musicBuild(ctx, rack); M.out.gain.setValueAtTime(0, t); M.out.gain.linearRampToValueAtTime(music.level, t + 0.45); musicFill(M, t + 12); musicOpen(M, t + 0.04); return M; };
  const at = (t, f) => ctx.suspend(t).then(() => { try { f(); } catch (e) {} return ctx.resume(); });
  if (!alone) { A = begin(0); at(5, () => musicFade(A, 5)); at(7.1, () => musicHush(A)); at(14.5, () => { music.M = B; musicUnplug(A); music.M = keep; }); }
  at(8, () => { B = begin(8); });
  return ctx.startRendering().then(buf => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), rows = []; let bad = 0;
    for (let s0 = 0; s0 < secs; s0++) { let e = 0; for (let i = s0 * sr; i < (s0 + 1) * sr; i++) { const a = L[i], b = R[i]; if (!isFinite(a) || !isFinite(b)) bad++; e += a * a + b * b; } rows.push(+(10 * Math.log10(e / (2 * sr) + 1e-12)).toFixed(1)); }
    return { perSecondDb: rows.join(' '), notNumbers: bad };
  });
}
/* test only: render a stretch of the music faster than real time and report how loud it is, so levels can be checked without ears */
function musicProbe(secs) {
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, sr = 22050, ctx = new OC(2, sr * secs, sr), M = musicBuild(ctx);
  M.out.gain.value = music.level; musicFill(M, secs); musicOpen(M, 0.04);
  for (let t = 11; t < secs; t += 7) { M.chord = M_CHORDS[Math.floor(t / 11.5) % M_CHORDS.length]; musicWhoosh(2.2, t % 2 ? 1 : 0.6, t - 2.2, M); musicThud(M, t, 0.085, 104, 58, 0.5); musicBell(M, t, M.chord[2] + 12, 0.05, 2.8); musicBell(M, t + 0.16, M.chord[4] + 12, 0.04, 3.2); }
  return ctx.startRendering().then(buf => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), win = sr * 5, rows = []; let peak = 0, bad = 0, sum = 0, dc = 0, diff = 0;
    for (let i = 0; i < L.length; i++) { const a = L[i], b = R[i]; if (!isFinite(a) || !isFinite(b)) bad++; peak = Math.max(peak, Math.abs(a), Math.abs(b)); sum += a * a + b * b; dc += a; diff += (a - b) * (a - b); }
    for (let w = 0; w + win <= L.length; w += win) { let s = 0; for (let i = w; i < w + win; i++) s += L[i] * L[i]; rows.push((10 * Math.log10(s / win + 1e-12)).toFixed(1)); }
    /* a rough measure of how bright the sound is, from how fast the wave changes from one sample to the next */
    let p1 = 0, p2 = 0; for (let i = 1; i < L.length; i++) { const x = L[i]; p1 += (x - L[i - 1]) * (x - L[i - 1]); p2 += x * x; }
    return { seconds: secs, peak: +peak.toFixed(3), rmsDb: +(10 * Math.log10(sum / (2 * L.length) + 1e-12)).toFixed(1), notNumbers: bad, dc: +(dc / L.length).toFixed(5), stereo: +(Math.sqrt(diff / L.length)).toFixed(4),
      brightnessHz: Math.round(Math.sqrt(p1 / p2) * sr / (2 * Math.PI)), per5s: rows.join(' '), firstHalfSecondDb: +(10 * Math.log10(L.slice(0, sr / 2).reduce((a, x) => a + x * x, 0) / (sr / 2) + 1e-12)).toFixed(1),
      firstTwoSecondsDb: +(10 * Math.log10(L.slice(0, sr * 2).reduce((a, x) => a + x * x, 0) / (sr * 2) + 1e-12)).toFixed(1), voices: M.live.size };
  });
}
