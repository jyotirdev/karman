#!/usr/bin/env python3
"""Builds the embedded star map: the stars a person can see with the naked eye, in their real places.

   python3 tools/make-stars.py --from bsc5-short.json   cut the catalogue down to data/stars.csv, then pack it
   python3 tools/make-stars.py                          pack data/stars.csv into assets/stars.b64

The catalogue is the Yale Bright Star Catalogue, 5th edition (Hoffleit and Warren, 1991), which is in the public domain;
bsc5-short.json is Bretton Wade's JSON conversion of it (github.com/brettonw/YaleBrightStarCatalog, MIT). Kept: every star
of magnitude 6.5 or brighter, which is the faintest the eye can make out under a truly dark sky.

Packed, each star is six bytes: right ascension and declination as 16-bit fractions of the circle and half-circle (J2000),
then brightness and colour temperature as one byte each (see BYTE below)."""
import base64, csv, json, math, os, re, struct, sys

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
P = lambda *a: os.path.join(root, *a)
FAINTEST = 6.5
BYTE = 'magnitude = byte / 30 - 1.5; temperature in kelvin = 2000 * 2 ** (byte / 51)'

def extract(path):
    stars = json.load(open(path, encoding='utf-8'))
    hms = lambda s: [float(x) for x in re.findall(r'[\d.]+', s)]
    rows = []
    for s in stars:
        v = float(s['V'])
        if v > FAINTEST: continue
        h, m, sec = hms(s['RA']); d, dm, ds = hms(s['Dec'])
        dec = (d + dm / 60 + ds / 3600) * (-1 if s['Dec'].strip().startswith(('-', '−')) else 1)
        rows.append((int(s['HR']), s.get('N', ''), round((h + m / 60 + sec / 3600) * 15, 4), round(dec, 4), v, int(float(s.get('K', 6000)))))
    rows.sort(key=lambda r: r[4])
    with open(P('data', 'stars.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(['# Yale Bright Star Catalogue, 5th edition (public domain), via github.com/brettonw/YaleBrightStarCatalog. Cut down by tools/make-stars.py to magnitude %.1f and brighter. Positions are J2000, in degrees.' % FAINTEST])
        w.writerow(['hr', 'name', 'ra', 'dec', 'magnitude', 'kelvin'])
        w.writerows(rows)
    print('stars: %d read, %d kept' % (len(stars), len(rows)))

def pack():
    with open(P('data', 'stars.csv'), newline='', encoding='utf-8') as f:
        next(f); rows = list(csv.DictReader(f))
    out = bytearray()
    for r in rows:
        ra, dec, v, k = float(r['ra']), float(r['dec']), float(r['magnitude']), float(r['kelvin'])
        out += struct.pack('<HHBB', min(65535, round(ra / 360 * 65536)), round((dec + 90) / 180 * 65535),
                           max(0, min(255, round((v + 1.5) * 30))), max(0, min(255, round(51 * math.log2(max(2000, k) / 2000)))))
    open(P('assets', 'stars.b64'), 'w').write(base64.b64encode(bytes(out)).decode())
    print('assets/stars.b64: %d stars, %d bytes' % (len(rows), os.path.getsize(P('assets', 'stars.b64'))))

if __name__ == '__main__':
    if '--from' in sys.argv: extract(sys.argv[sys.argv.index('--from') + 1])
    pack()
