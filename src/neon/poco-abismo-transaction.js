// Transação única por jogador: sincroniza progresso, créditos e saques.
// Esta função não inicia eventos, não importa o banco global e é testável
// com um cliente PostgreSQL descartável ou uma simulação transacional.
export async function pocoRunPlayerTransaction(db,{jid,name,key,settlementKey,season,empty,now=Date.now},perform){
 if(!db?.connect||!jid||!key||!settlementKey||!season||typeof empty!=='function'||typeof perform!=='function')
  throw new TypeError('Transação do Poço exige parâmetros completos')
 const c=await db.connect()
 let opened=false,committed=false
 try{
  await c.query('BEGIN')
  opened=true
  await c.query("SET LOCAL statement_timeout='25000ms'")
  // Lock de temporada também usado na liquidação: garante que o Top 3
  // reflita todos os commits concluídos antes do fechamento.
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[settlementKey])
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key])
  const row=(await c.query('SELECT value FROM trevo_settings WHERE key=$1 FOR UPDATE',[key])).rows[0]
  const current=row?.value?.season===season?structuredClone(row.value):empty(name)
  current.name=String(name||current.name||'Jogador').slice(0,48)
  // Capturar o horário depois dos locks impede que decisões já vencidas
  // sejam processadas com um timestamp anterior à fila do banco.
  const result=await perform(c,current,now())
  await c.query(`INSERT INTO trevo_settings(key,value,updated_at)
   VALUES($1,$2::jsonb,EXTRACT(EPOCH FROM NOW())::bigint)
   ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at`,
   [key,JSON.stringify(current)])
  await c.query('COMMIT')
  committed=true
  return result
 }catch(error){
  if(opened&&!committed)await c.query('ROLLBACK').catch(()=>{})
  throw error
 }finally{c.release()}
}
