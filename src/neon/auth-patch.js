// Reduce the wire payload of large Signal records without changing their JSON shape.
// The database checks the committed revision first; callers fall back to the original
// full upsert whenever the revision is missing/stale or a patch is not worthwhile.
export function planAuthBufferDelta(previous,next){
  // Work on decoded bytes: an insertion can shift all subsequent Base64 characters.
  // Copy unchanged byte ranges inside PostgreSQL; submit only changed bytes.
  if(typeof previous!=='string'||typeof next!=='string'||next.length<16384)return null
  const before=Buffer.from(previous,'base64'),after=Buffer.from(next,'base64')
  if(before.toString('base64')!==previous||after.toString('base64')!==next)return null
  const a=before.toString('latin1'),b=after.toString('latin1'),block=32,index=new Map()
  for(let i=0;i+block<=a.length;i+=block){
    const key=a.slice(i,i+block),positions=index.get(key)||[]
    if(positions.length<4)positions.push(i)
    index.set(key,positions)
  }
  const pieces=[]
  let cursor=0,literalStart=0
  const literal=end=>{if(end>literalStart)pieces.push({data:after.subarray(literalStart,end).toString('base64')})}
  while(cursor<b.length){
    let bestStart=0,bestLength=0
    for(const position of index.get(b.slice(cursor,cursor+block))||[]){
      let length=block
      while(cursor+length<b.length&&position+length<a.length&&b[cursor+length]===a[position+length])length++
      if(length>bestLength){bestStart=position;bestLength=length}
    }
    if(bestLength>=block){
      literal(cursor);pieces.push({start:bestStart+1,length:bestLength})
      cursor+=bestLength;literalStart=cursor
    }else cursor++
    if(pieces.length>32)return null
  }
  literal(cursor)
  const payloadBytes=Buffer.byteLength(JSON.stringify(pieces))
  if(pieces.length>32||payloadBytes>=Buffer.byteLength(next)/2)return null
  return {pieces,payloadBytes,valueJsonBytes:pieces.reduce((n,p)=>n+(p.data?.length||0),0)}
}

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
    if(before?.type==='Buffer'&&after?.type==='Buffer'&&typeof before.data==='string'&&typeof after.data==='string'){
      const delta=planAuthBufferDelta(before.data,after.data)
      if(delta){push({path:[...path,'data'],bufferDelta:delta});return}
    }
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
  const payloadBytes=operations.reduce((n,op)=>n+Buffer.byteLength(JSON.stringify(op.path))+(op.bufferDelta?.payloadBytes??Buffer.byteLength(op.value||'')),0)
  if(payloadBytes>=Buffer.byteLength(next)/2)return null
  return {operations,payloadBytes,valueJsonBytes:operations.reduce((n,op)=>n+(op.bufferDelta?.valueJsonBytes??Buffer.byteLength(op.value||'')),0)}
}

export function authPatchQuery(sessionId,type,id,revision,operations){
  const values=[sessionId,type,id,revision]
  let expression='value'
  for(const op of operations){
    values.push(op.path)
    const path='$'+values.length+'::text[]'
    if(op.remove)expression='('+expression+' #- '+path+')'
    else if(op.bufferDelta){
      const parts=op.bufferDelta.pieces.map(piece=>{
        if(piece.data!==undefined){values.push(piece.data);return "decode($"+values.length+"::text,'base64')"}
        values.push(piece.start,piece.length)
        return "substring(decode(value#>>"+path+",'base64') FROM $"+(values.length-1)+"::integer FOR $"+values.length+'::integer)'
      })
      expression="jsonb_set("+expression+','+path+",to_jsonb(replace(encode("+parts.join('||')+",'base64'),E'\\n','')),true)"
    }
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
