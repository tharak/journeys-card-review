import { isCardOrder, cardOrderFor } from './review-data.mjs';
import { connectCloudReview } from './cloud-review.mjs';
import { CLOUD_CATEGORIES } from './cloud-review-data.mjs';
import { connectAccount } from './firebase-client.mjs';
import { getBuildStore } from './cloud-builds.mjs';
import { emptyDraft, parseBuild, copyBuild, unavailableCards, LOCAL_DRAFT_KEY } from './build-data.mjs';
import { migrationControl } from './build-migration.mjs';
import { compareBuildCards, normalizeBuildSelection, renderBuildFlow } from './build-flow.mjs';

const $ = selector => document.querySelector(selector);
const REVIEW_KEYS = {
  categories: 'journeys-card-review-categories-v1',
  subcategories: 'journeys-card-review-subcategories-v1',
  orders: 'journeys-card-review-orders-v1',
  titles: 'journeys-card-review-titles-v1',
  deleted: 'journeys-card-review-deleted-v1',
};
const state = { loaded: false, authReady: false, initialized: false, opening: false, data: null, capture: {}, cards: [], byId: new Map(),
  draft: emptyDraft(), remote: null, user: null, dirty: false, busy: false, stale: false, saving: '', removed: false, error: '' };
let toastTimer, sharedReview = null, unsubscribe;
const store = getBuildStore();
let requestedId = new URLSearchParams(location.search).get('id') || '';
const migration = migrationControl($('#local-build-transfer'), { getUser: () => state.user, getStore: () => store, notify: toast });

