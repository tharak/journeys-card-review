const $ = selector => document.querySelector(selector);
const TYPES = [
  ['all', 'All cards'], ['hero', 'Hero cards'], ['role', 'Role cards'],
  ['one-handed', '1-handed'], ['two-handed', '2-handed'], ['armor', 'Armor'],
  ['trinket', 'Trinket'], ['mount', 'Mount'], ['unsorted', 'Other'],
];
const LABELS = Object.fromEntries(TYPES);
const EQUIPMENT = new Set(['one-handed', 'two-handed', 'armor', 'trinket', 'mount']);
const DRAFT_KEY = 'journeys-build-creator-draft-v1';
const SAVED_KEY = 'journeys-build-creator-saved-v1';
const REVIEW_KEYS = {
  categories: 'journeys-card-review-categories-v1',
  subcategories: 'journeys-card-review-subcategories-v1',
  titles: 'journeys-card-review-titles-v1',
  deleted: 'journeys-card-review-deleted-v1',
};
const emptyDraft = () => ({ id: '', name: '', heroId: '', role: '', notes: '', cards: {} });
const state = { loaded: false, data: null, capture: {}, cards: [], byId: new Map(), heroes: [],
  draft: emptyDraft(), saved: [], category: 'all', subcategory: '', search: '', matching: true };
let toastTimer;

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
}

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

function writeStored(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; }
  catch {
    $('#save-status').textContent = 'Export your build to keep a copy.';
    toast('This browser could not save the build. Export a copy.');
    return false;
  }
}

function persistDraft() {
  if (writeStored(DRAFT_KEY, state.draft)) $('#save-status').textContent = 'Draft saved in this browser.';
}

function applyReviews() {
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const categories = Object.fromEntries(Object.entries(record(readStored(REVIEW_KEYS.categories, {})))
    .map(([id, category]) => [state.data.aliases?.[id] || id, category === 'weapon' ? 'unsorted' : category]));
  const subcategories = record(readStored(REVIEW_KEYS.subcategories, {}));
  const titles = record(readStored(REVIEW_KEYS.titles, {}));
  const savedDeleted = readStored(REVIEW_KEYS.deleted, []);
  let initialized = false;
  try { initialized = localStorage.getItem('journeys-card-review-duplicate-review-v1') === '1'; } catch { /* Use the published catalog. */ }
  const deleted = new Set([
    ...(initialized ? [] : state.data.deletedCards || []),
    ...(Array.isArray(savedDeleted) ? savedDeleted : []),
  ]);
  state.cards = state.data.cards.map(card => {
    const category = Object.hasOwn(LABELS, categories[card.id]) && categories[card.id] !== 'all'
      ? categories[card.id] : card.category;
    const fallback = state.capture[card.id]?.title || card.title || card.id;
    const publishedTitle = card.displayTitle && !/^Card \d+$/i.test(card.displayTitle) ? card.displayTitle : fallback;
    return { ...card, category, title: typeof titles[card.id] === 'string' && titles[card.id].trim() ? titles[card.id] : publishedTitle,
      subcategory: typeof subcategories[card.id] === 'string' ? subcategories[card.id] : card.subcategory || '',
      deleted: deleted.has(card.id) };
  });
  state.byId = new Map(state.cards.map(card => [card.id, card]));
  state.heroes = state.cards.filter(card => card.id.startsWith('character-'));
}

