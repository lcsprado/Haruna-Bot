// Invasão dos Mimics — edição única, 24/10/2026. 15h–17h BRT.
// Tudo por comando, sem polling, sem dano, sem cobrança, sem combate automático.
// Cada caçada e premiação é uma transação atômica por usuário.
import {randomInt} from 'node:crypto'
import {db,ensureUser,grantExpInTransaction,listGroupLicenses,groupLicenseIsActive,getGroupLicense} from './db.js'
export const MIMIC_EVENT={
 id:'mimic_legendario_20261024_v1',
 startsAt:Date.parse('2026-10-24T15:00:00-03:00'),
 endsAt:Date.parse('2026-10-24T17:00:00-03:00'),
 cooldownMs:120000,maxHunts:60,
 maxCash:1790000,
 rankCash:[300000,200000,100000],
 milestones:[
  {hunts:10,cash:100000,box:'caixa_rara',qty:2,label:'🎯 10 caçadas'},
  {hunts:20,cash:200000,box:'caixa_epica',qty:2,label:'⚔️ 20 caçadas'},
  {hunts:30,cash:0,box:'insignia_cacador_mimics_20261024',qty:1,label:'🏅 30 caçadas'},
  {hunts:45,cash:0,box:'caixa_lendaria',qty:1,label:'🌟 45 caçadas'},
  {hunts:60,cash:350000,box:'titulo_mimics_supremo_20261024',qty:1,label:'👑 60 caçadas'}
 ]
}
const FMT=n=>Number(n||0).toLocaleString('pt-BR')
const prettyName=v=>String(v||'Caçador').replace(/[\r\n*_~]/g,' ').replace(/\s+/g,' ').trim().slice(0,40)||'Caçador'
const remaining=ms=>Math.max(0,Math.ceil(ms/1000))
const TITLES=[
 ['insignia_cacador_mimics_20261024','👹 Insígnia Caçador Lendário','Conquiste 30 caçadas para equipar em !reliquias: +2% dano Raid/Boss (sem PvP).'],
 ['titulo_mimics_supremo_20261024','👑 Caçador Supremo dos Mimics','Título cosmético de prestígio exclusivo das 60 caçadas de 24/10/2026.'],
 ['insignia_rei_mimics_20261024','👑 Insígnia Rei dos Mimics','Campeão global: +5% dano Raid/Boss, +2 p.p. CRIT Boss (sem PvP).'],
 ['insignia_mestre_mimics_20261024','🥈 Insígnia Mestre dos Mimics','Vice-campeão global: +4% dano Raid/Boss, +1 p.p. CRIT Boss (sem PvP).'],
 ['insignia_senhor_baus_mimics_20261024','🥉 Insígnia Senhor dos Baús','Terceiro colocado global: +3% dano Raid/Boss (sem PvP).'],
 ['titulo_mimic_campiao_20261024','👑 Rei dos Mimics','Título cosmético do primeiro colocado no ranking global da edição de 24/10/2026.'],
 ['titulo_mimic_vice_20261024','🥈 Mestre dos Mimics','Título cosmético do segundo colocado na edição de 24/10/2026.'],
 ['titulo_mimic_terceiro_20261024','🥉 Senhor dos Baús','Título cosmético do terceiro colocado na edição de 24/10/2026.']
]
const INTRO='👹💰 *INVASÃO DOS MIMICS — CAÇADA LENDÁRIA!*\n'
 +'━━━━━━━━━━━━━━━━━━\n'
 +'⏰ *HOJE, 15h–17h* (Brasília)\n'
 +'🕹️ *!m* — cace a cada 2 minutos (máx. 60).\n'
 +'💰 *R$ 6–14 mil* e *100–250 XP* por caça.\n'
 +'🎁 10: R$ 100 mil + 2 Caixas Raras\n'
 +'🟣 20: R$ 200 mil + 2 Caixas Épicas\n'
 +'⚜️ 30: Insígnia Caçador Lendário *+2% dano Boss/Raid*\n'
 +'🌟 45: 1 Caixa Lendária garantida\n'
 +'👑 60: R$ 350 mil + título Caçador Supremo\n'
 +'🧩 Drops maiores: Comum 5 • Raro 8 • Épico 14 • Dourado 30 fragmentos.\n'
 +'🎲 Mimic Dourado ainda pode sortear Caixa Lendária extra (1 por jogador).\n'
 +'📦 Troque 10 fragmentos por Caixa Rara ou 25 por Caixa Épica (máx. 2 de cada).\n'
 +'🏆 Ranking global: R$ 300 mil / 200 mil / 100 mil + insígnias exclusivas.\n'
 +'⚔️ Apenas 1 insígnia equipada via *!reliquias*; sem PvP.\n'
 +'📊 *!m status* • *!m ranking* • *!m trocar epica*\n'
 +'━━━━━━━━━━━━━━━━━━\n'
 +'🌐 Todos os grupos competem no mesmo ranking.'
