#!/usr/bin/env python3
"""Builds the two embedded reference datasets from the copies in data/:
   assets/cables.json   undersea cables (TeleGeography Submarine Cable Map 2026, as cleaned by Tristan Hotham; CC BY-NC-SA)
   assets/nuclear.json  power reactors (IAEA PRIS records as compiled by GeoNuclearData 0.17.17, March 2024; ODbL)"""
import json, csv, math, re, collections, os
root = os.path.join(os.path.dirname(__file__), '..')
P = lambda *a: os.path.join(root, *a)

# ---------------- cables ----------------
def polyline(points, prec=100):
    out, plat, plon = [], 0, 0
    def enc(v):
        v = ~(v << 1) if v < 0 else (v << 1); s = ''
        while v >= 0x20: s += chr((0x20 | (v & 0x1f)) + 63); v >>= 5
        return s + chr(v + 63)
    for lon, lat in points:
        la, lo = round(lat * prec), round(lon * prec)
        out.append(enc(la - plat) + enc(lo - plon)); plat, plon = la, lo
    return ''.join(out)
norm = lambda i: re.sub(r'-+', '-', i)
rows = {norm(r['id']): r for r in csv.DictReader(open(P('data', 'cables.csv'), encoding='utf-8'))}
geo = json.load(open(P('data', 'cables.geojson'), encoding='utf-8'))
PLAIN = {'Congo, Dem. Rep.': 'DR Congo', 'Congo, Rep.': 'Republic of the Congo', 'Bonaire, Sint Eustatius and Saba': 'Bonaire', 'Saint Helena, Ascension and Tristan da Cunha': 'Saint Helena', 'Virgin Islands (U.S.)': 'US Virgin Islands', 'Virgin Islands (U.K.)': 'British Virgin Islands'}
cables = []
for f in geo['features']:
    r = rows[norm(f['properties']['id'])]
    parts = f['geometry']['coordinates']
    enc = ' '.join(polyline(p) for p in parts if len(p) > 1)
    if not enc: continue
    km = r['length_km']; km = int(round(float(km))) if km else 0
    cables.append([r['name'], int(r['rfs_year']) if r['rfs_year'] else 0, 1 if r['status'] == 'planned' else 0, km, 1 if r['length_source'] != 'TeleGeography' else 0,
                   int(r['n_landings'] or 0), '; '.join(PLAIN.get(n, n) for n in r['countries'].split('; ')) if r['countries'] else '', r['owners'], enc, f['properties']['id']])
cables.sort(key=lambda c: c[0].lower())
json.dump(cables, open(P('assets', 'cables.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('cables', len(cables), os.path.getsize(P('assets', 'cables.json')), 'bytes')

# ---------------- nuclear ----------------
d = json.load(open(P('data', 'nuclear_power_plants.json'), encoding='utf-8'))
# One known slip in the source: Maanshan (southern tip of Taiwan) carries Lungmen's position. Put right here.
for x in d:
    if x['Name'].startswith('Maanshan-'): x['Latitude'], x['Longitude'] = 21.958, 120.752
have = [x for x in d if x.get('Latitude') not in (None, '') and x.get('Longitude') not in (None, '') and x['Status'] != 'Unknown']
def km(a, b):
    p1, p2 = math.radians(a['Latitude']), math.radians(b['Latitude']); dl = math.radians(b['Longitude'] - a['Longitude'])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))
par = list(range(len(have)))
def find(i):
    while par[i] != i: par[i] = par[par[i]]; i = par[i]
    return i
for i in range(len(have)):
    for j in range(i + 1, len(have)):
        if abs(have[i]['Latitude'] - have[j]['Latitude']) < 0.1 and km(have[i], have[j]) < 5: par[find(i)] = find(j)
groups = collections.defaultdict(list)
for i, x in enumerate(have): groups[find(i)].append(x)
def stem(n):
    inside = re.search(r'\((.*?)\)', n)
    n = re.sub(r'\s*\(.*?\)\s*', ' ', n).strip()
    for _ in range(3): n = re.sub(r'[\s\-–]+(Unit\s*)?([0-9]+[A-Z]?|[IVX]+|[A-D][0-9]?)$', '', n).strip(' -')
    if len(n) <= 2 and inside: n = inside.group(1) + ' ' + n          # "G-2 (Marcoule)" is Marcoule G
    return n
def common(names):                                                    # "Dounreay PFR", "Dounreay DFR" is Dounreay
    words = [x.split(' ') for x in names]; out = []
    for parts in zip(*words):
        if len(set(parts)) == 1: out.append(parts[0])
        else: break
    c = ' '.join(out)
    return c if len(c) >= 4 else ''
STATUS = ['Operational', 'Under Construction', 'Planned', 'Suspended Operation', 'Shutdown', 'Decommissioning Completed', 'Suspended Construction', 'Cancelled Construction', 'Never Commissioned']
year = lambda s: int(s[:4]) if s else 0
sites = []
for g in groups.values():
    g.sort(key=lambda x: (STATUS.index(x['Status']), x['OperationalFrom'] or x['ConstructionStartAt'] or '9', x['Name']))
    stems = collections.Counter()
    for x in g: stems[stem(x['Name']) or x['Name']] += (x['Capacity'] or 1)
    names = [n for n, _ in stems.most_common()]
    if len(names) > 1 and common(names): names = [common(names)]
    name = names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1] if len(names) <= 3 else ', '.join(names[:2]) + ' and ' + str(len(names) - 2) + ' more'
    best = [x for x in g if x['Status'] == g[0]['Status']]
    lat = sum(x['Latitude'] for x in best) / len(best); lon = sum(x['Longitude'] for x in best) / len(best)
    units = [[x['Name'], STATUS.index(x['Status']), x['ReactorType'] or '', x['ReactorModel'] or '', x['Capacity'] or 0, year(x['ConstructionStartAt']), year(x['OperationalFrom']), year(x['OperationalTo']), x['IAEAId'] or 0] for x in g]
    sites.append([name, round(lat, 4), round(lon, 4), g[0]['CountryCode'], g[0]['Country'], units])
sites.sort(key=lambda s: (s[4], s[0]))
types = {x['Type']: x['Description'] for x in json.load(open(P('data', 'nuclear_reactor_types.json'), encoding='utf-8'))}
used = sorted(set(u[2] for s in sites for u in s[5] if u[2]))
out = {'edition': '2024-03-03', 'status': STATUS, 'types': {t: types.get(t, t) for t in used}, 'sites': sites}
json.dump(out, open(P('assets', 'nuclear.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('nuclear', len(sites), 'sites', sum(len(s[5]) for s in sites), 'reactors', os.path.getsize(P('assets', 'nuclear.json')), 'bytes')
