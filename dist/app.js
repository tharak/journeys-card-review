import { connectBuildList } from './build-list.mjs';
import { connectAccount } from './firebase-client.mjs';
import { REVIEW_FIELDS, normalizeCategory, parseReview, createReview, createSiteData, isCardOrder, cardOrderFor, compareCardOrder } from './review-data.mjs';
import { connectCloudReview } from './cloud-review.mjs';
import { connectSegmentedControl } from './segmented-control.mjs';

const CATEGORIES = [
  { id: 'all', label: 'All cards', icon: '▦' },
  { id: 'hero', label: 'Hero', icon: '♙' },
  { id: 'hero-card', label: 'Hero-card', icon: '♟' },
  { id: 'role', label: 'Role', icon: '✧' },
  { id: 'one-handed', label: '1-handed', icon: '⚔' },
  { id: 'two-handed', label: '2-handed', icon: '⚔' },
  { id: 'armor', label: 'Armor', icon: '♜' },
  { id: 'trinket', label: 'Trinket', icon: '✦' },
  { id: 'mount', label: 'Mount', icon: '♞' },
  { id: 'hand-item', label: 'Hand items', icon: '⚔' },
  { id: 'basic', label: 'Basic', icon: '✧' },
  { id: 'title', label: 'Title', icon: '✦' },
  { id: 'weakness', label: 'Weakness', icon: '◇' },
  { id: 'terrain', label: 'Terrain', icon: '▦' },
  { id: 'damage', label: 'Damage', icon: '✦' },
  { id: 'fear', label: 'Fear', icon: '◇' },
  { id: 'boon', label: 'Boon', icon: '✧' },
  { id: 'bane', label: 'Bane', icon: '◇' },
  { id: 'captured', label: 'Captured / Escape', icon: '↶' },
  { id: 'card-back', label: 'Character backs', icon: '♟' },
  { id: 'unsorted', label: 'Needs review', icon: '◇' },
  { id: 'deleted', label: 'Deleted', icon: '↶' },
];
const VALID = new Set(CATEGORIES.slice(1, -1).map(item => item.id));
const SHORTCUTS = { q: 'role', w: 'one-handed', e: 'two-handed', r: 'armor', t: 'trinket', y: 'mount', u: 'hero' };
const STORAGE_KEY = 'journeys-card-review-categories-v1';
const DELETED_KEY = 'journeys-card-review-deleted-v1';
const SUBCATEGORY_KEY = 'journeys-card-review-subcategories-v1';
const ORDER_KEY = 'journeys-card-review-orders-v1';
const CARD_TEXT_KEY = 'journeys-card-review-card-text-v1';
const TITLE_KEY = 'journeys-card-review-titles-v1';
const BUILD_KEY = 'journeys-card-review-build-v1';
const DUPLICATE_REVIEW_KEY = 'journeys-card-review-duplicate-review-v1';
const $ = selector => document.querySelector(selector);
const state = { cards: [], sections: [], aliases: {}, sourceData: null, overrides: {}, subcategoryOverrides: {}, orderOverrides: {}, textOverrides: {}, titleOverrides: {}, roleSubcategories: [], heroNames: [], duplicateIds: [], deleted: new Set(), category: 'all', subcategory: '', search: '', sort: 'original', view: 'builds', visible: [], selected: null, build: { heroCardId: '', role: '', weaponMode: '', weaponSubcategories: [], armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' } };
let toastTimer;
let cloudReview;
let buildList;
let canEditCatalog = false;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function categoryFor(card) { return state.overrides[card.id] || card.category; }
function orderFor(card) { return cardOrderFor(card, state.orderOverrides); }
function subcategoryFor(card) {
  const category = categoryFor(card);
  if (['hero', 'hero-card'].includes(category)) {
    const saved = state.subcategoryOverrides[card.id];
    if (saved === '' || state.heroNames.includes(saved)) return saved;
    if (category === 'hero' && state.heroNames.includes(card.title)) return card.title;
    return state.heroNames.includes(card.subcategory) ? card.subcategory : '';
  }
  if (category === 'role') {
    const saved = state.subcategoryOverrides[card.id];
    if (saved === '' || state.roleSubcategories.includes(saved)) return saved;
    return card.subcategory || '';
  }
  return typeof state.subcategoryOverrides[card.id] === 'string' ? state.subcategoryOverrides[card.id] : (category === card.category ? (card.subcategory || '') : '');
}
function cardTextFor(card) { return Object.hasOwn(state.textOverrides, card.id) ? state.textOverrides[card.id] : (card.text || ''); }
function fillSubcategorySelect(select, card) {
  select.replaceChildren();
  const category = categoryFor(card);
  const names = ['hero', 'hero-card'].includes(category) ? state.heroNames : state.roleSubcategories;
  for (const name of ['', ...names]) {
    const option = document.createElement('option'); option.value = name; option.textContent = name || `Unassigned ${category}`;
    select.append(option);
  }
  select.value = subcategoryFor(card);
}
function canonicalId(id) { return state.cards.some(card => card.id === id) ? id : state.aliases[id] || id; }
function titleFor(card) {
  if (Object.hasOwn(state.titleOverrides, card.id)) return state.titleOverrides[card.id];
  if (typeof card.displayTitle === 'string') return card.displayTitle;
  if (card.category === 'hero') return card.title;
  let title = (card.ocrTitle || '').replace(/^[a-zA-Z]\s+/, '').replace(/^[^A-ZÀ-Ý]+/, '').trim();
  if (/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’ -]{2,36}$/.test(title) && !/\b(?:l|ii|iii)\b/i.test(title)) return title;
  return `Card ${card.id.slice(-4)}`;
}
function labelFor(category) { return CATEGORIES.find(item => item.id === category)?.label || category; }

function saveStoredValue(key, value, message) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { showToast(message); }
  if (key !== BUILD_KEY) cloudReview?.recordChanges();
}

