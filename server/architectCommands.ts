// Commandes du chat de l'Architecte (décision 0015, lot D), comme /usage ou /context dans Claude Code.
// Le programme répond seul, à partir du journal : 0 token, réponse immédiate. L'agent n'est pas appelé.
import { ARCHITECT_COMMANDS, parseCommand } from '../src/shared/commands.ts';
import type { Engine } from './engine.ts';
import { architectContext, forgetArchitectSession, projectDigest } from './architectAgent.ts';
import { askMap, mapStatus, refreshMap } from './carte.ts';

const k = (n: number) => `${(Math.round(n / 100) / 10).toLocaleString('fr-FR')} k`;
const usd = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} $`;

async function answer(engine: Engine, project: string, repo: string, name: string, arg: string): Promise<string> {
  switch (name) {
    case 'aide':
      return ['**Commandes**, faites par le programme : 0 token.', '',
        '| Commande | Ce qu’elle fait |', '|---|---|',
        ...ARCHITECT_COMMANDS.map((c) => `| \`/${c.name}${c.args ? ` ${c.args}` : ''}\` | ${c.what} |`), '',
        'Pour choisir le modèle d’une seule demande, commencez-la par `/opus` ou `/sonnet`.'].join('\n');

    case 'statut':
      return projectDigest(engine, project).replace(/^(.+?) :$/gm, '**$1**');

    case 'usage': {
      const p = engine.pilotState();
      const u = engine.usageToday(project);
      const tickets = u.tickets.reduce((n, t) => n + t.used, 0);
      return [`**Tokens d’aujourd’hui**, mesurés :`, '',
        '| | Tokens | Coût |', '|---|---|---|',
        `| Architecte (${u.architect.runs} réponse${u.architect.runs > 1 ? 's' : ''}) | ${k(u.architect.used)} | ${usd(u.architect.costUsd)} |`,
        ...u.tickets.slice(0, 6).map((t) => `| ${t.id} | ${k(t.used)} | ${usd(t.costUsd)} |`),
        ...(u.tickets.length > 6 ? [`| ${u.tickets.length - 6} autre${u.tickets.length > 7 ? 's' : ''} ticket${u.tickets.length > 7 ? 's' : ''} | ${k(u.tickets.slice(6).reduce((n, t) => n + t.used, 0))} | |`] : []),
        `| **Total du projet** | **${k(u.architect.used + tickets)}** | |`, '',
        `Budget du jour (tous projets) : ${k(p.spentToday)} sur ${k(p.dayBudget)}${p.budgetHit ? ' : **atteint**, aucun ticket ne part. Vous pouvez le monter dans Quotas.' : `, reste ${k(Math.max(0, p.dayBudget - p.spentToday))}.`}`,
        `Relus du cache par l’Architecte : ${k(u.architect.cacheRead)} (environ 10 fois moins chers, non comptés dans le budget).`].join('\n');
    }

    case 'cout': {
      const u = engine.usage(project);
      const id = arg.toUpperCase().match(/[A-Z]+-\d+/)?.[0];
      if (id) {
        const t = u.byTicket.find((x) => x.id === id);
        if (!t) return `Aucun token mesuré pour ${id}.`;
        return `**${id}** : ${t.title}\n\n${k(t.used)} tokens comptés, ${k(t.cacheRead)} relus du cache, ${usd(t.costUsd)}, ${t.runs} passage${t.runs > 1 ? 's' : ''} d’agent.`;
      }
      const days = u.byDay.slice(-7);
      return ['**Les 7 derniers jours** (tokens comptés, ce projet) :', '', '| Jour | Tokens |', '|---|---|',
        ...days.map((d) => `| ${d.day} | ${k(d.used)} |`), '',
        `Pour un ticket : \`/cout LBA-12\`. Le ticket le plus cher : ${u.byTicket[0] ? `${u.byTicket[0].id} (${k(u.byTicket[0].used)})` : 'aucun'}.`].join('\n');
    }

    case 'context': {
      const c = architectContext(engine, project, repo);
      const map = mapStatus(repo);
      return ['**Ce que l’Architecte emportera à la prochaine demande :**', '',
        '| Morceau | Taille | Coût |', '|---|---|---|',
        `| Ses règles fixes | environ ${k(c.rules)} | en cache : 10 fois moins cher |`,
        `| L’état du projet | environ ${k(c.digest)} | préparé par le programme |`,
        c.resume ? `| Sa conversation en cours | ${k(c.size)} mesurés | en cache |` : `| Son carnet | environ ${k(c.notebook)} | préparé par le programme |`,
        '| La base de Claude Code (outils) | environ 12 k, mesurés le 18 nov. | en cache après la 1re fois |', '',
        c.resume
          ? `**Prochaine demande : il reprend sa conversation** (${c.why}).`
          : `**Prochaine demande : il repart à neuf avec son carnet** (${c.why}${c.size ? `, elle faisait ${k(c.size)}` : ''}).`,
        `Au-delà de ${k(c.maxResume)} de conversation, il repart toujours à neuf : c’est moins cher.`,
        `Carte du code : ${map.exists ? `faite le ${new Date(map.at!).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}, il lui pose de petites questions` : map.installed ? 'pas encore faite (tapez /graphify)' : 'non installée'}.`,
        '', '_Les tailles « environ » sont estimées (1 token ≈ 4 caractères), la conversation est mesurée._'].join('\n');
    }

    case 'compact': {
      const c = architectContext(engine, project, repo);
      if (!c.session) return 'Rien à compacter : il n’a pas de conversation en cours. La prochaine demande part déjà avec son carnet.';
      forgetArchitectSession(engine, project);
      return `C’est fait. La prochaine demande repartira à neuf avec son carnet (environ ${k(c.notebook)}), au lieu de reprendre une conversation de ${k(c.size)}. Rien n’est perdu : vos consignes et ses actions restent dans le carnet et le journal. 0 token.`;
    }

    case 'modele': {
      const a = arg.toLowerCase();
      if (/fable/.test(a)) return 'Refusé : jamais le modèle Fable (votre règle).';
      if (/haiku/.test(a)) return 'Pas pour l’Architecte : Haiku est trop faible pour tenir le projet. Choisissez opus, sonnet ou auto.';
      const now = engine.architectModel(project);
      if (!a) return `Modèle actuel : **${now ?? 'automatique'}**${now ? '' : ' (Sonnet pour une consigne, Opus pour l’architecture, les décisions et l’équipe)'}. Pour changer : \`/modele opus\`, \`/modele sonnet\` ou \`/modele auto\`.`;
      if (/^auto/.test(a)) { engine.setArchitectModel(project, undefined); return 'Modèle **automatique** : Sonnet pour une consigne, Opus pour l’architecture, les décisions et l’équipe.'; }
      const m = /^opus/.test(a) ? 'Opus' : /^sonnet/.test(a) ? 'Sonnet' : undefined;
      if (!m) return 'Je ne connais pas ce modèle. Choisissez `opus`, `sonnet` ou `auto`.';
      engine.setArchitectModel(project, m);
      return `Modèle fixé : **${m}** pour toutes les demandes suivantes${m === 'Opus' ? ' (environ 3 fois plus cher que Sonnet)' : ''}. \`/modele auto\` pour revenir au choix automatique.`;
    }

    case 'graphify': {
      if (arg) {
        const [a, b] = arg.split(/\s+(?:->|→|vers)\s+|\s+/).filter(Boolean);
        return ['```', await askMap(repo, a, b), '```'].join('\n');
      }
      const r = await refreshMap(repo);
      return r.ok ? `${r.text} L’Architecte lui posera de petites questions au lieu d’ouvrir les fichiers un par un (mesuré : environ 34 % moins cher).` : r.text;
    }

    default:
      return `Commande inconnue. Tapez \`/aide\` pour la liste.`;
  }
}

// Renvoie undefined si le texte n'est pas une commande : c'est alors une demande pour l'agent.
export async function runArchitectCommand(engine: Engine, project: string, repo: string, text: string): Promise<string | undefined> {
  const c = parseCommand(text);
  if (!c) return undefined;
  const started = Date.now();
  engine.architectSay(project, 'vous', text.trim(), { commande: true });
  let out: string;
  try { out = await answer(engine, project, repo, c.name, c.arg); } catch (err) { out = `La commande a échoué : ${(err as Error).message}`; }
  engine.architectSay(project, 'architecte', out, { commande: true, model: 'programme', tokens: 0, ms: Date.now() - started, ok: true });
  return c.name === 'inconnue' ? 'Commande inconnue : tapez /aide pour la liste.' : `/${c.name} fait par le programme, 0 token.`;
}
