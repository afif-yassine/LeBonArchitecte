// Exécuteur de commandes (LBA-5). Toute commande d'un agent passe ici :
// - les commandes interdites sont refusées avant de partir, avec la raison ;
// - la sortie complète est gardée dans .lba/logs (pour vous et l'audit) ;
// - l'agent ne reçoit qu'un résumé court : c'est là que l'on économise les tokens.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Refused } from './tickets.ts';

// Interdits par défaut (cahier des charges E16). Le propriétaire les lève au cas par cas, jamais l'agent.
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /\bgit\s+push\b/i, why: 'envoyer sur GitHub demande votre « oui »' },
  { re: /\bgit\s+merge\b/i, why: 'réunir des branches demande votre « oui »' },
  { re: /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f)/i, why: 'efface du travail sans retour' },
  { re: /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|Remove-Item\b.*-Recurse|\brd\s+\/s|\brmdir\s+\/s/i, why: 'suppression récursive' },
  { re: /(^|[\s"'/\\])\.env(\.[\w-]+)?(\s|$|["'])|id_rsa|\.pem\b/i, why: 'lire un fichier de secrets est interdit' },
  { re: /\|\s*(ba|z)?sh\b|\|\s*iex\b|Invoke-Expression/i, why: 'exécuter un script téléchargé (curl | bash) est interdit' },
  { re: /\bnpm\s+publish\b|\bvercel\b.*--prod|\bdeploy\b/i, why: 'publier ou déployer demande votre « oui »' },
];

export function checkCommand(command: string): void {
  const hit = FORBIDDEN.find((f) => f.re.test(command));
  if (hit) throw new Refused(`Commande refusée : ${hit.why}. (${command.slice(0, 80)})`);
}

export interface RunResult {
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  lines: number;
  summary: string; // ce que reçoit l'agent
  log: string; // chemin du fichier de sortie complète, relatif au projet
  timedOut: boolean;
}

// Résumé sans IA : chiffres des tests s'ils existent, sinon les lignes d'erreur, sinon la fin.
export function summarize(output: string, ok: boolean): string {
  const lines = output.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const pick = (re: RegExp) => lines.map((l) => l.match(re)?.[1]).find((x) => x !== undefined);
  const pass = pick(/^ℹ pass (\d+)/) ?? pick(/(\d+) passed/) ?? pick(/Tests:.*?(\d+) passed/);
  const fail = pick(/^ℹ fail (\d+)/) ?? pick(/(\d+) failed/);
  const errors = lines.filter((l) => /error|erreur|failed|✖|not ok|exception/i.test(l) && !/^ℹ fail 0/.test(l)).slice(0, 6);
  const parts: string[] = [];
  if (pass !== undefined || fail !== undefined) parts.push(`Tests : ${pass ?? 0} passés, ${fail ?? 0} en échec.`);
  if (!ok && errors.length) parts.push(...errors.map((e) => e.slice(0, 200)));
  if (!parts.length) parts.push(...lines.slice(-3).map((e) => e.slice(0, 200)));
  return parts.join('\n') || (ok ? 'Terminé sans sortie.' : 'Échec sans message.');
}

let n = 0;
export function runCommand(command: string, o: { cwd: string; ticket?: string; timeoutMs?: number; logDir?: string }): Promise<RunResult> {
  checkCommand(command);
  const started = Date.now();
  const logDir = o.logDir ?? join(o.cwd, '.lba', 'logs');
  mkdirSync(logDir, { recursive: true });
  const file = join(logDir, `${o.ticket ?? 'cmd'}-${started}-${++n}.log`);
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(command, { cwd: o.cwd, shell: true, windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, o.timeoutMs ?? 120_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const done = (code: number | null) => {
      clearTimeout(timer);
      const ok = code === 0 && !timedOut;
      writeFileSync(file, `$ ${command}\n${out}\n[code ${code}${timedOut ? ', temps dépassé' : ''}]\n`);
      const summary = timedOut ? `Temps dépassé (${Math.round((o.timeoutMs ?? 120_000) / 1000)} s) : commande arrêtée.` : summarize(out, ok);
      resolve({ ok, exitCode: code, durationMs: Date.now() - started, lines: out.split('\n').length, summary, log: relative(o.cwd, file).replaceAll('\\', '/'), timedOut });
    };
    child.on('error', (err) => { out += String(err); done(null); });
    child.on('close', done);
  });
}
