const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const part = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const catalog = [70, 25, 60, 10, 65, 20, 15, 30, 40, 50].map(level => ({level, name: `Chefe ${level}`, hp: 1000, atk: 50, keyPrice: 25, durationMinutes: 10}));
const ui = {catalog: {raids: catalog}, data: {identity: {jid: 'me'}}, selectedRaidLevel: null, bossTimer: null};
let group = {raids: {}};
const ctx = {ui, Set, Date, Number, Object, Math, currentGroup: () => group, raidState: level => group.raids[level] || null,
  activeBoss: () => group.boss || null, raidStatusLabel: status => status, num: value => String(value), money: value => String(value),
  pct: value => String(value), esc: value => String(value), artSprite: key => `<art key="${key}">`,
  raidArenaMarkup: raid => `<arena level="${raid.level}">`, combatArenaMarkup: () => '<combat>',
  bossModeLabel: () => 'Comum', statCard: () => '<stat>'};
vm.createContext(ctx);
vm.runInContext(part('const RAID_BOSS_LEVELS', 'const OFFICIAL_SPRITES'), ctx);
vm.runInContext(part('function raidSpriteKey', 'function bossSpriteKey'), ctx);
vm.runInContext(part('function renderRaids', 'function activeBoss'), ctx);
vm.runInContext(part('function renderBoss', 'function roster'), ctx);
for (const level of [10,15,20,25,30,40,50,60,65,70]) assert.equal(ctx.raidSpriteKey(level, 'qualquer nome'), `raid-${level}`);
assert.equal(ctx.raidSpriteKey(99, 'Titã'), '');
let html = ctx.renderRaids();
assert.deepEqual([...html.matchAll(/<h3>Chefe (\d+)<\/h3>/g)].map(m => Number(m[1])), [10,15,20,25,30,40,50,60,65,70]);
assert.equal((html.match(/data-raid-create=/g) || []).length, 10);
assert.equal((html.match(/👥 0\/5/g) || []).length, 10);
assert(!html.includes('Sem participantes'));
assert(!html.includes('<arena'));
ui.selectedRaidLevel = 25;
html = ctx.renderRaids();
assert(html.includes('<arena level="25">'));
assert.equal((html.match(/<arena/g) || []).length, 1);
group.raids[60] = {status:'lobby', host:'me', hp:900, maxHp:1000, players:{me:{jid:'me', name:'Eu'}}};
html = ctx.renderRaids();
assert(html.includes('data-raid-start="60"') && html.includes('data-raid-cancel="60"'));
assert(html.includes('👥 1/5'));
group.raids[60].status = 'active';
html = ctx.renderRaids();
assert(html.includes('data-raid-auto="60"') && html.includes('data-raid-round="60"'));
assert(html.includes('<arena level="60">'));
html = ctx.renderBoss();
assert.equal((html.match(/boss-common/g) || []).length, 1);
assert(html.includes('data-boss-start'));
group.boss = {name:'Boss teste',hp:500,maxHp:1000,participants:{me:{name:'Eu',damage:5}}};
html = ctx.renderBoss();
assert(html.includes('data-boss-attack') && html.includes('data-boss-auto') && html.includes('Ranking de dano'));
console.log('OK: 10 chefes, ordenação, cartões compactos, seleção, estados Raid e Boss simulados.');
