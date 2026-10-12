const symbols = new Map([
  ['Might', 'might'], ['Wisdom', 'wisdom'], ['Agility', 'agility'],
  ['Spirit', 'spirit'], ['Wits', 'wits'], ['Wit', 'wits'],
  ['Damage', 'damage'], ['Fear', 'fear'],
]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function statIcon(name) {
  if (!symbols.has(name)) return escape(name);
  const label = name === 'Wit' ? 'Wits' : name;
  return `<img class="stat-icon stat-icon-${symbols.get(name)}" src="assets/icons/${symbols.get(name)}.png" alt="${label}" title="${label}" width="28" height="28">`;
}

export const negateIcons = value => String(value).split(' / ').map(statIcon).join('<span class="stat-separator" aria-hidden="true"> / </span>');

export function symbolText(text) {
  return escape(text).replace(/\{(Might|Wisdom|Agility|Spirit|Wits?|Damage|Fear)\}/g, (_,name)=>statIcon(name));
}