function toast(message, error = false) {
  $('#toast').textContent = message; $('#toast').classList.toggle('error', error); $('#toast').classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3500);
}
function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function draftKey() { return `journeys-cloud-build-draft-${state.user?.uid || 'guest'}-${requestedId || 'new'}-v1`; }
function editable() {
  return state.loaded && state.initialized && !state.removed && (!state.draft.ownerId || state.draft.ownerId === state.user?.uid);
}
function persistDraft() {
  if (!editable()) return;
  try { localStorage.setItem(draftKey(), JSON.stringify(state.draft)); }
  catch { toast('Draft could not be kept in this browser. Check storage permissions.', true); }
}
function changed() { state.dirty = true; state.error = ''; persistDraft(); renderActions(); }
function heroName() { const hero = state.byId.get(state.draft.heroId); return hero?.subcategory || hero?.title || 'Hero'; }
function defaultDraft() {
  const { heroCardId, pickedCardIds, ...choices } = normalizeBuildSelection({}, state.cards);
  return { ...emptyDraft(), ...choices, heroId: heroCardId };
}
function renderActions() {
  const canEdit = editable() && !state.busy;
  $('#build-name').disabled = !canEdit;
  $('#build-notes').readOnly = !canEdit;
  $('#build-owner').textContent = state.draft.ownerName ? `By ${state.draft.ownerName}${state.draft.ownerId === state.user?.uid ? ' · your build' : ''}` : '';
  $('#save-build').hidden = !!state.draft.ownerId && state.draft.ownerId !== state.user?.uid;
  $('#save-build').disabled = !canEdit || !state.user || !state.draft.heroId || !state.draft.name.trim() || state.stale || (!state.dirty && state.draft.revision > 0);
  $('#copy-build').hidden = !state.initialized || !state.draft.id;
  $('#copy-build').disabled = state.busy || !state.user;
  $('#copy-build').title = state.user ? '' : 'Sign in with Google to create a copy';
  $('#delete-build').hidden = !state.remote || state.remote.ownerId !== state.user?.uid || state.removed;
  $('#delete-build').disabled = state.busy || state.stale;
  $('#reload-build').hidden = !state.stale || !state.remote;
  $('#reload-build').disabled = state.busy;
  const status = state.busy ? state.saving : state.error ? state.error : state.removed ? 'This build was deleted.'
    : state.stale ? 'Changed in another session · reload or copy your draft'
    : !state.initialized ? 'Loading…' : !editable() ? 'Read-only · create a copy to edit'
    : state.dirty || !state.draft.revision ? (state.user ? 'Unsaved changes' : 'Sign in to save · draft stays in this browser') : 'Saved';
  $('#build-save-status').textContent = status;
  migration.render();
}
function preview(id) {
  const card = state.byId.get(id); if (!card) return;
  $('#preview-image').src = card.image; $('#preview-image').alt = `${card.title} card`; $('#preview-dialog').showModal();
}
function renderLibrary() {
  if (!state.initialized) return;
  renderBuildFlow($('#creator-flow'), {
    cards: state.cards, selection: { ...state.draft, heroCardId: state.draft.heroId, pickedCardIds: Object.keys(state.draft.cards) },
    prefix: 'creator', readOnly: !editable() || state.busy, onPreview: preview,
    onChange(selection) {
      if (!editable() || state.busy) return;
      const { heroCardId, pickedCardIds, ...choices } = selection;
      state.draft.cards = Object.fromEntries(pickedCardIds.map(id => [id, state.draft.cards[id] || 1]));
      state.draft.heroId = heroCardId; Object.assign(state.draft, choices);
      changed(); renderLibrary();
    },
  });
  const unavailable = unavailableCards(state.draft, state.cards);
  $('#build-warning').hidden = !unavailable.length;
  $('#build-warning').textContent = `${unavailable.length} saved card(s) are unavailable in the current catalog. Saved selections are retained.`;
  $('#build-notes-label').hidden = !editable() && !state.draft.notes;
}
function render() {
  $('#build-name').value = state.draft.name; $('#build-notes').value = state.draft.notes;
  renderActions(); renderLibrary();
}
function loadDraft(draft, dirty = false) {
  state.draft = parseBuild(draft); state.dirty = dirty; state.error = ''; state.stale = false; state.initialized = true; state.removed = false;
  $('#loading').hidden = true; render();
}
function initialize() {
  if (!state.loaded || !state.authReady || state.initialized || state.opening) return;
  if (requestedId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestedId)) { $('#loading').textContent = 'Invalid build link.'; return; }
    state.opening = true;
    store.then(connection => {
      unsubscribe = connection.watchBuild(requestedId, remote => {
        state.opening = false;
        state.remote = remote;
        if (!remote) {
          state.removed = true; state.error = 'Build not found or deleted.';
          $('#loading').textContent = state.error; $('#loading').hidden = false;
          if (state.initialized) render(); else renderActions();
          return;
        }
        state.removed = false; $('#loading').hidden = true;
        if (!state.initialized) {
          const stored = readStored(draftKey(), null);
          if (stored?.ownerId === state.user?.uid && remote.ownerId === state.user?.uid) {
            try { loadDraft(stored, true); state.stale = stored.revision !== remote.revision; renderActions(); }
            catch { loadDraft(remote); }
          } else loadDraft(remote);
        } else if (state.busy) { /* Saving resolves against the captured revision. */ }
        else if (state.dirty) { state.stale = remote.revision !== state.draft.revision; renderActions(); }
        else loadDraft(remote);
      }, error => { state.error = 'Build could not load. Check your connection and reload.'; $('#loading').textContent = state.error; toast(error.message, true); renderActions(); });
    }).catch(error => { $('#loading').textContent = error.message; });
  } else {
    let draft = readStored(draftKey(), null);
    if (!draft) {
      const legacy = readStored(LOCAL_DRAFT_KEY, null);
      if (legacy) { try { draft = normalizeLegacyDraft(legacy); draft.id = ''; draft.revision = 0; } catch { /* Keep the original local draft untouched. */ } }
    }
    try { loadDraft(draft || defaultDraft(), true); } catch { loadDraft(defaultDraft(), true); }
  }
}
async function saveBuild() {
  if (!editable() || state.busy || !state.user || state.stale) return;
  if (!state.draft.name.trim()) { toast('Name your build before saving.', true); return; }
  state.draft.name = state.draft.name.trim();
  // Allocate and persist the ID before a request so a retry cannot duplicate a new build.
  state.draft.id ||= crypto.randomUUID(); persistDraft();
  const draft = structuredClone(state.draft), user = state.user;
  state.busy = true; state.saving = 'Saving…'; state.error = ''; renderActions(); renderLibrary();
  try {
    const saved = await (await store).save(draft, user);
    const previousKey = draftKey();
    if (state.user?.uid !== user.uid) return;
    state.draft = parseBuild(saved); state.dirty = false; state.stale = false;
    try { localStorage.removeItem(previousKey); } catch { /* The server save succeeded. */ }
    const firstSave = !requestedId;
    requestedId = saved.id; history.replaceState(null, '', `build.html?id=${encodeURIComponent(saved.id)}`);
    if (firstSave) { state.initialized = false; initialize(); }
    toast('Build saved');
  } catch (error) {
    state.error = error.code === 'build-conflict' ? error.message : 'Save failed · draft kept in this browser. Retry when connected.';
    state.stale = error.code === 'build-conflict'; toast(state.error, true);
  } finally { state.busy = false; render(); }
}
async function deleteBuild() {
  if (!state.remote || state.remote.ownerId !== state.user?.uid || state.busy) return;
  if (!confirm('Delete this saved build? Copies made by other people will remain.')) return;
  state.busy = true; state.saving = 'Deleting…'; renderActions();
  try {
    await (await store).remove(state.remote, state.user);
    state.dirty = false;
    try { localStorage.removeItem(draftKey()); } catch { /* The cloud deletion succeeded. */ }
    location.href = 'index.html';
  }
  catch (error) { state.error = error.message; toast(error.message, true); }
  finally { state.busy = false; renderActions(); }
}
function createCopy() {
  if (!state.user || state.busy) return;
  unsubscribe?.(); unsubscribe = null;
  const copy = copyBuild(state.draft);
  requestedId = ''; state.remote = null; history.replaceState(null, '', 'build.html');
  loadDraft(copy, true); persistDraft();
}
function selectedCards() {
  return Object.entries(state.draft.cards).map(([id, quantity]) => ({ card: state.byId.get(id), quantity })).filter(item => item.card)
    .sort((a, b) => compareBuildCards(a.card, b.card));
}
function applyReviews() {
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const knownIds = new Set(state.data.cards.map(card => card.id));
  const categories = sharedReview?.categories ?? Object.fromEntries(Object.entries(record(readStored(REVIEW_KEYS.categories, {})))
    .map(([id, category]) => [knownIds.has(id) ? id : state.data.aliases?.[id] || id, category === 'weapon' ? 'unsorted' : category]));
  const subcategories = sharedReview?.subcategoryOverrides ?? record(readStored(REVIEW_KEYS.subcategories, {}));
  const orders = sharedReview?.orderOverrides ?? Object.fromEntries(Object.entries(record(readStored(REVIEW_KEYS.orders, {}))).filter(([, value]) => isCardOrder(value)));
  const titles = sharedReview?.titleOverrides ?? record(readStored(REVIEW_KEYS.titles, {}));
  const savedDeleted = readStored(REVIEW_KEYS.deleted, []);
  let initialized = false;
  try { initialized = localStorage.getItem('journeys-card-review-duplicate-review-v1') === '1'; } catch { /* Use the published catalog. */ }
  const deleted = sharedReview?.deleted ?? new Set([
    ...(initialized ? [] : state.data.deletedCards || []),
    ...(Array.isArray(savedDeleted) ? savedDeleted : []),
  ]);
  state.cards = state.data.cards.map(card => {
    const category = CLOUD_CATEGORIES.has(categories[card.id])
      ? categories[card.id] : card.category;
    const fallback = state.capture[card.id]?.title || card.title || card.id;
    const publishedTitle = card.displayTitle && !/^Card \d+$/i.test(card.displayTitle) ? card.displayTitle : fallback;
    return { ...card, category, title: typeof titles[card.id] === 'string' && titles[card.id].trim() ? titles[card.id] : publishedTitle,
      subcategory: typeof subcategories[card.id] === 'string' ? subcategories[card.id] : card.subcategory || '',
      order: cardOrderFor(card, orders),
      deleted: deleted.has(card.id) };
  }).sort(compareBuildCards);
  state.byId = new Map(state.cards.map(card => [card.id, card]));
}

