#!/usr/bin/env node
// Auditoria C4f somente de código Git. Não lê dados de jogadores nem usa SQL/rede.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {gtEffectiveSponsorCatalog} from '../src/neon/gt-alpha-sponsor-rules.js';
import {V2_EVENT_BUDGET} from '../src/neon/reboot-economy-policy.js';

export const C4F_SOURCES=Object.freeze({
 bingoHalloween:'src/neon/bingo-reboot.js',
 bingoNov15:'src/neon/bingo-20261115.js',
 bingoNov16:'src/neon/bingo-20261116.js',
 auction:'src/neon/auction-20261115-2100.js',
 auctionRewards:'src/neon/auction-20261115-rewards.js',
 loans:'src/neon/loans.js',
 sponsors:'src/neon/gt-alpha-sponsors.js'
});
function verify(src,re,what){
 if(!re.test(src))throw new Error('Código alterado, revisão necessária: '+what);
}
function historical(src,auction=false){
 const key=src.match(/const KEY='([^']+)'/)?.[1];
 const end=src.match(auction?/const END=Date\.parse\('([^']+)'\)/:
   /const EVENT_END=Date\.parse\('([^']+)'\)/)?.[1];
 const ms=Date.parse(end||'');
 if(!key||!Number.isFinite(ms)||ms>=Date.parse('2026-11-17T00:00:00-03:00'))
   throw new Error('Evento histórico não encerrado');
 return {key,end,closed:true,canReuseInV2:false};
}
export function auditAncillaryCashSources(files){
 for(const key of Object.keys(C4F_SOURCES))
   if(typeof files?.[key]!=='string')throw new TypeError('Fonte ausente: '+key);
 const legacyBingo=['bingoHalloween','bingoNov15','bingoNov16'].map(key=>{
  const src=files[key],event=historical(src);
  const rewards=src.match(/const REWARD=\{([^}]+)\}/)?.[1];
  if(!rewards)throw Error('Prêmios de bingo não reconhecidos');
  verify(src,/UPDATE wallets SET cash=cash\+\$1/,'Premiação de bingo');
  return {...event,totalNominal:[...rewards.matchAll(/(?:row|twoRows|full):(\d+)/g)]
    .reduce((a,m)=>a+Number(m[1]),0)};
 });
 const auction=historical(files.auction,true);
 verify(files.auction,/SET cash=cash-\$1,bank=bank-\$2/,'Lance debitado');
 verify(files.auction,/SET cash=cash\+\$1,bank=bank\+\$2/,'Estorno de lance');
 verify(files.auctionRewards,/equipment_star_forges/,'Premiação com forja');
 verify(files.loans,/const INTEREST_RATE_PER_HOUR=0\.02/,'Taxa de juros');
 verify(files.loans,/const MAX_INTEREST_HOURS=50/,'Prazo de juros');
 verify(files.loans,/UPDATE wallets SET cash=cash-\$1,bank=bank-\$2/,'Débito de empréstimo');
 verify(files.loans,/UPDATE wallets SET cash=cash\+\$1/,'Crédito de empréstimo');
 verify(files.sponsors,/\[sponsor.cap,now,row.jid\]/,'Pagamento patrocinador');
 verify(files.sponsors,/gtEffectiveSponsorCatalog\(\)\.map/,'Menu patrocinador');
 const candidates=gtEffectiveSponsorCatalog({enabled:true});
 const sponsorCash=candidates.find(x=>x.kind==='cash')?.cap;
 if(sponsorCash!==5000||candidates.length!==3)throw Error('Patrocínio V2 fora do orçamento');
 const ranking=V2_EVENT_BUDGET.gtWeeklyPrizes.reduce((a,b)=>a+b,0);
 const race=3*V2_EVENT_BUDGET.gtHeatPrizes.slice(0,4).reduce((a,b)=>a+b,0);
 return {
  readOnly:true,playersRead:false,legacyEvents:legacyBingo.concat([auction]),
  legacyBingoTotalNominal:legacyBingo.reduce((a,b)=>a+b.totalNominal,0),
  gt:{weeklyRanking:ranking,dailyHeatsFourPlayers:race,weeklySponsorMaxFour:4*sponsorCash,
    maxConditionalWeeklyWithSponsors:ranking+race*7+4*sponsorCash},
  sponsor:{cash:sponsorCash,discountCaps:candidates.filter(x=>x.kind!=='cash').map(x=>x.cap)},
  loans:{kind:'transfer_between_players',mintsMoney:false,interestRatePerHour:.02,
    maxInterestHours:50},
  auction:{kind:'cash_sink_with_item_reward',fullyForgedVouchersPresent:true,
    historical:auction},
  blockers:['Não reutilizar Bingos antigos na V2','Não reeditar voucher de equipamento perfeito',
    'Definir Bingo V2 idempotente','Auditar arbitragem de caixas e itens'],
  caveat:'Auditoria estática. Não demonstra que as premiações foram pagas nem que a economia esteja homologada.'
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const files=Object.fromEntries(Object.entries(C4F_SOURCES).map(([key,path])=>
  [key,readFileSync(new URL('../'+path,import.meta.url),'utf8')]));
 const out=auditAncillaryCashSources(files);
 if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(out,null,2)+'\n');
 else process.stdout.write('C4f: GT semanal com 4 patrocínios (limite condicional): R$ '+
   out.gt.maxConditionalWeeklyWithSponsors.toLocaleString('pt-BR')+
   '; Bingos antigos não reutilizáveis: R$ '+out.legacyBingoTotalNominal.toLocaleString('pt-BR')+'\n');
}
