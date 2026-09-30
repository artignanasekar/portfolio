"""Turn the hand photos into sprites for hand.html.

usage: python3 scripts/build-hand-sprites.py <photos dir> <masks dir>

Each photo is an arm coming in from the left edge, shot against a wall. The
masks are the subject cutouts from macOS Vision (VNGenerateForegroundInstance-
MaskRequest), one grayscale PNG per photo with the same name.

Every pose is normalised so they can be swapped in place: the sleeve is
levelled, scaled to the same height, and flipped so the hand points left (out
of the portal). The cuff centre is written to poses.json as the anchor. Colour
is left continuous and warm-graded; the page does the dithering at runtime.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SLEEVE_H = 140  # sleeve height at the cuff, in sprite px (= CSS px on the page)
OUT = Path(__file__).resolve().parent.parent / 'public/assets/hand'


def column_counts(mask):
    return (mask > 127).sum(axis=0)


def sleeve_extent(mask):
    """Sleeve height and the x where the cuff ends (arm enters from the left)."""
    counts = column_counts(mask)
    # levelling leaves empty wedges at the edge; skip into the sleeve proper
    start = int(np.argmax(counts > counts.max() * 0.5)) + 10
    h = np.median(counts[start:start + int(len(counts) * 0.2)])
    cuff = start
    while cuff < len(counts) - 1 and counts[cuff + 1] > 0.7 * h:
        cuff += 1
    return h, cuff


def centre_y(mask, x):
    ys = np.nonzero(mask[:, x] > 127)[0]
    return (ys.min() + ys.max()) / 2


def warm(rgb):
    """Lift and warm the photo: a touch more contrast, shadows pushed toward
    brown, navy stripes pulled toward warm ink."""
    a = rgb.astype(np.float32) / 255
    a = np.clip((a - 0.5) * 1.12 + 0.5 + 0.03, 0, 1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # the stripes photographed dim: lift the saturated reds so they read as
    # red, not brown, without touching skin
    red = np.clip((r - 1.8 * g) * 4, 0, 1)
    r = np.clip(r * (1.06 + 0.45 * red) + 0.02, 0, 1)
    g = g * (1 + 0.25 * red)
    b = b * 0.86
    return (np.stack([r, g, b], -1) * 255).astype(np.uint8)


def build(photo, mask_path):
    im = Image.open(photo).convert('RGB')
    mask = Image.open(mask_path).convert('L').resize(im.size)
    m = np.array(mask)

    # level the sleeve: fit a line through its centre along the forearm
    h, cuff = sleeve_extent(m)
    xs = np.arange(int(cuff * 0.15), int(cuff * 0.95))
    slope = np.polyfit(xs, [centre_y(m, x) for x in xs], 1)[0]
    angle = np.degrees(np.arctan(slope))
    im = im.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=(0, 0, 0))
    mask = mask.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=0)
    m = np.array(mask)

    # scale so the sleeve is SLEEVE_H tall
    h, cuff = sleeve_extent(m)
    s = SLEEVE_H / h
    size = (round(im.width * s), round(im.height * s))
    im = im.resize(size, Image.LANCZOS)
    mask = mask.resize(size, Image.LANCZOS)
    # pull the edge in a hair so no wall colour fringes the cutout
    mask = mask.filter(ImageFilter.MinFilter(3))
    m = np.array(mask)
    h, cuff = sleeve_extent(m)
    cy = centre_y(m, max(cuff - 6, 0))

    # flip so the hand points left, then crop to the arm
    rgba = np.dstack([warm(np.array(im)), m])[:, ::-1]
    cuff = rgba.shape[1] - 1 - cuff
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    rgba = rgba[y0:y1, x0:x1]
    return Image.fromarray(rgba), {
        'w': int(x1 - x0),
        'h': int(y1 - y0),
        'cuffX': int(cuff - x0),
        'cuffY': round(float(cy - y0), 1),
        'leveled': round(float(angle), 2),
    }


def main():
    photos, masks = Path(sys.argv[1]), Path(sys.argv[2])
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for photo in sorted(photos.glob('*.jpg')):
        sprite, info = build(photo, masks / f'{photo.stem}.png')
        sprite.save(OUT / f'{photo.stem}.png', optimize=True)
        meta[photo.stem] = info
        print(photo.stem, info)
    (OUT / 'poses.json').write_text(json.dumps(meta, indent=2) + '\n')


if __name__ == '__main__':
    main()
