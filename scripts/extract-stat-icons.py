"""Extract original game symbol badges from the committed Aragorn card scan."""

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = "assets/carddb/carddb-heroes-aragorn-001.webp"
DESTINATION = ROOT / "dist/assets/icons"
BADGES = {
    "might": (629, 48, 690, 109),
    "wisdom": (629, 114, 690, 175),
    "agility": (629, 180, 690, 241),
    "spirit": (629, 246, 690, 307),
    "wits": (629, 312, 690, 373),
    "damage": (848, 317, 901, 370),
    "fear": (848, 261, 901, 314),
}


def extract():
    image = Image.open(ROOT / "dist" / SOURCE).convert("RGBA")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name, box in BADGES.items():
        badge = image.crop(box)
        mask = Image.new("L", badge.size, 0)
        draw = ImageDraw.Draw(mask)
        if name in ("damage", "fear"):
            draw.rounded_rectangle((1, 1, badge.width - 2, badge.height - 2), radius=10, fill=255)
        else:
            draw.ellipse((1, 1, badge.width - 2, badge.height - 2), fill=255)
        badge.putalpha(mask)
        badge.save(DESTINATION / f"{name}.png", optimize=True)
    manifest = {
        "source": SOURCE,
        "sourceUrl": "https://sites.google.com/view/jime-carddb/home/heroes/aragorn",
        "note": "Original game badges cropped from the card scan. The attack PDF contains text placeholders, not symbol artwork.",
        "icons": [{"name": name, "file": f"assets/icons/{name}.png", "box": box} for name, box in BADGES.items()],
    }
    (DESTINATION / "sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Extracted {len(BADGES)} original game badges.")


if __name__ == "__main__":
    extract()
