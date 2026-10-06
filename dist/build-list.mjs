import { getBuildStore } from './cloud-builds.mjs';
import { buildSummary, compareBuildList } from './build-data.mjs';
import { migrationControl } from './build-migration.mjs';

export function connectBuildList({ getCatalog, notify }) {
  const $ = selector => document.querySelector(selector);
  let builds = [], user = null, ready = false, failure = '';
  let favorites = new Set(), unsubscribeFavorites, generation = 0;
  const busyFavorites = new Set();
  const store = getBuildStore();
  const migration = migrationControl($('#local-build-transfer'), { getUser: () => user, getStore: () => store, notify });
  function render() {
    const term = $('#build-search').value.trim().toLocaleLowerCase();
    const list = $('#saved-build-list');
    list.replaceChildren();
    const catalog = getCatalog();
    const matching = builds.filter(build => !term || `${build.name} ${buildSummary(build, catalog)}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => compareBuildList(a, b, { sort: $('#build-sort').value, favorites, catalog }));
    for (const build of matching) {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = `build.html?id=${encodeURIComponent(build.id)}`;
      link.textContent = buildSummary(build, catalog);
      link.title = build.name;
      if (build.ownerId === user?.uid) link.setAttribute('aria-label', `${link.textContent} — your build`);
      const favorite = document.createElement('button');
      favorite.type = 'button'; favorite.className = 'build-favorite';
      const active = favorites.has(build.id);
      favorite.textContent = active ? '★' : '☆';
      favorite.setAttribute('aria-label', `${active ? 'Unfavorite' : 'Favorite'} ${link.textContent}`);
      favorite.setAttribute('aria-pressed', String(active));
      favorite.title = active ? 'Remove favorite' : 'Favorite build';
      favorite.disabled = !user || busyFavorites.has(build.id);
      favorite.addEventListener('click', async () => {
        if (!user || busyFavorites.has(build.id)) return;
        const account = user, current = generation;
        busyFavorites.add(build.id); render();
        try {
          await (await store).favorite(build.id, !active, account);
          if (current === generation) { if (active) favorites.delete(build.id); else favorites.add(build.id); }
        } catch { notify('Favorite could not save. Check your connection and retry.'); }
        finally { busyFavorites.delete(build.id); render(); }
      });
      row.append(link, favorite); list.append(row);
    }
    const empty = $('#build-list-empty');
    empty.hidden = !failure && ready && matching.length > 0;
    empty.textContent = failure || (!ready ? 'Loading saved builds…' : builds.length ? 'No matching builds.' : 'No saved builds.');
    migration.render();
  }
  store.then(connection => connection.watchList(next => { builds = next; ready = true; failure = ''; render(); }, () => {
    failure = 'Saved builds could not load. Check your connection and reload.'; render();
  })).catch(error => { failure = error.message; render(); });
  $('#build-search').addEventListener('input', render);
  $('#build-sort').addEventListener('change', render);
  render();
  return { render, setUser(next) {
    if (next?.uid !== user?.uid) {
      const current = ++generation;
      unsubscribeFavorites?.(); favorites = new Set();
      if (next) store.then(connection => {
        if (current !== generation) return;
        unsubscribeFavorites = connection.watchFavorites(next.uid, saved => {
          if (current === generation) { favorites = saved; render(); }
        }, () => { if (current === generation) notify('Favorites could not load. Check your connection and reload.'); });
      }).catch(() => {});
    }
    user = next; render();
  } };
}
