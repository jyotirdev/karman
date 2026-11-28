/* ============================================================
   Scene
   ============================================================ */
const app = $('#app'), canvas = $('#gl');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.75, powerPreference: 'high-performance' }); }
catch (e) { fatal('This browser could not start WebGL, which the globe needs. Try a current version of Chrome, Edge, Safari or Firefox.'); return; }
const quality = { level: 0, max: Math.min(window.devicePixelRatio || 1, 2) };
renderer.setPixelRatio(quality.max);
renderer.setClearColor(0x040405, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 400);
const view = { w: 1, h: 1, fit: 4.4, phone: false, zoomK: 0, bare: false };      /* bare: the panels are put away (cinema mode), so the globe may use the whole window */
const U = {
  uSun: { value: new THREE.Vector3(1, 0, 0) }, uTime: { value: 0 }, uPx: { value: quality.max },
  uZoom: { value: 1 }, uScale: { value: 1000 }
};
/* the opening sequence drives these; at rest they leave the globe exactly as it normally looks */
/* How far the land dots have got in assembling the planet: 0 is none, and every dot has landed only at BUILT. The dots land from
   north to south and each in its own time, so the last ones in the far south need a count well past 1 (1.25, by the arithmetic in
   DOTS_VS); anything less leaves them hanging off the bottom of the globe. */
const BUILT = 1.3;
const introU = { build: { value: BUILT }, reveal: { value: 1.3 }, wire: { value: 0 }, glow: { value: 1 }, pulse: { value: 1 }, pulseGain: { value: 1 }, pulseDir: { value: new THREE.Vector3(0, 0, 1) }, lines: 1,
  spark: { value: 0 }, ghost: [{ value: BUILT }, { value: BUILT }, { value: BUILT }], tails: null,
  keep: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] };      /* parts of the screen the flying dots thin out over, because there are words there: the read-out, the list of feeds and the heading */
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;

/* the stars, the Moon and the Sun are in 35-sky.js */

/* ---------- the globe surface ----------
   One greyscale shader: shaded relief on land lit by the real sun, a sun glint on the sea,
   city lights on the night side, and near-live clouds on top. */
const globeU = {
  tSurf: { value: blank }, tLights: { value: blank }, tClouds: { value: blank }, tOver: { value: blank }, uOver: { value: 0 },
  tFine: { value: blank }, uFine: { value: new THREE.Vector4(0, 0, 1, 1) }, uFineOn: { value: 0 },          /* a sharper picture of one area, laid over tOver (81-views.js) */
  uSun: U.uSun, uClouds: { value: 0 }, uLights: { value: isOn('lights') ? 1 : 0 },
  uReveal: introU.reveal, uWire: introU.wire, uPulse: introU.pulse, uPulseK: introU.pulseGain, uPulseDir: introU.pulseDir
};
const globe = new THREE.Mesh(
  new THREE.SphereGeometry(1, 144, 96),
  new THREE.ShaderMaterial({
    uniforms: globeU,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tSurf; uniform sampler2D tLights; uniform sampler2D tClouds; uniform sampler2D tOver; uniform float uOver;',
      'uniform sampler2D tFine; uniform vec4 uFine; uniform float uFineOn;',
      'uniform vec3 uSun; uniform float uClouds; uniform float uLights; uniform float uReveal; uniform float uWire; uniform float uPulse; uniform float uPulseK; uniform vec3 uPulseDir;',
      'varying vec2 vUv; varying vec3 vW;',
      'float hgt(vec2 uv){ return max(texture2D(tSurf,uv).r-0.094,0.0); }',
      'void main(){',
      '  vec3 n=normalize(vW); vec3 v=normalize(cameraPosition-vW);',
      '  float s=texture2D(tSurf,vUv).r;',
      '  float land=smoothstep(0.022,0.085,s);',
      '  float elev=clamp((s-0.094)/0.906,0.0,1.0);',
      '  vec2 px=vec2(1.5/2048.0,1.5/1024.0);',
      '  float gx=hgt(vUv+vec2(px.x,0.0))-hgt(vUv-vec2(px.x,0.0));',
      '  float gy=hgt(vUv+vec2(0.0,px.y))-hgt(vUv-vec2(0.0,px.y));',
      '  vec3 east=normalize(vec3(n.z,0.0,-n.x)+vec3(1e-5,0.0,0.0)); vec3 north=cross(n,east);',
      '  vec3 nb=normalize(n-7.0*(gx*east+gy*north));',
      '  float lamN=dot(n,uSun); float lam=clamp(lamN,0.0,1.0);',
      '  float day=smoothstep(-0.12,0.22,lamN);',
      '  float rel=clamp(dot(nb,uSun)-lamN,-0.3,0.3);',
      '  float lday=mix(0.115,0.36,pow(elev,0.55))*(0.62+0.5*lam)+rel*0.6;',
      '  float lnight=0.052+0.06*pow(elev,0.6)+rel*0.05;',
      '  float oday=0.036+0.034*lam; float onight=0.019;',
      '  vec3 h=normalize(uSun+v); float nh=max(dot(n,h),0.0);',
      '  float glint=(pow(nh,90.0)*0.5+pow(nh,10.0)*0.06)*(1.0-land)*step(0.0,lamN);',
      '  float g=mix(mix(onight,lnight,land),mix(oday,lday,land),day)+glint*day;',
      /* a flat map of the clouds is squeezed to a point at each pole, where it turns into rays; the clouds thin out over the last few degrees instead */
      '  float c=smoothstep(0.18,0.9,texture2D(tClouds,vUv).r)*uClouds*smoothstep(0.9990,0.9925,abs(n.y));',
      '  float lights=pow(max(texture2D(tLights,vUv).r-0.03,0.0),1.15)*(1.0-day)*uLights*(1.0-c*0.7);',
      '  g=mix(g,mix(0.07,0.36+0.26*lam,day),c*mix(0.34,0.6,day));',
      '  float fres=pow(1.0-max(dot(n,v),0.0),3.2);',
      '  vec3 col=vec3(g)*vec3(0.965,0.985,1.03)+lights*vec3(1.0,0.95,0.86)*1.5+fres*mix(vec3(0.045),vec3(0.17,0.18,0.20),day);',
      '  vec4 ov=texture2D(tOver,vUv);',
      /* uFine is the window as (left, bottom, 1/width, 1/height) in map coordinates; it blends in over a soft edge */
      '  vec2 fq=(vUv-uFine.xy)*uFine.zw; vec2 fe=min(fq,1.0-fq);',
      '  ov=mix(ov,texture2D(tFine,clamp(fq,0.0,1.0)),clamp(min(fe.x,fe.y)*30.0,0.0,1.0)*uFineOn);',
      '  col=mix(col,(ov.rgb/max(ov.a,0.02))*mix(0.6,0.95,day),clamp(ov.a,0.0,1.0)*uOver*0.88);',
      /* opening sequence: a scan line travels from pole to pole and the surface appears behind it; ahead of it only a faint grid shows */
      '  float sw=(1.0-n.y)*0.5;',
      '  float rev=1.0-smoothstep(uReveal-0.06,uReveal,sw);',
      '  vec2 gq=abs(fract(vUv*vec2(36.0,18.0))-0.5);',
      '  float wire=smoothstep(0.455,0.5,max(gq.x,gq.y))*uWire;',
      '  float front=exp(-pow((sw-uReveal)/0.014,2.0))*step(uReveal,1.08);',
      '  col=col*rev+vec3(0.52,0.6,0.74)*wire*(0.10+0.16*(1.0-rev))*(0.35+0.65*fres+0.4*max(dot(n,v),0.0))+vec3(0.78,0.88,1.0)*front*0.85;',
      /* a ring of light that spreads from the centre of the view each time a feed arrives */
      '  float pd=acos(clamp(dot(n,uPulseDir),-1.0,1.0))/3.14159265;',
      '  col+=vec3(0.8,0.9,1.0)*exp(-pow((pd-uPulse*0.62)/0.016,2.0))*(1.0-uPulse)*0.55*uPulseK*rev;',
      '  gl_FragColor=vec4(col,1.0);',
      '}'
    ].join('\n')
  })
);
scene.add(globe);

