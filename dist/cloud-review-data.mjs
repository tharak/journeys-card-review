import { REVIEW_FIELDS, createReview, parseReview } from './review-data.mjs';

const FIELDS = [{ field: 'categories', stateKey: 'overrides' }, ...REVIEW_FIELDS];

export const CLOUD_CATEGORIES = new Set(['hero', 'hero-card', 'role', 'one-handed', 'two-handed',
  'armor', 'trinket', 'mount', 'hand-item', 'basic', 'title', 'weakness', 'terrain', 'damage',
  'fear', 'boon', 'bane', 'captured', 'card-back', 'unsorted']);

// Orders use 'published' to reset because null is a real edit (unassigned order).
export function reviewDocuments(state) {
  const documents = {};
  const publishedDeleted = new Set(state.duplicateIds || []);
  for (const card of state.cards) {
    const values = {};
    for (const { field, stateKey } of FIELDS) {
      if (Object.hasOwn(state[stateKey] || {}, card.id)) values[field] = state[stateKey][card.id];
    }
    if (state.deleted.has(card.id) !== publishedDeleted.has(card.id)) values.deleted = state.deleted.has(card.id);
    if (Object.keys(values).length) documents[card.id] = values;
  }
  return documents;
}

export function diffDocuments(before, after) {
  const changes = {};
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    for (const field of new Set([...Object.keys(before[id] || {}), ...Object.keys(after[id] || {})])) {
      const oldValue = before[id]?.[field];
      const newValue = after[id]?.[field];
      if (oldValue === newValue) continue;
      (changes[id] ??= {})[field] = newValue === undefined ? (field === 'orders' ? 'published' : null) : newValue;
    }
  }
  return changes;
}

export function mergeDocuments(...sources) {
  const documents = {};
  for (const source of sources) {
    for (const [id, fields] of Object.entries(source)) documents[id] = { ...documents[id], ...fields };
  }
  return documents;
}

export function applyCloudDocuments(state, documents) {
  const review = structuredClone(createReview(state));
  const knownIds = new Set(state.cards.map(card => card.id));
  const deleted = new Set(review.deleted);
  const publishedDeleted = new Set(state.duplicateIds || []);
  for (const [id, fields] of Object.entries(documents)) {
    if (!knownIds.has(id)) continue;
    for (const { field } of FIELDS) {
      if (!Object.hasOwn(fields, field)) continue;
      if (field === 'orders' ? fields[field] === 'published' : fields[field] === null) delete review[field][id];
      else review[field][id] = fields[field];
    }
    if (Object.hasOwn(fields, 'deleted')) {
      const value = fields.deleted === null ? publishedDeleted.has(id) : fields.deleted;
      if (typeof value !== 'boolean') throw new Error('Invalid cloud deletion');
      if (value) deleted.add(id); else deleted.delete(id);
    }
  }
  review.deleted = [...deleted];
  return parseReview(review, state);
}

// Acknowledge only the fields actually sent. Edits made during a write stay queued.
export function acknowledgeChanges(pending, sent) {
  const remaining = structuredClone(pending);
  for (const [id, fields] of Object.entries(sent)) {
    for (const [field, value] of Object.entries(fields)) {
      if (remaining[id]?.[field] === value) delete remaining[id][field];
    }
    if (remaining[id] && !Object.keys(remaining[id]).length) delete remaining[id];
  }
  return remaining;
}
