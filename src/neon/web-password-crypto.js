// Senhas Alpha Web: hash resistente a ataques offline, sem dependências externas.
// O WhatsApp vincula a conta; a senha só permite novos logins Web.
import crypto from 'node:crypto'
import {promisify} from 'node:util'

const derive=promisify(crypto.scrypt)
const SCRYPT_OPTIONS={N:32768,r:8,p:1,maxmem:64*1024*1024}
const HASH_BYTES=64

export function normalizeWebPhone(value){
  const digits=String(value??'').replace(/\D/g,'')
  const withCountry=digits.length===10||digits.length===11?'55'+digits:digits
  if(!/^55\d{10,11}$/.test(withCountry)) throw new Error('Informe seu WhatsApp com DDD.')
  return withCountry
}

export function validateWebPassword(password){
  if(typeof password!=='string'||password.length<10||password.length>128||Buffer.byteLength(password,'utf8')>256)
    throw new Error('A senha precisa ter de 10 a 128 caracteres.')
  if(/[\u0000-\u001f\u007f]/.test(password))
    throw new Error('Não use caracteres de controle na senha.')
  return password
}

export async function hashWebPassword(password){
  validateWebPassword(password)
  const salt=crypto.randomBytes(16)
  const derived=await derive(password,salt,HASH_BYTES,SCRYPT_OPTIONS)
  return 'scrypt-v1$'+salt.toString('base64url')+'$'+derived.toString('base64url')
}

export async function verifyWebPassword(password,stored){
  // Executa scrypt mesmo para login inexistente, evitando distinguir contas por tempo.
  const parts=String(stored||'').split('$')
  const valid=parts.length===3&&parts[0]==='scrypt-v1'
  let salt=Buffer.alloc(16),expected=Buffer.alloc(HASH_BYTES)
  if(valid){
    try{
      salt=Buffer.from(parts[1],'base64url')
      expected=Buffer.from(parts[2],'base64url')
    }catch{}
  }
  if(salt.length!==16||expected.length!==HASH_BYTES){
    salt=Buffer.alloc(16)
    expected=Buffer.alloc(HASH_BYTES)
  }
  const derived=await derive(typeof password==='string'?password:'',salt,HASH_BYTES,SCRYPT_OPTIONS)
  return valid&&crypto.timingSafeEqual(derived,expected)
}