function saveOverrides() {
  saveStoredValue(STORAGE_KEY, state.overrides, 'This browser could not save categories. Check browser storage permissions.');
}

function saveDeleted() {
  saveStoredValue(DELETED_KEY, [...state.deleted], 'This browser could not save deletions. Check browser storage permissions.');
}

function saveSubcategories() {
  saveStoredValue(SUBCATEGORY_KEY, state.subcategoryOverrides, 'This browser could not save subcategories. Check browser storage permissions.');
}

function saveOrders() {
  saveStoredValue(ORDER_KEY, state.orderOverrides, 'This browser could not save card order. Check browser storage permissions.');
}

function setOrder(card, input) {
  if (!canEditCatalog) return;
  const order = input.value.trim() === '' ? null : input.valueAsNumber;
  if (!input.validity.valid || !isCardOrder(order)) {
    showToast('Order must be a whole number of 0 or more, or blank.');
    input.value = orderFor(card) ?? '';
    return;
  }
  if (order === cardOrderFor(card)) delete state.orderOverrides[card.id];
  else state.orderOverrides[card.id] = order;
  saveOrders();
  renderGallery();
  if ($('#card-dialog').open && state.selected) renderDialog();
  showToast(`${titleFor(card)} → Order ${order ?? 'unassigned'}`);
}

function saveCardTexts() {
  saveStoredValue(CARD_TEXT_KEY, state.textOverrides, 'This browser could not save card text. Check browser storage permissions.');
}

function saveTitles() {
  saveStoredValue(TITLE_KEY, state.titleOverrides, 'This browser could not save titles. Check browser storage permissions.');
}

function setSubcategory(id, subcategory) {
  if (!canEditCatalog) return;
  const card = state.cards.find(item => item.id === id);
  const category = card && categoryFor(card);
  const names = ['hero', 'hero-card'].includes(category) ? state.heroNames : category === 'role' ? state.roleSubcategories : [];
  const predefined = ['hero', 'hero-card', 'role'].includes(category);
  if (!card || typeof subcategory !== 'string' || predefined && subcategory !== '' && !names.includes(subcategory)) throw new Error('Invalid subcategory');
  const original = category === 'hero' ? (state.heroNames.includes(card.title) ? card.title : '') : (category === 'hero-card' ? (state.heroNames.includes(card.subcategory) ? card.subcategory : '') : (category === 'role' ? (card.subcategory || '') : ''));
  if (subcategory === original) delete state.subcategoryOverrides[id];
  else state.subcategoryOverrides[id] = subcategory;
  saveSubcategories();
  const oldIndex = state.visible.findIndex(item => item.id === id);
  renderCategories(); renderGallery(Math.max(0, oldIndex));
  if ($('#card-dialog').open && state.selected) renderDialog();
  showToast(`${titleFor(card)} → ${subcategory || `Unassigned ${category}`}`);
}

