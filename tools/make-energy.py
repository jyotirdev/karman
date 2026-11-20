#!/usr/bin/env python3
"""Builds the embedded energy map from Global Energy Monitor's trackers (CC BY 4.0):

   assets/energy.json   the largest power stations, the gas pipelines and the LNG terminals, packed for the page

It works in two steps, so the page can be rebuilt without the 80 MB of source files:

   python3 tools/make-energy.py --from DIR   read GEM's own files in DIR, write the cut-down extracts in data/, then pack them
   python3 tools/make-energy.py              pack the extracts already in data/

DIR needs two files, exactly as Global Energy Monitor publishes them for its own tracker maps:
   gipt-data-YYYY-MM-DD.csv     Global Integrated Power Tracker (one row per generating unit)
   ggit_YYYY-MM-DD.geojson      Global Gas Infrastructure Tracker (pipeline routes and LNG terminals)
data/README.md says where to get them. The extracts in data/ are the record of what is in the page:
   data/energy-plants.csv, data/energy-pipelines.geojson, data/energy-lng.csv

What is kept ("the bigger ones", see KEEP_MW and PIPE_KM): power stations running at or over a size that depends on the fuel, and ones
being built to twice that size; gas pipelines of 200 km or more that are running, being built or standing idle; LNG terminals that are
running or being built. By capacity that is about three quarters of the world's coal power, nearly half its gas power, two thirds of its
hydropower and a quarter of its solar and wind power, and 85% of its gas pipeline by length, in about 330 KB.
Nuclear stations are left out: the page already carries the IAEA's reactor list."""
import csv, json, math, os, re, sys, glob, collections
from urllib.parse import unquote

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(root, *a)
csv.field_size_limit(10 ** 9)

KEEP_MW = {'coal': 1000, 'gas': 1000, 'hydro': 500, 'solar': 300, 'wind': 300}      # megawatts running; a station still being built needs twice this
FUEL = {'coal': 'coal', 'oil/gas': 'gas', 'hydropower': 'hydro', 'solar': 'solar', 'wind': 'wind'}
PIPE_KM = 200
WIKI = 'https://www.gem.wiki/'
num = lambda v: float(v) if re.fullmatch(r'-?\d+(\.\d+)?', str(v or '').strip()) else 0.0
clean = lambda s: re.sub(r'\s+', ' ', str(s or '')).strip()
places = lambda s: '; '.join(x.strip() for x in str(s or '').split(';') if x.strip())

# ---------------------------------------------------------------- geometry
def km(a, b):
    p1, p2 = math.radians(a[1]), math.radians(b[1]); dl = math.radians(b[0] - a[0])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(min(1, math.sqrt(h)))
length = lambda parts: sum(km(p[i], p[i + 1]) for p in parts for i in range(len(p) - 1))

def rdp(pts, tol):
    """Douglas-Peucker: drop points that sit within `tol` degrees of the line through their neighbours."""
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); ax, ay = pts[a]; bx, by = pts[b]; k = math.cos(math.radians((ay + by) / 2)) or 1e-6
        dx, dy = (bx - ax) * k, by - ay; L = math.hypot(dx, dy); best, at = 0, -1
        for i in range(a + 1, b):
            px, py = (pts[i][0] - ax) * k, pts[i][1] - ay
            dist = abs(px * dy - py * dx) / L if L > 1e-12 else math.hypot(px, py)
            if dist > best: best, at = dist, i
        if best > tol: keep[at] = True; stack += [(a, at), (at, b)]
    return [p for p, k in zip(pts, keep) if k]

def chains(parts, grid):
    """Some networks are drawn as tens of thousands of tiny pieces, with parallel pipes doubled up. Snap them to a grid,
    keep each stretch once, and walk the result into as few lines as possible."""
    snap = lambda p: (round(p[0] / grid) * grid, round(p[1] / grid) * grid)
    adj = collections.defaultdict(set)
    for part in parts:
        q = [snap(p) for p in part]
        for a, b in zip(q, q[1:]):
            if a != b: adj[a].add(b); adj[b].add(a)
    used, out = set(), []
    def walk(a, b):
        line = [a, b]; used.update([(a, b), (b, a)])
        while len(adj[b]) == 2:
            c = next(x for x in adj[b] if x != a)
            if (b, c) in used: break
            used.update([(b, c), (c, b)]); line.append(c); a, b = b, c
        return line
    for ends_first in (True, False):
        for n in sorted(adj):
            if ends_first and len(adj[n]) == 2: continue
            for m in sorted(adj[n]):
                if (n, m) not in used: out.append(walk(n, m))
    return out

