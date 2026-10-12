import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statIcon, negateIcons, symbolText, statAmount, damageFearIcons } from '../dist/stat-icons.mjs';

test('all original symbol images exist and retain accessible stat names', () => {
  for (const name of ['Might','Wisdom','Agility','Spirit','Wits','Damage','Fear','Inspiration']) {
    const icon = statIcon(name);
    assert.ok(icon.includes(`alt="${name}"`));
    assert.ok(icon.includes(`title="${name}"`));
    const path = /src="([^"]+)"/.exec(icon)[1];
    const png = readFileSync(new URL(`../dist/${path}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
  assert.equal(statIcon('Wit'), statIcon('Wits'));
});

test('icon amounts preserve whole, fractional, zero, and unavailable attack values', () => {
  const whole = statAmount('Damage', 3);
  assert.equal((whole.match(/class="stat-unit"/g) || []).length, 3);
  assert.ok(whole.includes('aria-label="3 Damage"'));
  assert.ok(!whole.includes('stat-unit-partial'));
  const fraction = statAmount('Fear', 2.3);
  assert.equal((fraction.match(/class="stat-unit"/g) || []).length, 2);
  assert.ok(fraction.includes('width:30%'));
  assert.ok(fraction.includes('title="2.3 Fear"'));
  assert.ok(statAmount('Damage', 0).includes('aria-label="0 Damage"'));
  assert.ok(!statAmount('Damage', 0).includes('<img'));
  assert.ok(statAmount('Fear', 0.4).includes('width:40%'));
  assert.ok(statAmount('Damage', null).includes('Unavailable'));
  assert.ok(damageFearIcons(null).includes('Unavailable group size'));
  const pair = damageFearIcons({damage: 2, fear: 1});
  assert.ok(pair.includes('2 Damage'));
  assert.ok(pair.includes('1 Fear'));
});

test('combined negate stats and attack tokens preserve meaning without injecting markup', () => {
  assert.ok(negateIcons('Agility / Wisdom').includes('alt="Agility"'));
  assert.ok(negateIcons('Agility / Wisdom').includes('alt="Wisdom"'));
  assert.equal(negateIcons('Unknown <stat>'), 'Unknown &lt;stat&gt;');
  const text = symbolText('If you suffer {Damage} or {Fear}, test {Might}. Gain {Inspiration}. <script> {2H}');
  for (const name of ['Damage','Fear','Might','Inspiration']) assert.ok(text.includes(`alt="${name}"`));
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(text.includes('{2H}'));
  assert.ok(!text.includes('{Damage}'));
});
