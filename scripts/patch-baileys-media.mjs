import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'

// rc14's media fetch drops timeout/signal options and does not close its upstream
// response when the decryption stream is destroyed. Fix only these two boundaries.
// Fail closed on an unexpected dependency version/source instead of applying a guess.
const require=createRequire(import.meta.url)
const root=dirname(dirname(require.resolve('baileys')))
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
if(manifest.version==='6.7.24'){
  // Baileys 6.7.24 considera offline="0" verdadeiro e encaminha
  // mensagens online à fila offline, que pode ficar bloqueada.
  // Aplica o ajuste à versão publicada somente se a origem corresponder.
  const path=join(root,'lib/Socket/messages-recv.js')
  let source=await readFile(path,'utf8')
  const fixes=[
    ["const isOffline = !!node.attrs.offline;", "const isOffline = node.attrs.offline === '1';"],
    ["node.attrs.offline ? 'append' : 'notify'", "node.attrs.offline === '1' ? 'append' : 'notify'"]
  ]
  let changed=false
  for(const [before,after] of fixes){
    if(source.includes(after))continue
    if(source.split(before).length!==2){
      throw Error('Baileys 6.7.24: origem offline alterada; patch cancelado por segurança.')
    }
    source=source.replace(before,after)
    changed=true
  }
  if(changed)await writeFile(path,source)
  console.log('Baileys 6.7.24: atributos offline corrigidos; patch '+(changed?'aplicado.':'ja presente.'))
  process.exit(0)
}
if(manifest.version!=='7.0.0-rc14')throw Error('Revalidate the bounded media patch before changing Baileys versions.')
const path=join(root,'lib/Utils/messages-media.js')
const marker='// Alpha bounded media transport (rc14)'
const explicitSignal='signal: options.signal ?? (Number(options.timeout)>0?AbortSignal.timeout(Number(options.timeout)):undefined)'
let source=await readFile(path,'utf8')
if(source.includes(marker)){
  const oldDefault='signal: options.signal ?? AbortSignal.timeout(Number(options.timeout)||30000)'
  if(source.includes(oldDefault)){
    source=source.replace(oldDefault,explicitSignal)
    await writeFile(path,source)
  }else if(!source.includes(explicitSignal))throw Error('Unexpected bounded media timeout patch.')
  console.log('Baileys bounded media transport already applied.')
}else{
  const fetchBefore=`        dispatcher: options.dispatcher,
        method: 'GET',
        headers: options.headers
    });`
  const pipeBefore='    return fetched.pipe(output, { end: true });'
  if(source.split(fetchBefore).length!==2||source.split(pipeBefore).length!==2){
    throw Error('Unexpected Baileys media source: bounded transport patch was not applied.')
  }
  source=source.replace(fetchBefore,`${marker}
        dispatcher: options.dispatcher,
        method: 'GET',
        headers: options.headers,
        ${explicitSignal}
    });`)
  source=source.replace(pipeBefore,`    fetched.once('error', error => output.destroy(error));
    output.once('close', () => fetched.destroy());
${pipeBefore}`)
  await writeFile(path,source)
  console.log('Baileys bounded media transport applied (rc14).')
}
