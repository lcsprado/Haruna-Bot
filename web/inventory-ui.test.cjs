const fs=require('fs');
const vm=require('vm');
const assert=require('assert');
const src=fs.readFileSync(__dirname+'/app.js','utf8');
const part=(a,b)=>src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a)));
const item=(id,name,category,quantity,equipped=false,sellable_quantity=quantity)=>({item_id:id,name,category,quantity,equipped,sellable_quantity,rarity:'rare',equipment_level:4,forged_level:0,sellable:true,sell_unit:100});
const ui={inventorySection:'equipment',inventoryTab:'helmets',inventorySearch:'',data:{inventory:[
  item('sword','Espada','weapon',1,true,0),item('armor','Armadura','armor',1,true,0),
  item('boots','Botas','boots',1,true,0),item('helmet','Elmo Real','helmet',3,true,2),
  item('helmet2','Elmo Lunar','helmet',1,false,1),item('potion','Poção','consumable',2)
],combatProfile:{weapon_id:'sword',armor_id:'armor',boot_id:'boots',helmet_id:'helmet',weapon_level:4,armor_level:4,boot_level:4,
  equipment_hp:100,equipment_atk:20,equipment_def:30,equipment_spd:5,equipment_crit:.03}}};
const ctx={ui,Set,Math,Number,String,Object,Array,
  esc:v=>String(v??''),num:v=>String(v),money:v=>String(v),rarityClass:()=>'',rarityLabel:v=>v,categoryLabel:v=>v,
  itemArtMarkup:i=>`<art id="${i.item_id}">`,itemDisplayName:i=>i.name,itemDisplayDescription:()=>'',
  renderLuckyBoxEvent:()=>'',resultPanel:()=>''};
vm.createContext(ctx);
vm.runInContext(part('function inventoryBucket','function shopCategoryLabel'),ctx);
assert.equal(ctx.inventoryBucket({item_id:'elmo',name:'Espada falsa',category:'helmet'}),'helmets');
for(const cat of ['weapon','armor','boots','helmet']) assert(ctx.inventoryBucket({category:cat}));
let html=ctx.renderInventory();
assert(html.includes('⚔️ Equipamentos'));
assert.equal((html.match(/class="equipment-slot occupied"/g)||[]).length,4);
assert(html.includes('data-equipment-slot="helmets"'));
assert(html.includes('Elmo Real'));
assert(html.includes('x2 • Lv.4'));
assert(html.includes('data-item-equip="helmet2"'));
assert(html.includes('data-item-sell-all="helmet" data-item-sell-qty="2"'));
const equipped=html.match(/<div class="card item-card [^>]*equipped-item-card[\s\S]*?<\/div><\/div>/)?.[0]||'';
assert(!equipped.includes('data-item-sell='));
assert(html.includes('❤️ HP +100')&&html.includes('⚡ CRIT 3%'));
const sparse=ctx.equipmentSlotData('helmets');
assert.equal(sparse.level,4);
assert.equal(sparse.stars,null);
const saved=ui.data.inventory;
ui.data.inventory=saved.filter(i=>i.item_id!=='helmet');
assert.equal(ctx.equipmentSlotData('helmets').level,undefined);
assert(!ctx.equipmentSlotText('helmets').includes('Lv.'));
ui.data.inventory=saved;
ui.data.inventory.push({...item('helmet3','Elmo Vinculado','helmet',1,false,0),sellable:false});
html=ctx.renderInventory();
assert(html.includes('Elmo Vinculado'));
assert(!html.includes('data-item-sell="helmet3"'));
ui.inventorySearch='Lunar';
html=ctx.renderInventory();
assert(html.includes('Elmo Lunar'));
assert(!html.includes('data-item-sell-all="helmet"'));
ui.inventorySearch='';ui.inventorySection='consumables';
html=ctx.renderInventory();
assert(html.includes('Poção')&&!html.includes('equipment-panel'));
assert(src.includes("doAction('item.equip',{itemId:x.dataset.itemEquip}"));
console.log('OK: quatro categorias e slots, elmos, cópias equipadas/livres, busca, bônus reais e ação existente.');
