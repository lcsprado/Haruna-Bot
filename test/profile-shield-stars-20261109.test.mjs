import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatProfileShieldStars} from '../src/neon/profile-shield-stars.js';

test('!perfil formata as estrelas dos escudos sem depender do menu de forja', () => {
  for (const [value, expected] of [
    [undefined,'★☆☆☆☆'], [0,'★☆☆☆☆'], [1,'★☆☆☆☆'], [2,'★★☆☆☆'],
    [3,'★★★☆☆'], [4,'★★★★☆'], [5,'★★★★★'], [9,'★★★★★'], ['3','★★★☆☆']
  ]) assert.equal(formatProfileShieldStars(value), expected);
});

test('!perfil chama o formatador proprio no trecho do escudo', () => {
  const source = readFileSync(new URL('../src/neon/index.js', import.meta.url), 'utf8');
  const profile = source.split('async function sendAlphaProfile(',2)[1];
  assert.ok(profile, 'sendAlphaProfile deve existir');
  const beforeNext = profile.split('\nasync function ',1)[0];
  assert.match(beforeNext, /formatProfileShieldStars\(p\.shield_stars\|\|1\)/);
  assert.doesNotMatch(beforeNext, /forgeStarsIcon\(p\.shield_stars\|\|1\)/);
});