function tuneTexture(t) {
  t.wrapS = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true; return t;
}
function loadImage(src, cross) {
  return new Promise((res, rej) => { const im = new Image(); if (cross) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = src; });
}

/* land mask as bits (also answers "is this point on land?") */
const LAND = { step: 0.6, cols: 600, rows: 300, start: [], n: [], bits: null };
(function () {
  const bin = atob(ASSET.land); LAND.bits = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) LAND.bits[i] = bin.charCodeAt(i);
  let bit = 0;
  for (let i = 0; i < LAND.rows; i++) {
    const n = Math.max(1, Math.round(LAND.cols * Math.cos((-90 + (i + 0.5) * LAND.step) * Math.PI / 180)));
    LAND.start.push(bit); LAND.n.push(n); bit += n;
  }
})();
function isLand(lat, lon) {
  const i = clamp(Math.floor((lat + 90) / LAND.step), 0, LAND.rows - 1), n = LAND.n[i];
  const bit = LAND.start[i] + clamp(Math.floor((wrapLon(lon) + 180) / 360 * n), 0, n - 1);
  return !!(LAND.bits[bit >> 3] & (1 << (bit & 7)));
}

/* land as a dot matrix, brighter where the ground is higher */
const dotsU = { uSun: U.uSun, uScale: U.uScale, uSize: { value: 0.0054 }, uFade: { value: 0.9 }, uBuild: introU.build, uSpark: introU.spark, uGhost: { value: 0 }, uKeep: { value: introU.keep } };
/* The opening sequence, in the shader. Every dot starts in a wide, slowly turning cloud around the planet, faint as a star.
   From north to south each one takes off, brightens to white, spirals in trailing a short tail of light, and flashes as it
   lands in its place on the map. uSpark is 1 while that is going on and 0 afterwards, when the dots look exactly as they
   always have. The tails are the same dots drawn again a few hundredths of a second behind (uGhost > 0). Dots still in the
   air fade out as they cross the parts of the screen that hold words (uKeep: centre and half-size of each, in screen units). */
