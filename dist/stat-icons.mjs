const symbols = new Map([
  ['Might', 'might'], ['Wisdom', 'wisdom'], ['Agility', 'agility'],
  ['Spirit', 'spirit'], ['Wits', 'wits'], ['Wit', 'wits'],
  ['Damage', 'damage'], ['Fear', 'fear'], ['Inspiration', 'inspiration'],
]);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function statIcon(name) {
  if (!symbols.has(name)) return escape(name);
  const label = name === 'Wit' ? 'Wits' : name;
  return `<img class="stat-icon stat-icon-${symbols.get(name)}" src="assets/icons/${symbols.get(name)}.png" alt="${label}" title="${label}" width="28" height="28">`;
}

export const negateIcons = value => String(value).split(' / ').map(statIcon).join('<span class="stat-separator" aria-hidden="true"> / </span>');

export function symbolText(text) {
  return escape(text).replace(/\{(Might|Wisdom|Agility|Spirit|Wits?|Damage|Fear|Inspiration)\}/g, (_,name)=>statIcon(name));
}

export function statAmount(name, value) {
  if (!Number.isFinite(value) || value < 0) return '<span aria-label="Unavailable"></span>';
  const whole = Math.floor(value);
  const fraction = Math.round((value - whole) * 100);
  const icon = statIcon(name).replace(`alt="${name}"`, 'alt=""').replace(` title="${name}"`, '');
  const unit = `<span class="stat-unit">${icon}</span>`;
  const partial = fraction ? `<span class="stat-unit stat-unit-partial"><span class="stat-unit-ghost">${icon}</span><span class="stat-unit-fill" style="width:${fraction}%">${icon}</span></span>` : '';
  const label = `${value} ${name}`;
  return `<span class="stat-amount ${symbols.get(name)}-value" role="img" aria-label="${label}" title="${label}"><span class="stat-amount-icons" aria-hidden="true">${unit.repeat(whole) + partial}</span></span>`;
}

export function damageFearIcons(attack) {
  if (!attack) return '<span aria-label="Unavailable group size"></span>';
  return `<span class="damage-fear-icons">${statAmount('Damage', attack.damage)}${statAmount('Fear', attack.fear)}</span>`;
}