function normalizeLegacyDraft(input, importing = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a build JSON file.');
  if (importing && input.format !== 'journeys-build-v1') throw new Error('Choose an exported Journeys build file.');
  const draft = emptyDraft();
  for (const key of ['id', 'name', 'heroId', 'role', 'notes']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid build ${key}.`);
    draft[key] = input[key] || '';
  }
  draft.name = draft.name.slice(0, 100);
  draft.notes = draft.notes.slice(0, 10000);
  for (const key of ['weaponMode', 'armorSubcategory', 'trinketSubcategory', 'mountSubcategory']) {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid build ${key}.`);
  }
  if (input.weaponSubcategories !== undefined && (!Array.isArray(input.weaponSubcategories)
    || input.weaponSubcategories.length > 2 || input.weaponSubcategories.some(value => typeof value !== 'string'))) {
    throw new Error('Invalid build weapons.');
  }
  if (importing && !Array.isArray(input.cards)) throw new Error('The build is missing its card list.');
  const entries = Array.isArray(input.cards) ? input.cards.map(card => [card?.id, card?.quantity])
    : Object.entries(input.cards && typeof input.cards === 'object' ? input.cards : {});
  for (const [originalId, quantity] of entries) {
    const id = state.byId.has(originalId) ? originalId : state.data.aliases?.[originalId] || originalId;
    if (typeof id !== 'string' || !state.byId.has(id) || state.byId.get(id).buildEligible === false || ['hero-card', 'card-back'].includes(state.byId.get(id).category) || id.startsWith('character-')) throw new Error(`Unknown card: ${originalId}`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9) throw new Error('Card quantities must be between 1 and 9.');
    draft.cards[id] = Math.min(9, (draft.cards[id] || 0) + quantity);
  }
  const equipment = { ...input };
  if (input.weaponMode === undefined) {
    const weapons = [...new Map(Object.keys(draft.cards).map(id => state.byId.get(id))
      .filter(card => ['one-handed', 'two-handed'].includes(card.category) && card.subcategory)
      .map(card => [`${card.category}:${card.subcategory}`, card])).values()];
    equipment.weaponMode = weapons[0]?.category || '';
    equipment.weaponSubcategories = weapons.filter(card => card.category === equipment.weaponMode).slice(0, 2).map(card => card.subcategory);
    for (const category of ['armor', 'trinket', 'mount']) {
      equipment[`${category}Subcategory`] = Object.keys(draft.cards).map(id => state.byId.get(id)).find(card => card.category === category)?.subcategory || '';
    }
  }
  const { heroCardId, pickedCardIds, ...choices } = normalizeBuildSelection({ ...equipment, heroCardId: draft.heroId, role: draft.role, pickedCardIds: Object.keys(draft.cards) }, state.cards);
  draft.heroId = heroCardId;
  Object.assign(draft, choices);
  draft.cards = Object.fromEntries(pickedCardIds.map(id => [id, draft.cards[id]]));
  return draft;
}

