// Schémas des comptes rendus, dessinés par le programme à partir des chiffres mesurés (0 token).
// SVG simple, couleurs fixes pour l'impression (le PDF est sur fond blanc).
const C = { ink: '#1f2933', muted: '#6b7785', line: '#d9dee5', ok: '#2f8f5b', wait: '#c27c0e', danger: '#c2412d', accent: '#2f6fb0' };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)} k` : String(n));

export interface Moment { at: string; label: string; tone: 'ok' | 'wait' | 'danger' | 'accent' }

// Frise du ticket : chaque moment clé à égale distance (lisible même si une pause dure 8 h), heure dessous.
export function timelineSvg(moments: Moment[]): string {
  const m = moments.slice(-9);
  if (m.length < 2) return '';
  const W = 640, x0 = 50, step = (W - 2 * x0) / (m.length - 1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 110" width="${W}" height="110" font-family="Segoe UI, Arial" font-size="10"><rect width="100%" height="100%" rx="6" fill="#fff"/>`,
    `<line x1="${x0}" y1="40" x2="${W - x0}" y2="40" stroke="${C.line}" stroke-width="2"/>`];
  m.forEach((p, i) => {
    const x = x0 + i * step;
    const time = new Date(p.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    parts.push(`<circle cx="${x}" cy="40" r="7" fill="${C[p.tone]}"/>`,
      `<text x="${x}" y="${i % 2 ? 72 : 20}" text-anchor="middle" fill="${C.ink}" font-weight="600">${esc(cut(p.label, 18))}</text>`,
      `<text x="${x}" y="${i % 2 ? 86 : 62}" text-anchor="middle" fill="${C.muted}">${time}</text>`);
  });
  parts.push('</svg>');
  return parts.join('');
}

// Barres de tokens par ticket (lot ou jour), avec une pastille de tests et la mention « lourd ».
export function tokenBarsSvg(rows: { id: string; tokens: number; testsOk?: boolean; heavy: boolean }[]): string {
  if (!rows.length) return '';
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  const H = 26, W = 640, bx = 90, bw = 420;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${rows.length * H + 24}" width="${W}" height="${rows.length * H + 24}" font-family="Segoe UI, Arial" font-size="11"><rect width="100%" height="100%" rx="6" fill="#fff"/>`];
  rows.forEach((r, i) => {
    const y = i * H + 6, w = Math.max(2, (r.tokens / max) * bw);
    const dot = r.testsOk === undefined ? C.line : r.testsOk ? C.ok : C.danger;
    parts.push(`<circle cx="12" cy="${y + 9}" r="5" fill="${dot}"/>`,
      `<text x="24" y="${y + 13}" fill="${C.ink}" font-weight="600">${esc(r.id)}</text>`,
      `<rect x="${bx}" y="${y + 2}" width="${w}" height="14" rx="3" fill="${r.heavy ? C.accent : '#9bb8d6'}"/>`,
      `<text x="${bx + w + 6}" y="${y + 13}" fill="${C.muted}">${k(r.tokens)}${r.heavy ? '  lourd' : ''}</text>`);
  });
  const y = rows.length * H + 18;
  parts.push(`<text x="0" y="${y}" fill="${C.muted}" font-size="10">Pastille : tests verts, rouges ou pas lancés. Barre foncée : ticket lourd (compte rendu à part).</text>`, '</svg>');
  return parts.join('');
}
