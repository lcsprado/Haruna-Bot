import {readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {dirname,join} from 'node:path'

// rc14's media fetch drops timeout/signal options and does not close its upstream
// response when the decryption stream is destroyed. Fix only these two boundaries.
// Fail closed on an unexpected dependency version/source instead of applying a guess.
const require=createRequire(import.meta.url)
const root=dirname(dirname(require.resolve('baileys')))
const manifest=JSON.parse(await readFile(join(root,'package.json'),'utf8'))
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
