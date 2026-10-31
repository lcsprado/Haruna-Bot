import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {formatProfileCombatBonuses} from '../src/neon/profile-combat-summary.js'
import {
  HERO_COMBAT_PROFILES,PLAYABLE_HERO_IDS,playableHero,heroCombatStats,
  heroHpToPersistent,persistHeroHpDelta,excludeActiveHeroPet,heroAttack,heroDefense,heroMasteryStage,heroCombatSheetFromProfile,heroCollabGearBonus,heroPvpAttack,heroPvpDefense,HERO_MASTERY_XP,HERO_MASTERY_COST,heroMasteryNext,raid75MasteryBonusActive,heroMasteryAwardPolicy,heroLevelAwardPolicy,HERO_LEVEL_DAILY_CAP,HERO_MASTERY_DAILY_CAP,HERO_START_LEVEL,heroStartingProgress
} from '../src/neon/playable-heroes-core.js'

test('sete personagens unicos com perfis equilibrados',()=>{
  assert.equal(PLAYABLE_HERO_IDS.length,7)
  assert.equal(new Set(PLAYABLE_HERO_IDS).size,7)
  for(const id of PLAYABLE_HERO_IDS){
    assert.ok(playableHero(id))
    assert.ok(HERO_COMBAT_PROFILES[id])
    assert.ok(HERO_COMBAT_PROFILES[id].atk<=25)
  }
})

test('estatisticas de classe viram heroi sem alterar dados persistentes',()=>{
  const st={hp:900,max_hp:1000,atk:650,def:540,spd:200,
    class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5}
  const original=structuredClone(st)
  const h=heroCombatStats(st,'pecado_escanor')
  assert.equal(h.atk,664)
  assert.equal(h.def,528)
  assert.equal(h.spd,202)
  assert.equal(h.maxHp,955)
  assert.ok(Math.abs(h.hp/h.maxHp-.9)<.001)
  assert.deepEqual(st,original)
  assert.equal(heroHpToPersistent(h.hp,h.maxHp,st.max_hp),st.hp)
  assert.equal(heroHpToPersistent(0,h.maxHp,st.max_hp),0)
})

test('HP nao se perde ao percorrer milhares de turnos sem dano',()=>{
  let hp=2109,heroHp=2101,rem=0;
  for(let i=0;i<5000;i++){
    const after=persistHeroHpDelta({
      previousPersistentHp:hp,previousCombatHp:heroHp,currentCombatHp:heroHp,
      combatMaxHp:2451,persistentMaxHp:2496,remainder:rem
    });
    hp=after.hp;
    rem=after.remainder;
  }
  assert.equal(hp,2109);
  assert.equal(rem,0);
});

test('HP fracionario acumula danos, cura, derrota e nunca gera vida gratuita',()=>{
  let pHp=900,cHp=859,rem=0;
  // 200 impactos de um HP viram ~209 de perda persistida, em vez de 0 ou 200
  for(let i=0;i<200;i++){
    const next=persistHeroHpDelta({previousPersistentHp:pHp,previousCombatHp:cHp,
      currentCombatHp:cHp-1,combatMaxHp:955,persistentMaxHp:1000,remainder:rem});
    pHp=next.hp;cHp--;rem=next.remainder;
  }
  assert.ok(pHp>=690&&pHp<=692,'danos devem acompanhar a escala, sem erosao adicional');
  const restored=persistHeroHpDelta({previousPersistentHp:pHp,previousCombatHp:cHp,
    currentCombatHp:cHp+150,combatMaxHp:955,persistentMaxHp:1000,remainder:rem});
  assert.ok(restored.hp<=849);
  const barelyAlive=persistHeroHpDelta({previousPersistentHp:1,previousCombatHp:2,
    currentCombatHp:1,combatMaxHp:955,persistentMaxHp:1000});
  assert.equal(barelyAlive.hp,1,'um herói vivo não deve virar personagem morto no banco');
  const defeated=persistHeroHpDelta({previousPersistentHp:100,previousCombatHp:100,
    currentCombatHp:0,combatMaxHp:955,persistentMaxHp:1000});
  assert.equal(defeated.hp,0);
});

