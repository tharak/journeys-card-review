import assert from 'node:assert/strict';
import test from 'node:test';
import { cardsFor, heroCardsFor, normalizeBuildSelection, subcategoriesFor } from '../dist/build-flow.mjs';

const cards = [
  { id: 'hero-front', category: 'hero-card', subcategory: 'Aragorn' },
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

test('a second weapon is allowed only after choosing a 1-handed subcategory', () => {
  const input = { heroCardId: 'hero-front', role: 'Captain', weaponMode: 'one-handed', weaponSubcategories: ['Sword', 'Shield'] };
  assert.deepEqual(normalizeBuildSelection(input, cards).weaponSubcategories, ['Sword', 'Shield']);
  assert.deepEqual(normalizeBuildSelection({ ...input, weaponMode: 'two-handed', weaponSubcategories: ['Bow', 'Shield'] }, cards).weaponSubcategories, ['Bow']);
  const empty = normalizeBuildSelection({ ...input, weaponSubcategories: ['', 'Shield'] }, cards);
  assert.equal(empty.weaponMode, '');
  assert.deepEqual(empty.weaponSubcategories, []);
  assert.deepEqual(normalizeBuildSelection({ ...input, weaponSubcategories: ['Sword', 'Bow'] }, cards).weaponSubcategories, ['Sword', '']);
});

test('selection normalization clears deleted and unavailable choices without changing the input', () => {
  const input = { heroCardId: 'missing', role: 'missing', weaponMode: 'one-handed', weaponSubcategories: ['Axe', 'Sword'], trinketSubcategory: 'Harp' };
  const before = structuredClone(input);
  const selected = normalizeBuildSelection(input, cards);
  assert.equal(selected.heroCardId, ''); assert.equal(selected.role, ''); assert.equal(selected.weaponMode, '');
  assert.equal(selected.trinketSubcategory, 'Harp');
  assert.deepEqual(input, before);
});
