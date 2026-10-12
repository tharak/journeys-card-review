"""Extract the supplied v1.4 workbook PDF's full activation cells using Poppler."""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "dist/JiME_Enemy_Stats_Activations_and_Modifiers_V1.4.xlsx.pdf"
NAMES = [
    "Goblin Scout", "Ruffian", "Orc Marauder", "Orc Hunter", "Hungry Warg",
    "Wight", "Hill Troll", "Giant Spider", "Pit Goblin", "Orc Taskmaster",
    "Shadowman", "Nameless Thing", "Cave Troll", "Soldier", "Uruk",
    "Fell Beast", "Warg Rider", "Siege Engine", "Oliphant",
]
TWELVE_ATTACKS = set(NAMES[:7])
ROW = re.compile(r"\b(" + "|".join(map(re.escape, NAMES)) + r") (\d+|Avg)\s+")
VALUES = re.compile(
    r"^(.*?)\s+((?:(?:\d+|-)\s+){9})(Might|Wisdom|Agility|Spirit|Wits?)\b\s*(.*)$",
    re.DOTALL,
)


def extract():
    raw = subprocess.run(
        ["pdftotext", "-raw", str(PDF), "-"], check=True, capture_output=True, text=True
    ).stdout
    enemies = {name: {"id": name.lower().replace(" ", "-"), "name": name, "attacks": []} for name in NAMES}
    # Pages 2–5 contain activations. Raw extraction preserves complete cell text,
    # including wrapped lines clipped visually by the spreadsheet's row height.
    for page_number, page in enumerate(raw.split("\f")[1:5], start=2):
        starts = list(ROW.finditer(page))
        for index, start in enumerate(starts):
            name, attack_number = start.groups()
            if attack_number == "Avg":
                continue
            end = starts[index + 1].start() if index + 1 < len(starts) else len(page)
            cell = page[start.end():end].strip()
            parsed = VALUES.fullmatch(cell)
            if not parsed:
                raise ValueError(f"Cannot parse {name} #{attack_number}, page {page_number}: {cell}")
            text, values, negate, effect = parsed.groups()
            values = [None if value == "-" else int(value) for value in values.split()]
            groups = []
            for offset in range(0, 9, 3):
                damage, fear, total = values[offset:offset + 3]
                if damage is None:
                    if fear is not None or total is not None:
                        raise ValueError(f"Partial unavailable values for {name} #{attack_number}")
                    groups.append(None)
                else:
                    if fear is None or total != damage + fear:
                        raise ValueError(f"Invalid total for {name} #{attack_number}")
                    groups.append({"damage": damage, "fear": fear})
            normalize = lambda value: re.sub(r"\s+", " ", re.sub(r"(?<=\w)-\n(?=\w)", "-", value)).strip()
            enemies[name]["attacks"].append({
                "number": int(attack_number), "text": normalize(text),
                "groups": groups, "negate": "Wits" if negate == "Wit" else negate,
                "effect": normalize(effect), "page": page_number,
            })
    for name, enemy in enemies.items():
        expected = 12 if name in TWELVE_ATTACKS else 7
        if [attack["number"] for attack in enemy["attacks"]] != list(range(1, expected + 1)):
            raise ValueError(f"Incomplete or duplicate activations for {name}")
    catalog = json.loads((ROOT / "dist/enemies-data.json").read_text())
    for enemy in catalog["enemies"]:
        if not enemies[enemy["name"]]["attacks"]:
            raise ValueError(f"No attacks for catalog enemy {enemy['name']}")
    result = {
        "source": {"file": PDF.name, "title": "JiME Enemy Stats, Activations and Modifiers v1.4", "authors": "Reshyk and Birdman137"},
        "enemies": list(enemies.values()),
    }
    (ROOT / "dist/enemy-attacks.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(f"Imported {sum(len(enemy['attacks']) for enemy in enemies.values())} attacks for {len(enemies)} enemy types.")


if __name__ == "__main__":
    extract()
