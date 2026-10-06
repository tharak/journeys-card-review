import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSummary, compareBuildList, parseBuild, copyBuild, emptyDraft, unavailableCards } from '../dist/build-data.mjs';
import { transferLocalBuilds } from '../dist/build-migration.mjs';

const catalog = [
  { id: 'hero', title: 'Aragorn', subcategory: 'Aragorn', category: 'hero-card' },
  { id: 'blade-a', title: 'First blade', category: 'one-handed', subcategory: 'Sword', order: 2 },
  { id: 'blade-b', title: 'Best blade', category: 'one-handed', subcategory: 'Sword', order: 6 },
  { id: 'blade-unpicked', title: 'Unpicked blade', category: 'one-handed', subcategory: 'Sword', order: 99 },
  { id: 'dagger', title: 'Dagger', category: 'one-handed', subcategory: 'Dagger', order: null },
  { id: 'armor-a', title: 'Coat', category: 'armor', subcategory: 'Coat', order: 0 },
  { id: 'armor-b', title: 'Tied coat', category: 'armor', subcategory: 'Coat', order: 0 },
  { id: 'armor-z', title: 'Unassigned coat', category: 'armor', subcategory: 'Coat', order: null },
  { id: 'deleted', title: 'Deleted', category: 'mount', subcategory: 'Horse', order: 100, deleted: true },
];
const build = () => ({ ...emptyDraft(), id: 'original', name: 'Ranger', heroId: 'hero', role: 'Hunter',
  weaponMode: 'one-handed', weaponSubcategories: ['Sword', 'Dagger'], armorSubcategory: 'Coat', mountSubcategory: 'Horse',
  cards: { 'blade-a': 1, 'blade-b': 1, dagger: 1, 'armor-b': 1, 'armor-a': 1, 'armor-z': 1, deleted: 1 } });

test('summary uses only highlighted items and highest assigned Order independently in each slot', () => {
  assert.equal(buildSummary(build(), catalog), 'Aragorn · Hunter · Best blade · Dagger · Coat');
  const unpicked = build(); unpicked.cards = {};
  assert.equal(buildSummary(unpicked, catalog), 'Aragorn · Hunter');
});
test('two-handed summaries have one weapon slot and unassigned items still appear', () => {
  const two = build(); two.weaponMode = 'two-handed'; two.weaponSubcategories = ['Axe', 'Axe']; two.cards = { axe: 1 };
  assert.equal(buildSummary(two, [...catalog, { id: 'axe', title: 'Axe', category: 'two-handed', subcategory: 'Axe', order: null }]), 'Aragorn · Hunter · Axe');
});
test('copies retain independent quantities and notes while clearing ownership and revision', () => {
  const original = { ...build(), ownerId: 'someone', ownerName: 'Someone', revision: 8, notes: 'Keep me', createdAt: 123 };
  const copied = copyBuild(original); copied.cards['blade-b'] = 3;
  assert.equal(original.cards['blade-b'], 1);
  assert.equal(copied.sourceBuildId, 'original'); assert.equal(copied.id, ''); assert.equal(copied.revision, 0);
  assert.equal(copied.notes, 'Keep me'); assert.equal(copied.ownerId, undefined); assert.equal(copied.createdAt, undefined);
});
test('cloud parsing retains unavailable saved choices rather than normalizing the catalog', () => {
  const original = build(); original.cards.missing = 2; original.heroId = 'missing-hero';
  const parsed = parseBuild(original);
  assert.deepEqual(unavailableCards(parsed, catalog), ['missing-hero', 'deleted', 'missing']);
  assert.deepEqual(parsed.cards, original.cards); assert.equal(parsed.heroId, 'missing-hero');
});
test('legacy arrays preserve quantities while invalid quantities and oversized fields fail', () => {
  assert.deepEqual(parseBuild({ ...build(), cards: [{ id: 'dagger', quantity: 2 }] }).cards, { dagger: 2 });
  for (const invalid of [{ cards: { dagger: 0 } }, { cards: { dagger: 10 } }, { notes: 'x'.repeat(10001) }, { weaponSubcategories: [123] }]) {
    assert.throws(() => parseBuild({ ...build(), ...invalid }));
  }
});
test('list ordering supports personal favorites, hero, and role with stable ties', () => {
  const entries = [
    { ...build(), id: 'a', heroId: 'hero-z', role: 'Captain', updatedAt: { toMillis: () => 30 } },
    { ...build(), id: 'b', heroId: 'hero', role: 'Hunter', updatedAt: { toMillis: () => 20 } },
    { ...build(), id: 'c', heroId: 'hero', role: 'Captain', updatedAt: { toMillis: () => 10 } },
  ];
  const cards = [...catalog, { id: 'hero-z', title: 'Legolas' }];
  const order = options => [...entries].sort((a, b) => compareBuildList(a, b, { catalog: cards, ...options })).map(build => build.id);
  assert.deepEqual(order({ favorites: new Set(['c']) }), ['c', 'a', 'b']);
  assert.deepEqual(order({ sort: 'hero' }), ['c', 'b', 'a']);
  assert.deepEqual(order({ sort: 'role' }), ['c', 'a', 'b']);
});
test('partial migration retries do not duplicate uploads or delete browser originals', async () => {
  const source = [build(), { ...build(), id: 'second' }];
  const data = new Map([['journeys-build-creator-saved-v1', JSON.stringify(source)]]);
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const saved = new Map(); let fail = true; const user = { uid: 'owner' };
  const store = { async save(draft) { if (fail && saved.size) throw new Error('offline'); saved.set(draft.id, draft); } };
  await assert.rejects(transferLocalBuilds({ store, user, storage }), /offline/);
  assert.equal(saved.size, 1);
  fail = false;
  assert.equal(await transferLocalBuilds({ store, user, storage }), 1);
  assert.equal(saved.size, 2);
  assert.equal(await transferLocalBuilds({ store, user, storage }), 0);
  assert.deepEqual(JSON.parse(storage.getItem('journeys-build-creator-saved-v1')), source);
});
test('an unreadable local build does not block transferring the other saved builds', async () => {
  const source = [{ ...build(), id: 'broken', cards: { bad: 0 } }, build()];
  const data = new Map([['journeys-build-creator-saved-v1', JSON.stringify(source)]]);
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const saved = [];
  await assert.rejects(transferLocalBuilds({ store: { async save(draft) { saved.push(draft); } }, user: { uid: 'owner' }, storage }), /1 builds transferred; 1 unreadable/);
  assert.equal(saved.length, 1);
  assert.deepEqual(JSON.parse(storage.getItem('journeys-build-creator-saved-v1')), source);
});
