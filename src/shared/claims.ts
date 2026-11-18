// Ce que l'agent dit lui-même ne pas avoir vérifié (« je n'ai pas regardé les écrans », « pas essayé avec un
// vrai agent »…). Lu dans son résumé, sans IA, pour vous prévenir AVANT « Valider » (cas LBA-17).
// (?!\p{L}) au lieu de \b : en JavaScript, \b ne voit pas la fin d'un mot qui finit par « é ».
const END = String.raw`e?s?(?!\p{L})`;
const NEG = new RegExp(
  String.raw`(n['’]\s?(?:ai|a|ont|avons)|ne (?:sont|est|peut|pouvait|pouvais))\s+pas\b[^.;:]{0,40}?\b(vérifié|essayé|testé|regardé|lancé|contrôlé|vu)${END}`
  + String.raw`|\bnon (vérifié|testé|essayé)${END}|\bpas (encore )?(été )?(vérifié|essayé|testé)${END}`, 'iu');

export function unverifiedClaims(summary: string | undefined): string[] {
  if (!summary) return [];
  const text = summary.replace(/ÉTAPE \d+ : (faite|commencée)\s*/g, '').replace(/[*_`#>|]/g, ' ');
  const out: string[] = [];
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const s = raw.replace(/\s+/g, ' ').trim();
    if (s.length < 12 || !NEG.test(s)) continue;
    if (!out.includes(s)) out.push(s.length > 220 ? `${s.slice(0, 220)}…` : s);
    if (out.length === 4) break;
  }
  return out;
}