function normalizeDraft(input, importing = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a build JSON file.');
  if (importing && input.format !== 'journeys-build-v1') throw new Error('Choose an exported Journeys build file.');
  const draft = emptyDraft();
  for (const key of ['id', 'name', 'heroId', 'role', 'notes']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid build ${key}.`);
    draft[key] = input[key] || '';
  }
  draft.name = draft.name.slice(0, 100);
  draft.notes = draft.notes.slice(0, 10000);
  if (draft.heroId && !state.heroes.some(hero => hero.id === draft.heroId)) throw new Error('This build uses an unknown hero.');
  if (draft.role && !state.data.roleSubcategories.includes(draft.role)) throw new Error('This build uses an unknown role.');
  if (importing && !Array.isArray(input.cards)) throw new Error('The build is missing its card list.');
  const entries = Array.isArray(input.cards) ? input.cards.map(card => [card?.id, card?.quantity])
    : Object.entries(input.cards && typeof input.cards === 'object' ? input.cards : {});
  for (const [originalId, quantity] of entries) {
    const id = state.data.aliases?.[originalId] || originalId;
    if (typeof id !== 'string' || !state.byId.has(id) || id.startsWith('character-')) throw new Error(`Unknown card: ${originalId}`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9) throw new Error('Card quantities must be between 1 and 9.');
    draft.cards[id] = Math.min(9, (draft.cards[id] || 0) + quantity);
  }
  return draft;
}

function heroName() {
  const hero = state.byId.get(state.draft.heroId);
  return hero ? hero.subcategory || hero.title : '';
}

function fillSelect(select, options, placeholder, selected) {
  select.replaceChildren(new Option(placeholder, ''));
  for (const [value, label] of options) select.add(new Option(label, value));
  select.value = selected;
}

function renderSaved() {
  fillSelect($('#saved-builds'), state.saved.map(build => [build.id, build.name || 'A new journey']), 'Choose a saved build', state.draft.id);
}

function renderSetup() {
  $('#build-name').value = state.draft.name;
  $('#build-notes').value = state.draft.notes;
  fillSelect($('#hero-select'), state.heroes.map(card => [card.id, card.title]), 'Choose a hero', state.draft.heroId);
  fillSelect($('#role-select'), state.data.roleSubcategories.map(role => [role, role]), 'Choose a role', state.draft.role);
  const portrait = $('#hero-portrait');
  const hero = state.byId.get(state.draft.heroId);
  if (hero) {
    const image = document.createElement('img'); image.src = hero.image; image.alt = `${hero.title} character sheet`;
    const button = document.createElement('button'); button.className = 'art-button'; button.type = 'button';
    button.setAttribute('aria-label', `View ${hero.title} character sheet`);
    button.append(image); button.addEventListener('click', () => preview(hero.id));
    portrait.replaceChildren(button);
  } else {
    const mark = document.createElement('span'); mark.textContent = '✦'; mark.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('p'); copy.textContent = 'A hero awaits'; portrait.replaceChildren(mark, copy);
  }
  renderSaved();
}

function availableCards() {
  const hero = heroName();
  return state.cards.filter(card => {
    if (card.deleted || card.id.startsWith('character-')) return false;
    if (state.category !== 'all' && card.category !== state.category) return false;
    if (state.matching && hero && card.category === 'hero' && card.subcategory !== hero) return false;
    if (state.matching && state.draft.role && card.category === 'role' && card.subcategory !== state.draft.role) return false;
    if (state.search && !`${card.title} ${card.id} ${LABELS[card.category] || ''} ${card.subcategory}`.toLocaleLowerCase().includes(state.search)) return false;
    return true;
  });
}

function renderFilters() {
  const filters = $('#library-filters'); filters.replaceChildren();
  for (const [id, label] of TYPES) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = `filter-button${state.category === id ? ' active' : ''}`;
    button.textContent = label; button.setAttribute('aria-pressed', String(state.category === id));
    button.addEventListener('click', () => { state.category = id; state.subcategory = ''; renderFilters(); renderLibrary(); });
    filters.append(button);
  }
}

function renderLibrary() {
  const available = availableCards();
  const subcategories = [...new Set(available.map(card => card.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (!subcategories.includes(state.subcategory)) state.subcategory = '';
  fillSelect($('#subcategory-filter'), subcategories.map(value => [value, value]), 'All subcategories', state.subcategory);
  const cards = available.filter(card => !state.subcategory || card.subcategory === state.subcategory);
  $('#library-count').textContent = `${cards.length} cards`;
  $('#library-empty').hidden = cards.length > 0;
  const fragment = document.createDocumentFragment();
  for (const card of cards) {
    const quantity = state.draft.cards[card.id] || 0;
    const tile = document.createElement('article'); tile.className = `builder-card${quantity ? ' in-build' : ''}`;
    const art = document.createElement('button'); art.className = 'art-button'; art.type = 'button';
    art.setAttribute('aria-label', `View ${card.title}`); art.addEventListener('click', () => preview(card.id));
    const image = document.createElement('img'); image.src = card.image; image.alt = `${card.title} card`; image.loading = 'lazy';
    art.append(image);
    const title = document.createElement('h3'); title.textContent = card.title; title.title = card.title;
    const meta = document.createElement('p'); meta.textContent = [LABELS[card.category] || 'Other', card.subcategory].filter(Boolean).join(' · ');
    const add = document.createElement('button'); add.type = 'button'; add.className = 'add-card';
    add.textContent = quantity ? `Add another · ${quantity} in build` : '+ Add to build'; add.disabled = quantity >= 9;
    add.setAttribute('aria-label', `Add ${card.title} to build`); add.addEventListener('click', () => changeQuantity(card.id, 1));
    tile.append(art, title, meta, add); fragment.append(tile);
  }
  $('#card-library').replaceChildren(fragment);
}

function selectedCards() {
  return Object.entries(state.draft.cards).map(([id, quantity]) => ({ card: state.byId.get(id), quantity })).filter(item => item.card);
}

function renderSummary() {
  const selected = selectedCards();
  $('#summary-title').textContent = state.draft.name.trim() || 'A new journey';
  $('#summary-hero').textContent = [heroName(), state.draft.role].filter(Boolean).join(' · ') || 'Choose a hero to begin';
  $('#skill-count').textContent = selected.filter(({ card }) => ['hero', 'role'].includes(card.category)).reduce((sum, item) => sum + item.quantity, 0);
  $('#equipment-count').textContent = selected.filter(({ card }) => EQUIPMENT.has(card.category)).reduce((sum, item) => sum + item.quantity, 0);
  $('#save-build').disabled = !state.draft.heroId;
  $('#export-build').disabled = !state.draft.heroId;
  const container = $('#selected-cards'); container.replaceChildren();
  if (!selected.length) {
    const copy = document.createElement('p'); copy.className = 'summary-empty'; copy.textContent = 'Your selected cards will appear here.'; container.append(copy);
  }
  const groups = [ ['Hero cards', card => card.category === 'hero'], ['Role cards', card => card.category === 'role'],
    ['Equipment', card => EQUIPMENT.has(card.category)], ['Other cards', card => !['hero', 'role'].includes(card.category) && !EQUIPMENT.has(card.category)] ];
  for (const [label, match] of groups) {
    const cards = selected.filter(({ card }) => match(card)); if (!cards.length) continue;
    const group = document.createElement('section'); group.className = 'selected-group';
    const heading = document.createElement('h3'); heading.textContent = label; group.append(heading);
    for (const { card, quantity } of cards) {
      const row = document.createElement('div'); row.className = 'selected-row';
      const art = document.createElement('button'); art.type = 'button'; art.setAttribute('aria-label', `View ${card.title}`);
      const image = document.createElement('img'); image.src = card.image; image.alt = ''; image.loading = 'lazy'; art.append(image);
      art.addEventListener('click', () => preview(card.id));
      const title = document.createElement('span'); title.textContent = card.title;
      const controls = document.createElement('div'); controls.className = 'quantity-controls';
      const minus = document.createElement('button'); minus.type = 'button'; minus.textContent = '−'; minus.setAttribute('aria-label', `Remove one ${card.title}`);
      minus.addEventListener('click', () => changeQuantity(card.id, -1));
      const tally = document.createElement('span'); tally.textContent = quantity;
      const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '+'; plus.disabled = quantity >= 9;
      plus.setAttribute('aria-label', `Add one ${card.title}`); plus.addEventListener('click', () => changeQuantity(card.id, 1));
      controls.append(minus, tally, plus); row.append(art, title, controls); group.append(row);
    }
    container.append(group);
  }
}

function changeQuantity(id, change) {
  const quantity = Math.min(9, (state.draft.cards[id] || 0) + change);
  if (quantity > 0) state.draft.cards[id] = quantity; else delete state.draft.cards[id];
  persistDraft(); renderSummary(); renderLibrary();
}

function preview(id) {
  const card = state.byId.get(id); if (!card) return;
  $('#preview-title').textContent = card.title;
  $('#preview-image').src = card.image; $('#preview-image').alt = `${card.title} card`;
  $('#preview-dialog').showModal();
}

function loadDraft(draft) {
  state.draft = draft; persistDraft(); renderSetup(); renderSummary(); renderLibrary();
}

function chooseHero(id) {
  const oldHero = heroName();
  for (const [cardId] of Object.entries(state.draft.cards)) {
    const card = state.byId.get(cardId);
    if (card.category === 'hero' && card.subcategory === oldHero) delete state.draft.cards[cardId];
  }
  state.draft.heroId = id;
  const hero = heroName();
  let added = 0;
  if (hero) for (const card of state.cards) {
    if (!card.deleted && !card.id.startsWith('character-') && card.category === 'hero' && card.subcategory === hero) {
      state.draft.cards[card.id] = 1; added++;
    }
  }
  persistDraft(); renderSetup(); renderSummary(); renderLibrary();
  if (hero) toast(`${hero} selected · ${added} hero cards added`);
}

function saveBuild() {
  if (!state.draft.heroId) return;
  const id = state.draft.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const build = { ...structuredClone(state.draft), id, name: state.draft.name.trim() || `${heroName()} build`, updatedAt: new Date().toISOString() };
  const saved = [...state.saved.filter(item => item.id !== id), build];
  if (!writeStored(SAVED_KEY, saved)) return;
  state.saved = saved; state.draft = normalizeDraft(build); persistDraft(); renderSetup(); renderSummary();
  $('#save-status').textContent = `Saved “${build.name}” in this browser.`;
  toast('Build saved');
}

function exportBuild() {
  if (!state.draft.heroId) return;
  const name = state.draft.name.trim() || `${heroName()} build`;
  const data = { format: 'journeys-build-v1', name, heroId: state.draft.heroId, hero: heroName(), role: state.draft.role,
    notes: state.draft.notes, cards: selectedCards().map(({ card, quantity }) => ({ id: card.id, title: card.title, quantity, category: card.category, subcategory: card.subcategory })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'journeys'}-build.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Build exported');
}

async function start() {
  try {
    const [dataResponse, captureResponse] = await Promise.all([fetch('data.json'), fetch('capture-v2.json')]);
    if (!dataResponse.ok || !captureResponse.ok) throw new Error('Card data could not load. Reload to try again.');
    [state.data, state.capture] = await Promise.all([dataResponse.json(), captureResponse.json()]);
    applyReviews();
    const saved = readStored(SAVED_KEY, []);
    for (const item of Array.isArray(saved) ? saved : []) {
      try { const build = normalizeDraft(item); if (build.id) state.saved.push(build); } catch { /* Keep other readable builds. */ }
    }
    try { state.draft = normalizeDraft(readStored(DRAFT_KEY, emptyDraft())); } catch { state.draft = emptyDraft(); }
    state.loaded = true;
    for (const id of ['saved-builds', 'build-name', 'build-notes', 'hero-select', 'role-select', 'build-search', 'subcategory-filter']) $( `#${id}`).disabled = false;
    $('#loading').hidden = true;
    renderSetup(); renderFilters(); renderSummary(); renderLibrary();
  } catch (error) { $('#loading').textContent = error.message; }
}

