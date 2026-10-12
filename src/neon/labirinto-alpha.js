
import {db,getGroupLicense,groupLicenseIsActive} from './db.js'

const KEY='labirinto_alpha_2026_10_12'
const DAY='2026-10-12'
const START=Date.parse(DAY+'T18:00:00-03:00')
const NOTICE=Date.parse(DAY+'T17:50:00-03:00')
const CHOICE_MS=90000
let running=false
let timer=null
const groupMemberCache=new Map()
const n=v=>Number(v||0)
const pick=arr=>arr[Math.floor(Math.random()*arr.length)]
async function mutate(fn){
  const c=await db.connect()
  try{
    await c.query('BEGIN')
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[KEY])
    const found=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[KEY])).rows[0]
    const s=found?.value||{phase:'pending',players:{},round:0}
    const result=await fn(s,c)
    await c.query(`INSERT INTO trevo_settings(key,value) VALUES($1,$2::jsonb)
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXTRACT(EPOCH FROM NOW())::bigint`,
      [KEY,JSON.stringify(s)])
    await c.query('COMMIT')
    return result
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
async function groups(sock){
  const all=await sock.groupFetchAllParticipating()
  const eligible=[]
  for(const jid of Object.keys(all||{})){
    try{const lic=await getGroupLicense(jid);if(lic && groupLicenseIsActive(lic)){
      eligible.push(jid)
      groupMemberCache.set(jid,all[jid]?.participants||[])
    }}
    catch(e){console.warn('[LABIRINTO] license',jid,e?.message)}
  }
  return eligible
}
async function announce(sock,text,targets,mentionAll=false){
  for(const jid of targets){
    try{
      let participants=mentionAll?(groupMemberCache.get(jid)||[]):[]
      if(mentionAll && !participants.length){
        try{participants=(await sock.groupMetadata(jid)).participants||[]}
        catch(error){console.warn('[LABIRINTO] mentions unavailable',jid,error?.message)}
      }
      const mentions=[...new Set((participants||[]).map(p=>p.id).filter(Boolean))]
      await sock.sendMessage(jid,{text:mentionAll?'📣 *ATENÇÃO, @todos!*\n\n'+text:text,...(mentions.length?{mentions}:{})})
      if(mentionAll)console.log('[LABIRINTO] aviso enviado',jid,'membros marcados',mentions.length)
    }catch(e){console.error('[LABIRINTO] send',jid,e?.message)}
    await new Promise(resolve=>setTimeout(resolve,500))
  }
}
function stageText(s){
  const stages=[
    ['🚪 PORTAS','1️⃣ Vermelha • 2️⃣ Azul • 3️⃣ Dourada','!porta'],
    ['🧠 ENIGMA','Qual número completa a sequência 2, 4, 8, 16, __?\n1️⃣ 24 • 2️⃣ 32 • 3️⃣ 64','!enigma'],
    ['💎 BAÚS','1️⃣ Baú de Prata • 2️⃣ Baú de Ouro • 3️⃣ Baú de Pedra','!bau'],
    ['⚖️ DESTINO','1️⃣ Seguro • 2️⃣ Arriscar • 3️⃣ Atalho oculto','!destino'],
    ['👑 CÂMARA FINAL','1️⃣ Coroa • 2️⃣ Orbe • 3️⃣ Chave','!final']
  ]
  const [title,options,command]=stages[s.round-1]
  return '🏰 *LABIRINTO DO ALPHA* — Etapa *'+s.round+'/5*\n'+title+
    '\n\n'+options+'\n\n⏳ 90 segundos. Digite *'+command+' 1*, *2* ou *3*.'+
    '\n🎲 Força, pets e nível não interferem. Só os inscritos podem responder.'
}
async function tick(sock){
  if(running)return
  running=true
  try{
    const now=Date.now()
    if(now<NOTICE||now>START+30*60*1000)return
    let action=null
    const cached=(await db.query('SELECT value FROM trevo_settings WHERE key=$1',[KEY])).rows[0]?.value
    const sendTo=(now<START && !cached?.notice && !cached?.groups?.length)?await groups(sock):[]
    await mutate(async(s,c)=>{
      if(!s.groups?.length)s.groups=sendTo
      if(!s.notice && s.groups?.length && now>=NOTICE && now<START){
        s.notice=now
        action={kind:'notice',targets:s.groups,text:'🏰 *O LABIRINTO DO ALPHA*\n\n⏰ Começa HOJE às *18h00*!\n👥 Até 4 jogadores (vagas globais).\n✅ Digite *!pronto* ANTES das 18h para entrar.\n🎲 Todos têm as mesmas chances: nível, armas e pets não contam.\n🚪 As portas abrirão só para inscritos.\n⏳ Etapas automáticas, mesmo com 1 participante.'}
      }
      if(now>=START && s.phase==='pending'){
        s.phase=Object.keys(s.players).length?'active':'cancelled'
        s.round=s.phase==='active'?1:0
        s.roundEnds=START+CHOICE_MS > now?START+CHOICE_MS:now+CHOICE_MS
        s.secret=s.phase==='active'?1+Math.floor(Math.random()*3):null
        s.notice=s.notice||now
        action={kind:'start',targets:s.groups,text:s.phase==='active'?
          '🏰 *LABIRINTO COMEÇOU!*\n👥 '+Object.keys(s.players).length+' participante(s) confirmado(s).\n\n'+stageText(s):
          '🏰 *LABIRINTO CANCELADO*\nNenhum jogador digitou !pronto antes das 18h. Nenhuma recompensa distribuída.'}
      }else if(s.phase==='active' && now>=s.roundEnds){
        let text='🏰 *RESULTADO — ETAPA '+s.round+'/5*\n'
        const entries=Object.entries(s.players)
        for(const [jid,p] of entries){
          const choice=n(p.choices?.[s.round])
          let gain=0,loss=0
          if(choice){
            if(s.round===2){gain=choice===2?2:0;loss=choice===2?0:1}
            else if(choice===s.secret){gain=s.round===4 && choice===2?3:2}
            else{loss=(s.round===4 && choice===2)?2:1}
          }else{loss=1}
          p.points=n(p.points)+gain
          p.lives=Math.max(0,n(p.lives??3)-loss)
          text+='\n• '+(p.name||'Jogador')+': '+(choice?'opção '+choice:'sem resposta')+
            ' • '+(gain?'+'+gain+' ponto(s)': '-'+loss+' vida(s)')+
            ' • ❤️ '+p.lives+' • ⭐ '+p.points
        }
        if(s.round>=5){
          s.phase='completed'
          const survivors=entries.filter(([,p])=>p.lives>0)
          const finalists=survivors.length?survivors:[...entries]
          finalists.sort((a,b)=>n(b[1].points)-n(a[1].points)||String(a[0]).localeCompare(String(b[0])))
          // Pagamento limitado por número de inscritos; solo não recebe prêmio de quatro pessoas.
          const solo=entries.length===1
          const prizes=solo?[30000]:entries.length===2?[120000,60000]:entries.length===3?[200000,100000,50000]:[300000,150000,75000,20000]
          text+='\n\n🏆 *RESULTADO FINAL*'
          let i=0
          for(const [jid,p] of finalists){
            const money=prizes[i]||0
            if(money){
              await c.query('UPDATE wallets SET cash=cash+$1,updated_at=EXTRACT(EPOCH FROM NOW())::bigint WHERE jid=$2',[money,jid])
              await c.query("INSERT INTO transactions(from_jid,to_jid,amount,type,note) VALUES('system',$1,$2,'labirinto_reward',$3)",[jid,money,KEY+':'+i])
              text+='\n'+(i+1)+'º '+p.name+' — R$ '+money.toLocaleString('pt-BR')
            }
            // Somente o campeão recebe o elmo lendário; prêmio silencioso no inventário.
            // Inventário + vinculação ao vencedor fazem parte da mesma transação do resultado.
            if(i===0 && money){
              const helmId='elmo_labirinto_alpha'
              const exists=await c.query('SELECT id FROM items WHERE id=$1 AND category=$2 AND rarity=$3',[helmId,'helmet','legendary'])
              if(exists.rows.length!==1)throw new Error('Elmo do Labirinto não cadastrado; premiação revertida para nova tentativa.')
              await c.query(`INSERT INTO inventories(jid,item_id,quantity) VALUES($1,$2,1)
                ON CONFLICT(jid,item_id) DO UPDATE SET quantity=inventories.quantity+1`,[jid,helmId])
              await c.query(`INSERT INTO bound_inventory_items(jid,item_id,source_key,quantity)
                VALUES($1,$2,$3,1) ON CONFLICT(jid,item_id,source_key) DO NOTHING`,
                [jid,helmId,KEY+':champion'])
              console.log('[LABIRINTO] Elmo lendário preparado para campeão',JSON.stringify({item:helmId,jid}))
            }
            i++
          }
          text+='\n🎲 Evento encerrado. Premiação única registrada.'
        }else{
          s.round++
          s.roundEnds=now+CHOICE_MS
          s.secret=1+Math.floor(Math.random()*3)
          text+='\n\n'+stageText(s)
        }
        action={kind:'advance',targets:s.groups,text}
      }
    })
    if(action){console.log('[LABIRINTO]',action.kind);await announce(sock,action.text,action.targets,action.kind==='notice')}
  }catch(e){console.error('[LABIRINTO] tick',e?.stack||e)}
  finally{running=false}
}
export function startLabirintoScheduler(sock){
  if(timer)clearInterval(timer)
  timer=setInterval(()=>tick(sock),5000)
  timer.unref?.()
  tick(sock)
}
export async function handleLabirintoCommand({cmd,args,sender,name,reply}){
  if(!['pronto','porta','enigma','bau','destino','final','labirinto'].includes(cmd))return false
  const now=Date.now()
  if(now<NOTICE || now>START+35*60*1000)return false
  let out=''
  await mutate(async(s)=>{
    const count=Object.keys(s.players).length
    if(cmd==='labirinto'){out='🏰 Labirinto: '+(s.phase||'pending')+' • inscritos '+count+'/4'+(s.round?' • etapa '+s.round+'/5':'');return}
    if(cmd==='pronto'){
      if(now>=START||s.phase!=='pending'){out='⏳ Inscrições encerradas às 18h.';return}
      if(s.players[sender]){out='✅ Você já está inscrito! ('+count+'/4)';return}
      if(count>=4){out='🔒 Todas as 4 vagas estão ocupadas.';return}
      s.players[sender]={name:String(name||'Jogador').slice(0,50),lives:3,points:0,choices:{}}
      out='✅ *PRONTO!* Você garantiu a vaga '+(count+1)+'/4. O Labirinto começa às *18h*.'
      return
    }
    if(s.phase!=='active'){out='🏰 O Labirinto não está em rodada ativa.';return}
    if(!s.players[sender]){out='🔒 Somente quem digitou !pronto antes das 18h participa.';return}
    const needed=['','porta','enigma','bau','destino','final'][s.round]
    if(cmd!==needed){out='🚪 Estamos na etapa '+s.round+'. Use *!'+needed+' 1*, 2 ou 3.';return}
    const choice=Number(args[0])
    if(!Number.isInteger(choice)||choice<1||choice>3){out='Escolha somente 1, 2 ou 3 usando *!'+needed+' N*.';return}
    if(now>n(s.roundEnds)){out='⌛ O prazo desta etapa terminou.';return}
    if(s.players[sender].choices[s.round]){out='✅ Sua escolha desta etapa já foi registrada e não pode ser alterada.';return}
    s.players[sender].choices[s.round]=choice
    out='✅ Escolha registrada! Aguarde o encerramento automático da rodada.'
  })
  await reply(out)
  return true
}
