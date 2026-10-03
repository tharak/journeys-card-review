# Journeys Card Review

A static review site for the captured *Journeys in Middle-earth* build document. It shows 382 individual card images, 18 character sheets, and the document screenshots alongside OCR text. Categories can be edited in the browser and exported or imported as JSON.

The deployed site is built from `dist/` by the GitHub Pages workflow. The original captures and crop scripts are in the parent workspace's `output/` directory; `dist/` contains optimized WebP copies for the site.

Use Left and Right Arrow to move the highlighted card. Press Q for Role, W for 1-handed, E for 2-handed, R for Armor, or T for Trinket. Categorizing with a shortcut advances to the next card. Hero sheets stay in Hero unless changed through the category selector. Former Weapon suggestions are in Needs review so their hand count can be checked.

OCR titles and initial equipment categories are suggestions. Check them against the card images before relying on them.