function exportBuild() {
  if (!state.draft.heroId) return;
  const name = state.draft.name.trim() || `${heroName()} build`;
  const data = { format: 'journeys-build-v1', name, heroId: state.draft.heroId, hero: heroName(), role: state.draft.role,
    notes: state.draft.notes, weaponMode: state.draft.weaponMode, weaponSubcategories: state.draft.weaponSubcategories,
    armorSubcategory: state.draft.armorSubcategory, trinketSubcategory: state.draft.trinketSubcategory, mountSubcategory: state.draft.mountSubcategory,
    cards: selectedCards().map(({ card, quantity }) => ({ id: card.id, title: card.title, quantity, category: card.category, subcategory: card.subcategory })) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url;
  link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'journeys'}-build.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Build exported');
}

async function start() {
  try {
    const [dataResponse, captureResponse] = await Promise.all([fetch('data.json'), fetch('capture-v2.json')]);
    if (!dataResponse.ok || !captureResponse.ok) throw new Error('Card data could not load. Reload to try again.');
    [state.data, state.capture] = await Promise.all([dataResponse.json(), captureResponse.json()]);
    applyReviews(); state.loaded = true; initialize();
    void connectCloudReview({
      readOnly: true, manageAuth: false, controls: $('#cloud-controls'), notify: toast,
      getState: () => ({
        cards: state.data.cards, aliases: state.data.aliases || {}, duplicateIds: state.data.deletedCards || [],
        roleSubcategories: state.data.roleSubcategories || [],
        heroNames: state.data.cards.filter(card => card.id.startsWith('character-')).map(card => card.title),
        validCategories: CLOUD_CATEGORIES,
        overrides: sharedReview?.categories ?? readStored(REVIEW_KEYS.categories, {}),
        subcategoryOverrides: sharedReview?.subcategoryOverrides ?? readStored(REVIEW_KEYS.subcategories, {}),
        orderOverrides: sharedReview?.orderOverrides ?? readStored(REVIEW_KEYS.orders, {}),
        titleOverrides: sharedReview?.titleOverrides ?? readStored(REVIEW_KEYS.titles, {}),
        textOverrides: sharedReview?.textOverrides ?? {},
        deleted: sharedReview?.deleted ?? new Set(state.cards.filter(card => card.deleted).map(card => card.id)),
      }),
      applyReview(review) { sharedReview = review; applyReviews(); renderLibrary(); },
    });
  } catch (error) { $('#loading').textContent = error.message; }
}
void connectAccount($('[data-account-auth]'), user => {
  const previous = state.user?.uid;
  state.user = user; state.authReady = true;
  if (previous && previous !== user?.uid) {
    if (requestedId && state.remote) loadDraft(state.remote);
    else if (state.loaded) { state.initialized = false; initialize(); }
  } else initialize();
  if (state.initialized && state.remote && !state.dirty) loadDraft(state.remote);
  renderActions(); renderLibrary();
}, toast);
$('#build-name').addEventListener('input', event => { if (editable() && !state.busy) { state.draft.name = event.target.value; changed(); } });
$('#build-notes').addEventListener('input', event => { if (editable() && !state.busy) { state.draft.notes = event.target.value; changed(); } });
$('#save-build').addEventListener('click', saveBuild);
$('#copy-build').addEventListener('click', createCopy);
$('#delete-build').addEventListener('click', deleteBuild);
$('#reload-build').addEventListener('click', () => {
  if (state.remote && confirm('Discard your unsaved changes and reload the saved build?')) {
    try { localStorage.removeItem(draftKey()); } catch { /* Continue loading the server copy. */ }
    loadDraft(state.remote);
  }
});
$('#export-build').addEventListener('click', exportBuild);
$('#import-build').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file || !editable()) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error('This build file is too large.');
    const draft = normalizeLegacyDraft(JSON.parse(await file.text()), true);
    draft.id = ''; draft.revision = 0;
    unsubscribe?.(); requestedId = ''; state.remote = null; history.replaceState(null, '', 'build.html');
    loadDraft(draft, true); persistDraft(); toast('Build imported. Save it to publish.');
  } catch (error) { toast(error.message, true); }
  event.target.value = '';
});
$('#close-preview').addEventListener('click', () => $('#preview-dialog').close());
$('#preview-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
window.addEventListener('beforeunload', event => { if (state.dirty && state.user) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (state.loaded && Object.values(REVIEW_KEYS).includes(event.key)) { applyReviews(); renderLibrary(); } });
start();