const DOTS_VS = [
  'attribute float aElev; uniform vec3 uSun; uniform float uScale; uniform float uSize; uniform float uBuild; uniform float uSpark; uniform float uGhost; uniform vec4 uKeep[3];',
  'varying float vLit; varying float vFace; varying float vE; varying float vK; varying float vHot; varying float vTail;',
  'void main(){',
  '  vec3 n=normalize(position);',
  '  float h=fract(sin(dot(position,vec3(12.9898,78.233,37.719)))*43758.5453); float h2=fract(h*91.7);',
  '  float ku=uBuild*2.0-((1.0-n.y)*0.5+h*0.5);',                       /* below 0 waiting in the cloud, 0 to 1 flying in, above 1 landed */
  '  float k=clamp(ku,0.0,1.0); float e=1.0-pow(1.0-k,2.4); float far=1.0-e;',
  '  float ang=far*(1.7+3.1*h-0.9*min(uBuild,1.0)); float cs=cos(ang); float sn=sin(ang);',
  '  float rxz=1.0+far*(0.7+1.8*h2); float ry=1.0+far*(0.3+1.1*h2);',
  '  vec3 p=vec3((position.x*cs-position.z*sn)*rxz,position.y*ry,(position.x*sn+position.z*cs)*rxz);',
  '  vec4 mv=modelViewMatrix*vec4(p,1.);',
  '  gl_Position=projectionMatrix*mv;',
  '  vec2 sp=gl_Position.xy/gl_Position.w; float clearOf=0.0;',
  '  for(int i=0;i<3;i++){ vec2 d=abs(sp-uKeep[i].xy)/max(uKeep[i].zw,vec2(0.00001)); d*=d; clearOf=max(clearOf,1.0-smoothstep(0.8,1.45,sqrt(sqrt(d.x*d.x+d.y*d.y)))); }',
  /* how far out from the planet's outline the dot is on screen, in planet radii. A dot is only ever thinned out well clear of the
     planet, and comes back gradually as it closes in, so nothing is cut off at an edge and nothing appears from nowhere */
  '  vec4 cv=modelViewMatrix*vec4(0.,0.,0.,1.); vec4 cc=projectionMatrix*cv; float dc=max(length(cv.xyz),1.05);',
  '  float rr=length((sp-cc.xy/cc.w)*vec2(projectionMatrix[1][1]/projectionMatrix[0][0],1.0))*sqrt(dc*dc-1.0)/projectionMatrix[1][1];',
  '  float shown=1.0-0.92*clearOf*uSpark*smoothstep(1.03,1.5,rr);',
  '  float flying=step(0.0,ku)*far;',
  '  float flash=smoothstep(0.8,1.0,ku)*exp(-6.0*max(ku-1.0,0.0));',
  '  vHot=uSpark*max(pow(flying,0.5),flash);',
  '  vTail=uGhost*uSpark*step(0.0,ku)*pow(far,0.6)*shown;',
  '  float s=uSize*(0.85+0.5*aElev)*uScale/(-mv.z);',
  '  gl_PointSize=max(s*(1.0+1.4*vHot),1.5+1.1*vHot);',
  '  float twinkle=0.72+0.28*sin(uBuild*46.0+h*60.0);',
  '  vK=shown*max(smoothstep(0.0,0.12,k),uSpark*far*0.24*twinkle*step(0.5,fract(h*37.3))*smoothstep(0.0,0.1,uBuild));',      /* while waiting, half of them show, faintly */
  '  vLit=smoothstep(-0.12,0.22,dot(n,uSun)); vE=aElev;',
  '  vFace=mix(1.0,dot(n,normalize(cameraPosition-position)),e);',
  '}'
].join('\n');
const DOTS_FS = [
  'uniform float uFade; uniform float uGhost; varying float vLit; varying float vFace; varying float vE; varying float vK; varying float vHot; varying float vTail;',
  'void main(){',
  '  vec2 p=gl_PointCoord*2.-1.; float r=dot(p,p); if(r>1.) discard;',
  '  float a=smoothstep(1.0,0.45,r); float glow=pow(1.0-r,1.5);',
  '  if(uGhost>0.0){ gl_FragColor=vec4(0.8,0.88,1.0,glow*vTail); return; }',
  '  vec3 c=mix(vec3(0.34,0.34,0.38)+0.14*vE,vec3(0.66,0.67,0.70)+0.32*vE,vLit);',
  '  float al=a*uFade*vK*mix(0.7,0.95,vLit)*mix(0.2,1.0,smoothstep(0.0,0.5,vFace));',
  '  gl_FragColor=vec4(mix(c,vec3(0.9,0.95,1.0),vHot),mix(al,max(a*0.55,glow)*vK,vHot));',
  '}'
].join('\n');
function buildDots(elevAt) {
  const pts = [], el = [], v = new THREE.Vector3();
  for (let i = 0; i < LAND.rows; i++) {
    const lat = -90 + (i + 0.5) * LAND.step, n = LAND.n[i];
    for (let j = 0; j < n; j++) {
      const bit = LAND.start[i] + j;
      if (!(LAND.bits[bit >> 3] & (1 << (bit & 7)))) continue;
      const lon = -180 + (j + 0.5) * 360 / n;
      ll(lat, lon, 1.0012, v); pts.push(v.x, v.y, v.z); el.push(elevAt ? elevAt(lat, lon) : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3));
  g.setAttribute('aElev', new THREE.BufferAttribute(new Float32Array(el), 1));
  const m = new THREE.ShaderMaterial({ uniforms: dotsU, transparent: true, depthWrite: false, vertexShader: DOTS_VS, fragmentShader: DOTS_FS });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = 1; scene.add(p);
  /* the tails: three fainter copies, each a moment behind the last; they are thrown away when the opening is over */
  if (introU.spark.value > 0) introU.tails = [0.5, 0.28, 0.14].map((alpha, i) => {
    const gm = new THREE.ShaderMaterial({ uniforms: Object.assign({}, dotsU, { uBuild: introU.ghost[i], uGhost: { value: alpha } }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexShader: DOTS_VS, fragmentShader: DOTS_FS });
    const q = new THREE.Points(g, gm); q.frustumCulled = false; q.renderOrder = 1; scene.add(q); return q;
  });
}
const assetsReady = Promise.all([loadImage(ASSET.surf).then(im => {
  globeU.tSurf.value = tuneTexture(new THREE.Texture(im));
  let elevAt = null;
  try {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    const cx = c.getContext('2d'); cx.drawImage(im, 0, 0, 1024, 512);
    const px = cx.getImageData(0, 0, 1024, 512).data;
    elevAt = (lat, lon) => clamp((px[(clamp(Math.floor((90 - lat) / 180 * 512), 0, 511) * 1024 + clamp(Math.floor((lon + 180) / 360 * 1024), 0, 1023)) * 4] / 255 - 0.094) / 0.906, 0, 1);
  } catch (e) {}
  buildDots(elevAt);
}).catch(() => buildDots(null)),
loadImage(ASSET.lights).then(im => { globeU.tLights.value = tuneTexture(new THREE.Texture(im)); }).catch(() => {})]);

/* ---------- line work: borders, plate boundaries, graticule ---------- */
function lineMaterial(color, alpha) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: alpha == null ? 1 : alpha } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute float aAlpha; varying float vA; varying float vF; void main(){ vA=aAlpha; vF=dot(normalize(position),normalize(cameraPosition-position)); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying float vA; varying float vF; void main(){ gl_FragColor=vec4(uColor,vA*uFade*smoothstep(-0.05,0.25,vF)); }'
  });
}
function makeLine(n, color, Type, alpha) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const l = new (Type || THREE.Line)(g, lineMaterial(color, alpha));
  l.frustumCulled = false; l.renderOrder = 2; scene.add(l);
  return l;
}
function decodeLines(b64) {
  const bin = atob(b64), n = bin.length >> 1, a = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8); a[i] = v > 32767 ? v - 65536 : v; }
  const out = [];
  for (let i = 0; i < n;) { const c = a[i++], line = []; for (let k = 0; k < c; k++, i += 2) line.push([a[i] / 100, a[i + 1] / 100]); out.push(line); }
  return out;
}
function segmentsFrom(lines, r, color, alpha) {
  let n = 0; for (const l of lines) n += (l.length - 1) * 2;
  const obj = makeLine(n, color, THREE.LineSegments, alpha), pos = obj.geometry.attributes.position.array, v = new THREE.Vector3();
  let k = 0;
  for (const l of lines) for (let i = 0; i < l.length - 1; i++) {
    ll(l[i][1], l[i][0], r, v); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z;
    ll(l[i + 1][1], l[i + 1][0], r, v); pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z;
  }
  return obj;
}
const bordersObj = segmentsFrom(decodeLines(ASSET.borders), 1.0016, '#c7c7cc', 0.2);
const platesObj = segmentsFrom(decodeLines(ASSET.plates), 1.002, LAYERS.plates.color, 0.26);
const gridObj = (function () {
  const lines = [];
  for (let lon = -180; lon < 180; lon += 15) { const l = []; for (let lat = -85; lat <= 85; lat += 2.5) l.push([lon, lat]); lines.push(l); }
  for (let lat = -75; lat <= 75; lat += 15) { const l = []; for (let lon = -180; lon <= 180; lon += 2.5) l.push([lon, lat]); lines.push(l); }
  return segmentsFrom(lines, 1.0014, '#ffffff', 0.07);
})();
bordersObj.visible = isOn('borders'); platesObj.visible = isOn('plates'); gridObj.visible = isOn('grid');

