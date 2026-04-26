from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[4]
OUT_DIR = Path(__file__).resolve().parent
PUBLIC_ICON = ROOT / "public" / "apple-touch-icon.png"

BASE_SIZE = 2048
AA = 2
S = BASE_SIZE * AA

COLORS = {
    "black": "#020303",
    "panel": "#0b0c0b",
    "panel_hi": "#1a1b18",
    "panel_lo": "#050606",
    "gold": "#ffd747",
    "gold_hot": "#ffe873",
    "gold_deep": "#9f7719",
    "red": "#ff2738",
    "red_hot": "#ff5d66",
}


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    hex_value = hex_value.lstrip("#")
    return (
        int(hex_value[0:2], 16),
        int(hex_value[2:4], 16),
        int(hex_value[4:6], 16),
        alpha,
    )


def box(values: tuple[float, float, float, float]) -> tuple[int, int, int, int]:
    return tuple(int(round(v * AA)) for v in values)


def pts(values: list[tuple[float, float]]) -> list[tuple[int, int]]:
    return [(int(round(x * AA)), int(round(y * AA))) for x, y in values]


def gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    a = Image.new("RGBA", size, rgba(top))
    b = Image.new("RGBA", size, rgba(bottom))
    mask = Image.linear_gradient("L").resize(size)
    return Image.composite(b, a, mask)


def diagonal_gradient(size: tuple[int, int]) -> Image.Image:
    w, h = size
    img = Image.new("RGBA", size)
    p1 = rgba("#000000")
    p2 = rgba("#10110f")
    p3 = rgba("#202018")
    pixels = img.load()
    for y in range(h):
        ym = y / max(1, h - 1)
        for x in range(w):
            xm = x / max(1, w - 1)
            t = max(0, min(1, xm * 0.56 + ym * 0.74))
            if t < 0.55:
                m = t / 0.55
                color = tuple(int(p1[i] + (p2[i] - p1[i]) * m) for i in range(4))
            else:
                m = (t - 0.55) / 0.45
                color = tuple(int(p2[i] + (p3[i] - p2[i]) * m) for i in range(4))
            pixels[x, y] = color
    return img


