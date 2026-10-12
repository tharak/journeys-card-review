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
  const normalized = String(text ?? '').replace(/\{inspiration\}|\binspiration\b/gi, '{Inspiration}');
  return escape(normalized).replace(/\{(Might|Wisdom|Agility|Spirit|Wits?|Damage|Fear|Inspiration)\}/g, (_,name)=>statIcon(name));
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

export const groupLegend = '<span class="group-legend" aria-label="Enemy group sizes"><span class="group-one">1</span><span class="group-two">2</span><span class="group-three">3</span></span>';

let stripId = 0;
export function groupAttackStrip(groups) {
  const available = groups.map((attack, i) => attack ? {attack, group: i + 1} : null).filter(Boolean);
  if (!available.length) return '<span aria-label="Unavailable group sizes"></span>';
  const label = groups.map((a, i) => `${i + 1} ${i === 0 ? 'enemy' : 'enemies'}: ${a ? `${a.damage} Damage, ${a.fear} Fear` : 'unavailable'}`).join('; ');
  const colors = ['#a8b7a2', '#d9b765', '#8fb7e0'];
  const position = value => value === 0 ? 0 : Math.floor(value) * 20 + (value % 1 ? Math.round((value % 1) * 180) / 10 : -2);
  const id = `attack-strip-${++stripId}`;
  let offset = 3;
  const lanes = ['damage', 'fear'].map(name => {
    const max = Math.max(...available.map(({attack}) => attack[name]));
    if (max === 0) return '';
    const width = Math.ceil(max) * 20 - 2;
    const icons = Array.from({length: Math.ceil(max)}, (_, i) => `<image href="assets/icons/${name}.png" x="${i * 20}" y="3" width="18" height="18"/>`).join('');
    let previous = 0;
    const bands = available.map(({attack, group}) => {
      const end = position(attack[name]);
      const start = position(previous);
      previous = Math.max(previous, attack[name]);
      const extra = end > start ? `<rect x="${start}" y="0" width="${end - start}" height="24" fill="${colors[group - 1]}" fill-opacity="${group === 1 ? '.18' : '.5'}" stroke="${colors[group - 1]}" stroke-opacity="${group === 1 ? '.3' : '.8'}" stroke-width="1" rx="2"/>` : '';
      return `<g data-group="${group}" data-value="${attack[name]}" data-end="${end}">${extra}</g>`;
    }).join('');
    const lane = `<g class="attack-strip-${name}" transform="translate(${offset} 1)"><defs><clipPath id="${id}-${name}"><rect width="${position(max)}" height="24"/></clipPath></defs><g opacity=".18">${icons}</g><g clip-path="url(#${id}-${name})">${icons}</g>${bands}</g>`;
    offset += width + 12;
    return lane;
  }).join('');
  const width = Math.max(6, offset - 9);
  return `<svg class="group-attack-strip" xmlns="http://www.w3.org/2000/svg" width="${width}" height="26" viewBox="0 0 ${width} 26" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${lanes}</svg>`;
}