test('heroi nunca e contabilizado como pet e nao ativa trio falso',()=>{
  const squad=[
    {species:'pecado_escanor',slot:1},
    {species:'pecado_meliodas',slot:2},
    {species:'pecado_ban',slot:3}
  ]
  const filtered=excludeActiveHeroPet(squad,'pecado_escanor')
  assert.equal(filtered.length,0)
  assert.deepEqual(squad.map(p=>p.species),['pecado_escanor','pecado_meliodas','pecado_ban'])
  assert.equal(excludeActiveHeroPet(squad,null).length,0)
  assert.deepEqual(excludeActiveHeroPet([...squad,{species:'fenix_celestial',slot:4}],null).map(p=>p.species),['fenix_celestial'])
})

test('skills automaticas sao finitas e limitadas em Raid e Boss',()=>{
  for(const id of PLAYABLE_HERO_IDS){
    let state={}
    for(let index=1;index<=100;index++){
      const hit=heroAttack({heroId:id,damage:1000,hp:800,maxHp:1000,attackIndex:index,state,context:'boss',masteryStage:5})
      assert.ok(Number.isFinite(hit.damage) && hit.damage>=1 && hit.damage<=1300,id)
      assert.ok(hit.heal>=0&&hit.allyHeal>=0,id)
      const def=heroDefense({heroId:id,damage:1000,state:hit.state})
      assert.ok(def.damage>=700&&def.damage<=1000,id)
      state=def.state
    }
  }
})

test('herois possuem identidades mecanicas diferentes',()=>{
  assert.ok(heroAttack({heroId:'pecado_escanor',damage:1000,hp:100,maxHp:1000,attackIndex:25,masteryStage:5}).damage>1000)
  assert.ok(heroAttack({heroId:'pecado_ban',damage:1000,maxHp:2000,attackIndex:8,masteryStage:5}).heal>0)
  assert.ok(heroAttack({heroId:'pecado_king',damage:1000,maxHp:2000,attackIndex:8,masteryStage:5}).allyHeal>0)
  assert.ok(heroDefense({heroId:'pecado_diane',damage:1000,state:{guardCharges:1}}).damage<950)
  assert.ok(heroDefense({heroId:'pecado_merlin',damage:1000,state:{cubeCharges:1}}).damage<900)
  assert.equal(heroMasteryStage(0),1)
  assert.equal(heroMasteryStage(1300),2)
  assert.equal(heroMasteryStage(7000),5)
})

test('maestria libera habilidades no estagio correto, sem bonus prematuro',()=>{
  const first=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:8,masteryStage:1});
  const skilled=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:8,masteryStage:2});
  const ultimate=heroAttack({heroId:'pecado_escanor',damage:1000,hp:500,maxHp:1000,attackIndex:25,masteryStage:3});
  assert.equal(first.damage,1000);
  assert.ok(skilled.damage>first.damage);
  assert.ok(ultimate.damage>first.damage);
  assert.equal(heroHpToPersistent(1,1200,1000),1);
})

test('integracao protege classe, pet, modo e progresso',()=>{
  const db=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8')
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8')
  const whatsapp=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8')
  const api=readFileSync(new URL('../src/neon/web-api.js',import.meta.url),'utf8')
  assert.ok(db.includes('FROM pet_collection WHERE jid=$1 AND species=$2'))
  assert.ok(!db.includes('DELETE FROM pet_collection'))
  assert.ok(!db.includes('DELETE FROM pet_team'))
  assert.ok(db.includes('hero_mastery_awards'))
  assert.ok(db.includes('Você está em combate ativo'))
  assert.ok(games.includes('heroAttack({heroId:p.heroId'))
  assert.ok(games.includes('heroDefense({heroId:p.heroId'))
  assert.ok(games.includes('persistHeroHpDelta({'))
  assert.ok(games.includes('heroHpRemainder'))
  assert.ok(games.includes('excludeActiveHeroPet(combatSnapshot?.team_pets||[],heroId)'))
  assert.equal(games.split('if(heroId&&!combatPet&&reservePet)').length-1,2)
  assert.ok(games.includes('primary.species!==p.heroId'))
  assert.ok(games.includes('if(usePet&&heroId&&!petRow&&activePetSlot===1)'))
  assert.ok(games.includes('awardPlayableHeroMastery(c'))
  assert.ok(whatsapp.includes('await initPlayableHeroes()'))
  assert.ok(whatsapp.includes('handlePlayableHeroCommand({cmd,args,sender,reply})'))
  assert.ok(api.includes("case 'hero.select'"))
  assert.ok(api.includes("case 'hero.class'"))
})

