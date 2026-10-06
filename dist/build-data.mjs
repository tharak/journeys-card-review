export const LOCAL_BUILDS_KEY = 'journeys-build-creator-saved-v1';
export const LOCAL_DRAFT_KEY = 'journeys-build-creator-draft-v1';
export const BUILD_FIELDS = ['name', 'heroId', 'role', 'notes', 'cards', 'weaponMode',
  'weaponSubcategories', 'armorSubcategory', 'trinketSubcategory', 'mountSubcategory'];
export const emptyDraft = () => ({ id: '', revision: 0, sourceBuildId: '', name: '', heroId: '', role: '', notes: '',
  cards: {}, weaponMode: '', weaponSubcategories: [], armorSubcategory: '', trinketSubcategory: '', mountSubcategory: '' });

export function parseBuild(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Unreadable build.');
  const result = emptyDraft();
  for (const key of ['name', 'heroId', 'role', 'notes', 'weaponMode', 'armorSubcategory', 'trinketSubcategory', 'mountSubcategory', 'sourceBuildId']) {
    const value = input[key] ?? '';
    const limit = key === 'notes' ? 10000 : key === 'name' ? 100 : key === 'sourceBuildId' ? 128 : 200;
    if (typeof value !== 'string' || value.length > limit) throw new Error(`Invalid build ${key}.`);
    result[key] = value;
  }
  if (!['', 'one-handed', 'two-handed'].includes(result.weaponMode)) throw new Error('Invalid weapon type.');
  const weapons = input.weaponSubcategories ?? [];
  if (!Array.isArray(weapons) || weapons.length > 2 || weapons.some(value => typeof value !== 'string' || value.length > 200)) throw new Error('Invalid weapon choices.');
  result.weaponSubcategories = [...weapons];
  const entries = Array.isArray(input.cards) ? input.cards.map(card => [card?.id, card?.quantity])
    : Object.entries(input.cards ?? {});
  if (!input.cards || typeof input.cards !== 'object' || entries.length > 1000) throw new Error('Invalid build cards.');
  for (const [id, quantity] of entries) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 9) throw new Error('Invalid card quantity or ID.');
    result.cards[id] = quantity;
  }
  if (input.id !== undefined && (typeof input.id !== 'string' || input.id.length > 128)) throw new Error('Invalid build ID.');
  result.id = input.id || '';
  result.revision = Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0;
  for (const key of ['ownerId', 'ownerName', 'createdAt', 'updatedAt']) if (input[key] !== undefined) result[key] = input[key];
  return result;
}

export function copyBuild(build) {
  const copy = parseBuild(build);
  copy.sourceBuildId = build.id || '';
  copy.id = ''; copy.revision = 0;
  copy.name = `${copy.name || 'Build'} copy`.slice(0, 100);
  for (const key of ['ownerId', 'ownerName', 'createdAt', 'updatedAt']) delete copy[key];
  return copy;
}

export function buildPayload(build) {
  const parsed = parseBuild(build);
  parsed.cards = Object.fromEntries(Object.entries(parsed.cards).sort(([a], [b]) => a.localeCompare(b)));
  return Object.fromEntries([...BUILD_FIELDS, 'sourceBuildId'].map(key => [key, parsed[key]]));
}

export function buildSummary(build, catalog) {
  const byId = new Map(catalog.map(card => [card.id, card]));
  const hero = byId.get(build.heroId);
  const parts = [hero?.subcategory || hero?.title || 'Unknown hero', build.name || 'Untitled build', build.role || 'No role'];
  const picked = Object.keys(build.cards || {}).map(id => byId.get(id)).filter(card => card && !card.deleted);
  const slots = (build.weaponSubcategories || []).slice(0, build.weaponMode === 'two-handed' ? 1 : 2)
    .map(name => [build.weaponMode, name]);
  slots.push(['armor', build.armorSubcategory], ['trinket', build.trinketSubcategory], ['mount', build.mountSubcategory]);
  for (const [category, subcategory] of slots) {
    if (!subcategory) continue;
    const choices = picked.filter(card => card.category === category && card.subcategory === subcategory)
      .sort((a, b) => (Number.isSafeInteger(b.order) ? b.order : -1) - (Number.isSafeInteger(a.order) ? a.order : -1)
        || a.id.localeCompare(b.id));
    if (choices.length) parts.push(choices[0].title || choices[0].id);
  }
  return parts.join(' · ');
}

export function compareBuildList(a, b, { sort = 'favorite', favorites = new Set(), catalog = [] } = {}) {
  const heroes = new Map(catalog.map(card => [card.id, card.subcategory || card.title || card.id]));
  const hero = build => heroes.get(build.heroId) || 'Unknown hero';
  const recent = (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0);
  if (sort === 'hero') return hero(a).localeCompare(hero(b)) || a.role.localeCompare(b.role) || recent || a.id.localeCompare(b.id);
  if (sort === 'role') return a.role.localeCompare(b.role) || hero(a).localeCompare(hero(b)) || recent || a.id.localeCompare(b.id);
  return Number(favorites.has(b.id)) - Number(favorites.has(a.id)) || recent || a.id.localeCompare(b.id);
}

export function unavailableCards(build, catalog) {
  const available = new Set(catalog.filter(card => !card.deleted && card.buildEligible !== false).map(card => card.id));
  return [build.heroId, ...Object.keys(build.cards)].filter(id => id && !available.has(id));
}

export async function localBuildId(uid, localId) {
  const bytes = new TextEncoder().encode(JSON.stringify([uid, localId]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `local-${[...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}
