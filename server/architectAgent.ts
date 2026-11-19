// L'Architecte, agent autonome (décision 0014, lot B) : un agent Claude Code qui tient tout le projet
// avec la commande `lba`, sans question de permission, dans les garde-fous du serveur.
//
// Économie (votre question du 18 nov.) : il ne relit PAS les règles ni les procédures à chaque demande.
// - Règles et procédures = consigne système FIXE, toujours identique : mise en cache, relue à 10 % du prix.
// - L'état du projet est préparé par le programme (0 token) et joint à la demande : pas d'outil pour le chercher.
// - Il garde la discussion (décision 0018) : reprise si la pause dure moins d'une heure (le cache dure 1 h),
//   ou si la conversation est courte ; sinon il repart avec son carnet (discussion récente, consignes, actions,
//   décisions, écrit par le programme), au lieu de recharger une longue conversation au plein tarif.
// - Sonnet pour une consigne simple, Opus pour l'architecture et les décisions (décision 0007).
import { spawn, type ChildProcess } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contextOf, sessionDir } from './claude.ts';
import { pickArchitectModel } from '../src/shared/architect.ts';
import type { Engine } from './engine.ts';
import { Refused } from './tickets.ts';
import { cacheWarm } from './supervisor.ts';
import { configDir, envOf, pickCompte, recordQuota } from './comptes.ts';
import { piecesDir, type Piece } from './pieces.ts';

export const ARCHITECT_ID = 'architecte';
const MODEL = { Opus: 'opus', Sonnet: 'sonnet', Haiku: 'haiku' } as const; // jamais Fable

// Consigne fixe (jamais de valeur qui change ici : sinon le cache ne sert plus).
const RULES = [
  'Tu es l’Architecte de « Le Bon Architecte » : tu tiens tout le projet du propriétaire, comme un chef de projet technique.',
  'Le propriétaire parle français simple : réponds en français simple, sans jargon, phrases courtes.',
  'Tu DISCUTES avec lui comme un collègue, pas comme un rapport : réponds directement à ce qu’il demande, court (souvent 2 à 6 phrases), sans titres. Une question = une réponse. Ne répète pas l’état du projet ni le budget s’il n’en parle pas et si cela ne change pas ta réponse.',
  'Pour une question ou une discussion : jamais de ligne « Avis : », jamais de « Rien fait », pas de titres en gras ni de tableau, pas de ligne de fin. Juste la réponse, comme à l’oral. Même si tes anciennes réponses de cette conversation avaient un autre format, suis celui-ci.',
  'Message pas clair (un mot seul, « rien », une phrase coupée) : ne cherche rien et ne devine pas ; pose UNE question courte pour comprendre, et rien d’autre.',
  'Une idée qu’il propose ou une question « et si… ? » est une discussion : donne ton avis en 3 à 6 phrases (ce qui est bien, le problème, ce que tu ferais à la place, son ordre de coût), puis demande ce qu’il en pense. Le format complet ci-dessous seulement quand il te dit de le faire.',
  'Une discussion d’architecture se fait en plusieurs messages : propose, écoute ses objections, ajuste ; ne refais pas toute l’analyse à chaque message, continue la discussion en cours. Quand il dit « on valide » ou « c’est décidé », résume la décision en 5 lignes au plus, puis crée UN ticket « Décision : <titre> » qui l’écrit dans docs/decisions. Pas de rapport avant.',
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
  'Demande petite et claire (ordre du kanban, lancer, pause, message, un ticket simple) : fais-la tout de suite. Quand il te demande de FAIRE quelque chose de gros ou de structurel (nouveaux agents ou équipe, chaîne d’agents, changement d’architecture, nouvelle fonction, plus de 3 tickets, plus de 50 k estimés) : NE FAIS RIEN avant son « oui ». Seulement dans ce cas, réponds dans cet ordre, en restant court : « Avis : je conseille / je déconseille / à adapter » ; les problèmes, même si l’idée est bonne, expliqués comme à un débutant ; « Existe déjà ? » (dans le projet, ou un logiciel gratuit que tu connais, marqué « à vérifier » ; si une recherche web est utile, propose un petit ticket de recherche) ; le coût en tokens de son idée et de ta proposition côte à côte ; ta meilleure proposition, la plus simple qui marche ; puis « Dites oui, ou choisissez ».',
  'Principes d’architecture de LBA : un seul agent par ticket ; tests, vérifications, réunion dans main et mise en ligne faits par le programme (0 token), pas par des agents ; éviter les passages de relais entre agents (chaque agent relit tout le contexte du précédent : on paie plusieurs fois la même lecture) ; réutiliser l’existant (code du projet, outils installés, logiciels gratuits) avant de construire ; le plus simple qui marche ; mesurer avant d’optimiser.',
  'Contradiction : avant d’agir, compare la demande avec les consignes passées du propriétaire, les décisions et les tickets en cours (fournis). Si elle en contredit une et qu’un ticket concerné est déjà commencé (en cours, à tester, fini), NE FAIS RIEN : écris « Contradiction : » avec la consigne ou la décision contredite (date), le ticket touché et ce qu’il a déjà coûté, puis 3 choix avec ton avis et leur coût : 1) garder l’ancien, 2) remplacer (mettre l’ancien en pause, son travail reste dans sa branche, nouveau ticket), 3) combiner si c’est possible sans tout refaire. Il répondra. Si le ticket concerné n’a pas commencé, replanifie-le et dis-le en une ligne. Rien n’est jamais effacé ; un vrai changement de direction devient aussi un ticket « Décision : … ».',
  'Si tu as agi, termine par une ligne « Fait : … » qui liste tes actions. Si on ne t’a rien demandé de faire, n’ajoute aucune ligne de fin. Si on t’a demandé une action et que tu ne l’as pas faite, dis pourquoi en une phrase.',
].join('\n');