test('Meliodas: Hellblaze, Full Counter de energia e Revenge Counter',()=>{
  const pre=heroAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:8,masteryStage:1});
  const armed=heroAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:8,masteryStage:2});
  assert.equal(pre.state.fullCounterReady,undefined);
  assert.equal(armed.state.fullCounterReady,true);
  const block=heroDefense({heroId:'pecado_meliodas',damage:300,state:armed.state});
  assert.ok(block.state.counterStored>0);
  const reply=heroAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:9,masteryStage:2,state:block.state});
  assert.equal(reply.technique,'Full Counter');
  assert.ok(reply.damage>pre.damage);
  assert.equal(reply.state.counterStored,0);
  const revenge=heroAttack({heroId:'pecado_meliodas',damage:1000,attackIndex:25,masteryStage:3,state:{revengeStored:80},context:'boss'});
  assert.equal(revenge.technique,'Revenge Counter');
  assert.ok(revenge.damage>1000&&revenge.damage<=1300);
});

test('Ban: Snatch rouba força em golpes limitados e Hunter Fest cura',()=>{
  const armed=heroAttack({heroId:'pecado_ban',damage:1000,maxHp:2000,attackIndex:8,masteryStage:2});
  assert.equal(armed.state.snatchCharges,3);
  let state=armed.state;
  for(let i=0;i<3;i++){
    const def=heroDefense({heroId:'pecado_ban',damage:1000,state});
    assert.equal(def.damage,880);
    state=def.state;
  }
  assert.equal(heroDefense({heroId:'pecado_ban',damage:1000,state}).damage,980);
  const fest=heroAttack({heroId:'pecado_ban',damage:1000,maxHp:2000,attackIndex:25,masteryStage:3});
  assert.equal(fest.technique,'Hunter Fest');
  assert.equal(fest.heal,100);
});

test('Escanor: Sunshine depende do sol e The One dura tres golpes',()=>{
  const noon=Date.parse('2026-10-27T12:00:00-03:00');
  const night=Date.parse('2026-10-27T22:00:00-03:00');
  const day=heroAttack({heroId:'pecado_escanor',damage:1000,hp:950,maxHp:1000,attackIndex:1,masteryStage:1,nowMs:noon});
  const dark=heroAttack({heroId:'pecado_escanor',damage:1000,hp:950,maxHp:1000,attackIndex:1,masteryStage:1,nowMs:night});
  assert.ok(day.damage>dark.damage);
  const activated=heroAttack({heroId:'pecado_escanor',damage:1000,attackIndex:25,masteryStage:3,nowMs:night});
  let state=activated.state;
  assert.equal(activated.technique,'The One');
  for(const index of [26,27]){
    const hit=heroAttack({heroId:'pecado_escanor',damage:1000,attackIndex:index,state,masteryStage:3,nowMs:night});
    assert.ok(hit.damage>1000);
    state=hit.state;
  }
  assert.equal(heroAttack({heroId:'pecado_escanor',damage:1000,attackIndex:28,state,masteryStage:3,nowMs:night}).damage,1000);
});

test('Diane Heavy Metal, King Guardian, Merlin Perfect Cube e Gowther Invasion',()=>{
  const d=heroAttack({heroId:'pecado_diane',damage:1000,attackIndex:25,masteryStage:3});
  assert.equal(d.technique,'Mother Catastrophe');
  assert.equal(heroDefense({heroId:'pecado_diane',damage:1000,state:d.state}).damage,760);
  const k=heroAttack({heroId:'pecado_king',damage:1000,maxHp:2000,attackIndex:8,masteryStage:2});
  assert.ok(k.allyHeal>0);
  assert.equal(heroDefense({heroId:'pecado_king',damage:1000,state:k.state}).damage,850);
  const m=heroAttack({heroId:'pecado_merlin',damage:1000,attackIndex:25,masteryStage:3});
  assert.equal(m.technique,'Perfect Cube');
  assert.equal(heroDefense({heroId:'pecado_merlin',damage:1000,state:m.state}).damage,800);
  const g=heroAttack({heroId:'pecado_gowther',damage:1000,attackIndex:8,masteryStage:2});
  assert.equal(g.technique,'Rewrite Light');
  assert.equal(heroDefense({heroId:'pecado_gowther',damage:1000,state:g.state}).damage,890);
});

