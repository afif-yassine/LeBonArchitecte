// PDF d'un compte rendu, créé à la demande avec l'outil existant (scripts/pdf.mjs, Microsoft Edge) : 0 token.
// Rangé dans <projet>/.lba/comptes-rendus/ (dossier ignoré par git : main reste propre).
// Refait seulement si le compte rendu a changé depuis le dernier PDF.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'pdf.mjs');

export async function reportPdf(repo: string, docPath: string, content: string): Promise<Buffer> {
  const dir = join(repo, '.lba', 'comptes-rendus');
  mkdirSync(dir, { recursive: true });
  const md = join(dir, basename(docPath).replace(/\.pdf$/, '.md'));
  const pdf = md.replace(/\.md$/, '.pdf');
  // À refaire si le texte a changé, ou si la mise en page (scripts/pdf.mjs) est plus récente que le PDF.
  const same = existsSync(md) && existsSync(pdf) && readFileSync(md, 'utf8') === content && statSync(pdf).mtimeMs > statSync(SCRIPT).mtimeMs;
  if (!same) {
    writeFileSync(md, content, 'utf8');
    await run(process.execPath, [SCRIPT, md, '--compte-rendu'], { timeout: 90_000, windowsHide: true });
  }
  return readFileSync(pdf);
}
