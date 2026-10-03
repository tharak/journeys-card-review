const CATEGORIES = [
  { id: 'all', label: 'All cards', icon: '▦' },
  { id: 'hero', label: 'Hero', icon: '♙' },
  { id: 'role', label: 'Role', icon: '✧' },
  { id: 'one-handed', label: '1-handed', icon: '⚔' },
  { id: 'two-handed', label: '2-handed', icon: '⚔' },
  { id: 'armor', label: 'Armor', icon: '♜' },
  { id: 'trinket', label: 'Trinket', icon: '✦' },
  { id: 'mount', label: 'Mount', icon: '♞' },
  { id: 'unsorted', label: 'Needs review', icon: '◇' },
  { id: 'deleted', label: 'Deleted', icon: '↶' },
];
const VALID = new Set(CATEGORIES.slice(1, -1).map(item => item.id));
const SHORTCUTS = { q: 'role', w: 'one-handed', e: 'two-handed', r: 'armor', t: 'trinket', y: 'mount' };
const STORAGE_KEY = 'journeys-card-review-categories-v1';
const DELETED_KEY = 'journeys-card-review-deleted-v1';
const $ = selector => document.querySelector(selector);
const state = { cards: [], sections: [], aliases: {}, overrides: {}, deleted: new Set(), category: 'all', search: '', view: 'gallery', visible: [], selected: null };
let toastTimer;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function categoryFor(card) { return state.overrides[card.id] || card.category; }
function canonicalId(id) { return state.aliases[id] || id; }
function normalizeCategory(category) { return category === 'weapon' ? 'unsorted' : category; }
function titleFor(card) {
  if (card.category === 'hero') return card.title;
  let title = (card.ocrTitle || '').replace(/^[a-zA-Z]\s+/, '').replace(/^[^A-ZÀ-Ý]+/, '').trim();
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{2,36}$/.test(title) && !/\b(?:l|ii|iii)\b/i.test(title)) return title;
  return `Card ${card.id.slice(-4)}`;
}
function labelFor(category) { return CATEGORIES.find(item => item.id === category)?.label || category; }

function saveOverrides() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides)); }
  catch { showToast('This browser could not save categories. Export a copy.'); }
}

function saveDeleted() {
  try { localStorage.setItem(DELETED_KEY, JSON.stringify([...state.deleted])); }
  catch { showToast('This browser could not save deletions. Export a copy.'); }
}

function toggleDeleted(id) {
  const card = state.cards.find(item => item.id === id);
  if (!card) return;
  const oldIndex = state.visible.findIndex(item => item.id === id);
  const wasDeleted = state.deleted.has(id);
  if (wasDeleted) state.deleted.delete(id); else state.deleted.add(id);
  saveDeleted(); renderCategories(); renderGallery(Math.max(0, oldIndex));
  if ($('#card-dialog').open) {
    if (state.selected) renderDialog(); else $('#card-dialog').close();
  }
  showToast(`${titleFor(card)} ${wasDeleted ? 'restored' : 'deleted'}`);
}

function setCategories(changes) {
  const oldIndex = state.visible.findIndex(item => item.id === state.selected);
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
  renderGallery(Math.max(0, oldIndex));
  if ($('#card-dialog').open && state.selected) renderDialog();
}

function renderCategories() {
  const container = $('#category-list');
  container.replaceChildren();
  for (const category of CATEGORIES) {
    const count = category.id === 'deleted' ? state.deleted.size : category.id === 'all' ? state.cards.length - state.deleted.size : state.cards.filter(card => !state.deleted.has(card.id) && categoryFor(card) === category.id).length;
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
    if (state.deleted.has(card.id) !== (state.category === 'deleted')) return false;
    if (state.category !== 'all' && state.category !== 'deleted' && categoryFor(card) !== state.category) return false;
    if (term && !`${card.title} ${titleFor(card)} ${card.id} ${labelFor(categoryFor(card))}`.toLocaleLowerCase().includes(term)) return false;
    return true;
  });
}

