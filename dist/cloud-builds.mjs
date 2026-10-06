import { getFirebase } from './firebase-client.mjs';
import { buildPayload, parseBuild } from './build-data.mjs';

function conflict() { return Object.assign(new Error('This build changed in another session. Reload it or save a copy.'), { code: 'build-conflict' }); }

export function createBuildStore({ db, dbSDK: sdk }) {
  const ref = id => sdk.doc(db, 'builds', id);
  return {
    watchList(onChange, onError) {
      return sdk.onSnapshot(sdk.collection(db, 'builds'), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
        const builds = [];
        for (const document of snapshot.docs) {
          try { builds.push(parseBuild({ ...document.data(), id: document.id })); } catch { /* Ignore malformed legacy documents. */ }
        }
        builds.sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0) || a.id.localeCompare(b.id));
        onChange(builds);
      }, onError);
    },
    watchBuild(id, onChange, onError) {
      return sdk.onSnapshot(ref(id), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
        try { onChange(snapshot.exists() ? parseBuild({ ...snapshot.data(), id }) : null); }
        catch (error) { onError(error); }
      }, onError);
    },
    watchFavorites(uid, onChange, onError) {
      return sdk.onSnapshot(sdk.collection(db, 'users', uid, 'favorites'), { includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites || snapshot.metadata.fromCache) return;
        onChange(new Set(snapshot.docs.map(document => document.id)));
      }, onError);
    },
    async favorite(id, active, user) {
      if (!user) throw new Error('Sign in to favorite a build.');
      const favorite = sdk.doc(db, 'users', user.uid, 'favorites', id);
      await sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(favorite);
        if (active && !snapshot.exists()) transaction.set(favorite, { createdAt: sdk.serverTimestamp() });
        else if (!active && snapshot.exists()) transaction.delete(favorite);
      });
    },
    async save(draft, user, { migration = false } = {}) {
      if (!user) throw new Error('Sign in with Google to save a build.');
      const payload = buildPayload(draft);
      if (!payload.heroId || !payload.name.trim()) throw new Error('Choose a hero and name your build.');
      const id = draft.id || crypto.randomUUID();
      return sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref(id));
        const previous = snapshot.exists() ? snapshot.data() : null;
        if (migration && previous?.ownerId === user.uid) return { ...previous, id };
        if (draft.revision === 0 && previous?.ownerId === user.uid && JSON.stringify(buildPayload(previous)) === JSON.stringify(payload)) return { ...previous, id };
        if (previous && (previous.ownerId !== user.uid || previous.revision !== draft.revision)) throw conflict();
        if (!previous && draft.revision > 0) throw conflict();
        const revision = (previous?.revision || 0) + 1;
        const document = { ...payload, ownerId: user.uid,
          ownerName: previous?.ownerName ?? (user.displayName || 'Player').slice(0, 100),
          createdAt: previous?.createdAt ?? sdk.serverTimestamp(), updatedAt: sdk.serverTimestamp(), revision };
        transaction.set(ref(id), document);
        return { ...document, id };
      });
    },
    async remove(build, user) {
      if (!user) throw new Error('Sign in to delete your build.');
      await sdk.runTransaction(db, async transaction => {
        const snapshot = await transaction.get(ref(build.id));
        if (!snapshot.exists()) return;
        const previous = snapshot.data();
        if (previous.ownerId !== user.uid || previous.revision !== build.revision) throw conflict();
        transaction.delete(ref(build.id));
      });
    },
  };
}

export async function getBuildStore() { return createBuildStore(await getFirebase()); }
