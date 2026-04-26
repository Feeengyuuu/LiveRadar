from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


OUT_DIR = Path(__file__).resolve().parent
ICON_SIZE = 1024
AA = 3


PALETTE = {
    "black": "#020303",
    "panel": "#0b0d10",
    "panel_2": "#151922",
    "panel_3": "#222733",
    "line": "#b9bbb8",
    "line_soft": "#6b7075",
    "warm": "#f1eee4",
    "red": "#ff2738",
    "red_hot": "#ff5b66",
    "red_deep": "#8a1018",
}


ICONS = [
    ("icon-01-black-lens-signal.png", "Black Lens Signal", "Graphite glass lens with a small live LED."),
    ("icon-02-signal-aperture.png", "Signal Aperture", "Muted aperture/radar core with a live center point."),
    ("icon-03-floating-beacon.png", "Floating Beacon", "Suspended beacon module, restrained broadcast arcs."),
    ("icon-04-soft-radar-monolith.png", "Soft Radar Monolith", "Vertical dark monolith with quiet scan lines."),
    ("icon-05-live-node-orbit.png", "Live Node Orbit", "Orbital signal nodes, one red live node only."),
    ("icon-06-glass-signal-tile.png", "Glass Signal Tile", "Inset glass tile with embossed radar ripples."),
    ("icon-07-minimal-broadcast-eye.png", "Minimal Broadcast Eye", "Abstract monitoring lens with a red signal pupil."),
    ("icon-08-dark-signal-fold.png", "Dark Signal Fold", "Soft folded AI-style signal mark."),
]


def hex_to_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.strip().lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha


def scaled_box(box: tuple[float, float, float, float], scale: int = AA) -> tuple[int, int, int, int]:
    return tuple(int(round(v * scale)) for v in box)


def scaled_points(points: list[tuple[float, float]], scale: int = AA) -> list[tuple[int, int]]:
    return [(int(round(x * scale)), int(round(y * scale))) for x, y in points]


def vertical_gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    base = Image.new("RGBA", size, hex_to_rgba(top))
    overlay = Image.new("RGBA", size, hex_to_rgba(bottom))
    mask = Image.linear_gradient("L").resize(size)
    return Image.composite(overlay, base, mask)


def diagonal_gradient(size: tuple[int, int], c1: str, c2: str, c3: str) -> Image.Image:
    w, h = size
    img = Image.new("RGBA", size)
    p1 = hex_to_rgba(c1)
    p2 = hex_to_rgba(c2)
    p3 = hex_to_rgba(c3)
    px = img.load()
    for y in range(h):
        y_mix = y / max(1, h - 1)
        for x in range(w):
            x_mix = x / max(1, w - 1)
            t = min(1, max(0, (x_mix * 0.58 + y_mix * 0.72)))
            if t < 0.55:
                m = t / 0.55
                color = tuple(int(p1[i] + (p2[i] - p1[i]) * m) for i in range(4))
            else:
                m = (t - 0.55) / 0.45
                color = tuple(int(p2[i] + (p3[i] - p2[i]) * m) for i in range(4))
            px[x, y] = color
    return img


def add_radial_glow(img: Image.Image, cx: float, cy: float, radius: float, color: str, alpha: int) -> None:
    scale = img.size[0] / ICON_SIZE
    r = int(round(radius * scale))
    x = int(round(cx * scale - r))
    y = int(round(cy * scale - r))
    size = (r * 2, r * 2)
    glow = Image.new("RGBA", size, hex_to_rgba(color, alpha))
    mask = Image.radial_gradient("L").resize(size)
    mask = ImageOps.invert(mask)
    glow.putalpha(mask.point(lambda p: int(p * alpha / 255)))
    img.alpha_composite(glow, (x, y))


