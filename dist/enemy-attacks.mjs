import { statIcon, negateIcons, symbolText, damageFearIcons as pair } from './stat-icons.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function installEnemyAttacks(content) {
  const dialog = document.createElement('dialog');
  dialog.id = 'enemy-attack-dialog';
  dialog.className = 'enemy-attack-dialog';
  dialog.setAttribute('aria-labelledby', 'enemy-attack-title');
  dialog.innerHTML = `<div class="enemy-attack-shell"><header class="enemy-attack-header"><h2 id="enemy-attack-title"></h2><button type="button" class="icon-button" aria-label="Close attacks" autofocus>×</button></header><div class="enemy-attack-body"></div></div>`;
  document.body.append(dialog);
  const body = dialog.querySelector('.enemy-attack-body');
  let attackData;
  let opener;
  let currentId;
  let request = 0;

  function loadAttacks() {
    if (!attackData) {
      attackData = fetch('enemy-attacks.json').then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).catch(error => {
        attackData = undefined;
        throw error;
      });
    }
    return attackData;
  }

  async function showAttacks(row) {
    const id = row.dataset.enemyId;
    currentId = id;
    opener = document.activeElement?.closest('[data-enemy-id]') === row ? document.activeElement : row;
    opener.focus({preventScroll:true});
    const activeRequest = ++request;
    dialog.querySelector('h2').textContent = `${row.dataset.enemyName} attacks`;
    body.innerHTML = '<p role="status">Loading attacks…</p>';
    dialog.showModal();
    dialog.scrollTop = 0;
    try {
      const data = await loadAttacks();
      if (!dialog.open || activeRequest !== request) return;
      const enemy = data.enemies.find(enemy => enemy.id === id);
      if (!enemy?.attacks.length) throw new Error(`No attacks found for ${id}`);
      body.innerHTML = `<div class="enemy-table-wrap" role="region" aria-label="${escape(enemy.name)} attacks" tabindex="0"><table class="enemy-table attack-table"><thead><tr><th scope="col" rowspan="2">#</th><th scope="col" rowspan="2">Attack</th><th scope="col" rowspan="2">Negate</th><th scope="colgroup" colspan="3">${statIcon('Damage')}&nbsp;/&nbsp;${statIcon('Fear')}</th><th scope="col" rowspan="2">Effect</th></tr><tr>${[1,2,3].map(n=>`<th scope="col" class="damage-fear-heading">${n} ${n===1?'enemy':'enemies'}</th>`).join('')}</tr></thead><tbody>${enemy.attacks.map(attack=>`<tr><th scope="row">${attack.number}</th><td class="attack-text">${symbolText(attack.text)}</td><td class="attack-negate">${negateIcons(attack.negate)}</td>${attack.groups.map(group=>`<td class="damage-fear-cell">${pair(group)}</td>`).join('')}<td class="attack-effect">${symbolText(attack.effect || '—')}</td></tr>`).join('')}</tbody></table></div>`;
    } catch (error) {
      if (!dialog.open || activeRequest !== request) return;
      console.error('Could not load enemy attacks', error);
      body.innerHTML = '<p role="alert">The attacks could not load. <button type="button" class="attack-retry">Try again</button></p>';
    }
  }

  content.addEventListener('click', event => {
    const row = event.target.closest('[data-enemy-id]');
    if (!row || event.target.closest('a') || window.getSelection()?.toString()) return;
    showAttacks(row);
  });
  content.addEventListener('keydown', event => {
    if (!event.target.matches('[data-enemy-id]') || !['Enter',' '].includes(event.key)) return;
    event.preventDefault();
    showAttacks(event.target);
  });
  dialog.querySelector('.icon-button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target.closest('.attack-retry')) {
      showAttacks(content.querySelector(`[data-enemy-id="${currentId}"]`));
      return;
    }
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    request++;
    opener?.focus({preventScroll:true});
  });
}
