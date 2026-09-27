from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CORAL = "#ff684c"
CREAM = "#fff7ed"
DENSITIES = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}


def font(size: int):
    candidates = (
        Path("C:/Windows/Fonts/georgiab.ttf"),
        Path("C:/Windows/Fonts/georgia.ttf"),
        "DejaVuSerif-Bold.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), size)
        except OSError:
            continue
    return ImageFont.load_default()


def add_initials(image: Image.Image, text_size: int):
    draw = ImageDraw.Draw(image)
    selected_font = font(text_size)
    box = draw.textbbox((0, 0), "SS", font=selected_font)
    x = (image.width - (box[2] - box[0])) / 2 - box[0]
    y = (image.height - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), "SS", fill=CREAM, font=selected_font)


def rounded_icon(size: int):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inset = max(1, round(size * 0.025))
    radius = round(size * 0.22)
    ImageDraw.Draw(image).rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=radius,
        fill=CORAL,
    )
    add_initials(image, round(size * 0.34))
    return image


def maskable_icon(size: int):
    image = Image.new("RGBA", (size, size), CORAL)
    add_initials(image, round(size * 0.34))
    return image


def adaptive_foreground(size: int):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    add_initials(image, round(size * 0.31))
    return image


def save(image: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def main():
    save(rounded_icon(192), ROOT / "static/icon-192.png")
    save(rounded_icon(512), ROOT / "static/icon-512.png")
    save(maskable_icon(512), ROOT / "static/icon-maskable-512.png")
    save(maskable_icon(512), ROOT / "android/store_icon.png")

    resource_root = ROOT / "android/app/src/main/res"
    for density, scale in DENSITIES.items():
        directory = resource_root / f"mipmap-{density}"
        save(rounded_icon(round(48 * scale)), directory / "ic_launcher.png")
        save(maskable_icon(round(108 * scale)), directory / "ic_maskable.png")
        save(adaptive_foreground(round(108 * scale)), directory / "ic_launcher_foreground.png")


if __name__ == "__main__":
    main()
