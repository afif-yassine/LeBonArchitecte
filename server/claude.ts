// Adaptateur Claude (LBA-6) : le moteur lance Claude Code lui-même en mode non interactif,
// avec la connexion de l'abonnement du propriétaire, dans le worktree du ticket.
// Sortie « stream-json » lue ligne par ligne et racontée dans le direct.
// Interdits appliqués par Claude Code lui-même (règles deny), en plus du contrôle du moteur.
import { spawn, type ChildProcess } from 'node:child_process';
import { relative } from 'node:path';
import type { Ticket } from '../src/shared/contract.ts';
import type { Engine } from './engine.ts';

const ALLOWED = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(npm *)', 'Bash(npx *)', 'Bash(node *)',
  'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(git add *)', 'Bash(git commit *)'];
const DENIED = ['Bash(git push *)', 'Bash(git merge *)', 'Bash(git reset *)', 'Bash(git checkout *)', 'Bash(rm *)',
  'Bash(curl *)', 'Bash(npm publish *)', 'Read(**/.env*)', 'Read(**/*.pem)', 'Edit(**/.env*)', 'WebFetch', 'WebSearch'];

const MODEL: Record<string, string> = { Haiku: 'haiku', Sonnet: 'sonnet', Opus: 'opus' }; // jamais Fable

export interface RunOutcome { ok: boolean; reason: string; read: string[]; tokens: number; testsGreen?: boolean; summary?: string }

function promptFor(t: Ticket, complaint?: string): string {
  return [
    ...(complaint ? [`RÉCLAMATION du propriétaire après sa recette : « ${complaint} ». Corrige d’abord cela.`, ''] : []),
    `Ticket ${t.id} : ${t.title}`,
    `Pourquoi : ${t.description.context}`,
    `Attendu : ${t.description.expected}`,
    `Hors périmètre : ${t.description.outOfScope}`,
    'Critères d’acceptation :', ...t.criteria.map((c) => `- ${c.text}`),
    'Plan (chaque étape sera vérifiée par le programme après toi) :', ...t.steps.map((s, i) => `${i + 1}. ${s.label} (preuve : ${s.proof.text})`),
    '',
    'Travaille seulement dans ce dossier. Fais des changements petits et lisibles. Lance les tests du projet avant de finir.',
    'Ne fais ni push ni merge : le programme réunit ton travail dans main après des tests verts.',
    'Termine par un résumé en français simple : ce qui a été fait, ce qui a été ajouté, les tests.',
  ].join('\n');
}

// Une vraie commande de tests, pas n'importe quelle commande qui contient le mot « test ».
const TEST_CMD = /(^|[;&|]\s*)(npm (run )?test|npx (vitest|jest|playwright)|node --test|vitest|jest|playwright test)\b/;
const DENIED_MSG = /^Permission to use|was denied|denied by/i;