def add_noise(img: Image.Image, opacity: int = 10, seed: int = 7) -> None:
    random.seed(seed)
    w, h = img.size
    noise = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = noise.load()
    step = max(1, w // 512)
    for y in range(0, h, step):
        for x in range(0, w, step):
            value = random.randint(0, opacity)
            px[x, y] = (255, 255, 255, value)
    noise = noise.resize((w, h), Image.Resampling.NEAREST)
    img.alpha_composite(noise)


class Icon:
    def __init__(self, seed: int = 1) -> None:
        self.img = diagonal_gradient(
            (ICON_SIZE * AA, ICON_SIZE * AA),
            PALETTE["black"],
            "#0a0d12",
            "#1a1d24",
        )
        self.draw = ImageDraw.Draw(self.img, "RGBA")
        self.seed = seed
        add_radial_glow(self.img, 256, 180, 620, "#ffffff", 18)
        add_radial_glow(self.img, 780, 840, 520, "#313846", 38)
        add_noise(self.img, opacity=8, seed=seed)

    def glow_shape(self, func, blur: float) -> None:
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        func(ImageDraw.Draw(layer, "RGBA"))
        layer = layer.filter(ImageFilter.GaussianBlur(int(round(blur * AA))))
        self.img.alpha_composite(layer)

    def rounded_gradient(
        self,
        box: tuple[float, float, float, float],
        radius: float,
        top: str,
        bottom: str,
        outline: str | None = None,
        outline_alpha: int = 90,
        width: float = 2,
    ) -> None:
        x1, y1, x2, y2 = scaled_box(box)
        w = x2 - x1
        h = y2 - y1
        grad = vertical_gradient((w, h), top, bottom)
        mask = Image.new("L", (w, h), 0)
        md = ImageDraw.Draw(mask)
        md.rounded_rectangle((0, 0, w - 1, h - 1), radius=int(round(radius * AA)), fill=255)
        tile = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        tile.alpha_composite(grad)
        tile.putalpha(mask)
        self.img.alpha_composite(tile, (x1, y1))
        if outline:
            self.draw.rounded_rectangle(
                (x1, y1, x2, y2),
                radius=int(round(radius * AA)),
                outline=hex_to_rgba(outline, outline_alpha),
                width=max(1, int(round(width * AA))),
            )

    def ellipse_gradient(
        self,
        box: tuple[float, float, float, float],
        inner: str,
        outer: str,
        alpha: int = 255,
    ) -> None:
        x1, y1, x2, y2 = scaled_box(box)
        w = x2 - x1
        h = y2 - y1
        grad = Image.radial_gradient("L").resize((w, h))
        grad = ImageOps.invert(grad)
        inner_rgba = hex_to_rgba(inner, alpha)
        outer_rgba = hex_to_rgba(outer, alpha)
        center = Image.new("RGBA", (w, h), inner_rgba)
        edge = Image.new("RGBA", (w, h), outer_rgba)
        tile = Image.composite(center, edge, grad)
        mask = Image.new("L", (w, h), 0)
        md = ImageDraw.Draw(mask)
        md.ellipse((0, 0, w - 1, h - 1), fill=255)
        tile.putalpha(mask)
        self.img.alpha_composite(tile, (x1, y1))

    def led(self, x: float, y: float, r: float = 42) -> None:
        self.glow_shape(
            lambda d: d.ellipse(
                scaled_box((x - r * 1.75, y - r * 1.75, x + r * 1.75, y + r * 1.75)),
                fill=hex_to_rgba(PALETTE["red"], 80),
            ),
            blur=30,
        )
        self.glow_shape(
            lambda d: d.ellipse(
                scaled_box((x - r * 0.92, y - r * 0.92, x + r * 0.92, y + r * 0.92)),
                fill=hex_to_rgba(PALETTE["red_hot"], 92),
            ),
            blur=9,
        )
        self.draw.ellipse(
            scaled_box((x - r, y - r, x + r, y + r)),
            fill=hex_to_rgba(PALETTE["red"], 255),
        )
        self.draw.ellipse(
            scaled_box((x - r * 0.43, y - r * 0.52, x + r * 0.12, y + r * 0.03)),
            fill=(255, 220, 220, 150),
        )

    def soft_shadow(self, box: tuple[float, float, float, float], radius: float, alpha: int = 120) -> None:
        self.glow_shape(
            lambda d: d.rounded_rectangle(
                scaled_box(box),
                radius=int(round(radius * AA)),
                fill=(0, 0, 0, alpha),
            ),
            blur=42,
        )

    def finish(self) -> Image.Image:
        return self.img.resize((ICON_SIZE, ICON_SIZE), Image.Resampling.LANCZOS).convert("RGB")


def draw_radar_arcs(icon: Icon, center: tuple[float, float], radii: list[float], color: str, alpha: int = 125) -> None:
    cx, cy = center
    for idx, r in enumerate(radii):
        width = 8 - min(idx, 3)
        icon.draw.arc(
            scaled_box((cx - r, cy - r, cx + r, cy + r)),
            start=214,
            end=326,
            fill=hex_to_rgba(color, max(35, alpha - idx * 24)),
            width=max(2, int(round(width * AA))),
        )


def icon_01() -> Image.Image:
    icon = Icon(seed=11)
    icon.soft_shadow((238, 248, 786, 796), 280, 140)
    icon.ellipse_gradient((250, 250, 774, 774), "#404756", "#060708")
    icon.draw.ellipse(scaled_box((274, 274, 750, 750)), outline=hex_to_rgba("#d6d4cb", 70), width=7 * AA)
    icon.ellipse_gradient((338, 338, 686, 686), "#121720", "#020303")
    icon.draw.ellipse(scaled_box((383, 383, 641, 641)), outline=hex_to_rgba("#8f9497", 80), width=4 * AA)
    icon.draw.arc(scaled_box((330, 330, 694, 694)), 205, 320, fill=hex_to_rgba("#f7f4e9", 150), width=10 * AA)
    icon.draw.arc(scaled_box((410, 410, 614, 614)), 25, 155, fill=hex_to_rgba("#f7f4e9", 68), width=5 * AA)
    icon.glow_shape(
        lambda d: d.line(scaled_points([(348, 382), (620, 310)]), fill=(255, 255, 255, 52), width=20 * AA),
        blur=18,
    )
    draw_radar_arcs(icon, (512, 512), [205, 274, 342], "#aeb1af", 115)
    icon.led(718, 316, 38)
    return icon.finish()


def icon_02() -> Image.Image:
    icon = Icon(seed=22)
    icon.soft_shadow((252, 252, 772, 772), 130, 135)
    cx, cy = 512, 512
    for i in range(8):
        a1 = math.radians(i * 45 - 12)
        a2 = math.radians(i * 45 + 34)
        inner = 132
        outer = 305
        pts = [
            (cx + math.cos(a1) * inner, cy + math.sin(a1) * inner),
            (cx + math.cos(a1) * outer, cy + math.sin(a1) * outer),
            (cx + math.cos(a2) * outer, cy + math.sin(a2) * outer),
            (cx + math.cos(a2) * inner, cy + math.sin(a2) * inner),
        ]
        shade = 38 + i * 8
        icon.draw.polygon(scaled_points(pts), fill=(shade, shade + 6, shade + 12, 224))
        icon.draw.line(scaled_points([pts[1], pts[2]]), fill=(235, 232, 220, 34), width=2 * AA)
    icon.draw.ellipse(scaled_box((214, 214, 810, 810)), outline=hex_to_rgba("#e3dfd2", 62), width=5 * AA)
    icon.draw.ellipse(scaled_box((318, 318, 706, 706)), outline=hex_to_rgba("#81878b", 82), width=4 * AA)
    icon.ellipse_gradient((390, 390, 634, 634), "#111721", "#020303")
    icon.draw.arc(scaled_box((268, 268, 756, 756)), 35, 150, fill=hex_to_rgba("#f0eee4", 94), width=9 * AA)
    icon.led(512, 512, 37)
    return icon.finish()


def icon_03() -> Image.Image:
    icon = Icon(seed=33)
    draw_radar_arcs(icon, (512, 616), [168, 252, 336], "#d7d5ca", 110)
    icon.soft_shadow((353, 266, 671, 742), 154, 160)
    icon.rounded_gradient((356, 250, 668, 718), 156, "#232a35", "#08090c", "#d7d3c7", 58, 3)
    icon.rounded_gradient((405, 324, 619, 666), 108, "#303947", "#0b0d12", "#ffffff", 42, 2)
    icon.draw.rounded_rectangle(
        scaled_box((440, 402, 584, 620)),
        radius=58 * AA,
        outline=hex_to_rgba("#bfc1bf", 80),
        width=4 * AA,
    )
    icon.glow_shape(
        lambda d: d.rounded_rectangle(
            scaled_box((438, 318, 586, 390)),
            radius=35 * AA,
            fill=(255, 255, 255, 46),
        ),
        blur=18,
    )
    icon.draw.line(scaled_points([(512, 666), (512, 778)]), fill=hex_to_rgba("#b9bbb8", 62), width=6 * AA)
    icon.draw.ellipse(scaled_box((434, 766, 590, 822)), fill=(0, 0, 0, 140))
    icon.led(512, 334, 34)
    return icon.finish()


def icon_04() -> Image.Image:
    icon = Icon(seed=44)
    icon.soft_shadow((315, 168, 709, 844), 128, 160)
    icon.rounded_gradient((332, 158, 692, 820), 118, "#202731", "#07080b", "#f4f0e4", 54, 3)
    icon.rounded_gradient((384, 244, 640, 724), 82, "#10151d", "#030405", "#747a7f", 48, 2)
    for y in [336, 430, 524, 618]:
        icon.draw.line(scaled_points([(416, y), (608, y)]), fill=hex_to_rgba("#d7d5ca", 52), width=5 * AA)
    for r, alpha in [(108, 86), (158, 64), (210, 46)]:
        icon.draw.arc(
            scaled_box((512 - r, 466 - r, 512 + r, 466 + r)),
            225,
            315,
            fill=hex_to_rgba("#d7d5ca", alpha),
            width=5 * AA,
        )
    icon.draw.line(scaled_points([(512, 276), (512, 724)]), fill=hex_to_rgba("#ffffff", 28), width=3 * AA)
    icon.led(402, 260, 34)
    return icon.finish()


def icon_05() -> Image.Image:
    icon = Icon(seed=55)
    cx, cy = 512, 512
    icon.soft_shadow((222, 242, 802, 782), 260, 150)
    for idx, box in enumerate([(246, 350, 778, 674), (306, 252, 718, 772), (320, 320, 704, 704)]):
        icon.draw.arc(
            scaled_box(box),
            0 + idx * 20,
            330 - idx * 25,
            fill=hex_to_rgba("#dad8ce", 105 - idx * 24),
            width=(6 - idx) * AA,
        )
    for angle, r, size, color, alpha in [
        (24, 276, 26, "#d6d5cc", 210),
        (154, 246, 18, "#81878b", 200),
        (250, 220, 22, "#f0eee4", 210),
        (304, 308, 34, PALETTE["red"], 255),
    ]:
        a = math.radians(angle)
        x = cx + math.cos(a) * r
        y = cy + math.sin(a) * r * 0.72
        if color == PALETTE["red"]:
            icon.led(x, y, size)
        else:
            icon.glow_shape(
                lambda d, x=x, y=y, size=size, color=color, alpha=alpha: d.ellipse(
                    scaled_box((x - size, y - size, x + size, y + size)),
                    fill=hex_to_rgba(color, 58),
                ),
                blur=14,
            )
            icon.draw.ellipse(scaled_box((x - size, y - size, x + size, y + size)), fill=hex_to_rgba(color, alpha))
    icon.ellipse_gradient((390, 390, 634, 634), "#1f2630", "#050608")
    icon.draw.ellipse(scaled_box((432, 432, 592, 592)), outline=hex_to_rgba("#e9e5d9", 74), width=5 * AA)
    return icon.finish()


def icon_06() -> Image.Image:
    icon = Icon(seed=66)
    icon.soft_shadow((238, 238, 786, 786), 142, 160)
    icon.rounded_gradient((250, 250, 774, 774), 132, "#242a35", "#07080b", "#f1eee4", 56, 3)
    icon.rounded_gradient((312, 312, 712, 712), 96, "#111721", "#040506", "#858a8d", 45, 2)
    for r, alpha in [(64, 88), (126, 72), (188, 54)]:
        icon.draw.ellipse(
            scaled_box((512 - r, 512 - r, 512 + r, 512 + r)),
            outline=hex_to_rgba("#dbd8ce", alpha),
            width=4 * AA,
        )
    icon.draw.arc(scaled_box((338, 338, 686, 686)), 205, 334, fill=hex_to_rgba("#f7f4e9", 104), width=9 * AA)
    icon.glow_shape(
        lambda d: d.rounded_rectangle(
            scaled_box((314, 300, 710, 374)),
            radius=34 * AA,
            fill=(255, 255, 255, 42),
        ),
        blur=20,
    )
    icon.led(646, 344, 31)
    return icon.finish()


def icon_07() -> Image.Image:
    icon = Icon(seed=77)
    icon.soft_shadow((214, 322, 810, 702), 190, 150)
    eye_outer = [(210, 512), (306, 384), (512, 322), (718, 384), (814, 512), (718, 640), (512, 702), (306, 640)]
    eye_inner = [(284, 512), (360, 424), (512, 382), (664, 424), (740, 512), (664, 600), (512, 642), (360, 600)]
    icon.draw.polygon(scaled_points(eye_outer), fill=(30, 35, 44, 220))
    icon.draw.line(scaled_points(eye_outer + [eye_outer[0]]), fill=hex_to_rgba("#e3dfd2", 64), width=5 * AA)
    icon.draw.polygon(scaled_points(eye_inner), fill=(7, 9, 12, 230))
    icon.draw.line(scaled_points(eye_inner + [eye_inner[0]]), fill=hex_to_rgba("#858a8d", 66), width=3 * AA)
    icon.ellipse_gradient((386, 386, 638, 638), "#26303c", "#020303")
    icon.draw.ellipse(scaled_box((432, 432, 592, 592)), outline=hex_to_rgba("#e8e5d9", 74), width=5 * AA)
    icon.draw.arc(scaled_box((316, 316, 708, 708)), 28, 152, fill=hex_to_rgba("#f0eee4", 82), width=7 * AA)
    icon.led(512, 512, 33)
    return icon.finish()


def icon_08() -> Image.Image:
    icon = Icon(seed=88)
    icon.soft_shadow((250, 218, 774, 812), 132, 155)
    facets = [
        ([(512, 186), (708, 312), (630, 510), (512, 442)], "#303845"),
        ([(512, 186), (316, 312), (394, 510), (512, 442)], "#1d2430"),
        ([(316, 312), (394, 510), (290, 702), (188, 498)], "#111720"),
        ([(708, 312), (630, 510), (734, 702), (836, 498)], "#222936"),
        ([(394, 510), (512, 442), (630, 510), (512, 824)], "#0a0d12"),
        ([(290, 702), (512, 824), (734, 702), (512, 650)], "#151a23"),
    ]
    for pts, color in facets:
        icon.draw.polygon(scaled_points(pts), fill=hex_to_rgba(color, 238))
        icon.draw.line(scaled_points(pts + [pts[0]]), fill=hex_to_rgba("#e4e1d6", 32), width=3 * AA)
    icon.glow_shape(
        lambda d: d.polygon(scaled_points([(512, 186), (708, 312), (630, 510), (512, 442)]), fill=(255, 255, 255, 44)),
        blur=20,
    )
    icon.draw.arc(scaled_box((308, 306, 716, 714)), 212, 320, fill=hex_to_rgba("#d7d5ca", 76), width=6 * AA)
    icon.led(688, 338, 34)
    return icon.finish()


DRAWERS = [icon_01, icon_02, icon_03, icon_04, icon_05, icon_06, icon_07, icon_08]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\segoeuib.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def render_board(icon_paths: list[Path]) -> None:
    scale = 2
    board_w, board_h = 2200, 1390
    board = diagonal_gradient((board_w * scale, board_h * scale), "#020303", "#07090d", "#12151b")
    draw = ImageDraw.Draw(board, "RGBA")
    add_radial_glow(board, 260, 160, 620, "#ffffff", 12)
    add_radial_glow(board, 1840, 210, 760, "#303642", 30)
    title_font = load_font(52 * scale, bold=True)
    body_font = load_font(24 * scale, bold=False)
    label_font = load_font(30 * scale, bold=True)
    small_font = load_font(20 * scale, bold=False)

    def wrap_text(text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
        words = text.split()
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = word if not current else f"{current} {word}"
            if draw.textlength(candidate, font=font) <= max_width:
                current = candidate
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines[:2]

    draw.text((90 * scale, 70 * scale), "LiveRadar iPhone Icon Directions", fill=(246, 243, 238, 255), font=title_font)
    draw.text(
        (92 * scale, 137 * scale),
        "Manus-inspired restraint: black first, material depth second, red only as the live signal.",
        fill=(156, 158, 158, 255),
        font=body_font,
    )

    tile_w, tile_h = 455, 520
    gap_x, gap_y = 54, 78
    start_x, start_y = 90, 230
    icon_draw_size = 332

    for idx, icon_path in enumerate(icon_paths):
        row = idx // 4
        col = idx % 4
        x = start_x + col * (tile_w + gap_x)
        y = start_y + row * (tile_h + gap_y)
        box = (x * scale, y * scale, (x + tile_w) * scale, (y + tile_h) * scale)
        draw.rounded_rectangle(box, radius=32 * scale, fill=(8, 10, 13, 238), outline=(218, 217, 210, 34), width=2 * scale)
        icon_img = Image.open(icon_path).convert("RGB").resize((icon_draw_size * scale, icon_draw_size * scale), Image.Resampling.LANCZOS)
        icon_mask = Image.new("L", icon_img.size, 0)
        icon_mask_draw = ImageDraw.Draw(icon_mask)
        icon_mask_draw.rounded_rectangle(
            (0, 0, icon_img.size[0] - 1, icon_img.size[1] - 1),
            radius=76 * scale,
            fill=255,
        )
        icon_layer = icon_img.convert("RGBA")
        icon_layer.putalpha(icon_mask)
        board.alpha_composite(icon_layer, ((x + 61) * scale, (y + 40) * scale))
        draw.rounded_rectangle(
            (
                (x + 61) * scale,
                (y + 40) * scale,
                (x + 61 + icon_draw_size) * scale,
                (y + 40 + icon_draw_size) * scale,
            ),
            radius=76 * scale,
            outline=(255, 255, 255, 22),
            width=2 * scale,
        )
        name = ICONS[idx][1]
        desc = ICONS[idx][2]
        draw.text((x * scale + 42 * scale, y * scale + 398 * scale), f"{idx + 1}. {name}", fill=(243, 241, 233, 255), font=label_font)
        for line_idx, line in enumerate(wrap_text(desc, small_font, int((tile_w - 84) * scale))):
            draw.text(
                (x * scale + 42 * scale, y * scale + (442 + line_idx * 28) * scale),
                line,
                fill=(151, 154, 156, 255),
                font=small_font,
            )

    board = board.resize((board_w, board_h), Image.Resampling.LANCZOS).convert("RGB")
    board.save(OUT_DIR / "icon-board.png", optimize=True)


def write_readme() -> None:
    lines = [
        "# LiveRadar Manus-Inspired iPhone Icon Concepts",
        "",
        "Status: concept exploration only. These files do not replace the current app icon.",
        "",
        "Design intent:",
        "- Black and graphite should carry the icon mass.",
        "- Red is restricted to a small live LED signal.",
        "- Forms should feel modern, calm, dimensional, and iOS-ready.",
        "- The work is inspired by the restrained premium feel of Manus-style app icons, but uses original LiveRadar signal/radar symbols.",
        "",
        "Generated deliverables:",
        "- `icon-board.png`: comparison board for the eight directions.",
    ]
    for file_name, name, desc in ICONS:
        lines.append(f"- `{file_name}`: {name} - {desc}")
    lines.extend(
        [
            "",
            "Acceptance notes:",
            "- Each source image is exported at 1024x1024.",
            "- Red usage is intentionally limited to one compact live signal point per icon.",
            "- Pick one direction before replacing `public/apple-touch-icon.png` or `public/app-icon.svg`.",
        ]
    )
    (OUT_DIR / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    icon_paths: list[Path] = []
    for (file_name, _name, _desc), drawer in zip(ICONS, DRAWERS):
        output = OUT_DIR / file_name
        drawer().save(output, optimize=True)
        icon_paths.append(output)
    render_board(icon_paths)
    write_readme()
    for path in [OUT_DIR / "icon-board.png", *icon_paths, OUT_DIR / "README.md"]:
        print(path.relative_to(Path.cwd()))


if __name__ == "__main__":
    main()
