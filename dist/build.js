import { isCardOrder, cardOrderFor, compareCardOrder } from './review-data.mjs';

import { cardsFor, subcategoriesFor, normalizeBuildSelection, renderBuildFlow } from './build-flow.mjs';

const $ = selector => document.querySelector(selector);
const TYPES = [
  ['all', 'All cards'], ['hero', 'Hero cards'], ['hero-card', 'Hero card'], ['card-back', 'Hero back'], ['role', 'Role cards'],
  ['one-handed', '1-handed'], ['two-handed', '2-handed'], ['armor', 'Armor'],
  ['trinket', 'Trinket'], ['mount', 'Mount'], ['hand-item', 'Hand items'],
  ['basic', 'Basic'], ['title', 'Title'], ['weakness', 'Weakness'], ['unsorted', 'Other'],
];
const LABELS = Object.fromEntries(TYPES);
const DRAFT_KEY = 'journeys-build-creator-draft-v1';
const SAVED_KEY = 'journeys-build-creator-saved-v1';
const REVIEW_KEYS = {
  categories: 'journeys-card-review-categories-v1',
  subcategories: 'journeys-card-review-subcategories-v1',
  orders: 'journeys-card-review-orders-v1',
  titles: 'journeys-card-review-titles-v1',
  deleted: 'journeys-card-review-deleted-v1',
};
const emptyDraft = () => ({ id: '', name: '', heroId: '', role: '', notes: '', cards: {}, weaponMode: '', weaponSubcategories: [], armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' });
const state = { loaded: false, data: null, capture: {}, cards: [], byId: new Map(), heroes: [],
  draft: emptyDraft(), saved: [] };
let toastTimer;

function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').classList.toggle('error', error);
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
    toast('This browser could not save the build. Export a copy.', true);
    return false;
  }
}

function persistDraft() {
  writeStored(DRAFT_KEY, state.draft);
}

