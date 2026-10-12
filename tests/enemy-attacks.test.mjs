import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const catalog = JSON.parse(readFileSync(new URL('../dist/enemies-data.json', import.meta.url)));
const imported = JSON.parse(readFileSync(new URL('../dist/enemy-attacks.json', import.meta.url)));
const byId = new Map(imported.enemies.map(enemy => [enemy.id, enemy]));

test('the supplied PDF covers every catalog enemy with complete, unique attack numbers', () => {
  assert.equal(readFileSync(new URL(`../dist/${imported.source.file}`, import.meta.url)).subarray(0, 5).toString(), '%PDF-');
  assert.ok(statSync(new URL(`../dist/${imported.source.file}`, import.meta.url)).size > 100_000);
  assert.equal(byId.size, 19);
  assert.equal(imported.enemies.reduce((total, enemy) => total + enemy.attacks.length, 0), 168);
  assert.equal(catalog.enemies.reduce((total, enemy) => total + byId.get(enemy.id).attacks.length, 0), 126);
  for (const enemy of imported.enemies) {
    assert.deepEqual(enemy.attacks.map(attack => attack.number), Array.from({length:enemy.attacks.length}, (_,i)=>i+1));
    for (const attack of enemy.attacks) {
      assert.match(attack.negate, /^(Might|Wisdom|Agility|Spirit|Wits)$/);
      assert.ok(attack.text.length > 20);
      assert.doesNotMatch(attack.text + attack.effect, /Group Size|Enemy Type|\bAvg\b/);
      assert.equal(attack.groups.length, 3);
      assert.ok(attack.groups.some(Boolean));
      for (const group of attack.groups.filter(Boolean)) {
        assert.ok(Number.isInteger(group.damage) && group.damage >= 0);
        assert.ok(Number.isInteger(group.fear) && group.fear >= 0);
      }
    }
  }
});

test('wrapped PDF cell text and effects remain complete and attached to the right attack', () => {
  const scout = byId.get('goblin-scout').attacks;
  assert.equal(scout[2].text, 'A Goblin sweeps its spear in wide arcs in an attempt to disarm you.');
  assert.equal(scout[2].effect, 'If you suffer {Damage}, discard 1 prepared card.');
  assert.equal(scout[3].effect, 'After this attack, flip 2 {Fear} faceup.');
  assert.ok(scout[11].text.endsWith('the attack has caught you off your guard.'));
  assert.equal(byId.get('hungry-warg').attacks[11].effect, 'After this attack, gain 1 weakness and place it on the bottom of your deck.');
  assert.equal(byId.get('orc-marauder').attacks[1].text, "An Orc's massive hands grip the handle of a wicked-looking axe.");
});

test('group restrictions and source attack values agree with the catalog averages', () => {
  assert.deepEqual(byId.get('goblin-scout').attacks[3].groups, [null, {damage:1,fear:1}, {damage:2,fear:1}]);
  assert.deepEqual(byId.get('goblin-scout').attacks[4].groups, [{damage:2,fear:1}, null, null]);
  assert.ok(byId.get('hill-troll').attacks.every(attack=>attack.groups[1]===null && attack.groups[2]===null));
  for (const enemy of catalog.enemies) {
    const attacks = byId.get(enemy.id).attacks;
    for (const [i, average] of enemy.attacks.entries()) {
      const groups = attacks.map(attack=>attack.groups[i]).filter(Boolean);
      assert.ok(groups.length > 0);
      for (const stat of ['damage','fear']) {
        const mean = groups.reduce((total,group)=>total+group[stat],0)/groups.length;
        assert.ok(Math.abs(mean-average[stat]) <= 0.051, `${enemy.name}, group ${i+1}: ${stat}`);
      }
    }
  }
});
