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

export function normalizeBuildSelection(input, cards) {
  const selection = { heroCardId: '', role: '', weaponMode: '', weaponSubcategories: [],
    armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' };
  if (cardsFor(cards, 'hero-card').some(card => card.id === input?.heroCardId)) selection.heroCardId = input.heroCardId;
  if (subcategoriesFor(cards, 'role').includes(input?.role)) selection.role = input.role;
  const weapons = Array.isArray(input?.weaponSubcategories) ? input.weaponSubcategories : [];
  if (['one-handed', 'two-handed'].includes(input?.weaponMode)
    && subcategoriesFor(cards, input.weaponMode).includes(weapons[0])) {
    selection.weaponMode = input.weaponMode;
    selection.weaponSubcategories = [weapons[0]];
    if (input.weaponMode === 'one-handed') {
      selection.weaponSubcategories.push(subcategoriesFor(cards, 'one-handed').includes(weapons[1]) ? weapons[1] : '');
    }
  }
  for (const [category, , key] of EQUIPMENT) {
    if (subcategoriesFor(cards, category).includes(input?.[key])) selection[key] = input[key];
  }
  return selection;
}

export function heroCardsFor(cards, heroCardId) {
  const front = cardsFor(cards, 'hero-card').find(card => card.id === heroCardId);
  const name = front?.subcategory || front?.title;
  return { front, backs: name ? cardsFor(cards, 'card-back', name) : [],
    skills: name ? cardsFor(cards, 'hero', name) : [] };
}

export function renderBuildFlow(container, { cards, selection: input, prefix, onChange, onPreview, renderCard }) {
  const focusedId = container.contains(document.activeElement) ? document.activeElement.id : '';
  const selection = normalizeBuildSelection(input, cards);
  const fragment = document.createDocumentFragment();
  const section = (title, name) => {
    const element = document.createElement('section'); element.className = 'build-step';
    element.dataset.step = name;
    const heading = document.createElement('h2'); heading.textContent = title;
    element.append(heading); fragment.append(element); return element;
  };
  const picker = (parent, labelText, name, options, selected, change) => {
    const label = document.createElement('label'); label.className = 'build-picker'; label.textContent = labelText;
    const select = document.createElement('select'); select.id = `${prefix}-${name}`;
    select.add(new Option(`Choose ${labelText.toLocaleLowerCase()}`, ''));
    for (const option of options) {
      if (option.options) {
        const group = document.createElement('optgroup'); group.label = option.label;
        for (const [value, text] of option.options) group.append(new Option(text, value));
        select.append(group);
      } else select.add(new Option(option[1], option[0]));
    }
    select.value = selected;
    select.addEventListener('change', () => change(select.value));
    label.append(select); parent.append(label); return select;
  };
  const renderCards = (parent, matches, name, emptyText) => {
    const grid = document.createElement('div'); grid.className = 'build-flow-grid'; grid.id = `${prefix}-${name}`;
    for (const card of matches) {
      const tile = renderCard(card); tile.dataset.cardId = card.id; grid.append(tile);
    }
    parent.append(grid);
    if (!matches.length) {
      const empty = document.createElement('p'); empty.className = 'build-step-empty'; empty.textContent = emptyText;
      parent.append(empty);
    }
  };
  const update = changes => onChange({ ...selection, ...changes });

  const heroStep = section('Your hero', 'hero');
  picker(heroStep, 'Hero card', 'hero-card', cardsFor(cards, 'hero-card')
    .sort((a, b) => (a.subcategory || a.title).localeCompare(b.subcategory || b.title))
    .map(card => [card.id, card.title]), selection.heroCardId, value => update({ heroCardId: value }));
  const { front, backs, skills } = heroCardsFor(cards, selection.heroCardId);
  if (front) {
    const sheets = document.createElement('div'); sheets.className = 'hero-sides'; sheets.id = `${prefix}-hero-sides`;
    for (const [card, side] of [[front, 'Front'], ...backs.map(card => [card, 'Back'])]) {
      const figure = document.createElement('figure');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'hero-side-art';
      button.setAttribute('aria-label', `View ${front.subcategory || front.title} ${side.toLocaleLowerCase()}`);
      button.addEventListener('click', () => onPreview(card.id));
      const image = document.createElement('img'); image.src = card.image; image.alt = `${front.subcategory || front.title} · ${side}`;
      button.append(image);
      const caption = document.createElement('figcaption'); caption.textContent = side;
      figure.append(button, caption); sheets.append(figure);
    }
    heroStep.append(sheets);
    if (!backs.length) {
      const empty = document.createElement('p'); empty.className = 'build-step-empty'; empty.textContent = 'No back card is available for this hero.';
      heroStep.append(empty);
    }
  }
  renderCards(section('Hero cards', 'hero-cards'), skills, 'hero-cards', front ? 'No hero cards are categorized for this hero.' : 'Choose a hero to see their cards.');

  const roleStep = section('Role', 'role');
  picker(roleStep, 'Role', 'role', subcategoriesFor(cards, 'role').map(name => [name, name]), selection.role, role => update({ role }));
  renderCards(roleStep, selection.role ? cardsFor(cards, 'role', selection.role) : [], 'role-cards', 'Choose a role to see its cards.');

  const weaponStep = section('Weapons', 'weapons');
  const weaponOptions = ['one-handed', 'two-handed'].map(category => ({ label: category === 'one-handed' ? '1-handed' : '2-handed',
    options: subcategoriesFor(cards, category).map(name => [JSON.stringify([category, name]), name]) }));
  const firstValue = selection.weaponMode ? JSON.stringify([selection.weaponMode, selection.weaponSubcategories[0]]) : '';
  picker(weaponStep, 'Weapon', 'weapon', weaponOptions, firstValue, value => {
    const [weaponMode, subcategory] = value ? JSON.parse(value) : ['', ''];
    const second = weaponMode === 'one-handed' && selection.weaponMode === 'one-handed' ? selection.weaponSubcategories[1] : '';
    update({ weaponMode, weaponSubcategories: weaponMode === 'one-handed' ? [subcategory, second] : weaponMode ? [subcategory] : [] });
  });
  renderCards(weaponStep, selection.weaponMode ? cardsFor(cards, selection.weaponMode, selection.weaponSubcategories[0]) : [], 'weapon-cards', 'Choose a weapon subcategory to see all its cards.');
  if (selection.weaponMode === 'one-handed') {
    picker(weaponStep, 'Second 1-handed weapon', 'second-weapon', subcategoriesFor(cards, 'one-handed').map(name => [name, name]),
      selection.weaponSubcategories[1], value => update({ weaponSubcategories: [selection.weaponSubcategories[0], value] }));
    renderCards(weaponStep, selection.weaponSubcategories[1] ? cardsFor(cards, 'one-handed', selection.weaponSubcategories[1]) : [],
      'second-weapon-cards', 'Choose a second 1-handed weapon to see its cards.');
  }
  for (const [category, title, key] of EQUIPMENT) {
    const equipmentStep = section(title, category);
    picker(equipmentStep, `${category === 'trinket' ? 'Trinket' : title} subcategory`, category,
      subcategoriesFor(cards, category).map(name => [name, name]), selection[key], value => update({ [key]: value }));
    renderCards(equipmentStep, selection[key] ? cardsFor(cards, category, selection[key]) : [], `${category}-cards`, `Choose a ${category} subcategory to see all its cards.`);
  }
  container.replaceChildren(fragment);
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  return selection;
}
