import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'

const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const root=path.resolve('web/assets/racing')
const colors={prata:'#BFC4CC',branco:'#F3F4F6',preto:'#242A34',cinza:'#777E8A',vermelho:'#D8333F',azul:'#2979D6',verde:'#3EAD6A',amarelo:'#E8BD32',laranja:'#EF8732',roxo:'#8650C9',rosa:'#E888B7',dourado:'#CBA63A'}
const wheels={gol:[[65,369,34,53],[357,410,49,61]],uno:[[445,405,44,61],[729,373,34,55]],corsa:[[432,410,45,62],[750,373,35,53]],palio:[[445,419,49,64],[744,374,39,55]]}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-racing-colors-'))
try{
 for(const model of ['gol','uno','corsa','palio']){
  const source=pathToFileURL(path.join(root,model+'.webp')).href
  const mask=pathToFileURL(path.join(root,model+'-mask.webp')).href
  const html=`<!doctype html><meta charset="utf-8"><img id="source" src="${source}"><img id="mask" src="${mask}"><pre id="output"></pre><script>
  Promise.all([new Promise(r=>source.complete?r():source.onload=r),new Promise(r=>mask.complete?r():mask.onload=r)]).then(()=>{
   const a=document.getElementById('source'),b=document.getElementById('mask'),c=document.createElement('canvas');c.width=a.naturalWidth;c.height=a.naturalHeight;
   const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(a,0,0);const original=x.getImageData(0,0,c.width,c.height);
   x.clearRect(0,0,c.width,c.height);x.drawImage(b,0,0);const marks=x.getImageData(0,0,c.width,c.height).data;
   const colors=${JSON.stringify(colors)},wheels=${JSON.stringify(wheels)}[${JSON.stringify(model)}],out={};
   for(const [id,hex] of Object.entries(colors)){
    const target=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
    const d=new ImageData(new Uint8ClampedArray(original.data),c.width,c.height);
    for(let j=0;j<d.data.length;j+=4){
     const lum=(original.data[j]+original.data[j+1]+original.data[j+2])/3;
     const px=(j/4)%c.width,py=Math.floor(j/4/c.width);
     const wheel=wheels.some(([cx,cy,rx,ry])=>((px-cx)/rx)**2+((py-cy)/ry)**2<1);
     const strength=wheel?0:marks[j+3]/255*(id==='branco'?.82:id==='prata'?.18:.82);
     const shade=Math.max(.24,Math.min(1.16,lum/205));
     for(let k=0;k<3;k++)d.data[j+k]=original.data[j+k]*(1-strength)+target[k]*shade*strength;
    }
    x.putImageData(d,0,0);out[id]=c.toDataURL('image/webp',.78).split(',')[1];
   }
   document.getElementById('output').textContent=JSON.stringify(out)
  })</script>`
  const file=path.join(temp,model+'.html');fs.writeFileSync(file,html)
  const result=spawnSync(chrome,['--headless','--disable-gpu','--no-sandbox','--allow-file-access-from-files','--virtual-time-budget=10000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',maxBuffer:20*1024*1024})
  if(result.status!==0)throw Error(result.stderr||'Chrome failed')
  const match=result.stdout.match(/<pre id="output">([^<]+)<\/pre>/)
  if(!match)throw Error('No colors rendered for '+model)
  const images=JSON.parse(match[1].replaceAll('&quot;','"'))
  for(const [id,data] of Object.entries(images))fs.writeFileSync(path.join(root,model+'-'+id+'.webp'),Buffer.from(data,'base64'))
  console.log(model,Object.keys(images).length,'colors')
 }
}finally{fs.rmSync(temp,{recursive:true,force:true})}