$('#hero-select').addEventListener('change', event => chooseHero(event.target.value));
$('#role-select').addEventListener('change', event => { state.draft.role = event.target.value; persistDraft(); renderSummary(); renderLibrary(); });
$('#build-name').addEventListener('input', event => { state.draft.name = event.target.value; persistDraft(); renderSummary(); });
$('#build-notes').addEventListener('input', event => { state.draft.notes = event.target.value; persistDraft(); });
$('#build-search').addEventListener('input', event => { state.search = event.target.value.trim().toLocaleLowerCase(); renderLibrary(); });
$('#matching-only').addEventListener('change', event => { state.matching = event.target.checked; renderLibrary(); });
$('#subcategory-filter').addEventListener('change', event => { state.subcategory = event.target.value; renderLibrary(); });
$('#saved-builds').addEventListener('change', event => {
  const build = state.saved.find(item => item.id === event.target.value);
  if (build) { loadDraft(normalizeDraft(build)); toast('Saved build opened'); }
});
$('#new-build').addEventListener('click', () => { if (state.loaded) { loadDraft(emptyDraft()); toast('New build started'); } });
$('#save-build').addEventListener('click', saveBuild);
$('#export-build').addEventListener('click', exportBuild);
$('#import-build').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (!state.loaded) throw new Error('Wait for the cards to finish loading.');
    if (file.size > 2 * 1024 * 1024) throw new Error('This file is too large for a build.');
    const draft = normalizeDraft(JSON.parse(await file.text()), true); draft.id = '';
    loadDraft(draft); toast('Build imported. Save it to keep a named copy.');
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message); }
  event.target.value = '';
});
$('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
window.addEventListener('storage', event => {
  if (state.loaded && [...Object.values(REVIEW_KEYS), 'journeys-card-review-duplicate-review-v1'].includes(event.key)) {
    applyReviews(); renderSetup(); renderSummary(); renderLibrary();
  }
});
start();
