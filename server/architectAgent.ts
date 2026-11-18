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
import { pickArchitectModel } from '../src/shared/architect.ts';
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
  'Sécurité : si un ticket touche la connexion, les droits, un quota ou une limite, un paiement ou un envoi de fichiers, ajoute un critère « Test d’abus : <la triche précise> échoue » (exemple : « Test d’abus : supprimer puis remettre le fichier ne remet pas le quota à zéro »). Si la règle n’existe pas encore, propose-la pour les règles du projet. Le programme cherche déjà les secrets et les fichiers .env : pas besoin d’un ticket pour cela.',
  'Économie de tokens : l’état du projet t’est donné, ne le redemande que s’il a changé. Ne relis jamais un fichier déjà lu. Lis par morceaux (Grep, Read avec offset). Ne lis pas docs/JOURNAL.md ni toutes les décisions sauf si la demande les concerne.',
  'Pour trouver du code : la carte attend un NOM du code (souvent en anglais : architectRefusal, mergeTicket, Engine…), pas un mot français. Si tu connais le nom, lance node scripts/lba.mjs carte <nom> (où il est, qui l’utilise, avec fichiers et lignes ; avec deux noms : le chemin entre eux). Sinon, un seul Grep pour trouver le nom, puis la carte pour ses liens au lieu d’ouvrir les fichiers un par un. Lis ensuite seulement les lignes utiles. Ne lis jamais le dossier graphify-out (trop gros).',
  'Tu ne modifies aucun fichier toi-même. Pour écrire ou changer un document ou du code : crée un ticket précis puis lance-le ; un agent le fait dans sa branche, le propriétaire valide. Le programme choisit le mode le moins cher (un document simple coûte environ 6 k).',
  'Tu es un conseiller critique, pas un exécutant : le propriétaire ne connaît pas la technique et compte sur toi pour l’arrêter quand une idée est mauvaise, même s’il insiste.',
  'Demande petite et claire (ordre du kanban, lancer, pause, message, un ticket simple) : fais-la tout de suite. Demande grosse ou structurelle (nouveaux agents ou équipe, chaîne d’agents, architecture, nouvelle fonction, plus de 3 tickets, plus de 50 k estimés) : NE FAIS RIEN avant son « oui ». Réponds dans cet ordre : « Avis : je conseille / je déconseille / à adapter » ; les problèmes, même si l’idée est bonne, expliqués comme à un débutant ; « Existe déjà ? » (dans le projet, ou un logiciel gratuit que tu connais, marqué « à vérifier » ; si une recherche web est utile, propose un petit ticket de recherche) ; le coût en tokens de son idée et de ta proposition côte à côte ; ta meilleure proposition, la plus simple qui marche ; puis « Dites oui, ou choisissez ».',
  'Principes d’architecture de LBA : un seul agent par ticket ; tests, vérifications, réunion dans main et mise en ligne faits par le programme (0 token), pas par des agents ; éviter les passages de relais entre agents (chaque agent relit tout le contexte du précédent : on paie plusieurs fois la même lecture) ; réutiliser l’existant (code du projet, outils installés, logiciels gratuits) avant de construire ; le plus simple qui marche ; mesurer avant d’optimiser.',
  'Contradiction : avant d’agir, compare la demande avec les consignes passées du propriétaire, les décisions et les tickets en cours (fournis). Si elle en contredit une et qu’un ticket concerné est déjà commencé (en cours, à tester, fini), NE FAIS RIEN : écris « Contradiction : » avec la consigne ou la décision contredite (date), le ticket touché et ce qu’il a déjà coûté, puis 3 choix avec ton avis et leur coût : 1) garder l’ancien, 2) remplacer (mettre l’ancien en pause, son travail reste dans sa branche, nouveau ticket), 3) combiner si c’est possible sans tout refaire. Il répondra. Si le ticket concerné n’a pas commencé, replanifie-le et dis-le en une ligne. Rien n’est jamais effacé ; un vrai changement de direction devient aussi un ticket « Décision : … ».',
  'Termine toujours par une ligne « Fait : … » qui liste tes actions, ou « Rien fait : … » avec la raison.',
].join('\n');