def add_noise(img: Image.Image, alpha: int = 7) -> None:
    random.seed(183)
    w, h = img.size
    noise = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(noise, "RGBA")
    step = max(1, w // 800)
    for y in range(0, h, step):
        for x in range(0, w, step):
            v = random.randint(0, alpha)
            draw.point((x, y), fill=(255, 235, 180, v))
    img.alpha_composite(noise.resize((w, h), Image.Resampling.NEAREST))


def add_radial_glow(
    img: Image.Image,
    cx: float,
    cy: float,
    radius: float,
    color: str,
    alpha: int,
) -> None:
    r = int(round(radius * AA))
    size = (r * 2, r * 2)
    glow = Image.new("RGBA", size, rgba(color, alpha))
    mask = Image.radial_gradient("L").resize(size)
    mask = ImageOps.invert(mask)
    glow.putalpha(mask.point(lambda p: int(p * alpha / 255)))
    img.alpha_composite(glow, (int(round(cx * AA - r)), int(round(cy * AA - r))))


class Canvas:
    def __init__(self) -> None:
        self.img = diagonal_gradient((S, S))
        self.draw = ImageDraw.Draw(self.img, "RGBA")
        add_radial_glow(self.img, 360, 300, 620, "#ffffff", 10)
        add_radial_glow(self.img, 1390, 610, 520, COLORS["gold"], 18)
        add_radial_glow(self.img, 980, 1480, 660, "#1d1e1d", 55)
        add_noise(self.img)

    def blur_layer(self, fn, blur: float) -> None:
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        fn(ImageDraw.Draw(layer, "RGBA"))
        self.img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(int(round(blur * AA)))))

    def rounded_rect(
        self,
        rect: tuple[float, float, float, float],
        radius: float,
        fill: tuple[int, int, int, int] | None,
        outline: tuple[int, int, int, int] | None = None,
        width: float = 1,
    ) -> None:
        self.draw.rounded_rectangle(
            box(rect),
            radius=int(round(radius * AA)),
            fill=fill,
            outline=outline,
            width=max(1, int(round(width * AA))),
        )

    def glow_line(
        self,
        points: list[tuple[float, float]],
        color: str = COLORS["gold"],
        width: float = 18,
        alpha: int = 180,
        glow: float = 20,
    ) -> None:
        self.blur_layer(
            lambda d: d.line(pts(points), fill=rgba(color, alpha), width=int(round(width * 1.5 * AA)), joint="curve"),
            glow,
        )
        self.draw.line(
            pts(points),
            fill=rgba(COLORS["gold_deep"], 210),
            width=max(1, int(round((width + 5) * AA))),
            joint="curve",
        )
        self.draw.line(
            pts(points),
            fill=rgba(color, 255),
            width=max(1, int(round(width * AA))),
            joint="curve",
        )
        self.draw.line(
            pts(points),
            fill=rgba(COLORS["gold_hot"], 175),
            width=max(1, int(round(width * 0.38 * AA))),
            joint="curve",
        )

    def glow_arc(
        self,
        rect: tuple[float, float, float, float],
        start: float,
        end: float,
        width: float,
        color: str = COLORS["gold"],
        alpha: int = 220,
        glow: float = 16,
    ) -> None:
        self.blur_layer(
            lambda d: d.arc(box(rect), start=start, end=end, fill=rgba(color, alpha), width=int(round(width * 1.45 * AA))),
            glow,
        )
        self.draw.arc(
            box(rect),
            start=start,
            end=end,
            fill=rgba(COLORS["gold_deep"], 210),
            width=max(1, int(round((width + 5) * AA))),
        )
        self.draw.arc(
            box(rect),
            start=start,
            end=end,
            fill=rgba(color, 255),
            width=max(1, int(round(width * AA))),
        )
        self.draw.arc(
            box(rect),
            start=start,
            end=end,
            fill=rgba(COLORS["gold_hot"], 160),
            width=max(1, int(round(width * 0.34 * AA))),
        )

    def gold_dot(self, x: float, y: float, r: float = 23, alpha: int = 255) -> None:
        self.blur_layer(
            lambda d: d.ellipse(box((x - r * 1.8, y - r * 1.8, x + r * 1.8, y + r * 1.8)), fill=rgba(COLORS["gold"], 72)),
            20,
        )
        self.draw.ellipse(box((x - r, y - r, x + r, y + r)), fill=rgba(COLORS["gold"], alpha))
        self.draw.ellipse(box((x - r * 0.45, y - r * 0.55, x + r * 0.12, y + r * 0.02)), fill=(255, 255, 230, 125))

    def red_led(self, x: float, y: float, r: float = 52) -> None:
        self.blur_layer(
            lambda d: d.ellipse(box((x - r * 2.2, y - r * 2.2, x + r * 2.2, y + r * 2.2)), fill=rgba(COLORS["red"], 126)),
            32,
        )
        self.blur_layer(
            lambda d: d.ellipse(box((x - r * 1.16, y - r * 1.16, x + r * 1.16, y + r * 1.16)), fill=rgba(COLORS["red_hot"], 104)),
            9,
        )
        self.draw.ellipse(box((x - r, y - r, x + r, y + r)), fill=rgba(COLORS["red"], 255))
        self.draw.ellipse(box((x - r * 0.36, y - r * 0.5, x + r * 0.1, y - r * 0.04)), fill=(255, 195, 190, 118))


def draw_scan_wedge(c: Canvas) -> None:
    cx, cy = 1024, 1024
    start = math.radians(-35)
    end = math.radians(-15)
    inner = 160
    outer = 610
    points = [
        (cx + math.cos(start) * inner, cy + math.sin(start) * inner),
        (cx + math.cos(start) * outer, cy + math.sin(start) * outer),
        (cx + math.cos(end) * outer, cy + math.sin(end) * outer),
        (cx + math.cos(end) * inner, cy + math.sin(end) * inner),
    ]
    layer = Image.new("RGBA", c.img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer, "RGBA")
    draw.polygon(pts(points), fill=rgba(COLORS["gold"], 78))
    layer = layer.filter(ImageFilter.GaussianBlur(11 * AA))
    c.img.alpha_composite(layer)
    c.glow_line([(cx + math.cos(start) * 170, cy + math.sin(start) * 170), (cx + math.cos(start) * 655, cy + math.sin(start) * 655)], width=12, alpha=190, glow=18)


