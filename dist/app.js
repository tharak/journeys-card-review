const CATEGORIES = [
  { id: 'all', label: 'All cards', icon: '▦' },
  { id: 'hero', label: 'Hero', icon: '♙' },
  { id: 'role', label: 'Role', icon: '✧' },
  { id: 'weapon', label: 'Weapon', icon: '⚔' },
  { id: 'armor', label: 'Armor', icon: '♜' },
  { id: 'trinket', label: 'Trinket', icon: '✦' },
  { id: 'unsorted', label: 'Needs review', icon: '◇' },
];
const VALID = new Set(CATEGORIES.slice(1).map(item => item.id));
const STORAGE_KEY = 'journeys-card-review-categories-v1';
const $ = selector => document.querySelector(selector);
const state = { cards: [], sections: [], overrides: {}, category: 'all', hero: '', search: '', view: 'gallery', visible: [], selected: null };
let toastTimer;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function categoryFor(card) { return state.overrides[card.id] || card.category; }
function titleFor(card) {
  if (card.category === 'hero') return card.hero;
  let title = (card.ocrTitle || '').replace(/^[a-zA-Z]\s+/, '').replace(/^[^A-ZÀ-Ý]+/, '').trim();
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{2,36}$/.test(title) && !/\b(?:l|ii|iii)\b/i.test(title)) return title;
  return `Card ${card.id.slice(-4)}`;
}
function labelFor(category) { return CATEGORIES.find(item => item.id === category)?.label || category; }

function saveOverrides() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides)); }
  catch { showToast('This browser could not save categories. Export a copy.'); }
}

function setCategories(changes) {
  for (const [id, category] of Object.entries(changes)) {
    const card = state.cards.find(item => item.id === id);
    if (!card || !VALID.has(category)) throw new Error(`Invalid card or category: ${id}`);
  }
  for (const [id, category] of Object.entries(changes)) {
    const card = state.cards.find(item => item.id === id);
    if (category === card.category) delete state.overrides[id];
    else state.overrides[id] = category;
  }
  saveOverrides();
  renderCategories();
  renderGallery();
  if (state.selected) renderDialog();
}

function renderCategories() {
  const container = $('#category-list');
  container.replaceChildren();
  for (const category of CATEGORIES) {
    const count = category.id === 'all' ? state.cards.length : state.cards.filter(card => categoryFor(card) === category.id).length;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-button${state.category === category.id ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(state.category === category.id));
    const icon = document.createElement('span'); icon.className = 'category-icon'; icon.textContent = category.icon;
    const label = document.createElement('span'); label.textContent = category.label;
    const tally = document.createElement('span'); tally.className = 'category-count'; tally.textContent = count;
    button.append(icon, label, tally);
    button.addEventListener('click', () => { state.category = category.id; renderCategories(); renderGallery(); });
    container.append(button);
  }
}

function matchingCards() {
  const term = state.search.toLocaleLowerCase();
  return state.cards.filter(card => {
    if (state.category !== 'all' && categoryFor(card) !== state.category) return false;
    if (state.hero && card.hero !== state.hero) return false;
    if (term && !`${card.title} ${titleFor(card)} ${card.hero} ${card.id} ${labelFor(categoryFor(card))}`.toLocaleLowerCase().includes(term)) return false;
    return true;
  });
}

function createCardTile(card) {
  const tile = document.createElement('article');
  tile.className = `card-tile${card.category === 'hero' ? ' hero-tile' : ''}`;
  const imageButton = document.createElement('button');
  imageButton.type = 'button'; imageButton.className = 'tile-image-button';
  imageButton.setAttribute('aria-label', `View ${titleFor(card)} image`);
  const image = document.createElement('img');
  image.src = card.image; image.alt = `${titleFor(card)} card image`; image.loading = 'lazy';
  imageButton.append(image);
  imageButton.addEventListener('click', () => openCard(card.id));
  const body = document.createElement('div'); body.className = 'tile-body';
  const title = document.createElement('span'); title.className = 'tile-title'; title.textContent = titleFor(card); title.title = titleFor(card);
  const meta = document.createElement('div'); meta.className = 'tile-meta';
  const hero = document.createElement('span'); hero.textContent = card.hero;
  const id = document.createElement('span'); id.textContent = `· ${card.id.replace('character-', 'Hero ').replace('card-', '#')}`;
  meta.append(hero, id);
  const select = document.createElement('select'); select.className = `tile-category${categoryFor(card) === 'unsorted' ? ' unsorted' : ''}`;
  select.setAttribute('aria-label', `Category for ${titleFor(card)}`);
  for (const category of CATEGORIES.slice(1)) {
    const option = document.createElement('option'); option.value = category.id; option.textContent = category.label;
    select.append(option);
  }
  select.value = categoryFor(card);
  select.addEventListener('change', () => { setCategories({ [card.id]: select.value }); showToast(`${titleFor(card)} → ${labelFor(select.value)}`); });
  body.append(title, meta, select); tile.append(imageButton, body);
  return tile;
}

function renderGallery() {
  state.visible = matchingCards();
  const gallery = $('#gallery');
  const fragment = document.createDocumentFragment();
  for (const card of state.visible) fragment.append(createCardTile(card));
  gallery.replaceChildren(fragment);
  $('#result-meta').textContent = `${state.visible.length} of ${state.cards.length} images`;
  $('#gallery-empty').hidden = state.visible.length > 0;
}