test('WhatsApp explica os poderes sem cobrar XP ou trocar de heroi para consultar',()=>{
  const ui=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(ui,/\['habilidades','poderes','skills'\]/);
  assert.match(ui,/HERO_SKILL_GUIDE\[hero\.species\]/);
  assert.match(ui,/!heroi habilidades ban/);
  assert.ok(ui.indexOf("if(['habilidades','poderes','skills']")<ui.indexOf("const saved=await setPlayableHeroMode(sender,hero.species)"));
});

test('papeis de ataque e alcance dos sete Pecados sao distintos, sem alterar HP e XP',()=>{
  const expected={
    pecado_meliodas:'Corpo a corpo',
    pecado_ban:'Corpo a corpo',
    pecado_escanor:'Corpo a corpo',
    pecado_diane:'Corpo a corpo',
    pecado_king:'Longa distância',
    pecado_gowther:'Longa distância',
    pecado_merlin:'Longa distância'
  };
  for(const [id,range] of Object.entries(expected)){
    assert.equal(HERO_COMBAT_PROFILES[id].range,range,id);
    assert.ok(HERO_COMBAT_PROFILES[id].role,'Papel ausente: '+id);
    assert.ok(HERO_COMBAT_PROFILES[id].skill,'Técnica ausente: '+id);
  }
  const view=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(view,/HERO_COMBAT_PROFILES\[hero\.species\]\.range/);
  assert.match(view,/HERO_COMBAT_PROFILES\[h\.id\]\.range/);
});

test('Revenge Counter, Sunflower e Exterminate deixam dois golpes residuais',()=>{
  for(const [id,attack,level] of [
    ['pecado_meliodas',25,3],
    ['pecado_king',25,3],
    ['pecado_merlin',8,2]
  ]){
    let hit=heroAttack({heroId:id,damage:1000,attackIndex:attack,masteryStage:level});
    let state=hit.state;
    for(let j=1;j<=2;j++){
      const next=heroAttack({heroId:id,damage:1000,attackIndex:attack+j,masteryStage:level,state});
      assert.ok(next.damage>=1000,id+': ataque residual '+j);
      state=next.state;
    }
  }
});

test('ficha do herói usa mesmos atributos de entrada da Raid, sem alterar o Paladino',()=>{
  const original={
    hp:900,max_hp:1000,atk:650,def:540,spd:200,
    class_hp_bonus:130,class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5,
    equipment_hp:200,equipment_atk:400,equipment_def:200,equipment_spd:60,
    attack_pct_bonus:0.05
  };
  const frozen=structuredClone(original);
  // A vida de combate inclui o HP de equipamento na mesma proporção da cura.
  const ban=heroCombatSheetFromProfile(original,'pecado_ban');
  assert.deepEqual({hp:ban.hp,maxHp:ban.maxHp,atk:ban.atk,def:ban.def,spd:ban.spd},
    {hp:878,maxHp:1170,atk:1110,def:729,spd:270});
  assert.equal(ban.name,'Ban');
  assert.deepEqual(original,frozen,'Leitura da ficha não deve alterar HP ou atributos');
  assert.equal(heroCombatSheetFromProfile(original,'pecado_inexistente'),null);
});