def draw_corner_box(c: Canvas, x: float, y: float, kind: str) -> None:
    size = 270
    radius = 78
    c.blur_layer(
        lambda d: d.rounded_rectangle(box((x, y, x + size, y + size)), radius=int(round(radius * AA)), fill=(0, 0, 0, 156)),
        28,
    )
    c.rounded_rect((x, y, x + size, y + size), radius, fill=rgba("#070807", 220), outline=rgba(COLORS["gold_deep"], 190), width=13)
    c.rounded_rect((x + 7, y + 7, x + size - 7, y + size - 7), radius - 6, fill=None, outline=rgba(COLORS["gold_hot"], 235), width=7)

    cx = x + size / 2
    cy = y + size / 2
    if kind == "live":
        c.red_led(cx, cy, 51)
    elif kind == "camera":
        c.rounded_rect((cx - 58, cy - 44, cx + 52, cy + 44), 17, fill=rgba(COLORS["gold"], 255), outline=rgba(COLORS["gold_hot"], 200), width=3)
        tri = [(cx + 66, cy - 27), (cx + 99, cy - 50), (cx + 99, cy + 50), (cx + 66, cy + 27)]
        c.blur_layer(lambda d: d.polygon(pts(tri), fill=rgba(COLORS["gold"], 76)), 9)
        c.draw.polygon(pts(tri), fill=rgba(COLORS["gold"], 255))
    elif kind == "stop":
        c.rounded_rect((cx - 51, cy - 51, cx + 51, cy + 51), 13, fill=rgba(COLORS["gold"], 255), outline=rgba(COLORS["gold_hot"], 180), width=3)
    elif kind == "play":
        tri = [(cx - 35, cy - 62), (cx - 35, cy + 62), (cx + 76, cy)]
        c.blur_layer(lambda d: d.polygon(pts(tri), fill=rgba(COLORS["gold"], 76)), 12)
        c.draw.polygon(pts(tri), fill=rgba(COLORS["gold"], 255))


def draw_dotted_connector(c: Canvas, start: tuple[float, float], end: tuple[float, float], count: int = 6) -> None:
    sx, sy = start
    ex, ey = end
    for idx in range(count):
        t = (idx + 1) / (count + 1)
        x = sx + (ex - sx) * t
        y = sy + (ey - sy) * t
        c.gold_dot(x, y, 12 + idx * 0.6, alpha=220)


def draw_radar(c: Canvas) -> None:
    cx, cy = 1024, 1024
    c.blur_layer(
        lambda d: d.ellipse(box((382, 382, 1666, 1666)), outline=rgba(COLORS["gold"], 150), width=34 * AA),
        18,
    )
    c.glow_arc((382, 382, 1666, 1666), 0, 360, 24, alpha=240, glow=12)

    for r, a, width in [(510, 77, 4), (365, 93, 5), (215, 98, 6)]:
        c.draw.ellipse(box((cx - r, cy - r, cx + r, cy + r)), outline=rgba(COLORS["gold_deep"], a), width=width * AA)

    for angle in [0, 45, 90, 135, 180, 225, 270, 315]:
        rad = math.radians(angle)
        inner = 190 if angle % 90 else 120
        outer = 560
        c.draw.line(
            pts([(cx + math.cos(rad) * inner, cy + math.sin(rad) * inner), (cx + math.cos(rad) * outer, cy + math.sin(rad) * outer)]),
            fill=rgba(COLORS["gold_deep"], 118),
            width=4 * AA,
        )

    tick_angles = [0, 45, 90, 135, 180, 225, 270, 315]
    for angle in tick_angles:
        rad = math.radians(angle)
        r1, r2 = 555, 600
        c.glow_line(
            [(cx + math.cos(rad) * r1, cy + math.sin(rad) * r1), (cx + math.cos(rad) * r2, cy + math.sin(rad) * r2)],
            width=10,
            alpha=130,
            glow=8,
        )

    draw_scan_wedge(c)

    c.glow_arc((820, 820, 1228, 1228), 0, 360, 19, alpha=220, glow=11)
    c.blur_layer(
        lambda d: d.ellipse(box((852, 852, 1196, 1196)), fill=(0, 0, 0, 95)),
        16,
    )
    c.draw.ellipse(box((854, 854, 1194, 1194)), fill=rgba("#090a08", 220), outline=rgba(COLORS["gold"], 150), width=5 * AA)

    tri = [(984, 940), (984, 1110), (1132, 1025)]
    c.blur_layer(lambda d: d.polygon(pts(tri), fill=rgba(COLORS["gold"], 116)), 14)
    c.draw.polygon(pts(tri), fill=rgba(COLORS["gold"], 255))
    c.draw.line(pts([(984, 940), (984, 1110), (1132, 1025), (984, 940)]), fill=rgba(COLORS["gold_hot"], 145), width=3 * AA)

    for side in [-1, 1]:
        for offset in [0, 56]:
            c.glow_arc(
                (cx + side * (170 + offset) - 110, cy - 110, cx + side * (170 + offset) + 110, cy + 110),
                145 if side < 0 else -35,
                215 if side < 0 else 35,
                13,
                alpha=155,
                glow=9,
            )

    for x, y, r in [(750, 750, 27), (1406, 1216, 30), (862, 1438, 30)]:
        c.gold_dot(x, y, r)


