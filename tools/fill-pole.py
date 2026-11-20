#!/usr/bin/env python3
"""Fill in the South Pole.

Both datasets the globe's surface is made from stop short of the pole: NASA's elevation image (assets/surf.jpg) is blank
south of about 84.3 S, and the land outline that assets/land.b64 was rasterised from closes along about 85 S. On the globe
that left a round black hole with no land dots where the middle of Antarctica should be.

This script fills those last few degrees once, in the two files themselves, so the page needs no special case:

  surf.jpg   Each column carries on south from the height it has just north of the gap and eases towards the height of the
             pole itself (2,835 m), smoothed more and more along the way, so that nothing comes to a point at the pole.
             The ripples JPEG left beside the old hard edge are smoothed out. Only the bottom 40 rows of the image are written. Every other 8 x 8 block of the JPEG keeps its exact
             coefficients, so the rest of the planet is bit-for-bit what it was.
  land.b64   Rows south of 84 S are set from the filled image (land wherever it is above sea level), which keeps the dots
             and the surface under them in agreement. Rows north of that are left alone.

It is safe to run again: each file is left alone if it is already right. Run it after regenerating either file
(tools/landmask.js rebuilds land.b64 with the gap in it).

Needs:  pip install numpy pillow jpeglib
Usage:  python3 tools/fill-pole.py [--surf assets/surf.jpg] [--land assets/land.b64] [--check]
"""
import argparse, base64, io, math, os, sys
import numpy as np
from PIL import Image
import jpeglib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIRST_EMPTY = 991          # first row of the image with no real data (84.3 S); everything from here down is filled
REF_ROWS = (986, 991)      # the rows just north of it that the fill carries on from
RIPPLE_ROWS = (984, 992)   # the last real rows, which carry ripples from the hard edge the image used to end in, and the first filled one
BLOCK = 8
POLE = 135.0               # grey level of the South Pole's 2,835 m, read off the image's own scale (Dome A, 4,093 m, is 193)
SEA = 24                   # grey levels at or below this are sea (the page uses the same threshold, 0.094 of 255)
MASK_STEP, MASK_COLS, MASK_SOUTH_OF = 0.6, 600, -84.0      # the dot grid of tools/landmask.js
CODEC = 'mozjpeg403'       # writes the coefficients back as a progressive file with optimised tables, as the original is, so it stays as small

def dct_matrix():
    c = np.zeros((8, 8))
    for k in range(8):
        for n in range(8):
            c[k, n] = (math.sqrt(1 / 8) if k == 0 else math.sqrt(2 / 8)) * math.cos((2 * n + 1) * k * math.pi / 16)
    return c

C = dct_matrix()

def blur_ring(row, sigma):
    """Gaussian blur along a row that wraps round the planet."""
    n = len(row); f = np.fft.rfftfreq(n)
    return np.fft.irfft(np.fft.rfft(row) * np.exp(-2 * (math.pi * f * sigma) ** 2), n)

def fill(pixels):
    """The image with the gap filled. Rows above FIRST_EMPTY are returned untouched."""
    out = pixels.astype(float).copy(); h, w = out.shape
    ref = out[REF_ROWS[0]:REF_ROWS[1]].mean(axis=0)
    for y in range(FIRST_EMPTY, h):
        t = (y - FIRST_EMPTY + 1) / (h - FIRST_EMPTY)                     # 0 at the edge of the gap, 1 at the pole
        ease = min(1.0, t / 0.72); ease = ease * ease * (3 - 2 * ease)    # the last degree and a half is one even height
        out[y] = blur_ring(ref, 5 + 70 * t) * (1 - ease) + POLE * ease
    # The image used to end in a hard edge here, and JPEG leaves ripples beside a hard edge: the last few real rows go up and
    # down by a few grey levels from one to the next, which the relief shading turns into rings round the pole. Averaging
    # each with its neighbours above and below (1-2-1) takes exactly that ripple out.
    calm = out.copy()
    for y in range(RIPPLE_ROWS[0], RIPPLE_ROWS[1]): calm[y] = (out[y - 1] + 2 * out[y] + out[y + 1]) / 4
    return np.clip(np.rint(calm), 0, 255).astype(np.uint8)

