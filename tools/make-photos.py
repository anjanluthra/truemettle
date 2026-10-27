"""Cut the site's photographs into responsive AVIF + WebP files.

    python3 tools/make-photos.py            # every photo in PHOTOS
    python3 tools/make-photos.py founder    # just one

Sources live in photos/ at the repository root (gitignored: originals are
large and the outputs in public/img/ are what ships). Each entry names its
source, the crop that reproduces the Figma frame (as fractions of the source,
so a re-exported or larger copy of the same photo keeps working), and the
widths to emit. Nothing is upscaled: widths beyond the crop collapse to the
crop's own width.

It then rewrites the srcset/src of every element in public/index.html that
carries data-photo="<name>", so dropping in a better original is one command.

Needs Pillow with AVIF support (Pillow >= 11.3).
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'photos'
OUT = ROOT / 'public' / 'img'

FULL = (720, 1080, 1440, 2160, 2880)

# name: (source file, crop (x, y, w, h) as fractions of the source, widths)
PHOTOS = {
    'hero':    ('hero.png',    (0, 0, 1, 1), FULL),
    'band1':   ('band1.png',   (0, 0, 1, 1), FULL),
    'wide':    ('wide.png',    (0, 0, 1, 1), FULL),
    # Original sunset, 2000x1335; the band is its middle strip (Figma FILL).
    'band2':   ('band2-original.jpg', (0.0567, 0.3221, 0.8995, 0.3566), FULL),
    'footer':  ('footer.png',  (0, 0, 1, 1), FULL),
    'sport':   ('sport.png',   (0, 0, 1, 1), (400, 800, 1200)),
    'media':   ('media.png',   (0, 0, 1, 1), (400, 800, 1200)),
    # Original portrait, 2731x4096. The crop is the Figma image fill (FILL into
    # a 915x687 box) clipped by its mask to the right half of the closing panel.
    'founder': ('founder-original.jpeg', (0.0995, 0.2515, 0.787, 0.4983), (720, 1080, 1440, 2160)),
}

AVIF_QUALITY = 68
WEBP_QUALITY = 86


def build(name):
    source, (x, y, w, h), widths = PHOTOS[name]
    path = SRC / source
    if not path.exists():
        print(f'  {name}: missing {path.relative_to(ROOT)} — skipped')
        return None

    image = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    W, H = image.size
    crop = image.crop((round(x * W), round(y * H), round((x + w) * W), round((y + h) * H)))
    cw, ch = crop.size

    for old in OUT.glob(f'{name}-*.*'):
        old.unlink()

    made = []
    for width in sorted({min(wd, cw) for wd in widths}):
        height = round(ch * width / cw)
        frame = crop.resize((width, height), Image.LANCZOS) if width != cw else crop
        frame.save(OUT / f'{name}-{width}.avif', quality=AVIF_QUALITY, speed=4)
        frame.save(OUT / f'{name}-{width}.webp', quality=WEBP_QUALITY, method=6)
        made.append(width)

    print(f'  {name}: {cw}x{ch} crop -> {", ".join(map(str, made))}')
    return made


def srcset(name, made, ext):
    return ', '.join(f'/img/{name}-{w}.{ext} {w}w' for w in made)


def rewrite_html(results):
    page = ROOT / 'public' / 'index.html'
    html = page.read_text()

    def tag(match):
        text = match.group(0)
        name = re.search(r'data-photo="([^"]+)"', text).group(1)
        if name not in results:
            return text
        made = results[name]
        ext = 'avif' if 'type="image/avif"' in text else 'webp'
        text = re.sub(r' srcset="[^"]*"', f' srcset="{srcset(name, made, ext)}"', text)
        # The fallback src: the 1440 (or largest available) WebP.
        fallback = max([w for w in made if w <= 1440] or [min(made)])
        text = re.sub(r' src="[^"]*"', f' src="/img/{name}-{fallback}.webp"', text)
        return text

    html = re.sub(r'<(?:source|img)\b[^>]*data-photo="[^"]+"[^>]*>', tag, html)
    html = re.sub(r'(<link\b[^>]*data-photo="([^"]+)"[^>]*?)imagesrcset="[^"]*"',
                  lambda m: m.group(1) + f'imagesrcset="{srcset(m.group(2), results[m.group(2)], "avif")}"'
                  if m.group(2) in results else m.group(0), html)
    page.write_text(html)


def main(names):
    OUT.mkdir(parents=True, exist_ok=True)
    results = {}
    for name in names or PHOTOS:
        if name not in PHOTOS:
            sys.exit(f'unknown photo: {name}')
        made = build(name)
        if made:
            results[name] = made
    rewrite_html(results)


if __name__ == '__main__':
    main(sys.argv[1:])
