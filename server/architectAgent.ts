// L'Architecte, agent autonome (décision 0014, lot B) : un agent Claude Code qui tient tout le projet
// avec la commande `lba`, sans question de permission, dans les garde-fous du serveur.
//
// Économie (votre question du 18 nov.) : il ne relit PAS les règles ni les procédures à chaque demande.
// - Règles et procédures = consigne système FIXE, toujours identique : mise en cache, relue à 10 % du prix.
// - L'état du projet est préparé par le programme (0 token) et joint à la demande : pas d'outil pour le chercher.
// - Une demande = une conversation courte. Il reprend sa conversation seulement si elle date de moins de
//   5 minutes (cache encore chaud) ; sinon il repart avec son carnet (ses 12 dernières actions, écrit par
//   le programme), au lieu de recharger une longue conversation au plein tarif.
// - Sonnet pour une consigne simple, Opus pour l'architecture et les décisions (décision 0007).
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextOf } from './claude.ts';
import type { Engine } from './engine.ts';
import { Refused } from './tickets.ts';
import { cacheWarm } from './supervisor.ts';

export const ARCHITECT_ID = 'architecte';
const MODEL = { Opus: 'opus', Sonnet: 'sonnet' } as const;

// Consigne fixe (jamais de valeur qui change ici : sinon le cache ne sert plus).
const RULES = [
  'Tu es l’Architecte de « Le Bon Architecte » : tu tiens tout le projet du propriétaire, comme un chef de projet technique.',
  'Le propriétaire parle français simple : réponds en français simple, sans jargon, phrases courtes. Avis d’abord, puis ce que tu as fait.',
  'Tu agis seul, sans demander la permission, avec la commande : node scripts/lba.mjs <commande> (node scripts/lba.mjs aide pour la liste).',
  'Tu peux : créer des tickets (titre, attendu, critères vérifiables, modèle), valider des plans, changer l’ordre, lancer, mettre en pause, reprendre, écrire aux agents, leur demander de résoudre, lire le code, les documents, les déroulés et les comptes rendus.',
  'Restent au propriétaire (le serveur te les refuse) : réunir dans main (Valider), git, le pilote et le budget, supprimer, décider de tes propres propositions. Si c’est nécessaire, dis-lui précisément quoi faire.',
  'Règles du projet : ne jamais perturber un ticket en cours sans raison ; un changement de périmètre devient un nouveau ticket ; jamais le modèle Fable ; Opus seulement pour le risqué ou l’architecture, sinon Sonnet, Haiku pour le très simple.',
  'Un bon ticket : un titre court, ce qui est attendu, 2 à 4 critères vérifiables par un outil, les dépendances, le lot. Pas de ticket en double : regarde l’état fourni.',
  'Économie de tokens : l’état du projet t’est donné, ne le redemande que s’il a changé. Ne relis jamais un fichier déjà lu. Lis par morceaux (Grep, Read avec offset). Ne lis pas docs/JOURNAL.md ni toutes les décisions sauf si la demande les concerne.',
  'Tu ne modifies aucun fichier toi-même. Pour écrire ou changer un document ou du code : crée un ticket précis puis lance-le ; un agent le fait dans sa branche, le propriétaire valide. Le programme choisit le mode le moins cher (un document simple coûte environ 6 k).',
  'Contradiction : avant d’agir, compare la demande avec les consignes passées du propriétaire, les décisions et les tickets en cours (fournis). Si elle en contredit une et qu’un ticket concerné est déjà commencé (en cours, à tester, fini), NE FAIS RIEN : écris « Contradiction : » avec la consigne ou la décision contredite (date), le ticket touché et ce qu’il a déjà coûté, puis 3 choix avec ton avis et leur coût : 1) garder l’ancien, 2) remplacer (mettre l’ancien en pause, son travail reste dans sa branche, nouveau ticket), 3) combiner si c’est possible sans tout refaire. Il répondra. Si le ticket concerné n’a pas commencé, replanifie-le et dis-le en une ligne. Rien n’est jamais effacé ; un vrai changement de direction devient aussi un ticket « Décision : … ».',
  'Termine toujours par une ligne « Fait : … » qui liste tes actions, ou « Rien fait : … » avec la raison.',
].join('\n');

// Lecture seule sur le projet (main, toujours à jour) + la commande lba. Aucune écriture de fichier.
const ALLOWED = ['Read', 'Glob', 'Grep', 'Bash(node scripts/lba.mjs *)', 'Bash(git status)', 'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)'];
const DENIED = ['Edit', 'Write', 'NotebookEdit', 'Read(**/.env*)', 'Read(**/*.pem)', 'Read(~/.claude/**)', 'Glob(~/.claude/**)', 'Grep(~/.claude/**)',
  'Bash(git push *)', 'Bash(git merge *)', 'Bash(git reset *)', 'Bash(git checkout *)', 'Bash(git add *)', 'Bash(git commit *)', 'Bash(git -C *)', 'Bash(rm *)', 'Bash(curl *)', 'Bash(npx *)', 'Bash(npm *)',
  'WebFetch', 'WebSearch'];

