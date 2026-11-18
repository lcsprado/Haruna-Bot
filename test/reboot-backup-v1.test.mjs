import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {planRebootV1Backup,createRebootV1Backup,verifyRebootV1Backup}
 from '../scripts/reboot-backup-v1.mjs';

const valid=(directory)=>({
 ALPHA_BACKUP_ACK:'I_UNDERSTAND_READ_ONLY',
 DATABASE_URL:'postgresql://backup_user:PASS_DO_NOT_PRINT@primary.aivencloud.com:12345/alpha_prod_v2',
 ALPHA_BACKUP_DIR:directory
});
test('backup offline rejeita CI, confirmação ausente, banco incorreto ou host falso',()=>{
 const root=mkdtempSync(join(tmpdir(),'alpha-plan-'));
 try{
  assert.throws(()=>planRebootV1Backup({...valid(root),CI:'true'}),/CI/);
  assert.throws(()=>planRebootV1Backup({...valid(root),ALPHA_BACKUP_ACK:''}),/confirmação/);
  assert.throws(()=>planRebootV1Backup({...valid(root),
   DATABASE_URL:'postgres://u:p@primary.aivencloud.com/alpha_prod'}),/alpha_prod_v2/);
  assert.throws(()=>planRebootV1Backup({...valid(root),
   DATABASE_URL:'postgres://u:p@primary.aivencloud.com.evil/alpha_prod_v2'}),/alpha_prod_v2/);
  const plan=planRebootV1Backup(valid(root));
  assert.equal(plan.database,'alpha_prod_v2');
  assert.equal(plan.pgEnv.PGSSLMODE,'verify-full');
  assert.equal(plan.pgEnv.DATABASE_URL,undefined);
  assert.equal(plan.pgEnv.PGPASSWORD,'PASS_DO_NOT_PRINT');
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('backup gera dump fora do Git, TOC + checksum, sem restore nem vazamento de senha',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'alpha-archive-'));
 const commands=[];
 const runner=(cmd,args,opts)=>{
  commands.push({cmd,args,timeout:opts.timeout,password:opts.env.PGPASSWORD});
  assert.equal(args.join(' ').includes('PASS_DO_NOT_PRINT'),false);
  if(cmd==='pg_dump'){
   const file=args.find(x=>x.startsWith('--file=')).slice(7);
   writeFileSync(file,Buffer.alloc(3000,42));
   return {status:0,stdout:''};
  }
  if(cmd==='pg_restore')return {status:0,
   stdout:Array.from({length:12},(_,i)=>'1; 1259 TABLE DATA public t'+i).join('\n')};
  throw Error('Unexpected command');
 };
 try{
  const saved=await createRebootV1Backup({
   env:valid(dir),runner,now:new Date('2026-11-17T22:00:00Z')
  });
  assert.equal(saved.restoreTested,false);
  assert.equal(saved.tableDataEntries,12);
  assert.deepEqual(commands.map(x=>x.cmd),['pg_dump','pg_restore']);
  assert.match(saved.archive,/alpha-v1-2026-11-17T22-00-00/);
  const record=JSON.parse(readFileSync(saved.manifest,'utf8'));
  assert.equal(record.source_database,'alpha_prod_v2');
  assert.equal(record.restore_tested,false);
  assert.equal(record.sha256,saved.sha256);
  assert.equal(record.bytes,3000);
  assert.equal(JSON.stringify(record).includes('PASS_DO_NOT_PRINT'),false);
  assert.equal((await verifyRebootV1Backup(saved.manifest)).valid,true);
  writeFileSync(saved.archive,Buffer.alloc(3000,43));
  await assert.rejects(()=>verifyRebootV1Backup(saved.manifest),/Checksum/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('pg_dump falhando não deixa cópia inválida e não chama pg_restore',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'alpha-archive-failure-'));
 let calls=0;
 try{
  await assert.rejects(()=>createRebootV1Backup({env:valid(dir),
   runner:(cmd)=>{calls++;return {status:1,error:new Error('no client')}}
  }),/não foi concluído/);
  assert.equal(calls,1);
  assert.deepEqual((await import('node:fs')).readdirSync(dir),[]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