function createCardTile(card) {
  const tile = document.createElement('article');
  tile.className = `card-tile${card.category === 'hero' ? ' hero-tile' : ''}${state.selected === card.id ? ' current' : ''}${state.deleted.has(card.id) ? ' deleted' : ''}`;
  tile.dataset.cardId = card.id;
  tile.addEventListener('focusin', () => setCurrentCard(card.id));
  tile.addEventListener('click', event => { if (!event.target.closest('button, select')) setCurrentCard(card.id); });
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
  const category = document.createElement('span'); category.textContent = labelFor(categoryFor(card));
  const id = document.createElement('span'); id.textContent = `· ${card.id.replace('character-', 'Hero ').replace('card-', '#')}`;
  meta.append(category, id);
  const select = document.createElement('select'); select.className = `tile-category${categoryFor(card) === 'unsorted' ? ' unsorted' : ''}`;
  select.setAttribute('aria-label', `Category for ${titleFor(card)}`);
  for (const category of CATEGORIES.slice(1, -1)) {
    const option = document.createElement('option'); option.value = category.id; option.textContent = category.label;
    select.append(option);
  }
  select.value = categoryFor(card);
  select.addEventListener('change', () => { setCurrentCard(card.id); setCategories({ [card.id]: select.value }); showToast(`${titleFor(card)} → ${labelFor(select.value)}`); });
  if (state.deleted.has(card.id)) {
    const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'tile-restore'; restore.textContent = 'Restore card';
    restore.addEventListener('click', () => toggleDeleted(card.id));
    body.append(title, meta, restore);
  } else body.append(title, meta, select);
  tile.append(imageButton, body);
  return tile;
}

function renderGallery(fallbackIndex = null) {
  state.visible = matchingCards();
  if (!state.visible.some(card => card.id === state.selected)) {
    const fallback = fallbackIndex === null
      ? state.visible.find(card => card.category !== 'hero') || state.visible[0]
      : state.visible[Math.min(fallbackIndex, state.visible.length - 1)];
    state.selected = fallback?.id || null;
  }
  const gallery = $('#gallery');
  const fragment = document.createDocumentFragment();
  for (const card of state.visible) fragment.append(createCardTile(card));
  gallery.replaceChildren(fragment);
  $('#result-meta').textContent = `${state.visible.length} of ${state.category === 'deleted' ? state.deleted.size : state.cards.length - state.deleted.size} images`;
  $('#gallery-empty').hidden = state.visible.length > 0;
  updateCurrentLabel();
}

function updateCurrentLabel() {
  const card = state.cards.find(item => item.id === state.selected);
  $('#current-card-label').textContent = card ? `Current: ${titleFor(card)} · ${card.id.replace('card-', '#').replace('character-', 'Hero ')}` : 'No current card';
}

function setCurrentCard(id, scroll = false) {
  if (!state.visible.some(card => card.id === id)) return;
  state.selected = id;
  document.querySelector('.card-tile.current')?.classList.remove('current');
  const tile = document.querySelector(`.card-tile[data-card-id="${id}"]`);
  tile?.classList.add('current');
  if (scroll) tile?.scrollIntoView({ block: 'center', inline: 'nearest' });
  updateCurrentLabel();
  if ($('#card-dialog').open) renderDialog();
}

function renderDialog() {
  const card = state.cards.find(item => item.id === state.selected);
  if (!card) return;
  const index = state.visible.findIndex(item => item.id === card.id);
  $('#dialog-counter').textContent = `Image ${index >= 0 ? index + 1 : 1} of ${state.visible.length || state.cards.length}`;
  $('#dialog-image').src = card.image;
  $('#dialog-image').alt = `${titleFor(card)} card image`;
  $('#dialog-category').textContent = labelFor(categoryFor(card));
  $('#dialog-title').textContent = titleFor(card);
  $('#dialog-ocr-note').textContent = card.category === 'hero' ? 'Character sheet from the document.' : card.ocrTitle ? `OCR title: ${card.ocrTitle}. Check it against the image.` : 'The title could not be read automatically. Check the image.';
  const choices = $('#dialog-categories'); choices.replaceChildren();
  for (const category of CATEGORIES.slice(1, -1)) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `choice${categoryFor(card) === category.id ? ' active' : ''}`;
    button.setAttribute('aria-pressed', String(categoryFor(card) === category.id));
    button.textContent = category.label;
    button.disabled = state.deleted.has(card.id);
    button.addEventListener('click', () => { setCategories({ [card.id]: category.id }); showToast(`Saved as ${category.label}`); });
    choices.append(button);
  }
  const source = $('#source-button'); source.textContent = `Document section ${card.section}`;
  source.onclick = () => { $('#card-dialog').close(); switchView('document'); document.getElementById(`section-${card.section}`)?.scrollIntoView(); };
  const deleteButton = $('#delete-card');
  deleteButton.textContent = state.deleted.has(card.id) ? 'Restore card' : 'Delete card';
  deleteButton.onclick = () => toggleDeleted(card.id);
  $('#prev-card').disabled = index <= 0;
  $('#next-card').disabled = index < 0 || index >= state.visible.length - 1;
}