// Opus pour ce qui touche à l'architecture ou aux décisions ; Sonnet pour une consigne. « /opus » ou « /sonnet » au début force le choix.
export function pickArchitectModel(text: string): 'Opus' | 'Sonnet' {
  if (/^\/opus\b/i.test(text)) return 'Opus';
  if (/^\/sonnet\b/i.test(text)) return 'Sonnet';
  return /architect|revue|cahier des charges|décision|decision|stratégi|risque|sécurit|audit|pourquoi|priorit|plan du projet|équipe|equipe/i.test(text) || text.length > 500 ? 'Opus' : 'Sonnet';
}

// État du projet préparé par le programme (0 token) : ce que l'Architecte demanderait sinon avec un outil.
export function projectDigest(engine: Engine, project: string): string {
  const ts = engine.tickets(project);
  const done = new Set(ts.filter((t) => t.status === 'termine').map((t) => t.id));
  const p = engine.pilotState();
  const col = (s: string, label: string, max = 20) => {
    const list = ts.filter((t) => t.status === s).sort((a, b) => a.priority - b.priority);
    if (!list.length) return '';
    const rows = list.slice(-max).map((t) => {
      const wait = t.deps.filter((d) => !done.has(d));
      return `- ${t.id} [${t.model}, lot ${t.lot}] ${t.title}${t.paused ? ' (pause)' : ''}${t.status === 'a-faire' && !t.planOk ? ' (plan à valider)' : ''}${wait.length && t.status === 'a-faire' ? ` (attend ${wait.join(', ')})` : ''}${t.needAction ? ` : ${t.needAction.slice(0, 100)}` : ''}`;
    });
    return [`${label} (${list.length}) :`, ...(list.length > max ? [`- … ${list.length - max} plus anciens`] : []), ...rows].join('\n');
  };
  return [
    `État du projet ${project} (préparé par le programme) :`,
    `Pilote ${p.on ? 'allumé' : 'coupé'}, budget du jour ${Math.round(p.spentToday / 1000)} k sur ${Math.round(p.dayBudget / 1000)} k${p.budgetHit ? ' : ATTEINT, aucun ticket ne part' : ''}.`,
    col('action', 'Besoin d’action'), col('en-cours', 'En cours'), col('a-tester', 'À tester'), col('a-faire', 'À faire'), col('termine', 'Fini', 6),
  ].filter(Boolean).join('\n');
}

