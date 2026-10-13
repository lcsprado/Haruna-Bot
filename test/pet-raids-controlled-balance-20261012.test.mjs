import test from 'node:test'
import assert from 'node:assert/strict'
import {PET_STATUS_SPECIALTIES,petCombatSpecialty,petPvpSpecialty} from '../src/neon/game-catalog.js'

const scale=(species,level=100)=>{
  const s=petCombatSpecialty(species)
  const g=s.raid?.25:.5, factor=1+Math.min(g,Math.max(0,level-1)*(g/99)), cap=s.raid?.15:.10
  const pct=key=>Math.min(cap,Math.max(0,Number(s[key]||0)*factor))
  return {
    damage:pct('damage')+pct('bossDamage'), defense:pct('defense'),
    crit:pct('crit'),dodge:pct('dodge'),drop:pct('drop'),xp:pct('xp'),
    heal:pct('healPct'),cooldown:s.healCooldown
  }
}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`expected ${expected}, got ${actual}`)
const pets60=['fera_caos','guardiao_caos','serafim_caotico','oraculo_caos','fenix_caos']
const pets65=['pantera_profundezas','guardiao_abissal','dragao_trono','oraculo_coroa','esfinge_mares']
const pets70=['lobo_eclipse','sentinela_eclipse','dragao_solar_eclipse','fenix_eclipse','avatar_primordial']

test('Balanceamento mantém 5 pets por Raid 60, 65 e 70 e vantagens moderadas',()=>{
  assert.equal(new Set([...pets60,...pets65,...pets70]).size,15)
  for(const s of [...pets60,...pets65,...pets70]){
    assert.ok(PET_STATUS_SPECIALTIES[s]?.raid,s)
    for(const level of [1,60,65,70,100]){
      const a=scale(s,level)
      for(const key of ['defense','crit','dodge','drop','xp','heal']){
        assert.ok(a[key]>=0 && a[key]<=.15+1e-9,`${s}:${key}:${level}`)
      }
      assert.ok(a.damage<=.15+1e-9,`${s}: damage cap`)
    }
  }
})

test('Predadores progridem em dano e crítico: Raid 40 < 60 < 65 < 70',()=>{
  const lion=scale('leao_solar'),a=scale('fera_caos'),b=scale('pantera_profundezas'),c=scale('lobo_eclipse')
  assert.ok(lion.damage<a.damage && a.damage<b.damage && b.damage<c.damage)
  assert.ok(a.crit<b.crit && b.crit<c.crit)
  close(a.damage,.1375)
  close(b.damage,.1425)
  close(c.damage,.15)
  close(c.crit,.1125)
})

test('Guardião e Sentinela têm especialidades diferentes e progressão defensiva',()=>{
  const a=scale('guardiao_caos'),b=scale('guardiao_abissal'),c=scale('sentinela_eclipse')
  close(a.defense,.1375)
  assert.ok(b.dodge>a.dodge && c.dodge>b.dodge)
  assert.ok(c.damage>0 && b.damage===0)
  assert.ok(c.defense>=b.defense)
})

test('Dragão da Raid 65 foca drop; Dragão da 70 foca dano e crítico',()=>{
  const dragon50=scale('dragao_corrompido'),dragon65=scale('dragao_trono'),dragon70=scale('dragao_solar_eclipse')
  close(dragon50.damage,.225)
  assert.ok(dragon65.drop>0 && dragon50.drop===0)
  assert.ok(dragon65.defense>0 && dragon70.defense===0)
  close(dragon70.damage,.15)
  close(dragon70.crit,.1375)
  assert.ok(dragon70.xp>0)
})

test('Fênix Eclipse cura mais que Fênix Celestial e mantém intervalo de 4 rodadas',()=>{
  const fenix40=scale('fenix_celestial'),fenix60=scale('fenix_caos'),fenix70=scale('fenix_eclipse')
  assert.ok(fenix60.heal>0 && fenix60.damage>0)
  assert.ok(fenix70.heal>fenix40.heal)
  close(fenix70.heal,.125)
  assert.equal(fenix70.cooldown,4)
  assert.equal(fenix40.cooldown,4)
})

test('Oráculo da Coroa supera Oráculo Alpha em drop sem superar sua XP',()=>{
  const old=scale('oraculo_alpha'),late=scale('oraculo_coroa')
  assert.ok(late.drop>old.drop)
  assert.ok(late.xp<old.xp)
  assert.ok(late.defense<old.defense)
})

test('Avatar da Raid 70 tem identidade ofensiva diferente da Fênix Alpha',()=>{
  const avatar=scale('avatar_primordial'),alpha=scale('fenix_alpha')
  assert.ok(avatar.damage>alpha.damage)
  assert.ok(avatar.crit>alpha.crit)
  assert.ok(avatar.drop<alpha.drop)
  assert.ok(avatar.defense<alpha.defense)
})

test('PvP mantém bônus reduzidos de pet, inclusive após os buffs',()=>{
  for(const species of [...pets60,...pets65,...pets70]){
    const a=petPvpSpecialty(species,100)
    assert.ok(a.damage<=.045+1e-9,species)
    assert.ok(a.crit<=.045+1e-9,species)
    assert.ok(a.defense<=.045+1e-9,species)
    assert.ok(a.dodge<=.05+1e-9,species)
  }
})

test('Pets de loja e Raids 1-50 preservam seus valores de referência',()=>{
  close(scale('dragao').damage,.10)
  close(scale('fenix_alpha').damage,.125)
  close(scale('fenix_alpha').defense,.125)
  close(scale('dragao_corrompido').damage,.225)
  close(scale('fenix_celestial').heal,.10)
  close(scale('leao_solar').damage,.125)
})
