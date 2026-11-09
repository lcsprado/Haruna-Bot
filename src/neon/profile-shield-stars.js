// Formatacao independente usada pelo !perfil, tambem fora do fluxo de menus.
export function formatProfileShieldStars(stars) {
  const n = Math.max(1, Math.min(5, Math.trunc(Number(stars) || 1)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
