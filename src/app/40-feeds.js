/* ============================================================
   Feeds: Earth (USGS, NASA EONET, GDACS)
   ============================================================ */
const stripTags = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const parseUTC = s => { if (!s) return NaN; s = String(s).trim().replace(' ', 'T'); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z'); };

function styleQuake(q, now) {
  const age = now - q.time;
  q.size = Math.min(46, 3 + 1.8 * Math.pow(Math.max(q.mag, 0), 1.5));
  q.alpha = age < 36e5 ? 1 : age < 864e5 ? 0.78 : 0.45;
  q.pulse = age < 36e5 || (q.mag >= 4.5 && age < 432e5);
}
async function quakesUSGS() {
  const d = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_' + prefs.win + '.geojson', 20000, false, { keep: true }), out = [];
  for (const f of d.features || []) {
    const p = f.properties, g = f.geometry;
    if (!p || !g || !g.coordinates || p.type !== 'earthquake' || p.mag == null) continue;
    out.push({ id: f.id, lat: g.coordinates[1], lon: g.coordinates[0], depth: g.coordinates[2], mag: +p.mag, place: p.place || 'Unnamed location', time: p.time, url: p.url, felt: p.felt, alert: p.alert, tsunami: p.tsunami, status: p.status, sig: p.sig });
  }
  if (d.__stale) out.stale = d.__stale;
  return out;
}
/* backup: the European-Mediterranean Seismological Centre, which also reports worldwide */
async function quakesEMSC() {
  const span = { hour: 36e5, day: 864e5, week: 6048e5 }[prefs.win] || 864e5;
  const d = await getJSON('https://www.seismicportal.eu/fdsnws/event/1/query?format=json&orderby=time&limit=' + (prefs.win === 'week' ? 2000 : 800) + '&start=' + new Date(Date.now() - span).toISOString().slice(0, 19), 30000);
  return (d.features || []).map(f => {
    const p = f.properties || {};
    return { id: 'emsc' + (p.unid || f.id), lat: +p.lat, lon: +p.lon, depth: Math.abs(+p.depth), mag: +p.mag, place: cap(String(p.flynn_region || 'Unnamed region').toLowerCase()), time: Date.parse(p.time),
      url: p.unid ? 'https://www.seismicportal.eu/eventdetails.html?unid=' + encodeURIComponent(p.unid) : null, status: 'reported by EMSC' };
  }).filter(q => isFinite(q.lat) && isFinite(q.lon) && isFinite(q.mag) && isFinite(q.time));
}
async function loadQuakes() {
  setStatus('usgs', 'load');
  try {
    const list = await firstOf('usgs', [['USGS', quakesUSGS], ['European seismology centre (EMSC)', quakesEMSC],
      ['saved copy', async () => { const o = await savedCopy('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_' + prefs.win + '.geojson'); const out = (o.features || []).filter(f => f.properties && f.geometry && f.properties.mag != null).map(f => ({ id: f.id, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], depth: f.geometry.coordinates[2], mag: +f.properties.mag, place: f.properties.place || 'Unnamed location', time: f.properties.time, url: f.properties.url, status: f.properties.status })); out.stale = o.__stale; return out; }]]);
    const now = Date.now(), items = list.map(q => { q.layer = 'quakes'; q.title = 'M ' + q.mag.toFixed(1) + '  ' + q.place; q.v = ll(q.lat, q.lon, 1.004); styleQuake(q, now); return q; });
    items.sort((a, b) => b.time - a.time);
    applyItems('quakes', items);
    okStatus('usgs', list.stale ? { __stale: list.stale } : null);
  } catch (e) { setStatus('usgs', 'err', errNote(e)); }
}

