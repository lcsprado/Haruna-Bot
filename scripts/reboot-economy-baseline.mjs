#!/usr/bin/env node
// Linha-base de negócios do Alpha Bot (somente leitura, SEM acessar banco).
// Mede a velocidade de geração de moeda antes de propor quaisquer alterações.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SOURCE=fileURLToPath(new URL('../src/neon/progression.js',import.meta.url));
const ROW=/\{id:'([^']+)',name:'([^']+)',price:(\d+),profitHour:(\d+),capacityHours:(\d+)\}/g;

export function extractBusinessCatalog(content){
  const source=String(content||'');
  const start=source.indexOf('export const BUSINESSES=[');
  if(start<0)throw new Error('Catálogo BUSINESSES não localizado.');
  const end=source.indexOf('\n]',start);
  if(end<0)throw new Error('Fim do catálogo BUSINESSES não localizado.');
  const section=source.slice(start,end);
  const rows=[...section.matchAll(ROW)].map(m=>({
    id:m[1],name:m[2],price:Number(m[3]),
    profitHour:Number(m[4]),capacityHours:Number(m[5])
  }));
  if(!rows.length)throw new Error('Não foi possível extrair os negócios. Atualize a auditoria.');
  return rows;
}
export function projectBusinessIncome({id,name,price,profitHour,capacityHours},level=1){
  if(!Number.isInteger(level)||level<1)throw new RangeError('Nível inválido.');
  const multiplier=1+(level-1)*.25;
  // Uma coleta após 24h de espera (limitada pela capacidade de cada negócio).
  // Sem taxas, bônus, eventos ou upgrades pagos.
  const hours=Math.min(24,capacityHours+level-1);
  const dailyGross=Math.floor(profitHour*hours*multiplier);
  return {id,name,level,price,grossPer24Hours:dailyGross,
    theoreticalPaybackDays:Number((price/Math.max(1,dailyGross)).toFixed(2))};
}
export function businessEconomicBaseline(source){
  return extractBusinessCatalog(source).flatMap(b=>
    [1,5].map(level=>projectBusinessIncome(b,level)));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=businessEconomicBaseline(readFileSync(SOURCE,'utf8'));
  if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(result,null,2)+'\n');
  else{
    process.stdout.write('LINHA-BASE DA ECONOMIA — SOMENTE LEITURA\n');
    process.stdout.write('Simulação: 1 coleta após 24h, sem taxa, eventos ou custos de upgrade.\n');
    for(const x of result){
      process.stdout.write(x.name+' Lv'+x.level+
        ' | custo R$ '+x.price.toLocaleString('pt-BR')+
        ' | receita bruta/24h R$ '+x.grossPer24Hours.toLocaleString('pt-BR')+
        ' | retorno teórico '+x.theoreticalPaybackDays+' dias\n');
    }
  }
}