// Lecture seule sur le projet (main, toujours à jour) + la commande lba. Aucune écriture de fichier.
const ALLOWED = ['Read', 'Glob', 'Grep', 'Bash(node scripts/lba.mjs *)', 'Bash(git status)', 'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)'];
const DENIED = ['Edit', 'Write', 'NotebookEdit', 'Read(**/.env*)', 'Read(**/*.pem)', 'Read(~/.claude/**)', 'Glob(~/.claude/**)', 'Grep(~/.claude/**)',
  'Read(**/graphify-out/**)', 'Grep(**/graphify-out/**)', 'Glob(**/graphify-out/**)',
  'Bash(git push *)', 'Bash(git merge *)', 'Bash(git reset *)', 'Bash(git checkout *)', 'Bash(git add *)', 'Bash(git commit *)', 'Bash(git -C *)', 'Bash(rm *)', 'Bash(curl *)', 'Bash(npx *)', 'Bash(npm *)',
  'WebFetch', 'WebSearch'];

// Choix du modèle : règle partagée avec l'écran (src/shared/architect.ts).
export { pickArchitectModel };

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
  // Les commandes (/usage, /context…) sont faites par le programme : ni consignes ni réponses à retenir.
  const fil = engine.architectThread(project, 120).filter((m) => !m.commande);
  const when = (at: string) => at.slice(5, 16).replace('T', ' ');
  const asks = fil.filter((m) => m.who === 'vous').slice(-10);
  const acts = fil.filter((m) => m.who === 'action').slice(-12);
  let decisions: string[] = [];
  if (repo) try {
    decisions = readdirSync(join(repo, 'docs', 'decisions')).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort()
      .map((f) => readFileSync(join(repo, 'docs', 'decisions', f), 'utf8').split('\n')[0].replace(/^#\s*/, '').slice(0, 110));
  } catch { /* pas de dossier de décisions */ }
  // Sa dernière réponse : si le propriétaire répond « oui » plus tard, il sait à quoi.
  const last = fil.filter((m) => m.who === 'architecte').slice(-1)[0];
  return [
    asks.length ? ['Consignes passées du propriétaire :', ...asks.map((a) => `- ${when(a.at)} ${String(a.text).slice(0, 200)}`)].join('\n') : '',
    last ? `Ta dernière réponse (${when(last.at)}) :\n${String(last.text).slice(0, 900)}` : '',
    acts.length ? ['Tes dernières actions :', ...acts.map((a) => `- ${when(a.at)} ${a.text}`)].join('\n') : '',
    decisions.length ? ['Décisions prises (titres ; lis un fichier seulement si la demande le touche) :', ...decisions.map((d) => `- ${d}`)].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

// Au-delà de cette taille, reprendre la conversation coûte plus que repartir avec le carnet (mesuré sur LBA-15).
const MAX_RESUME_CONTEXT = 60_000;

// « Avis de l'Architecte » en PDF (style des comptes rendus, décision 0013) : l'essentiel d'abord, sa réponse, puis
// en annexe votre demande exacte, ses actions et ce que ça a coûté. Construit depuis son fil : 0 token.
export function adviceMarkdown(engine: Engine, project: string, id: number): string | undefined {
  const fil = engine.architectThread(project, 500);
  const i = fil.findIndex((m) => m.id === id && m.who === 'architecte');
  if (i < 0) return undefined;
  const a = fil[i];
  let j = i - 1; while (j >= 0 && fil[j].who !== 'vous') j--;
  const q = j >= 0 ? fil[j] : undefined;
  const acts = fil.slice(j + 1, i).filter((m) => m.who === 'action');
  const text = String(a.text);
  const verdict = text.match(/Avis\s*:\s*\**\s*([^.\n*]+)/i)?.[1]?.trim();
  const light = /contradiction/i.test(text) || /déconseille/i.test(verdict ?? '') ? '🟠 À décider' : /^Fait\s*:/m.test(text) && acts.length ? '🟢 Fait' : '🔵 Avis';
  const k = (n: unknown) => `${Math.round(Number(n ?? 0) / 1000 * 10) / 10} k`;
  const first = text.replace(/[*#>`]/g, '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return [
    `# Avis de l’Architecte`,
    `${new Date(a.at).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}, Claude ${a.model ?? ''}`,
    '',
    `> ${light} : ${first.slice(0, 300)}`,
    '',
    '## L’essentiel',
    '| État | Votre demande | Actions faites | Tokens | Durée |', '|---|---|---|---|---|',
    `| ${light} | ${String(q?.text ?? '').replace(/\|/g, '/').slice(0, 120)} | ${acts.length} | ${k(a.tokens)} | ${a.ms ? `${Math.round(Number(a.ms) / 1000)} s` : 'non mesurée'} |`,
    '',
    '## Sa réponse', text.replace(/^#\s/gm, '### '),
    '',
    '## Annexes : les preuves',
    `Votre demande exacte : « ${String(q?.text ?? '').replace(/\n/g, ' ')} »`, '',
    ...(acts.length ? ['Actions faites (au nom de l’Architecte, dans le journal) :', ...acts.map((x) => `- \`${String(x.text).replace(/`/g, '')}\``), ''] : ['Aucune action faite.', '']),
    `Consommation : ${k(a.tokens)} tokens comptés, ${k(a.cacheRead)} relus du cache, ${a.turns ?? 0} échanges, contexte de ${k(a.context)} à la fin.`,
  ].join('\n');
}

// Pour /context et /compact (0 token) : ce que la prochaine demande emportera, et si elle reprend ou repart à neuf.
// Les tailles du texte préparé sont estimées (1 token ≈ 4 caractères) ; celle de la conversation est mesurée.
export function architectContext(engine: Engine, project: string, repo: string) {
  const est = (s: string) => Math.round(s.length / 4);
  const prev = engine.sessionOf(`${ARCHITECT_ID}-${project}`) || undefined;
  const size = prev ? contextOf(repo, prev).end : 0;
  const warm = prev ? cacheWarm(repo, prev) : false;
  const resume = Boolean(prev && warm && size < MAX_RESUME_CONTEXT);
  return {
    rules: est(RULES), digest: est(projectDigest(engine, project)), notebook: est(notebook(engine, project, repo)),
    session: prev, size, warm, resume, maxResume: MAX_RESUME_CONTEXT,
    why: !prev ? 'aucune conversation en cours' : resume ? 'conversation de moins de 5 min et assez courte' : size >= MAX_RESUME_CONTEXT ? 'conversation trop longue' : 'pause de plus de 5 min, le cache a expiré',
  };
}
// /compact : oublier la conversation ; la prochaine demande repart avec le carnet (écrit par le programme, 0 token).
export function forgetArchitectSession(engine: Engine, project: string): void { engine.setSession(`${ARCHITECT_ID}-${project}`, ''); }

const short = (s: unknown, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const running = new Map<string, ChildProcess>();
export const architectRunning = (project: string) => running.has(project);

export function askArchitectAgent(engine: Engine, project: string, repo: string, text: string): string {
  if (!text.trim()) throw new Refused('Écrivez votre demande à l’Architecte.');
  if (running.has(project)) throw new Refused('L’Architecte travaille déjà sur votre demande précédente : attendez sa réponse.');
  const model = pickArchitectModel(text, engine.architectModel(project));
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
  const started = Date.now(); // durée affichée sous chaque réponse
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
        ms: Date.now() - started,
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

