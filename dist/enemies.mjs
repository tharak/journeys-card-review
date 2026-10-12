const content = document.querySelector('#reference-content');
const page = document.body.dataset.reference;
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = enemy => `enemy.html?id=${encodeURIComponent(enemy.id)}`;
const speed = n => ['','Slow','Medium','Fast'][n];
const number = n => n === null || n === undefined ? '—' : n.toFixed(1);
const stats = ['Might','Wisdom','Agility','Spirit','Wits'];
let data;

function heading(title, description, count, countLabel) {
  return `<div class="reference-heading"><div><div class="reference-kicker">Journeys in Middle-earth · Field reference</div><h1>${escape(title)}</h1><p>${escape(description)}</p></div>${count ? `<div class="reference-count">${count}<span>${escape(countLabel)}</span></div>` : ''}</div>`;
}

function sourceFooter() {
  return `<footer class="reference-sources"><p>Research by <strong>Reshyk</strong>, with the attack workbook assembled by <strong>Birdman137</strong>. <a href="${data.source.url}" target="_blank" rel="noopener">Read the original BGG project ↗</a> · <a href="${data.source.spreadsheet}" target="_blank" rel="noopener">Full attack spreadsheet and PDF ↗</a></p><p>Adapted from the original post, updated July 7, 2022; checked October 12, 2026. This reference covers the 13 standard enemy types and five campaign boss sections documented in that post. The linked v1.4 workbook includes further Spreading War enemy data. Scripted encounters can override base values; follow the app for your encounter.</p></footer>`;
}

function output(attack) {
  if (!attack) return '<span class="reference-note">Not a legal group size</span>';
  return `<div class="attack-value"><span>${number(attack.damage)} D / ${number(attack.fear)} F</span><strong>${number(attack.total)}</strong></div><div class="attack-track" aria-hidden="true"><span class="physical" style="width:${attack.damage / 6 * 100}%"></span><span class="fear" style="width:${attack.fear / 6 * 100}%"></span></div>`;
}

