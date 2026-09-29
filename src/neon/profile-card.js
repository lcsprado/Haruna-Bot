import { createCanvas, loadImage } from '@napi-rs/canvas'

const W=1200,H=1500
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n))
const money=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(Number(n||0))

function rounded(ctx,x,y,w,h,r=24){
  r=Math.min(r,w/2,h/2)
  ctx.beginPath()
  ctx.moveTo(x+r,y)
  ctx.arcTo(x+w,y,x+w,y+h,r)
  ctx.arcTo(x+w,y+h,x,y+h,r)
  ctx.arcTo(x,y+h,x,y,r)
  ctx.arcTo(x,y,x+w,y,r)
  ctx.closePath()
}

function panel(ctx,x,y,w,h){
  ctx.save()
  rounded(ctx,x,y,w,h,28)
  ctx.fillStyle='rgba(10,14,28,.84)'
  ctx.fill()
  ctx.strokeStyle='rgba(84,207,255,.25)'
  ctx.lineWidth=2
  ctx.stroke()
  ctx.restore()
}

function fitText(ctx,text,maxWidth,start=48,min=22){
  let size=start
  while(size>min){
    ctx.font=`800 ${size}px sans-serif`
    if(ctx.measureText(String(text)).width<=maxWidth) return size
    size-=2
  }
  return min
}

function stat(ctx,x,y,label,value,accent){
  ctx.save()
  ctx.fillStyle='rgba(255,255,255,.06)'
  rounded(ctx,x,y,205,112,20);ctx.fill()
  ctx.fillStyle=accent
  ctx.font='900 27px sans-serif';ctx.fillText(label,x+20,y+36)
  ctx.fillStyle='#fff'
  ctx.font='900 47px sans-serif';ctx.fillText(String(value),x+20,y+88)
  ctx.restore()
}

function badge(ctx,x,y,text){
  ctx.font='800 20px sans-serif'
  const w=Math.min(300,ctx.measureText(text).width+34)
  ctx.fillStyle='rgba(126,87,255,.18)'
  rounded(ctx,x,y,w,40,20);ctx.fill()
  ctx.strokeStyle='rgba(156,125,255,.65)';ctx.lineWidth=1.5;ctx.stroke()
  ctx.fillStyle='#e8e1ff';ctx.fillText(text,x+17,y+27)
  return w
}