/* atmosphere: a thin halo that is brighter on the sunlit limb */
(function () {
  const RA = 1.19;
  const m = new THREE.ShaderMaterial({
    uniforms: { uSun: U.uSun, uRa: { value: RA }, uGlow: introU.glow },
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vW; void main(){ vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform vec3 uSun; uniform float uRa; uniform float uGlow; varying vec3 vW;',
      'void main(){',
      '  vec3 dir=normalize(vW-cameraPosition);',
      '  vec3 cp=cameraPosition+dir*dot(-cameraPosition,dir);',
      '  float h=length(cp);',
      '  float glow=pow(1.0-clamp((h-1.0)/(uRa-1.0),0.0,1.0),3.2);',
      '  float sun=smoothstep(-0.5,0.7,dot(normalize(cp),uSun));',
      '  gl_FragColor=vec4(vec3(0.70,0.76,0.88),glow*mix(0.10,0.55,sun)*uGlow);',
      '}'
    ].join('\n')
  });
  const a = new THREE.Mesh(new THREE.SphereGeometry(RA, 72, 48), m); a.renderOrder = 6; scene.add(a);
})();

/* aurora: a glowing shell fed by NOAA's probability grid */
const aurora = (function () {
  const W = 361, H = 181, data = new Uint8Array(W * H * 4);
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const u = { tAur: { value: tex }, uSun: U.uSun, uTime: U.uTime, uFade: { value: 0 } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.017, 96, 64), new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vW=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tAur; uniform vec3 uSun; uniform float uTime; uniform float uFade; varying vec2 vUv; varying vec3 vW;',
      'void main(){',
      '  float a=texture2D(tAur,vUv).r; float k=smoothstep(0.03,0.42,a);',
      '  float night=1.0-smoothstep(-0.25,0.1,dot(normalize(vW),uSun));',
      '  float shimmer=0.86+0.14*sin(uTime*1.3+vUv.x*230.0);',
      '  vec3 col=mix(vec3(0.10,0.95,0.45),vec3(0.45,1.0,0.75),k);',
      '  gl_FragColor=vec4(col,k*mix(0.3,1.0,night)*shimmer*uFade*0.6);',
      '}'
    ].join('\n')
  }));
  mesh.renderOrder = 4; mesh.visible = false; scene.add(mesh);
  const grid = new Float32Array(360 * 181);
  return {
    mesh, u, ready: false, max: 0,
    set(coords) {                                  /* [lon 0..359, lat -90..90, percent] */
      grid.fill(0); let max = 0;
      for (const c of coords) { const lo = ((Math.round(c[0]) % 360) + 360) % 360, la = Math.round(c[1]) + 90; if (la >= 0 && la <= 180) { grid[la * 360 + lo] = c[2]; if (c[2] > max) max = c[2]; } }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[(y * W + x) * 4] = Math.min(255, grid[y * 360 + ((x + 180) % 360)] * 2.55);
      tex.needsUpdate = true; this.ready = true; this.max = max;
    },
    at(lat, lon) { return grid[clamp(Math.round(lat) + 90, 0, 180) * 360 + ((Math.round(lon) % 360) + 360) % 360]; }
  };
})();

