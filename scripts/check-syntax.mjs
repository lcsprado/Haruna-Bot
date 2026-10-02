import {readdirSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'

function files(dir){
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const path=join(dir,entry.name)
    if(entry.isDirectory()) return entry.name==='node_modules'?[]:files(path)
    return /\.(?:js|mjs|cjs)$/.test(entry.name)?[path]:[]
  })
}

for(const file of [...files('src'),...files('scripts'),...files('test')]){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'})
  if(result.status!==0) process.exit(result.status||1)
}
console.log('Sintaxe validada em todos os arquivos JavaScript.')
