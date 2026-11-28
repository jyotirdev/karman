#!/usr/bin/env python3
"""Writes the answers the sky test checks against, worked out by PyEphem, a separate implementation of the astronomy:
where the Sun, the Moon and the brightest stars are overhead at a few fixed moments, and when a satellite on a
space-station orbit can be seen from five cities over one week.

    pip install ephem
    python3 tools/make-sky-ref.py            # writes tests/sky-ref.json (or tools/sky-ref.json beside this file)

The app's own formulas are short series good to a fraction of a degree; this file is what says so.
It only needs running again if the star file (assets/stars.b64), the moments, the orbit or the places below change.
"""
import base64, json, math, os, struct, sys
import ephem

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOMENTS = ['2026/12/23 12:00:00', '2027/03/22 12:00:00', '2027/08/02 10:07:00', '2028/07/07 06:00:00', '2031/01/01 00:00:00', '2034/10/15 18:45:00']
BRIGHTEST = 14
# an orbit like the International Space Station's (made up, not a real set of elements), and places to watch it from
ORBIT = ['1 25544U 98067A   26335.50000000  .00010000  00000-0  18000-3 0  999',
         '2 25544  51.6400 120.0000 0005000  80.0000 280.0000 15.50000000 1234']
WATCH_FROM = '2026/12/02 00:00:00'
WATCH_DAYS = 7
PLACES = [('London', 51.5, -0.13), ('Delhi', 28.6, 77.2), ('Sydney', -33.9, 151.2), ('New York', 40.7, -74.0), ('Quito', -0.2, -78.5), ('Reykjavik', 64.1, -21.9)]
HIGH, DUSK = 10.0, -6.0                                 # how high the satellite must be and how far down the Sun, in degrees: the app's own limits

def unix(when):
    return round((when - ephem.Date('1970/1/1 00:00:00')) * 86400000)

def wrap(lon):
    return (lon + 180.0) % 360.0 - 180.0

def overhead(body, when):
    """the place on Earth a body stands over: latitude is its declination, longitude its right ascension less sidereal time"""
    o = ephem.Observer(); o.lon, o.lat, o.elevation, o.pressure, o.date = '0', '0', 0, 0, when
    gst = math.degrees(o.sidereal_time())
    body.compute(when)                                  # geocentric, apparent, for the equinox of the date
    return math.degrees(body.g_dec if hasattr(body, 'g_dec') else body.dec), wrap(math.degrees(body.g_ra if hasattr(body, 'g_ra') else body.ra) - gst)

def checked(line):
    """a line of orbital elements with its check digit worked out"""
    return line + str(sum(int(c) if c.isdigit() else 1 if c == '-' else 0 for c in line) % 10)

def passes(sat, lat, lon):
    """the stretches when the satellite is high enough, in sunlight, and the place is dark: found by brute force, four seconds at a time"""
    o = ephem.Observer(); o.lat, o.lon, o.elevation, o.pressure = str(lat), str(lon), 0, 0
    sun, start = ephem.Sun(), ephem.Date(WATCH_FROM)
    out, run, step, t, end = [], [], 4 / 86400.0, float(start), float(start) + WATCH_DAYS
    while t <= end:
        o.date = t; sat.compute(o)
        alt = math.degrees(sat.alt)
        if alt < -25: t += 60 / 86400.0; continue        # far below the horizon: it cannot rise 25 degrees in a minute
        ok = False
        if alt >= HIGH and not sat.eclipsed:
            sun.compute(o)
            ok = math.degrees(sun.alt) <= DUSK
        if ok: run.append((unix(ephem.Date(t)), alt))
        elif run:
            if run[-1][0] - run[0][0] >= 40000:
                top = max(run, key=lambda r: r[1])
                out.append([run[0][0], run[-1][0], top[0], round(top[1], 2)])
            run = []
        t += step
    return out

def stars():
    raw = base64.b64decode(open(os.path.join(ROOT, 'assets', 'stars.b64')).read())
    rows = [struct.unpack_from('<HHBB', raw, i) + (i // 6,) for i in range(0, len(raw), 6)]
    rows.sort(key=lambda r: (r[2], r[4]))               # brightest first, then file order: the order the test hook uses
    return [(r[0] / 65536 * 360, r[1] / 65535 * 180 - 90) for r in rows[:BRIGHTEST]]

def main():
    out = []
    for text in MOMENTS:
        when = ephem.Date(text)
        ms = unix(when)
        sun, moon = ephem.Sun(), ephem.Moon()
        slat, slon = overhead(sun, when)
        mlat, mlon = overhead(moon, when)
        moon.compute(when)
        row = {'at': ms, 'utc': text, 'sun': [round(slat, 4), round(slon, 4)], 'moon': [round(mlat, 4), round(mlon, 4)],
               'km': round(moon.earth_distance * 149597870.7), 'lit': round(moon.phase / 100, 4),
               # the full and new moons either side of the moment: within minutes of one, either answer for "the next" is right
               'full': [unix(ephem.previous_full_moon(when)), unix(ephem.next_full_moon(when))],
               'new': [unix(ephem.previous_new_moon(when)), unix(ephem.next_new_moon(when))], 'stars': []}
        for ra, dec in stars():
            s = ephem.FixedBody(); s._ra, s._dec, s._epoch = math.radians(ra), math.radians(dec), ephem.J2000
            lat, lon = overhead(s, when)
            row['stars'].append([round(lat, 4), round(lon, 4)])
        out.append(row)
    l1, l2 = checked(ORBIT[0]), checked(ORBIT[1])
    sat = ephem.readtle('STATION', l1, l2)
    seen = [{'name': name, 'lat': lat, 'lon': lon, 'passes': passes(sat, lat, lon)} for name, lat, lon in PLACES]
    where = os.path.join(ROOT, 'tests') if os.path.isdir(os.path.join(ROOT, 'tests')) else HERE
    path = os.path.join(where, 'sky-ref.json')
    with open(path, 'w') as f:
        f.write('{"moments":[\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in out) + '\n],\n"orbit":' + json.dumps([l1, l2]) +
                ',"from":%d,"days":%d,"places":[\n' % (unix(ephem.Date(WATCH_FROM)), WATCH_DAYS) + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in seen) + '\n]}\n')
    print('wrote', path, len(out), 'moments,', ', '.join('%s %d' % (r['name'], len(r['passes'])) for r in seen), 'passes')

if __name__ == '__main__':
    main()
