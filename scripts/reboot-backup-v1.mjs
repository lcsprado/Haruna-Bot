#!/usr/bin/env node
// Backup offline da V1. Não executa SQL de escrita, restore ou reset.
// Só executa com --create e consentimento explícito no terminal do operador.
// GitHub Actions NUNCA deve chamar --create; testes injetam um runner falso.
import {spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,chmodSync,readFileSync,
  renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,join,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE_DB='alpha_prod_v2';
const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));

function under(path,parent){
  const p=resolve(path),base=resolve(parent);
  return p===base||p.startsWith(base+sep);
}
export function planRebootV1Backup(env=process.env,{home=homedir()}={}){
  if(env.GITHUB_ACTIONS==='true'||env.CI==='true')
    throw Error('Backup externo proibido na CI');
  if(env.ALPHA_BACKUP_ACK!=='I_UNDERSTAND_READ_ONLY')
    throw Error('Backup exige confirmação explícita ALPHA_BACKUP_ACK');
  let url;
  try{url=new URL(String(env.DATABASE_URL||''))}
  catch{throw Error('DATABASE_URL inválida, não iniciar backup');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||
    !url.hostname.endsWith('.aivencloud.com')||
    decodeURIComponent(url.pathname.slice(1))!==SOURCE_DB)
    throw Error('Backup exige banco alpha_prod_v2 no Aiven, não outro destino');
  if(!url.username||!url.password)throw Error('Credenciais do Aiven incompletas');
  const dir=resolve(env.ALPHA_BACKUP_DIR||join(home,'AlphaBot-Backups'));
  if(under(dir,ROOT))throw Error('Backup deve ficar fora do repositório Git');
  const pgEnv={...env,
    PGHOST:url.hostname,PGPORT:url.port||'5432',
    PGUSER:decodeURIComponent(url.username),
    PGPASSWORD:decodeURIComponent(url.password),
    PGDATABASE:SOURCE_DB,PGSSLMODE:'verify-full',
    PGAPPNAME:'alpha-bot-v1-readonly-backup'};
  // Aceita a CA do Aiven fornecida em ambiente local, sem gravá-la no manifesto.
  const caPem=String(env.ALPHA_AIVEN_CA_PEM||'').replace(/\\n/g,'\n').trim();
  if(caPem&&(!caPem.startsWith('-----BEGIN CERTIFICATE-----')||
    !caPem.endsWith('-----END CERTIFICATE-----')))
    throw Error('ALPHA_AIVEN_CA_PEM inválido');
  delete pgEnv.DATABASE_URL;
  delete pgEnv.ALPHA_AIVEN_CA_PEM;
  return {directory:dir,database:SOURCE_DB,pgEnv,caPem};
}
export async function sha256File(path){
  const hash=createHash('sha256');
  for await(const part of createReadStream(path))hash.update(part);
  return hash.digest('hex');
}
function assertRun(r,label){
  if(r?.error||r?.status!==0)
    throw Error(label+' não foi concluído. Confirme cliente PostgreSQL, TLS, permissões e conexão.');
}
function archiveFileName(now){
  const date=now.toISOString().replace(/[:.]/g,'-');
  return 'alpha-v1-'+date+'-'+randomBytes(4).toString('hex')+'.dump';
}
export async function createRebootV1Backup({env=process.env,runner=spawnSync,now=new Date(),
  home=homedir()}={}){
  const plan=planRebootV1Backup(env,{home});
  if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
    throw Error('Data inválida');
  const previousUmask=process.umask(0o077);
  let partial,caPath;
  try{
    mkdirSync(plan.directory,{recursive:true,mode:0o700});
    chmodSync(plan.directory,0o700);
    if(plan.caPem){
      caPath=join(plan.directory,'.aiven-ca-'+randomBytes(8).toString('hex')+'.pem');
      writeFileSync(caPath,plan.caPem+'\n',{flag:'wx',mode:0o600});
      plan.pgEnv.PGSSLROOTCERT=caPath;
    }
    const file=join(plan.directory,archiveFileName(now));
    partial=file+'.partial';
    if(existsSync(file)||existsSync(partial))throw Error('Arquivo de backup já existe');
    const out=runner('pg_dump',['--format=custom','--compress=6','--no-owner',
      '--no-acl','--lock-wait-timeout=5000','--dbname='+SOURCE_DB,'--file='+partial],
      {env:plan.pgEnv,encoding:'utf8',timeout:25*60*1000,maxBuffer:1024*1024});
    assertRun(out,'pg_dump');
    const bytes=statSync(partial).size;
    if(bytes<1024)throw Error('Arquivo de backup vazio ou incompleto');
    const toc=runner('pg_restore',['--list',partial],
      {env:plan.pgEnv,encoding:'utf8',timeout:2*60*1000,maxBuffer:4*1024*1024});
    assertRun(toc,'Inspeção de arquivo pg_restore');
    const dataTableCount=(String(toc.stdout||'').match(/\bTABLE DATA\b/g)||[]).length;
    if(dataTableCount<10)throw Error('Backup não contém as tabelas de dados esperadas');
    const hash=await sha256File(partial);
    renameSync(partial,file);partial=null;
    const manifest={
      format:'alpha-bot-v1-archive-v1',source_database:SOURCE_DB,
      created_at:now.toISOString(),filename:file.split(sep).at(-1),
      bytes,sha256:hash,table_data_entries:dataTableCount,
      toc_checked:true,restore_tested:false,
      verification:'checksum-and-toc-only; full restore test still required'
    };
    writeFileSync(file+'.manifest.json',JSON.stringify(manifest,null,2)+'\n',
      {flag:'wx',mode:0o600});
    return {archive:file,manifest:file+'.manifest.json',sha256:hash,
      bytes,tableDataEntries:dataTableCount,restoreTested:false};
  }finally{
    if(caPath)rmSync(caPath,{force:true});
    if(partial)rmSync(partial,{force:true});
    process.umask(previousUmask);
  }
}
export async function verifyRebootV1Backup(manifestFile){
  const path=resolve(manifestFile);
  const record=JSON.parse(readFileSync(path,'utf8'));
  if(record.format!=='alpha-bot-v1-archive-v1'||
    record.source_database!==SOURCE_DB||
    !/^alpha-v1-[a-zA-Z0-9T-]+\.dump$/.test(record.filename)||
    !/^[a-f0-9]{64}$/.test(record.sha256)||
    !Number.isSafeInteger(record.bytes)||record.bytes<1024)
    throw Error('Manifesto de backup inválido');
  const archive=join(dirname(path),record.filename);
  if(statSync(archive).size!==record.bytes)throw Error('Tamanho do backup não confere');
  const hash=await sha256File(archive);
  if(hash!==record.sha256)throw Error('Checksum do backup divergente');
  return {valid:true,archive,sha256:hash,restoreTested:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const mode=process.argv[2];
    if(mode==='--create'){
      const result=await createRebootV1Backup();
      console.log('Arquivo local criado e checado:',result.archive);
      console.log('Manifesto SHA-256:',result.manifest);
      console.log('Ainda obrigatório: restaurar o arquivo em banco isolado e comparar dados.');
    }else if(mode==='--verify'&&process.argv.length===4){
      const report=await verifyRebootV1Backup(process.argv[3]);
      console.log('Checksum válido:',report.archive);
      console.log('Restauração ainda não verificada.');
    }else{
      console.error('Uso: node scripts/reboot-backup-v1.mjs --create | --verify CAMINHO.manifest.json');
      process.exitCode=2;
    }
  }catch(e){
    console.error('Backup NÃO validado:',String(e?.message||e));
    process.exitCode=1;
  }
}
