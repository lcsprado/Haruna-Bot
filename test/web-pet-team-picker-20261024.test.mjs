import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'

const read=(name)=>readFile(new URL('../'+name,import.meta.url),'utf8')
const pet=(id,species,name,slot)=>({id,species,name,slot,level:100,power:id*50,energy:30,max_energy:100,hp:900,max_hp:1000})
const owned=[
  pet(1,'dragao_corrompido','Dragão',1),
  pet(2,'grifo_celestial','Grifo',2),
  pet(3,'fenix_celestial','Fênix',3),
  pet(4,'leao_solar','Leão'),
  pet(5,'pantera_vulcanica','Pantera'),
  pet(6,'lobo','Lobo')
]
const styles={dragao_corrompido:'🪽 Voador',grifo_celestial:'🪽 Voador',fenix_celestial:'🪽 Voador',leao_solar:'🐾 Predador',pantera_vulcanica:'🐾 Predador',lobo:'🐾 Predador'}
const catalog=owned.map(p=>({species:p.species,teamStyle:styles[p.species],specialty:{stats:{damage:p.id,crit:p.id+1}}}))
const esc=str=>String(str||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
const ctx=()=>({
  data:{petTeam:owned.slice(0,3),petTeamSynergy:{label:'Esquadrão Aéreo',text:'+8 VEL e +2% ATK'}},
  catalog:{pets:catalog},petTab:'owned',petTeamDraft:null,petTeamPickerSlot:0,
  petTeamPickerQuery:'',petTeamPickerFilter:'all',petTeamPickerSort:'power',
  petTeamPreview:null,petTeamPreviewKey:'',petTeamSaving:false,petTeamPreviewRequest:0
})
function compilePicker(source,ui){
  const start=source.indexOf('const PET_TEAM_SLOT_LABELS=')
  const end=source.indexOf('function itemIcon(item){',start)
  assert.ok(start>0&&end>start)
  const helpers=source.slice(start,end)
  const compile=Function('catalogPets','collection','petSpeciesName','specialtyText','petVisualMarkup','esc','num','pct','petAdoptModal','ownedPetCard','catalogPetCard','ui',
    helpers+';return {petTeamDraftIds,petTeamHasChanges,petTeamStyleKey,petTeamPickerRows,petTeamPickerModal,petTeamPreviewMarkup,renderPets};')
  return compile(()=>catalog,()=>owned,s=>String(s),p=>Object.entries(p?.specialty?.stats||{}).map(([k,v])=>k+': '+v).join(' • '),
    ()=>'<svg></svg>',esc,String,String,()=>'',()=>'<div></div>',()=>'<div></div>',ui)
}

test('Mobile team composer replaces native Android select with illustrated picker',async()=>{
  const source=await read('web/app.js')
  new Function(source)
  const {renderPets}=compilePicker(source,ctx())
  const html=renderPets()
  assert.doesNotMatch(html,/data-team-slot=/)
  assert.match(html,/data-team-picker-open="1"/)
  assert.match(html,/data-team-picker-open="2"/)
  assert.match(html,/data-team-picker-open="3"/)
  assert.match(html,/Sinergia do time/)
  assert.match(html,/Poder/)
  assert.match(html,/Voador/)
})

test('Style search and filter reveal matching species and skip other styles',async()=>{
  const source=await read('web/app.js'),ui=ctx()
  const view=compilePicker(source,ui)
  ui.petTeamPickerSlot=2
  assert.match(view.petTeamPickerModal(),/data-pet-picker-search/)
  assert.match(view.petTeamPickerModal(),/data-pet-picker-sort/)
  ui.petTeamPickerFilter='predador'
  const rows=view.petTeamPickerRows()
  assert.match(rows,/data-team-pick-id="4"/)
  assert.match(rows,/data-team-pick-id="5"/)
  assert.match(rows,/data-team-pick-id="6"/)
  assert.doesNotMatch(rows,/data-team-pick-id="1"/)
})

test('Already selected pet is disabled in another slot and preview is unsaved',async()=>{
  const source=await read('web/app.js'),ui=ctx()
  const view=compilePicker(source,ui)
  ui.petTeamPickerSlot=2
  assert.match(view.petTeamPickerModal(),/data-team-pick-id="1" disabled/)
  assert.match(view.petTeamPickerModal(),/data-team-pick-id="2" (?!disabled)/)
  assert.match(view.petTeamPreviewMarkup(),/Esquadrão Aéreo/)
  ui.petTeamDraft=[4,5,6]
  assert.equal(view.petTeamHasChanges(),true)
  assert.match(view.petTeamPreviewMarkup(),/PRÉVIA • NÃO SALVA/)
})

test('Synergy preview is authenticated, read only and uses server game rules',async()=>{
  const source=await read('src/neon/web-api.js')
  assert.match(source,/\/api\/v1\/me\/pet-team-preview/)
  assert.match(source,/synergy:petTeamSynergy\(ordered\)/)
  assert.match(source,/WHERE jid=\$1 AND id=ANY\(\$2::bigint\[\]\)/)
  assert.match(source,/\[session.jid,ids\]/)
  assert.match(source,/teamStyle:petStyleLabel\(p.species\)/)
})

test('Visual picker avoids extra writes and the original pet.team transaction is preserved',async()=>{
  const source=await read('web/app.js')
  assert.match(source,/await doAction\('pet.team',\{petIds,replaceAll:true\}/)
  assert.match(source,/ui.petTeamDraft\[slot\]=petId/)
  assert.match(source,/requestPetTeamPreview\(\)/)
  assert.doesNotMatch(source,/data-team-slot=/)
})
