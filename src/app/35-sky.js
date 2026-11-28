/* ============================================================
   The sky: the real stars, the Moon and the Sun, each where it actually is.
   The scene is fixed to the Earth (the globe never turns; the Sun goes round it), so the sky turns once a sidereal day.
   Nothing here comes from a feed: the stars are the Yale Bright Star Catalogue (tools/make-stars.py), and the Sun and Moon
   are worked out from the date (subsolar and moonInfo in 00-core.js).
   ============================================================ */
const MOON_SIZE = 3;                       /* the Moon is drawn this many times its real size, so it is more than a dot; its place and distance are real */
const sky = { stars: null, moon: null, sun: null, moonAt: new THREE.Vector3(), moonR: 0.2727 * MOON_SIZE, item: null, at: 0 };
const SKY_SPIN = new THREE.Vector3(0, 1, 0), SKY_POLE = new THREE.Vector3(0, Math.cos(23.439 * D2R), Math.sin(23.439 * D2R)), _skyQ = new THREE.Quaternion(), _skyV = new THREE.Vector3();

/* ---------- stars: every one the naked eye can see under a dark sky, with its real brightness and colour ---------- */
(function () {
  const raw = atob(ASSET.stars), n = raw.length / 6, pos = new Float32Array(n * 3), al = new Float32Array(n), col = new Float32Array(n * 3), v = new THREE.Vector3();
  const tint = k => {                      /* colour temperature to a gentle tint: orange giants, white suns, blue-white hot stars */
    const t = clamp(Math.log(k / 3000) / Math.log(15000 / 3000), 0, 1);
    return t < 0.42 ? [1, 0.76 + 0.2 * (t / 0.42), 0.56 + 0.36 * (t / 0.42)] : [1 - 0.2 * ((t - 0.42) / 0.58), 0.96 - 0.08 * ((t - 0.42) / 0.58), 0.92 + 0.08 * ((t - 0.42) / 0.58)];
  };
  for (let i = 0; i < n; i++) {
    const b = k => raw.charCodeAt(i * 6 + k), ra = (b(0) | b(1) << 8) / 65536 * 360, dec = (b(2) | b(3) << 8) / 65535 * 180 - 90, mag = b(4) / 30 - 1.5;
    ll(dec, ra, 200, v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
    al[i] = 0.07 + 0.93 * Math.pow(clamp((6.6 - mag) / 8.1, 0, 1), 1.6);     /* Sirius is nearly solid; the faintest are a whisper */
    const c = tint(2000 * Math.pow(2, b(5) / 51)); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: U.uPx }, transparent: true, depthWrite: false,          /* tested against the globe and the Moon, which are drawn first, so neither lets a star through */
    vertexShader: 'attribute float aAlpha; attribute vec3 aTint; uniform float uPx; varying float vA; varying vec3 vC; void main(){ vA=aAlpha; vC=aTint; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=(0.9+aAlpha*2.7)*uPx; }',
    fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard; gl_FragColor=vec4(vC*vec3(.9,.92,.98), vA*(1.-r)); }'
  });
  sky.stars = new THREE.Points(g, m); sky.stars.frustumCulled = false; sky.stars.renderOrder = -1; scene.add(sky.stars);
})();