test('perfil, status e comando de herói devem distinguir classe da ficha do combatente',()=>{
  const ui=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  const hero=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(ui,/const heroSheet=await getPlayableHeroCombatSheet\(jid,p\)/);
  assert.match(ui,/const heroSheetStatus=await getPlayableHeroCombatSheet\(statusTarget,p\)/);
  assert.match(ui,/formatPlayableHeroCombatSheet\(heroSheet\)/);
  assert.match(ui,/formatPlayableHeroCombatSheet\(heroSheetStatus\)/);
  const profileStart=ui.indexOf('👤 *PERFIL —');
  const profileEnd=ui.indexOf('await sock.sendMessage(chat,{text}',profileStart);
  const profile=ui.slice(profileStart,profileEnd);
  const statusStart=ui.indexOf('⚔️ *STATUS RPG —');
  const status=ui.slice(statusStart,ui.indexOf('🏆 Vitórias:',statusStart));
  assert.ok(profileStart>=0&&profileEnd>profileStart);
  assert.ok(statusStart>=0);
  assert.match(profile,/heroSheet\?formatPlayableHeroCombatSheet\(heroSheet\):`🧙 Classe:/);
  assert.match(profile,/⚜️ Passiva:/);
  assert.doesNotMatch(profile,/Classe original|Passiva da classe original|guardada|inativa em PvP/);
  assert.match(status,/heroSheetStatus\?formatPlayableHeroCombatSheet\(heroSheetStatus\):`🧙 Classe:/);
  assert.doesNotMatch(status,/Classe original guardada/);
  assert.doesNotMatch(ui,/preservada; ativa no PvP/);
  assert.match(ui,/!heroi atributos|formatPlayableHeroCombatSheet/);
  assert.match(hero,/\['atributos','ficha','stats','status'\]/);
  assert.match(hero,/BÔNUS EXCLUSIVO DA COLLAB/);
  assert.match(hero,/os atributos normais do equipamento já estão somados/);
});

