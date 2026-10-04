"""Publish the fresh card crops without replacing reviewed card classifications."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

SITE = Path(__file__).resolve().parents[1]
CAPTURE = SITE.parent / 'v2'
DEST = SITE / 'dist/assets/v2'
DEST.mkdir(parents=True, exist_ok=True)
records = json.loads((CAPTURE/'index.json').read_text())['records']

def convert(record):
    Image.open(CAPTURE/record['image']).save(DEST/f"{record['id']}.webp", 'WEBP', lossless=True, method=6)

with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(convert, records))

images = {r['id']:f"assets/v2/{r['id']}.webp" for r in records}
path = SITE/'dist/data.json'
data = json.loads(path.read_text())
for card in data['cards']:
    if card['id'] in images:
        card['image'] = images[card['id']]
path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
metadata = {r['id']:{'title':r['title'],'sourceHero':r['source']['hero']} for r in records}
(SITE/'dist/capture-v2.json').write_text(json.dumps(metadata,ensure_ascii=False,separators=(',',':'))+'\n')
print(f'Published {len(records)} lossless card images; retained existing categories, titles, and IDs.')
