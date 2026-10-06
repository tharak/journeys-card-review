import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import { createBuildStore } from '../../dist/cloud-builds.mjs';
import { copyBuild, emptyDraft, buildPayload } from '../../dist/build-data.mjs';

sdk.setLogLevel('silent'); // Permission denials below are intentional assertions.

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-journeys-builds', firestore: {
    rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
});
beforeEach(async () => { await env.clearFirestore(); });
after(async () => { await env?.cleanup(); });
const user = uid => ({ uid, displayName: uid });
const database = uid => uid ? env.authenticatedContext(uid, { name: uid, firebase: { sign_in_provider: 'google.com' } }).firestore() : env.unauthenticatedContext().firestore();
const store = uid => createBuildStore({ db: database(uid), dbSDK: sdk });
const draft = () => ({ ...emptyDraft(), name: 'Ranger', heroId: 'character-aragorn', role: 'Hunter', cards: { 'card-0001': 1 } });
const document = uid => ({ ...buildPayload(draft()), ownerId: uid, ownerName: uid, revision: 1, createdAt: sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp() });
function ref(db, id = 'example') { return sdk.doc(db, 'builds', id); }

test('any Google user can create a public build; signed-out writes are denied', async () => {
  await assertSucceeds(sdk.setDoc(ref(database('owner')), document('owner')));
  await assertSucceeds(sdk.getDoc(ref(database(null))));
  assert.equal((await assertSucceeds(sdk.getDocs(sdk.collection(database(null), 'builds')))).size, 1);
  await assertFails(sdk.setDoc(ref(database(null), 'signed-out'), document('owner')));
  const otherProvider = env.authenticatedContext('owner', { name: 'owner', firebase: { sign_in_provider: 'password' } }).firestore();
  await assertFails(sdk.setDoc(ref(otherProvider, 'password'), document('owner')));
});
test('only the creator can update or delete, including when another user is a catalog editor', async () => {
  await sdk.setDoc(ref(database('owner')), document('owner'));
  await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), 'editors', 'other'), { enabled: true }));
  const update = { name: 'Updated', revision: 2, updatedAt: sdk.serverTimestamp() };
  await assertFails(sdk.updateDoc(ref(database('other')), update));
  await assertFails(sdk.deleteDoc(ref(database('other'))));
  await assertSucceeds(sdk.updateDoc(ref(database('owner')), update));
  await assertSucceeds(sdk.deleteDoc(ref(database('owner'))));
});
test('ownership, author name, timestamps, ancestry and revision cannot be forged', async () => {
  await assertFails(sdk.setDoc(ref(database('owner')), { ...document('owner'), ownerId: 'other' }));
  await assertFails(sdk.setDoc(ref(database('owner')), { ...document('owner'), ownerName: 'other' }));
  await assertFails(sdk.setDoc(ref(database('owner')), { ...document('owner'), createdAt: sdk.Timestamp.fromMillis(0) }));
  await sdk.setDoc(ref(database('owner')), document('owner'));
  for (const change of [{ ownerId: 'other' }, { ownerName: 'other' }, { createdAt: sdk.Timestamp.fromMillis(0) }, { sourceBuildId: 'other' }, { revision: 3 }]) {
    await assertFails(sdk.updateDoc(ref(database('owner')), { revision: 2, updatedAt: sdk.serverTimestamp(), ...change }));
  }
});
test('schema validation applies on create and update, including required fields and nested values', async () => {
  for (const invalid of [{ name: '' }, { name: ' ' }, { notes: 'x'.repeat(10001) }, { cards: { a: 0 } }, { cards: { a: '1' } },
    { cards: { a: { quantity: 1 } } }, { weaponSubcategories: [12] }, { weaponSubcategories: ['x'.repeat(201)] },
    { updatedAt: 'today' }, { heroId: 12 }, { extra: true }]) {
    await assertFails(sdk.setDoc(ref(database('owner')), { ...document('owner'), ...invalid }));
  }
  await sdk.setDoc(ref(database('owner')), document('owner'));
  for (const invalid of [{ notes: 'x'.repeat(10001) }, { cards: { a: 10 } }, { name: sdk.deleteField() }, { ownerId: sdk.deleteField() }, { extra: true }]) {
    await assertFails(sdk.updateDoc(ref(database('owner')), { revision: 2, updatedAt: sdk.serverTimestamp(), ...invalid }));
  }
});
test('copies have independent ownership; edits and deletion do not change the source or sibling copies', async () => {
  const original = await store('owner').save(draft(), user('owner'));
  const copy = await store('other').save(copyBuild(original), user('other'));
  await store('other').save({ ...copy, name: 'My copy' }, user('other'));
  assert.equal((await sdk.getDoc(ref(database(null), original.id))).data().name, 'Ranger');
  await store('owner').remove(original, user('owner'));
  assert.equal((await sdk.getDoc(ref(database(null), copy.id))).data().name, 'My copy');
});
test('transaction save detects stale sessions and migration retries preserve an existing transferred build', async () => {
  const connection = store('owner');
  const saved = await connection.save(draft(), user('owner'));
  await connection.save({ ...saved, name: 'Newer' }, user('owner'));
  await assert.rejects(connection.save({ ...saved, name: 'Stale' }, user('owner')), { code: 'build-conflict' });
  const migrated = await connection.save({ ...draft(), id: 'local-example' }, user('owner'), { migration: true });
  await connection.save({ ...migrated, name: 'Edited after transfer' }, user('owner'));
  const retry = await connection.save({ ...draft(), id: 'local-example' }, user('owner'), { migration: true });
  assert.equal(retry.name, 'Edited after transfer'); assert.equal(retry.revision, 2);
});
test('retrying an acknowledged new build is idempotent but cannot overwrite a changed server build', async () => {
  const connection = store('owner');
  const input = { ...draft(), id: 'retry-example' };
  const saved = await connection.save(input, user('owner'));
  const repeated = await connection.save(input, user('owner'));
  assert.equal(repeated.id, saved.id); assert.equal(repeated.revision, 1);
  await connection.save({ ...saved, name: 'Updated elsewhere' }, user('owner'));
  await assert.rejects(connection.save(input, user('owner')), { code: 'build-conflict' });
});
test('editor list remains private and cannot be used for self-escalation; catalog permissions still apply', async () => {
  await env.withSecurityRulesDisabled(ctx => sdk.setDoc(sdk.doc(ctx.firestore(), 'editors', 'owner'), { enabled: true }));
  await assertSucceeds(sdk.getDoc(sdk.doc(database('owner'), 'editors', 'owner')));
  await assertFails(sdk.getDoc(sdk.doc(database('other'), 'editors', 'owner')));
  await assertFails(sdk.getDocs(sdk.collection(database('owner'), 'editors')));
  await assertFails(sdk.setDoc(sdk.doc(database('other'), 'editors', 'other'), { enabled: true }));
  await assertSucceeds(sdk.setDoc(sdk.doc(database('owner'), 'cardReviews', 'card-0001'), { titles: 'Reviewed' }));
  await assertFails(sdk.setDoc(sdk.doc(database('other'), 'cardReviews', 'card-0001'), { titles: 'Unauthorized' }));
  await assertSucceeds(sdk.getDocs(sdk.collection(database(null), 'cardReviews')));
});
test('favorites are personal, syncable, idempotent and isolated from other accounts', async () => {
  const saved = await store('owner').save(draft(), user('owner'));
  const connection = store('other');
  await connection.favorite(saved.id, true, user('other'));
  await connection.favorite(saved.id, true, user('other'));
  const favorite = sdk.doc(database('other'), 'users', 'other', 'favorites', saved.id);
  assert.equal((await assertSucceeds(sdk.getDoc(favorite))).exists(), true);
  assert.equal((await assertSucceeds(sdk.getDocs(sdk.collection(database('other'), 'users', 'other', 'favorites')))).size, 1);
  await assertFails(sdk.getDoc(sdk.doc(database('owner'), 'users', 'other', 'favorites', saved.id)));
  await assertFails(sdk.getDocs(sdk.collection(database('owner'), 'users', 'other', 'favorites')));
  await assertFails(sdk.setDoc(sdk.doc(database('owner'), 'users', 'other', 'favorites', saved.id), { createdAt: sdk.serverTimestamp() }));
  await assertFails(sdk.setDoc(sdk.doc(database(null), 'users', 'other', 'favorites', saved.id), { createdAt: sdk.serverTimestamp() }));
  await assertFails(sdk.setDoc(sdk.doc(database('other'), 'users', 'other', 'favorites', 'missing'), { createdAt: sdk.serverTimestamp() }));
  await assertFails(sdk.updateDoc(favorite, { extra: true }));
  await connection.favorite(saved.id, false, user('other'));
  await connection.favorite(saved.id, false, user('other'));
  assert.equal((await sdk.getDoc(favorite)).exists(), false);
});
