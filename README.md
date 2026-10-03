# Journeys Card Review

A static review site for the captured *Journeys in Middle-earth* build document. It shows 233 unique card images, 18 character sheets, and the document screenshots alongside OCR text. OCR titles and image comparisons identified 149 repeated captures, which were merged into one card per title. Categories and deletions can be saved in the browser and exported or imported as JSON.

The deployed site is built from `dist/` by the GitHub Pages workflow. The original captures and crop scripts are in the parent workspace's `output/` directory; `dist/` contains optimized WebP copies for the site.

Use Left and Right Arrow to move the highlighted card. Press Q for Role, W for 1-handed, E for 2-handed, R for Armor, T for Trinket, or Y for Mount. Categorizing with a shortcut advances to the next card. Press Delete to remove the current card from the gallery; use the Deleted category to restore it. These review changes are local to the browser and are included in Export review. Hero sheets stay in Hero unless changed through the category selector. Former Weapon suggestions are in Needs review so their hand count can be checked.

OCR titles and initial equipment categories are suggestions. Check them against the card images before relying on them.
