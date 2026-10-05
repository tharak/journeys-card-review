import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsFor, heroCardsFor, normalizeBuildSelection, subcategoriesFor, orderedBuildRow } from '../dist/build-flow.mjs';

const cards = [
  { id: 'hero-front', category: 'hero-card', subcategory: 'Aragorn' },
  { id: 'bilbo-front', category: 'hero-card', subcategory: 'Bilbo' },
  { id: 'hero-back', category: 'card-back', subcategory: 'Aragorn' },
  { id: 'hero-skill', category: 'hero', subcategory: 'Aragorn' },
  { id: 'other-skill', category: 'hero', subcategory: 'Bilbo' },
  { id: 'role', category: 'role', subcategory: 'Captain' },
  { id: 'sword-2', category: 'one-handed', subcategory: 'Sword', order: 10 },
  { id: 'sword-1', category: 'one-handed', subcategory: 'Sword', order: 2 },
  { id: 'shield', category: 'one-handed', subcategory: 'Shield' },
  { id: 'bow', category: 'two-handed', subcategory: 'Bow' },
  { id: 'deleted-weapon', category: 'one-handed', subcategory: 'Axe', deleted: true },
  { id: 'hand-harp', category: 'one-handed', subcategory: 'Harp' },
  { id: 'trinket-harp', category: 'trinket', subcategory: 'Harp' },
];

test('a hero selection matches its front, back, and hero skills separately', () => {
  const result = heroCardsFor(cards, 'hero-front');
  assert.equal(result.front.id, 'hero-front');
  assert.deepEqual(result.backs.map(card => card.id), ['hero-back']);
  assert.deepEqual(result.skills.map(card => card.id), ['hero-skill']);
  assert.deepEqual(heroCardsFor(cards, 'missing'), { front: undefined, backs: [], skills: [] });
});

test('subcategory choices exclude deleted cards and group by category', () => {
  assert.deepEqual(subcategoriesFor(cards, 'one-handed'), ['Harp', 'Shield', 'Sword']);
  assert.deepEqual(cardsFor(cards, 'one-handed', 'Harp').map(card => card.id), ['hand-harp']);
  assert.deepEqual(cardsFor(cards, 'trinket', 'Harp').map(card => card.id), ['trinket-harp']);
  assert.deepEqual(cardsFor(cards, 'one-handed', 'Sword').map(card => card.id), ['sword-1', 'sword-2']);
});

test('a second weapon defaults to the first 1-handed subcategory and disappears for 2-handed choices', () => {
  const input = { heroCardId: 'hero-front', role: 'Captain', weaponMode: 'one-handed', weaponSubcategories: ['Sword', 'Shield'] };
  assert.deepEqual(normalizeBuildSelection(input, cards).weaponSubcategories, ['Sword', 'Shield']);
  assert.deepEqual(normalizeBuildSelection({ ...input, weaponMode: 'two-handed', weaponSubcategories: ['Bow', 'Shield'] }, cards).weaponSubcategories, ['Bow']);
  const empty = normalizeBuildSelection({ ...input, weaponSubcategories: ['', 'Shield'] }, cards);
  assert.equal(empty.weaponMode, 'one-handed');
  assert.deepEqual(empty.weaponSubcategories, ['Harp', 'Shield']);
  assert.deepEqual(normalizeBuildSelection({ ...input, weaponSubcategories: ['Sword', 'Bow'] }, cards).weaponSubcategories, ['Sword', 'Harp']);
  assert.deepEqual(normalizeBuildSelection({ ...input, weaponSubcategories: ['Sword', 'Sword'] }, cards).weaponSubcategories, ['Sword', 'Sword']);
});

