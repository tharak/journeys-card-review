import { LOCAL_BUILDS_KEY, localBuildId, parseBuild } from './build-data.mjs';

export function readLocalBuilds(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(LOCAL_BUILDS_KEY) || '[]');
    return (Array.isArray(saved) ? saved : []).filter(build => typeof build?.id === 'string' && build.id);
  } catch { return []; }
}

export function migrationLedger(uid, storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(`journeys-cloud-build-transfer-${uid}-v1`) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

export async function transferLocalBuilds({ store, user, getUser = () => user, storage = localStorage }) {
  const ledger = migrationLedger(user.uid, storage);
  let transferred = 0;
  let unreadable = 0;
  for (const local of readLocalBuilds(storage)) {
    if (ledger[local.id]) continue;
    if (getUser()?.uid !== user.uid) throw new Error('Sign-in changed. Sign back in to continue the transfer.');
    let draft;
    try { draft = parseBuild(local); } catch { unreadable++; continue; }
    draft.id = await localBuildId(user.uid, local.id);
    draft.revision = 0;
    draft.name = draft.name.trim() || 'Transferred build';
    await store.save(draft, user, { migration: true });
    ledger[local.id] = draft.id;
    storage.setItem(`journeys-cloud-build-transfer-${user.uid}-v1`, JSON.stringify(ledger));
    transferred++;
  }
  if (unreadable) throw new Error(`${transferred} builds transferred; ${unreadable} unreadable browser builds kept locally.`);
  return transferred;
}

export function migrationControl(button, { getUser, getStore, notify }) {
  let transferring = false;
  const render = () => {
    const user = getUser();
    const ledger = user ? migrationLedger(user.uid) : {};
    const count = user ? readLocalBuilds().filter(build => !ledger[build.id]).length : 0;
    button.hidden = !count;
    button.disabled = transferring;
    button.textContent = transferring ? 'Transferring builds…' : `Transfer ${count} browser-saved build${count === 1 ? '' : 's'}`;
  };
  button.addEventListener('click', async () => {
    if (transferring || !getUser()) return;
    transferring = true; render();
    try {
      const count = await transferLocalBuilds({ store: await getStore(), user: getUser(), getUser });
      notify(`${count} build${count === 1 ? '' : 's'} transferred. Browser originals kept.`);
    } catch (error) { notify(`${error.message} Browser originals are kept; retry to continue.`, true); }
    finally { transferring = false; render(); }
  });
  window.addEventListener('storage', render);
  return { render };
}
