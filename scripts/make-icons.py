# Generate PWA icons from public/icon-source.png: the circular crest is cut
# out of its white background and centered on solid navy squares.
from PIL import Image, ImageDraw, ImageOps
import os

SRC = "public/icon-source.png"
OUT = "public/icons"
NAVY = (22, 38, 74)  # #16264a — the app's brand navy token

src = Image.open(SRC).convert("RGB")
w, h = src.size

# Find the crest circle's bounding box: scan for non-near-white pixels.
gray = ImageOps.grayscale(src)
mask_bw = gray.point(lambda p: 255 if p < 240 else 0)
bbox = mask_bw.getbbox()
left, top, right, bottom = bbox
size = max(right - left, bottom - top)
cx, cy = (left + right) // 2, (top + bottom) // 2
half = size // 2 + 2  # tiny margin so the ring's antialiased edge survives
crop = src.crop((cx - half, cy - half, cx + half, cy + half))
d = crop.size[0]
print(f"circle bbox: {bbox} -> crop {d}x{d}")

# Circular alpha mask (supersampled for a smooth edge).
mask = Image.new("L", (d * 4, d * 4), 0)
ImageDraw.Draw(mask).ellipse((0, 0, d * 4 - 1, d * 4 - 1), fill=255)
mask = mask.resize((d, d), Image.LANCZOS)
crest = crop.copy()
crest.putalpha(mask)

def tile(px, crest_ratio, path):
    """Solid navy square with the crest centered at crest_ratio of the tile."""
    canvas = Image.new("RGB", (px, px), NAVY)
    cd = int(px * crest_ratio)
    scaled = crest.resize((cd, cd), Image.LANCZOS)
    off = (px - cd) // 2
    canvas.paste(scaled, (off, off), scaled)
    canvas.save(path, optimize=True)
    print(f"wrote {path} ({px}x{px}, crest {int(crest_ratio*100)}%)")

os.makedirs(OUT, exist_ok=True)
tile(180, 0.86, f"{OUT}/apple-touch-icon.png")
tile(192, 0.86, f"{OUT}/icon-192.png")
tile(512, 0.86, f"{OUT}/icon-512.png")
# Maskable: everything must fit the inner 80%-diameter safe circle.
tile(512, 0.72, f"{OUT}/icon-512-maskable.png")
