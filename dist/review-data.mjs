const REVIEW_FORMATS = new Map([
  ['journeys-card-categories-v1', 1],
  ['journeys-card-categories-v2', 2],
  ...[3, 4, 5, 6, 7, 8, 9].map(version => [`journeys-card-review-v${version}`, version]),
]);

export const REVIEW_FIELDS = [
  { field: 'subcategories', stateKey: 'subcategoryOverrides', since: 4, error: 'Invalid subcategories' },
  { field: 'cardTexts', stateKey: 'textOverrides', since: 6, error: 'Invalid card text' },
  { field: 'titles', stateKey: 'titleOverrides', since: 7, error: 'Invalid titles' },
  { field: 'orders', stateKey: 'orderOverrides', since: 9, error: 'Invalid card order' },
];

export function isCardOrder(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

export function cardOrderFor(card, overrides = {}) {
  const value = Object.hasOwn(overrides, card.id) ? overrides[card.id] : card.order;
  return isCardOrder(value) ? value : null;
}

export function compareCardOrder(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeCategory(category) {
  return category === 'weapon' ? 'unsorted' : category;
}

// Return only fields present in this format so older files keep newer edits.
export function parseReview(data, { cards, aliases, duplicateIds, roleSubcategories, heroNames, validCategories }) {
  const version = REVIEW_FORMATS.get(data?.format);
  if (!version || !isRecord(data.categories)) throw new Error('Invalid review file');
  if (version >= 3 && !Array.isArray(data.deleted)) throw new Error('Invalid deleted cards');

  for (const { field, since, error } of REVIEW_FIELDS) {
    if (version < since) continue;
    const values = data[field];
    if (!isRecord(values) || Object.values(values).some(value => field === 'orders' ? !isCardOrder(value) : typeof value !== 'string')) {
      throw new Error(error);
    }
    if (field === 'subcategories' && version < 8 && Object.values(values).some(name =>
      name !== '' && !roleSubcategories.includes(name) && !heroNames.includes(name)
    )) throw new Error(error);
  }

  const cardIds = new Set(cards.map(card => card.id));
  const categories = Object.fromEntries(Object.entries(data.categories)
    .map(([id, category]) => [aliases[id] || id, normalizeCategory(category)])
    .filter(([id]) => cardIds.has(id)));
  for (const [id, category] of Object.entries(categories)) {
    if (!validCategories.has(category)) throw new Error(`Invalid card or category: ${id}`);
  }

  const review = { categories };
  if (version >= 3) {
    const deleted = data.deleted.filter(id => cardIds.has(id));
    review.deleted = new Set(version >= 5 ? deleted : [...duplicateIds, ...deleted]);
  }
  for (const { field, stateKey, since } of REVIEW_FIELDS) {
    if (version < since) continue;
    review[stateKey] = Object.fromEntries(Object.entries(data[field])
      .filter(([id, value]) => cardIds.has(id) && (field !== 'titles' || value.trim())));
  }
  return review;
}

export function createReview(state) {
  const review = { format: 'journeys-card-review-v9', categories: state.overrides };
  for (const { field, stateKey } of REVIEW_FIELDS) review[field] = state[stateKey];
  review.deleted = [...state.deleted];
  return review;
}

export function createSiteData(state, { categoryFor, subcategoryFor, titleFor }) {
  const cards = state.cards.map(card => {
    const updated = { ...card, category: categoryFor(card), order: cardOrderFor(card, state.orderOverrides) };
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
  return {
    ...state.sourceData,
    cards,
    roleSubcategories: state.roleSubcategories,
    aliases: state.aliases,
    deletedCards: [...state.deleted],
  };
}