const UPDATE='👹⚡ *MIMICS — PRÊMIOS ATUALIZADOS!*\n'
 +'━━━━━━━━━━━━━━━━━━\n'
 +'⏰ *MANTIDO ATÉ ÀS 17h* (Brasília).\n'
 +'⚔️ *!m* a cada 2 minutos, limite 60.\n'
 +'🧩 Fragmentos por Mimic: 🟤 *5* • 🔵 *8* • 🟣 *14* • 🌟 *30*.\n'
 +'✅ As caçadas anteriores recebem a diferença de fragmentos, sem perder recompensas.\n'
 +'🎁 *10 caçadas*: R$ 100 mil + 2 Raras\n'
 +'🟣 *20 caçadas*: R$ 200 mil + 2 Épicas\n'
 +'⚜️ *30 caçadas*: Insígnia Caçador Lendário *+2% Boss/Raid*\n'
 +'🌟 *45 caçadas*: 1 Caixa Lendária garantida\n'
 +'👑 *60 caçadas*: R$ 350 mil + título exclusivo de prestígio\n'
 +'🏆 Ranking global: prêmios em dinheiro + insígnias de até *+5% dano Boss/Raid*.\n'
 +'📦 Trocas: *!m trocar epica* (25 fragments) • *!m trocar rara* (10 fragments).\n'
 +'⚙️ Insígnias equipáveis em *!reliquias*, uma por vez, sem PvP.\n'
 +'━━━━━━━━━━━━━━━━━━\n'
 +'✅ Caçadas e inventários já existentes preservados.'
const END='🏁👹 *INVASÃO DOS MIMICS — ENCERRADA!*\n'
 +'⏰ A caçada terminou às *17h* (Brasília).\n'
 +'🎁 Ranking global liquidado; prêmio das metas creditado ao longo do evento.\n'
 +'⚜️ Equipe sua insígnia conquistada usando *!reliquias*.\n'
 +'⚔️ Próximo evento: Caçada de Sábado das 19h às 21h (+50% XP nas Raids 50/60/65/70).'