export async function renderProfileCard(d){
  const canvas=createCanvas(W,H),ctx=canvas.getContext('2d')

  const bg=ctx.createLinearGradient(0,0,W,H)
  bg.addColorStop(0,'#05070f');bg.addColorStop(.45,'#101329');bg.addColorStop(1,'#070a16')
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H)

  const glow=ctx.createRadialGradient(900,150,20,900,150,650)
  glow.addColorStop(0,'rgba(67,213,255,.30)');glow.addColorStop(.45,'rgba(104,75,255,.12)');glow.addColorStop(1,'rgba(0,0,0,0)')
  ctx.fillStyle=glow;ctx.fillRect(0,0,W,H)

  ctx.fillStyle='#53d7ff';ctx.fillRect(0,0,W,7)
  ctx.fillStyle='#9d69ff';ctx.fillRect(0,H-7,W,7)

  // avatar
  ctx.save()
  ctx.beginPath();ctx.arc(178,190,118,0,Math.PI*2);ctx.clip()
  if(d.avatar){
    try{
      const img=await loadImage(d.avatar)
      const scale=Math.max(236/img.width,236/img.height)
      const sw=236/scale,sh=236/scale
      ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,60,72,236,236)
    }catch{
      ctx.fillStyle='#171b2d';ctx.fillRect(60,72,236,236)
    }
  }else{
    ctx.fillStyle='#171b2d';ctx.fillRect(60,72,236,236)
    ctx.fillStyle='#53d7ff';ctx.font='900 88px sans-serif';ctx.textAlign='center';ctx.fillText('A',178,220)
  }
  ctx.restore()
  ctx.beginPath();ctx.arc(178,190,123,0,Math.PI*2);ctx.strokeStyle='#53d7ff';ctx.lineWidth=7;ctx.stroke()

  ctx.textAlign='left'
  ctx.fillStyle='#53d7ff';ctx.font='900 23px sans-serif';ctx.fillText('ALPHA PLAYER CARD',340,92)
  const nameSize=fitText(ctx,d.name,760,62,34)
  ctx.font=`900 ${nameSize}px sans-serif`;ctx.fillStyle='#fff';ctx.fillText(String(d.name).toUpperCase(),340,158)
  ctx.font='800 29px sans-serif';ctx.fillStyle='#c8cce0';ctx.fillText(d.title,340,205)
  if(d.badge){ctx.font='800 23px sans-serif';ctx.fillStyle='#aef5ff';ctx.fillText(d.badge,340,246)}
  ctx.font='900 25px sans-serif';ctx.fillStyle='#9d69ff';ctx.fillText(`NÍVEL ${d.level}`,340,290)

  // XP
  const needed=Math.max(100,d.level*100),current=clamp(d.exp,0,needed),ratio=current/needed
  ctx.fillStyle='rgba(255,255,255,.10)';rounded(ctx,340,310,790,22,11);ctx.fill()
  if(ratio>0){ctx.fillStyle='#53d7ff';rounded(ctx,340,310,790*ratio,22,11);ctx.fill()}
  ctx.font='700 18px sans-serif';ctx.fillStyle='#aab0c8';ctx.fillText(`${money(current)} / ${money(needed)} XP`,340,360)

  panel(ctx,50,400,1100,190)
  ctx.fillStyle='#9ca5c8';ctx.font='800 21px sans-serif';ctx.fillText('ATRIBUTOS',78,438)
  stat(ctx,78,458,'❤️ HP',`${d.hp}/${d.maxHp}`,'#ff6d8a')
  stat(ctx,305,458,'⚔ ATK',d.atk,'#ffb45c')
  stat(ctx,532,458,'🛡 DEF',d.def,'#53d7ff')
  stat(ctx,759,458,'⚡ SPD',d.spd,'#b881ff')
  ctx.fillStyle='#fff';ctx.font='900 25px sans-serif';ctx.fillText(`🏆 ${d.wins}V / ${d.losses}D`,982,493)
  ctx.fillStyle='#9ca5c8';ctx.font='700 18px sans-serif';ctx.fillText(`Rank #${d.combatRank}`,982,530)

  panel(ctx,50,620,530,300)
  ctx.fillStyle='#9ca5c8';ctx.font='800 21px sans-serif';ctx.fillText('EQUIPAMENTO',78,660)
  ctx.fillStyle='#fff';ctx.font='800 26px sans-serif';ctx.fillText('⚔ ARMA',78,710)
  let fs=fitText(ctx,d.weapon,445,28,19);ctx.font=`700 ${fs}px sans-serif`;ctx.fillStyle='#cfd5eb';ctx.fillText(d.weapon,78,750)
  ctx.fillStyle='#fff';ctx.font='800 26px sans-serif';ctx.fillText('🛡 ARMADURA',78,814)
  fs=fitText(ctx,d.armor,445,28,19);ctx.font=`700 ${fs}px sans-serif`;ctx.fillStyle='#cfd5eb';ctx.fillText(d.armor,78,854)

  panel(ctx,610,620,540,300)
  ctx.fillStyle='#9ca5c8';ctx.font='800 21px sans-serif';ctx.fillText('IMPÉRIO',638,660)
  ctx.fillStyle='#fff';ctx.font='900 32px sans-serif';ctx.fillText(`R$ ${money(d.balance)}`,638,716)
  ctx.fillStyle='#8f97b8';ctx.font='700 19px sans-serif';ctx.fillText('SALDO TOTAL',638,744)
  ctx.fillStyle='#fff';ctx.font='900 32px sans-serif';ctx.fillText(`R$ ${money(d.patrimony)}`,638,800)
  ctx.fillStyle='#8f97b8';ctx.font='700 19px sans-serif';ctx.fillText('PATRIMÔNIO',638,828)
  ctx.fillStyle='#53d7ff';ctx.font='900 24px sans-serif';ctx.fillText(`#${d.economyRank} / ${d.players} GLOBAL`,638,878)

  panel(ctx,50,950,1100,180)
  ctx.fillStyle='#9ca5c8';ctx.font='800 21px sans-serif';ctx.fillText('JORNADA',78,990)
  ctx.fillStyle='#fff';ctx.font='800 24px sans-serif'
  ctx.fillText(`🔥 ${d.streak} dias  •  Recorde ${d.bestStreak}`,78,1038)
  ctx.fillText(`🏴 ${d.clan}`,570,1038)
  ctx.fillText(`🏠 ${d.home}  •  🚗 ${d.cars}/5`,78,1082)
  ctx.fillText(`🐾 Pet: ${d.pet}`,570,1082)

  panel(ctx,50,1160,1100,205)
  ctx.fillStyle='#9ca5c8';ctx.font='800 21px sans-serif';ctx.fillText('CONQUISTAS',78,1200)
  const list=(d.achievements||[]).slice(0,8)
  if(!list.length){
    ctx.fillStyle='#6f789b';ctx.font='700 23px sans-serif';ctx.fillText('Continue evoluindo para desbloquear badges.',78,1260)
  }else{
    let x=78,y=1230
    for(const b of list){
      ctx.font='800 20px sans-serif'
      const bw=Math.min(300,ctx.measureText(b).width+34)
      if(x+bw>1110){x=78;y+=54}
      const used=badge(ctx,x,y,b);x+=used+12
    }
  }

  ctx.textAlign='center'
  ctx.fillStyle='#fff';ctx.font='900 29px sans-serif';ctx.fillText('🍀 ALPHA BOT',W/2,1415)
  ctx.fillStyle='#7d86a8';ctx.font='700 19px sans-serif';ctx.fillText('!perfil  •  evolua, conquiste e compartilhe',W/2,1450)

  return canvas.toBuffer('image/png')
}
