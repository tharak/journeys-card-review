import { cardOrderFor, compareCardOrder } from './review-data.mjs';

const EQUIPMENT = [
  ['armor', 'Armor', 'armorSubcategory'],
  ['trinket', 'Trinkets', 'trinketSubcategory'],
  ['mount', 'Mount', 'mountSubcategory'],
];

export function cardsFor(cards, category, subcategory) {
  return cards.filter(card => !card.deleted && card.category === category
    && (subcategory === undefined || card.subcategory === subcategory))
    .sort((a, b) => compareCardOrder(cardOrderFor(a), cardOrderFor(b)));
}

export function subcategoriesFor(cards, category) {
  return [...new Set(cardsFor(cards, category).map(card => card.subcategory).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function heroChoices(cards) {
  return cardsFor(cards, 'hero-card')
    .sort((a, b) => (a.subcategory || a.title || a.id).localeCompare(b.subcategory || b.title || b.id));
}

export function normalizeBuildSelection(input, cards) {
  const selection = { heroCardId: '', role: '', weaponMode: '', weaponSubcategories: [], pickedCardIds: [],
    armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' };
  const heroes = heroChoices(cards);
  selection.heroCardId = heroes.some(card => card.id === input?.heroCardId) ? input.heroCardId : heroes[0]?.id || '';
  const roles = subcategoriesFor(cards, 'role');
  selection.role = roles.includes(input?.role) ? input.role : roles[0] || '';
  const weapons = Array.isArray(input?.weaponSubcategories) ? input.weaponSubcategories : [];
  const weaponChoices = ['one-handed', 'two-handed'].flatMap(category =>
    subcategoriesFor(cards, category).map(name => [category, name]));
  let firstWeapon = weaponChoices[0];
  if (['one-handed', 'two-handed'].includes(input?.weaponMode)
    && subcategoriesFor(cards, input.weaponMode).includes(weapons[0])) {
    firstWeapon = [input.weaponMode, weapons[0]];
  }
  if (firstWeapon) {
    selection.weaponMode = firstWeapon[0];
    selection.weaponSubcategories = [firstWeapon[1]];
    if (selection.weaponMode === 'one-handed') {
      const oneHanded = subcategoriesFor(cards, 'one-handed');
      selection.weaponSubcategories.push(oneHanded.includes(weapons[1]) ? weapons[1] : oneHanded[0]);
    }
  }
  for (const [category, , key] of EQUIPMENT) {
    const choices = subcategoriesFor(cards, category);
    selection[key] = choices.includes(input?.[key]) ? input[key] : choices[0] || '';
  }
  const availableIds = new Set(visibleBuildCards(cards, selection).map(card => card.id));
  selection.pickedCardIds = [...new Set(Array.isArray(input?.pickedCardIds) ? input.pickedCardIds : [])]
    .filter(id => availableIds.has(id));
  return selection;
}

export function visibleBuildCards(cards, selection) {
  const matches = [...heroCardsFor(cards, selection.heroCardId).skills];
  if (selection.role) matches.push(...cardsFor(cards, 'role', selection.role));
  if (selection.weaponMode) {
    for (const name of selection.weaponSubcategories || []) {
      if (name) matches.push(...cardsFor(cards, selection.weaponMode, name));
    }
  }
  for (const [category, , key] of EQUIPMENT) {
    if (selection[key]) matches.push(...cardsFor(cards, category, selection[key]));
  }
  return [...new Map(matches.map(card => [card.id, card])).values()];
}

export function orderedBuildRow(cards, pickedCardIds) {
  const ranks = new Map(pickedCardIds.map((id, index) => [id, index]));
  return [...cards].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity)
    || compareCardOrder(cardOrderFor(a), cardOrderFor(b)));
}

export function heroCardsFor(cards, heroCardId) {
  const front = cardsFor(cards, 'hero-card').find(card => card.id === heroCardId);
  const name = front?.subcategory || front?.title;
  return { front, backs: name ? cardsFor(cards, 'card-back', name) : [],
    skills: name ? cardsFor(cards, 'hero', name) : [] };
}

export function renderBuildFlow(container, { cards, selection: input, prefix, onChange, onPreview }) {
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : '';
  const scrollPositions = new Map([...container.querySelectorAll('.build-flow-row')].map(row => [row.id, row.scrollLeft]));
  const selection = normalizeBuildSelection(input, cards);
  const fragment = document.createDocumentFragment();
  const section = (title, name) => {
    const element = document.createElement('section'); element.className = 'build-step';
    element.dataset.step = name;
    element.setAttribute('aria-label', title);
    fragment.append(element); return element;
  };
  const picker = (parent, labelText, name, options, selected, change) => {
    if (!options.some(option => !option.options || option.options.length)) return;
    const label = document.createElement('label'); label.className = 'build-picker';
    const select = document.createElement('select'); select.id = `${prefix}-${name}`;
    select.setAttribute('aria-label', labelText);
    for (const option of options) {
      if (option.options) {
        if (!option.options.length) continue;
        const group = document.createElement('optgroup'); group.label = option.label;
        for (const [value, text] of option.options) group.append(new Option(text, value));
        select.append(group);
      } else select.add(new Option(option[1], option[0]));
    }
    select.value = selected;
    select.addEventListener('change', () => change(select.value));
    label.append(select); parent.append(label); return select;
  };
  const renderCards = (parent, matches, name) => {
    const row = document.createElement('div'); row.className = 'build-flow-row'; row.id = `${prefix}-${name}`;
    for (const card of orderedBuildRow(matches, selection.pickedCardIds)) {
      const picked = selection.pickedCardIds.includes(card.id);
      const button = document.createElement('button'); button.type = 'button';
      button.className = `build-image-card${picked ? ' picked' : ''}`;
      button.id = `${prefix}-${name}-${card.id}`; button.dataset.cardId = card.id;
      button.setAttribute('aria-label', `Pick ${card.title || card.id}`);
      button.setAttribute('aria-pressed', String(picked));
      button.addEventListener('click', () => {
        if (!picked) row.scrollLeft = 0;
        update({ pickedCardIds: picked ? selection.pickedCardIds.filter(id => id !== card.id) : [...selection.pickedCardIds, card.id] });
      });
      const image = document.createElement('img'); image.src = card.image; image.alt = card.title || card.id; image.loading = 'lazy';
      button.append(image); row.append(button);
    }
    parent.append(row);
  };
  const update = changes => onChange({ ...selection, ...changes });

  const heroStep = section('Your hero', 'hero');
  picker(heroStep, 'Hero card', 'hero-card', heroChoices(cards)
    .map(card => [card.id, card.title]), selection.heroCardId, value => update({ heroCardId: value }));
  const { front, backs, skills } = heroCardsFor(cards, selection.heroCardId);
  if (front) {
    const sheets = document.createElement('div'); sheets.className = 'hero-sides build-flow-row'; sheets.id = `${prefix}-hero-sides`;
    for (const [card, side] of [[front, 'Front'], ...backs.map(card => [card, 'Back'])]) {
      const figure = document.createElement('figure');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hero-side-art';
      button.setAttribute('aria-label', `View ${front.subcategory || front.title} ${side.toLocaleLowerCase()}`);
      button.addEventListener('click', () => onPreview(card.id));
      const image = document.createElement('img'); image.src = card.image; image.alt = `${front.subcategory || front.title} · ${side}`;
      button.append(image);
      figure.append(button); sheets.append(figure);
    }
    heroStep.append(sheets);
  }
  renderCards(section('Hero cards', 'hero-cards'), skills, 'hero-cards');

  const roleStep = section('Role', 'role');
  picker(roleStep, 'Role', 'role', subcategoriesFor(cards, 'role').map(name => [name, name]), selection.role, role => update({ role }));
  renderCards(roleStep, selection.role ? cardsFor(cards, 'role', selection.role) : [], 'role-cards');

  const weaponStep = section('Weapons', 'weapons');
  const weaponOptions = ['one-handed', 'two-handed'].map(category => ({ label: category === 'one-handed' ? '1-handed' : '2-handed',
    options: subcategoriesFor(cards, category).map(name => [JSON.stringify([category, name]), name]) }));
  const firstValue = selection.weaponMode ? JSON.stringify([selection.weaponMode, selection.weaponSubcategories[0]]) : '';
  picker(weaponStep, 'Weapon', 'weapon', weaponOptions, firstValue, value => {
    const [weaponMode, subcategory] = value ? JSON.parse(value) : ['', ''];
    const second = weaponMode === 'one-handed' && selection.weaponMode === 'one-handed' ? selection.weaponSubcategories[1] : '';
    update({ weaponMode, weaponSubcategories: weaponMode === 'one-handed' ? [subcategory, second] : weaponMode ? [subcategory] : [] });
  });
  renderCards(weaponStep, selection.weaponMode ? cardsFor(cards, selection.weaponMode, selection.weaponSubcategories[0]) : [], 'weapon-cards');
  if (selection.weaponMode === 'one-handed') {
    picker(weaponStep, 'Second 1-handed weapon', 'second-weapon', subcategoriesFor(cards, 'one-handed').map(name => [name, name]),
      selection.weaponSubcategories[1], value => update({ weaponSubcategories: [selection.weaponSubcategories[0], value] }));
    renderCards(weaponStep, selection.weaponSubcategories[1] ? cardsFor(cards, 'one-handed', selection.weaponSubcategories[1]) : [],
      'second-weapon-cards');
  }
  for (const [category, title, key] of EQUIPMENT) {
    const equipmentStep = section(title, category);
    picker(equipmentStep, `${category === 'trinket' ? 'Trinket' : title} subcategory`, category,
      subcategoriesFor(cards, category).map(name => [name, name]), selection[key], value => update({ [key]: value }));
    renderCards(equipmentStep, selection[key] ? cardsFor(cards, category, selection[key]) : [], `${category}-cards`);
  }
  container.replaceChildren(fragment);
  for (const row of container.querySelectorAll('.build-flow-row')) row.scrollLeft = scrollPositions.get(row.id) || 0;
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  return selection;
}
