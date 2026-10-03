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
  { id: 'unsorted', label: 'Needs review', icon: '◇' },
  { id: 'deleted', label: 'Deleted', icon: '↶' },
];
const VALID = new Set(CATEGORIES.slice(1, -1).map(item => item.id));
const SHORTCUTS = { q: 'role', w: 'one-handed', e: 'two-handed', r: 'armor', t: 'trinket', y: 'mount', u: 'hero' };
const STORAGE_KEY = 'journeys-card-review-categories-v1';
const DELETED_KEY = 'journeys-card-review-deleted-v1';
const SUBCATEGORY_KEY = 'journeys-card-review-subcategories-v1';
const CARD_TEXT_KEY = 'journeys-card-review-card-text-v1';
const TITLE_KEY = 'journeys-card-review-titles-v1';
const BUILD_KEY = 'journeys-card-review-build-v1';
const DUPLICATE_REVIEW_KEY = 'journeys-card-review-duplicate-review-v1';
const $ = selector => document.querySelector(selector);
const state = { cards: [], sections: [], aliases: {}, sourceData: null, overrides: {}, subcategoryOverrides: {}, textOverrides: {}, titleOverrides: {}, roleSubcategories: [], heroNames: [], duplicateIds: [], deleted: new Set(), category: 'all', subcategory: '', search: '', sort: 'original', view: 'builds', visible: [], selected: null, build: { heroCardId: '', role: '', weaponMode: 'one-handed', weaponSubcategories: ['', ''], armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' } };
let toastTimer;

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function categoryFor(card) { return state.overrides[card.id] || card.category; }
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
function canonicalId(id) { return state.aliases[id] || id; }
function normalizeCategory(category) { return category === 'weapon' ? 'unsorted' : category; }
function titleFor(card) {
  if (Object.hasOwn(state.titleOverrides, card.id)) return state.titleOverrides[card.id];
  if (typeof card.displayTitle === 'string') return card.displayTitle;
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

function saveSubcategories() {
  try { localStorage.setItem(SUBCATEGORY_KEY, JSON.stringify(state.subcategoryOverrides)); }
  catch { showToast('This browser could not save subcategories. Export a copy.'); }
}

function saveCardTexts() {
  try { localStorage.setItem(CARD_TEXT_KEY, JSON.stringify(state.textOverrides)); }
  catch { showToast('This browser could not save card text. Export a copy.'); }
}

function saveTitles() {
  try { localStorage.setItem(TITLE_KEY, JSON.stringify(state.titleOverrides)); }
  catch { showToast('This browser could not save titles. Export a copy.'); }
}

function setSubcategory(id, subcategory) {
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
  if (state.sort === 'category-subcategory') {
    const categoryOrder = new Map(CATEGORIES.map((category, index) => [category.id, index]));
    cards.sort((a, b) =>
      (categoryOrder.get(categoryFor(a)) - categoryOrder.get(categoryFor(b)))
      || subcategoryFor(a).localeCompare(subcategoryFor(b))
      || titleFor(a).localeCompare(titleFor(b))
    );
  }
  return cards;
}

function availableCards(category) {
  return state.cards.filter(card => !state.deleted.has(card.id) && categoryFor(card) === category);
}

function saveBuild() {
  try { localStorage.setItem(BUILD_KEY, JSON.stringify(state.build)); } catch { showToast('This browser could not save the build.'); }
}

function fillBuildSubcategorySelect(select, category, selected) {
  const names = [...new Set(availableCards(category).map(subcategoryFor).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.replaceChildren();
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = `Choose a ${labelFor(category).toLocaleLowerCase()} subcategory`; select.append(empty);
  for (const name of names) {
    const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option);
  }
  select.value = names.includes(selected) ? selected : '';
  return select.value;
}

function appendBuildCard(container, card, eyebrow = '') {
  const article = document.createElement('article'); article.className = 'build-card';
  const image = document.createElement('img'); image.src = card.image; image.alt = `${titleFor(card)} card`; image.loading = 'lazy';
  const title = document.createElement('strong'); title.textContent = titleFor(card);
  article.append(image);
  if (eyebrow) { const label = document.createElement('span'); label.className = 'build-card-eyebrow'; label.textContent = eyebrow; article.append(label); }
  article.append(title); container.append(article);
}

function renderBuilds() {
  const heroChoices = availableCards('hero-card').filter(card => state.heroNames.includes(subcategoryFor(card)));
  const heroSelect = $('#build-hero-card');
  heroSelect.replaceChildren();
  const noHeroCard = document.createElement('option'); noHeroCard.value = ''; noHeroCard.textContent = 'Choose a hero card'; heroSelect.append(noHeroCard);
  const availableHeroNames = [...new Set(heroChoices.map(subcategoryFor))].sort((a, b) => a.localeCompare(b));
  for (const name of availableHeroNames) {
    const group = document.createElement('optgroup'); group.label = name;
    for (const card of heroChoices.filter(item => subcategoryFor(item) === name)) {
      const option = document.createElement('option'); option.value = card.id; option.textContent = titleFor(card); group.append(option);
    }
    heroSelect.append(group);
  }
  heroSelect.value = heroChoices.some(card => card.id === state.build.heroCardId) ? state.build.heroCardId : '';
  state.build.heroCardId = heroSelect.value;
  const selectedHeroCard = state.cards.find(card => card.id === state.build.heroCardId);
  const heroName = selectedHeroCard ? subcategoryFor(selectedHeroCard) : '';
  const heroCards = heroName ? heroChoices.filter(card => subcategoryFor(card) === heroName) : [];

  const roleCards = availableCards('role');
  const roleOptions = state.roleSubcategories.filter(name => roleCards.some(card => subcategoryFor(card) === name));
  const roleSelect = $('#build-role');
  roleSelect.replaceChildren();
  const noRole = document.createElement('option'); noRole.value = ''; noRole.textContent = 'Choose a role subcategory'; roleSelect.append(noRole);
  for (const name of roleOptions) {
    const option = document.createElement('option'); option.value = name;
    option.textContent = `${name} (${roleCards.filter(card => subcategoryFor(card) === name).length})`;
    roleSelect.append(option);
  }
  roleSelect.value = roleOptions.includes(state.build.role) ? state.build.role : '';
  state.build.role = roleSelect.value;
  const chosenRoleCards = state.build.role ? roleCards.filter(card => subcategoryFor(card) === state.build.role) : [];

  const weaponMode = $('#build-weapon-mode'); weaponMode.value = state.build.weaponMode;
  const weaponCategory = state.build.weaponMode;
  const weaponSlots = state.build.weaponMode === 'one-handed' ? 2 : 1;
  state.build.weaponSubcategories = state.build.weaponSubcategories.slice(0, weaponSlots);
  while (state.build.weaponSubcategories.length < weaponSlots) state.build.weaponSubcategories.push('');
  const weaponContainer = $('#build-weapons'); weaponContainer.replaceChildren();
  for (let index = 0; index < weaponSlots; index++) {
    const label = document.createElement('label');
    label.textContent = state.build.weaponMode === 'one-handed' ? `${index + 1}${index ? 'nd' : 'st'} 1-handed subcategory` : '2-handed weapon subcategory';
    const select = document.createElement('select');
    state.build.weaponSubcategories[index] = fillBuildSubcategorySelect(select, weaponCategory, state.build.weaponSubcategories[index]);
    select.addEventListener('change', () => { state.build.weaponSubcategories[index] = select.value; saveBuild(); renderBuilds(); });
    label.append(select); weaponContainer.append(label);
  }

  const equipment = [
    ['build-armor', 'armor', 'armorSubcategory'],
    ['build-trinket', 'trinket', 'trinketSubcategory'],
    ['build-mount', 'mount', 'mountSubcategory'],
  ];
  for (const [id, category, key] of equipment) {
    const select = $(`#${id}`);
    state.build[key] = fillBuildSubcategorySelect(select, category, state.build[key]);
  }

  const empty = $('#build-empty');
  empty.hidden = heroChoices.length > 0;
  empty.textContent = heroChoices.length
    ? ''
    : 'No Hero-card cards have a hero name yet. In Cards, set their category to Hero-card and choose a Hero subcategory.';

  const heroOutput = $('#build-hero-cards'); heroOutput.replaceChildren();
  $('#build-hero-count').textContent = heroName ? `(${heroCards.length})` : '';
  for (const card of heroCards) appendBuildCard(heroOutput, card, heroName);
  const roleOutput = $('#build-role-cards'); roleOutput.replaceChildren();
  $('#build-role-count').textContent = state.build.role ? `(${chosenRoleCards.length})` : '';
  for (const card of chosenRoleCards) appendBuildCard(roleOutput, card, state.build.role);
  const equipmentOutput = $('#build-equipment'); equipmentOutput.replaceChildren();
  const chosenEquipment = [
    ...state.build.weaponSubcategories.map(name => [weaponCategory, name]),
    ['armor', state.build.armorSubcategory],
    ['trinket', state.build.trinketSubcategory],
    ['mount', state.build.mountSubcategory],
  ];
  const shownEquipment = new Set();
  for (const [category, subcategory] of chosenEquipment) {
    if (!subcategory) continue;
    for (const card of availableCards(category).filter(item => subcategoryFor(item) === subcategory)) {
      if (!shownEquipment.has(card.id)) appendBuildCard(equipmentOutput, card, `${labelFor(category)} · ${subcategory}`);
      shownEquipment.add(card.id);
    }
  }
  saveBuild();
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
  const titleInput = $('#dialog-title-input');
  titleInput.value = titleFor(card);
  titleInput.oninput = () => {
    const value = titleInput.value.trim();
    if (value) state.titleOverrides[card.id] = value;
    else delete state.titleOverrides[card.id];
    saveTitles();
    const tileTitle = document.querySelector(`.card-tile[data-card-id="${card.id}"] .tile-title`);
    if (tileTitle) { tileTitle.textContent = titleFor(card); tileTitle.title = titleFor(card); }
    $('#current-card-label').textContent = `Current: ${titleFor(card)} · ${card.id.replace('card-', '#').replace('character-', 'Hero ')}`;
  };
  titleInput.onchange = () => { renderGallery(); renderDialog(); };
  $('#dialog-ocr-note').textContent = card.category === 'hero' ? 'Character sheet from the document.' : card.ocrTitle ? `OCR title: ${card.ocrTitle}. Check it against the image.` : 'The title could not be read automatically. Check the image.';
  const cardText = $('#dialog-card-text');
  cardText.value = cardTextFor(card);
  cardText.oninput = () => {
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
        if (subcategoryInput.value) state.subcategoryOverrides[card.id] = subcategoryInput.value;
        else delete state.subcategoryOverrides[card.id];
        saveSubcategories();
      };
      subcategoryInput.onchange = () => setSubcategory(card.id, subcategoryInput.value.trim());
    }
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
  $('#builds-view').hidden = view !== 'builds';
  $('#gallery-view').hidden = view !== 'gallery';
  $('#document-view').hidden = view !== 'document';
  for (const button of document.querySelectorAll('.view-tab')) {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  if (view === 'builds') renderBuilds();
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
    state.sourceData = data;
    state.cards = data.cards; state.sections = data.sections; state.aliases = data.aliases || {};
    state.duplicateIds = (data.deletedCards || []).filter(id => state.cards.some(card => card.id === id));
    state.roleSubcategories = data.roleSubcategories || [];
    state.heroNames = state.cards.filter(card => card.id.startsWith('character-')).map(card => card.title).sort((a, b) => a.localeCompare(b));
    let savedBuild = null;
    try {
      savedBuild = JSON.parse(localStorage.getItem(BUILD_KEY) || 'null');
      if (savedBuild && typeof savedBuild === 'object') {
        state.build = { ...state.build, ...savedBuild };
        if (!Array.isArray(state.build.weaponSubcategories)) state.build.weaponSubcategories = ['', ''];
      }
    } catch { /* Start with an empty build if saved data is invalid. */ }
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
    if (savedBuild && typeof savedBuild === 'object' && !Array.isArray(savedBuild)) {
      const oldSubcategoryFor = (id, category) => {
        const card = state.cards.find(item => item.id === id);
        return card && categoryFor(card) === category ? subcategoryFor(card) : '';
      };
      if (!Array.isArray(savedBuild.weaponSubcategories)) {
        state.build.weaponSubcategories = (Array.isArray(savedBuild.weapons) ? savedBuild.weapons : []).map(id => oldSubcategoryFor(id, savedBuild.weaponMode || 'one-handed'));
      }
      if (typeof savedBuild.armorSubcategory !== 'string') state.build.armorSubcategory = oldSubcategoryFor(savedBuild.armor, 'armor');
      if (typeof savedBuild.trinketSubcategory !== 'string') state.build.trinketSubcategory = oldSubcategoryFor(savedBuild.trinket, 'trinket');
      if (typeof savedBuild.mountSubcategory !== 'string') state.build.mountSubcategory = oldSubcategoryFor(savedBuild.mount, 'mount');
      for (const key of ['weapons', 'armor', 'trinket', 'mount']) delete state.build[key];
    }
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
    renderCategories(); renderGallery(); renderBuilds(); registerWebMCP();
  } catch (error) {
    $('#gallery-empty').hidden = false;
    $('#gallery-empty').textContent = 'The review data could not load. Reload this page to try again.';
    console.error(error);
  }
}

document.querySelectorAll('.view-tab').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('#build-hero-card').addEventListener('change', event => { state.build.heroCardId = event.target.value; saveBuild(); renderBuilds(); });
$('#build-role').addEventListener('change', event => { state.build.role = event.target.value; saveBuild(); renderBuilds(); });
$('#build-weapon-mode').addEventListener('change', event => {
  state.build.weaponMode = event.target.value;
  state.build.weaponSubcategories = event.target.value === 'one-handed' ? ['', ''] : [''];
  saveBuild(); renderBuilds();
});
for (const [id, key] of [['build-armor', 'armorSubcategory'], ['build-trinket', 'trinketSubcategory'], ['build-mount', 'mountSubcategory']]) {
  $(`#${id}`).addEventListener('change', event => { state.build[key] = event.target.value; saveBuild(); renderBuilds(); });
}
$('#card-search').addEventListener('input', event => { state.search = event.target.value.trim(); renderGallery(); });
$('#card-sort').addEventListener('change', event => { state.sort = event.target.value; renderGallery(); });
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
  const blob = new Blob([JSON.stringify({ format: 'journeys-card-review-v8', categories: state.overrides, subcategories: state.subcategoryOverrides, cardTexts: state.textOverrides, titles: state.titleOverrides, deleted: [...state.deleted] }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'journeys-card-review.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Review exported');
});
$('#export-data-button').addEventListener('click', () => {
  if (!state.sourceData) { showToast('Card data has not loaded yet.'); return; }
  const exported = { ...state.sourceData };
  exported.cards = state.cards.map(card => {
    const updated = { ...card, category: categoryFor(card) };
    const subcategory = subcategoryFor(card);
    if (subcategory) updated.subcategory = subcategory;
    else delete updated.subcategory;
    const title = titleFor(card);
    if (title) updated.displayTitle = title;
    else delete updated.displayTitle;
    if (Object.hasOwn(state.textOverrides, card.id)) updated.text = state.textOverrides[card.id];
    else if (typeof updated.text !== 'string') delete updated.text;
    return updated;
  });
  exported.roleSubcategories = state.roleSubcategories;
  exported.aliases = state.aliases;
  exported.deletedCards = [...state.deleted];
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'data.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Site data exported');
});
$('#import-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!['journeys-card-categories-v1', 'journeys-card-categories-v2', 'journeys-card-review-v3', 'journeys-card-review-v4', 'journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) || !data.categories || typeof data.categories !== 'object' || Array.isArray(data.categories)) throw new Error('Invalid review file');
    if (['journeys-card-review-v3', 'journeys-card-review-v4', 'journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) && !Array.isArray(data.deleted)) throw new Error('Invalid deleted cards');
    if (['journeys-card-review-v4', 'journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) && (!data.subcategories || typeof data.subcategories !== 'object' || Array.isArray(data.subcategories) || Object.values(data.subcategories).some(name => typeof name !== 'string' || !['journeys-card-review-v8'].includes(data.format) && name !== '' && !state.roleSubcategories.includes(name) && !state.heroNames.includes(name)))) throw new Error('Invalid subcategories');
    if (['journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) && (!data.cardTexts || typeof data.cardTexts !== 'object' || Array.isArray(data.cardTexts) || Object.values(data.cardTexts).some(text => typeof text !== 'string'))) throw new Error('Invalid card text');
    if (['journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) && (!data.titles || typeof data.titles !== 'object' || Array.isArray(data.titles) || Object.values(data.titles).some(title => typeof title !== 'string'))) throw new Error('Invalid titles');
    const changes = Object.fromEntries(Object.entries(data.categories).map(([id, category]) => [canonicalId(id), normalizeCategory(category)]).filter(([id]) => state.cards.some(card => card.id === id)));
    setCategories(changes);
    if (['journeys-card-review-v3', 'journeys-card-review-v4', 'journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format)) {
      const importedDeleted = data.deleted.filter(id => state.cards.some(card => card.id === id));
      state.deleted = new Set(['journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format) ? importedDeleted : [...state.duplicateIds, ...importedDeleted]);
      saveDeleted();
    }
    if (['journeys-card-review-v4', 'journeys-card-review-v5', 'journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format)) {
      state.subcategoryOverrides = Object.fromEntries(Object.entries(data.subcategories).filter(([id]) => state.cards.some(card => card.id === id)));
      saveSubcategories();
    }
    if (['journeys-card-review-v6', 'journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format)) {
      state.textOverrides = Object.fromEntries(Object.entries(data.cardTexts).filter(([id]) => state.cards.some(card => card.id === id)));
      saveCardTexts();
    }
    if (['journeys-card-review-v7', 'journeys-card-review-v8'].includes(data.format)) {
      state.titleOverrides = Object.fromEntries(Object.entries(data.titles).filter(([id, title]) => state.cards.some(card => card.id === id) && title.trim()));
      saveTitles();
    }
    renderCategories(); renderGallery();
    if ($('#card-dialog').open && state.selected) renderDialog();
    showToast('Review imported');
  } catch { showToast('Could not import this review file'); }
  event.target.value = '';
});
start();