function applyReviews() {
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const knownIds = new Set(state.data.cards.map(card => card.id));
  const categories = Object.fromEntries(Object.entries(record(readStored(REVIEW_KEYS.categories, {})))
    .map(([id, category]) => [knownIds.has(id) ? id : state.data.aliases?.[id] || id, category === 'weapon' ? 'unsorted' : category]));
  const subcategories = record(readStored(REVIEW_KEYS.subcategories, {}));
  const orders = Object.fromEntries(Object.entries(record(readStored(REVIEW_KEYS.orders, {}))).filter(([, value]) => isCardOrder(value)));
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
      order: cardOrderFor(card, orders),
      deleted: deleted.has(card.id) };
  }).sort((a, b) => compareCardOrder(a.order, b.order));
  state.byId = new Map(state.cards.map(card => [card.id, card]));
  state.heroes = cardsFor(state.cards, 'hero-card');
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
  for (const key of ['weaponMode', 'armorSubcategory', 'trinketSubcategory', 'mountSubcategory']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid build ${key}.`);
  }
  if (input.weaponSubcategories !== undefined && (!Array.isArray(input.weaponSubcategories)
    || input.weaponSubcategories.length > 2 || input.weaponSubcategories.some(value => typeof value !== 'string'))) {
    throw new Error('Invalid build weapons.');
  }
  if (draft.heroId && !state.heroes.some(hero => hero.id === draft.heroId)) throw new Error('This build uses an unknown hero.');
  if (draft.role && !subcategoriesFor(state.cards, 'role').includes(draft.role)) throw new Error('This build uses an unknown role.');
  if (importing && !Array.isArray(input.cards)) throw new Error('The build is missing its card list.');
  const entries = Array.isArray(input.cards) ? input.cards.map(card => [card?.id, card?.quantity])
    : Object.entries(input.cards && typeof input.cards === 'object' ? input.cards : {});
  for (const [originalId, quantity] of entries) {
    const id = state.byId.has(originalId) ? originalId : state.data.aliases?.[originalId] || originalId;
    if (typeof id !== 'string' || !state.byId.has(id) || state.byId.get(id).buildEligible === false || ['hero-card', 'card-back'].includes(state.byId.get(id).category) || id.startsWith('character-')) throw new Error(`Unknown card: ${originalId}`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9) throw new Error('Card quantities must be between 1 and 9.');
    draft.cards[id] = Math.min(9, (draft.cards[id] || 0) + quantity);
  }
  const equipment = { ...input };
  if (input.weaponMode === undefined) {
    const weapons = [...new Map(Object.keys(draft.cards).map(id => state.byId.get(id))
      .filter(card => ['one-handed', 'two-handed'].includes(card.category) && card.subcategory)
      .map(card => [`${card.category}:${card.subcategory}`, card])).values()];
    equipment.weaponMode = weapons[0]?.category || '';
    equipment.weaponSubcategories = weapons.filter(card => card.category === equipment.weaponMode).slice(0, 2).map(card => card.subcategory);
    for (const category of ['armor', 'trinket', 'mount']) {
      equipment[`${category}Subcategory`] = Object.keys(draft.cards).map(id => state.byId.get(id)).find(card => card.category === category)?.subcategory || '';
    }
  }
  const { heroCardId, pickedCardIds, ...choices } = normalizeBuildSelection({ ...equipment, heroCardId: draft.heroId, role: draft.role, pickedCardIds: Object.keys(draft.cards) }, state.cards);
  Object.assign(draft, choices);
  draft.cards = Object.fromEntries(pickedCardIds.map(id => [id, draft.cards[id]]));
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
  renderSaved();
}

function renderLibrary() {
  const selection = renderBuildFlow($('#creator-flow'), {
    cards: state.cards, selection: { ...state.draft, heroCardId: state.draft.heroId, pickedCardIds: Object.keys(state.draft.cards) },
    prefix: 'creator', onPreview: preview,
    onChange(selection) {
      const { heroCardId, pickedCardIds, ...choices } = normalizeBuildSelection(selection, state.cards);
      state.draft.cards = Object.fromEntries(pickedCardIds.map(id => [id, state.draft.cards[id] || 1]));
      state.draft.heroId = heroCardId;
      Object.assign(state.draft, choices);
      persistDraft(); renderActions(); renderLibrary();
    },
  });
  state.draft.cards = Object.fromEntries(selection.pickedCardIds.map(id => [id, state.draft.cards[id] || 1]));
}

function selectedCards() {
  return Object.entries(state.draft.cards).map(([id, quantity]) => ({ card: state.byId.get(id), quantity })).filter(item => item.card);
}

function renderActions() {
  $('#save-build').disabled = !state.draft.heroId;
  $('#export-build').disabled = !state.draft.heroId;
}

function preview(id) {
  const card = state.byId.get(id); if (!card) return;
  $('#preview-image').src = card.image; $('#preview-image').alt = `${card.title} card`;
  $('#preview-dialog').showModal();
}

function loadDraft(draft) {
  state.draft = draft; persistDraft(); renderSetup(); renderActions(); renderLibrary();
}

function saveBuild() {
  if (!state.draft.heroId) return;
  const id = state.draft.id || (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const build = { ...structuredClone(state.draft), id, name: state.draft.name.trim() || `${heroName()} build`, updatedAt: new Date().toISOString() };
  const saved = [...state.saved.filter(item => item.id !== id), build];
  if (!writeStored(SAVED_KEY, saved)) return;
  state.saved = saved; state.draft = normalizeDraft(build); persistDraft(); renderSetup(); renderActions();
  toast('Build saved');
}

function exportBuild() {
  if (!state.draft.heroId) return;
  const name = state.draft.name.trim() || `${heroName()} build`;
  const data = { format: 'journeys-build-v1', name, heroId: state.draft.heroId, hero: heroName(), role: state.draft.role,
    notes: state.draft.notes, weaponMode: state.draft.weaponMode, weaponSubcategories: state.draft.weaponSubcategories,
    armorSubcategory: state.draft.armorSubcategory, trinketSubcategory: state.draft.trinketSubcategory, mountSubcategory: state.draft.mountSubcategory,
    cards: selectedCards().map(({ card, quantity }) => ({ id: card.id, title: card.title, quantity, category: card.category, subcategory: card.subcategory })) };
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
    for (const id of ['saved-builds', 'build-name']) $( `#${id}`).disabled = false;
    $('#loading').hidden = true;
    renderSetup(); renderActions(); renderLibrary();
  } catch (error) { $('#loading').textContent = error.message; }
}

$('#build-name').addEventListener('input', event => { state.draft.name = event.target.value; persistDraft(); renderActions(); });
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
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not valid JSON.' : error.message, true); }
  event.target.value = '';
});
$('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
window.addEventListener('storage', event => {
  if (state.loaded && [...Object.values(REVIEW_KEYS), 'journeys-card-review-duplicate-review-v1'].includes(event.key)) {
    applyReviews(); renderSetup(); renderActions(); renderLibrary();
  }
});
start();
