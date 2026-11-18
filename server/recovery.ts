// Reprise après redémarrage ou panne (LBA-16) : la passation d'un ticket interrompu.
// Écrite par le programme à partir de ce qu'il constate (0 token), jamais sur parole de l'agent.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ticket } from '../src/shared/contract.ts';
import { lastProvedStep } from './tickets.ts';

const MAX_FILES = 40;
const STATE: Record<string, string> = { prouve: 'prouvée', annonce: 'annoncée, pas prouvée', 'en-cours': 'commencée', 'a-faire': 'à faire' };
const short = (s: string, n = 300) => s.replace(/\s+/g, ' ').trim().slice(0, n);

const fileList = (files: string[]) => [
  ...files.slice(0, MAX_FILES).map((f) => `- ${f}`),
  ...(files.length > MAX_FILES ? [`- … et ${files.length - MAX_FILES} autres`] : []),
];

export function handoffText(t: Ticket, o: { committed: string[]; pending: string[]; notes: string[]; complaint?: string }): string {
  const last = lastProvedStep(t);
  return [
    `# Passation de ${t.id} : ${t.title}`,
    '',
    'Écrite par le programme après une interruption. Ne refais pas les étapes prouvées : pars de leur résultat, regarde les fichiers ci-dessous, puis termine le reste.',
    '',
    `Dernière étape prouvée : ${last ? last.label : 'aucune pour l’instant'}.`,
    '',
    '## Étapes du plan',
    ...t.steps.map((s, i) => `${i + 1}. [${STATE[s.state] ?? s.state}] ${s.label}${s.state === 'prouve' && s.evidence ? ` (${short(s.evidence, 160)})` : ''}`),
    ...(o.complaint ? ['', '## Réclamation à traiter d’abord', short(o.complaint, 1000)] : []),
    ...(o.committed.length ? ['', '## Déjà enregistré dans la branche du ticket', ...fileList(o.committed)] : []),
    ...(o.pending.length ? ['', '## Modifié mais pas encore enregistré (peut être incomplet : à relire)', ...fileList(o.pending)] : []),
    ...(o.notes.length ? ['', '## Derniers messages de l’agent coupé', ...o.notes.map((n) => `- ${short(n)}`)] : []),
  ].join('\n');
}

export function writeHandoff(repo: string, id: string, text: string): string {
  const dir = join(repo, '.lba', 'passations');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.md`);
  writeFileSync(file, `${text}\n`, 'utf8');
  return file;
}
