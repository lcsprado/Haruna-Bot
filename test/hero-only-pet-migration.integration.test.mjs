import test from 'node:test'
import assert from 'node:assert/strict'

const enabled=process.env.HERO_MIGRATION_INTEGRATION==='1'

test('PostgreSQL: converte os Pecados de pet para desbloqueio de herói sem perder dados', {skip:!enabled}, async()=>{
  const {db}=await import('../src/neon/db.js')
  const {archiveSevenSinsPetAssignments}=await import('../src/neon/hero-only-pet-migration.js')
  try{
    await db.query(`
      CREATE TABLE users(jid TEXT PRIMARY KEY);
      CREATE TABLE pet_collection(
        id BIGSERIAL PRIMARY KEY,jid TEXT NOT NULL REFERENCES users(jid),
        species TEXT NOT NULL,name TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,xp INTEGER NOT NULL DEFAULT 0,
        power INTEGER NOT NULL DEFAULT 10,energy INTEGER NOT NULL DEFAULT 100,
        hp INTEGER NOT NULL DEFAULT 100,max_hp INTEGER NOT NULL DEFAULT 100,
        wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,
        hunger INTEGER NOT NULL DEFAULT 100,hygiene INTEGER NOT NULL DEFAULT 100,
        last_action BIGINT NOT NULL DEFAULT 0,last_rest BIGINT NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL DEFAULT 123,active BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE UNIQUE INDEX only_one_active_pet ON pet_collection(jid) WHERE active;
      CREATE TABLE pets(
        jid TEXT PRIMARY KEY REFERENCES users(jid),
        species TEXT NOT NULL,name TEXT NOT NULL,
        level INTEGER NOT NULL,xp INTEGER NOT NULL,power INTEGER NOT NULL,
        energy INTEGER NOT NULL,hp INTEGER NOT NULL,max_hp INTEGER NOT NULL,
        wins INTEGER NOT NULL,losses INTEGER NOT NULL,hunger INTEGER NOT NULL,
        hygiene INTEGER NOT NULL,last_action BIGINT NOT NULL,last_rest BIGINT NOT NULL,
        created_at BIGINT NOT NULL
      );
      CREATE TABLE pet_team(
        jid TEXT NOT NULL REFERENCES users(jid),
        slot INTEGER NOT NULL,pet_id BIGINT NOT NULL REFERENCES pet_collection(id),
        PRIMARY KEY(jid,slot),UNIQUE(jid,pet_id)
      );
      CREATE TABLE pet_expeditions(pet_id BIGINT REFERENCES pet_collection(id),resolved BOOLEAN NOT NULL DEFAULT FALSE);
      INSERT INTO users(jid) VALUES('alice'),('bob'),('carol');
    `)
    const ids={}
    async function add(jid,species,active=false,level=70){
      const r=await db.query(`INSERT INTO pet_collection(jid,species,name,level,xp,power,active)
        VALUES($1,$2,$2,$3,6900,150,$4) RETURNING id`,[jid,species,level,active])
      return Number(r.rows[0].id)
    }
    ids.aliceHero=await add('alice','pecado_escanor',true,100)
    ids.alicePet=await add('alice','fenix_celestial',false,100)
    ids.bobHero=await add('bob','pecado_ban',true,97)
    ids.carolPet=await add('carol','lobo',true,88)
    await db.query(`INSERT INTO pet_team(jid,slot,pet_id)
      VALUES('alice',1,$1),('alice',2,$2),('bob',1,$3),('carol',1,$4)`,
      [ids.aliceHero,ids.alicePet,ids.bobHero,ids.carolPet])
    for(const [jid,species,level] of [
      ['alice','pecado_escanor',100],['bob','pecado_ban',97],['carol','lobo',88]]){
      await db.query(`INSERT INTO pets(jid,species,name,level,xp,power,energy,hp,max_hp,wins,losses,hunger,hygiene,last_action,last_rest,created_at)
        VALUES($1,$2,$2,$3,6900,150,100,200,300,0,0,100,100,0,0,123)`,[jid,species,level])
    }
    const initial=(await db.query("SELECT species,level,xp FROM pet_collection WHERE jid='alice' AND species='pecado_escanor'")).rows[0]
    const first=await archiveSevenSinsPetAssignments()
    assert.equal(first.migrated,2)
    assert.equal(first.noEligiblePet,1)
    const aliceActive=(await db.query("SELECT species FROM pets WHERE jid='alice'")).rows[0]
    assert.equal(aliceActive.species,'fenix_celestial')
    const aliceTeam=(await db.query("SELECT t.slot,c.species FROM pet_team t JOIN pet_collection c ON c.id=t.pet_id WHERE t.jid='alice'")).rows
    assert.deepEqual(aliceTeam.map(x=>[Number(x.slot),x.species]),[[1,'fenix_celestial']])
    const aliceHero=(await db.query("SELECT species,level,xp,active FROM pet_collection WHERE jid='alice' AND species='pecado_escanor'")).rows[0]
    assert.equal(aliceHero.species,initial.species)
    assert.equal(Number(aliceHero.level),100)
    assert.equal(Boolean(aliceHero.active),false)
    assert.equal((await db.query("SELECT count(*)::int n FROM pet_collection WHERE jid='bob' AND species='pecado_ban'")).rows[0].n,1)
    assert.equal((await db.query("SELECT count(*)::int n FROM pet_team WHERE jid='bob'")).rows[0].n,0)
    assert.equal((await db.query("SELECT species FROM pets WHERE jid='carol'")).rows[0].species,'lobo')
    assert.equal((await db.query("SELECT count(*)::int n FROM hero_legacy_pet_audit")).rows[0].n,2)
    const repeat=await archiveSevenSinsPetAssignments()
    assert.equal(repeat.migrated,0,'segunda execução não deve alterar personagens já convertidos')
    assert.equal((await db.query("SELECT count(*)::int n FROM pet_collection")).rows[0].n,4,'nenhum personagem deletado')
  }finally{
    await db.query('DROP TABLE IF EXISTS hero_legacy_pet_audit,pet_expeditions,pet_team,pets,pet_collection,users CASCADE')
    await db.end()
  }
})