test('Maestria cara: XP acumulado, desbloqueio pago e limite diario',()=>{
  assert.deepEqual(HERO_MASTERY_XP,[0,500,1500,3500,7000]);
  assert.deepEqual(HERO_MASTERY_COST,[0,2000000,5000000,12000000,25000000]);
  assert.deepEqual(heroMasteryNext(1),{stage:2,xp:500,cost:2000000});
  assert.equal(heroMasteryNext(5),null);
  const src=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(src,/player_hero_mastery_unlocks/);
  assert.match(src,/heroMasteryAwardPolicy\(/);
  assert.match(src,/regular_gained/);
  assert.match(src,/SUM\(xp\) FILTER/);
  assert.match(src,/LEAST\(7000,player_hero_mastery\.xp\+EXCLUDED\.xp\)/);
  assert.match(src,/SELECT cash,bank FROM wallets WHERE jid=\$1 FOR UPDATE/);
  assert.match(src,/if\(xp<next\.xp\)throw/);
  assert.match(src,/evolvePlayableHeroMastery\(sender,selected\.species\)/);
  assert.ok(src.indexOf('UPDATE wallets SET cash=cash-$1,bank=bank-$2')>src.indexOf('if(xp<next.xp)throw'));
});

test('Equipamento sagrado corresponde exatamente a cada Pecado',()=>{
  const catalog=[
    ['pecado_meliodas','pecados_lostvayne','pecados_armadura_meliodas'],
    ['pecado_ban','pecados_courechouse','pecados_armadura_ban'],
    ['pecado_escanor','pecados_rhitta','pecados_armadura_escanor'],
    ['pecado_king','pecados_chastiefol','pecados_armadura_king'],
    ['pecado_diane','pecados_gideon','pecados_armadura_diane'],
    ['pecado_gowther','pecados_herritt','pecados_armadura_gowther'],
    ['pecado_merlin','pecados_aldan','pecados_armadura_merlin']
  ];
  for(const [hero,weapon,armor] of catalog){
    const full=heroCollabGearBonus(hero,weapon,armor,'raid');
    assert.equal(full.weapon,true,hero);assert.equal(full.armor,true,hero);
    assert.equal(full.attack,.04);assert.equal(full.defense,.04);
    const pvp=heroCollabGearBonus(hero,weapon,armor,'pvp');
    assert.equal(pvp.attack,.015);assert.equal(pvp.defense,.02);
    const wrong=heroCollabGearBonus(hero,weapon==='pecados_lostvayne'?'pecados_rhitta':'pecados_lostvayne',
      armor==='pecados_armadura_merlin'?'pecados_armadura_ban':'pecados_armadura_merlin','pvp');
    assert.equal(wrong.attack,0);assert.equal(wrong.defense,0);
    assert.equal(heroCollabGearBonus(null,weapon,armor,'raid').attack,0);
  }
});

test('PvP de herois da collab tem teto ofensivo, defensivo, cura e suprema',()=>{
  for(const heroId of PLAYABLE_HERO_IDS){
    let state={},heal=0;
    for(let index=1;index<=20;index++){
      const atk=heroPvpAttack({heroId,damage:1000,hp:800,maxHp:1000,attackIndex:index,masteryStage:5,state,gear:{attack:.015,defense:.02,heal:.005}});
      assert.ok(atk.damage<=1080&&atk.damage>=1000,heroId+' PvP damage '+index);
      heal+=atk.heal;
      const defense=heroPvpDefense({heroId,damage:1000,state:atk.state,gear:{attack:.015,defense:.02,heal:.005}});
      assert.ok(defense.damage>=900&&defense.damage<=1000,heroId+' PvP defense '+index);
      state=defense.state;
    }
    assert.ok(heal<=20,heroId+' max heal');
    assert.equal(state.ultimateUsed,true,heroId+' one supreme');
  }
});

test('PvP preserva classAttack para nao-collab e normaliza HP dos herois',()=>{
  const db=readFileSync(new URL('../src/neon/db.js',import.meta.url),'utf8');
  const pvp=db.slice(db.indexOf('export async function battle('),db.indexOf('export async function combatLeaderboard('));
  assert.match(pvp,/heroPvpAttack\(\{heroId:from\.heroId/);
  assert.match(pvp,/heroPvpDefense\(\{heroId:to\.heroId/);
  assert.match(pvp,/classAttack\(\{\.\.\.attackArgs/);
  assert.match(pvp,/classDefense\(\{classId:to\.classId/);
  assert.match(pvp,/Boolean\(a\.class_applied\)&&!aHero/);
  assert.match(pvp,/heroHpToPersistent\(fighter\.hp,fighter\.maxHp,fighter\.heroPersistentMaxHp\)/);
  assert.match(pvp,/loser\.heroId\?loser\.heroPersistentMaxHp:loser\.maxHp/);
  assert.match(db,/pergaminho_reclassificacao/);
});

test('Bonus da collab aplicado em Boss e Raid, sem alterar concessao de XP',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(games,/heroCollabGearBonus\(heroId,st\.weapon_id,st\.armor_id,'raid'\)/);
  assert.match(games,/heroCollabGearBonus\(heroId,st\.weapon_id,st\.armor_id,'boss'\)/);
  assert.match(games,/masteryStage:p\.heroMasteryStage,gear:p\.heroGear/);
  assert.match(games,/masteryStage:heroMasteryStage,gear:heroGear/);
  assert.equal(games.split('awardPlayableHeroMastery(c,').length-1,2);
});

test('Raid 75 dos Pecados: XP em dobro apenas na semana, nunca em Raid comum',()=>{
  const at=t=>Date.parse(t);
  assert.equal(raid75MasteryBonusActive({level:75,collab:true,nowMs:at('2026-10-25T23:59:59-03:00')}),false);
  assert.equal(raid75MasteryBonusActive({level:75,collab:true,nowMs:at('2026-10-26T00:00:00-03:00')}),true);
  assert.equal(raid75MasteryBonusActive({level:75,collab:true,nowMs:at('2026-11-01T23:59:59-03:00')}),true);
  assert.equal(raid75MasteryBonusActive({level:75,collab:true,nowMs:at('2026-11-02T00:00:00-03:00')}),false);
  assert.equal(raid75MasteryBonusActive({level:70,collab:true,nowMs:at('2026-10-28T12:00:00-03:00')}),false);
  assert.equal(raid75MasteryBonusActive({level:75,collab:false,nowMs:at('2026-10-28T12:00:00-03:00')}),false);
});
test('Maestria acelerada com 400 por dia e 600 na Raid 75',()=>{
  const q=heroMasteryAwardPolicy;
  assert.equal(HERO_MASTERY_DAILY_CAP,400);
  assert.deepEqual(q({specialRaid75:true,earnedToday:0,regularEarnedToday:0,xp:120}),
    {special:true,dailyCap:600,amount:120});
  assert.equal(q({specialRaid75:true,earnedToday:570,regularEarnedToday:400,xp:120}).amount,30);
  assert.equal(q({specialRaid75:true,earnedToday:600,regularEarnedToday:400,xp:120}).amount,0);
  assert.equal(q({specialRaid75:false,earnedToday:310,regularEarnedToday:310,xp:90}).amount,90);
  assert.equal(q({specialRaid75:false,earnedToday:370,regularEarnedToday:370,xp:90}).amount,30);
  assert.equal(q({specialRaid75:false,earnedToday:400,regularEarnedToday:400,xp:90}).amount,0);
  assert.equal(q({specialRaid75:false,earnedToday:500,regularEarnedToday:300,xp:90}).amount,90);
  assert.equal(q({specialRaid75:false,earnedToday:600,regularEarnedToday:300,xp:90}).amount,0);
});
test('Novo personagem: nivel 1 ao 100 em 18 dias no teto, sem ultrapassar 9900 XP',()=>{
  const q=heroLevelAwardPolicy;
  assert.equal(HERO_LEVEL_DAILY_CAP,550);
  assert.equal(HERO_START_LEVEL,1);
  assert.deepEqual(heroStartingProgress(),{level:1,xp:0});
  assert.deepEqual(q({earnedToday:0,currentXp:0,xp:125}),{dailyCap:550,amount:125});
  assert.equal(q({earnedToday:530,currentXp:0,xp:125}).amount,20);
  assert.equal(q({earnedToday:550,currentXp:0,xp:125}).amount,0);
  assert.equal(q({earnedToday:0,currentXp:9895,xp:125}).amount,5);
  assert.equal(q({earnedToday:0,currentXp:9900,xp:125}).amount,0);
  assert.equal(Math.ceil((9900-0)/550),18);
  assert.equal(Math.ceil(7000/400),18);
  const st={hp:900,max_hp:1000,atk:650,def:540,spd:200,class_hp_bonus:130,
    class_atk_bonus:7,class_def_bonus:22,class_spd_bonus:5};
  const initial=heroCombatStats(st,'pecado_ban',1);
  const low=heroCombatStats(st,'pecado_ban',70);
  assert.ok(initial.maxHp<low.maxHp && initial.atk<low.atk,'Lv.1 deve evoluir sem herdar o poder de Lv.70');
  assert.ok(initial.def<low.def && initial.spd<low.spd);
  const high=heroCombatStats(st,'pecado_ban',100);
  assert.deepEqual([high.maxHp-low.maxHp,high.atk-low.atk,high.def-low.def,high.spd-low.spd],[60,15,10,6]);
  const src=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  assert.match(src,/hero_level_awards/);
  assert.ok(src.includes('return Math.max(1,Math.min(100,Number(rows[0]?.level||1)))'));
  const collab=readFileSync(new URL('../src/neon/sete-pecados-collab.js',import.meta.url),'utf8');
  assert.match(collab,/const \{level,xp\}=heroStartingProgress\(\)/);
  assert.match(collab,/if\(duplicate&&category==='personagem'\)/);
  assert.match(collab,/INSERT INTO pet_collection\(jid,species,name,level,xp/);
  assert.doesNotMatch(collab,/UPDATE pet_collection SET level=1/);
  assert.match(src,/ON CONFLICT\(jid,award_key\) DO NOTHING/);
  assert.match(src,/UPDATE pet_collection SET xp=\$1,level=\$2 WHERE id=\$3 AND jid=\$4/);
  assert.equal(games.split('awardPlayableHeroLevel(c,').length-1,2);
  assert.match(games,/awardKey,xp:115/);
  assert.match(games,/xp:specialRaid75Mastery\?180:125/);
});
test('Creditar Raid 75 somente após vitória elegível, sem reduzir chaves ou recompensas',()=>{
  const games=readFileSync(new URL('../src/neon/games.js',import.meta.url),'utf8');
  const heroes=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(games,/raid75MasteryBonusActive\(\{level:cfg\.level,collab:cfg\.collab,nowMs:now\}\)/);
  assert.match(games,/p\.heroId&&share>=\.02&&Number\(p\.damage\|\|0\)>=2500/);
  assert.match(games,/specialRaid75:specialRaid75Mastery/);
  assert.match(games,/specialRaid75Mastery\?'raid:75:':'raid:'/);
  assert.match(heroes,/String\(awardKey\)\.startsWith\('raid:75:'\)/);
  assert.match(heroes,/if\(!amount\)return false/);
  assert.match(heroes,/SELECT jid FROM users WHERE jid=\$1 FOR UPDATE/);
});
test('Ficha do herói passa a indicar arma correspondente e armadura com bônus de collab',()=>{
  const h=readFileSync(new URL('../src/neon/playable-heroes.js',import.meta.url),'utf8');
  assert.match(h,/heroCollabGearBonus\(heroId,profile\.weapon_id,profile\.armor_id,'pvp'\)/);
  assert.match(h,/BÔNUS EXCLUSIVO DA COLLAB/);
  assert.match(h,/Arma do personagem/);
  assert.match(h,/Armadura do personagem/);
  const d=heroDefense({heroId:'pecado_diane',damage:1000,gear:{defense:.04}});
  assert.equal(d.damage,920,'defesa de Heavy Metal deve acumular com armadura de Diane');
});


test('resumo de combate compacto mantém dano PvE separado do PvP e não repete zeros',()=>{
  const text=formatProfileCombatBonuses({
    raidDamagePct:32.8,bossDamagePct:32.8,
    raidCritPct:49,bossCritPct:45,pvpCritPct:36.9,
    petDamagePct:23.7,petPvp:{damage:0,defense:0,dodge:0,healPct:0},
    teamSpeed:8,petSpeed:0,
    enchantParts:['💥 +2 p.p. dano','🛡️ +5 DEF','👢 +2 VEL'],hasEnchantedDamage:true
  });
  assert.match(text,/Dano Boss\/Raid: \*\+32,8%\*/);
  assert.match(text,/CRIT: PvP \*36,9%\* • Boss \*45%\* • Raid \*49%\*/);
  assert.match(text,/Pets no Boss\/Raid: \*\+23,7% dano\* \(já incluído acima\)/);
  assert.match(text,/Encantamentos: 💥 \+2 p\.p\. dano • 🛡️ \+5 DEF • 👢 \+2 VEL/);
  assert.match(text,/sinergia \+8/);
  assert.doesNotMatch(text,/Pet no PvP|Dano extra Raid|Dano extra Boss|0% esquiva|\+0% dano/);
  assert.equal(text.split('Dano Boss/Raid').length-1,1);
});
test('resumo separa Boss e Raid quando taxas reais diferem, mesmo que arredondamento seja igual',()=>{
  const text=formatProfileCombatBonuses({raidDamagePct:32.800001,bossDamagePct:32.8,pvpCritPct:30,raidCritPct:45,bossCritPct:40});
  assert.match(text,/Dano Boss: \*\+32,8%\*/);
  assert.match(text,/Dano Raid: \*\+32,8%\*/);
  assert.doesNotMatch(text,/Dano Boss\/Raid/);
});
test('resumo de combate preserva efeitos exclusivos de pet PvP sem injetar dano PvE',()=>{
  const text=formatProfileCombatBonuses({
    raidDamagePct:28,bossDamagePct:31,petDamagePct:22,
    petPvp:{damage:.012,defense:.009,dodge:.03,healPct:.04,healCooldown:5},
    petSpeed:3,teamSpeed:8
  });
  assert.match(text,/Dano Boss: \*\+31%\*/);
  assert.match(text,/Dano Raid: \*\+28%\*/);
  assert.match(text,/Pets no Boss\/Raid: \*\+22% dano\*/);
  assert.match(text,/Pet no PvP: 💥 \+1,2% dano • 🛡️ -0,9% recebido • 🌀 3% esquiva • 💚 4% HP a cada 5 ataques/);
  assert.match(text,/VEL: pet \+3 • sinergia \+8/);
});
test('resumo preserva aviso de pet indisponível e o efeito condicional da classe',()=>{
  const text=formatProfileCombatBonuses({
    raidDamagePct:5,bossDamagePct:6,petStatus:'sem HP',
    recoveredRaidDamagePct:22,recoveredBossDamagePct:21,
    reserveActive:true,classEffect:'⚜️ Julgamento Divino: efeito condicional'
  });
  assert.match(text,/bônus suspensos. Após recuperação: Boss \*\+21%\* • Raid \*\+22%\*/);
  assert.match(text,/Reserva apta contribuindo/);
  assert.match(text,/Julgamento Divino/);
});
test('!perfil utiliza somente o formatador visual; !status e combate não são afetados',()=>{
  const ui=readFileSync(new URL('../src/neon/index.js',import.meta.url),'utf8');
  assert.match(ui,/import \{formatProfileCombatBonuses\} from '\.\/profile-combat-summary\.js'/);
  assert.match(ui,/const bonusSummary=formatProfileCombatBonuses\(\{/);
  assert.doesNotMatch(ui,/CONTRIBUIÇÃO DO PET NO PVP|DANO EXTRA RAID|DANO EXTRA BOSS/);
});
