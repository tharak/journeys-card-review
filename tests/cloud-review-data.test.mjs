import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_CATEGORIES, reviewDocuments, diffDocuments, mergeDocuments, applyCloudDocuments, acknowledgeChanges } from '../dist/cloud-review-data.mjs';

function fixture() {
  return {
    cards: [{ id: 'a', category: 'role' }, { id: 'b', category: 'armor' }],
    aliases: {}, duplicateIds: ['b'], roleSubcategories: ['Captain'], heroNames: [], validCategories: CLOUD_CATEGORIES,
    overrides: {}, subcategoryOverrides: {}, orderOverrides: {}, textOverrides: {}, titleOverrides: {}, deleted: new Set(['b']),
  };
}

test('migration contains only browser edits, preserving zero, blank text and restored duplicates', () => {
  const state = fixture();
  assert.deepEqual(reviewDocuments(state), {});
  state.overrides.a = 'hero'; state.orderOverrides.a = 0; state.textOverrides.a = '';
  state.deleted = new Set(['a']);
  assert.deepEqual(reviewDocuments(state), { a: { categories: 'hero', orders: 0, cardTexts: '', deleted: true }, b: { deleted: false } });
});

test('resetting edits writes null tombstones, including a return to published deletion state', () => {
  const state = fixture(); state.overrides.a = 'hero'; state.deleted.delete('b');
  assert.deepEqual(diffDocuments(reviewDocuments(state), reviewDocuments(fixture())), {
    a: { categories: null }, b: { deleted: null },
  });
});

test('concurrent changes to different fields and cards survive a cloud snapshot', () => {
  const state = fixture(); state.overrides.a = 'hero'; state.titleOverrides.b = 'Browser title';
  const documents = mergeDocuments({ a: { categories: 'armor', orders: 12 }, b: { titles: 'Cloud title' } },
    { a: { orders: 0 } });
  const review = applyCloudDocuments(state, documents);
  assert.deepEqual(review.categories, { a: 'armor' });
  assert.deepEqual(review.orderOverrides, { a: 0 });
  assert.deepEqual(review.titleOverrides, { b: 'Cloud title' });
  assert.deepEqual(state.overrides, { a: 'hero' });
});

test('cloud resets remove local overrides and restore published duplicates without losing unrelated edits', () => {
  const state = fixture(); state.orderOverrides.a = 7; state.textOverrides.a = 'Edited';
  state.titleOverrides.b = 'Kept'; state.deleted = new Set(['a']);
  const review = applyCloudDocuments(state, { a: { orders: 'published', cardTexts: '', deleted: false }, b: { deleted: null } });
  assert.deepEqual(review.orderOverrides, {});
  assert.deepEqual(review.textOverrides, { a: '' });
  assert.deepEqual(review.titleOverrides, { b: 'Kept' });
  assert.deepEqual([...review.deleted], ['b']);
});

test('malformed cloud edits are rejected before changing state and unknown card IDs are ignored', () => {
  const state = fixture(); const before = structuredClone(state);
  for (const fields of [{ orders: -1 }, { categories: 'fake' }, { deleted: 'true' }, { titles: 42 }]) {
    assert.throws(() => applyCloudDocuments(state, { a: fields }));
  }
  assert.deepEqual(state, before);
  assert.deepEqual(applyCloudDocuments(state, { unknown: { categories: 'fake' } }).categories, {});
});

test('acknowledging an earlier save preserves edits made while it was in flight', () => {
  const pending = { a: { orders: 2, cardTexts: '' }, b: { deleted: false } };
  const remaining = acknowledgeChanges(pending, { a: { orders: 1, cardTexts: '' } });
  assert.deepEqual(remaining, { a: { orders: 2 }, b: { deleted: false } });
  assert.deepEqual(acknowledgeChanges(remaining, remaining), {});
  assert.deepEqual(pending.a, { orders: 2, cardTexts: '' });
});

test('explicit unassigned order survives cloud writes and differs from restoring published order', () => {
  const state = fixture(); state.cards[0].order = 7; state.orderOverrides.a = null;
  const documents = reviewDocuments(state);
  assert.deepEqual(documents, { a: { orders: null } });
  assert.deepEqual(diffDocuments({}, documents), documents);
  assert.deepEqual(applyCloudDocuments(fixture(), documents).orderOverrides, { a: null });
  assert.deepEqual(diffDocuments(documents, {}), { a: { orders: 'published' } });
  assert.deepEqual(applyCloudDocuments(state, { a: { orders: 'published' } }).orderOverrides, {});
});
