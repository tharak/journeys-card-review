# Journeys Card Review

A static card catalog and build creator for *Journeys in Middle-earth*. It combines the captured build document with scans from JiME Card DB. The published database contains 866 records, including 109 existing deleted entries; 757 entries are visible by default. Categories, text, titles, and deletions can be saved in the browser and exported or imported as JSON.

Character sheets use `category: "hero-card"`; hero skills use `category: "hero"`. Their subcategory identifies the character. Card records have no `hero` or `heroes` field.

The [suggested builds workbook](source/suggested-builds.xlsx) is a copy of the [Google spreadsheet](https://docs.google.com/spreadsheets/d/1JIh2dyfUqi1-LhLiicgWqZ0iL1-gtuRxc2naOcrPpwM/edit?gid=0). Its Suggested Builds sheet supplies the 18 Role subcategory names. The Hero subcategories come from character-sheet titles. The workbook and printed card labels provided 63 initial Role assignments; other cards appear under Unassigned role until reviewed. Run `python3 scripts/update_role_subcategories.py` after replacing the workbook to refresh names and the verified assignments.

The deployed site is built from `dist/` by the GitHub Pages workflow. The original captures and crop scripts are in the parent workspace's `output/` directory; `dist/` contains optimized WebP copies for the site.

Use Left and Right Arrow to move the highlighted card. Press Q for Role, W for 1-handed, E for 2-handed, R for Armor, T for Trinket, or Y for Mount. Categorizing with a shortcut advances to the next card. Press Delete to remove the current card from the gallery; use the Deleted category to restore it. These review changes are local to the browser and are included in Export review. Hero sheets stay in Hero unless changed through the category selector. Former Weapon suggestions are in Needs review so their hand count can be checked.

Open Hero or Role in the sidebar to browse its subcategories. Each Role card has a subcategory selector, and exports include those edits. Older category and review exports still import.

Each card also has an editable Order field in the gallery and card details. Enter a whole number of 0 or more, or leave it blank for unassigned. Choose Card order to sort ascending, with unassigned cards last; Category – subcategory uses Order within each group. Builds also show cards in this order. Order edits save in the browser and are included in review exports (`journeys-card-review-v9`) and site data exports (`order`, a number or `null`). Importing an older review preserves existing order edits.

OCR titles and initial equipment categories are suggestions. Check them against the card images before relying on them.

The dedicated [build creator](dist/build.html) lets users choose a hero and starting role, add or remove card copies, write strategy notes, and save multiple named builds in their browser. Builds export and import as `journeys-build-v1` JSON. Hero selection adds the matching categorized hero cards; card filters can show the selected hero/role or the full catalog. Review categories, titles, deletions, and subcategories saved in this browser also apply to the creator.

Card and character images now use the fresh `v2` source crops, published as lossless WebP files in `dist/assets/v2/`. Existing card IDs and reviewed categories are retained. Run `python3 scripts/import_v2_assets.py` to republish the parent workspace's `v2` capture. The creator is implemented in `dist/build.html`, `dist/build.js`, and `dist/build.css` and deploys with the existing GitHub Pages workflow.

The browser UI is in `dist/app.js`; review format validation and exports are in `dist/review-data.mjs`. Serve `dist/` over HTTP for local development (for example, `python3 -m http.server 8000 --directory dist`). Run the review compatibility tests with `node --test tests/*.test.mjs`.

The [JiME Card DB](https://sites.google.com/view/jime-carddb/home) import adds 660 scans from 51 pages: 466 new records and 194 scans linked to existing entries. Distinct numbered skills and equipment tiers remain separate; uncertain matches stay as separate records for review. Existing IDs, categories, aliases, deletions, and selected v2 artwork are preserved. Open a matched card and use Image source to view its additional scan. New categories cover basic, title, weakness, terrain, damage, fear, conditions, and character backs. Hand items keep their source grouping until their hand count is reviewed. Reference cards appear in the gallery and are excluded from the build creator.

Images are published losslessly under `dist/assets/carddb/`, and each database entry contains OCR text and a source-page link. The import audit is in `source/carddb-import.json`. The parent workspace's `carddb/` folder retains all original scans and one JSON file per scan under `cards/`; OCR still needs review. With Playwright, Chromium, Pillow, NumPy, SciPy, and Tesseract installed, run `node scripts/download_carddb.mjs` (set `CARDDB_PLAYWRIGHT_MODULE` and `CARDDB_CHROMIUM` if needed), followed by `python3 scripts/import_carddb.py extract`, `refine`, and `merge` to refresh the capture.
