// Compara falhas de testes atuais com a base em produção, sem esconder falhas antigas.
import {spawnSync} from 'node:child_process'
const baseline=process.env.PVP_BASELINE_DIR
if(!baseline)throw new Error('PVP_BASELINE_DIR ausente')
function run(dir){
 const p=spawnSync('npm',['test'],{cwd:dir,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024})
 const log=(p.stdout||'')+'\n'+(p.stderr||'')
 const failures=[...log.matchAll(/^not ok \d+ - (.+)$/gm)].map(m=>m[1].trim()).sort()
 if(p.error)throw p.error
 if(p.status!==0&&!failures.length)throw new Error('Suite terminou sem lista de falhas: '+log.slice(-2000))
 return {status:p.status,failures}
}
const base=run(baseline)
const head=run(process.cwd())
console.log('Base whatsapp-only: status='+base.status+', falhas='+base.failures.length)
console.log('Branch PvP: status='+head.status+', falhas='+head.failures.length)
console.log('Falhas antigas na base: '+JSON.stringify(base.failures))
const newFailures=head.failures.filter(x=>!base.failures.includes(x))
if(newFailures.length)throw new Error('Falhas novas introduzidas pelo branch PvP: '+JSON.stringify(newFailures))
console.log('OK: nenhuma nova falha de regressão comparada com a produção.')