def blocks_from_pixels(strip, qt):
    """Quantised DCT coefficients of a strip of pixels whose height and width are multiples of 8, as [row, column, 8, 8]."""
    h, w = strip.shape
    b = (strip.astype(float) - 128).reshape(h // BLOCK, BLOCK, w // BLOCK, BLOCK).transpose(0, 2, 1, 3)
    return np.rint(np.einsum('ij,rcjk,lk->rcil', C, b, C) / qt).astype(np.int16)

def pixels_from_blocks(blocks, qt):
    p = np.einsum('ji,rcjk,kl->rcil', C, blocks.astype(float) * qt, C) + 128
    r, c = blocks.shape[:2]
    return np.clip(np.rint(p.transpose(0, 2, 1, 3).reshape(r * BLOCK, c * BLOCK)), 0, 255)

def mask_rows():
    """(latitude, dots in the row, index of its first bit) for every row of the dot grid, south to north."""
    rows, bit = [], 0
    for i in range(round(180 / MASK_STEP)):
        lat = -90 + (i + 0.5) * MASK_STEP; n = max(1, round(MASK_COLS * math.cos(math.radians(lat))))
        rows.append((lat, n, bit)); bit += n
    return rows

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--surf', default=os.path.join(ROOT, 'assets', 'surf.jpg'))
    ap.add_argument('--land', default=os.path.join(ROOT, 'assets', 'land.b64'))
    ap.add_argument('--check', action='store_true', help='report what would change and write nothing')
    args = ap.parse_args()

    before = np.asarray(Image.open(args.surf).convert('L')); h, w = before.shape
    after, jpg, y0 = before, None, 0

    # ---- the elevation image
    if before[FIRST_EMPTY + 9:].mean() > SEA:
        print('surf.jpg: the pole is already filled.')
    else:
        jpeglib.version.set(CODEC)
        jpg = jpeglib.read_dct(args.surf); qt = np.asarray(jpg.qt[0], dtype=float); first_block = FIRST_EMPTY // BLOCK; y0 = first_block * BLOCK
        # the library's block layout must be the one assumed here: rebuild some untouched rows from their coefficients and compare
        probe = slice(60, 64)
        if np.abs(pixels_from_blocks(jpg.Y[probe], qt) - before[probe.start * BLOCK:probe.stop * BLOCK]).max() > 2:
            sys.exit('Could not reproduce the image from its own coefficients; refusing to write.')
        after = fill(before)
        jpg.Y[first_block:] = blocks_from_pixels(after[y0:], qt)
        print('surf.jpg: filling rows %d to %d (%.1f S to the pole); rewriting %d of %d blocks' % (FIRST_EMPTY, h - 1, -(90 - (FIRST_EMPTY + 0.5) * 180 / h), (jpg.Y.shape[0] - first_block) * jpg.Y.shape[1], jpg.Y.shape[0] * jpg.Y.shape[1]))

    # ---- the land mask: south of 84 S it follows the image, whether the image was filled just now or earlier
    bits = bytearray(base64.b64decode(open(args.land).read().strip())); changed = 0
    for lat, n, bit in mask_rows():
        if lat >= MASK_SOUTH_OF: break
        y = min(h - 1, int((90 - lat) / 180 * h))
        for j in range(n):
            x = min(w - 1, int((j + 0.5) / n * w)); k = bit + j
            land = after[y, x] > SEA; was = bool(bits[k >> 3] & (1 << (k & 7)))
            if land != was:
                changed += 1
                if land: bits[k >> 3] |= 1 << (k & 7)
                else: bits[k >> 3] &= ~(1 << (k & 7))
    print('land.b64: %d dots south of %.0f S change' % (changed, -MASK_SOUTH_OF) if changed else 'land.b64: already agrees with the image.')
    if args.check:
        print('Checked only: nothing written.'); return 0

    if jpg is not None:
        tmp = args.surf + '.tmp'; jpg.write_dct(tmp)
        written = np.asarray(Image.open(tmp).convert('L'))
        if not np.array_equal(written[:y0], before[:y0]):
            os.remove(tmp); sys.exit('Rows that should not have changed did; nothing written.')
        os.replace(tmp, args.surf)
        worst = np.abs(written[y0:].astype(int) - after[y0:].astype(int)).max()
        print('surf.jpg written: rows 0 to %d are bit-for-bit unchanged, the filled rows are within %d grey levels of what was asked for, %d bytes.' % (y0 - 1, worst, os.path.getsize(args.surf)))
    if changed:
        with open(args.land, 'w') as f: f.write(base64.b64encode(bytes(bits)).decode())
        print('land.b64 written.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
