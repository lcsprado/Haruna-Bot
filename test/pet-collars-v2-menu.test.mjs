import test from 'node:test'
import assert from 'node:assert/strict'
import {collarMenu} from '../src/neon/pet-collar-menu.js'
import {PET_COLLARS} from '../src/neon/pet-collars.js'
function fixture(){
 const pets=Array.from({length:18},(_,i)=>({id:i+1,name:'Pet '+(i+1),collar_id:null}))
 const inventory=[{item_id:'nucleo_pedra',quantity:500,bound_quantity:1}]
 let flow, message='',buys=0,equips=0
 const api={catalog:()=>PET_COLLARS,pets:async()=>pets,inventory:async()=>inventory,team:async()=>[{id:18,slot:1}],buy:async(jid,id)=>{buys++;inventory.push({item_id:id,quantity:1});return {message:'Comprada'}},craft:async()=>({item:PET_COLLARS[5],message:'Fabricada'}),equip:async(jid,id,item)=>{equips++;pets.find(p=>p.id===id).collar_id=item;return {message:'Equipado'}}}
 const send=async input=>collarMenu({jid:'test',chat:'test',stage:flow?.stage.slice(7),data:flow?.data,input,reply:async m=>{message=m},setFlow:(stage,data)=>{flow={stage,data}},clearFlow:()=>{flow=null},api,fmt:String})
 return {send,pets,get flow(){return flow},get message(){return message},get buys(){return buys},get equips(){return equips}}
}
test('guided purchase, confirmation, team-first equip and removal',async()=>{
 const f=fixture();await f.send();assert.match(f.message,/0\/18/)
 await f.send('1');assert.match(f.message,/Mítica/);await f.send('1');assert.equal(f.buys,0)
 await f.send('1');assert.equal(f.buys,1);assert.match(f.message,/Equipar agora/)
 await f.send('1');assert.equal(f.flow.data.ids[0],18);await f.send('1')
 assert.match(f.message,/Atual: 0%/);assert.match(f.message,/Nova: 5%/);assert.equal(f.equips,0)
 await f.send('1');assert.equal(f.equips,1);assert.equal(f.pets[17].collar_id,PET_COLLARS[0].id)
 await f.send('4');await f.send('1');assert.match(f.message,/REMOÇÃO/);await f.send('1');assert.equal(f.pets[17].collar_id,null)
})
test('pagination, return, and bound material availability',async()=>{
 const f=fixture();await f.send();await f.send('3');assert.match(f.message,/Página 1\/4/)
 await f.send('9');assert.match(f.message,/Página 2\/4/);await f.send('8');assert.equal(f.flow.data.ids[0],18)
 await f.send('0');await f.send('5');assert.match(f.message,/499\/500 • faltam 1/)
 await f.send('0');assert.equal(f.flow.stage,'collar_main');await f.send('0');assert.equal(f.flow,null)
})