test('selection normalization replaces unavailable choices with defaults without changing the input', () => {
  const input = { heroCardId: 'missing', role: 'missing', weaponMode: 'one-handed', weaponSubcategories: ['Axe', 'Sword'], trinketSubcategory: 'Harp' };
  const before = structuredClone(input);
  const selected = normalizeBuildSelection(input, cards);
  assert.equal(selected.heroCardId, 'hero-front'); assert.equal(selected.role, 'Captain'); assert.equal(selected.weaponMode, 'one-handed');
  assert.deepEqual(selected.weaponSubcategories, ['Harp', 'Sword']);
  assert.equal(selected.trinketSubcategory, 'Harp');
  assert.deepEqual(input, before);
});

test('picked cards lead each row in click order while the other cards keep reviewed order', () => {
  const row = cardsFor(cards, 'one-handed');
  assert.deepEqual(orderedBuildRow(row, ['shield', 'sword-2']).map(card => card.id), ['shield', 'sword-2', 'sword-1', 'hand-harp']);
  assert.deepEqual(orderedBuildRow(row, ['sword-2']).map(card => card.id), ['sword-2', 'sword-1', 'shield', 'hand-harp']);
  assert.deepEqual(orderedBuildRow(row, []), row);
});

test('changing a picker removes hidden picks and preserves the remaining click order', () => {
  const input = { heroCardId: 'hero-front', role: 'Captain', weaponMode: 'one-handed', weaponSubcategories: ['Sword', 'Shield'],
    pickedCardIds: ['shield', 'hero-skill', 'sword-2', 'role', 'deleted-weapon', 'hero-back', 'shield'] };
  assert.deepEqual(normalizeBuildSelection(input, cards).pickedCardIds, ['shield', 'hero-skill', 'sword-2', 'role']);
  const updated = normalizeBuildSelection({ ...input, weaponMode: 'two-handed', weaponSubcategories: ['Bow'] }, cards);
  assert.deepEqual(updated.pickedCardIds, ['hero-skill', 'role']);
  assert.deepEqual(normalizeBuildSelection({ ...input, heroCardId: 'bilbo-front' }, cards).pickedCardIds, ['shield', 'sword-2', 'role']);
});

test('fresh builds default every picker in displayed order without picking cards', () => {
  const catalog = [...cards,
    { id: 'deleted-hero', category: 'hero-card', subcategory: 'A', deleted: true },
    { id: 'first-hero', category: 'hero-card', subcategory: 'A hero', order: 100 },
    { id: 'armor-b', category: 'armor', subcategory: 'Plate', order: 0 },
    { id: 'armor-a', category: 'armor', subcategory: 'Cloak', order: 100 },
    { id: 'mount', category: 'mount', subcategory: 'Pony' },
  ];
  assert.deepEqual(normalizeBuildSelection({}, catalog), {
    heroCardId: 'first-hero', role: 'Captain', weaponMode: 'one-handed', weaponSubcategories: ['Harp', 'Harp'],
    armorSubcategory: 'Cloak', trinketSubcategory: 'Harp', mountSubcategory: 'Pony', pickedCardIds: [],
  });
});

test('empty categories stay empty and a 2-handed-only catalog selects its first weapon', () => {
  assert.deepEqual(normalizeBuildSelection({}, []), {
    heroCardId: '', role: '', weaponMode: '', weaponSubcategories: [], pickedCardIds: [],
    armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '',
  });
  const selected = normalizeBuildSelection({}, cards.filter(card => card.category === 'two-handed'));
  assert.equal(selected.weaponMode, 'two-handed');
  assert.deepEqual(selected.weaponSubcategories, ['Bow']);
});

test('valid restored choices and visible highlights survive default normalization', () => {
  const input = { heroCardId: 'bilbo-front', role: 'Captain', weaponMode: 'two-handed', weaponSubcategories: ['Bow'],
    armorSubcategory: '', trinketSubcategory: 'Harp', mountSubcategory: '', pickedCardIds: ['bow', 'other-skill', 'role'] };
  assert.deepEqual(normalizeBuildSelection(input, cards), input);
});