def polyline(points, prec=100):
    """The same packing as the undersea cables: runs of small steps, two decimal places of a degree."""
    out, plat, plon = [], 0, 0
    def enc(v):
        v = ~(v << 1) if v < 0 else (v << 1); s = ''
        while v >= 0x20: s += chr((0x20 | (v & 0x1f)) + 63); v >>= 5
        return s + chr(v + 63)
    for lon, lat in points:
        la, lo = round(lat * prec), round(lon * prec)
        if out and la == plat and lo == plon: continue
        out.append(enc(la - plat) + enc(lo - plon)); plat, plon = la, lo
    return ''.join(out) if len(out) > 1 else ''

# ---------------------------------------------------------------- step 1: GEM's files -> data/
def one(folder, pattern):
    hits = sorted(glob.glob(os.path.join(folder, pattern)))
    if not hits: sys.exit('No %s in %s. See data/README.md for where Global Energy Monitor publishes it.' % (pattern, folder))
    return hits[-1]
edition = lambda path: re.search(r'(\d{4}-\d{2}-\d{2})', os.path.basename(path)).group(1)
def need(path, have, wanted):
    missing = [c for c in wanted if c not in have]
    if missing: sys.exit('%s has no %s. Global Energy Monitor has changed the layout of this file; the names are used in extract() in tools/make-energy.py.' % (os.path.basename(path), ', '.join(missing)))

