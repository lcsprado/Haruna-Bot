import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  DAMAGE_SAMPLE_LIMIT,DAMAGE_CLASS_KEY,damageHeroKey,summarizeDamageSamples,combineDamageStats
} from '../src/neon/damage-hero-stats.js';

test('janela padrao de 30 por modalidade e identidade do heroi',()=>{
  assert.equal(DAMAGE_SAMPLE_LIMIT,30);
  assert.equal(damageHeroKey('pecado_escanor'),'pecado_escanor');
  assert.equal(damageHeroKey('pecado_ban'),'pecado_ban');
  assert.equal(damageHeroKey(null),DAMAGE_CLASS_KEY);
  assert.notEqual(damageHeroKey('pecado_escanor'),damageHeroKey('pecado_ban'));
});
test('soma exata antes de arredondar normal e critico',()=>{
  const boss=summarizeDamageSamples([[100,false],[150,true]]);
  const raid=summarizeDamageSamples([[101,false],[301,true]]);
  const total=combineDamageStats(boss,raid);
  assert.equal(total.count,4);
  assert.equal(total.average,163);
  assert.equal(total.normalAverage,101);
  assert.equal(total.critAverage,226);
  assert.equal(total.max,301);
});
test('criticos, maior dano e zero sem amostra',()=>{
  assert.deepEqual(summarizeDamageSamples([]),{
    count:0,total:0,critCount:0,critTotal:0,normalCount:0,normalTotal:0,
    average:0,critAverage:0,normalAverage:0,max:0
  });
  assert.equal(summarizeDamageSamples([[150,true],[200,true]]).normalCount,0);
});
test('persistencia por heroi: escrita atomica, historico legado nao sobrescrito e leitura 30/30',()=>{
  const source=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(source,/CREATE TABLE IF NOT EXISTS player_damage_hits/);
  assert.match(source,/INSERT INTO player_damage_hits\(jid,category,hero_species,damage,critical\)/);
  assert.match(source,/hero_species=\$2 AND category='boss'/);
  assert.match(source,/hero_species=\$2 AND category='raid'/);
  assert.match(source,/ORDER BY id DESC LIMIT \$3/g);
  assert.match(source,/\[jid,damageHeroKey\(heroId\),DAMAGE_SAMPLE_LIMIT\]/);
  assert.match(source,/recordPlayerDamage\(c,p\.jid,'raid',actualDamage,crit,p\.heroId\)/);
  assert.match(source,/recordPlayerDamage\(c,jid,'boss',damage,crit,heroId\)/);
  assert.doesNotMatch(source,/INSERT INTO player_damage_stats|UPDATE player_damage_stats/);
  assert.match(source,/SELECT category,samples FROM player_damage_stats/);
});
test('comando aceita historico e apresenta amostra do heroi',()=>{
  const source=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const start=source.indexOf("} else if(cmd==='dano'){");
  const end=source.indexOf("} else if(['perfil','profile'].includes(cmd)){",start);
  assert.ok(start>0&&end>start);
  const command=source.slice(start,end);
  assert.match(command,/getActivePlayableHero\(db,target\)/);
  assert.match(command,/getPlayerDamageStats\(target,heroId,\{historical\}\)/);
  assert.match(command,/!dano historico/);
  assert.match(command,/DAMAGE_SAMPLE_LIMIT/);
});
