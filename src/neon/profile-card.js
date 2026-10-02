import { createCanvas, loadImage } from '@napi-rs/canvas'

const W=1200,H=1500
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
const money=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(n||0))

function rr(ctx,x,y,w,h,r=24){
  r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r)
  ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()
}
function panel(ctx,x,y,w,h,r=26){
  ctx.save();ctx.shadowColor='rgba(65,211,255,.10)';ctx.shadowBlur=24
  rr(ctx,x,y,w,h,r);ctx.fillStyle='rgba(8,12,25,.91)';ctx.fill()
  ctx.shadowBlur=0;ctx.strokeStyle='rgba(82,207,255,.20)';ctx.lineWidth=2;ctx.stroke();ctx.restore()
}
function fit(ctx,text,max,start=48,min=20,weight=800){
  let s=start;while(s>min){ctx.font=`${weight} ${s}px Arial, sans-serif`;if(ctx.measureText(String(text)).width<=max)return s;s-=2}return min
}
function label(ctx,text,x,y){ctx.fillStyle='#7f8ba9';ctx.font='800 18px Arial, sans-serif';ctx.fillText(text,x,y)}
function stat(ctx,x,y,w,labelText,value,accent){
  const g=ctx.createLinearGradient(x,y,x+w,y+110);g.addColorStop(0,'rgba(255,255,255,.075)');g.addColorStop(1,'rgba(255,255,255,.025)')
  rr(ctx,x,y,w,112,20);ctx.fillStyle=g;ctx.fill()
  ctx.fillStyle=accent;ctx.font='900 21px Arial, sans-serif';ctx.fillText(labelText,x+18,y+32)
  const fs=fit(ctx,value,w-36,43,24,900);ctx.font=`900 ${fs}px Arial, sans-serif`;ctx.fillStyle='#f8fbff';ctx.fillText(String(value),x+18,y+82)
}
function pill(ctx,x,y,text,accent='#8b6cff'){
  ctx.font='800 18px Arial, sans-serif';const w=Math.min(300,ctx.measureText(text).width+34)
  rr(ctx,x,y,w,38,19);ctx.fillStyle='rgba(115,82,255,.15)';ctx.fill();ctx.strokeStyle=accent;ctx.lineWidth=1.4;ctx.stroke()
  ctx.fillStyle='#e8e6ff';ctx.fillText(text,x+17,y+25);return w
}
function safeText(s,n=30){s=String(s||'—');return s.length>n?s.slice(0,n-1)+'…':s}