// Lecture seule sur le projet (main, toujours à jour) + la commande lba. Aucune écriture de fichier.
const ALLOWED = ['Read', 'Glob', 'Grep', 'Bash(node scripts/lba.mjs *)', 'Bash(git status)', 'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)'];
const DENIED = ['Edit', 'Write', 'NotebookEdit', 'Read(**/.env*)', 'Read(**/*.pem)', 'Read(~/.claude/**)', 'Glob(~/.claude/**)', 'Grep(~/.claude/**)',
  'Read(**/graphify-out/**)', 'Grep(**/graphify-out/**)', 'Glob(**/graphify-out/**)',
  'Read(**/.lba/comptes/**)', 'Grep(**/.lba/comptes/**)', 'Glob(**/.lba/comptes/**)', 'Read(**/.credentials.json)',
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

// Carnet, écrit par le programme (0 token) : sa mémoire quand il repart à neuf.
// La discussion en cours (8 derniers échanges en entier, décision 0018) + vos consignes plus anciennes + ses
// 12 dernières actions + le titre de chaque décision : il sait où vous en étiez et voit une contradiction.
export function notebook(engine: Engine, project: string, repo?: string): string {
  // Les commandes (/usage, /context…) sont faites par le programme : ni consignes ni réponses à retenir.
  // /btw non plus : une question en passant ne doit pas entrer dans sa mémoire (comme dans Claude Code).
  const fil = engine.architectThread(project, 160).filter((m) => !m.commande && !m.btw);
  const when = (at: string) => at.slice(5, 16).replace('T', ' ');
  const talk = fil.filter((m) => m.who === 'vous' || m.who === 'architecte');
  const recent = talk.slice(-8);
  const older = new Set(recent.map((m) => m.id));
  const asks = talk.filter((m) => m.who === 'vous' && !older.has(m.id)).slice(-6);
  const acts = fil.filter((m) => m.who === 'action').slice(-12);
  let decisions: string[] = [];
  if (repo) try {
    decisions = readdirSync(join(repo, 'docs', 'decisions')).filter((f) => /^\d{4}-.*\.md$/.test(f)).sort()
      .map((f) => readFileSync(join(repo, 'docs', 'decisions', f), 'utf8').split('\n')[0].replace(/^#\s*/, '').slice(0, 110));
  } catch { /* pas de dossier de décisions */ }
  return [
    asks.length ? ['Consignes plus anciennes du propriétaire :', ...asks.map((a) => `- ${when(a.at)} ${String(a.text).slice(0, 200)}`)].join('\n') : '',
    // La discussion en cours : si le propriétaire répond « oui » ou continue une idée, il sait à quoi.
    recent.length ? ['Discussion en cours (derniers échanges, du plus ancien au plus récent) :',
      ...recent.map((m) => `[${when(m.at)}] ${m.who === 'vous' ? 'Propriétaire' : 'Toi'} : ${String(m.text).slice(0, m.who === 'vous' ? 600 : 1200)}`)].join('\n') : '',
    acts.length ? ['Tes dernières actions :', ...acts.map((a) => `- ${when(a.at)} ${a.text}`)].join('\n') : '',
    decisions.length ? ['Décisions prises (titres ; lis un fichier seulement si la demande le touche) :', ...decisions.map((d) => `- ${d}`)].join('\n') : '',
  ].filter(Boolean).join('\n\n');
}

// Reprise de la conversation (décision 0018, mesuré le 19 nov.) : le cache de Claude dure 1 HEURE (ephemeral_1h,
// reprise après 24 min = 3 326 tokens relus pour 515 réécrits), pas 5 minutes comme le disait la décision 0011.
// - Moins de 55 min de pause : il reprend (lecture du cache, environ 10 % du prix).
// - Plus d'une heure mais petite conversation (moins de 30 k) : il reprend quand même ; tout réécrire coûte à peu
//   près autant que repartir avec le carnet, et il garde toute la discussion.
// - Grosse conversation après une heure, ou plus de 60 k : il repart avec le carnet (le « compact » de LBA :
//   Claude Code ne compacte qu'à partir de 100 k, selon la taille, jamais selon le temps).
const MAX_RESUME_CONTEXT = 60_000;
const SMALL_CONTEXT = 30_000;
export const CACHE_HOUR_MS = 55 * 60_000;

export function resumePlan(engine: Engine, project: string, cwd: string): { prev?: string; size: number; warm: boolean; resume: boolean; otherAccount: boolean; compte: ReturnType<typeof pickCompte>; why: string } {
  const prev = engine.sessionOf(`${ARCHITECT_ID}-${project}`) || undefined;
  const compte = pickCompte(engine, project, 'architecte');
  const dir = prev ? sessionDir(cwd, prev) : undefined;
  const otherAccount = Boolean(dir && dir.toLowerCase() !== configDir(compte).toLowerCase());
  const size = prev ? contextOf(cwd, prev).end : 0;
  const warm = prev ? cacheWarm(cwd, prev, Date.now(), CACHE_HOUR_MS) : false;
  const resume = Boolean(prev && dir && !otherAccount && size < MAX_RESUME_CONTEXT && (warm || size < SMALL_CONTEXT));
  const k = (n: number) => `${Math.round(n / 1000)} k`;
  const why = !prev ? 'aucune conversation en cours'
    : !dir ? 'conversation introuvable sur ce PC'
    : otherAccount ? `autre compte : « ${compte.name} »`
    : size >= MAX_RESUME_CONTEXT ? `conversation trop longue (${k(size)})`
    : resume ? (warm ? `pause de moins d’une heure, cache encore valable (${k(size)})` : `pause de plus d’une heure, mais conversation courte (${k(size)}) : il la garde`)
    : `pause de plus d’une heure et conversation de ${k(size)} : il repart avec son carnet et les derniers échanges`;
  return { prev, size, warm, resume, otherAccount, compte, why };
}

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
  const p = resumePlan(engine, project, repo);
  return {
    rules: est(RULES), digest: est(projectDigest(engine, project)), notebook: est(notebook(engine, project, repo)),
    session: p.prev, size: p.size, warm: p.warm, resume: p.resume, maxResume: MAX_RESUME_CONTEXT, why: p.why,
  };
}
// /compact : oublier la conversation ; la prochaine demande repart avec le carnet (écrit par le programme, 0 token).
export function forgetArchitectSession(engine: Engine, project: string): void { engine.setSession(`${ARCHITECT_ID}-${project}`, ''); }

const short = (s: unknown, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const running = new Map<string, ChildProcess>();
export const architectRunning = (project: string) => running.has(project);

export function askArchitectAgent(engine: Engine, project: string, repo: string, text: string, pieces: Piece[] = []): string {
  if (!text.trim() && !pieces.length) throw new Refused('Écrivez votre demande à l’Architecte.');
  if (running.has(project)) throw new Refused('L’Architecte travaille déjà sur votre demande précédente : attendez sa réponse. Une question en passant reste possible avec /btw.');
  const model = pickArchitectModel(text, engine.architectModel(project));
  const ask = text.replace(/^\/(opus|sonnet|haiku)\s*/i, '').trim() || 'Regarde les pièces jointes et dis-moi ce que tu en penses pour le projet.';
  const cwd = repo; // lecture seule : il voit main tel qu'il est maintenant
  const key = `${ARCHITECT_ID}-${project}`;
  // Compte (décision 0017) et reprise (décision 0018) : il garde la discussion tant que c'est raisonnable.
  const plan = resumePlan(engine, project, cwd);
  const compte = plan.compte;
  const resume = plan.resume ? plan.prev : undefined;
  // Réflexion légère pour une question courte sur Sonnet : réponse plus rapide (décision 0018).
  const effort = model === 'Opus' ? 'high' : model === 'Haiku' || ask.length < 300 ? 'low' : 'medium';

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', MODEL[model],
    '--permission-mode', 'acceptEdits', '--permission-prompts', 'none',
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(','),
    '--max-budget-usd', model === 'Opus' ? '6' : model === 'Haiku' ? '1' : '2',
    '--strict-mcp-config', '--disable-slash-commands', '--tools', 'Read,Glob,Grep,Bash',
    '--effort', effort,
    '--append-system-prompt', RULES];
  if (resume) args.push('--resume', resume);
  // Pièces jointes (lot C2) : il les lit lui-même avec Read, dans leur dossier rangé (accès ajouté pour cette demande).
  if (pieces.length) args.push('--add-dir', piecesDir(project));
  const joined = pieces.length ? ['Pièces jointes par le propriétaire (lis-les avec Read ; images et PDF se lisent directement) :',
    ...pieces.map((p) => `- ${join(piecesDir(project), p.file)} (${p.kind}, ${p.detail})`)].join('\n') : '';
  // Carnet lu AVANT d'écrire la nouvelle demande dans le fil (sinon elle s'y trouverait deux fois).
  const prompt = [resume ? '' : notebook(engine, project, repo), projectDigest(engine, project), '', `Demande du propriétaire : ${ask}`, joined].filter((x) => x !== '').join('\n\n');

  engine.architectSay(project, 'vous', text.replace(/^\/(opus|sonnet|haiku)\s*/i, '').trim(), { model, ...(pieces.length ? { pieces } : {}) });
  engine.architectSay(project, 'systeme', (resume
    ? `Reprend la discussion sur ${model} : ${plan.why}`
    : `Nouvelle conversation sur ${model}, avec son carnet, les derniers échanges et l’état du projet (${plan.why})`) + `, compte « ${compte.name} ».`);
  const child = spawn('claude', args, { cwd, windowsHide: true, env: { ...process.env, ...envOf(compte), CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
  running.set(project, child);
  child.stdin.end(prompt);

  const tools = new Map<string, string>();
  let buf = ''; let err = ''; let done = false;
  const started = Date.now(); // durée affichée sous chaque réponse
  const onMsg = (m: Record<string, any>) => {
    if (m.type === 'system' && m.subtype === 'init' && m.session_id) engine.setSession(key, String(m.session_id));
    else if (m.type === 'rate_limit_event') recordQuota(engine, compte.id, m.rate_limit_info);
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
        model, compte: compte.name, tokens: used, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: m.num_turns ?? 0, ok: m.subtype === 'success' && !m.is_error,
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


// /btw (lot C1) : une question en passant, comme dans Claude Code. Pas d'outils, pas de conversation gardée,
// rien dans son carnet. Il voit seulement l'état du projet (préparé par le programme) et vos derniers échanges.
// Possible même pendant que l'Architecte travaille. Mesuré le 19 nov. : 2 488 tokens, 0,011 $, 3 s (au lieu de 7 à 60 k pour une vraie demande).
const BTW = [
  'Tu réponds à une question en passant du propriétaire de « Le Bon Architecte », en français simple, sans jargon.',
  'Tu n’as aucun outil et tu n’agis pas : réponds seulement avec l’état du projet et les derniers échanges fournis, en 2 à 6 phrases.',
  'Si la réponse demande de lire le code ou d’agir, dis-le en une phrase et propose de poser la question à l’Architecte (sans /btw). N’invente rien.',
  'Jamais le modèle Fable.',
].join('\n');
const btwRunning = new Set<string>();
export const btwBusy = (project: string) => btwRunning.has(project);

export function askBtw(engine: Engine, project: string, question: string): string {
  const q = question.trim();
  if (!q) throw new Refused('Écrivez votre question après /btw, par exemple : /btw combien de tickets restent ?');
  if (btwRunning.has(project)) throw new Refused('Une question /btw est déjà en cours : attendez sa réponse.');
  const compte = pickCompte(engine, project, 'architecte');
  const recent = engine.architectThread(project, 40).filter((m) => (m.who === 'vous' || m.who === 'architecte') && !m.commande)
    .slice(-6).map((m) => `${m.who === 'vous' ? 'Propriétaire' : 'Architecte'} : ${String(m.text).slice(0, 700)}`);
  const prompt = [projectDigest(engine, project), recent.length ? `Derniers échanges :\n${recent.join('\n')}` : '', `Question en passant : ${q}`].filter(Boolean).join('\n\n');
  engine.architectSay(project, 'vous', `/btw ${q}`, { btw: true });
  const args = ['-p', '--model', 'sonnet', '--output-format', 'stream-json', '--verbose', '--system-prompt', BTW, '--tools', '',
    '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence', '--effort', 'low', '--max-budget-usd', '0.5'];
  const child = spawn('claude', args, { cwd: process.cwd(), windowsHide: true, env: { ...process.env, ...envOf(compte), CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
  btwRunning.add(project);
  child.stdin.end(prompt);
  const started = Date.now();
  let buf = ''; let err = ''; let done = false;
  child.stdout.on('data', (d) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      let m: Record<string, any>;
      try { m = JSON.parse(line); } catch { continue; }
      if (m.type === 'rate_limit_event') recordQuota(engine, compte.id, m.rate_limit_info);
      if (m.type !== 'result') continue;
      done = true;
      const u = m.usage ?? {};
      const used = (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      engine.architectTokens(project, { used, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, turns: 1, model: 'Sonnet' });
      engine.architectSay(project, 'architecte', String(m.result ?? (m.is_error ? 'Erreur sans message.' : '')).slice(0, 4000), {
        btw: true, model: 'Sonnet', compte: compte.name, tokens: used, cacheRead: u.cache_read_input_tokens ?? 0, costUsd: m.total_cost_usd ?? 0, ms: Date.now() - started, ok: !m.is_error,
      });
    }
  });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += e.message; });
  child.on('close', (code) => {
    btwRunning.delete(project);
    if (!done) engine.architectSay(project, 'systeme', `La question /btw s’est arrêtée sans réponse (code ${code}) : ${short(err, 200) || 'sans message'}`, { ok: false, btw: true });
    engine.notify();
  });
  return 'Question en passant envoyée (Sonnet, sans outils).';
}
