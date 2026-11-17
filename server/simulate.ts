// Déroulé simulé, seulement sur les projets d'exemple, tant que les adaptateurs ne sont pas branchés (LBA-6, LBA-7).
// Il passe par les mêmes commandes du moteur qu'un vrai agent : étapes, preuves, direct, fin d'agent.
import type { Engine } from './engine.ts';
import type { Ticket, TicketStep } from '../src/shared/contract.ts';
import { projects, roles } from '../src/mock/data.ts';
import { evidenceFor } from '../src/shared/plan.ts';
import { Refused } from './tickets.ts';

const active = new Set<string>();
const roleName = (id?: string) => roles.find((r) => r.id === id)?.name ?? id ?? 'Agent';

function bugFor(t: Ticket): { text: string; cause: string } {
  const s = `${t.title} ${t.description.expected}`;
  if (/créneau|calendrier/i.test(s)) return { text: 'Un créneau de 23 h 30 déborde sur le lendemain', cause: 'le fuseau horaire du club était oublié dans le calcul' };
  if (/stripe|paiement/i.test(s)) return { text: 'Montant envoyé en euros au lieu de centimes', cause: 'conversion oubliée avant l’appel à Stripe' };
  if (/e-mail|email/i.test(s)) return { text: 'Le lien d’annulation est vide dans l’e-mail', cause: 'variable du modèle mal nommée' };
  return { text: 'Un cas limite renvoie une erreur', cause: 'valeur vide non prévue' };
}

function thought(s: TicketStep, file: string): string {
  if (s.role === 'securite') return 'Je cherche les secrets écrits en clair et les entrées non vérifiées, fichier par fichier.';
  switch (s.proof.kind) {
    case 'relecture': return `Je relis ${file} et les exigences avant de toucher au code, pour garder le même style et ne rien dupliquer.`;
    case 'tests': return 'Je teste d’abord les cas limites : c’est là que les bugs se cachent.';
    case 'capture': return 'Je vérifie l’écran en clair et en sombre, et sur petit écran.';
    default: return `Pour « ${s.label} », je réutilise ce qui existe déjà au lieu de le réécrire.`;
  }
}

export function simulateRun(engine: Engine, id: string, tickMs = 1100): string {
  const t = engine.ticket(id);
  if (!projects.find((p) => p.id === t.projectId)?.demo) {
    throw new Refused('Pas de simulation sur un vrai projet : l’adaptateur Claude (LBA-6) y fera travailler un vrai agent.');
  }
  if (t.status !== 'en-cours') throw new Refused(`${id} n’est pas en cours : lancez-le d’abord.`);
  if (active.has(id)) throw new Refused(`Le déroulé de ${id} est déjà en train de jouer.`);

  const who = t.agentId ?? `agent-${id.toLowerCase()}`;
  const file = t.files[0] ?? `src/${id.toLowerCase()}.ts`;
  const testFile = file.replace(/\.tsx?$/, '.test.ts');
  const bug = bugFor(t);
  const todo = t.steps.filter((s) => s.state !== 'prouve');
  const live = (kind: Parameters<Engine['live']>[1]['kind'], text: string, detail?: string, ok?: boolean, step?: string) =>
    () => engine.live(id, { kind, text, detail, ok, step }, who);

  const script: (() => void)[] = [live('agent', `${roleName(todo[0]?.role)} au travail sur ${t.model}`, `Contexte : ticket, plan, 4 notes de mémoire, règles du projet (≈ 3 k tokens)`)];
  let bugShown = false;
  for (const s of todo) {
    script.push(() => engine.stepStart(id, s.id, who));
    for (const sk of s.skills) script.push(live('skill', `Ouvre le skill « ${sk} »`, 'Fiche complète lue seulement maintenant (≈ 400 tokens)', undefined, s.id));
    if (s.helper) {
      script.push(live('agent', `Agent d’aide « ${roleName(s.helper)} » lancé`, s.helper === 'eclaireur' ? 'Cherche la documentation officielle, en lecture seule' : `Pour « ${s.label} »`, undefined, s.id));
      script.push(live('agent', `Agent d’aide « ${roleName(s.helper)} » a fini`, 'Résumé de 12 lignes rendu à l’agent principal', true, s.id));
    }
    script.push(live('reflexion', thought(s, file), undefined, undefined, s.id));
    if (s.proof.kind === 'relecture') script.push(live('action', `Lit ${file}`, '3 fichiers lus, aucun modifié', undefined, s.id));
    if (s.proof.kind === 'commande') {
      script.push(live('action', `Modifie ${file}`, '+38 −4', undefined, s.id));
      script.push(live('commande', 'npx tsc --noEmit', 'Sortie complète au journal ; l’agent reçoit : 0 erreur', true, s.id));
    }
    if (s.proof.kind === 'tests') {
      script.push(live('action', `Écrit ${testFile}`, '+64 −0', undefined, s.id));
      if (!bugShown) {
        bugShown = true;
        script.push(live('test', 'npm test : 2 échecs sur 14', 'Sortie complète au journal (212 lignes) ; l’agent reçoit les 2 échecs', false, s.id));
        script.push(live('bug', bug.text, 'Trouvé par les tests', false, s.id));
        script.push(live('reflexion', `La cause : ${bug.cause}. Je corrige à la source plutôt que de contourner.`, undefined, undefined, s.id));
        script.push(live('action', `Modifie ${file}`, '+6 −2', undefined, s.id));
        script.push(live('resolu', `Résolu : ${bug.text.toLowerCase()}`, `Cause : ${bug.cause}`, true, s.id));
      }
      script.push(live('test', 'npm test : 14 tests verts', 'Durée 1,8 s', true, s.id));
    }
    if (s.proof.kind === 'capture') script.push(live('action', 'Ouvre l’aperçu et prend une capture', 'Clair, sombre et petit écran', undefined, s.id));
    script.push(() => { engine.stepDone(id, s.id, { ok: true, evidence: evidenceFor(s.proof.kind) }, who); });
  }
  script.push(() => {
    engine.agentDone(id, { criteriaOk: true, checks: { 'Critères tenus': 'ok', 'Tests verts': 'ok', 'Périmètre respecté': 'ok', 'Aucun secret': 'ok', 'Aucune nouvelle faille': 'ok', 'Documentation à jour': 'ok' } });
  });

  active.add(id);
  let i = 0;
  const tick = () => {
    // Arrêté par vous entre deux actions : on s'arrête net, sans rien forcer.
    if (engine.ticket(id).status !== 'en-cours') { active.delete(id); return; }
    try { script[i++](); } catch (err) {
      active.delete(id);
      engine.live(id, { kind: 'systeme', ok: false, text: `Déroulé interrompu : ${(err as Error).message}` }, 'programme');
      return;
    }
    if (i < script.length) setTimeout(tick, tickMs); else active.delete(id);
  };
  setTimeout(tick, 200);
  return `Déroulé de ${id} lancé (démonstration) : ${todo.length} étapes à prouver, environ ${Math.round((script.length * tickMs) / 1000)} s.`;
}
