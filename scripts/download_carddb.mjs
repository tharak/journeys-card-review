// Download public card scans with fresh image URLs supplied by Google Sites.
// Run with CARDDB_PLAYWRIGHT_MODULE pointing to an installed Playwright package.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CARDDB_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../carddb');
const urls = JSON.parse(await fs.readFile(path.resolve(root, '../site/source/carddb-pages.json'), 'utf8'));
await fs.mkdir(path.join(root, 'source/images'), { recursive: true });
await fs.writeFile(path.join(root, 'source/page-urls.json'), JSON.stringify(urls, null, 2) + '\n');
const existing = new Map((await fs.readdir(path.join(root, 'source/images')))
  .map(file => [file.replace(/\.(png|jpg|webp)$/, ''), file]));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CARDDB_CHROMIUM ? { executablePath: process.env.CARDDB_CHROMIUM } : {}),
});
const page = await browser.newPage();
const records = [];
try {
  for (const url of urls) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const images = await page.evaluate(() => {
      let heading = '';
      const result = [];
      for (const el of document.querySelectorAll('h1,h2,h3,img')) {
        if (el.tagName !== 'IMG') heading = el.textContent.trim().replace(/\s+/g, ' ');
        else if (el.src.includes('/sitesv-images-rt/')) result.push({ url: el.src, heading });
      }
      return result;
    });
    const slug = url.split('/jime-carddb/')[1].replaceAll('/', '--');
    for (let start = 0; start < images.length; start += 4) {
      const batch = await Promise.all(images.slice(start, start + 4).map(async (image, offset) => {
        const number = start + offset + 1;
        const id = 'carddb-' + slug.replace('home--', '').replaceAll('--', '-') + '-' + String(number).padStart(3, '0');
        let file = existing.get(id);
        let type = 'image/png';
        if (!file) {
          const response = await page.request.get(image.url);
          if (!response.ok()) throw new Error(`${url} #${number}: HTTP ${response.status()}`);
          type = response.headers()['content-type'];
          const extension = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
          file = `${id}.${extension}`;
          await fs.writeFile(path.join(root, 'source/images', file), await response.body());
        }
        return { id, page: url, page_slug: slug, number, ...image, file: 'source/images/' + file, content_type: type };
      }));
      records.push(...batch);
    }
    await fs.writeFile(path.join(root, 'source/downloaded.json'), JSON.stringify(records, null, 2) + '\n');
    console.log(`${records.length} scans saved · ${slug}`);
  }
} finally {
  await browser.close();
}