const BOUND='━━━━━━━━━━━━━━━━━━'
let initPromise=null,timers=[],closing=false
export function mimicOutcome(roll){
 const r=Number(roll)
 if(!Number.isInteger(r)||r<0||r>9999)throw Error('Sorteio inválido')
 if(r<200)return {kind:'dourado',label:'🌟 MIMIC DOURADO',points:100,fragments:30}
 if(r<1000)return {kind:'epico',label:'🟣 MIMIC ÉPICO',points:45,fragments:14}
 if(r<3200)return {kind:'raro',label:'🔵 MIMIC RARO',points:20,fragments:8}
 return {kind:'comum',label:'🟤 MIMIC COMUM',points:10,fragments:5}
}
export async function initMimic(){
 if(!initPromise)initPromise=(async()=>{
  await db.query(`
   CREATE TABLE IF NOT EXISTS mimic_hunt_sessions (
     event_key TEXT NOT NULL,
     jid TEXT NOT NULL,
     state JSONB NOT NULL,
     updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
     PRIMARY KEY(event_key,jid)
   )`)
  await db.query(`
   CREATE INDEX IF NOT EXISTS mimic_hunt_ranking_idx
   ON mimic_hunt_sessions(event_key,((state->>'points')::integer) DESC)
  `)
  for(const [id,name,description] of TITLES){
   await db.query(`
     INSERT INTO items(id,name,description,category,price,rarity,sellable,stackable)
     VALUES($1,$2,$3,'special',0,'event',FALSE,FALSE)
     ON CONFLICT(id) DO NOTHING
   `,[id,name,description])
  }
  // Recalcula somente a diferença do drop antigo, uma única vez no banco.
  // A marca da compensação e a atualização são parte da mesma instrução SQL.
  const retro=await db.query(`
    WITH claim AS (
      INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(key) DO NOTHING RETURNING key
    ), adjusted AS (
      UPDATE mimic_hunt_sessions s SET
      state=jsonb_set(s.state,'{fragments}',to_jsonb(
        GREATEST(0,COALESCE((s.state->>'fragments')::int,0))+
        GREATEST(0,
          COALESCE((s.state->>'hunts')::int,0)-
          COALESCE((s.state->>'rare')::int,0)-
          COALESCE((s.state->>'epic')::int,0)-
          COALESCE((s.state->>'golden')::int,0))*4+
        COALESCE((s.state->>'rare')::int,0)*6+
        COALESCE((s.state->>'epic')::int,0)*9+
        COALESCE((s.state->>'golden')::int,0)*20
      ),true),
      updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
      FROM claim WHERE s.event_key=$3
      RETURNING s.jid
    ) SELECT COUNT(*)::int AS adjusted FROM adjusted
  `,['mimic_frg_rebalance_20261024_final_v3',JSON.stringify({old:[1,2,5,10],new:[5,8,14,30]}),MIMIC_EVENT.id])
  console.log('[MIMIC HUNT] fragmentos compensados',Number(retro.rows[0]?.adjusted||0))
 })().catch(err=>{initPromise=null;throw err})
 await initPromise
}
async function giveItem(c,jid,id,qty=1){
 if(!Number.isInteger(qty)||qty<1||qty>2)throw Error('Quantidade inválida')
 await c.query(`
  INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
  ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
 `,[jid,id,qty])
}
async function giveCash(c,jid,amount){
 if(!Number.isSafeInteger(amount)||amount<0||amount>1000000)throw Error('Valor inválido')
 if(!amount)return
 const r=await c.query(`
  UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
  WHERE jid=$2
 `,[amount,jid])
 if(r.rowCount!==1)throw Error('Carteira não encontrada; nenhuma caçada gravada')
}
function emptyState(name){return {
 name:prettyName(name),hunts:0,nextAt:0,points:0,fragments:0,
 cash:0,xp:0,rareTrades:0,epicTrades:0,
 epicDrops:0,goldenLegendary:false,lastAt:0,rare:0,epic:0,golden:0
}}
function statusMsg(s,rank){
 const done=s.hunts>=MIMIC_EVENT.maxHunts
 const now=Date.now(),cool=Math.max(0,Number(s.nextAt||0)-now)
 const progress=[10,20,30,45,60].filter(n=>Number(s.hunts)>=n).length
 return '👹 *INVASÃO DOS MIMICS — SEU PROGRESSO*\n'+BOUND+'\n'
 +'🎯 Caçadas: *'+s.hunts+'/60*\n'
 +'🏆 Pontos: *'+FMT(s.points)+'*'+(rank?(' • Ranking: *'+rank+'º*'):'')+'\n'
 +'💰 Dinheiro ganho: *R$ '+FMT(s.cash)+'*\n'
 +'✨ XP ganho: *'+FMT(s.xp)+'*\n'
 +'🧩 Fragmentos: *'+FMT(s.fragments)+'*\n'
 +'🎁 Metas conquistadas: *'+progress+'/5*\n'
 +'💎 Raros '+s.rare+' • Épicos '+s.epic+' • Dourados '+s.golden+'\n'
 +'📦 Trocas: Raras '+s.rareTrades+'/2 • Épicas '+s.epicTrades+'/2\n'
 +BOUND+'\n'
 +(done?'🏁 *Você completou as 60 caçadas!*'
  :cool?'⏳ Próxima caça em *'+remaining(cool)+' segundos*.'
  :'⚔️ Pronto! Use *!m* para caçar.')
 +'\n📊 *!mimic ranking* • 🧩 *!mimic trocar rara/epica*'
}
async function ranking(){
 const {rows}=await db.query(`
  SELECT jid,state FROM mimic_hunt_sessions
  WHERE event_key=$1 AND COALESCE((state->>'hunts')::integer,0)>0
  ORDER BY (state->>'points')::integer DESC,
    (state->>'hunts')::integer DESC,
    (state->>'lastAt')::bigint ASC,jid ASC
  LIMIT 10
 `,[MIMIC_EVENT.id])
 return rows
}
async function profileRank(jid){
 const rows=await ranking()
 return rows.findIndex(x=>x.jid===jid)+1||null
}
const locked=async(jid,work)=>{
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[MIMIC_EVENT.id+'|'+jid])
  const existing=await c.query(`
   SELECT state FROM mimic_hunt_sessions WHERE event_key=$1 AND jid=$2 FOR UPDATE
  `,[MIMIC_EVENT.id,jid])
  const result=await work(c,existing.rows[0]?.state||null)
  if(result?.state){
   await c.query(`
    INSERT INTO mimic_hunt_sessions(event_key,jid,state,updated_at)
    VALUES($1,$2,$3::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT(event_key,jid) DO UPDATE
    SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at
   `,[MIMIC_EVENT.id,jid,JSON.stringify(result.state)])
  }
  await c.query('COMMIT')
  return result?.text||''
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
 finally{c.release()}
}
async function action(jid,name,args=[]){
 const now=Date.now(),sub=String(args[0]||'').toLowerCase()
 if(['rank','ranking','top'].includes(sub)){
  const rows=await ranking()
  const list=rows.map((r,i)=>(i===0?'🥇':i===1?'🥈':i===2?'🥉':'🏅')
   +' '+prettyName(r.state.name)+' — *'+FMT(r.state.points)+' pts* • '+r.state.hunts+'/60').join('\n')
  return '🏆 *RANKING GLOBAL DOS MIMICS*\n'+BOUND+'\n'+(list||'Ainda não há caçadas.')+'\n'+BOUND
    +'\n🎁 1º R$ 300 mil • 2º R$ 200 mil • 3º R$ 100 mil\n'
    +'🌐 Contagem única para os dois grupos.'
 }
 if(['status','perfil','progresso','ajuda'].includes(sub)){
  const row=await db.query('SELECT state FROM mimic_hunt_sessions WHERE event_key=$1 AND jid=$2',[MIMIC_EVENT.id,jid])
  return statusMsg(row.rows[0]?.state||emptyState(name),await profileRank(jid))
 }
 if(sub==='trocar'){
  const kind=String(args[1]||'').toLowerCase()
  if(!['rara','epica','épica'].includes(kind))return '🧩 *TROCA DOS MIMICS*\nUse *!mimic trocar rara* (10 fragmentos) ou *!mimic trocar epica* (25 fragmentos).'
  if(now<MIMIC_EVENT.startsAt||now>=MIMIC_EVENT.endsAt+20*60000)
    return '🏁 As trocas da edição de hoje já foram encerradas.'
  const epic=kind!=='rara',cost=epic?25:10,item=epic?'caixa_epica':'caixa_rara',counter=epic?'epicTrades':'rareTrades'
  return locked(jid,async(c,old)=>{
   if(!old)return {text:'🧩 Cace Mimics usando *!mimic* antes de trocar fragmentos.'}
   if((old[counter]||0)>=2)return {text:'🛡️ Limite de *2 trocas* deste tipo por jogador nesta edição.'}
   if(Number(old.fragments)<cost)return {text:'🧩 Fragmentos insuficientes: *'+old.fragments+'/'+cost+'*.'}
   const s={...old,fragments:old.fragments-cost,[counter]:(old[counter]||0)+1}
   await giveItem(c,jid,item)
   return {state:s,text:'🎁 *TROCA CONCLUÍDA!*\n'
    +(epic?'🟣':'🔵')+' *1 '+(epic?'Caixa Épica':'Caixa Rara')+'* enviada ao inventário.\n'
    +'🧩 Fragmentos restantes: *'+FMT(s.fragments)+'*\n'
    +'✅ Não é possível resgatar o mesmo crédito duas vezes.'}
  })
 }
 if(args.length && !['cacar','caçar','caca','caça'].includes(sub))
  return '⚔️ Comandos: *!mimic* (caçar), *!mimic status*, *!mimic ranking* e *!mimic trocar rara/epica*.'
 if(now<MIMIC_EVENT.startsAt)return '⏳ *INVASÃO DOS MIMICS*\nComeça hoje às *15h* (Brasília). Prepare-se!'
 if(now>=MIMIC_EVENT.endsAt)return '🏁 *INVASÃO DOS MIMICS ENCERRADA!*\n'
  +'O evento terminou às *17h*. Use *!mimic ranking* para ver os vencedores.'
 return locked(jid,async(c,old)=>{
  const instant=Date.now()
  if(instant>=MIMIC_EVENT.endsAt)return {text:'🏁 Evento encerrado às 17h. Nenhuma nova caça foi cobrada ou creditada.'}
  const s={...(old||emptyState(name))}
  s.name=prettyName(name)
  if(Number(s.hunts)>=60)return {text:'🏁 Você já completou as *60 caçadas* desta edição. Confira *!mimic ranking*!'}
  if(instant<Number(s.nextAt||0))return {text:'⏳ *MIMIC DESCANSANDO!*\n'
   +'Volte em *'+remaining(Number(s.nextAt)-instant)+' segundos*.\n'
   +'📊 *!mimic status* mostra seus fragmentos e metas.'}
  const rarity=mimicOutcome(randomInt(10000))
  const earnedCash=randomInt(6000,14001)
  const earnedXp=randomInt(100,251)
  s.hunts=Number(s.hunts)+1
  s.lastAt=instant
  s.nextAt=instant+MIMIC_EVENT.cooldownMs
  s.points=Number(s.points)+rarity.points
  s.fragments=Number(s.fragments)+rarity.fragments
  s.cash=Number(s.cash)+earnedCash
  s.xp=Number(s.xp)+earnedXp
  if(rarity.kind!=='comum')s[rarity.kind==='raro'?'rare':rarity.kind==='epico'?'epic':'golden']++
  let message='👹 *INVASÃO DOS MIMICS — CAÇADA '+s.hunts+'/60*\n'
    +BOUND+'\n'+rarity.label+' *DERROTADO!*\n'
    +'💰 *+R$ '+FMT(earnedCash)+'*\n'
    +'✨ *+'+FMT(earnedXp)+' XP*\n'
    +'🧩 *+'+rarity.fragments+' fragmentos*\n'
    +'🏆 Pontos nesta caçada: *+'+rarity.points+'*\n'
  const achievements=MIMIC_EVENT.milestones.filter(x=>x.hunts===s.hunts)
  for(const m of achievements){
   await giveCash(c,jid,m.cash)
   await giveItem(c,jid,m.box,m.qty)
   s.cash+=m.cash
   message+='\n🎯 *META CONCLUÍDA — '+m.hunts+'/60!*\n'
    +(m.cash?'💰 *+R$ '+FMT(m.cash)+'*\n':'')
    +'🎁 *'+m.qty+'× '+(m.hunts===30?'Insígnia Caçador Lendário':m.hunts===60?'Título Caçador Supremo':m.box==='caixa_rara'?'Caixa Rara':m.box==='caixa_epica'?'Caixa Épica':'Caixa Lendária')+'*\n'
  }
  if(rarity.kind==='epico'&&s.epicDrops<2 && randomInt(100)<12){
   await giveItem(c,jid,'caixa_epica')
   s.epicDrops=(s.epicDrops||0)+1
   message+='\n🎁 *DROP EXTRA: 1 Caixa Épica!*\n'
  }
  if(rarity.kind==='dourado'&&!s.goldenLegendary && randomInt(100)<25){
   await giveItem(c,jid,'caixa_lendaria')
   s.goldenLegendary=true
   message+='\n🌟 *DROP LENDÁRIO: 1 Caixa Lendária!*\n'
  }
  await giveCash(c,jid,earnedCash)
  await grantExpInTransaction(c,jid,earnedXp,{ignoreGroupProgressionEvent:true})
  message+='\n'+BOUND+'\n'
   +'💰 Total ganho: *R$ '+FMT(s.cash)+'*\n'
   +'✨ XP total: *'+FMT(s.xp)+'*\n'
   +'🧩 Fragmentos disponíveis: *'+FMT(s.fragments)+'*\n'
   +'🏅 Pontos totais: *'+FMT(s.points)+'*\n'
   +(s.hunts<60?'⏳ Próxima caça em *2 minutos*.':'🏆 *60/60! Caçadas completas!*\n')
   +'📊 *!mimic status* • *!mimic ranking*'
  return {state:s,text:message}
 })
}
export async function handleMimicCommand({cmd,args,sender,name,chat,reply}){
 if(!['mimic','mimics','m'].includes(cmd))return false
 if(!String(chat||'').endsWith('@g.us')){await reply('👹 O evento acontece nos grupos do Alpha Bot.');return true}
 const lic=await getGroupLicense(chat)
 if(!lic||!groupLicenseIsActive(lic)){
  await reply('🔒 Este grupo precisa estar ativo para participar dos Mimics.');return true
 }
 try{
  await initMimic()
  const result=await action(sender,name,args)
  await reply(result)
 }catch(err){
  console.error('[MIMIC HUNT] ação falhou',String(err?.message||err).slice(0,180))
  // Evitar alegar que ação transacional falhou se apenas o WhatsApp falhou.
  const transport=/WhatsApp|transport|forbidden/i.test(String(err?.message||err))
  if(!transport)await reply('⚠️ Não consegui completar esta ação. Consulte *!mimic status* antes de tentar novamente.')
 }
 return true
}
const sortByScore=(a,b)=>{
 const x=a.state,y=b.state
 return Number(y.points)-Number(x.points)||Number(y.hunts)-Number(x.hunts)
  ||Number(x.lastAt)-Number(y.lastAt)||String(a.jid).localeCompare(String(b.jid))
}
export async function finalizeMimics(){
 await initMimic()
 // Aguarda 15 s após o fechamento para liquidar ações iniciadas antes das 17h.
 if(Date.now()<MIMIC_EVENT.endsAt+15000)return {due:false}
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='30000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[MIMIC_EVENT.id+'|final'])
  const key='mimic_final:'+MIMIC_EVENT.id
  const done=await c.query('SELECT value FROM trevo_settings WHERE key=$1',[key])
  if(done.rowCount){await c.query('COMMIT');return {already:true,winners:done.rows[0].value.winners||[]}}
  const {rows}=await c.query(`
    SELECT jid,state FROM mimic_hunt_sessions
    WHERE event_key=$1 AND (state->>'hunts')::integer>0
    ORDER BY (state->>'points')::integer DESC,
     (state->>'hunts')::integer DESC,
     (state->>'lastAt')::bigint ASC,jid ASC
    LIMIT 3
  `,[MIMIC_EVENT.id])
  const sorted=[...rows].sort(sortByScore)
  const titles=['insignia_rei_mimics_20261024','insignia_mestre_mimics_20261024','insignia_senhor_baus_mimics_20261024']
  const winners=[]
  for(let i=0;i<sorted.length;i++){
   const p=sorted[i],amount=MIMIC_EVENT.rankCash[i]
   await giveCash(c,p.jid,amount)
   await giveItem(c,p.jid,titles[i])
   winners.push({place:i+1,name:prettyName(p.state.name),points:Number(p.state.points),hunts:Number(p.state.hunts),cash:amount})
  }
  const marker={finishedAt:Date.now(),winners}
  await c.query(`
    INSERT INTO trevo_settings(key,value,updated_at)
    VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT(key) DO NOTHING
  `,[key,JSON.stringify(marker)])
  await c.query('COMMIT')
  console.log('[MIMIC HUNT] ranking final liquidado',JSON.stringify({winners:winners.length}))
  return {finished:true,winners}
 }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}
 finally{c.release()}
}
async function announce(sock,phase){
 const now=Date.now()
 if(phase==='open'&&(now<MIMIC_EVENT.startsAt||now>=MIMIC_EVENT.endsAt))return
 if(phase==='close'&&now<MIMIC_EVENT.endsAt+15000)return
 if(closing)return
 closing=true
 try{
  let winners=[]
  if(phase==='close'){
   const final=await finalizeMimics()
   winners=final.winners||[]
  }
  const groups=(await listGroupLicenses(500)).filter(groupLicenseIsActive)
   .filter(lic=>String(lic.chat_jid||'').endsWith('@g.us'))
  const board=winners.length?'\n\n🏆 *TOP 3 GLOBAL*\n'+winners.map(p=>
   (p.place===1?'🥇':p.place===2?'🥈':'🥉')+' *'+p.name+'* — '+FMT(p.points)
    +' pontos • R$ '+FMT(p.cash)).join('\n'):'\n\n🏆 Sem caçadas registradas.'
  const msg=phase==='open'?INTRO:phase==='update'?UPDATE:END+board
  let sent=0,failed=0,already=0
  for(const group of groups){
   const key='mimic_notice:'+MIMIC_EVENT.id+':'+phase+':'+group.chat_jid
   try{
    const exists=await db.query('SELECT 1 FROM trevo_settings WHERE key=$1',[key])
    if(exists.rowCount){already++;continue}
    await sock.sendMessage(group.chat_jid,{text:msg})
    await db.query(`
      INSERT INTO trevo_settings(key,value,updated_at)
      VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(key) DO NOTHING
    `,[key,JSON.stringify({sentAt:Date.now(),phase})])
    sent++
   }catch(e){
    failed++
    console.warn('[MIMIC HUNT] aviso falhou',phase,String(e?.message||e).slice(0,130))
   }
  }
  console.log('[MIMIC HUNT] avisos',JSON.stringify({phase,groups:groups.length,sent,failed,already}))
 }catch(e){console.error('[MIMIC HUNT] scheduler',String(e?.stack||e).slice(0,400))}
 finally{closing=false}
}
export async function scheduleMimics(sock){
 await initMimic()
 for(const t of timers)clearTimeout(t)
 timers=[]
 const now=Date.now()
 const later=(at,phase)=>{
  if(now>=at){void announce(sock,phase);return}
  const t=setTimeout(()=>void announce(sock,phase),at-now+150)
  t.unref?.()
  timers.push(t)
 }
 if(now<MIMIC_EVENT.startsAt)later(MIMIC_EVENT.startsAt,'open')
 else if(now<MIMIC_EVENT.endsAt)void announce(sock,'update')
 later(MIMIC_EVENT.endsAt+15000,'close')
 console.log('[MIMIC HUNT] agendado',JSON.stringify({start:'15:00',end:'17:00',levels:'livre'}))
}