/* wind: streaks that drift along the current surface wind field */
const wind = (function () {
  const N = innerWidth <= 860 ? 800 : 2000, T = 16;
  const hist = new Float32Array(N * T * 3), al = new Float32Array(N * T), idx = new Uint16Array(N * (T - 1) * 2);
  const plat = new Float32Array(N), plon = new Float32Array(N), life = new Float32Array(N);
  for (let p = 0; p < N; p++) for (let s = 0; s < T; s++) {
    al[p * T + s] = Math.pow(1 - s / (T - 1), 1.6);
    if (s < T - 1) { idx[(p * (T - 1) + s) * 2] = p * T + s; idx[(p * (T - 1) + s) * 2 + 1] = p * T + s + 1; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(hist, 3));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const obj = new THREE.LineSegments(g, lineMaterial('#e8ecf5', 0));
  obj.frustumCulled = false; obj.renderOrder = 2; obj.visible = false; scene.add(obj);
  const v = new THREE.Vector3();
  let field = null, active = N;
  function spawn(p) {
    plat[p] = Math.asin(Math.random() * 2 - 1) * R2D * 0.96; plon[p] = Math.random() * 360 - 180; life[p] = 70 + Math.random() * 160;
    ll(plat[p], plon[p], 1.006, v);
    for (let s = 0; s < T; s++) { const o = (p * T + s) * 3; hist[o] = v.x; hist[o + 1] = v.y; hist[o + 2] = v.z; }
  }
  function sample(lat, lon, out) {
    const f = field, fy = clamp((lat - f.lat0) / f.dLat, 0, f.rows - 1.001), fx = ((lon - f.lon0) / f.dLon % f.cols + f.cols) % f.cols;
    const y0 = Math.floor(fy), x0 = Math.floor(fx), x1 = (x0 + 1) % f.cols, ty = fy - y0, tx = fx - x0;
    const a = y0 * f.cols + x0, b = y0 * f.cols + x1, c = (y0 + 1) * f.cols + x0, d = (y0 + 1) * f.cols + x1;
    out.u = (f.u[a] * (1 - tx) + f.u[b] * tx) * (1 - ty) + (f.u[c] * (1 - tx) + f.u[d] * tx) * ty;
    out.v = (f.v[a] * (1 - tx) + f.v[b] * tx) * (1 - ty) + (f.v[c] * (1 - tx) + f.v[d] * tx) * ty;
  }
  const w = { u: 0, v: 0 };
  return {
    obj, fade: 0,
    setField(f) { field = f; for (let p = 0; p < N; p++) spawn(p); },
    has() { return !!field; },
    setShare(f) { active = Math.max(200, Math.round(N * f)); g.setDrawRange(0, active * (T - 1) * 2); },
    at(lat, lon) { if (!field) return null; sample(lat, lon, w); return { speed: Math.hypot(w.u, w.v), from: (Math.atan2(-w.u, -w.v) * R2D + 360) % 360 }; },
    step(dt) {
      if (!field) return;
      hist.copyWithin(3, 0, hist.length - 3);
      const k = 0.011 * dt;
      for (let p = 0; p < active; p++) {
        sample(plat[p], plon[p], w);
        const sp = Math.hypot(w.u, w.v);
        if (--life[p] <= 0 || sp < 0.4 || Math.abs(plat[p]) > 86) { spawn(p); continue; }
        plat[p] += w.v * k; plon[p] = wrapLon(plon[p] + w.u * k / Math.max(0.15, Math.cos(plat[p] * D2R)));
        ll(plat[p], plon[p], 1.006, v);
        const o = p * T * 3; hist[o] = v.x; hist[o + 1] = v.y; hist[o + 2] = v.z;
      }
      g.attributes.position.needsUpdate = true;
    }
  };
})();

/* ---------- markers: one draw call per layer ---------- */
const MARK_VS = [
  'attribute float aSize; attribute float aAlpha; attribute float aPulse; attribute float aPhase;',
  '#ifdef INTERP',
  'attribute vec3 aPosB; uniform float uMix;',
  '#endif',
  'uniform float uPx; uniform float uZoom; uniform float uFade;',
  'varying float vAlpha; varying float vPulse; varying float vPhase; varying float vCore; varying float vPxSize;',
  'void main(){',
  '  vec3 p=position;',
  '#ifdef INTERP',
  '  p=mix(position,aPosB,uMix);',
  '#endif',
  '  vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;',
  '  float core=max(aSize*uPx*uZoom,min(aSize,1.9)*uPx);',
  '  float full=core*(aPulse>0.5?3.2:1.0)+2.0;',
  '  gl_PointSize=full; vPxSize=full; vCore=core/full;',
  '  float face=dot(normalize(p),normalize(cameraPosition-p));',
  '  float lift=length(p)-1.0;',
  '  vAlpha=aAlpha*uFade*smoothstep(0.02-lift*4.0,0.28-lift*4.0,face); vPulse=aPulse; vPhase=aPhase;',
  '}'
].join('\n');
const MARK_FS = [
  'uniform vec3 uColor; uniform float uShape; uniform float uTime;',
  'varying float vAlpha; varying float vPulse; varying float vPhase; varying float vCore; varying float vPxSize;',
  'void main(){',
  '  vec2 p=gl_PointCoord*2.-1.; p.y=-p.y;',
  '  float px=2.0/vPxSize; vec2 q=p/vCore; float qpx=px/vCore; float a=0.0;',
  '  if(uShape<0.5){ a=1.0-smoothstep(1.0-min(qpx*1.5,0.72),1.0,length(q)); }',
  '  else if(uShape<1.5){ float r=length(q); float th=max(0.11,qpx*0.9);',
  '    float ring=1.0-smoothstep(th-qpx,th,abs(r-(1.0-th)));',
  '    float fill=(1.0-smoothstep(1.0-th,1.0,r))*0.2; a=max(ring,fill); }',
  '  else if(uShape<2.5){ a=1.0-smoothstep(1.0-qpx*1.5,1.0,abs(q.x)+abs(q.y)); }',
  '  else if(uShape<3.5){ vec2 t=q; t.y+=0.25; float d=max(abs(t.x)*0.866025+t.y*0.5,-t.y)-0.5; a=1.0-smoothstep(-qpx,qpx*0.5,d); }',
  '  else if(uShape<4.5){ a=1.0-smoothstep(0.8-qpx*1.5,0.8,max(abs(q.x),abs(q.y))); }',
  '  else if(uShape<5.5){ a=1.0-smoothstep(1.0-qpx*2.5,1.0,pow(abs(q.x),0.62)+pow(abs(q.y),0.62)); }',
  '  else { vec2 h=abs(q); float d=max(h.x*0.5+h.y*0.866025,h.x); float th=max(0.2,qpx*1.1);',          /* a hexagon standing on a flat side: outline, faint fill and a nucleus */
  '    float edge=1.0-smoothstep(th-qpx,th,abs(d-(0.92-th)));',
  '    float fill=(1.0-smoothstep(0.92-th,0.92,d))*0.24;',
  '    float core=1.0-smoothstep(0.3-qpx,0.3+qpx*0.5,length(q)); a=max(max(edge,fill),core); }',
  '  if(vPulse>0.5){ float t=fract(uTime*0.42+vPhase); float pr=mix(vCore,1.0-px*2.0,t);',
  '    float ring=1.0-smoothstep(px*0.6,px*2.2,abs(length(p)-pr)); a=max(a,ring*(1.0-t)*(1.0-t)*0.85); }',
  '  if(a<0.01) discard;',
  '  gl_FragColor=vec4(uColor,a*vAlpha);',
  '}'
].join('\n');

class MarkerLayer {
  constructor(key, opts) {
    opts = opts || {};
    const def = LAYERS[key];
    this.key = key; this.items = []; this.cap = 0; this.on = isOn(key); this.fade = this.on ? 1 : 0; this.interp = !!opts.interp;
    this.geo = new THREE.BufferGeometry();
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uPx: U.uPx, uZoom: U.uZoom, uFade: { value: this.fade }, uMix: { value: 0 }, uColor: { value: new THREE.Color(def.color) }, uShape: { value: def.shape } },
      defines: opts.interp ? { INTERP: '' } : {},
      vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false; this.pts.renderOrder = opts.order || 3; this.pts.visible = this.on;
    scene.add(this.pts);
  }
  ensure(n) {
    if (n <= this.cap) return;
    this.cap = Math.ceil(n * 1.25) + 8;
    this.pos = new Float32Array(this.cap * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    if (this.interp) { this.posB = new Float32Array(this.cap * 3); this.geo.setAttribute('aPosB', new THREE.BufferAttribute(this.posB, 3)); }
    for (const name of ['aSize', 'aAlpha', 'aPulse', 'aPhase']) {
      this[name] = new Float32Array(this.cap);
      this.geo.setAttribute(name, new THREE.BufferAttribute(this[name], 1));
    }
  }
  set(items) {
    this.items = items;
    const n = items.length; this.ensure(n);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      this.pos[i * 3] = it.v.x; this.pos[i * 3 + 1] = it.v.y; this.pos[i * 3 + 2] = it.v.z;
      this.aSize[i] = it.size; this.aAlpha[i] = it.alpha == null ? 1 : it.alpha;
      this.aPulse[i] = it.pulse && !reduceMotion ? 1 : 0; this.aPhase[i] = (i * 0.6180339) % 1;
    }
    for (const name in this.geo.attributes) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, n);
  }
  movePositions() {
    const items = this.items;
    for (let i = 0; i < items.length; i++) { const v = items[i].v; this.pos[i * 3] = v.x; this.pos[i * 3 + 1] = v.y; this.pos[i * 3 + 2] = v.z; }
    if (this.geo.attributes.position) this.geo.attributes.position.needsUpdate = true;
  }
  show(on) { this.on = on; }
  tickFade() {
    const t = this.on ? 1 : 0;
    if (this.fade !== t) { this.fade += (t - this.fade) * (reduceMotion ? 1 : 0.18); if (Math.abs(t - this.fade) < 0.01) this.fade = t; this.mat.uniforms.uFade.value = this.fade; }
    this.pts.visible = this.fade > 0.005;
  }
}
/* ---------- start-up progress ring: one segment per feed, drawn around the globe and always facing the camera ---------- */
const bootRing = (function () {
  const u = { uTime: reduceMotion ? { value: 0 } : U.uTime, uN: { value: 24 }, uDone: { value: 0 }, uActive: { value: 0 }, uFade: { value: 0 }, uBurst: { value: 0 },
    uIgnite: { value: 2 }, uRim: { value: 0 }, uHit: { value: -1 }, uHitAge: { value: 1 }, uFlash: { value: 0 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec2 vP; void main(){ vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: [
      'uniform float uTime; uniform float uN; uniform float uDone; uniform float uActive; uniform float uFade; uniform float uBurst; varying vec2 vP;',
      'uniform float uIgnite; uniform float uRim; uniform float uHit; uniform float uHitAge; uniform float uFlash;',
      'float ringAt(float r,float r0,float w){ return 1.0-smoothstep(w*0.45,w,abs(r-r0)); }',
      'void main(){',
      '  float rr=length(vP)/0.88; float r=rr/(1.0+uBurst*0.42); if(rr<1.10||rr>max(1.75*(1.0+uBurst*0.42),1.56+uBurst*1.64)) discard;',
      '  float t=fract(atan(vP.x,vP.y)/6.2831853+1.0);',
      /* the main ring: finished feeds are bright, the ones loading now flicker, the rest wait */
      '  float seg=floor(t*uN); float f=fract(t*uN);',
      '  float gap=smoothstep(0.0,0.09,f)*smoothstep(1.0,0.91,f);',
      '  float lit=seg<uDone?1.0:(seg<uDone+uActive?0.26+0.5*(0.5+0.5*sin(uTime*8.0-seg*1.3)):0.085);',
      /* powering up: nothing shows until a spark has run once round the ring, lighting each segment as it passes */
      '  float on=step(t,uIgnite);',
      '  float c=ringAt(r,1.44,0.017)*gap*lit*on;',
      '  c+=ringAt(r,1.44,0.04)*exp(-pow((t-uIgnite)/0.03,2.0))*step(uIgnite,1.02)*1.5;',
      /* a leading spark on the newest finished segment */
      '  float head=clamp(1.0-abs(t*uN-uDone)*0.9,0.0,1.0)*step(0.5,uDone)*step(uDone,uN-0.5);',
      '  c+=ringAt(r,1.44,0.05)*head*0.5*on;',
      /* an instrument scale outside, turning slowly */
      '  float t2=fract(t+uTime*0.008); float cell=fract(t2*144.0);',
      '  float tick=1.0-smoothstep(0.07,0.16,min(cell,1.0-cell));',
      '  float major=step(mod(floor(t2*144.0+0.5),12.0),0.5);',
      '  c+=tick*smoothstep(1.50,1.505,r)*(1.0-smoothstep(1.522+0.03*major,1.528+0.03*major,r))*(0.22+0.3*major)*on;',
      /* a hairline inside with a comet running round it, and three short arcs drifting the other way outside */
      '  float sweep=fract(t-uTime*0.13);',
      '  c+=ringAt(r,1.345,0.008)*(0.13+0.9*pow(sweep,7.0));',
      '  c+=ringAt(r,1.62,0.008)*step(0.86,fract((t+uTime*0.035)*3.0))*0.34;',
      /* light racing round the edge of the planet as its atmosphere comes on */
      '  c+=(ringAt(rr,1.158,0.024)*pow(fract(t-uTime*0.21),9.0)*1.25+ringAt(rr,1.158,0.012)*0.10)*uRim;',
      /* each feed that lands sends a pulse of light down a spoke from its segment into the planet */
      '  float da=abs(fract(t-(uHit+0.5)/uN+0.5)-0.5);',
      '  float spoke=(1.0-smoothstep(0.0010,0.0034,da))*step(1.175,rr)*step(rr,1.425)*step(0.0,uHit);',
      '  c+=spoke*(0.10+1.2*exp(-pow((rr-mix(1.425,1.175,uHitAge))/0.035,2.0)))*(1.0-uHitAge);',
      /* going live: every segment flares, and a ring of light races outward */
      '  c*=1.0+2.4*uFlash;',
      '  c+=ringAt(rr,1.44+uBurst*1.6,0.018+0.075*uBurst)*(1.0-uBurst)*step(0.001,uBurst)*1.1;',
      '  gl_FragColor=vec4(vec3(0.86,0.91,1.0),c*uFade);',
      '}'
    ].join('\n')
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), m);
  mesh.renderOrder = 9; mesh.frustumCulled = false; scene.add(mesh);
  return { mesh, u };
})();

const layers = {};
for (const key of MARKER_KEYS) {
  layers[key] = new MarkerLayer(key, {
    additive: key === 'starlink', interp: SAT_KEYS.includes(key),
    order: key === 'stations' ? 5 : JUNK[key] ? 2.5 : SAT_KEYS.includes(key) ? 3.5 : (LAYERS[key].small ? 3 : 4)      /* debris is drawn first, so working satellites always show on top of it */
  });
}
const layerOn = key => (layers[key] ? layers[key].on : LAYERS[key] ? isOn(key) : true);

/* a great-circle arc between two points, lifted in the middle (flight routes) */
function arcInto(obj, a, b, lift) {
  const pos = obj.geometry.attributes.position.array, al = obj.geometry.attributes.aAlpha.array, n = al.length;
  const va = ll(a.lat, a.lon, 1), vb = ll(b.lat, b.lon, 1), v = new THREE.Vector3();
  const ang = va.angleTo(vb), sn = Math.sin(ang) || 1e-6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), ka = Math.sin((1 - t) * ang) / sn, kb = Math.sin(t * ang) / sn;
    v.set(va.x * ka + vb.x * kb, va.y * ka + vb.y * kb, va.z * ka + vb.z * kb).normalize().multiplyScalar(1.006 + lift * Math.sin(Math.PI * t));
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; al[i] = 0.25 + 0.55 * Math.sin(Math.PI * t);
  }
  obj.geometry.attributes.position.needsUpdate = true; obj.geometry.attributes.aAlpha.needsUpdate = true;
}
function circleInto(obj, n, rho, r) {
  const _u = new THREE.Vector3(0, 1, 0).cross(n), fp = obj.geometry.attributes.position.array, cnt = fp.length / 3 - 1;
  if (_u.lengthSq() < 1e-6) _u.set(1, 0, 0); _u.normalize();
  const _w = n.clone().cross(_u), cr = Math.cos(rho) * r, sr = Math.sin(rho) * r;
  for (let i = 0; i <= cnt; i++) {
    const a = i / cnt * Math.PI * 2, ca = Math.cos(a) * sr, sa = Math.sin(a) * sr;
    fp[i * 3] = n.x * cr + _u.x * ca + _w.x * sa; fp[i * 3 + 1] = n.y * cr + _u.y * ca + _w.y * sa; fp[i * 3 + 2] = n.z * cr + _u.z * ca + _w.z * sa;
  }
  obj.geometry.attributes.position.needsUpdate = true;
}

