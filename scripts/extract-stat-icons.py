"""Extract original game symbol badges from the committed Aragorn card scan."""

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageChops

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
    "inspiration": (744, 92, 862, 201),
}


def extract():
    image = Image.open(ROOT / "dist" / SOURCE).convert("RGBA")
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name, box in BADGES.items():
        badge = image.crop(box)
        mask = Image.new("L", badge.size, 0)
        draw = ImageDraw.Draw(mask)
        if name == "inspiration":
            # Trace the original leaf's outer edge, excluding the card backdrop.
            outline = [(804, 94), (815, 108), (826, 128), (829, 137),
                       (860, 143), (849, 155), (842, 166), (833, 173),
                       (843, 180), (826, 181), (814, 180), (810, 191),
                       (815, 196), (821, 193), (819, 185), (823, 186),
                       (825, 194), (822, 199), (813, 200), (807, 196),
                       (805, 191), (808, 181), (791, 181), (767, 182),
                       (772, 173), (761, 167), (750, 153), (745, 145),
                       (774, 137), (780, 129), (783, 114), (795, 101)]
            scale = 4
            edge = Image.new("L", (badge.width * scale, badge.height * scale), 0)
            ImageDraw.Draw(edge).polygon([((x - box[0]) * scale, (y - box[1]) * scale)
                                         for x, y in outline], fill=255)
            ImageDraw.Draw(edge).ellipse(((793 - box[0]) * scale, (177 - box[1]) * scale,
                                         (819 - box[0]) * scale, (200 - box[1]) * scale), fill=255)
            mask = edge.resize(badge.size, Image.Resampling.LANCZOS)
            # Preserve the printed texture while clearing the dark cutouts.
            light = badge.convert("L").point(lambda value: max(0, min(255, (value - 100) * 4)))
            mask = ImageChops.multiply(mask, light)
        elif name in ("damage", "fear"):
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
