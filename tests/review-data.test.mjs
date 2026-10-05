import assert from 'node:assert/strict';
import test from 'node:test';
import { createReview, createSiteData, parseReview, cardOrderFor, compareCardOrder } from '../dist/review-data.mjs';

const context = {
  cards: [{ id: 'card-1', category: 'role' }, { id: 'card-2', category: 'armor' }],
  aliases: { 'old-card': 'card-1' },
  duplicateIds: ['card-2'],
  roleSubcategories: ['Captain'],
  heroNames: ['Aragorn'],
  validCategories: new Set(['role', 'armor', 'unsorted']),
};

function fixture(version) {
  return {
    format: version <= 2 ? `journeys-card-categories-v${version}` : `journeys-card-review-v${version}`,
    categories: { 'old-card': 'weapon', missing: 'armor' },
    deleted: ['card-1', 'missing'],
    subcategories: { 'card-1': 'Captain', missing: 'Aragorn' },
    cardTexts: { 'card-1': '', missing: 'Unused text' },
    titles: { 'card-1': 'Edited title', 'card-2': '   ', missing: 'Unused title' },
    orders: { 'card-1': 0, 'card-2': null, missing: 12 },
  };
}

for (let version = 1; version <= 9; version++) {
  test(`imports version ${version} with its original field and deletion rules`, () => {
    const review = parseReview(fixture(version), context);
    assert.deepEqual(review.categories, { 'card-1': 'unsorted' });
    assert.equal(Object.hasOwn(review, 'deleted'), version >= 3);
    if (version >= 3) assert.deepEqual([...review.deleted], version >= 5 ? ['card-1'] : ['card-2', 'card-1']);
    assert.equal(Object.hasOwn(review, 'subcategoryOverrides'), version >= 4);
    if (version >= 4) assert.deepEqual(review.subcategoryOverrides, { 'card-1': 'Captain' });
    assert.equal(Object.hasOwn(review, 'textOverrides'), version >= 6);
    if (version >= 6) assert.deepEqual(review.textOverrides, { 'card-1': '' });
    assert.equal(Object.hasOwn(review, 'titleOverrides'), version >= 7);
    if (version >= 7) assert.deepEqual(review.titleOverrides, { 'card-1': 'Edited title' });
    assert.equal(Object.hasOwn(review, 'orderOverrides'), version >= 9);
    if (version >= 9) assert.deepEqual(review.orderOverrides, { 'card-1': 0, 'card-2': null });
  });
}

test('older formats do not require fields introduced later', () => {
  assert.deepEqual(parseReview({ format: 'journeys-card-categories-v1', categories: {} }, context), { categories: {} });
  const data = fixture(3);
  delete data.subcategories;
  delete data.cardTexts;
  delete data.titles;
  assert.deepEqual([...parseReview(data, context).deleted], ['card-2', 'card-1']);
});

test('version 8 accepts equipment subcategories while earlier versions restrict names', () => {
  const data = fixture(8);
  data.subcategories = { 'card-2': 'Leather armor', 'card-1': '' };
  assert.deepEqual(parseReview(data, context).subcategoryOverrides, data.subcategories);
  data.format = 'journeys-card-review-v7';
  assert.throws(() => parseReview(data, context), /Invalid subcategories/);
});

test('rejects malformed required fields and unsupported formats', () => {
  for (const data of [null, [], {}, { ...fixture(8), format: 'journeys-card-review-v10' }]) {
    assert.throws(() => parseReview(data, context), /Invalid review file/);
  }
  for (const field of ['categories', 'subcategories', 'cardTexts', 'titles']) {
    for (const value of [null, [], 'invalid']) {
      assert.throws(() => parseReview({ ...fixture(8), [field]: value }, context));
    }
  }
  assert.throws(() => parseReview({ ...fixture(8), deleted: {} }, context), /Invalid deleted cards/);
  for (const field of ['subcategories', 'cardTexts', 'titles']) {
    assert.throws(() => parseReview({ ...fixture(8), [field]: { 'card-1': 42 } }, context));
  }
});

test('rejects invalid categories on known cards and ignores unknown cards', () => {
  assert.throws(() => parseReview({ ...fixture(8), categories: { 'card-1': 'invalid' } }, context), /Invalid card or category/);
  assert.deepEqual(parseReview({ ...fixture(8), categories: { missing: 'invalid' } }, context).categories, {});
});

test('existing reviewed card IDs keep their categories even when an old alias points elsewhere', () => {
  const review = parseReview({ ...fixture(8), categories: { 'card-2': 'armor' } }, {
    ...context, aliases: { ...context.aliases, 'card-2': 'card-1' },
  });
  assert.deepEqual(review.categories, { 'card-2': 'armor' });
});

