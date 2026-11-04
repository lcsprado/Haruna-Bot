// URL pública única do Alpha RPG para todos os links do comando !web.
// Não use WEB_APP_URL, RENDER_EXTERNAL_URL nem preview da Vercel como destino de login.
export const ALPHA_WEB_OFFICIAL_URL='https://alpha-web-rpg.vercel.app/rpg';
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function buildOfficialWebLoginUrl(code){
  const value=String(code??'').trim().toUpperCase();
  if(value.length!==8||[...value].some(ch=>!ALPHABET.includes(ch)))
    throw new Error('Código de acesso Web inválido.');
  return ALPHA_WEB_OFFICIAL_URL+'#code='+encodeURIComponent(value);
}
