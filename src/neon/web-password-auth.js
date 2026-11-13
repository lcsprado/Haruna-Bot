import crypto from 'node:crypto'
import {promisify} from 'node:util'

const scrypt=promisify(crypto.scrypt)
const HASH_BYTES=64
export const PASSWORD_MIN_LENGTH=10
const USERNAME_PATTERN=/^[a-z][a-z0-9_]{2,23}$/
const RESERVED=new Set(['admin','alpha','alphabot','root','support','suporte','sistema','moderador','moderator'])

export function normalizeWebUsername(value){
  const username=String(value||'').trim().toLowerCase()
  if(!USERNAME_PATTERN.test(username)||RESERVED.has(username))
    throw new Error('Usuário deve ter 3 a 24 caracteres, começar com letra e usar apenas letras, números ou _.')
  return username
}

export function assertWebPassword(value){
  if(typeof value!=='string'||value.length<PASSWORD_MIN_LENGTH||value.length>128||value.includes('\0')||!value.trim())
    throw new Error('A senha precisa ter entre 10 e 128 caracteres.')
  return value
}

export function normalizeWebCode(value){
  const code=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'')
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(code))
    throw new Error('Código inválido ou expirado. Peça outro !web no WhatsApp.')
  return code
}

export async function passwordDigest(password,saltHex){
  const raw=await scrypt(assertWebPassword(password),Buffer.from(saltHex,'hex'),HASH_BYTES,{N:16384,r:8,p:1,maxmem:32*1024*1024})
  return raw.toString('hex')
}

export async function makeWebPassword(password){
  const salt=crypto.randomBytes(16).toString('hex')
  return {passwordSalt:salt,passwordHash:await passwordDigest(password,salt)}
}

export async function verifyWebPassword(password,storedSalt,storedHash){
  if(typeof password!=='string'||password.length>128||!password.length||
    !/^[0-9a-f]{32}$/.test(String(storedSalt||''))||
    !/^[0-9a-f]{128}$/.test(String(storedHash||'')))return false
  const calculated=await scrypt(password,Buffer.from(storedSalt,'hex'),HASH_BYTES,{N:16384,r:8,p:1,maxmem:32*1024*1024})
  return crypto.timingSafeEqual(calculated,Buffer.from(storedHash,'hex'))
}

export async function fakeWebPasswordVerification(password){
  await verifyWebPassword(String(password||'').slice(0,128),'000102030405060708090a0b0c0d0e0f','00'.repeat(HASH_BYTES))
}

export const webSessionToken=()=>crypto.randomBytes(32).toString('base64url')
export const webTokenHash=value=>crypto.createHash('sha256').update(String(value)).digest('hex')
