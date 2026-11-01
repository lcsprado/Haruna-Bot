import {db,ensureUser} from './db.js'
import {RACING_CARS,RACING_COLORS,RACING_PARTS,RACING_UPGRADES,RACING_TIERS,RACING_COOLDOWN_SECONDS,RACING_CHALLENGE_SECONDS,RACING_MIN_CONDITION,RACING_MAX_CARS,RACING_TOTAL_UPGRADE_COST,racingModel,racingColor,racingPart,racingTrack,racingStrategy,racingTier,racingTuning,racingStats,racingDriverLevel,racingPower,racingDuel,racingNpcDuel,racingRepairCost,racingCashPrize,racingXpPrize} from './racing-rules.js'

export const raceMoney=n=>'R$ '+Math.max(0,Math.floor(Number(n)||0)).toLocaleString('pt-BR')
export const raceNum=n=>Math.floor(Number(n)||0).toLocaleString('pt-BR')
const nowSeconds=()=>Math.floor(Date.now()/1000)
let initialized=false

export async function initRacingAlpha(){
 await db.query("CREATE TABLE IF NOT EXISTS racing_profiles_alpha(jid TEXT PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,xp BIGINT NOT NULL DEFAULT 0 CHECK(xp>=0),races INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,spent BIGINT NOT NULL DEFAULT 0,last_race_at BIGINT NOT NULL DEFAULT 0,created_at BIGINT NOT NULL DEFAULT 0)")
 await db.query("CREATE TABLE IF NOT EXISTS racing_cars_alpha(id BIGSERIAL PRIMARY KEY,jid TEXT NOT NULL REFERENCES users(jid) ON DELETE CASCADE,model_id TEXT NOT NULL,color_id TEXT NOT NULL DEFAULT 'prata',equipped BOOLEAN NOT NULL DEFAULT FALSE,condition SMALLINT NOT NULL DEFAULT 100 CHECK(condition BETWEEN 0 AND 100),upgrades JSONB NOT NULL DEFAULT '{}'::jsonb,pending_part TEXT,pending_level INTEGER,pending_until BIGINT NOT NULL DEFAULT 0,races INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,created_at BIGINT NOT NULL DEFAULT 0,UNIQUE(jid,model_id))")
 await db.query("ALTER TABLE racing_cars_alpha ADD COLUMN IF NOT EXISTS color_id TEXT NOT NULL DEFAULT 'prata'")
 await db.query("CREATE UNIQUE INDEX IF NOT EXISTS racing_one_equipped_alpha ON racing_cars_alpha(jid) WHERE equipped=TRUE")
 await db.query("CREATE INDEX IF NOT EXISTS racing_by_owner_alpha ON racing_cars_alpha(jid,id)")
 await db.query("CREATE TABLE IF NOT EXISTS racing_challenges_alpha(id BIGSERIAL PRIMARY KEY,chat TEXT NOT NULL,challenger TEXT NOT NULL REFERENCES users(jid),challenged TEXT NOT NULL REFERENCES users(jid),track_id TEXT NOT NULL,strategy_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL,completed_at BIGINT NOT NULL DEFAULT 0,CHECK(challenger<>challenged))")
 await db.query("CREATE UNIQUE INDEX IF NOT EXISTS racing_challenge_pending_alpha ON racing_challenges_alpha(challenger) WHERE status='pending'")
 await db.query("CREATE INDEX IF NOT EXISTS racing_challenge_target_alpha ON racing_challenges_alpha(challenged,chat,status,expires_at)")
 await db.query("CREATE TABLE IF NOT EXISTS racing_results_alpha(id BIGSERIAL PRIMARY KEY,jid TEXT NOT NULL REFERENCES users(jid),opponent_jid TEXT,mode TEXT NOT NULL,track_id TEXT NOT NULL,tier_id TEXT NOT NULL,won BOOLEAN NOT NULL,score NUMERIC NOT NULL,opponent_score NUMERIC NOT NULL,reward_cash BIGINT NOT NULL,reward_xp INTEGER NOT NULL,created_at BIGINT NOT NULL)")
 initialized=true
 console.log('[RACING] Garagem Alpha pronta: 4 carros, 6 peças x 7 níveis, oficina, PvE e PvP')
}
function requireReady(){if(!initialized)throw Error('Garagem Alpha inicializando.')}
async function tx(jids,fn){
 requireReady()
 const users=[...new Set((Array.isArray(jids)?jids:[jids]).filter(Boolean))].sort()
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  if(users.length){
   const r=await c.query('SELECT jid FROM users WHERE jid=ANY($1::text[]) ORDER BY jid FOR UPDATE',[users])
   if(r.rows.length!==users.length)throw Error('Jogador não encontrado. Use !perfil primeiro.')
   for(const jid of users)await c.query('INSERT INTO racing_profiles_alpha(jid,created_at) VALUES($1,$2) ON CONFLICT DO NOTHING',[jid,nowSeconds()])
  }
  const out=await fn(c)
  await c.query('COMMIT')
  return out
 }catch(error){await c.query('ROLLBACK');throw error}finally{c.release()}
}
async function settleWorkshop(c,jid){
 return (await c.query("UPDATE racing_cars_alpha SET upgrades=jsonb_set(upgrades,ARRAY[pending_part],to_jsonb(pending_level),TRUE),pending_part=NULL,pending_level=NULL,pending_until=0 WHERE jid=$1 AND pending_part IS NOT NULL AND pending_until>0 AND pending_until<=$2 RETURNING id,model_id,upgrades",[jid,nowSeconds()])).rows
}
async function state(c,jid){
 await settleWorkshop(c,jid)
 const cars=(await c.query('SELECT * FROM racing_cars_alpha WHERE jid=$1 ORDER BY id FOR UPDATE',[jid])).rows
 const profile=(await c.query('SELECT * FROM racing_profiles_alpha WHERE jid=$1',[jid])).rows[0]
 return {cars,profile}
}
export const modelName=car=>racingModel(car.model_id)?.name||'Carro'
export const activeCar=s=>s.cars.find(c=>c.equipped)||null
export const raceState=async jid=>{await ensureUser(jid);return tx(jid,c=>state(c,jid))}
export function raceGarageText(s){
 const p=s.profile,arr=['🏎️ *GARAGEM ALPHA — CORRIDAS*','👨‍✈️ Piloto Nv.'+racingDriverLevel(p?.xp||0)+' • '+raceNum(p?.xp||0)+' XP',
  '🏁 '+raceNum(p?.races||0)+' corridas • '+raceNum(p?.wins||0)+' vitórias',
  '💸 Investido: '+raceMoney(p?.spent||0),'🚘 '+s.cars.length+'/'+RACING_MAX_CARS+' carros • 1 equipado','']
 if(!s.cars.length)arr.push('Garagem vazia. Veja *!corridacarros*.')
 for(const car of s.cars){
  const st=racingStats(car.model_id,car.upgrades),n=racingTuning(car.upgrades),color=racingColor(car.color_id)||racingColor('prata')
  arr.push('*ID '+car.id+' • '+modelName(car)+'*'+(car.equipped?' ✅ EQUIPADO':''),
    '⚡ Vel '+st.speed+' • 🚀 Arr '+st.accel+' • 🛞 Ader '+st.grip+' • 🛑 Fre '+st.brake,
    '🎨 Pintura '+color.emoji+' '+color.name,
    '🛠️ Preparação '+n+'/42 • ❤️ Condição '+car.condition+'/100',
    car.pending_part?'🔧 '+racingPart(car.pending_part).name+' Lv.'+car.pending_level+' • ⏳ '+Math.max(0,Math.ceil((car.pending_until-nowSeconds())/60))+'min':'🔧 Oficina livre','')
 }
 arr.push('🎨 *!corescarro* • *!pintarcarro ID azul*', '🔧 *!oficina* • 🏁 *!corrida* • 🧰 *!repararcarro*','Carros desta garagem não são usados no Uber.')
 return arr.join('\n')
}
export function raceCarsText(){
 let s='🏎️ *QUATRO CARROS — CORRIDAS ALPHA*\n\n'
 for(const c of RACING_CARS)s+='🚘 *'+c.id+'* — '+c.name+' • '+raceMoney(c.price)+'\n⚡ '+c.stats.speed+' Vel • 🚀 '+c.stats.accel+' Arr • 🛞 '+c.stats.grip+' Ader • 🛑 '+c.stats.brake+' Fre\n'
 return s+'\nMesma capacidade de preparação máxima (42 melhorias). A pista e as peças definem o vencedor.'+
 '\n🛒 *!comprarcorrida gol* • exclusivos desta modalidade, fora do Uber.'
}
export function raceColorsText(){
 return '🎨 *PINTURAS — GARAGEM ALPHA*\n\n'+RACING_COLORS.map(c=>c.emoji+' *'+c.id+'* — '+c.name).join('\n')+
 '\n\n🖌️ Para pintar: *!pintarcarro ID cor*\nEx.: *!pintarcarro 12 vermelho*\n✅ Gratuito, permanente e somente visual. Não altera atributos, condição ou melhorias.'
}
export function raceWorkshopText(s){
 const car=activeCar(s)
 if(!car)return '🔧 Equipe um carro com *!equiparcorrida ID*.'
 const arr=['🔧 *OFICINA — '+modelName(car)+'*','❤️ '+car.condition+'/100 • Preparação '+racingTuning(car.upgrades)+'/42']
 if(car.pending_part)arr.push('⏳ Instalando '+racingPart(car.pending_part).name+' Nv.'+car.pending_level+' • '+Math.max(0,Math.ceil((car.pending_until-nowSeconds())/60))+'min')
 for(const part of RACING_PARTS){
  const lv=Number(car.upgrades?.[part.id]||0),next=RACING_UPGRADES[lv]
  arr.push(part.name+' • *'+lv+'/7*'+(next?' → '+raceMoney(next.price)+' • '+(next.seconds<3600?next.seconds/60+'min':next.seconds/3600+'h'):' • MÁXIMO'))
 }
 return arr.join('\n')+'\n\n⏳ Uma instalação por vez para toda a garagem.'+
 '\n💰 Custo de preparação completa de um carro: '+raceMoney(RACING_TOTAL_UPGRADE_COST+150000)+
 '\n⚙️ *!melhorarcarro motor* (cambio, pneus, suspensao, freios, turbo).'
}
export function checkRace(car,profile){
 if(!car)throw Error('Equipe seu carro: !equiparcorrida ID.')
 if(car.pending_part)throw Error('Carro na oficina. Aguarde ou equipe outro.')
 if(Number(car.condition)<RACING_MIN_CONDITION)throw Error('Carro desgastado (<35%). Use !repararcarro.')
 const remain=Number(profile.last_race_at||0)+RACING_COOLDOWN_SECONDS-nowSeconds()
 if(remain>0)throw Error('Próxima corrida em '+Math.ceil(remain/60)+'min.')
}
const raceShape=(car,profile,strategy)=>({modelId:car.model_id,upgrades:car.upgrades,condition:Number(car.condition),driverLevel:racingDriverLevel(profile.xp),strategy})
async function finishRace(c,{jid,car,won,mode,track,tier,score,opponentScore,opponentJid=null,wear,xp,cash}){
 await c.query('UPDATE racing_cars_alpha SET condition=GREATEST(0,condition-$2),races=races+1,wins=wins+$3 WHERE id=$1',[car.id,wear,won?1:0])
 await c.query('UPDATE racing_profiles_alpha SET races=races+1,wins=wins+$2,losses=losses+$3,xp=xp+$4,last_race_at=$5 WHERE jid=$1',[jid,won?1:0,won?0:1,xp,nowSeconds()])
 if(cash>0){
  await c.query('UPDATE wallets SET cash=cash+$2 WHERE jid=$1',[jid,cash])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'racing_reward',$3)",[jid,cash,mode+' • '+tier+' • '+track])
 }
 await c.query('INSERT INTO racing_results_alpha(jid,opponent_jid,mode,track_id,tier_id,won,score,opponent_score,reward_cash,reward_xp,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[jid,opponentJid,mode,track,tier,won,score,opponentScore,cash,xp,nowSeconds()])
}
export function parseRaceArgs(args=[]){
 const chosen={tier:'rua',track:'cidade',strategy:'equilibrada'}
 for(const token of args.map(a=>String(a||'').toLowerCase())){
  if(racingTier(token))chosen.tier=token
  else if(racingTrack(token))chosen.track=token
  else if(racingStrategy(token))chosen.strategy=token
  else throw Error('Opção inválida: '+token+'. Ex.: !corrida bairro cidade tecnica')
 }
 return chosen
}
export async function raceBuy(jid,modelId){
 const model=racingModel(modelId)
 if(!model)throw Error('Modelo inválido. Use !corridacarros.')
 return tx(jid,async c=>{
  const s=await state(c,jid)
  if(s.cars.length>=RACING_MAX_CARS)throw Error('Sua garagem está cheia (4 carros).')
  if(s.cars.some(x=>x.model_id===model.id))throw Error('Você já possui esse modelo.')
  const w=(await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(Number(w?.cash||0)<model.price)throw Error('Saldo insuficiente: '+raceMoney(model.price)+'.')
  await c.query('UPDATE wallets SET cash=cash-$2 WHERE jid=$1',[jid,model.price])
  const id=(await c.query('INSERT INTO racing_cars_alpha(jid,model_id,equipped,created_at) VALUES($1,$2,$3,$4) RETURNING id',[jid,model.id,s.cars.length===0,nowSeconds()])).rows[0].id
  await c.query('UPDATE racing_profiles_alpha SET spent=spent+$2 WHERE jid=$1',[jid,model.price])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'racing_car_buy',$3)",[jid,model.price,model.name])
  return {id,model,autoEquipped:s.cars.length===0}
 })
}
export async function raceEquip(jid,carId){
 return tx(jid,async c=>{
  const s=await state(c,jid),car=s.cars.find(x=>String(x.id)===String(carId)||x.model_id===String(carId))
  if(!car)throw Error('Carro não está na sua garagem.')
  if(car.pending_part)throw Error('Carro em instalação. Aguarde.')
  await c.query('UPDATE racing_cars_alpha SET equipped=FALSE WHERE jid=$1 AND equipped=TRUE',[jid])
  await c.query('UPDATE racing_cars_alpha SET equipped=TRUE WHERE id=$1',[car.id])
  return modelName(car)
 })
}
export async function racePaint(jid,carId,colorId){
 const color=racingColor(colorId)
 if(!color)throw Error('Cor inválida. Veja !corescarro.')
 return tx(jid,async c=>{
  const s=await state(c,jid)
  const target=String(carId||'').trim().toLowerCase()
  const car=s.cars.find(x=>String(x.id)===target||x.model_id===target)
  if(!car)throw Error('Carro não está na sua garagem. Consulte !garagemcorrida.')
  const previous=racingColor(car.color_id)||racingColor('prata')
  if(previous.id!==color.id){
   const out=await c.query('UPDATE racing_cars_alpha SET color_id=$3 WHERE jid=$1 AND id=$2 RETURNING id',[jid,car.id,color.id])
   if(out.rowCount!==1)throw Error('Falha ao salvar a pintura. Tente novamente.')
  }
  return {carId:car.id,model:modelName(car),color,changed:previous.id!==color.id}
 })
}
export async function raceUpgrade(jid,partId){
 const part=racingPart(partId)
 if(!part)throw Error('Peça inválida. Use !oficina.')
 return tx(jid,async c=>{
  const s=await state(c,jid),car=activeCar(s)
  if(!car)throw Error('Equipe um carro primeiro.')
  if(s.cars.some(x=>x.pending_part))throw Error('Oficina ocupada. Aguarde a instalação anterior.')
  const next=RACING_UPGRADES[Number(car.upgrades?.[part.id]||0)]
  if(!next)throw Error('Peça já no Nv.7 máximo.')
  const w=(await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(Number(w?.cash||0)<next.price)throw Error('Saldo insuficiente. Custa '+raceMoney(next.price)+'.')
  await c.query('UPDATE wallets SET cash=cash-$2 WHERE jid=$1',[jid,next.price])
  const endsAt=nowSeconds()+next.seconds
  await c.query('UPDATE racing_cars_alpha SET pending_part=$2,pending_level=$3,pending_until=$4 WHERE id=$1',[car.id,part.id,next.level,endsAt])
  await c.query('UPDATE racing_profiles_alpha SET spent=spent+$2 WHERE jid=$1',[jid,next.price])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'racing_upgrade',$3)",[jid,next.price,modelName(car)+' • '+part.id+' Nv.'+next.level])
  return {model:modelName(car),part,next,endsAt}
 })
}
export async function raceRepair(jid){
 return tx(jid,async c=>{
  const s=await state(c,jid),car=activeCar(s)
  if(!car)throw Error('Equipe um carro primeiro.')
  if(car.pending_part)throw Error('Aguarde a instalação para reparar.')
  const cost=racingRepairCost(car.model_id,car.upgrades,car.condition)
  if(!cost)throw Error('Condição já está em 100/100.')
  const w=(await c.query('SELECT cash FROM wallets WHERE jid=$1 FOR UPDATE',[jid])).rows[0]
  if(Number(w?.cash||0)<cost)throw Error('Saldo insuficiente. Reparo '+raceMoney(cost)+'.')
  await c.query('UPDATE wallets SET cash=cash-$2 WHERE jid=$1',[jid,cost])
  await c.query('UPDATE racing_cars_alpha SET condition=100 WHERE id=$1',[car.id])
  await c.query('UPDATE racing_profiles_alpha SET spent=spent+$2 WHERE jid=$1',[jid,cost])
  await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES($1,'system',$2,'racing_repair',$3)",[jid,cost,modelName(car)])
  return {car:modelName(car),cost}
 })
}
export async function raceSolo(jid,args){
 const {tier,track,strategy}=parseRaceArgs(args)
 return tx(jid,async c=>{
  const s=await state(c,jid),car=activeCar(s)
  checkRace(car,s.profile)
  const driver=racingDriverLevel(s.profile.xp),tuning=racingTuning(car.upgrades),level=racingTier(tier)
  if(tuning<level.minTuning||driver<level.minDriver)
   throw Error('Categoria '+level.name+' exige '+level.minTuning+'/42 em preparação e Piloto Nv.'+level.minDriver+'. Você: '+tuning+'/42 e Nv.'+driver+'.')
  const result=racingNpcDuel(raceShape(car,s.profile,strategy),tier,track)
  const wear=racingStrategy(strategy).wear,cash=racingCashPrize(tier,result.won),xp=racingXpPrize(tier,result.won)
  await finishRace(c,{jid,car,won:result.won,mode:'pve',track,tier,score:result.yourResult,opponentScore:result.npcResult,wear,xp,cash})
  return {model:modelName(car),tier:racingTier(tier),track:racingTrack(track),strategy:racingStrategy(strategy),won:result.won,own:result.yourResult,rival:result.npcResult,wear,condition:Math.max(0,Number(car.condition)-wear),cash,xp,pilotLevel:racingDriverLevel(Number(s.profile.xp)+xp)}
 })
}
export async function raceChallenge(jid,targetJid,chat,args,name){
 if(!chat?.endsWith('@g.us'))throw Error('Desafio de corrida somente em grupos.')
 if(!targetJid||jid===targetJid)throw Error('Marque outro jogador: !desafiocorrida @jogador cidade.')
 const {track,strategy}=parseRaceArgs(args)
 await ensureUser(targetJid)
 return tx([jid,targetJid],async c=>{
  const s=await state(c,jid);checkRace(activeCar(s),s.profile)
  await c.query("UPDATE racing_challenges_alpha SET status='expired' WHERE status='pending' AND challenger=$1 AND expires_at<=$2",[jid,nowSeconds()])
  const existing=(await c.query("SELECT id FROM racing_challenges_alpha WHERE challenger=$1 AND status='pending'",[jid])).rows[0]
  if(existing)throw Error('Você já possui desafio aguardando resposta.')
  const createdAt=nowSeconds(),expires=createdAt+RACING_CHALLENGE_SECONDS
  const id=(await c.query("INSERT INTO racing_challenges_alpha(chat,challenger,challenged,track_id,strategy_id,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[chat,jid,targetJid,track,strategy,createdAt,expires])).rows[0].id
  return {id,track:racingTrack(track),strategy:racingStrategy(strategy),name,targetJid}
 })
}
export async function raceAccept(jid,chat,strategyId='equilibrada'){
 if(!chat?.endsWith('@g.us'))throw Error('Aceite desafios somente no grupo.')
 const strategy=racingStrategy(strategyId||'equilibrada')
 if(!strategy)throw Error('Estratégia inválida (equilibrada, agressiva, tecnica).')
 const waiting=(await db.query("SELECT id,challenger FROM racing_challenges_alpha WHERE challenged=$1 AND chat=$2 AND status='pending' AND expires_at>$3 ORDER BY id DESC LIMIT 1",[jid,chat,nowSeconds()])).rows[0]
 if(!waiting)throw Error('Nenhum desafio pendente para você neste grupo.')
 return tx([jid,waiting.challenger],async c=>{
  const r=(await c.query("SELECT * FROM racing_challenges_alpha WHERE id=$1 FOR UPDATE",[waiting.id])).rows[0]
  if(!r||r.status!=='pending'||r.expires_at<=nowSeconds()||r.challenged!==jid||r.chat!==chat)throw Error('Desafio expirado ou finalizado.')
  const a=await state(c,r.challenger),b=await state(c,jid),ac=activeCar(a),bc=activeCar(b)
  checkRace(ac,a.profile);checkRace(bc,b.profile)
  const result=racingDuel(raceShape(ac,a.profile,r.strategy_id),raceShape(bc,b.profile,strategy.id),r.track_id)
  const aWon=result.winner==='a',aXp=aWon?125:55,bXp=aWon?55:125
  await finishRace(c,{jid:r.challenger,car:ac,won:aWon,mode:'pvp',track:r.track_id,tier:'pvp',score:result.aResult,opponentScore:result.bResult,opponentJid:jid,wear:racingStrategy(r.strategy_id).wear,xp:aXp,cash:0})
  await finishRace(c,{jid,car:bc,won:!aWon,mode:'pvp',track:r.track_id,tier:'pvp',score:result.bResult,opponentScore:result.aResult,opponentJid:r.challenger,wear:strategy.wear,xp:bXp,cash:0})
  await c.query("UPDATE racing_challenges_alpha SET status='completed',completed_at=$2 WHERE id=$1",[r.id,nowSeconds()])
  return {winner:aWon?r.challenger:jid,challenger:r.challenger,challenged:jid,track:racingTrack(r.track_id),aCar:modelName(ac),bCar:modelName(bc),aScore:result.aResult,bScore:result.bResult,aXp,bXp}
 })
}
export async function raceCancel(jid){
 return tx(jid,async c=>{
  const r=await c.query("UPDATE racing_challenges_alpha SET status='cancelled' WHERE challenger=$1 AND status='pending' RETURNING id",[jid])
  if(!r.rowCount)throw Error('Sem desafio pendente para cancelar.')
  return r.rowCount
 })
}
export async function raceRanking(){
 return (await db.query("SELECT r.jid,u.push_name,r.xp,r.races,r.wins,r.losses,r.spent FROM racing_profiles_alpha r JOIN users u ON u.jid=r.jid WHERE r.races>0 ORDER BY r.wins DESC,r.xp DESC,r.races ASC LIMIT 12")).rows
}
export async function raceHistory(jid){return (await db.query('SELECT * FROM racing_results_alpha WHERE jid=$1 ORDER BY id DESC LIMIT 5',[jid])).rows}