const stormTracks = new THREE.Group(); scene.add(stormTracks);
function arcPoints(a, b, out, r) {
  const va = ll(a[1], a[0], 1), vb = ll(b[1], b[0], 1);
  const steps = Math.max(1, Math.ceil(va.angleTo(vb) / (2 * D2R)));
  for (let i = 0; i < steps; i++) {
    out.push(va.clone().lerp(vb, i / steps).normalize().multiplyScalar(r), va.clone().lerp(vb, (i + 1) / steps).normalize().multiplyScalar(r));
  }
}
async function loadEvents() {
  setStatus('eonet', 'load');
  try {
    const d = await getJSON('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30', 30000, false, KEEP);
    const groups = { fires: [], storms: [], volcanoes: [], ice: [], other: [] };
    for (const ev of d.events || []) {
      const cat = (ev.categories && ev.categories[0]) || {};
      const pts = [];
      for (const g of ev.geometry || []) {
        let c = null;
        if (g.type === 'Point') c = g.coordinates;
        else if (g.type === 'Polygon' && g.coordinates && g.coordinates[0] && g.coordinates[0].length) {
          const ring = g.coordinates[0]; let x = 0, y = 0;
          for (const p of ring) { x += p[0]; y += p[1]; }
          c = [x / ring.length, y / ring.length];
        }
        if (c && isFinite(c[0]) && isFinite(c[1])) pts.push({ c, t: Date.parse(g.date), mag: g.magnitudeValue, unit: g.magnitudeUnit });
      }
      if (!pts.length) continue;
      const last = pts[pts.length - 1], key = EONET_MAP[cat.id] || 'other';
      const it = { layer: key, id: ev.id, title: ev.title || 'Unnamed event', kind: key === 'other' ? cat.title : null,
        lat: last.c[1], lon: last.c[0], time: last.t || Date.now(), mag: last.mag, magUnit: last.unit,
        sources: ev.sources, track: pts.map(p => p.c),
        size: key === 'storms' ? 11 : key === 'volcanoes' ? 13 : key === 'fires' ? 8 : 9, alpha: 0.95, pulse: key === 'storms' || key === 'volcanoes' };
      it.v = ll(it.lat, it.lon, 1.005);
      groups[key].push(it);
    }
    while (stormTracks.children.length) { const c = stormTracks.children.pop(); c.geometry.dispose(); c.material.dispose(); }
    for (const s of groups.storms) {
      if (s.track.length < 2) continue;
      const segs = [];
      for (let i = 0; i < s.track.length - 1; i++) arcPoints(s.track[i], s.track[i + 1], segs, 1.004);
      const line = makeLine(segs.length, LAYERS.storms.color, THREE.LineSegments);
      scene.remove(line); stormTracks.add(line);
      const pos = line.geometry.attributes.position.array, al = line.geometry.attributes.aAlpha.array;
      segs.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; al[i] = 0.12 + 0.6 * (i / segs.length); });
    }
    for (const key of EVENT_KEYS) { groups[key].sort((a, b) => b.time - a.time); applyItems(key, groups[key]); }
    okStatus('eonet', d);
  } catch (e) { setStatus('eonet', 'err', errNote(e)); }
}

async function loadAlerts() {
  setStatus('gdacs', 'load');
  try {
    const iso = t => new Date(t).toISOString().slice(0, 10);
    const d = await getJSON('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC,FL,VO,DR,WF&alertlevel=Orange;Red&fromDate=' +
      iso(Date.now() - 14 * 864e5) + '&toDate=' + iso(Date.now() + 864e5), 25000, false, KEEP);
    const names = { TC: 'Tropical cyclone alert', FL: 'Flood alert', VO: 'Volcano alert', DR: 'Drought alert', WF: 'Wildfire alert', EQ: 'Earthquake alert' };
    const items = [];
    for (const f of d.features || []) {
      const p = f.properties || {}, g = f.geometry;
      if (!g || g.type !== 'Point' || String(p.iscurrent) === 'false') continue;
      const title = p.name || p.eventname || 'Disaster alert', desc = stripTags(p.htmldescription || p.description);
      const it = { layer: 'alerts', id: p.eventtype + p.eventid, title, desc: desc && desc !== title ? desc : '', kind: names[p.eventtype] || 'Disaster alert',
        level: p.alertlevel || 'Orange', severity: p.severitydata && p.severitydata.severitytext, country: p.country,
        from: parseUTC(p.fromdate), time: parseUTC(p.datemodified || p.todate) || Date.now(), url: p.url && p.url.report,
        lat: g.coordinates[1], lon: g.coordinates[0], alpha: 0.95 };
      it.size = it.level === 'Red' ? 13 : 10; it.pulse = it.level === 'Red';
      it.v = ll(it.lat, it.lon, 1.005); items.push(it);
    }
    items.sort((a, b) => b.time - a.time);
    applyItems('alerts', items);
    okStatus('gdacs', d);
  } catch (e) { setStatus('gdacs', 'err', errNote(e)); }
}