test('parsing does not change the source file or current review', () => {
  const data = fixture(8);
  const before = structuredClone({ data, context });
  parseReview(data, context);
  assert.deepEqual({ data, context }, before);
});

test('exported reviews round-trip explicit empty edits and restored duplicates', () => {
  const state = {
    overrides: { 'card-1': 'armor' },
    subcategoryOverrides: { 'card-1': 'Custom armor' },
    textOverrides: { 'card-1': '' },
    titleOverrides: { 'card-1': 'Custom title' },
    orderOverrides: { 'card-1': 0, 'card-2': null },
    deleted: new Set(),
  };
  const exported = JSON.parse(JSON.stringify(createReview(state)));
  assert.equal(exported.format, 'journeys-card-review-v9');
  assert.deepEqual(parseReview(exported, context), {
    categories: state.overrides,
    subcategoryOverrides: state.subcategoryOverrides,
    textOverrides: state.textOverrides,
    titleOverrides: state.titleOverrides,
    orderOverrides: state.orderOverrides,
    deleted: new Set(),
  });
});

test('site data export applies edits to copies and preserves source metadata', () => {
  const state = {
    ...context,
    sourceData: { sections: [{ number: 1 }], customMetadata: 'preserved' },
    cards: [
      { id: 'card-1', category: 'role', subcategory: 'Captain', text: 'Original', displayTitle: 'Old' },
      { id: 'card-2', category: 'armor', text: null },
    ],
    textOverrides: { 'card-1': '' },
    deleted: new Set(['card-2']),
  };
  const before = structuredClone(state);
  const data = createSiteData(state, {
    categoryFor: () => 'armor',
    subcategoryFor: card => card.id === 'card-2' ? 'Leather armor' : '',
    titleFor: card => card.id === 'card-1' ? 'Edited' : '',
  });
  assert.deepEqual(data.cards, [
    { id: 'card-1', category: 'armor', order: null, text: '', displayTitle: 'Edited' },
    { id: 'card-2', category: 'armor', order: null, subcategory: 'Leather armor' },
  ]);
  assert.deepEqual(data.deletedCards, ['card-2']);
  assert.equal(data.customMetadata, 'preserved');
  assert.deepEqual(data.sections, state.sourceData.sections);
  assert.deepEqual(data.aliases, state.aliases);
  assert.deepEqual(data.roleSubcategories, state.roleSubcategories);
  assert.deepEqual(state, before);
});

test('version 9 rejects invalid order values and missing orders', () => {
  for (const orders of [undefined, null, [], { 'card-1': '' }, { 'card-1': '2' }, { 'card-1': -1 }, { 'card-1': 1.5 }, { 'card-1': Infinity }, { 'card-1': Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => parseReview({ ...fixture(9), orders }, context), /Invalid card order/);
  }
});

test('order overrides preserve zero and explicitly clear a published order', () => {
  const card = { id: 'card-1', order: 5 };
  assert.equal(cardOrderFor(card), 5);
  assert.equal(cardOrderFor(card, { 'card-1': 0 }), 0);
  assert.equal(cardOrderFor(card, { 'card-1': null }), null);
  assert.equal(cardOrderFor({ id: 'card-2' }), null);
  assert.equal(cardOrderFor({ id: 'card-2', order: '2' }), null);
});

test('order sorting is numeric, puts unassigned cards last, and preserves ties', () => {
  const cards = [
    { id: 'unassigned-1', order: null }, { id: 'ten', order: 10 },
    { id: 'two-1', order: 2 }, { id: 'zero', order: 0 },
    { id: 'two-2', order: 2 }, { id: 'unassigned-2', order: null },
  ];
  cards.sort((a, b) => compareCardOrder(a.order, b.order));
  assert.deepEqual(cards.map(card => card.id), ['zero', 'two-1', 'two-2', 'ten', 'unassigned-1', 'unassigned-2']);
});

test('site data export retains published order and applies cleared and numeric edits', () => {
  const state = { ...context, cards: [
    { id: 'card-1', category: 'role', order: 7 },
    { id: 'card-2', category: 'armor', order: 3 },
    { id: 'card-3', category: 'armor', order: 4 },
  ], orderOverrides: { 'card-1': null, 'card-2': 0 }, textOverrides: {}, deleted: new Set() };
  const data = createSiteData(state, { categoryFor: card => card.category, subcategoryFor: () => '', titleFor: () => '' });
  assert.deepEqual(data.cards.map(card => card.order), [null, 0, 4]);
  assert.deepEqual(state.cards.map(card => card.order), [7, 3, 4]);
});