function renderDialog() {
  const card = state.cards.find(item => item.id === state.selected);
  if (!card) return;
  const index = state.visible.findIndex(item => item.id === card.id);
  $('#dialog-counter').textContent = `Image ${index >= 0 ? index + 1 : 1} of ${state.visible.length || state.cards.length}`;
  $('#dialog-image').src = card.image;
  $('#dialog-image').alt = `${titleFor(card)} card image`;
  $('#dialog-hero').textContent = card.hero;
  $('#dialog-title').textContent = titleFor(card);
  $('#dialog-ocr-note').textContent = card.category === 'hero' ? 'Character sheet from the document.' : card.ocrTitle ? `OCR title: ${card.ocrTitle}. Check it against the image.` : 'The title could not be read automatically. Check the image.';
  const choices = $('#dialog-categories'); choices.replaceChildren();
  for (const category of CATEGORIES.slice(1)) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `choice${categoryFor(card) === category.id ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(categoryFor(card) === category.id));
    button.textContent = category.label;
    button.addEventListener('click', () => { setCategories({ [card.id]: category.id }); showToast(`Saved as ${category.label}`); });
    choices.append(button);
  }
  const source = $('#source-button'); source.textContent = `Document section ${card.section}`;
  source.onclick = () => { $('#card-dialog').close(); switchView('document'); document.getElementById(`section-${card.section}`)?.scrollIntoView(); };
  $('#prev-card').disabled = index <= 0;
  $('#next-card').disabled = index < 0 || index >= state.visible.length - 1;
}

function openCard(id) {
  state.selected = id;
  renderDialog();
  $('#card-dialog').showModal();
}

function moveCard(direction) {
  const index = state.visible.findIndex(item => item.id === state.selected);
  const next = state.visible[index + direction];
  if (next) { state.selected = next.id; renderDialog(); }
}

function renderDocument() {
  const term = $('#document-search').value.trim().toLocaleLowerCase();
  const matches = state.sections.filter(section => !term || `${section.number} ${section.text}`.toLocaleLowerCase().includes(term));
  const container = $('#document-sections');
  const fragment = document.createDocumentFragment();
  for (const section of matches) {
    const article = document.createElement('article'); article.className = 'document-section'; article.id = `section-${section.number}`;
    const capture = document.createElement('div'); capture.className = 'section-capture';
    const image = document.createElement('img'); image.src = section.image; image.loading = 'lazy'; image.alt = `Document screenshot, section ${section.number}`;
    capture.append(image);
    const copy = document.createElement('div'); copy.className = 'section-copy';
    const heading = document.createElement('h2'); heading.textContent = `Section ${String(section.number).padStart(2, '0')}`;
    const text = document.createElement('pre'); text.textContent = section.text || 'No text detected in this section.';
    if (!section.text) text.className = 'no-text';
    copy.append(heading, text); article.append(capture, copy); fragment.append(article);
  }
  container.replaceChildren(fragment);
  $('#document-empty').hidden = matches.length > 0;
}

function switchView(view) {
  state.view = view;
  $('#gallery-view').hidden = view !== 'gallery';
  $('#document-view').hidden = view !== 'document';
  for (const button of document.querySelectorAll('.view-tab')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  if (view === 'document' && !$('#document-sections').children.length) renderDocument();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function registerWebMCP() {
  if (!document.modelContext?.registerTool) return;
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'categorize_cards',
      title: 'Categorize cards',
      description: 'Set categories for one or more cards in this local review. Changes appear in the gallery and are saved in this browser.',
      inputSchema: {
        type: 'object',
        properties: { changes: { type: 'array', items: { type: 'object', properties: {
          id: { type: 'string' }, category: { type: 'string', enum: [...VALID] },
        }, required: ['id', 'category'], additionalProperties: false }, minItems: 1 } },
        required: ['changes'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!Array.isArray(input?.changes) || !input.changes.length) throw new Error('Provide at least one change.');
        const changes = Object.fromEntries(input.changes.map(({ id, category }) => [id, category]));
        setCategories(changes);
        return { changed: Object.keys(changes).length, categories: changes };
      },
    })).catch(() => {});
  } catch { /* WebMCP is optional in browsers without support. */ }
}

async function start() {
  try {
    const response = await fetch('data.json');
    if (!response.ok) throw new Error('Card data could not load.');
    const data = await response.json();
    state.cards = data.cards; state.sections = data.sections;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.overrides = Object.fromEntries(Object.entries(saved).filter(([id, category]) => state.cards.some(card => card.id === id) && VALID.has(category)));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    const heroes = [...new Set(state.cards.map(card => card.hero))];
    for (const hero of heroes) { const option = document.createElement('option'); option.value = hero; option.textContent = hero; $('#hero-filter').append(option); }
    renderCategories(); renderGallery(); registerWebMCP();
  } catch (error) {
    $('#gallery-empty').hidden = false;
    $('#gallery-empty').textContent = 'The review data could not load. Reload this page to try again.';
    console.error(error);
  }
}

document.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#card-search').addEventListener('input', event => { state.search = event.target.value.trim(); renderGallery(); });
$('#hero-filter').addEventListener('change', event => { state.hero = event.target.value; renderGallery(); });
$('#document-search').addEventListener('input', renderDocument);
$('#close-dialog').addEventListener('click', () => $('#card-dialog').close());
$('#prev-card').addEventListener('click', () => moveCard(-1));
$('#next-card').addEventListener('click', () => moveCard(1));
$('#card-dialog').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); moveCard(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); moveCard(1); }
});
$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'journeys-card-categories-v1', categories: state.overrides }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'journeys-card-categories.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Categories exported');
});
$('#import-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'journeys-card-categories-v1' || !data.categories || typeof data.categories !== 'object') throw new Error('Invalid category file');
    setCategories(data.categories);
    showToast('Categories imported');
  } catch { showToast('Could not import this category file'); }
  event.target.value = '';
});
start();
