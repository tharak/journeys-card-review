import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { statIcon, negateIcons, symbolText } from '../dist/stat-icons.mjs';

test('all original symbol images exist and retain accessible stat names', () => {
  for (const name of ['Might','Wisdom','Agility','Spirit','Wits','Damage','Fear']) {
    const icon = statIcon(name);
    assert.ok(icon.includes(`alt="${name}"`));
    assert.ok(icon.includes(`title="${name}"`));
    const path = /src="([^"]+)"/.exec(icon)[1];
    const png = readFileSync(new URL(`../dist/${path}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
  assert.equal(statIcon('Wit'), statIcon('Wits'));
});

test('combined negate stats and attack tokens preserve meaning without injecting markup', () => {
  assert.ok(negateIcons('Agility / Wisdom').includes('alt="Agility"'));
  assert.ok(negateIcons('Agility / Wisdom').includes('alt="Wisdom"'));
  assert.equal(negateIcons('Unknown <stat>'), 'Unknown &lt;stat&gt;');
  const text = symbolText('If you suffer {Damage} or {Fear}, test {Might}. <script> {2H}');
  for (const name of ['Damage','Fear','Might']) assert.ok(text.includes(`alt="${name}"`));
  assert.ok(text.includes('&lt;script&gt;'));
  assert.ok(text.includes('{2H}'));
  assert.ok(!text.includes('{Damage}'));
});
