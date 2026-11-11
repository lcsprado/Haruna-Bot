// Cofre do Destino — edicao especial de 11/11/2026.
// Rodadas transacionais, com sorteio criptografico auditado no recibo de cada jogador.
// Nao altera a edicao historica do Cofre das Sombras nem os combates normais.
import {randomInt} from 'node:crypto'
import {db,listGroupLicenses,groupLicenseIsActive,grantExpInTransaction} from './db.js'
import {initCofre} from './cofre-sombras.js'
import {
 COFRE_DESTINO_KEY,COFRE_DESTINO_START,COFRE_DESTINO_END,COFRE_DESTINO_ROOMS,
 COFRE_DESTINO_WAIT_MS,COFRE_DESTINO_CASH_CAP,COFRE_DESTINO_XP_CAP,
 COFRE_DESTINO_FRAG_ID,COFRE_DESTINO_PRIZES,COFRE_DESTINO_DOORS,
 isCofreDestinoCheckpoint,cofreDestinoResolveChoice,cofreDestinoDebit,rankCofreDestino
} from './cofre-destino-policy.js'

const fmt=n=>Number(n||0).toLocaleString('pt-BR')
let activeSocket=null
let timer=null
async function eventState(){
 const {rows}=await db.query('SELECT * FROM cofre_sombras_events WHERE event_key=$1',[COFRE_DESTINO_KEY])
 return rows[0]||null
}
async function prepareEdition(){
 await initCofre()
 const groups=[...new Set((await listGroupLicenses(500))
  .filter(groupLicenseIsActive).map(x=>x.chat_jid)
  .filter(x=>String(x).endsWith('@g.us')))]
 if(!groups.length){console.warn('[COFRE DESTINO] nenhum grupo licenciado');return null}
 await db.query(`
  INSERT INTO cofre_sombras_events(event_key,starts_at,ends_at,groups)
  VALUES($1,$2,$3,$4::jsonb)
  ON CONFLICT(event_key) DO NOTHING
 `,[COFRE_DESTINO_KEY,COFRE_DESTINO_START,COFRE_DESTINO_END,JSON.stringify(groups)])
 return eventState()
}
function stateMenu(s,e){
 const n=Number(s.round||0)+1
 const available=Math.max(0,COFRE_DESTINO_ROOMS-Number(s.round||0))
 return '🗝️ *AS 3 PORTAS DO DESTINO — SALA '+n+'/'+COFRE_DESTINO_ROOMS+'*\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'❤️ HP de exploração: *'+fmt(s.hp)+'/'+fmt(s.maxHp)+'*\n'
  +'💰 Tesouro ainda não protegido: *R$ '+fmt(s.pendingCash)+'*\n'
  +'🏦 Tesouro já creditado: *R$ '+fmt(s.paidCash)+'*\n'
  +'📉 Perdas da carteira/banco: *R$ '+fmt(s.lostCash)+'*\n'
  +'💰 Teto de tesouros da exploração: R$ '+fmt(COFRE_DESTINO_CASH_CAP)+'\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'🛡️ *!explorar 1* — 100%: +R$ 30.000 e cura de 20% do HP; nunca perde dinheiro.\n'
  +'💎 *!explorar 2* — 40%: +R$ 350.000; 60%: -R$ 100.000 e -23% HP.\n'
  +'☠️ *!explorar 3* — 10%: +R$ 2.000.000; 90%: -R$ 250.000 e -47% HP.\n'
  +'━━━━━━━━━━━━━━━━━━\n'
  +'⚠️ Para arriscar, precisa ter saldo total (dinheiro + banco) suficiente para a possível perda.\n'
  +'💳 Em derrota, desconta primeiro da carteira e depois do banco.\n'
  +'🔐 Prêmios positivos são pagos nos checkpoints das salas 2, 4 e 5.\n'
  +(Number(s.round)===2||Number(s.round)===4?'🏦 *!cofre sair* — encerra e mantém os prêmios já recebidos.\n':'')
  +'🏁 Restam '+available+' sala(s). *!cofre ranking* mostra os finalistas.\n'
  +'⏳ 5 minutos entre portas. Encerra às 22h (Brasília).'
}
function finalStateText(s){
 const status=s.phase==='finished'?'🏆 Você completou as cinco salas!':
  s.phase==='dead'?'💀 Você morreu na exploração.':
  s.phase==='left'?'🏦 Você encerrou a exploração no checkpoint.':
  '⏰ A edição terminou.'
 return status
  +'\n🗝️ Salas vencidas: *'+fmt(s.round)+'/'+COFRE_DESTINO_ROOMS+'*'
  +'\n💰 Tesouro pago: *R$ '+fmt(s.paidCash)+'*'
  +'\n📉 Perdas reais: *R$ '+fmt(s.lostCash)+'*'
  +'\n✨ XP-base pago: *'+fmt(s.paidXp)+'*'
  +'\n📊 Saldo líquido da exploração: *R$ '+fmt(Number(s.paidCash||0)-Number(s.lostCash||0))+'*'
  +'\n🏁 *!cofre ranking* para conferir os classificados.'
}
function availableWallet(w){
 const cash=Number(w?.cash),bank=Number(w?.bank)
 if(!Number.isSafeInteger(cash)||cash<0||!Number.isSafeInteger(bank)||bank<0)
  throw new Error('Saldo da carteira/banco inválido.')
 return {cash,bank,balance:cash+bank}
}
async function withPlayer(jid,callback){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query("SET LOCAL statement_timeout='12000ms'")
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[COFRE_DESTINO_KEY+'|'+jid])
  const rec=(await c.query('SELECT state FROM cofre_sombras_sessions WHERE event_key=$1 AND jid=$2 FOR UPDATE',
   [COFRE_DESTINO_KEY,jid])).rows[0]
  const result=await callback(c,rec?.state||null)
  if(result?.state){
   await c.query(`
    INSERT INTO cofre_sombras_sessions(event_key,jid,state,updated_at)
    VALUES($1,$2,$3::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
    ON CONFLICT(event_key,jid) DO UPDATE SET state=EXCLUDED.state,updated_at=EXCLUDED.updated_at
   `,[COFRE_DESTINO_KEY,jid,JSON.stringify(result.state)])
  }
  await c.query('COMMIT')
  return result?.text||''
 }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}
 finally{c.release()}
}
async function liveRanking(c=db){
 const {rows}=await c.query(`
  SELECT s.jid,u.push_name AS name,s.state
  FROM cofre_sombras_sessions s JOIN users u ON u.jid=s.jid
  WHERE s.event_key=$1
 `,[COFRE_DESTINO_KEY])
 return rankCofreDestino(rows)
}
async function rankingText(){
 const ranking=await liveRanking()
 const intro='🏆 *AS 3 PORTAS DO DESTINO — RANKING*\n'
 if(!ranking.length)return intro+'Ainda não há finalistas que sobreviveram às cinco salas.'
 return intro+'━━━━━━━━━━━━━━━━━━\n'
  +ranking.slice(0,10).map((p,i)=>
    (i+1)+'º *'+p.name+'* — líquido R$ '+fmt(p.net)+' • ❤️ '+fmt(p.hp)+' HP').join('\n')
  +'\n━━━━━━━━━━━━━━━━━━\n'
  +'Só entra no ranking quem sobrevive às 5 salas. Desempate: HP e conclusão.'
}
export async function handleCofreDestinoCommand({cmd,args=[],sender,chat,isGroup,reply}){
 if(!['cofre','explorar'].includes(cmd))return false
 if(!isGroup)return false
 await initCofre()
 const e=await eventState()
 if(!e || !Array.isArray(e.groups) || !e.groups.includes(chat))return false
 const arg=String(args?.[0]||'').toLowerCase()
 if(cmd==='cofre'&&['ranking','placar','classificacao','classificação'].includes(arg)){
  await reply(await rankingText())
  return true
 }
 const now=Date.now()
 if(now<Number(e.starts_at)){
  await reply('🗝️ *AS 3 PORTAS DO DESTINO*\n⏰ Evento programado para hoje, das *20h às 22h* (Brasília).\n🎮 *!cofre* para iniciar quando abrir. Entrada gratuita.')
  return true
 }
 try{
 const response=await withPlayer(sender,async(c,old)=>{
  if(now>=Number(e.ends_at)){
   if(!old)return {text:'🗝️ O Cofre do Destino terminou às 22h. Use *!cofre ranking*.'}
   if(old.phase==='active'){
    const s={...old,phase:'expired',finishedAt:now,pendingCash:0,pendingXp:0}
    return {state:s,text:'⏰ *COFRE ENCERRADO!* Prêmios não protegidos foram perdidos.\n'+finalStateText(s)}
   }
   return {text:finalStateText(old)}
  }
  if(!old){
   if(cmd!=='cofre'||arg==='sair')return {text:'🗝️ Digite *!cofre* para iniciar sua única tentativa antes de escolher a porta.'}
   const st=(await c.query('SELECT hp,max_hp FROM stats WHERE jid=$1',[sender])).rows[0]
   if(!st||Number(st.hp)<=0)return {text:'❌ Recupere o HP do personagem antes de entrar no Cofre.'}
   const maxHp=Math.max(1,Number(st.max_hp)||100)
   const s={phase:'active',round:0,hp:Math.max(1,Math.min(maxHp,Number(st.hp))),maxHp,
    pendingCash:0,pendingXp:0,paidCash:0,paidXp:0,earnedCash:0,earnedXp:0,
    lostCash:0,readyAt:0,startedAt:now,finishedAt:0,history:[]}
   return {state:s,text:'🗝️ *EXPLORAÇÃO INICIADA!*\nUma tentativa por jogador. Sem taxa de entrada.\n\n'+stateMenu(s,e)}
  }
  if(old.phase!=='active')return {text:finalStateText(old)}
  if(cmd==='cofre'&&['sair','retirar','parar'].includes(arg)){
   if(![2,4].includes(Number(old.round)))return {text:'🔐 Saída disponível somente após a sala 2 ou 4.\n\n'+stateMenu(old,e)}
   const s={...old,phase:'left',finishedAt:now,pendingCash:0,pendingXp:0}
   return {state:s,text:'🏦 *RETIRADA CONFIRMADA*\n'+finalStateText(s)}
  }
  if(cmd==='cofre'||!arg)return {text:stateMenu(old,e)}
  const door=Number(arg)
  if(![1,2,3].includes(door))return {text:'❌ Use *!explorar 1*, *!explorar 2* ou *!explorar 3*.'}
  if(now<Number(old.readyAt||0)){
   const wait=Math.ceil((Number(old.readyAt)-now)/60000)
   return {text:'⏳ Próxima escolha disponível em '+wait+' minuto(s).\nUse *!cofre* para conferir sua situação.'}
  }
  if(Number(old.round)>=COFRE_DESTINO_ROOMS)return {text:finalStateText(old)}
  const wrow=(await c.query('SELECT cash,bank FROM wallets WHERE jid=$1 FOR UPDATE',[sender])).rows[0]
  if(!wrow)throw new Error('Carteira inexistente.')
  const w=availableWallet(wrow)
  const rule=COFRE_DESTINO_DOORS[door-1]
  if(w.balance<rule.loseCash)return {text:'❌ Saldo insuficiente para arriscar nesta porta.\n'
    +'💳 Perda possível: R$ '+fmt(rule.loseCash)+' • disponível (carteira + banco): R$ '+fmt(w.balance)
    +'\n🛡️ Você pode escolher *!explorar 1* sem risco financeiro.'}
  if(Number(old.earnedCash||0)>=COFRE_DESTINO_CASH_CAP&&door!==1)
   return {text:'🛑 Você já atingiu o teto de R$ 4 milhões em tesouros.\nUse *!explorar 1* para avançar sem arriscar dinheiro.'}
  const result=cofreDestinoResolveChoice({door,roll:randomInt(100),
   availableBalance:w.balance,earnedCash:Number(old.earnedCash||0),
   earnedXp:Number(old.earnedXp||0),maxHp:Number(old.maxHp),hp:Number(old.hp)})
  if(result.loss>0){
   const after=cofreDestinoDebit(w.cash,w.bank,result.loss)
   await c.query(`
    UPDATE wallets SET cash=$1,bank=$2,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT WHERE jid=$3
   `,[after.cash,after.bank,sender])
  }
  const round=Number(old.round)+1
  const s={...old,round,hp:result.hpNext,readyAt:now+COFRE_DESTINO_WAIT_MS,
   earnedCash:Number(old.earnedCash||0)+result.cash,
   earnedXp:Number(old.earnedXp||0)+result.xp,
   lostCash:Number(old.lostCash||0)+result.loss,
   pendingCash:Number(old.pendingCash||0)+result.cash,
   pendingXp:Number(old.pendingXp||0)+result.xp,
   history:[...(Array.isArray(old.history)?old.history:[]),{
    round,door,roll:result.roll,success:result.success,prize:result.cash,
    xp:result.xp,loss:result.loss,hpAfter:result.hpNext,at:now
   }]}
  let report='🚪 *COFRE DO DESTINO — SALA '+round+'/'+COFRE_DESTINO_ROOMS+'*\n'
   +'━━━━━━━━━━━━━━━━━━\n'
   +(result.success?'✨ *PORTA BEM-SUCEDIDA!*':'💀 *A PORTA SE VOLTOU CONTRA VOCÊ!*')
   +'\n🎲 Chance de vitória: '+result.chance+'%'
   +'\n💰 Tesouro encontrado: +R$ '+fmt(result.cash)
   +'\n💸 Dinheiro perdido: -R$ '+fmt(result.loss)
   +'\n✨ XP encontrado: +'+fmt(result.xp)
   +'\n❤️ HP: '+fmt(s.hp)+'/'+fmt(s.maxHp)
  if(s.hp===0){
   s.phase='dead';s.finishedAt=now
   const lostUnprotected=s.pendingCash
   s.pendingCash=0;s.pendingXp=0
   return {state:s,text:report+'\n\n💀 *VOCÊ MORREU NA EXPLORAÇÃO!*'
    +'\n🔐 Tesouro não protegido perdido: R$ '+fmt(lostUnprotected)
    +'\n🏦 Já creditado: R$ '+fmt(s.paidCash)
    +'\n📉 Perdas do bolso/banco: R$ '+fmt(s.lostCash)}
  }
  if(isCofreDestinoCheckpoint(round)){
   const cashToPay=s.pendingCash,xpToPay=s.pendingXp
   if(cashToPay>0){
    const paid=await c.query(`
      UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
      WHERE jid=$2 RETURNING jid
    `,[cashToPay,sender])
    if(!paid.rowCount)throw new Error('Crédito não confirmado.')
   }
   let xpActuallyPaid=0
   if(xpToPay>0){
    const xpGrant=await grantExpInTransaction(c,sender,xpToPay,{ignoreGroupProgressionEvent:true})
    xpActuallyPaid=Number(xpGrant?.awardedGain??xpToPay)
   }
   s.paidCash+=cashToPay;s.paidXp+=xpActuallyPaid
   s.pendingCash=0;s.pendingXp=0
   report+='\n\n🏦 *CHECKPOINT — RECOMPENSAS CREDITADAS!*'
    +'\n💰 +R$ '+fmt(cashToPay)+' no bolso'
    +'\n✨ +'+fmt(xpActuallyPaid)+' XP'
   if(round===COFRE_DESTINO_ROOMS){
    s.phase='finished';s.finishedAt=now
    return {state:s,text:report+'\n\n🏆 *AS 5 SALAS FORAM CONCLUÍDAS!*'
     +'\n💰 Ganhos de exploração: R$ '+fmt(s.paidCash)
     +'\n📉 Perdas da carteira/banco: R$ '+fmt(s.lostCash)
     +'\n📊 Resultado líquido: R$ '+fmt(s.paidCash-s.lostCash)
     +'\n🏅 Você está no ranking dos sobreviventes: *!cofre ranking*.'
     +'\n🎁 Os prêmios extras do pódio serão entregues ao final, às 22h.'}
   }
   report+='\n🔐 Você pode sair com *!cofre sair* ou continuar.'
  }else report+='\n🔒 A recompensa desta sala ainda não está protegida.'
  return {state:s,text:report+'\n⏳ Próxima porta em 5 minutos. Use *!cofre* para acompanhar.'}
 })
 await reply(response)
 }catch(err){
  console.error('[COFRE DESTINO]',String(err?.message||err).slice(0,180))
  await reply('⚠️ Não foi possível registrar a escolha. Nenhum débito ou recompensa parcial foi confirmado. Confira com *!cofre*.')
 }
 return true
}
async function settlePodium(){
 const c=await db.connect()
 try{
  await c.query('BEGIN')
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[COFRE_DESTINO_KEY+':podium'])
  const ranking=await liveRanking(c)
  const winners=ranking.slice(0,3).map((p,i)=>({
   rank:i+1,jid:p.jid,name:p.name,net:p.net,
   cash:COFRE_DESTINO_PRIZES[i].cash,fragments:COFRE_DESTINO_PRIZES[i].fragments
  }))
  const saved=await c.query(`
   INSERT INTO trevo_settings(key,value,updated_at)
   VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::BIGINT)
   ON CONFLICT(key) DO NOTHING RETURNING key
  `,[COFRE_DESTINO_KEY+':podium_done',
   JSON.stringify({at:Date.now(),winners})])
  if(!saved.rowCount){
   const existing=(await c.query('SELECT value FROM trevo_settings WHERE key=$1',
    [COFRE_DESTINO_KEY+':podium_done'])).rows[0]
   await c.query('COMMIT')
   return existing?.value?.winners||[]
  }
  for(const w of winners){
   const credited=await c.query(`
    UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::BIGINT
    WHERE jid=$2 RETURNING jid
   `,[w.cash,w.jid])
   if(!credited.rowCount)throw new Error('Carteira de vencedor não encontrada.')
   await c.query(`
    INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,$3)
    ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+EXCLUDED.quantity
   `,[w.jid,COFRE_DESTINO_FRAG_ID,w.fragments])
  }
  await c.query('COMMIT')
  return winners
 }catch(err){await c.query('ROLLBACK').catch(()=>{});throw err}
 finally{c.release()}
}
function finalAnnouncement(winners){
 if(!winners.length)return '🗝️ *COFRE DO DESTINO ENCERRADO!*\nNenhum participante completou as cinco salas. Não houve premiação de pódio.'
 return '🏆 *COFRE DO DESTINO — RESULTADO FINAL*\n━━━━━━━━━━━━━━━━━━\n'
  +winners.map(w=>w.rank+'º *'+w.name+'* — saldo líquido R$ '+fmt(w.net)
   +'\n🎁 R$ '+fmt(w.cash)+' + '+w.fragments+' Fragmentos da Ascensão').join('\n\n')
  +'\n━━━━━━━━━━━━━━━━━━\n✅ Prêmios entregues automaticamente. Sem necessidade de resgate.'
}
async function sendOnce(sock,e,group,key,message){
 const claim=await db.query(`
  UPDATE cofre_sombras_events
  SET announced=announced || to_jsonb($2::text)
  WHERE event_key=$1 AND NOT (announced ? $2) RETURNING event_key
 `,[COFRE_DESTINO_KEY,key])
 if(!claim.rowCount)return
 try{await sock.sendMessage(group,{text:message})}
 catch(err){
  console.warn('[COFRE DESTINO] envio falhou; liberando para tentativa posterior',String(err?.message||err).slice(0,160))
  // Falha conhecida de envio nao pode suprimir o aviso ao grupo para sempre.
  await db.query(`
    UPDATE cofre_sombras_events SET announced=announced - $2::text
    WHERE event_key=$1 AND announced ? $2
  `,[COFRE_DESTINO_KEY,key]).catch(e=>console.warn('[COFRE DESTINO] remarcacao de aviso',String(e?.message||e).slice(0,130)))
 }
}
async function tick(){
 const sock=activeSocket
 if(!sock)return
 const now=Date.now()
 const e=await eventState()
 if(!e||!Array.isArray(e.groups))return
 // Aviso prévio uma única vez em cada grupo. Não abre portas antes das 20h.
 if(now>=Date.parse('2026-11-11T17:00:00-03:00') && now<COFRE_DESTINO_START){
  for(const group of e.groups){
   await sendOnce(sock,e,group,'preview:'+group,
    '🗝️🌑 *HOJE TEM EVENTO NO ALPHA BOT!*\\n'
    +'━━━━━━━━━━━━━━━━━━\\n'
    +'🎭 *AS 3 PORTAS DO DESTINO*\\n'
    +'🕗 *HOJE — 20h às 22h (Brasília)*\\n'
    +'🚪 *5 rodadas*, com *3 portas* para escolher a cada uma.\\n'
    +'🛡️ Segurança — prêmio certo e recuperação de HP.\\n'
    +'💎 Tesouro Instável — risco moderado, recompensa maior.\\n'
    +'☠️ Abismo Proibido — jackpot de até *R$ 2 milhões* por escolha, mas você pode perder dinheiro do jogo e HP.\\n'
    +'🏆 Pódio especial com dinheiro e *Fragmentos da Ascensão*.\\n'
    +'🎟️ Entrada gratuita, uma tentativa por jogador.\\n'
    +'⏳ 5 minutos entre rodadas.\\n'
    +'⚠️ *Ainda não começou.* Às 20h, envie *!cofre* no grupo para entrar.\\n'
    +'━━━━━━━━━━━━━━━━━━')
  }
  return
 }
 if(now<COFRE_DESTINO_START)return
 if(now<COFRE_DESTINO_END){
  for(const group of e.groups){
   await sendOnce(sock,e,group,'start:'+group,
    '🗝️💎 *EVENTO DE HOJE — AS 3 PORTAS DO DESTINO!*\n━━━━━━━━━━━━━━━━━━\n'
    +'🕗 *20h às 22h — horário de Brasília*\n'
    +'🚪 5 salas, 3 escolhas por sala e apenas 1 tentativa por jogador. Entrada grátis.\n'
    +'🛡️ Segurança: +R$ 30 mil garantidos e cura de HP.\n'
    +'💎 Instável: 40% de ganhar R$ 350 mil ou 60% de perder R$ 100 mil e HP.\n'
    +'☠️ Proibida: 10% de ganhar R$ 2 milhões ou 90% de perder R$ 250 mil e HP.\n'
    +'💳 Perdas são reais no dinheiro do jogo: primeiro carteira, depois banco; nunca gera saldo negativo.\n'
    +'🏦 Checkpoints nas salas 2, 4 e 5. Teto de R$ 4 milhões em tesouros por pessoa.\n'
    +'🥇 Pódio dos sobreviventes das 5 salas: R$ 2 mi + 15 fragmentos;'
    +' 🥈 R$ 1 mi + 10; 🥉 R$ 500 mil + 5.\n'
    +'⏳ 5 min entre escolhas. O sorteio é individual e não pode ser repetido.\n'
    +'🎮 *Envie !cofre para começar!*\n'
    +'🏁 !cofre ranking acompanha os finalistas.')
  }
  return
 }
 const winners=await settlePodium()
 for(const group of e.groups){
  await sendOnce(sock,e,group,'end:'+group,finalAnnouncement(winners))
 }
}
export async function startCofreDestinoScheduler(sock){
 activeSocket=sock
 await prepareEdition()
 if(timer)return
 timer=setInterval(()=>{void tick().catch(err=>console.error('[COFRE DESTINO] tick',String(err?.message||err).slice(0,180)))},15_000)
 timer.unref?.()
 await tick()
}