const short = (s: unknown, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function runClaude(engine: Engine, t: Ticket, cwd: string, complaint: string | undefined, onEnd: (o: RunOutcome) => void): ChildProcess {
  const who = `claude-${(MODEL[t.model] ?? 'sonnet')}`;
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', MODEL[t.model] ?? 'sonnet',
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(','),
    '--max-budget-usd', '3',
    '--append-system-prompt', 'Tu travailles pour Le Bon Architecte. Réponds et résume en français simple, sans jargon.'];
  const child = spawn('claude', args, { cwd, windowsHide: true, env: { ...process.env } });
  child.stdin.end(promptFor(t, complaint));

  const live = (kind: Parameters<Engine['live']>[1]['kind'], text: string, detail?: string, ok?: boolean) => {
    try { engine.live(t.id, { kind, text, detail, ok }, who); } catch { /* ticket supprimé ou arrêté : on ignore */ }
  };
  const tools = new Map<string, { name: string; cmd?: string }>();
  const read = new Set<string>();
  let testFailed = false;
  let testsGreen: boolean | undefined;
  let buf = '';
  let outcome: RunOutcome | undefined;
  let err = '';
  let lastText = '';

  const onMsg = (m: Record<string, any>) => {
    if (m.type === 'system' && m.subtype === 'init') live('agent', `Agent Claude démarré sur ${m.model}`, `${m.tools?.length ?? 0} outils, dossier du ticket`);
    else if (m.type === 'system' && m.subtype === 'api_retry') live('systeme', `Nouvel essai de l’API (${m.error})`, `essai ${m.attempt} sur ${m.max_retries}`);
    else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const b of m.message?.content ?? []) {
        if (b.type === 'thinking' && b.thinking) live('reflexion', short(b.thinking, 500));
        else if (b.type === 'text' && b.text?.trim()) { lastText = short(b.text, 600); live('message', lastText); }
        else if (b.type === 'tool_use') {
          const i = b.input ?? {};
          const file = i.file_path ? relative(cwd, i.file_path).replaceAll('\\', '/') : '';
          tools.set(b.id, { name: b.name, cmd: i.command });
          if (b.name === 'Bash') live('commande', short(i.command, 200), i.description ? short(i.description, 160) : undefined);
          else if (b.name === 'Read') { read.add(file); live('action', `Lit ${file}`); }
          else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(b.name)) live('action', `${b.name === 'Write' ? 'Écrit' : 'Modifie'} ${file}`);
          else if (b.name === 'Glob' || b.name === 'Grep') live('action', `Cherche ${short(i.pattern, 80)}`);
          else if (b.name === 'Agent' || b.name === 'Task') live('agent', `Agent d’aide lancé : ${short(i.description, 120)}`);
          else if (b.name === 'Skill') live('skill', `Ouvre le skill « ${short(i.skill ?? i.name, 60)} »`);
          else if (b.name !== 'TodoWrite') live('action', b.name);
        }
      }
    } else if (m.type === 'user' && !m.parent_tool_use_id) {
      for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
        if (b.type !== 'tool_result') continue;
        const tool = tools.get(b.tool_use_id);
        const text = Array.isArray(b.content) ? b.content.map((c: { text?: string }) => c.text ?? '').join(' ') : String(b.content ?? '');
        if (b.is_error && DENIED_MSG.test(text.trim())) live('systeme', `Refusé par les règles du projet : ${short(tool?.cmd ?? tool?.name, 120)}`, 'L’agent doit passer par un autre moyen autorisé.', false);
        else if (tool?.name === 'Bash' && TEST_CMD.test(tool.cmd ?? '')) {
          testsGreen = !b.is_error;
          if (b.is_error) { testFailed = true; live('test', `${short(tool.cmd, 80)} : en échec`, short(text, 240), false); live('bug', short(text.split('\n').find((l: string) => /error|fail|✖|not ok/i.test(l)) ?? text, 200), 'Trouvé par les tests', false); }
          else { live('test', `${short(tool.cmd, 80)} : vert`, undefined, true); if (testFailed) { testFailed = false; live('resolu', 'Les tests repassent au vert', 'Corrigé par l’agent', true); } }
        } else if (b.is_error) live('systeme', `${tool?.name ?? 'Outil'} en échec`, short(text, 240), false);
      }
    } else if (m.type === 'result') {
      const u = m.usage ?? {};
      const tokens = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      try { engine.tokens(t.id, { used: tokens, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: m.num_turns ?? 0 }); } catch { /* ignore */ }
      const ok = m.subtype === 'success' && !m.is_error;
      live('systeme', ok ? `Agent fini : ${m.num_turns} tours, ${tokens.toLocaleString('fr-FR')} tokens` : `Agent arrêté : ${m.subtype}`,
        `${(u.cache_read_input_tokens ?? 0).toLocaleString('fr-FR')} tokens relus depuis le cache ; coût estimé ${Number(m.total_cost_usd ?? 0).toFixed(2)} $ (compté sur votre abonnement)`, ok);
      if (m.result && short(m.result, 600) !== lastText) live('message', short(m.result, 900));
      outcome = { ok, reason: ok ? 'fini' : String(m.subtype), read: [...read], tokens, testsGreen, summary: short(m.result, 600) };
    }
  };

  child.stdout.on('data', (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try { onMsg(JSON.parse(line)); } catch { /* ligne non JSON : ignorée */ }
    }
  });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += e.message; });
  child.on('close', (code) => {
    onEnd(outcome ?? { ok: false, reason: code === 143 || code === null ? 'arrêté' : `Claude Code s’est arrêté (code ${code}) : ${short(err, 200) || 'sans message'}`, read: [...read], tokens: 0 });
  });
  return child;
}
