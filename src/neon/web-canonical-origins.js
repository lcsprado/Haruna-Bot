// Explicitly approved canonical Alpha Web hosts. Keep existing configured origins
// (including the beta), but never trust arbitrary *.vercel.app previews.
export const ALPHA_WEB_CANONICAL_ORIGINS=Object.freeze([
  'https://alpha-web-rpg.vercel.app',
  'https://alpha-web-rpg-lcshprado.vercel.app'
])

export function resolveAlphaWebAllowedOrigin(requestOrigin,configuredOrigins=''){
  const origin=String(requestOrigin||'')
  if(!origin)return null // Same-origin / health request without Origin
  const configured=String(configuredOrigins||'').trim()
  // Preserve existing semantics; service startup already disallows '*' in production.
  if(configured==='*')return '*'
  const allowed=new Set([
    ...ALPHA_WEB_CANONICAL_ORIGINS,
    ...configured.split(',').map(x=>x.trim()).filter(Boolean)
  ])
  return allowed.has(origin)?origin:''
}
