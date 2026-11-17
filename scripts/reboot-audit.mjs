#!/usr/bin/env node
// Auditoria ESTÁTICA do reboot. Somente leitura de arquivos locais.
// Não importa db.js, não usa DATABASE_URL, não executa SQL e não altera produção.
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join,relative,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=resolve(fileURLToPath(new URL('..',import.meta.url)));
const SCAN_DIRS=['src/neon','web'];
const EXTENSIONS=new Set(['.js','.mjs','.json','.sql','.html','.css']);
const COLLAB=/\b(?:collab(?:oration)?|pecados?|sete[\s_-]*pecados|seven[\s_-]*sins|essencia_pecado\w*|fragmento_ascensao_pecados\w*)\b|pecado_/i;
const ECONOMY=/\b(?:profitHour|cashPool|rewardCash|pocoCashForFloor|cashNetProfitBasisPoints|prize(?:s)?|reward(?:s)?Cash|levelReward|pay(?:out)?|credit|grantExpInTransaction|cash_bonus)\b/i;
const SQL_TABLE=/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"?public"?\.)?)("?\w+"?)/gi;

export function analyzeRebootSource(source,path){
  const collab=[],economy=[],tables=[];
  const lines=String(source||'').split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(COLLAB.test(line))collab.push(i+1);
    if(ECONOMY.test(line))economy.push(i+1);
  }
  for(const match of String(source||'').matchAll(SQL_TABLE))tables.push(match[1].replaceAll('"','').toLowerCase());
  return {path,collabLines:collab,economyLines:economy,tables:[...new Set(tables)].sort()};
}
function listSources(base,relativePath){
  const abs=join(base,relativePath);
  let dirents=[];
  try{dirents=readdirSync(abs,{withFileTypes:true})}catch{return []}
  return dirents.flatMap(entry=>{
    const child=join(relativePath,entry.name);
    if(entry.isSymbolicLink())return [];
    if(entry.isDirectory())return listSources(base,child);
    if(!entry.isFile()||!EXTENSIONS.has(extname(entry.name)))return [];
    const stats=statSync(join(base,child));
    if(stats.size>5_000_000)return [];
    return [child.split('\\').join('/')];
  });
}
export function auditRebootSources(root=ROOT){
  const list=SCAN_DIRS.flatMap(d=>listSources(root,d)).sort();
  const files=list.map(path=>analyzeRebootSource(readFileSync(join(root,path),'utf8'),path));
  const affected=files.filter(file=>file.collabLines.length||file.economyLines.length||file.tables.length);
  return {
    readOnly:true,
    sourceFilesScanned:list.length,
    collabFiles:files.filter(f=>f.collabLines.length).length,
    economyFiles:files.filter(f=>f.economyLines.length).length,
    tablesFound:[...new Set(files.flatMap(f=>f.tables))].sort(),
    files:affected
  };
}
function render(report){
  const leaders=report.files.filter(f=>f.collabLines.length)
    .sort((a,b)=>b.collabLines.length-a.collabLines.length);
  const economic=report.files.filter(f=>f.economyLines.length)
    .sort((a,b)=>b.economyLines.length-a.economyLines.length);
  return [
    'AUDITORIA ESTÁTICA DO REBOOT — SEM ACESSO AO BANCO',
    'Arquivos examinados: '+report.sourceFilesScanned,
    'Com referências à collab: '+report.collabFiles,
    'Com possíveis fontes econômicas: '+report.economyFiles,
    'Tabelas definidas no código: '+report.tablesFound.length,
    '',
    'REFERÊNCIAS DE COLLAB (arquivo:linhas — quantidade):',
    ...leaders.map(f=>f.path+':'+f.collabLines.slice(0,12).join(',')+
      (f.collabLines.length>12?',...':'')+' — '+f.collabLines.length),
    '',
    'REFERÊNCIAS ECONÔMICAS (20 arquivos mais frequentes):',
    ...economic.slice(0,20).map(f=>f.path+':'+f.economyLines.slice(0,8).join(',')+
      (f.economyLines.length>8?',...':'')+' — '+f.economyLines.length),
    '',
    'TABELAS DETECTADAS NO CÓDIGO (confirmação no schema clonado obrigatória):',
    report.tablesFound.join(', ')
  ].join('\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditRebootSources();
  process.stdout.write(process.argv.includes('--json')
    ?JSON.stringify(report,null,2)+'\n'
    :render(report)+'\n');
}