function openCard(id) {
  setCurrentCard(id);
  renderDialog();
  $('#card-dialog').showModal();
}

function moveCard(direction) {
  const index = state.visible.findIndex(item => item.id === state.selected);
  const next = state.visible[index + direction];
  if (next) setCurrentCard(next.id, !$('#card-dialog').open);
}

function categorizeCurrent(category) {
  const current = state.cards.find(card => card.id === state.selected);
  if (!current) return;
  const index = state.visible.findIndex(card => card.id === current.id);
  const nextId = state.visible[index + 1]?.id;
  setCategories({ [current.id]: category });
  if (nextId && state.visible.some(card => card.id === nextId)) setCurrentCard(nextId, !$('#card-dialog').open);
  else if (state.selected) setCurrentCard(state.selected, !$('#card-dialog').open);
  showToast(`${titleFor(current)} → ${labelFor(category)}`);
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
    state.cards = data.cards; state.sections = data.sections; state.aliases = data.aliases || {};
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.overrides = Object.fromEntries(Object.entries(saved).map(([id, category]) => [canonicalId(id), normalizeCategory(category)]).filter(([id, category]) => state.cards.some(card => card.id === id) && VALID.has(category)));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]');
      if (Array.isArray(saved)) state.deleted = new Set(saved.filter(id => state.cards.some(card => card.id === id)));
    } catch { /* The gallery still works if storage is unavailable. */ }
    renderCategories(); renderGallery(); registerWebMCP();
  } catch (error) {
    $('#gallery-empty').hidden = false;
    $('#gallery-empty').textContent = 'The review data could not load. Reload this page to try again.';
    console.error(error);
  }
}

document.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#card-search').addEventListener('input', event => { state.search = event.target.value.trim(); renderGallery(); });
$('#document-search').addEventListener('input', renderDocument);
$('#close-dialog').addEventListener('click', () => $('#card-dialog').close());
$('#prev-card').addEventListener('click', () => moveCard(-1));
$('#next-card').addEventListener('click', () => moveCard(1));
document.addEventListener('keydown', event => {
  if (state.view !== 'gallery' || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    moveCard(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (event.key === 'Delete' && !event.repeat && state.selected) { event.preventDefault(); toggleDeleted(state.selected); return; }
  const category = SHORTCUTS[event.key.toLowerCase()];
  if (category && !event.repeat) { event.preventDefault(); categorizeCurrent(category); }
});
$('#export-button').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'journeys-card-review-v3', categories: state.overrides, deleted: [...state.deleted] }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'journeys-card-review.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Review exported');
});
$('#import-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!['journeys-card-categories-v1', 'journeys-card-categories-v2', 'journeys-card-review-v3'].includes(data.format) || !data.categories || typeof data.categories !== 'object' || Array.isArray(data.categories)) throw new Error('Invalid review file');
    const changes = Object.fromEntries(Object.entries(data.categories).map(([id, category]) => [canonicalId(id), normalizeCategory(category)]).filter(([id]) => state.cards.some(card => card.id === id)));
    setCategories(changes);
    if (data.format === 'journeys-card-review-v3') {
      if (!Array.isArray(data.deleted)) throw new Error('Invalid deleted cards');
      state.deleted = new Set(data.deleted.filter(id => state.cards.some(card => card.id === id)));
      saveDeleted(); renderCategories(); renderGallery();
    }
    showToast('Review imported');
  } catch { showToast('Could not import this review file'); }
  event.target.value = '';
});
start();