/* ============================================================
   Camera, controls, sizing
   ============================================================ */
const controls = new THREE.OrbitControls(camera, canvas);
controls.enablePan = false;
controls.enableZoom = false;                       /* zoom is handled below so it can glide */
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.13;
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.22;

const home = { lat: 18, lon: clamp(-new Date().getTimezoneOffset() / 4, -180, 180) };   /* face the viewer's side of the planet */
ll(home.lat, home.lon, view.fit, camera.position);
let zoomTarget = view.fit;

function camLL() {
  const p = camera.position, d = p.length();
  return { lat: Math.asin(p.y / d) * R2D, lon: Math.atan2(-p.z, p.x) * R2D, dist: d };
}
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  if (!w || !h) return;
  const wasFit = Math.abs(zoomTarget - view.fit) < 0.02;
  view.w = w; view.h = h; view.phone = w <= 860;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (view.phone) camera.setViewOffset(w, h, 0, Math.round(h * 0.15), w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const t = Math.tan(camera.fov * D2R / 2);
  const radiusPx = view.phone ? Math.min(0.22 * h, 0.45 * w) : view.bare ? Math.min(0.42 * h, 0.46 * w) : Math.min(0.39 * h, 0.46 * Math.max(w - 700, 380));
  view.fit = 1 / Math.sin(Math.atan(radiusPx / (h / 2) * t));
  controls.maxDistance = view.fit * 4.6;
  U.uScale.value = h * renderer.getPixelRatio() / (2 * t);
  if (wasFit) { zoomTarget = view.fit; camera.position.setLength(view.fit); }
  if (typeof onResize === 'function') onResize();
}