function modifierTable(modifiers, includeEnemies = true) {
  return `<div class="enemy-table-wrap" role="region" aria-label="Elite modifiers" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Modifier</th><th scope="col">Effect</th><th scope="col">Cost: 1 / 2 / 3</th>${includeEnemies ? '<th scope="col">Eligible enemies</th>' : ''}</tr></thead><tbody>${modifiers.map(m=>`<tr><th scope="row">${escape(m.name)}</th><td>${escape(m.effect)}</td><td class="compact">${m.costs.map(c=>c ?? '—').join(' / ')}</td>${includeEnemies ? `<td>${m.enemies.map(name=>{const e=data.enemies.find(e=>e.name===name);return `<a href="${link(e)}">${escape(name)}</a>${name==='Hill Troll' && m.conditional ? '*' : ''}`;}).join(', ')}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function renderCatalog() {
  content.innerHTML = heading('Know your enemy', 'Compare defenses, movement, and expected attacks before you commit your next action.', data.enemies.length, 'standard enemy types') + `
    <div class="reference-intro"><p><strong>Difficulty changes the opposition</strong>Base health, defenses, movement, and attacks stay the same across difficulty settings.</p><p><strong>Group size changes the attack</strong>Select the number of figures to compare the published average Damage and Fear.</p><p><strong>Look beyond the numbers</strong>Open an enemy for side effects, negate chances, elite modifiers, and spawn costs.</p></div>
    <form class="enemy-controls" role="search" onsubmit="return false">
      <label class="enemy-search">Find an enemy<input id="enemy-search" type="search" placeholder="Name, tag, or effect…" autocomplete="off"></label>
      <label>Movement<select id="enemy-movement"><option value="all">All movement</option><option value="1">Slow · 1 space</option><option value="2">Medium · 2 spaces</option><option value="3">Fast · 3 spaces</option><option value="ranged">Ranged enemies</option></select></label>
      <label>Order by<select id="enemy-order"><option value="source">Research order</option><option value="name">Name A–Z</option><option value="attack">Highest total attack</option><option value="health">Highest health</option></select></label>
      <fieldset class="group-selector"><legend>Figures in group</legend><div class="group-buttons">${[1,2,3].map(n=>`<button type="button" data-group="${n}" aria-pressed="${n===1}">${n}</button>`).join('')}</div></fieldset>
    </form>
    <div class="enemy-results-meta"><span id="enemy-count" role="status" aria-live="polite"></span><div class="attack-legend"><span>Damage</span><span>Fear</span></div></div>
    <div class="enemy-table-wrap" role="region" aria-label="Compare enemy stats" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Enemy</th><th scope="col">Health</th><th scope="col">Armor</th><th scope="col">Sorcery</th><th scope="col">Move</th><th scope="col" id="attack-heading">Average attack · 1 figure</th><th scope="col">Spawn cost</th></tr></thead><tbody id="enemy-rows"></tbody></table></div>
    <p id="enemy-empty" class="empty-state" hidden>No enemies match. Try a different name, tag, effect, or movement filter.</p>
    <p class="reference-note">Health and defenses are per figure. Average attacks are per group, before negation and elite bonuses. D = Damage; F = Fear. Totals reproduce the source’s independently rounded averages and may differ from the sum of the displayed Damage and Fear. A dash marks an unavailable group size.</p>
    <div class="reference-bottom-links"><a href="enemy-mechanics.html">How attacks and elites work →</a><a href="enemy-bosses.html">Campaign bosses & scripted enemies →</a></div>` + sourceFooter();
  let group = 1;
  const update = () => {
    const query=document.querySelector('#enemy-search').value.trim().toLowerCase();
    const movement=document.querySelector('#enemy-movement').value;
    const order=document.querySelector('#enemy-order').value;
    const enemies=data.enemies.filter(e=>`${e.name} ${e.tags.join(' ')} ${e.note}`.toLowerCase().includes(query) && (movement==='all' || (movement==='ranged' ? e.ranged : e.speed===Number(movement))));
    if(order==='name') enemies.sort((a,b)=>a.name.localeCompare(b.name));
    if(order==='health') enemies.sort((a,b)=>b.health-a.health);
    if(order==='attack') enemies.sort((a,b)=>(b.attacks[group-1]?.total ?? -1)-(a.attacks[group-1]?.total ?? -1));
    document.querySelector('#enemy-rows').innerHTML=enemies.map(e=>`<tr><td class="enemy-name"><a href="${link(e)}">${escape(e.name)} →</a><small>${e.ranged?'Ranged · ':''}${escape(e.tags.filter(t=>!['Slow','Fast','Range'].includes(t)).join(' · '))}</small></td><td>${e.health}</td><td>${e.armor}</td><td>${e.sorcery}</td><td class="compact">${speed(e.speed)} · ${e.speed}</td><td class="attack-output">${output(e.attacks[group-1])}</td><td>${e.costs[group-1] ?? '—'}</td></tr>`).join('');
    document.querySelector('#enemy-count').textContent=`${enemies.length} of ${data.enemies.length} enemies · ${group} ${group===1?'figure':'figures'} per group`;
    document.querySelector('#attack-heading').textContent=`Average attack · ${group} ${group===1?'figure':'figures'}`;
    document.querySelector('#enemy-empty').hidden=enemies.length>0;
  };
  for(const id of ['enemy-search','enemy-movement','enemy-order']) document.getElementById(id).addEventListener('input', update);
  document.querySelectorAll('[data-group]').forEach(button=>button.addEventListener('click',()=>{
    group=Number(button.dataset.group);
    document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    update();
  }));
  update();
}

function renderEnemy() {
  const id=new URLSearchParams(location.search).get('id');
  const enemy=data.enemies.find(e=>e.id===id);
  if(!enemy){document.title='Enemy not found · Journeys';content.innerHTML=heading('Enemy not found','Choose an enemy from the reference to view its stats.')+'<a href="enemies.html">← Browse enemies</a>'+sourceFooter();return;}
  document.title=`${enemy.name} · Journeys enemies`;
  const index=data.enemies.indexOf(enemy);
  const negateTotal=enemy.negate.reduce((a,b)=>a+b,0);
  content.innerHTML=`<div class="detail-heading-links"><a href="enemies.html">← All enemies</a><a href="${data.source.url}">Original research ↗</a></div>`+
    heading(enemy.name,enemy.note)+`
    <div class="enemy-tags">${enemy.tags.map(t=>`<span class="enemy-tag">${escape(t)}</span>`).join('')}${enemy.ranged?'<span class="enemy-tag">Ranged attack</span>':''}</div>
    <dl class="stat-grid"><div><dt>Health</dt><dd>${enemy.health}</dd></div><div><dt>Armor</dt><dd>${enemy.armor}</dd></div><div><dt>Sorcery</dt><dd>${enemy.sorcery}</dd></div><div><dt>Movement</dt><dd>${enemy.speed} <small>${speed(enemy.speed)}</small></dd></div><div><dt>Max group</dt><dd>${enemy.maxGroup}</dd></div><div><dt>Figure pool</dt><dd>${enemy.figures}</dd></div></dl>
    <p class="reference-note">Health and defenses apply to each figure. Figure pool is the source’s total available miniatures for this type, before adventure reservations. It is different from maximum figures in one group. ${enemy.id==='nameless-thing'?'Movement is by teleport, not through intervening spaces.':`Normal movement is ${enemy.speed} ${enemy.speed===1?'space':'spaces'}; if no target can be reached, the standard repositioning move doubles to ${enemy.speed*2}.`} Scripted encounters may override these values.</p>
    <div class="reference-columns"><section class="reference-section"><h2>Attack by group size</h2><div class="enemy-table-wrap" role="region" aria-label="Attack by group size" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Figures</th><th scope="col">Damage</th><th scope="col">Fear</th><th scope="col">Total</th><th scope="col">Spawn cost</th></tr></thead><tbody>${enemy.attacks.map((a,i)=>`<tr><th scope="row">${a.group}</th><td>${number(a.damage)}</td><td>${number(a.fear)}</td><td>${number(a.total)}</td><td>${enemy.costs[i]}</td></tr>`).join('')}</tbody></table></div><p class="reference-note">Published averages per group before negation and elite bonuses. Totals are rounded separately, so displayed parts may not add up exactly. Spawn cost is the app’s internal point budget, not attack damage.</p></section>
    <section class="reference-section"><h2>What will you negate?</h2><ul class="negate-list">${enemy.negate.map((n,i)=>`<li><span>${stats[i]}</span><div class="negate-track" aria-hidden="true"><span style="width:${n}%"></span></div><strong>${n}%</strong></li>`).join('')}</ul><p class="reference-note">Approximate chance of each negate stat across this enemy’s activations. Actual chances vary with group size.${negateTotal<98||negateTotal>102?` The source percentages total ${negateTotal}%; they are preserved as published, with no invented correction.`:' Rounding may make the total differ slightly from 100%.'}</p></section></div>
    <section class="reference-section"><h2>Possible elite modifiers</h2><p>The source lists these modifiers as eligible for this enemy type. A random group can have up to three, subject to group-size and stat restrictions.</p>${modifierTable(data.modifiers.filter(m=>m.enemies.includes(enemy.name)),false)}${enemy.id==='hill-troll'?'<p class="reference-note">Wary appears in the eligibility table, but requires at least two figures. A standard Hill Troll group can only contain one, so the author flags this combination as unreachable in ordinary random spawns.</p>':''}${enemy.id==='nameless-thing'?'<p class="reference-note">The author suspects Hardened requires another modifier that adds armor. This condition is not confirmed.</p>':''}</section>
    <div class="reference-bottom-links">${index>0?`<a href="${link(data.enemies[index-1])}">← ${escape(data.enemies[index-1].name)}</a>`:'<a href="enemies.html">← All enemies</a>'}${index<data.enemies.length-1?`<a href="${link(data.enemies[index+1])}">${escape(data.enemies[index+1].name)} →</a>`:'<a href="enemy-mechanics.html">Enemy mechanics →</a>'}</div>`+sourceFooter();
}

function renderMechanics() {
  content.innerHTML=heading('How enemies work','The hidden rules behind movement, attacks, elite bonuses, and random spawns.')+`
    <div class="reference-columns"><section class="reference-section"><h2>Movement & targeting</h2><p>Slow enemies move one space, medium enemies two, and fast enemies three. If an enemy cannot reach a hero to attack, it normally repositions at double that movement. Scripted enemies can use special movement patterns.</p><p>The research reports that Shadow Phase activation order is random. Standard target selection also chooses randomly among surviving heroes; if the selected hero cannot be reached, an enemy can attack a closer reachable hero instead. Bosses may have explicit target preferences.</p></section>
    <section class="reference-section"><h2>Attacks are a pool of activations</h2><p>Each activation defines its negate stat, Damage, Fear, and any additional effects. Its Damage and Fear values are fixed for each group size. Some activations are legal only for a lone enemy or for groups of at least two.</p><p>Every currently legal activation has the same chance of selection. Counterattacks, provoked attacks, and Shadow Phase attacks use the same selection system. Base-set enemies typically have 12 activations, Shadowed Paths enemies about seven, and bosses often six.</p></section>
    <section class="reference-section"><h2>Exhaustion & counterattacks</h2><p>A non-provoked attack exhausts an enemy group. Exhausted enemies do not move during the Shadow Phase. Ordinary exhausted enemies cannot counterattack, while exhausted elites can.</p><p>Repeated counterattacks from an exhausted elite become weaker: the first has no penalty, the second loses one combined Damage/Fear, the third loses two, and so on. The reduction is split randomly between Damage and Fear, leaving at least one combined point. Reactivation resets the penalty.</p><p>A prevented counterattack does not build this penalty; repeatedly applying Stun cannot accumulate it.</p></section>
    <section class="reference-section"><h2>Group size & damage</h2><p>Larger groups generally hit harder, but their attacks do not simply multiply by the number of figures. Each type scales differently. Removing a figure changes the available activations and group-size values.</p><p>The author recommends eliminating a group when possible rather than only reducing a different group. In the documented standard enemies, the largest non-elite hit is six combined Damage/Fear, reached by three Wights or three Ruffians.</p></section></div>
    <section class="reference-section"><h2>Elite modifiers</h2><p>A random elite group can have at most three modifiers. Eligibility depends on enemy type and sometimes group size. Modifiers that enhance the same stat cannot be combined. Add the listed point costs to the base group’s spawn cost.</p>${modifierTable(data.modifiers)}
    <p class="reference-note">A dash means the modifier is unavailable at that group size. *Wary is listed for Hill Trolls but requires a group of at least two; the source flags that combination as unreachable for normal one-figure Hill Troll groups. The author suspects that a Nameless Thing needs an armor-granting modifier before Hardened can appear.</p>
    <div class="reference-callout"><strong>Use the updated BGG table.</strong> It lists Shrouded as +1 Sorcery, Veteran as +5 Health and +1 Damage, and Well-Equipped as +1 Armor and +2 Health. Earlier reposts give different effects. Boss modifiers and scripted encounters have their own values.</div></section>
    <section class="reference-section"><h2>Why enemies spawn</h2><p>Random spawns draw from a point budget. Each enemy type has a fixed cost for each group size, with elite modifier costs added on top. The app can spend less than the budget when figures or banners run out, but cannot exceed it.</p><p>Difficulty, hero count, adventure conditions, and campaign choices affect spawning. The original post contains a contradictory sentence about the direction of budget changes on easier settings, so this guide does not infer an exact formula.</p><ul><li>Only figures from enabled content are eligible.</li><li>Adventures reserve figures and banners for scripted events; reserved components cannot be used for random spawns.</li><li>Available normal and elite banners limit which groups can be created.</li><li>Spawn events may require tags such as Beast, Orc, Weak, or Powerful. These tags select eligible enemies; they do not add combat effects.</li><li>Standard groups cap at three figures, except Cave Trolls (two), Hill Trolls (one), and Nameless Things (one).</li></ul><p>For example, three Shadowmen cost 47 points. Veteran adds 24, Guarded 27, and Hardened 18, making the documented elite combination cost 116 points.</p></section>
    <section class="reference-section"><h2>Useful damage breakpoints</h2><p>These are the author’s strategy notes for ordinary enemies before elite bonuses. A breakpoint is a damage value that changes whether an attack can remove a figure.</p><div class="enemy-table-wrap" role="region" aria-label="Damage breakpoints" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Damage</th><th scope="col">What it reaches</th></tr></thead><tbody><tr><th scope="row">4</th><td>Goblin Scouts and Giant Spiders</td></tr><tr><th scope="row">5</th><td>Ruffians and Pit Goblins; Cave Trolls with Lethal</td></tr><tr><th scope="row">7</th><td>Orc Marauders and Orc Hunters; Hill Trolls with Lethal</td></tr><tr><th scope="row">9</th><td>Most standard enemies with moderate health; check armor and sorcery</td></tr></tbody></table></div><p>Account for Pierce, Lethal, and other attack keywords when comparing equipment. Strike 2 can push an otherwise insufficient attack across a useful breakpoint.</p></section>`+sourceFooter();
}

function renderBosses() {
  content.innerHTML=heading('Campaign adversaries','Bosses, scripted variants, and their encounter modifiers. Open a campaign to reveal its spoilers.',data.campaigns.reduce((n,c)=>n+c.bosses.length,0),'documented adversaries')+`
    <div class="reference-callout"><strong>Campaign spoilers inside.</strong> Each campaign starts collapsed. Values below are base definitions before its listed encounter modifiers. Follow the app for the version you face.</div>
    ${data.campaigns.map(c=>`<details class="boss-campaign"><summary>${escape(c.name)} <small>${c.bosses.length} entries · reveal spoilers</small></summary><div class="boss-campaign-content">${c.name==='Shadowed Paths'?'<p class="reference-note">Boss modifiers can share a name and description while using different values at different encounter stages.</p>':''}${c.bosses.map(b=>`<article class="boss-card" id="${escape(b.id)}"><h3>${escape(b.name)}${b.unused?' · unused definition':''}</h3><div class="boss-stats">${b.health===null?'Base stats: see Witch-king below':`Health ${b.health} · Armor ${b.armor} · Sorcery ${b.sorcery}`} ${b.move?`<br>Movement: ${escape(b.move)}`:''}</div><p>${escape(b.note)}</p>${b.attacks.length?`<details><summary>${b.attacks.length} documented attack values</summary><p class="reference-note">Damage and Fear are before negation and encounter modifiers. These rows summarize the source’s activations; see the original research for each attack’s full additional effects. They are not a probability table.</p><div class="enemy-table-wrap" role="region" aria-label="${escape(b.name)} attacks" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Entry</th><th scope="col">Negate</th><th scope="col">Damage</th><th scope="col">Fear</th></tr></thead><tbody>${b.attacks.map((a,i)=>`<tr><th scope="row">${i+1}</th><td>${escape(a.negate)}</td><td>${a.damage}</td><td>${a.fear}</td></tr>`).join('')}</tbody></table></div></details>`:'<p class="reference-note">No separate numeric attack list is supplied for this variant in the post.</p>'}</article>`).join('')}<section class="boss-modifiers"><h2>Encounter modifiers</h2><div class="enemy-table-wrap" role="region" aria-label="${escape(c.name)} modifiers" tabindex="0"><table class="enemy-table"><thead><tr><th scope="col">Modifier / variant</th><th scope="col">Effect</th></tr></thead><tbody>${c.modifiers.map(m=>`<tr><th scope="row">${escape(m.name)}</th><td>${escape(m.effect)}</td></tr>`).join('')}</tbody></table></div></section></div></details>`).join('')}`+sourceFooter();
}

try {
  const response=await fetch('enemies-data.json');
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  data=await response.json();
  ({catalog:renderCatalog,enemy:renderEnemy,mechanics:renderMechanics,bosses:renderBosses}[page] || renderCatalog)();
} catch(error) {
  console.error('Could not load enemy reference',error);
  content.innerHTML='<p class="reference-status" role="alert">The enemy reference could not load. <a href="">Reload this page</a> or <a href="https://boardgamegeek.com/thread/2469108/demystifying-enemies-a-project-documenting-enemy-s">read the original research</a>.</p>';
}
