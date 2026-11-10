"""Generate the three images app.json references.

They were never created, so any Expo build fails validation with "field icon:
does not exist". Simple flat marks are enough for a build gate; replace with the
real artwork when design supplies it.
"""
from PIL import Image, ImageDraw
import os

out = r"B:\B\tax-app\apps\mobile\assets"
os.makedirs(out, exist_ok=True)

BG = (2, 132, 199)      # sky-600, the splash background in app.json
FG = (255, 255, 255)


def mark(size: int, background, radius_ratio: float = 0.22) -> Image.Image:
    img = Image.new("RGBA", (size, size), background)
    draw = ImageDraw.Draw(img)
    # A simple "document with a check" glyph: two rounded bars and a tick.
    w = size
    pad = int(w * 0.26)
    bar_h = int(w * 0.09)
    for index in range(2):
        top = pad + index * int(w * 0.18)
        draw.rounded_rectangle(
            [pad, top, w - pad, top + bar_h],
            radius=bar_h // 2,
            fill=FG,
        )
    # tick
    lw = max(2, int(w * 0.06))
    draw.line(
        [(int(w * 0.36), int(w * 0.66)), (int(w * 0.46), int(w * 0.76)), (int(w * 0.66), int(w * 0.52))],
        fill=FG,
        width=lw,
        joint="curve",
    )
    return img


mark(1024, BG).save(os.path.join(out, "icon.png"))
mark(1284, BG).save(os.path.join(out, "splash-icon.png"))

# Android adaptive icon: transparent foreground, background supplied by app.json.
fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
glyph = mark(1024, BG)
mask = Image.new("L", (1024, 1024), 0)
ImageDraw.Draw(mask).ellipse([128, 128, 896, 896], fill=255)
fg.paste(glyph, (0, 0), mask)
fg.save(os.path.join(out, "adaptive-icon.png"))

for name in ("icon.png", "splash-icon.png", "adaptive-icon.png"):
    path = os.path.join(out, name)
    print(name, os.path.getsize(path), "bytes")
