"""Read role names from the source workbook and seed verified card labels."""

import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "source/suggested-builds.xlsx"
DATA = ROOT / "dist/data.json"
NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

# These labels were checked against card titles and the role printed on the card.
# Personal skill cards without a listed role remain unassigned.
VERIFIED = {
    "Captain": "0020 0021 0255 0256 0257",
    "Guardian": "0018 0023 0024 0303",
    "Pathfinder": "0032 0033 0041 0042 0043 0044 0134",
    "Burglar": "0040 0061",
    "Musician": "0057 0058 0059 0062 0063 0064 0065 0230",
    "Traveller": "0081 0082 0086 0087 0088 0089 0090 0163",
    "Meddler": "0084 0085 0136",
    "Soldier": "0111 0112 0113 0114",
    "Smith": "0179 0180 0182 0183 0184 0185 0186 0187 0225",
    "Lorekeeper": "0203",
    "Delver": "0229 0373",
    "Provisioner": "0164 0347",
    "Herbalist": "0253 0254",
    "Shieldmaiden": "0272 0279 0280",
    "Hunter": "0324 0325",
    "Trickster": "0326",
}

with zipfile.ZipFile(WORKBOOK) as workbook:
    shared = ET.fromstring(workbook.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in item.findall(".//x:t", NS)) for item in shared.findall("x:si", NS)]
    sheet = ET.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
    roles = set()
    for row in sheet.findall(".//x:sheetData/x:row", NS):
        for cell in row.findall("x:c", NS):
            if not cell.attrib["r"].startswith("C"):
                continue
            value = cell.find("x:v", NS)
            if value is None or value.text is None:
                continue
            text = strings[int(value.text)] if cell.attrib.get("t") == "s" else value.text
            for line in re.split(r"\n|, or\s*", text):
                name = re.sub(r"\s*\(\d+\).*", "", line).strip(" ,")
                name = re.sub(r",? or$", "", name).strip()
                if name and name not in {"Role(s)", "Role"}:
                    roles.add(name)

data = json.loads(DATA.read_text())
data["roleSubcategories"] = sorted(roles)
assignments = {f"card-{number}": role for role, numbers in VERIFIED.items() for number in numbers.split()}
assert set(VERIFIED) <= roles
for card in data["cards"]:
    if card["id"] in assignments:
        assert card["category"] == "role", card["id"]
        card["subcategory"] = assignments[card["id"]]
DATA.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
print(f"{len(roles)} role names; {len(assignments)} verified card assignments")
