// Retry only PostgreSQL SQLSTATE 40P01 after the transaction has rolled back.
// A rejected attempt must never commit damage, inventory spending or rewards.
export async function retryBossDeadlock(action,{maxRetries=5,sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),random=Math.random,onRetry=()=>{}}={}){
  for(let attempt=0;;attempt++){
    try{
      return await action()
    }catch(error){
      if(error?.code!=='40P01'||attempt>=maxRetries) throw error
      const waitMs=Math.min(1800,150*(attempt+1)+Math.floor(random()*250))
      onRetry({attempt:attempt+1,waitMs})
      await sleep(waitMs)
    }
  }
}
