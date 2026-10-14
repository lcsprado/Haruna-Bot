// Reduce the wire payload of large Signal records without changing their JSON shape.
// The database checks the committed revision first; callers fall back to the original
// full upsert whenever the revision is missing/stale or a patch is not worthwhile.
export function planAuthJsonPatch(previous,next,{minBytes=16384,maxOperations=32}={}){
  if(!previous||Buffer.byteLength(next)<minBytes)return null
  const operations=[]
  let visited=0
  const limit=Symbol('patch limit')
  const push=op=>{operations.push(op);if(operations.length>maxOperations)throw limit}
  function walk(before,after,path){
    if(++visited>100000||path.length>20)throw limit
    if(Object.is(before,after))return
    const a=JSON.stringify(before),b=JSON.stringify(after)
    if(a===b)return
    // Replacing a small subtree avoids long chains of jsonb_set on individual bytes.
    if(path.length&&b.length<=2048){push({path,value:b});return}
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&Array.isArray(before)===Array.isArray(after)){
      if(Array.isArray(before)){
        if(before.length!==after.length){push({path,value:b});return}
        for(let i=0;i<after.length;i++)walk(before[i],after[i],[...path,String(i)])
      }else{
        for(const key of Object.keys(before))if(!Object.hasOwn(after,key))push({path:[...path,key],remove:true})
        for(const key of Object.keys(after)){
          if(!Object.hasOwn(before,key))push({path:[...path,key],value:JSON.stringify(after[key])})
          else walk(before[key],after[key],[...path,key])
        }
      }
    }else push({path,value:b})
  }
  try{
    walk(JSON.parse(previous),JSON.parse(next),[])
  }catch{return null}
  if(operations.some(op=>op.path.length===0))return null
  const payloadBytes=operations.reduce((n,op)=>n+Buffer.byteLength(JSON.stringify(op.path))+Buffer.byteLength(op.value||''),0)
  if(payloadBytes>=Buffer.byteLength(next)/2)return null
  return {operations,payloadBytes,valueJsonBytes:operations.reduce((n,op)=>n+Buffer.byteLength(op.value||''),0)}
}

export function authPatchQuery(sessionId,type,id,revision,operations){
  const values=[sessionId,type,id,revision]
  let expression='value'
  for(const op of operations){
    values.push(op.path)
    const path='$'+values.length+'::text[]'
    if(op.remove)expression='('+expression+' #- '+path+')'
    else{
      values.push(op.value)
      expression='jsonb_set('+expression+','+path+',$'+values.length+'::jsonb,true)'
    }
  }
  return {
    text:`UPDATE auth_keys SET value=${expression},updated_at=NOW()
      WHERE session_id=$1 AND type=$2 AND id=$3 AND md5(value::text)=$4
      RETURNING type,id,md5(value::text) AS revision`,
    values
  }
}