def extract(folder):
    # ---- power stations: one row per unit in, one row per station out
    src = one(folder, 'gipt-data-*.csv'); stations = collections.OrderedDict()
    table = csv.DictReader(open(src, newline='', encoding='utf-8'))
    need(src, table.fieldnames, ['type', 'country/area', 'plant-/-project-name', 'capacity-(mw)', 'status', 'start-year', 'technology', 'fuel', 'lat', 'lng', 'gem-location-id', 'url'])
    for x in table:
        fuel = FUEL.get(x['type'])
        if not fuel: continue
        try: lat, lon = float(x['lat']), float(x['lng'])
        except ValueError: continue
        if not (-90 <= lat <= 90 and -180 <= lon <= 180): continue
        s = stations.setdefault((x['gem-location-id'], fuel), dict(fuel=fuel, name=clean(x['plant-/-project-name']), country=places(x['country/area']), lat=lat, lon=lon,
            wiki=clean(x['url'].replace('\n', '')), id=x['gem-location-id'], mw=0, building=0, planned=0, units=0, years=[], kind=collections.Counter(), burns=collections.Counter()))
        mw, st = num(x['capacity-(mw)']), x['status']
        if st == 'operating':
            s['mw'] += mw; s['units'] += 1; s['kind'][clean(x['technology']).lower()] += mw; s['burns'][clean(x['fuel']).split(':')[0].lower()] += mw
            if num(x['start-year']): s['years'].append(int(num(x['start-year'])))
        elif st == 'construction':
            s['building'] += mw
            if not s['mw']: s['kind'][clean(x['technology']).lower()] += mw; s['burns'][clean(x['fuel']).split(':')[0].lower()] += mw
        elif st in ('pre-construction', 'announced'): s['planned'] += mw
    kept = [s for s in stations.values() if s['mw'] >= KEEP_MW[s['fuel']] or s['building'] >= 2 * KEEP_MW[s['fuel']]]
    kept.sort(key=lambda s: (s['fuel'], s['country'], s['name'].lower()))
    with open(P('data', 'energy-plants.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['# Global Integrated Power Tracker, Global Energy Monitor, edition of ' + edition(src) + '. CC BY 4.0. Cut down by tools/make-energy.py: stations of at least ' +
                    ', '.join('%d MW (%s)' % (v, k) for k, v in KEEP_MW.items()) + ' running, or twice that being built; units added up per station.'])
        w.writerow(['fuel', 'name', 'country', 'lat', 'lon', 'running_mw', 'building_mw', 'planned_mw', 'running_units', 'first_year', 'kind', 'burns', 'gem_location_id', 'wiki'])
        for s in kept:
            top = lambda c: c.most_common(1)[0][0] if c else ''
            w.writerow([s['fuel'], s['name'], s['country'], '%.3f' % s['lat'], '%.3f' % s['lon'], round(s['mw']), round(s['building']), round(s['planned']), s['units'],
                        min(s['years']) if s['years'] else '', top(s['kind']), top(s['burns']), s['id'], s['wiki']])
    print('power stations: %d units read, %d stations kept' % (sum(1 for _ in open(src, encoding='utf-8')) - 1, len(kept)), dict(collections.Counter(s['fuel'] for s in kept)))

    # ---- gas pipelines and LNG terminals
    src = one(folder, 'ggit_*.geojson'); feats = json.load(open(src, encoding='utf-8'))['features']
    need(src, feats[0]['properties'].keys(), ['id', 'name', 'status', 'areas', 'capacity', 'start-year', 'url', 'tracker-custom'])
    pipes = []
    for f in feats:
        g, p = f.get('geometry'), f['properties']
        if not g or g['type'] not in ('LineString', 'MultiLineString') or p['status'] not in ('operating', 'construction', 'idle', 'mothballed'): continue
        parts = [[(c[0], c[1]) for c in part] for part in (g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']])]
        full = length(parts)
        if full < PIPE_KM: continue
        if len(parts) > 12: parts = chains(parts, 0.04)
        parts = [rdp(q, 0.06) for q in parts]
        parts = [q for q in parts if len(q) > 1 and (len(parts) < 4 or length([q]) >= 20)]          # the stubs of a big network are left out
        parts = [[[round(x, 2), round(y, 2)] for x, y in q] for q in parts]
        parts = [q for q in parts if polyline(q)]
        if not parts: continue
        pipes.append({'type': 'Feature', 'properties': {'name': clean(p['name']), 'status': 'idle' if p['status'] in ('idle', 'mothballed') else p['status'], 'start_year': int(num(p.get('start-year'))) or None,
            'km': round(full), 'bcm_per_year': num(p.get('capacity')) or None, 'countries': places(p.get('areas')), 'owner': clean(p.get('owner')), 'gem_id': p['id'], 'wiki': clean(p.get('url'))},
            'geometry': {'type': 'MultiLineString', 'coordinates': parts}})
    pipes.sort(key=lambda f: f['properties']['name'].lower())
    json.dump({'type': 'FeatureCollection', 'name': 'Global Gas Infrastructure Tracker, Global Energy Monitor, edition of ' + edition(src) + '. CC BY 4.0. Cut down by tools/make-energy.py: gas pipelines of ' +
               str(PIPE_KM) + ' km or more that are running, being built or idle; routes simplified to about 6 km.', 'features': pipes},
              open(P('data', 'energy-pipelines.geojson'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('gas pipelines: %d kept, %d km' % (len(pipes), sum(f['properties']['km'] for f in pipes)))

    terms = collections.OrderedDict()
    for f in feats:
        g, p = f.get('geometry'), f['properties']
        if not g or g['type'] != 'Point' or p['status'] not in ('operating', 'construction'): continue
        way = 'export' if 'export' in str(p.get('tracker-custom')) else 'import'
        t = terms.setdefault((clean(p['name']), way), dict(name=clean(p['name']), way=way, country=places(p.get('areas')), lat=g['coordinates'][1], lon=g['coordinates'][0], wiki=clean(p.get('url')), mtpa=0, building=0, years=[], units=0))
        cap = num(p.get('capacity'))
        if p['status'] == 'operating':
            t['mtpa'] += cap; t['units'] += 1
            if num(p.get('start-year')): t['years'].append(int(num(p['start-year'])))
        else: t['building'] += cap
    rows = sorted(terms.values(), key=lambda t: (t['country'], t['name'].lower(), t['way']))
    with open(P('data', 'energy-lng.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['# Global Gas Infrastructure Tracker, Global Energy Monitor, edition of ' + edition(src) + '. CC BY 4.0. Cut down by tools/make-energy.py: LNG terminals running or being built; phases added up per terminal.'])
        w.writerow(['name', 'way', 'country', 'lat', 'lon', 'running_mtpa', 'building_mtpa', 'running_phases', 'first_year', 'wiki'])
        for t in rows: w.writerow([t['name'], t['way'], t['country'], '%.3f' % t['lat'], '%.3f' % t['lon'], round(t['mtpa'], 2), round(t['building'], 2), t['units'], min(t['years']) if t['years'] else '', t['wiki']])
    print('LNG terminals: %d kept' % len(rows))

# ---------------------------------------------------------------- step 2: data/ -> assets/energy.json
def short(name, endings):
    """Most names end the same way ("... power station"); the ending is swapped for one character and put back by the page."""
    for mark, end in endings:
        if name.endswith(end) and len(name) > len(end): return name[:-len(end)] + mark
    return name
def wiki_if_odd(name, wiki):
    """The wiki page is nearly always the name with underscores; only the exceptions are stored."""
    slug = unquote(re.sub(r'^https?://(www\.)?gem\.wiki/', '', wiki))
    return [] if slug == name.replace(' ', '_') or not re.match(r'https?://(www\.)?gem\.wiki/', wiki) else [slug]

def pack():
    def table(path):
        with open(path, newline='', encoding='utf-8') as f:
            note = next(f).strip().strip('"'); return note, list(csv.DictReader(f))
    ENDS = {'coal': [('~', ' power station')], 'gas': [('~', ' power station'), ('^', ' power plant')], 'hydro': [('~', ' hydroelectric plant'), ('^', ' dam')],
            'solar': [('~', ' solar farm'), ('^', ' solar project')], 'wind': [('~', ' wind farm'), ('^', ' wind project')]}
    note, rows = table(P('data', 'energy-plants.csv'))
    countries, kinds = [], []
    idx = lambda lst, v: lst.index(v) if v in lst else (lst.append(v) or len(lst) - 1)
    plants = collections.OrderedDict((k, []) for k in KEEP_MW)
    for r in rows:
        kind = ('oil, ' if r['fuel'] == 'gas' and r['burns'] == 'fossil liquids' else '') + r['kind']
        plants[r['fuel']].append([short(r['name'], ENDS[r['fuel']]), round(float(r['lat']), 2), round(float(r['lon']), 2), int(r['running_mw']), int(r['first_year'] or 0), int(r['running_units']),
                                  int(r['building_mw']), idx(countries, r['country']), idx(kinds, kind)] + wiki_if_odd(r['name'], r['wiki']))
    geo = json.load(open(P('data', 'energy-pipelines.geojson'), encoding='utf-8'))
    PEND = [('~', ' Gas Pipeline'), ('^', ' Pipeline')]
    pipes = []
    for f in geo['features']:
        p = f['properties']
        pipes.append([short(p['name'], PEND), {'operating': 0, 'construction': 1, 'idle': 2}[p['status']], p['start_year'] or 0, p['km'], p['bcm_per_year'] or 0, idx(countries, p['countries']),
                      ' '.join(polyline(q) for q in f['geometry']['coordinates'])] + wiki_if_odd(p['name'], p['wiki']))
    lnote, lrows = table(P('data', 'energy-lng.csv'))
    lng = [[short(r['name'], [('~', ' LNG Terminal')]), round(float(r['lat']), 2), round(float(r['lon']), 2), 1 if r['way'] == 'export' else 0, float(r['running_mtpa']), float(r['building_mtpa']),
            int(r['first_year'] or 0), idx(countries, r['country'])] + wiki_if_odd(r['name'], r['wiki']) for r in lrows]
    when = lambda s: re.search(r'edition of (\d{4}-\d{2})', s).group(1)
    out = {'power': when(note), 'gas': when(geo['name']), 'countries': countries, 'kinds': kinds, 'ends': {k: [e for _, e in v] for k, v in ENDS.items()}, 'plants': plants, 'pipes': pipes, 'lng': lng}
    json.dump(out, open(P('assets', 'energy.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(P('assets', 'energy.json'))
    part = lambda v: len(json.dumps(v, ensure_ascii=False, separators=(',', ':')).encode())
    print('assets/energy.json: %d bytes  (power stations %d: %d | pipelines %d: %d | LNG %d: %d)' % (size, sum(len(v) for v in plants.values()), part(plants), len(pipes), part(pipes), len(lng), part(lng)))

if __name__ == '__main__':
    if '--from' in sys.argv: extract(sys.argv[sys.argv.index('--from') + 1])
    pack()
