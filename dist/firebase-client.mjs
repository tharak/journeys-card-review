let connection;
export function getFirebase() {
  connection ??= (async () => {
    const response = await fetch('cloud-config.json');
    if (!response.ok) throw new Error('Cloud configuration could not load.');
    const config = await response.json();
    if (!config.enabled) throw new Error('Cloud saving is disabled.');
    const [appSDK, authSDK, dbSDK] = (await import('./firebase-sdk.bundle.mjs')).default;
    const app = appSDK.initializeApp(config.firebase);
    return { app, auth: authSDK.getAuth(app), db: dbSDK.getFirestore(app), authSDK, dbSDK };
  })();
  return connection;
}

export async function connectAccount(button, onChange, notify = () => {}) {
  try {
    const { auth, db, authSDK, dbSDK } = await getFirebase();
    let generation = 0;
    authSDK.onAuthStateChanged(auth, async user => {
      const current = ++generation;
      button.textContent = user ? 'Sign out' : 'Sign in with Google';
      button.title = user?.email || '';
      onChange(user, false);
      if (user) {
        try {
          const access = await dbSDK.getDoc(dbSDK.doc(db, 'editors', user.uid));
          if (current === generation) onChange(user, access.exists() && access.data().enabled === true);
        } catch { /* Build creation does not require card-editor access. */ }
      }
    });
    button.disabled = false;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        if (auth.currentUser) await authSDK.signOut(auth);
        else await authSDK.signInWithPopup(auth, new authSDK.GoogleAuthProvider());
      } catch (error) { notify(`Google sign-in failed (${error.code}).`); }
      finally { button.disabled = false; }
    });
  } catch (error) { notify(error.message); }
}
