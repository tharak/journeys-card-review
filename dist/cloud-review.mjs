import { reviewDocuments, diffDocuments, mergeDocuments, applyCloudDocuments, acknowledgeChanges } from './cloud-review-data.mjs';

async function loadFirebase() {
  const sdk = await import('./firebase-sdk.bundle.mjs');
  return sdk.default;
}

export async function connectCloudReview({ getState, applyReview, controls, notify = () => {}, readOnly = false, manageAuth = true, loadSDK = loadFirebase }) {
  let config;
  try {
    const response = await fetch('cloud-config.json');
    if (!response.ok) throw new Error('Cloud configuration could not load.');
    config = await response.json();
  } catch (error) { notify(error.message); return null; }
  if (!config.enabled) return null;
  controls.hidden = false;
  const status = controls.querySelector('[data-cloud-status]');
  const authButton = controls.querySelector('[data-cloud-auth]');
  const uploadButton = controls.querySelector('[data-cloud-upload]');
  const retryButton = controls.querySelector('[data-cloud-retry]');
  authButton.hidden = readOnly || !manageAuth;
  const setStatus = message => { status.textContent = message; };
  setStatus('Connecting to cloud…');
  try {
    for (const field of ['apiKey', 'authDomain', 'projectId', 'appId']) {
      if (!config.firebase?.[field]) throw new Error(`Missing Firebase ${field}.`);
    }
    const [appSDK, authSDK, dbSDK] = await loadSDK();
    const app = appSDK.initializeApp(config.firebase);
    const auth = authSDK.getAuth(app);
    const db = dbSDK.getFirestore(app);
    const queueKey = `journeys-cloud-pending-${config.firebase.projectId}-v1`;
    const backupKey = `journeys-cloud-browser-backup-${config.firebase.projectId}-v1`;
    let browserEdits = reviewDocuments(getState());
    if (!readOnly) {
      try {
        const backup = localStorage.getItem(backupKey);
        if (backup) {
          const saved = JSON.parse(backup);
          applyCloudDocuments(getState(), saved);
          browserEdits = saved;
        } else localStorage.setItem(backupKey, JSON.stringify(browserEdits));
      } catch { notify('Could not keep a backup of browser edits. Export a copy before uploading.'); }
    }
    let pending = {};
    try {
      const saved = JSON.parse(localStorage.getItem(queueKey) || '{}');
      applyCloudDocuments(getState(), saved); // Validate before accepting persisted writes.
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) pending = saved;
    } catch { notify('Unreadable pending cloud edits. Your browser review is still available.'); }
    let baseline = reviewDocuments(getState());
    let remote = {};
    let ready = false;
    let editor = false;
    let writing = false;
    let timer;
    let authGeneration = 0;
    let lastError = '';
    let uploading = false;
    const hasPending = () => Object.keys(pending).length > 0;
    function persistQueue() {
      try { localStorage.setItem(queueKey, JSON.stringify(pending)); }
      catch { notify('Pending cloud edits could not be saved in this browser. Export a copy.'); }
    }
    function updateStatus() {
      uploadButton.hidden = readOnly || !editor || !Object.keys(browserEdits).length;
      uploadButton.disabled = !ready || writing;
      retryButton.hidden = readOnly || !editor || !hasPending();
      retryButton.disabled = writing;
      if (lastError) setStatus(lastError);
      else if (!ready) setStatus('Connecting to cloud…');
      else if (writing) setStatus('Saving to cloud…');
      else if (hasPending() && !readOnly) setStatus(editor ? 'Cloud edits waiting to save' : 'Browser edits pending · sign in as an editor to save');
      else setStatus(editor ? 'Cloud connected · edits save automatically' : manageAuth ? 'Shared cloud catalog · browser edits stay local' : 'Shared cloud catalog · read-only');
    }
    function applyRemote() {
      const review = applyCloudDocuments(getState(), mergeDocuments(remote, readOnly ? {} : pending));
      applyReview(review);
      baseline = reviewDocuments(getState());
    }
    async function flush() {
      if (readOnly || writing || !ready || !editor || !hasPending()) return;
      writing = true; lastError = ''; updateStatus();
      const generation = authGeneration;
      try {
        while (hasPending() && editor && generation === authGeneration) {
          // Keep batches well below the Firestore write limit.
          const sent = Object.fromEntries(Object.entries(pending).slice(0, 200));
          const batch = dbSDK.writeBatch(db);
          for (const [id, fields] of Object.entries(sent)) {
            batch.set(dbSDK.doc(db, 'cardReviews', id), fields, { merge: true });
          }
          await batch.commit();
          remote = mergeDocuments(remote, sent);
          pending = acknowledgeChanges(pending, sent);
          persistQueue();
        }
        if (uploading && !hasPending()) {
          uploading = false; browserEdits = {};
          try { localStorage.setItem(backupKey, '{}'); } catch { /* Writes have already succeeded. */ }
          notify('Previous browser edits uploaded to the shared catalog.');
        }
      } catch (error) {
        lastError = error.code === 'permission-denied' ? 'Cloud save denied · check editor access' : 'Cloud save failed · edits kept in this browser';
        notify(lastError);
      } finally { writing = false; updateStatus(); }
    }
    function recordChanges() {
      if (readOnly) return;
      const current = reviewDocuments(getState());
      pending = mergeDocuments(pending, diffDocuments(baseline, current));
      baseline = current;
      persistQueue();
      clearTimeout(timer);
      timer = setTimeout(flush, 600);
      updateStatus();
    }
    // Public reads allow both catalog pages to receive the same reviewed cards.
    dbSDK.onSnapshot(dbSDK.collection(db, 'cardReviews'), { includeMetadataChanges: true }, snapshot => {
      // Don't mistake this SDK's optimistic writes for a successful cloud save.
      if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
      try {
        const next = Object.fromEntries(snapshot.docs.map(document => [document.id, document.data()]));
        // If an administrator deletes a document, restore its published fields.
        remote = mergeDocuments(remote, diffDocuments(remote, next));
        applyRemote(); ready = true; lastError = ''; updateStatus();
        void flush();
      } catch (error) { lastError = 'Cloud data could not be read · browser review retained'; updateStatus(); notify(lastError); }
    }, error => {
      ready = false;
      lastError = 'Cloud unavailable · using browser review'; updateStatus(); notify(`${lastError} (${error.code})`);
    });
    authSDK.onAuthStateChanged(auth, async user => {
      const generation = ++authGeneration;
      editor = false;
      authButton.textContent = user ? 'Sign out' : 'Sign in with Google';
      authButton.title = user?.email || '';
      if (user && !readOnly) {
        try {
          const access = await dbSDK.getDoc(dbSDK.doc(db, 'editors', user.uid));
          if (generation !== authGeneration) return;
          editor = access.exists() && access.data().enabled === true;
          if (!editor && manageAuth) notify('Signed in. An administrator must grant this account editor access.');
        } catch { notify('Editor access could not be checked. Edits stay in this browser.'); }
      }
      if (generation !== authGeneration) return;
      updateStatus(); void flush();
    });
    authButton.disabled = false;
    authButton.addEventListener('click', async () => {
      authButton.disabled = true;
      try {
        if (auth.currentUser) await authSDK.signOut(auth);
        else await authSDK.signInWithPopup(auth, new authSDK.GoogleAuthProvider());
      } catch (error) { notify(`Google sign-in failed (${error.code}).`); }
      finally { authButton.disabled = false; }
    });
    uploadButton.addEventListener('click', () => {
      pending = mergeDocuments(pending, browserEdits);
      uploading = true;
      applyRemote();
      persistQueue(); void flush();
    });
    retryButton.addEventListener('click', flush);
    window.addEventListener('online', flush);
    return { recordChanges, flush };
  } catch (error) { setStatus('Cloud setup incomplete · using browser review'); notify(error.message); return null; }
}