// Carnet, écrit par le programme (0 token) : mémoire courte quand il repart à neuf.
// Vos 10 dernières consignes + ses 12 dernières actions + le titre de chaque décision : de quoi voir une contradiction.
export function notebook(engine: Engine, project: string, repo?: string): string {
  const fil = engine.architectThread(project, 120);
  const when = (at: string) => at.slice(5, 16).replace('T', ' ');
  const asks = fil.filter((m) => m.who === 'vous').slice(-10);
  const acts = fil.filter((m) => m.who === 'action').slice(-12);
  let decisions: string[] = [];
  if (repo) try {
    decisions = readdirSync(join(repo, 'docs', 'decisions')).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort()
      .map((f) => readFileSync(join(repo, 'docs', 'decisions', f), 'utf8').split('\n')[0].replace(/^#\s*/, '').slice(0, 110));
  } catch { /* pas de dossier de décisions */ }
  return [
    asks.length ? ['Consignes passées du propriétaire :', ...asks.map((a) => `- ${when(a.at)} ${String(a.text).slice(0, 200)}`)].join('\n') : '',
    acts.length ? ['Tes dernières actions :', ...acts.map((a) => `- ${when(a.at)} ${a.text}`)].join('\n') : '',
    decisions.length ? ['Décisions prises (titres ; lis un fichier seulement si la demande le touche) :', ...decisions.map((d) => `- ${d}`)].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

// Au-delà de cette taille, reprendre la conversation coûte plus que repartir avec le carnet (mesuré sur LBA-15).
const MAX_RESUME_CONTEXT = 60_000;

const short = (s: unknown, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const running = new Map<string, ChildProcess>();
export const architectRunning = (project: string) => running.has(project);

export function askArchitectAgent(engine: Engine, project: string, repo: string, text: string): string {
  if (!text.trim()) throw new Refused('Écrivez votre demande à l’Architecte.');
  if (running.has(project)) throw new Refused('L’Architecte travaille déjà sur votre demande précédente : attendez sa réponse.');
  const model = pickArchitectModel(text);
  const ask = text.replace(/^\/(opus|sonnet)\s*/i, '').trim();
  const cwd = repo; // lecture seule : il voit main tel qu'il est maintenant
  const key = `${ARCHITECT_ID}-${project}`;
  const prev = engine.sessionOf(key);
  // Reprendre seulement si le cache est chaud (moins de 5 min) ET la conversation encore courte.
  const size = prev ? contextOf(cwd, prev).end : 0;
  const resume = prev && cacheWarm(cwd, prev) && size < MAX_RESUME_CONTEXT ? prev : undefined;
  const fresh = prev && !resume ? (size >= MAX_RESUME_CONTEXT ? `conversation trop longue (${Math.round(size / 1000)} k)` : 'pause de plus de 5 min') : '';

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', MODEL[model],
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(','),
    '--max-budget-usd', model === 'Opus' ? '6' : '2',
    '--strict-mcp-config', '--disable-slash-commands', '--tools', 'Read,Glob,Grep,Bash',
    '--effort', model === 'Opus' ? 'high' : 'medium',
    '--append-system-prompt', RULES];
  if (resume) args.push('--resume', resume);
  // Carnet lu AVANT d'écrire la nouvelle demande dans le fil (sinon elle s'y trouverait deux fois).
  const prompt = [resume ? '' : notebook(engine, project, repo), projectDigest(engine, project), '', `Demande du propriétaire : ${ask}`].filter((x) => x !== '').join('\n\n');

  engine.architectSay(project, 'vous', ask, { model });
  engine.architectSay(project, 'systeme', resume
    ? `Reprend sa conversation (${Math.round(size / 1000)} k, moins de 5 min) sur ${model}.`
    : `Nouvelle conversation sur ${model}, avec son carnet et l’état du projet${fresh ? ` (${fresh})` : ''}.`);
  const child = spawn('claude', args, { cwd, windowsHide: true, env: { ...process.env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
  running.set(project, child);
  child.stdin.end(prompt);

  const tools = new Map<string, string>();
  let buf = ''; let err = ''; let done = false;
  const onMsg = (m: Record<string, any>) => {
    if (m.type === 'system' && m.subtype === 'init' && m.session_id) engine.setSession(key, String(m.session_id));
    else if (m.type === 'assistant' && !m.parent_tool_use_id) {
      for (const b of m.message?.content ?? []) {
        if (b.type === 'tool_use') {
          const i = b.input ?? {};
          const what = b.name === 'Bash' ? short(i.command, 200).replace(/^node scripts\/lba\.mjs /, 'lba ') : `${b.name} ${short(i.file_path ?? i.pattern ?? '', 120)}`;
          tools.set(b.id, what);
          // Seules les actions qui changent quelque chose vont dans le carnet ; les lectures restent discrètes.
          if (/^lba (creer|valider-plan|replanifier|lancer|pause|reprendre|arreter|resoudre|tester|message|refuser|ordre)\b/.test(what)) engine.architectSay(project, 'action', what);
        }
      }
    } else if (m.type === 'user' && !m.parent_tool_use_id) {
      for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
        const out = Array.isArray(b.content) ? b.content.map((c: { text?: string }) => c.text ?? '').join(' ') : String(b.content ?? '');
        if (b.type === 'tool_result' && b.is_error) engine.architectSay(project, 'systeme', `Refusé ou en échec : ${tools.get(b.tool_use_id) ?? 'outil'}`, { detail: short(out, 240) });
      }
    } else if (m.type === 'result') {
      done = true;
      const u = m.usage ?? {};
      const used = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      engine.architectTokens(project, { used, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: m.num_turns ?? 0, model });
      engine.architectSay(project, 'architecte', String(m.result ?? (m.is_error ? 'Erreur sans message.' : '')).slice(0, 6000), {
        model, tokens: used, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: m.num_turns ?? 0, ok: m.subtype === 'success' && !m.is_error,
        context: m.session_id ? contextOf(cwd, String(m.session_id)).end : undefined, // taille de sa conversation après ce tour
      });
    }
  };
  child.stdout.on('data', (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line) try { onMsg(JSON.parse(line)); } catch { /* ligne non JSON */ }
    }
  });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += e.message; });
  child.on('close', (code) => {
    running.delete(project);
    if (!done) engine.architectSay(project, 'systeme', `L’Architecte s’est arrêté sans répondre (code ${code}) : ${short(err, 200) || 'sans message'}`, { ok: false });
    engine.notify();
  });
  return `L’Architecte a reçu votre demande (${model}${resume ? ', suite de la conversation' : ''}).`;
}