/* smooth camera moves in lat/lon so north always stays up */
let fly = null;
function flyTo(lat, lon, dist, keepSpin) {
  const c = camLL();
  const d1 = clamp(dist == null ? Math.min(c.dist, view.fit) : dist, controls.minDistance, controls.maxDistance);
  if (!keepSpin) setSpin(false);
  lat = clamp(lat, -84, 84); zoomTarget = d1;
  if (reduceMotion) { ll(lat, lon, d1, camera.position); return; }
  const dLon = wrapLon(lon - c.lon), dLat = lat - c.lat;
  const span = Math.min(1, Math.hypot(dLon, dLat) / 180);
  fly = { lat0: c.lat, lon0: c.lon, d0: c.dist, dLat, dLon, d1, t0: performance.now(), dur: 650 + 750 * span };
}
function stepFly(now) {
  const k = clamp((now - fly.t0) / fly.dur, 0, 1);
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  ll(fly.lat0 + fly.dLat * e, fly.lon0 + fly.dLon * e, fly.d0 + (fly.d1 - fly.d0) * e, camera.position);
  if (k >= 1) fly = null;
}
function setSpin(on) {
  controls.autoRotate = on;
  const b = $('#view-spin'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
}
function zoomBy(f) { fly = null; zoomTarget = clamp(1 + (zoomTarget - 1) * f, controls.minDistance, controls.maxDistance); }

/* ============================================================
   Projection, occlusion, picking
   ============================================================ */
const VP = new THREE.Matrix4();
function occluded(p) {
  const c = camera.position;
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
  const t = clamp(-(c.x * dx + c.y * dy + c.z * dz) / (dx * dx + dy * dy + dz * dz), 0, 1);
  const x = c.x + dx * t, y = c.y + dy * t, z = c.z + dz * t;
  return x * x + y * y + z * z < 0.994;
}
const scr = { x: 0, y: 0 };
function project(p) {
  const e = VP.elements;
  const w = e[3] * p.x + e[7] * p.y + e[11] * p.z + e[15];
  if (w <= 0) return false;
  scr.x = ((e[0] * p.x + e[4] * p.y + e[8] * p.z + e[12]) / w * 0.5 + 0.5) * view.w;
  scr.y = (1 - ((e[1] * p.x + e[5] * p.y + e[9] * p.z + e[13]) / w * 0.5 + 0.5)) * view.h;
  return true;
}
function pick(cx, cy) {
  let best = null, bestScore = Infinity;
  const zoom = U.uZoom.value, overGlobe = !!globePoint(cx, cy);
  for (let o = 0; o < PICK_ORDER.length; o++) {
    const key = PICK_ORDER[o], L = layers[key];
    if (!L.on || !L.items.length) continue;
    if (overGlobe && DENSE[key]) continue;          /* crowded satellite shells can be clicked against space, not through the globe */
    if (L.sync) L.sync();
    const items = L.items, small = LAYERS[key].small, pad = small ? 5 : 7;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (occluded(it.v) || !project(it.v)) continue;
      const d = Math.hypot(scr.x - cx, scr.y - cy);
      if (d > Math.max(it.size * zoom * 0.5, 4) + pad) continue;
      const score = d + o * 0.6 + (small ? 4 : 0) - (key === 'stations' ? 1000 : 0);
      if (score < bestScore) { bestScore = score; best = it; }
    }
  }
  return best;
}
/* where a screen point meets the globe, or null if it misses */
const _ray = new THREE.Vector3();
function globePoint(cx, cy) {
  _ray.set(cx / view.w * 2 - 1, -(cy / view.h * 2 - 1), 0.5).unproject(camera).sub(camera.position).normalize();
  const o = camera.position, b = o.dot(_ray), c = o.lengthSq() - 1, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? vecLL(_ray.clone().multiplyScalar(t).add(o)) : null;
}

/* rendering quality steps down on slow machines: fewer pixels, fewer wind streaks, no glass blur */
function setQuality(level) {
  quality.level = level;
  const dpr = Math.max(1, quality.max * [1, 0.75, 0.5][level]);
  renderer.setPixelRatio(dpr); U.uPx.value = dpr;
  wind.setShare([1, 0.6, 0.35][level]);
  app.classList.toggle('lowfx', level >= 2);
  resize();
}