function toggleDeleted(id) {
  if (!canEditCatalog) return;
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
  if (!canEditCatalog) throw new Error('An approved editor must sign in to edit cards.');
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
    button.addEventListener('click', () => { state.category = category.id; state.subcategory = ''; renderCategories(); renderGallery(); });
    container.append(button);
    if (state.category !== category.id || ['all', 'deleted'].includes(category.id)) continue;
    const children = document.createElement('div'); children.className = 'subcategory-list';
    const names = ['hero', 'hero-card'].includes(category.id) ? state.heroNames
      : category.id === 'role' ? state.roleSubcategories
      : [...new Set(state.cards.filter(card => !state.deleted.has(card.id) && categoryFor(card) === category.id).map(subcategoryFor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const choices = [...names, ''];
    for (const name of choices) {
      const value = name || '__unassigned__';
      const count = state.cards.filter(card => !state.deleted.has(card.id) && categoryFor(card) === category.id && subcategoryFor(card) === name).length;
      const child = document.createElement('button'); child.type = 'button';
      child.className = `subcategory-button${state.subcategory === value ? ' active' : ''}`;
      child.setAttribute('aria-pressed', String(state.subcategory === value));
      child.textContent = name || `Unassigned ${category.label}`;
      const tally = document.createElement('span'); tally.className = 'category-count'; tally.textContent = count;
      child.append(tally);
      child.addEventListener('click', () => { state.subcategory = value; renderCategories(); renderGallery(); });
      children.append(child);
    }
    container.append(children);
  }
}

function matchingCards() {
  const term = state.search.toLocaleLowerCase();
  const cards = state.cards.filter(card => {
    if (state.deleted.has(card.id) !== (state.category === 'deleted')) return false;
    if (state.category !== 'all' && state.category !== 'deleted' && categoryFor(card) !== state.category) return false;
    if (state.subcategory && subcategoryFor(card) !== (state.subcategory === '__unassigned__' ? '' : state.subcategory)) return false;
    if (term && !`${card.title} ${titleFor(card)} ${card.id} ${labelFor(categoryFor(card))} ${subcategoryFor(card)} ${cardTextFor(card)}`.toLocaleLowerCase().includes(term)) return false;
    return true;
  });
  if (state.sort === 'title-asc') cards.sort((a, b) => titleFor(a).localeCompare(titleFor(b)));
  if (state.sort === 'title-desc') cards.sort((a, b) => titleFor(b).localeCompare(titleFor(a)));
  if (state.sort === 'card-order') cards.sort((a, b) => compareCardOrder(orderFor(a), orderFor(b)));
  if (state.sort === 'category-subcategory') {
    const categoryOrder = new Map(CATEGORIES.map((category, index) => [category.id, index]));
    cards.sort((a, b) =>
      (categoryOrder.get(categoryFor(a)) - categoryOrder.get(categoryFor(b)))
      || subcategoryFor(a).localeCompare(subcategoryFor(b))
      || compareCardOrder(orderFor(a), orderFor(b))
      || titleFor(a).localeCompare(titleFor(b))
    );
  }
  return cards;
}

function reviewedCatalog() {
  return state.cards.map(card => ({ ...card, category: categoryFor(card), subcategory: subcategoryFor(card),
    title: titleFor(card), order: orderFor(card), deleted: state.deleted.has(card.id) }));
}

function renderBuilds() { buildList?.render(); }

function setCatalogAccess() {
  document.querySelectorAll('.tile-category, .tile-subcategory, .tile-restore, #dialog-categories button, #delete-card, #dialog-subcategory-select, #dialog-subcategory-input, #dialog-order-input')
    .forEach(element => { element.disabled = !canEditCatalog || (element.closest('#dialog-categories') && state.deleted.has(state.selected)); });
  for (const selector of ['#dialog-title-input', '#dialog-card-text']) $(selector).readOnly = !canEditCatalog;
}

function createCardTile(card) {
  const tile = document.createElement('article');
  tile.className = `card-tile${['hero-card', 'card-back'].includes(card.category) ? ' hero-tile' : ''}${state.selected === card.id ? ' current' : ''}${state.deleted.has(card.id) ? ' deleted' : ''}`;
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
  const category = document.createElement('span'); category.textContent = categoryFor(card) === 'hero' ? 'Hero' : [labelFor(categoryFor(card)), subcategoryFor(card)].filter(Boolean).join(' · ');
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
  } else {
    body.append(title, meta, select);
    if (['hero', 'hero-card', 'role'].includes(categoryFor(card))) {
      const subcategorySelect = document.createElement('select'); subcategorySelect.className = 'tile-subcategory';
      subcategorySelect.setAttribute('aria-label', `${labelFor(categoryFor(card))} subcategory for ${titleFor(card)}`);
      fillSubcategorySelect(subcategorySelect, card);
      subcategorySelect.addEventListener('change', () => { setCurrentCard(card.id); setSubcategory(card.id, subcategorySelect.value); });
      body.append(subcategorySelect);
    } else {
      const subcategoryInput = document.createElement('input'); subcategoryInput.type = 'text'; subcategoryInput.className = 'tile-subcategory';
      subcategoryInput.placeholder = 'Subcategory'; subcategoryInput.value = subcategoryFor(card);
      subcategoryInput.setAttribute('aria-label', `Subcategory for ${titleFor(card)}`);
      subcategoryInput.addEventListener('change', () => { setCurrentCard(card.id); setSubcategory(card.id, subcategoryInput.value.trim()); });
      body.append(subcategoryInput);
    }
    const orderLabel = document.createElement('label'); orderLabel.className = 'tile-order-label';
    orderLabel.append('Order');
    const orderInput = document.createElement('input'); orderInput.type = 'number'; orderInput.min = '0'; orderInput.step = '1'; orderInput.className = 'tile-subcategory tile-order';
    orderInput.placeholder = 'Unassigned'; orderInput.value = orderFor(card) ?? '';
    orderInput.setAttribute('aria-label', `Order for ${titleFor(card)}`);
    orderInput.addEventListener('change', () => { setCurrentCard(card.id); setOrder(card, orderInput); });
    orderLabel.append(orderInput); body.append(orderLabel);
  }
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
  setCatalogAccess();
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
  const scans = (card.sourceScans || []).filter(scan => scan.image !== card.image);
  $('#dialog-scan-wrap').hidden = scans.length === 0;
  const scanSelect = $('#dialog-scan');
  scanSelect.replaceChildren(new Option('Selected image · v2', card.image));
  for (const scan of scans) scanSelect.add(new Option(`JiME Card DB · scan ${scan.sourceImageNumber}`, scan.image));
  scanSelect.onchange = () => { $('#dialog-image').src = scanSelect.value; };
  $('#dialog-category').textContent = labelFor(categoryFor(card));
  const titleInput = $('#dialog-title-input');
  titleInput.value = titleFor(card);
  titleInput.oninput = () => {
    if (!canEditCatalog) return;
    const value = titleInput.value.trim();
    if (value) state.titleOverrides[card.id] = value;
    else delete state.titleOverrides[card.id];
    saveTitles();
    const tileTitle = document.querySelector(`.card-tile[data-card-id="${card.id}"] .tile-title`);
    if (tileTitle) { tileTitle.textContent = titleFor(card); tileTitle.title = titleFor(card); }
    $('#current-card-label').textContent = `Current: ${titleFor(card)} · ${card.id.replace('card-', '#').replace('character-', 'Hero ')}`;
  };
  titleInput.onchange = () => { renderGallery(); renderDialog(); };
  const cardText = $('#dialog-card-text');
  cardText.value = cardTextFor(card);
  cardText.oninput = () => {
    if (!canEditCatalog) return;
    state.textOverrides[card.id] = cardText.value;
    saveCardTexts();
  };
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
  const subcategoryWrap = $('#dialog-subcategory-wrap');
  subcategoryWrap.hidden = state.deleted.has(card.id);
  if (!subcategoryWrap.hidden) {
    const subcategorySelect = $('#dialog-subcategory-select');
    $('#dialog-subcategory-label').textContent = `${labelFor(categoryFor(card))} subcategory`;
    const subcategoryInput = $('#dialog-subcategory-input');
    const predefined = ['hero', 'hero-card', 'role'].includes(categoryFor(card));
    $('#dialog-subcategory-label').htmlFor = predefined ? 'dialog-subcategory-select' : 'dialog-subcategory-input';
    subcategorySelect.hidden = !predefined;
    subcategoryInput.hidden = predefined;
    if (predefined) {
      subcategorySelect.setAttribute('aria-label', `${labelFor(categoryFor(card))} subcategory`);
      fillSubcategorySelect(subcategorySelect, card);
      subcategorySelect.onchange = () => setSubcategory(card.id, subcategorySelect.value);
    } else {
      subcategoryInput.value = subcategoryFor(card);
      subcategoryInput.placeholder = `Enter ${labelFor(categoryFor(card)).toLocaleLowerCase()} subcategory`;
      subcategoryInput.setAttribute('aria-label', `${labelFor(categoryFor(card))} subcategory`);
      subcategoryInput.oninput = () => {
    if (!canEditCatalog) return;
        if (subcategoryInput.value) state.subcategoryOverrides[card.id] = subcategoryInput.value;
        else delete state.subcategoryOverrides[card.id];
        saveSubcategories();
      };
      subcategoryInput.onchange = () => setSubcategory(card.id, subcategoryInput.value.trim());
    }
  }
  const orderWrap = $('#dialog-order-wrap');
  orderWrap.hidden = state.deleted.has(card.id);
  const orderInput = $('#dialog-order-input');
  orderInput.value = orderFor(card) ?? '';
  orderInput.onchange = () => setOrder(card, orderInput);
  const source = $('#source-button');
  if (card.sourceUrl?.startsWith('https://sites.google.com/view/jime-carddb/')) {
    source.textContent = `JiME Card DB · ${card.sourceHeading || 'Source'}`;
    source.onclick = () => window.open(card.sourceUrl, '_blank', 'noopener,noreferrer');
  } else {
    source.textContent = 'Captured card image';
    source.onclick = null;
  }
  source.hidden = !card.sourceUrl?.startsWith('https://sites.google.com/view/jime-carddb/');
  source.previousElementSibling.hidden = source.hidden;
  const deleteButton = $('#delete-card');
  deleteButton.textContent = state.deleted.has(card.id) ? 'Restore card' : 'Delete card';
  deleteButton.onclick = () => toggleDeleted(card.id);
  $('#prev-card').disabled = index <= 0;
  $('#next-card').disabled = index < 0 || index >= state.visible.length - 1;
  setCatalogAccess();
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

function switchView(view) {
  state.view = view === 'gallery' ? 'gallery' : 'builds';
  $('#builds-view').hidden = state.view !== 'builds';
  $('#gallery-view').hidden = state.view !== 'gallery';
  $('#build-filters').hidden = state.view !== 'builds';
  $('#card-filters').hidden = state.view !== 'gallery';
  $('#cloud-controls').classList.toggle('catalog-only', state.view !== 'gallery');
  for (const button of document.querySelectorAll('.view-tab[data-view]')) {
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  history.replaceState(null, '', state.view === 'gallery' ? '#cards' : location.pathname);
  if (state.view === 'builds') renderBuilds();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function registerWebMCP() {
  if (!document.modelContext?.registerTool) return;
  try {
    Promise.resolve(document.modelContext.registerTool({
      name: 'categorize_cards',
      title: 'Categorize cards',
      description: 'Set categories for one or more cards in this local review. Approved editor changes save to the shared cloud catalog.',
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
    state.sourceData = data;
    state.cards = data.cards; state.sections = data.sections; state.aliases = data.aliases || {};
    state.duplicateIds = (data.deletedCards || []).filter(id => state.cards.some(card => card.id === id));
    state.roleSubcategories = data.roleSubcategories || [];
    state.heroNames = state.cards.filter(card => card.id.startsWith('character-')).map(card => card.title).sort((a, b) => a.localeCompare(b));
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.overrides = Object.fromEntries(Object.entries(saved).map(([id, category]) => [canonicalId(id), normalizeCategory(category)]).filter(([id, category]) => state.cards.some(card => card.id === id) && VALID.has(category)));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(TITLE_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.titleOverrides = Object.fromEntries(Object.entries(saved).filter(([id, title]) => state.cards.some(card => card.id === id) && typeof title === 'string' && title.trim()));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(SUBCATEGORY_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.subcategoryOverrides = Object.fromEntries(Object.entries(saved).filter(([id, name]) => {
          const card = state.cards.find(item => item.id === id);
          if (!card || typeof name !== 'string') return false;
          const category = categoryFor(card);
          return !['hero', 'hero-card', 'role'].includes(category) || name === '' || (category === 'role' ? state.roleSubcategories : state.heroNames).includes(name);
        }));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.orderOverrides = Object.fromEntries(Object.entries(saved).filter(([id, order]) => state.cards.some(card => card.id === id) && isCardOrder(order)));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(CARD_TEXT_KEY) || '{}');
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        state.textOverrides = Object.fromEntries(Object.entries(saved).filter(([id, text]) => state.cards.some(card => card.id === id) && typeof text === 'string'));
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    try {
      const savedText = localStorage.getItem(DELETED_KEY);
      const saved = JSON.parse(savedText || '[]');
      const validSaved = Array.isArray(saved) ? saved.filter(id => state.cards.some(card => card.id === id)) : [];
      const initialized = localStorage.getItem(DUPLICATE_REVIEW_KEY) === '1';
      state.deleted = new Set(initialized ? validSaved : [...(data.deletedCards || []), ...validSaved]);
      if (!initialized) {
        saveDeleted();
        localStorage.setItem(DUPLICATE_REVIEW_KEY, '1');
      }
    } catch { /* The gallery still works if storage is unavailable. */ }
    buildList = connectBuildList({ getCatalog: reviewedCatalog, notify: showToast });
    void connectAccount($('[data-account-auth]'), (user, editor) => {
      canEditCatalog = editor;
      buildList.setUser(user);
      setCatalogAccess();
    }, showToast);
    renderCategories(); renderGallery(); renderBuilds(); registerWebMCP();
    switchView(location.hash === '#cards' ? 'gallery' : 'builds');
    void connectCloudReview({
      getState: () => ({ ...state, validCategories: VALID }),
      applyReview: applySharedReview,
      controls: $('#cloud-controls'), notify: showToast, manageAuth: false,
    }).then(connection => { cloudReview = connection; cloudReview?.recordChanges(); });
  } catch (error) {
    $('#gallery-empty').hidden = false;
    $('#gallery-empty').textContent = 'The review data could not load. Reload this page to try again.';
    console.error(error);
  }
}

function applySharedReview(review) {
  state.overrides = review.categories;
  state.deleted = review.deleted;
  for (const { stateKey } of REVIEW_FIELDS) state[stateKey] = review[stateKey];
  const stored = [[STORAGE_KEY, state.overrides], [DELETED_KEY, [...state.deleted]],
    [SUBCATEGORY_KEY, state.subcategoryOverrides], [ORDER_KEY, state.orderOverrides],
    [CARD_TEXT_KEY, state.textOverrides], [TITLE_KEY, state.titleOverrides]];
  try {
    for (const [key, value] of stored) localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(DUPLICATE_REVIEW_KEY, '1');
  } catch { showToast('Cloud review loaded, but this browser could not keep a copy.'); }
  renderCategories(); renderGallery(); renderBuilds();
  if ($('#card-dialog').open && state.selected) renderDialog();
}

document.querySelectorAll('.view-tab[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#card-search').addEventListener('input', event => { state.search = event.target.value.trim(); renderGallery(); });
connectSegmentedControl($('#card-sort'), value => { state.sort = value; renderGallery(); });
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
  if (!canEditCatalog) return;
  if (event.key === 'Delete' && !event.repeat && state.selected) { event.preventDefault(); toggleDeleted(state.selected); return; }
  const category = SHORTCUTS[event.key.toLowerCase()];
  if (category && !event.repeat) { event.preventDefault(); categorizeCurrent(category); }
});
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importReview(data) {
  const review = parseReview(data, { ...state, validCategories: VALID });
  setCategories(review.categories);
  if (Object.hasOwn(review, 'deleted')) {
    state.deleted = review.deleted;
    saveDeleted();
  }
  const saveFields = {
    subcategoryOverrides: saveSubcategories,
    orderOverrides: saveOrders,
    textOverrides: saveCardTexts,
    titleOverrides: saveTitles,
  };
  for (const { stateKey } of REVIEW_FIELDS) {
    if (!Object.hasOwn(review, stateKey)) continue;
    state[stateKey] = review[stateKey];
    saveFields[stateKey]();
  }
  renderCategories(); renderGallery();
  if ($('#card-dialog').open && state.selected) renderDialog();
}

$('#export-button').addEventListener('click', () => {
  downloadJSON(createReview(state), 'journeys-card-review.json');
  showToast('Review exported');
});
$('#export-data-button').addEventListener('click', () => {
  if (!state.sourceData) { showToast('Card data has not loaded yet.'); return; }
  downloadJSON(createSiteData(state, { categoryFor, subcategoryFor, titleFor }), 'data.json');
  showToast('Site data exported');
});
$('#import-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    importReview(JSON.parse(await file.text()));
    showToast('Review imported');
  } catch { showToast('Could not import this review file'); }
  event.target.value = '';
});
start();
