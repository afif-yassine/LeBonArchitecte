// Pièces jointes du chat de l'Architecte (lot C2) : photos, PDF et documents texte.
// Rangées dans .lba/pieces/<projet>/ (jamais dans git). Le coût de chaque pièce est estimé AVANT l'envoi,
// par le programme (0 token), à partir de sa taille : l'image est lue par son en-tête, le PDF par ses pages.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { forbiddenFile } from './securite.ts';
import { Refused } from './tickets.ts';

export const PIECES_ROOT = join(process.cwd(), '.lba', 'pieces');
export const piecesDir = (project: string) => join(PIECES_ROOT, project.replace(/[^\w-]/g, ''));
export const MAX_PIECE = 10_000_000;
export const MAX_PIECES = 8;

export interface Piece { file: string; name: string; kind: 'image' | 'pdf' | 'texte'; size: number; tokens: number; detail: string }

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
const TEXT = new Set(['.txt', '.md', '.csv', '.json', '.log', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.sql', '.sh', '.ps1']);

// Taille d'une image lue dans son en-tête (PNG, JPEG, GIF, WebP), sans bibliothèque.
export function imageSize(b: Buffer): { w: number; h: number } | undefined {
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString('ascii', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const f = b.toString('ascii', 12, 16);
    if (f === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (f === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (f === 'VP8L') { const n = b.readUInt32LE(21); return { w: (n & 0x3fff) + 1, h: ((n >> 14) & 0x3fff) + 1 }; }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return undefined;
}

// Règle publique de Claude : l'image est réduite à 1 568 px au plus grand côté ; environ largeur × hauteur / 750 tokens.
export function imageTokens(w: number, h: number): number {
  const s = Math.min(1, 1568 / Math.max(w, h));
  return Math.min(1600, Math.ceil((w * s * h * s) / 750));
}

export function estimate(name: string, b: Buffer): Pick<Piece, 'kind' | 'tokens' | 'detail'> {
  const ext = extname(name).toLowerCase();
  if (IMAGE.has(ext)) {
    const d = imageSize(b);
    return { kind: 'image', tokens: d ? imageTokens(d.w, d.h) : 1600, detail: d ? `${d.w} × ${d.h} px` : 'taille inconnue' };
  }
  if (ext === '.pdf') {
    const pages = Math.max(1, (b.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length);
    // Chaque page : son texte et son image, environ 1 500 à 3 000 tokens (doc publique). On compte le haut.
    return { kind: 'pdf', tokens: pages * 3000, detail: `${pages} page${pages > 1 ? 's' : ''}` };
  }
  const chars = b.toString('utf8').length;
  return { kind: 'texte', tokens: Math.ceil(chars / 4), detail: `${chars.toLocaleString('fr-FR')} caractères` };
}

const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-60) || 'piece';

export function savePiece(project: string, name: string, base64: string): Piece {
  const ext = extname(name).toLowerCase();
  if (forbiddenFile(name)) throw new Refused(`« ${name} » ressemble à un fichier de secrets (.env, clé) : refusé.`);
  if (!IMAGE.has(ext) && ext !== '.pdf' && !TEXT.has(ext)) throw new Refused(`« ${name} » : type non pris. Photos (png, jpg, gif, webp), PDF ou documents texte.`);
  const b = Buffer.from(base64, 'base64');
  if (!b.length) throw new Refused(`« ${name} » est vide.`);
  if (b.length > MAX_PIECE) throw new Refused(`« ${name} » fait ${(b.length / 1e6).toFixed(1).replace('.', ',')} Mo : 10 Mo au plus.`);
  const dir = piecesDir(project);
  mkdirSync(dir, { recursive: true });
  const file = `${Date.now().toString(36)}-${clean(name)}`;
  writeFileSync(join(dir, file), b);
  return { file, name, size: b.length, ...estimate(name, b) };
}

// Pièces déjà envoyées, retrouvées par leur nom rangé (jamais de chemin donné par la page).
export function piecesOf(project: string, files: string[]): Piece[] {
  if (files.length > MAX_PIECES) throw new Refused(`${MAX_PIECES} pièces au plus par message.`);
  return files.map((f) => {
    const file = String(f);
    const path = join(piecesDir(project), file);
    if (/[\\/]/.test(file) || file.includes('..') || !existsSync(path)) throw new Refused(`Pièce introuvable : ${file}. Rejoignez-la de nouveau.`);
    const b = readFileSync(path);
    return { file, name: file.replace(/^[a-z0-9]+-/, ''), size: b.length, ...estimate(file, b) };
  });
}

export const pieceType = (file: string) => ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf' } as Record<string, string>)[extname(file).toLowerCase()] ?? 'text/plain; charset=utf-8';