/* ---------- the Sun: a glare where it really is, hidden when the Earth is in the way ---------- */
(function () {
  const m = new THREE.ShaderMaterial({
    uniforms: { uShow: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main(){ vP=uv*2.-1.; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    /* a small hard disc, a soft bloom round it, a wide faint veil, and a thin streak like the one a lens draws */
    fragmentShader: 'uniform float uShow; varying vec2 vP; void main(){ float r2=dot(vP,vP); float edge=1.-smoothstep(.55,1.,sqrt(r2));' +
      ' float a=exp(-r2*1500.)*1.2+exp(-r2*70.)*.34+.07/(1.+r2*26.)+exp(-vP.y*vP.y*5200.)*exp(-vP.x*vP.x*5.)*.11;' +
      ' gl_FragColor=vec4(vec3(1.,.965,.9)*a*edge*uShow,1.); }'
  });
  sky.sun = new THREE.Mesh(new THREE.PlaneGeometry(64, 64), m); sky.sun.frustumCulled = false; sky.sun.renderOrder = -1; scene.add(sky.sun);
})();

/* ---------- the Moon: lit by the Sun, so its phase is simply what you would see, with the dark seas sketched in ---------- */
(function () {
  /* the seas on the side that faces us: longitude east, latitude, radius, all in degrees */
  const seas = [[-16, 33, 19], [17, 28, 11], [31, 9, 13], [59, 17, 8], [51, -8, 10], [35, -15, 6], [-17, -21, 12], [-39, -24, 7], [-57, 18, 25], [1, 56, 9]];
  const m = new THREE.ShaderMaterial({
    uniforms: { uSun: U.uSun, uEarth: { value: new THREE.Vector3(0, 0, 1) }, uPole: { value: new THREE.Vector3(0, 1, 0) }, uSeas: { value: seas.map(s => { const a = s[1] * D2R, o = s[0] * D2R; return new THREE.Vector4(Math.cos(a) * Math.sin(o), Math.sin(a), Math.cos(a) * Math.cos(o), s[2] * D2R); }) } },
    vertexShader: 'varying vec3 vN; void main(){ vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uSun; uniform vec3 uEarth; uniform vec3 uPole; uniform vec4 uSeas[10]; varying vec3 vN;' +
      ' void main(){ vec3 n=normalize(vN); vec3 up=normalize(uPole-uEarth*dot(uPole,uEarth)); vec3 east=cross(up,uEarth);' +
      ' vec3 b=vec3(dot(n,east),dot(n,up),dot(n,uEarth)); float sea=0.;' +                 /* b: where this spot is on the Moon, with +z facing the Earth */
      ' for(int i=0;i<10;i++){ float c=dot(b,uSeas[i].xyz); sea=max(sea,smoothstep(cos(uSeas[i].w),cos(uSeas[i].w*.45),c)); }' +
      ' float lam=max(dot(n,uSun),0.); float lit=pow(lam,.75)*1.08+.03;' +               /* the Moon scatters light back evenly, so its edge is nearly as bright as its middle; .03 is earthshine */
      ' gl_FragColor=vec4(vec3(.94,.925,.89)*(1.-.34*sea)*lit,1.); }'
  });
  sky.moon = new THREE.Mesh(new THREE.SphereGeometry(sky.moonR, 48, 32), m); sky.moon.frustumCulled = false; scene.add(sky.moon);
})();
Object.assign(PSEUDO, { moon: 'The Moon' });
CREDITS.push(['Yale Bright Star Catalogue', 'The stars: every one of magnitude 6.5 or brighter, with its place, brightness and colour, from the fifth edition (Hoffleit and Warren, 1991). Public domain', 'http://tdc-www.harvard.edu/catalogs/bsc5.html']);

/* put the sky where it is at a given moment; called once a second with the clock */
function skyTick(date) {
  const d = (date.getTime() - J2000) / 864e5;
  sky.at = date.getTime();
  /* The catalogue gives each star's place for the year 2000. Two turns bring it to now: the slow wobble of the Earth's axis since then
     (precession, 50.29 seconds of arc a year about the pole of the ecliptic), and then the Earth's own spin. */
  const spin = -gmstDeg(d) * D2R;
  sky.stars.quaternion.setFromAxisAngle(SKY_SPIN, spin).multiply(_skyQ.setFromAxisAngle(SKY_POLE, d / 365.25 * 50.29 / 3600 * D2R));
  sky.moon.material.uniforms.uPole.value.copy(SKY_POLE).applyAxisAngle(SKY_SPIN, spin);        /* the Moon's own north is within two degrees of the pole of the ecliptic */
  sky.sun.position.copy(U.uSun.value).multiplyScalar(190);
  ll(moon.lat, moon.lon, moon.km / 6378.14, sky.moonAt); sky.moon.position.copy(sky.moonAt);
  sky.moon.material.uniforms.uEarth.value.copy(sky.moonAt).normalize().negate();
  if (sky.item) Object.assign(sky.item, { lat: moon.lat, lon: moon.lon });
}
/* The glare faces the camera; called every frame. It stays out of the opening sequence, where the screen is full of words, and comes up once the globe is entered. */
function skyFrame() {
  const u = sky.sun.material.uniforms.uShow;
  u.value = reduceMotion ? (boot.entered ? 1 : 0) : u.value + ((boot.entered ? 1 : 0) - u.value) * 0.035;
  sky.sun.visible = u.value > 0.004;
  sky.sun.quaternion.copy(camera.quaternion);
}

/* the Moon as something that can be selected, like a marker */
function moonItem() {
  sky.item = sky.item || { layer: 'moon', id: 'moon', title: 'The Moon',
    explain: 'The Moon is shown where it really is and at its real distance, about thirty Earths away, but drawn three times its true size so that it is more than a dot. The Sun lights it here just as it does in your sky, so the phase you see is the real one.' };
  return Object.assign(sky.item, { lat: moon.lat, lon: moon.lon });
}
/* the Moon, if this point of the screen is on its disc. It is big enough to aim at, so on its disc it wins over a satellite's dot crossing its face;
   the caller has made sure the Earth is not under the pointer. */
function moonUnder(x, y) {
  if (occluded(sky.moonAt) || !project(sky.moonAt)) return null;
  const px = view.h / (2 * Math.tan(camera.fov * D2R / 2)) * sky.moonR / camera.position.distanceTo(sky.moonAt);
  return Math.hypot(scr.x - x, scr.y - y) < px ? moonItem() : null;
}
function selectMoon() { select(moonItem(), { stay: true }); }
/* Pull back and turn until the Earth and the Moon stand side by side in the open part of the screen.
   The camera always looks at the middle of the Earth with north up, so this is a matter of where to stand:
   far enough that the Earth takes under half the open width, and off to one side of the line to the Moon by just the
   angle that puts the Moon midway between the Earth's edge and the edge of the open space. */
function seeMoon() {
  const K = view.h / (2 * Math.tan(camera.fov * D2R / 2));                    /* pixels for each unit of tangent */
  const room = (view.phone || view.bare ? view.w : Math.max(view.w - 700, 380)) / 2;       /* open width either side of the globe's centre (the panels take 700 on a desk) */
  const dist = clamp(1 / Math.sin(Math.atan(room * 0.42 / K)), view.fit, controls.maxDistance);
  const far = sky.moonAt.length(), th = Math.atan(room * 0.71 / K), off = th + Math.asin(dist * Math.sin(th) / far);   /* off: the angle at the Earth between the Moon and the way the camera faces */
  const latF = Math.asin(clamp(Math.sin(moon.lat * D2R) / Math.cos(off), -1, 1)), dLon = Math.atan2(Math.sin(off), Math.cos(latF) * Math.cos(off)) * R2D;
  /* there are two such places, one with the Moon on the right and one with it on the left: take the one that shows more of the Earth in daylight */
  const lat = -latF * R2D, a = wrapLon(moon.lon + dLon + 180), b = wrapLon(moon.lon - dLon + 180), lit = lon => ll(lat, lon, 1, _skyV).dot(U.uSun.value);
  flyTo(lat, lit(a) >= lit(b) ? a : b, dist);
}
const skyDay = d => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
const skyIn = d => { const n = (d - Date.now()) / 864e5; return n < 1 ? 'in ' + Math.max(1, Math.round(n * 24)) + ' hours' : 'in ' + Math.round(n) + ' days'; };
const moonLit = () => Math.round(moon.frac * 100) + '% of the side facing us is in sunlight';
const moonFar = () => num(Math.round(moon.km / 100) * 100) + ' km, ' + (moon.km / 299792.458).toFixed(2) + ' seconds away by light';
liveFns.push(o => { if (selected && selected.layer === 'moon') { o['moon-lit'] = moonLit(); o['moon-km'] = moonFar(); } });
DETAILS.moon = it => {
  const now = new Date(), full = moonNext(180, now), dark = moonNext(0, now), age = moon.el / 360 * 29.53;
  return {
    title: '<div class="big">' + esc(moon.name) + '</div><p><span ' + live('moon-lit') + '>' + moonLit() + '</span></p>',
    rows: [
      ['Distance', '<span ' + live('moon-km') + '>' + moonFar() + '</span>'],
      ['Age', age < 1 ? 'Less than a day since new moon' : Math.round(age) + ' days since new moon'],
      ['Next full moon', skyDay(full) + ', ' + skyIn(full)],
      ['Next new moon', skyDay(dark) + ', ' + skyIn(dark)],
      ['Overhead at', '<span ' + live('moon-pos') + '>' + esc(fmtLL(moon.lat, moon.lon)) + '</span>']
    ],
    actions: '<button class="btn" data-act="moon-see">Bring the Moon into view</button><button class="btn" data-go="moon">Stand under it</button>'
  };
};