export async function renderProfileCard(d){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d')
  const bg=ctx.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#030611');bg.addColorStop(.52,'#0b1024');bg.addColorStop(1,'#050713')
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H)
  let glow=ctx.createRadialGradient(1010,100,0,1010,100,620);glow.addColorStop(0,'rgba(43,205,255,.28)');glow.addColorStop(.42,'rgba(83,80,255,.10)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H)
  glow=ctx.createRadialGradient(80,1370,0,80,1370,480);glow.addColorStop(0,'rgba(142,75,255,.16)');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,950,650,550)
  ctx.fillStyle='#49d8ff';ctx.fillRect(0,0,W,6);ctx.fillStyle='#9d62ff';ctx.fillRect(0,H-6,W,6)

  // HERO
  panel(ctx,42,38,1116,330,32)
  ctx.save();ctx.beginPath();ctx.arc(190,190,112,0,Math.PI*2);ctx.clip()
  if(d.avatar){try{const im=await loadImage(d.avatar),sc=Math.max(224/im.width,224/im.height),sw=224/sc,sh=224/sc;ctx.drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,78,78,224,224)}catch{ctx.fillStyle='#151b31';ctx.fillRect(78,78,224,224)}}else{ctx.fillStyle='#151b31';ctx.fillRect(78,78,224,224);ctx.fillStyle='#50d9ff';ctx.font='900 92px Arial';ctx.textAlign='center';ctx.fillText('A',190,220)}
  ctx.restore();ctx.beginPath();ctx.arc(190,190,116,0,Math.PI*2);ctx.strokeStyle='#50d9ff';ctx.lineWidth=6;ctx.stroke()
  ctx.textAlign='left';ctx.fillStyle='#50d9ff';ctx.font='900 18px Arial';ctx.fillText('ALPHA PLAYER',340,82)
  const ns=fit(ctx,String(d.name).toUpperCase(),760,55,30,900);ctx.font=`900 ${ns}px Arial`;ctx.fillStyle='#fff';ctx.fillText(String(d.name).toUpperCase(),340,142)
  ctx.fillStyle='#bfc8e6';ctx.font='800 27px Arial';ctx.fillText(d.title,340,188)
  if(d.badge){pill(ctx,340,210,d.badge,'#4edcff')}
  ctx.fillStyle='#a46dff';ctx.font='900 23px Arial';ctx.fillText(`NÍVEL ${d.level}`,340,288)
  const need=Math.max(100,d.level*100),cur=clamp(d.exp,0,need),ratio=cur/need
  rr(ctx,340,305,760,16,8);ctx.fillStyle='rgba(255,255,255,.09)';ctx.fill()
  if(ratio>0){rr(ctx,340,305,760*ratio,16,8);const xp=ctx.createLinearGradient(340,0,1100,0);xp.addColorStop(0,'#43ddff');xp.addColorStop(1,'#9568ff');ctx.fillStyle=xp;ctx.fill()}
  ctx.fillStyle='#7f8ba9';ctx.font='700 16px Arial';ctx.fillText(`${money(cur)} / ${money(need)} XP`,340,345)

  // CORE STATS
  label(ctx,'PODER DE COMBATE',58,408)
  stat(ctx,58,430,248,'HP',`${d.hp}/${d.maxHp}`,'#ff6688')
  stat(ctx,324,430,248,'ATK',d.atk,'#ffad55')
  stat(ctx,590,430,248,'DEF',d.def,'#4edcff')
  stat(ctx,856,430,248,'SPD',d.spd,'#b26cff')

  // battle strip
  panel(ctx,58,565,1046,105,22)
  ctx.fillStyle='#fff';ctx.font='900 25px Arial';ctx.fillText(`${d.wins} VITÓRIAS`,86,610)
  ctx.fillStyle='#687390';ctx.fillText('•',250,610)
  ctx.fillStyle='#c8cfe2';ctx.fillText(`${d.losses} DERROTAS`,280,610)
  const total=d.wins+d.losses,wr=total?Math.round(d.wins/total*100):0
  ctx.fillStyle='#9d6cff';ctx.fillText(`${wr}% WIN RATE`,510,610)
  ctx.textAlign='right';ctx.fillStyle='#50d9ff';ctx.fillText(`RANK #${d.combatRank}`,1074,610);ctx.textAlign='left'
  ctx.fillStyle='#6f7897';ctx.font='700 15px Arial';ctx.fillText('ARENA',86,642)

  // Equipment + economy
  panel(ctx,58,700,505,275);panel(ctx,585,700,519,275)
  label(ctx,'EQUIPAMENTO',86,742)
  ctx.fillStyle='#fff';ctx.font='900 21px Arial';ctx.fillText('ARMA',86,790);ctx.fillStyle='#a8b2d1';ctx.font=`700 ${fit(ctx,safeText(d.weapon),430,25,18,700)}px Arial`;ctx.fillText(safeText(d.weapon),86,827)
  ctx.fillStyle='#fff';ctx.font='900 21px Arial';ctx.fillText('ARMADURA',86,878);ctx.fillStyle='#a8b2d1';ctx.font=`700 ${fit(ctx,safeText(d.armor),430,25,18,700)}px Arial`;ctx.fillText(safeText(d.armor),86,915)
  label(ctx,'IMPÉRIO',613,742)
  ctx.fillStyle='#fff';ctx.font='900 34px Arial';ctx.fillText(`R$ ${money(d.patrimony)}`,613,795);ctx.fillStyle='#7783a2';ctx.font='700 16px Arial';ctx.fillText('PATRIMÔNIO',613,820)
  ctx.fillStyle='#dce4f8';ctx.font='800 26px Arial';ctx.fillText(`R$ ${money(d.balance)}`,613,865);ctx.fillStyle='#7783a2';ctx.font='700 16px Arial';ctx.fillText('SALDO',613,890)
  ctx.fillStyle='#50d9ff';ctx.font='900 21px Arial';ctx.fillText(`#${d.economyRank} DE ${d.players} • RANK GLOBAL`,613,936)

  // Journey
  panel(ctx,58,1002,1046,175)
  label(ctx,'JORNADA',86,1044)
  ctx.fillStyle='#fff';ctx.font='800 20px Arial';ctx.fillText(`🔥 ${d.streak} dias • recorde ${d.bestStreak}`,86,1080)
  ctx.fillText(`💼 ${safeText(d.career,22)}`,570,1080)
  ctx.fillText(`🏴 ${safeText(d.clan,22)}  •  🏠 ${safeText(d.home,20)}`,86,1118)
  ctx.fillText(`🚗 ${d.cars}/5  •  🏍️ ${d.motorcycles}/6  •  🏪 ${d.businesses}`,570,1118)
  ctx.fillStyle='#8490ae';ctx.font=`800 ${fit(ctx,`🐾 ${d.pet}`,940,20,16,800)}px Arial`;ctx.fillText(`🐾 ${safeText(d.pet,72)}`,86,1154)

  // Achievements compact
  panel(ctx,58,1204,1046,155)
  label(ctx,'CONQUISTAS',86,1244)
  const list=(d.achievements||[]).slice(0,7)
  if(list.length){let x=86,y=1268;for(const b of list){ctx.font='800 18px Arial';const bw=Math.min(300,ctx.measureText(b).width+34);if(x+bw>1075){x=86;y+=48}x+=pill(ctx,x,y,b)+12}}
  else{ctx.fillStyle='#6f7897';ctx.font='700 20px Arial';ctx.fillText('Jogue para desbloquear seus primeiros badges.',86,1300)}

  ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='900 27px Arial';ctx.fillText('ALPHA BOT',W/2,1410)
  ctx.fillStyle='#50d9ff';ctx.font='800 17px Arial';ctx.fillText('!perfil',W/2,1440)
  ctx.fillStyle='#687390';ctx.font='700 15px Arial';ctx.fillText('EVOLUA • CONQUISTE • COMPARTILHE',W/2,1468)
  return canvas.toBuffer('image/png')
}