def draw_panel(c: Canvas) -> None:
    margin = 86
    radius = 300
    c.blur_layer(
        lambda d: d.rounded_rectangle(box((margin, margin, BASE_SIZE - margin, BASE_SIZE - margin)), radius=radius * AA, fill=(0, 0, 0, 210)),
        42,
    )
    panel = gradient((S - 2 * margin * AA, S - 2 * margin * AA), COLORS["panel_hi"], COLORS["panel_lo"])
    mask = Image.new("L", panel.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, panel.size[0] - 1, panel.size[1] - 1), radius=radius * AA, fill=255)
    panel.putalpha(mask)
    c.img.alpha_composite(panel, (margin * AA, margin * AA))
    c.rounded_rect((margin, margin, BASE_SIZE - margin, BASE_SIZE - margin), radius, fill=None, outline=rgba("#ffffff", 18), width=8)
    c.rounded_rect((margin + 14, margin + 14, BASE_SIZE - margin - 14, BASE_SIZE - margin - 14), radius - 12, fill=None, outline=rgba("#000000", 110), width=4)


def generate() -> Image.Image:
    c = Canvas()
    draw_panel(c)
    draw_corner_box(c, 232, 212, "live")
    draw_corner_box(c, 1546, 212, "camera")
    draw_corner_box(c, 232, 1546, "stop")
    draw_corner_box(c, 1546, 1546, "play")
    draw_dotted_connector(c, (470, 460), (560, 560))
    draw_dotted_connector(c, (1578, 460), (1488, 560))
    draw_dotted_connector(c, (470, 1588), (560, 1488))
    draw_dotted_connector(c, (1578, 1588), (1488, 1488))
    draw_radar(c)
    return c.img.resize((BASE_SIZE, BASE_SIZE), Image.Resampling.LANCZOS).convert("RGB")


def write_readme() -> None:
    text = """# Selected LiveRadar iPhone Icon

This is the selected high-resolution iPhone icon direction based on the user's reference image.

Design notes:
- Dark rounded-square panel with subtle graphite material.
- Gold radar/playback system is the primary visual mass.
- A single red LED dot is preserved as the LiveRadar live-status signal.
- The generated `public/apple-touch-icon.png` is the active iPhone home-screen icon.

Files:
- `liveradar-iphone-icon-2048.png`: high-resolution source export.
- `liveradar-iphone-icon-1024.png`: direct source used for the active public icon.
- `preview-180.png`: iPhone touch-icon scale preview.
- `preview-64.png`: small recognizability preview.
- `generate_selected_icon.py`: repeatable local generation script.
"""
    (OUT_DIR / "README.md").write_text(text, encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    icon = generate()
    source_2048 = OUT_DIR / "liveradar-iphone-icon-2048.png"
    source_1024 = OUT_DIR / "liveradar-iphone-icon-1024.png"
    preview_180 = OUT_DIR / "preview-180.png"
    preview_64 = OUT_DIR / "preview-64.png"
    icon.save(source_2048, optimize=True)
    icon.resize((1024, 1024), Image.Resampling.LANCZOS).save(source_1024, optimize=True)
    icon.resize((1024, 1024), Image.Resampling.LANCZOS).save(PUBLIC_ICON, optimize=True)
    icon.resize((180, 180), Image.Resampling.LANCZOS).save(preview_180, optimize=True)
    icon.resize((64, 64), Image.Resampling.LANCZOS).save(preview_64, optimize=True)
    write_readme()
    for path in [source_2048, source_1024, preview_180, preview_64, PUBLIC_ICON, OUT_DIR / "README.md"]:
        print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
