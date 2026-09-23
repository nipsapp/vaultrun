"""Generate Stake Engine media: 3:4 game tile + 16:9 cover art."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "stake" / "media"
OUT.mkdir(parents=True, exist_ok=True)

bg = Image.open(ROOT / "assets/casino/casino-bg.webp").convert("RGBA")
title = Image.open(ROOT / "assets/casino/vault-title-v2.webp").convert("RGBA")
emblem = Image.open(ROOT / "assets/casino/vault-emblem.webp").convert("RGBA")

bg = ImageEnhance.Brightness(bg).enhance(1.35)
bg = ImageEnhance.Contrast(bg).enhance(1.15)
bg = ImageEnhance.Color(bg).enhance(1.2)


def make_canvas(w, h):
    scale = max(w / bg.width, h / bg.height) * 1.15
    resized = bg.resize((int(bg.width * scale), int(bg.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    canvas = resized.crop((left, top, left + w, top + h)).convert("RGBA")
    glow = Image.new("RGBA", (w, h), (255, 190, 90, 28))
    canvas = Image.alpha_composite(canvas, glow)
    edge = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle([0, 0, w, h], outline=(255, 230, 180, 90), width=max(8, w // 80))
    edge = edge.filter(ImageFilter.GaussianBlur(18))
    canvas = Image.alpha_composite(canvas, edge)
    return canvas


def paste_center(base, img, scale, y_ratio=0.42):
    tw = int(base.width * scale)
    th = int(img.height * (tw / img.width))
    im = img.resize((tw, th), Image.Resampling.LANCZOS)
    x = (base.width - tw) // 2
    y = int(base.height * y_ratio) - th // 2
    base.alpha_composite(im, (x, max(0, y)))


def to_rgb(img):
    out = Image.new("RGB", img.size, (48, 22, 62))
    out.paste(img, mask=img.split()[-1])
    return ImageEnhance.Brightness(out).enhance(1.12)


tile = make_canvas(900, 1200)
paste_center(tile, emblem, 0.42, 0.38)
paste_center(tile, title, 0.88, 0.78)
tile_path = OUT / "vault-run-tile-3x4.png"
to_rgb(tile).save(tile_path, "PNG", optimize=True)

cover = make_canvas(1920, 1080)
paste_center(cover, emblem, 0.22, 0.36)
paste_center(cover, title, 0.62, 0.72)
cover_path = OUT / "vault-run-cover-16x9.png"
to_rgb(cover).save(cover_path, "PNG", optimize=True)

print("Wrote", tile_path, tile_path.stat().st_size)
print("Wrote", cover_path, cover_path.stat().st_size)
