import assert from 'node:assert/strict';
import test from 'node:test';
import { connectCloudReview } from '../dist/cloud-review.mjs';
import { CLOUD_CATEGORIES } from '../dist/cloud-review-data.mjs';

async function harness(t, initial = {}, readOnly = false) {
  const state = { cards: [{ id: 'a', category: 'role' }], aliases: {}, duplicateIds: [],
    roleSubcategories: [], heroNames: [], validCategories: CLOUD_CATEGORIES,
    overrides: {}, subcategoryOverrides: {}, orderOverrides: {}, textOverrides: {}, titleOverrides: {}, deleted: new Set(), ...initial };
  const stored = new Map();
  const config = { enabled: true, firebase: { projectId: 'test', appId: 'test', apiKey: 'test', authDomain: 'test' } };
  const globals = {
    fetch: async () => ({ ok: true, json: async () => config }),
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    window: { addEventListener() {} },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; });
  }
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const elements = new Map(['status', 'auth', 'upload', 'retry'].map(key => [key,
    { hidden: false, disabled: false, addEventListener(event, handler) { this.handler = handler; } }]));
  const controls = { hidden: true, querySelector: selector => elements.get(selector.match(/data-cloud-(\w+)/)[1]) };
  const writes = [];
  const notices = [];
  let snapshotHandler; let authHandler; let fail = false; let duringWrite;
  const auth = { currentUser: null };
  const sdk = [
    { initializeApp: value => value },
    { getAuth: () => auth, onAuthStateChanged: (auth, handler) => { authHandler = handler; } },
    { getFirestore: () => ({}), collection: (db, path) => path, doc: (db, path, id) => ({ path, id }),
      onSnapshot: (ref, options, handler) => { snapshotHandler = handler; },
      getDoc: async () => ({ exists: () => true, data: () => ({ enabled: true }) }),
      writeBatch() {
        const sent = [];
        return { set: (ref, fields, options) => sent.push({ ...ref, fields: structuredClone(fields), options }),
          async commit() {
            if (fail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
            writes.push(sent);
            if (duringWrite) { const callback = duringWrite; duringWrite = null; callback(); }
          } };
      } },
  ];
  const connection = await connectCloudReview({ getState: () => state, controls, readOnly,
    loadSDK: async () => sdk, notify: message => notices.push(message),
    applyReview(review) { state.overrides = review.categories; state.deleted = review.deleted; Object.assign(state, {
      subcategoryOverrides: review.subcategoryOverrides, orderOverrides: review.orderOverrides,
      textOverrides: review.textOverrides, titleOverrides: review.titleOverrides }); },
  });
  return { state, connection, stored, elements, controls, writes, notices,
    snapshot(documents = {}, metadata = {}) { snapshotHandler({ metadata: { fromCache: false, hasPendingWrites: false, ...metadata },
      docs: Object.entries(documents).map(([id, fields]) => ({ id, data: () => fields })) }); },
    async authenticate(user = { uid: 'editor', email: 'editor@example.com' }) { auth.currentUser = user; await authHandler(user); },
    fail(value) { fail = value; }, duringWrite(callback) { duringWrite = callback; },
  };
}

test('initial browser edits are backed up and uploaded explicitly, while catalog reads do not write', async t => {
  const h = await harness(t, { overrides: { a: 'armor' } });
  h.snapshot({ a: { categories: 'role' } });
  await h.authenticate(); await h.connection.flush();
  assert.deepEqual(h.writes, []);
  assert.equal(h.state.overrides.a, 'role');
  assert.equal(JSON.parse(h.stored.get('journeys-cloud-browser-backup-test-v1')).a.categories, 'armor');
  h.elements.get('upload').handler(); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.writes[0][0].fields.categories, 'armor');
  assert.equal(h.state.overrides.a, 'armor');
});

test('a failed save survives a conflicting cloud snapshot and can be retried', async t => {
  const h = await harness(t); h.snapshot(); await h.authenticate();
  h.state.orderOverrides.a = 0; h.connection.recordChanges(); h.fail(true);
  await h.connection.flush();
  assert.equal(JSON.parse(h.stored.get('journeys-cloud-pending-test-v1')).a.orders, 0);
  h.snapshot({ a: { orders: 99, titles: 'Another editor' } });
  assert.equal(h.state.orderOverrides.a, 0);
  assert.equal(h.state.titleOverrides.a, 'Another editor');
  await Promise.resolve(); h.fail(false); await h.connection.flush();
  assert.equal(h.writes.at(-1)[0].fields.orders, 0);
  assert.deepEqual(JSON.parse(h.stored.get('journeys-cloud-pending-test-v1')), {});
});

test('edits made during a cloud save are sent in the next batch', async t => {
  const h = await harness(t); h.snapshot(); await h.authenticate();
  h.state.orderOverrides.a = 1; h.connection.recordChanges();
  h.duringWrite(() => { h.state.orderOverrides.a = 2; h.connection.recordChanges(); });
  await h.connection.flush();
  assert.deepEqual(h.writes.map(batch => batch[0].fields.orders), [1, 2]);
  assert.deepEqual(JSON.parse(h.stored.get('journeys-cloud-pending-test-v1')), {});
});

test('signed-out and read-only viewers never write to the catalog', async t => {
  const h = await harness(t, {}, true); h.snapshot({ a: { titles: 'Shared title' } }); await h.authenticate();
  h.state.titleOverrides.a = 'Local title'; h.connection.recordChanges(); await h.connection.flush();
  assert.deepEqual(h.writes, []);
  assert.equal(h.elements.get('auth').hidden, true);
  assert.equal(h.elements.get('upload').hidden, true);
  assert.equal(h.elements.get('status').textContent, '');
  assert.equal(h.controls.hidden, true);
});

test('optimistic SDK snapshots do not count as acknowledged cloud data', async t => {
  const h = await harness(t); h.snapshot({ a: { orders: 99 } }, { hasPendingWrites: true });
  assert.deepEqual(h.state.orderOverrides, {});
  h.snapshot({ a: { orders: 7 } });
  assert.equal(h.state.orderOverrides.a, 7);
  h.snapshot();
  assert.deepEqual(h.state.orderOverrides, {});
});

test('signed-out edits stay queued until an approved editor signs in', async t => {
  const h = await harness(t); h.snapshot(); await h.authenticate(null);
  h.state.orderOverrides.a = null; h.connection.recordChanges(); await h.connection.flush();
  assert.deepEqual(h.writes, []);
  assert.equal(h.elements.get('retry').hidden, true);
  await h.authenticate(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(h.writes[0][0].fields, { orders: null });
});
