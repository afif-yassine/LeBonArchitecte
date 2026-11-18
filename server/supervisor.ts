// Superviseur des vrais agents : il démarre Claude Code quand un ticket d'un vrai projet est lancé
// (par vous ou par le pilote), l'arrête quand vous l'arrêtez, puis fait vérifier les preuves par le programme.
// Un lancement = un passage d'agent, plus au plus une réparation automatique : jamais de boucle aveugle.

import type { ChildProcess } from 'node:child_process';
import type { Engine } from './engine.ts';
import type { ProjectProfile } from './scan.ts';
import { isResearch, runClaude, transcriptOf, type RunOutcome, type Why } from './claude.ts';
import { RESEARCH_DIRS } from '../src/shared/plan.ts';
import { runDirect } from './direct.ts';
import { canAutoRepair, pickMode } from './rules.ts';
import { runCommand } from './executor.ts';
import { assertMainReady, branchOf, changedFiles, commitWorktree, diffOf, ensureWorktree, mergeMainInto, mergeTicket, pendingFiles, removeWorktree, revertMerge, worktreeOf } from './git.ts';
import type { TicketActivity } from '../src/shared/contract.ts';
import { handoffText, writeHandoff } from './recovery.ts';
import { Refused } from './tickets.ts';

const SECRET = /(sk-ant-[\w-]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Preuve « fichier » vérifiée par le programme dans ce que le ticket a changé (jamais sur parole).
export function checkFiles(repo: string, wt: string, id: string, check: 'pdf' | 'svg' | 'liens' | 'md'): { ok: boolean; evidence: string } {
  const files = changedFiles(repo, id).map((f) => f.path);
  const docs = files.filter((p) => /\.(md|html)$/.test(p));
  const read = (p: string) => { try { const f = join(wt, p); return statSync(f).size < 2_000_000 ? readFileSync(f, 'utf8') : ''; } catch { return ''; } };
  if (check === 'pdf') { const p = files.filter((x) => x.endsWith('.pdf')); return p.length ? { ok: true, evidence: `PDF ajouté : ${p.join(', ')}` } : { ok: false, evidence: 'Aucun PDF dans les changements du ticket.' }; }
  if (check === 'md') return docs.length ? { ok: true, evidence: `Document écrit : ${docs.join(', ')}` } : { ok: false, evidence: 'Aucun document (.md ou .html) dans les changements du ticket.' };
  if (check === 'svg') { const p = docs.filter((x) => /<svg|```svg/.test(read(x))); return p.length ? { ok: true, evidence: `Schéma présent dans ${p.join(', ')}` } : { ok: false, evidence: 'Aucun schéma (SVG) dans les documents écrits.' }; }
  const links = new Set(docs.flatMap((x) => read(x).match(/https?:\/\/[^\s)"'<>\]]+/g) ?? []));
  return links.size ? { ok: true, evidence: `${links.size} liens de sources différents dans ${docs.join(', ')}` } : { ok: false, evidence: 'Aucun lien de source dans les documents écrits.' };
}

// Une session encore écrite il y a moins de 90 s : son agent tourne peut-être encore, on ne la double pas.
function recentlyActive(cwd: string, session: string): boolean {
  try { return Date.now() - statSync(transcriptOf(cwd, session)).mtimeMs < 90_000; } catch { return false; }
}

// Le cache de Claude expire après ~5 minutes sans échange. Au-delà, reprendre une session réécrit toute la
// conversation au plein tarif (mesuré sur LBA-15 : 83 k pour régler 2 conflits). Pour une petite correction,
// un nouvel agent avec la passation coûte bien moins (~15 k).
const CACHE_MS = 5 * 60_000;
export function cacheWarm(cwd: string, session: string, now = Date.now()): boolean {
  try { return now - statSync(transcriptOf(cwd, session)).mtimeMs < CACHE_MS; } catch { return false; }
}

export function startSupervisor(engine: Engine, dirs: Record<string, string>, profileOf: (p: string) => ProjectProfile, runAgent: typeof runClaude = runClaude) {
  const runs = new Map<string, ChildProcess>();
  const handled = new Set<number>();
  const startEvent = (id: string) => engine.lastStart(id);

  // Passation : ce que le programme constate (preuves, fichiers, derniers messages), gardée dans .lba/passations.
  function handoffOf(id: string): string {
    const t = engine.ticket(id);
    const repo = dirs[t.projectId];
    const text = handoffText(t, {
      committed: changedFiles(repo, id).map((f) => f.path),
      pending: pendingFiles(worktreeOf(repo, id)),
      notes: engine.liveFeed(id).filter((i) => i.kind === 'message' && i.who !== 'vous' && i.who !== 'programme').slice(-3).map((i) => i.text),
      complaint: engine.openComplaint(id),
    });
    try { writeHandoff(repo, id, text); } catch (err) { engine.live(id, { kind: 'systeme', ok: false, text: `Passation non enregistrée sur le disque : ${(err as Error).message}` }, 'programme'); }
    return text;
  }

  // Au démarrage, aucun agent ne tourne encore : un ticket resté « en cours » a perdu le sien (PC éteint,
  // panne, moteur relancé). Il passe en « Besoin d'action » et attend « Reprendre » ; rien ne repart seul.
  // Exceptions : les projets d'exemple, et le travail manuel (fait hors agent, il n'en a jamais eu).
  for (const t of engine.tickets()) {
    const e = startEvent(t.id);
    if (e?.id) handled.add(e.id);
    if (t.status !== 'en-cours' || !dirs[t.projectId] || e?.data.manual) continue;
    try {
      engine.interrupt(t.id, 'Travail interrompu par un redémarrage ou une panne.');
      handoffOf(t.id);
    } catch (err) { console.error(`Reprise de ${t.id} : ${(err as Error).message}`); }
  }

  let scheduled = false;
  engine.onChange(() => { if (!scheduled) { scheduled = true; setImmediate(() => { scheduled = false; tick(); }); } });

  function tick() {
    for (const [id, child] of runs) {
      if (engine.ticket(id).status !== 'en-cours') {
        child.kill('SIGINT');
        runs.delete(id);
        engine.live(id, { kind: 'systeme', text: 'Agent arrêté : son travail reste dans la branche du ticket.' }, 'programme');
      }
    }
    for (const t of engine.tickets()) {
      if (!dirs[t.projectId] || t.status !== 'en-cours' || runs.has(t.id)) continue;
      const e = startEvent(t.id);
      if (!e?.id || handled.has(e.id) || e.data.manual) continue;
      handled.add(e.id);
      if (e.type === 'ticket-repris') { resumeRun(t.id); continue; }
      if (e.type === 'reclamation') {
        // « Pas bon » ou demande de modification : le même agent reprend SA conversation (il sait ce qu'il a fait).
        const s = engine.sessionOf(t.id);
        const same = s && pickMode(t) === 'agent' && existsSync(worktreeOf(dirs[t.projectId], t.id));
        if (same && e.data.small && !cacheWarm(worktreeOf(dirs[t.projectId], t.id), s)) { freshFix(t.id, String(e.data.problem ?? '')); continue; }
        if (same) engine.live(t.id, { kind: 'systeme', text: 'L’agent qui a fait le travail reprend sa conversation avec votre demande.' }, 'programme');
        start(t.id, String(e.data.problem ?? ''), same ? s : undefined, same ? 'message' : 'redemarrage');
        continue;
      }
      if (e.type === 'reparation') {
        const s = engine.sessionOf(t.id);
        if (s && !cacheWarm(worktreeOf(dirs[t.projectId], t.id), s)) { freshFix(t.id, String(e.data.cause ?? '')); continue; }
        engine.live(t.id, { kind: 'systeme', text: 'Réparation automatique : l’agent reprend sa session, une seule fois.', detail: String(e.data.cause ?? '') }, 'programme');
        start(t.id, String(e.data.cause ?? ''), s, 'reparation');
        continue;
      }
      // Relancé après un arrêt (limite d'abonnement, arrêt par vous, « Pas fini ») : il reprend sa
      // propre session au lieu de tout relire et refaire. Sans session ni dossier : départ normal.
      const session = engine.sessionOf(t.id);
      const again = session && pickMode(t) === 'agent' && existsSync(worktreeOf(dirs[t.projectId], t.id));
      if (again) engine.live(t.id, { kind: 'systeme', text: 'Reprise de sa session Claude : l’agent continue où il en était.' }, 'programme');
      start(t.id, undefined, again ? session : undefined, 'reprise');
    }
  }

  // « Reprendre » : même session Claude si son journal existe encore, sinon un nouvel agent.
  // Dans les deux cas il reçoit la passation et ne refait pas ce qui est prouvé.
  function resumeRun(id: string) {
    const t = engine.ticket(id);
    const session = engine.sessionOf(id);
    const same = session && pickMode(t) === 'agent' && existsSync(transcriptOf(worktreeOf(dirs[t.projectId], id), session)) ? session : undefined;
    const handoff = handoffOf(id);
    engine.live(id, { kind: 'systeme', text: same ? 'Reprise de sa session Claude, avec la passation.' : 'Session introuvable : un nouvel agent repart de la passation.', detail: `.lba/passations/${id}.md` }, 'programme');
    start(id, engine.openComplaint(id), same, 'redemarrage', handoff);
  }

  // Petite correction après une longue pause : nouvel agent, consigne courte + passation (pas toute la conversation).
  function freshFix(id: string, problem: string) {
    engine.live(id, { kind: 'systeme', text: 'Petite correction après une pause : un nouvel agent part de la passation, sans recharger toute la conversation.', detail: 'Économie : environ 15 k au lieu de 80 k' }, 'programme');
    start(id, problem, undefined, 'correction', handoffOf(id));
  }

  function resume(id: string): string {
    const t = engine.ticket(id);
    const session = engine.sessionOf(id);
    // Seulement après une panne : un ticket mis en pause par vous a déjà vu son agent arrêté par le moteur.
    if (t.status === 'action' && t.interrupted && dirs[t.projectId] && session && recentlyActive(worktreeOf(dirs[t.projectId], id), session)) {
      throw new Refused(`L’ancien agent de ${id} écrivait il y a moins de 90 secondes : il tourne peut-être encore. Réessayez dans deux minutes pour ne pas le doubler.`);
    }
    return engine.resume(id);
  }

  // Limite d'abonnement : réveil du pilote à l'heure de retour (aussi après un redémarrage du moteur).
  let wake: NodeJS.Timeout | undefined;
  function wakeAt(until: string) {
    clearTimeout(wake);
    wake = setTimeout(() => {
      for (const p of Object.keys(dirs)) engine.kickPilot(p);
    }, Math.max(1000, new Date(until).getTime() - Date.now()));
  }
  const held = engine.quotaUntil();
  if (held) wakeAt(held);

  // Messages que vous avez écrits à l'agent et qu'il n'a pas encore reçus.
  const DELIVERED = 'Messages transmis à l’agent';
  const pendingMessages = (id: string) => {
    const mark = engine.events({ ticket: id, limit: 300 }).find((e) => e.type === 'direct' && String(e.data.text ?? '').startsWith(DELIVERED))?.id ?? 0;
    return engine.messagesSince(id, mark);
  };

  function start(id: string, complaint?: string, session?: string, why: Why = 'redemarrage', handoff?: string) {
    const t = engine.ticket(id);
    // Messages écrits avant le lancement : ils partent avec la consigne.
    const inbox = pendingMessages(id);
    if (inbox.length) {
      complaint = [complaint, ...inbox].filter(Boolean).join(' ; ');
      if (session && why !== 'reparation') why = 'message';
      engine.live(id, { kind: 'systeme', text: `${DELIVERED} : ${inbox.length}` }, 'programme');
    }
    let wt: string;
    try { wt = ensureWorktree(dirs[t.projectId], id); } catch (err) {
      // Pas d'espace de travail, donc pas d'agent : le ticket ne reste pas « en cours ».
      engine.interrupt(id, (err as Error).message);
      return;
    }
    engine.live(id, { kind: 'etape', text: `Espace de travail prêt : .lba/worktrees/${id}`, detail: `Branche ${branchOf(id)} ; main n’est pas touché avant les tests verts` }, 'programme');
    const onEnd = (o: RunOutcome) => {
      runs.delete(id);
      if (engine.ticket(id).status !== 'en-cours') return;
      if (o.quotaUntil) {
        // Pas un échec : le travail fait est gardé dans la branche, le ticket attend en tête de file.
        commitWorktree(wt, `${id} : travail en cours (limite de l’abonnement)`);
        engine.quotaPause(id, o.quotaUntil, o.summary ?? '');
        wakeAt(o.quotaUntil);
        return;
      }
      // Vous avez écrit pendant son tour : il reprend sa conversation avec vos messages avant d'être vérifié.
      const session = engine.sessionOf(id);
      if (o.ok && session && pickMode(engine.ticket(id)) === 'agent' && pendingMessages(id).length) {
        start(id, undefined, session, 'message');
        return;
      }
      // Audit LBA-11, point 5 : si la fin plante, le ticket ne reste pas « en cours » pour toujours :
      // il passe en « Besoin d'action » avec la raison, et libère sa place.
      finish(id, wt, o).catch((err) => {
        engine.live(id, { kind: 'bug', ok: false, text: `Fin de l’agent mal terminée : ${(err as Error).message}` }, 'programme');
        try {
          if (engine.ticket(id).status === 'en-cours') {
            engine.agentDone(id, { criteriaOk: false, checks: { 'Critères tenus': 'echec', 'Tests verts': 'non-verifie', 'Périmètre respecté': 'non-verifie', 'Aucun secret': 'non-verifie', 'Aucune nouvelle faille': 'non-verifie', 'Documentation à jour': 'non-verifie' } });
          }
        } catch { /* déjà sorti d'« en cours » */ }
      });
    };
    // Tâche simple de texte : un seul appel sans outils ; sinon un agent complet.
    runs.set(id, pickMode(t) === 'direct'
      ? runDirect(engine, t, wt, profileOf(t.projectId), complaint, onEnd)
      : runAgent(engine, t, wt, complaint, onEnd, session, why, handoff));
  }

  async function finish(id: string, wt: string, o: RunOutcome) {
    const t = engine.ticket(id);
    const repo = dirs[t.projectId];
    const prof = profileOf(t.projectId);
    const hash = commitWorktree(wt, `${id} : ${t.title}`);
    engine.live(id, { kind: 'action', text: `Travail enregistré dans la branche ${branchOf(id)}`, detail: hash ? `commit ${hash}` : 'aucun changement' }, 'programme');

    // Le programme vérifie lui-même chaque preuve, dans l'espace du ticket.
    let testsOk: boolean | undefined;
    for (const s of engine.ticket(id).steps.filter((x) => x.state !== 'prouve')) {
      try {
        if (s.proof.kind === 'tests' && prof.commands.test) {
          await engine.proveStep(id, s.id, { command: prof.commands.test, cwd: wt }, 'programme');
          testsOk = engine.ticket(id).steps.find((x) => x.id === s.id)?.state === 'prouve';
        } else if (s.proof.kind === 'commande' && prof.commands.check) {
          await engine.proveStep(id, s.id, { command: prof.commands.check, cwd: wt }, 'programme');
        } else if (s.proof.kind === 'fichier' && s.proof.check) {
          const r = checkFiles(repo, wt, id, s.proof.check);
          if (r.ok) await engine.proveStep(id, s.id, { evidence: r.evidence }, 'programme');
          else engine.stepDone(id, s.id, { ok: false, evidence: r.evidence }, 'programme');
        } else if (s.proof.kind === 'relecture' && s.role !== 'securite' && o.read.length) {
          await engine.proveStep(id, s.id, { evidence: `Lu par l’agent : ${o.read.slice(0, 8).join(', ')}` }, 'programme');
        }
      } catch (err) { if (!(err instanceof Refused)) throw err; }
    }

    const files = changedFiles(repo, id);
    const leaked = SECRET.test(diffOf(repo, id));
    if (leaked) engine.live(id, { kind: 'bug', ok: false, text: 'Un secret semble écrit dans les changements : réunion bloquée.' }, 'programme');
    // Un ticket de recherche lit Internet : il n'a le droit d'écrire que dans ses dossiers.
    const outside = isResearch(t) ? files.filter((f) => !RESEARCH_DIRS.some((d) => f.path.startsWith(d))).map((f) => f.path) : [];
    if (outside.length) engine.live(id, { kind: 'bug', ok: false, text: `Recherche : fichiers modifiés hors de ${RESEARCH_DIRS.join(' et ')}. Réunion à refuser.`, detail: outside.join(', ') }, 'programme');
    engine.realized(id, {
      summary: o.summary || 'Voir le direct.', added: [], files,
      tests: testsOk ? `Tests verts, lancés par le programme (${prof.commands.test}).` : 'Tests pas encore verts : voir les étapes.',
      commits: hash ? [hash] : [], branch: branchOf(id),
    });
    // Tests du projet lancés pour tout ticket, même s'il n'a pas d'étape « tests » : un document ne doit rien casser.
    if (testsOk === undefined && prof.commands.test) {
      const r = await runCommand(prof.commands.test, { cwd: wt, ticket: id });
      testsOk = r.ok;
      engine.live(id, { kind: 'test', ok: r.ok, text: `${prof.commands.test} : ${r.ok ? 'vert' : 'en échec'}`, detail: r.summary.split('\n')[0] }, 'programme');
    }
    // Audit LBA-11, point 4 : ce qu'aucun outil ne contrôle est affiché « non vérifié », jamais « ok ».
    engine.live(id, { kind: 'systeme', text: 'Non vérifié par un outil : nouvelles failles, documentation à jour' + (isResearch(t) ? '' : ', périmètre') + '. À regarder à la recette.' }, 'programme');
    engine.agentDone(id, {
      criteriaOk: o.ok,
      checks: {
        'Critères tenus': o.ok ? 'ok' : 'echec', 'Tests verts': testsOk === true ? 'ok' : testsOk === false ? 'echec' : 'non-verifie',
        'Périmètre respecté': outside.length ? 'echec' : isResearch(t) ? 'ok' : 'non-verifie', 'Aucun secret': leaked ? 'echec' : 'ok', 'Aucune nouvelle faille': 'non-verifie', 'Documentation à jour': 'non-verifie',
      },
    }, { repair: canAutoRepair(engine.ticket(id), prof.commands, { agentOk: o.ok, hasSession: !!engine.sessionOf(id), leaked, outside: outside.length }) });
  }

  // Valider un ticket d'un vrai projet : tests relancés dans son espace, puis réunion dans main.
  // Une validation en cours (tests, réunion, tests dans main) ne doit jamais être coupée par un redémarrage.
  const validating = new Set<string>();
  async function validate(id: string): Promise<string> {
    if (validating.has(id)) throw new Refused(`${id} est déjà en train d’être validé : tests puis réunion, patientez.`);
    validating.add(id);
    try { return await validateNow(id); } finally { validating.delete(id); }
  }

  async function validateNow(id: string): Promise<string> {
    const t = engine.ticket(id);
    const repo = dirs[t.projectId];
    if (!repo || !existsSync(worktreeOf(repo, id))) return engine.validate(id);
    if (t.status !== 'a-tester') throw new Refused(`${id} n’est pas « à tester ».`);
    const test = profileOf(t.projectId).commands.test;
    // Chaque étape est affichée en haut de la fiche pendant qu'elle se fait ; l'erreur y reste écrite.
    const steps: TicketActivity['steps'] = [
      ...(test ? [{ label: 'Tests dans sa branche', state: 'attente' as const }] : []),
      { label: 'Réunion dans main', state: 'attente' },
      ...(test ? [{ label: 'Tests dans main', state: 'attente' as const }] : []),
    ];
    const show = (i: number, state: TicketActivity['steps'][number]['state'], detail?: string, error?: string, fixable?: boolean) => {
      steps[i] = { ...steps[i], state, ...(detail ? { detail } : {}) };
      engine.setActivity(id, { label: 'Validation', steps: [...steps], at: new Date().toISOString(), ...(error ? { error, fixable } : {}) });
    };
    // L'agent peut le résoudre : le ticket passe en « Besoin d'action », jamais bloqué.
    const fail = (i: number, detail: string, cause: string): never => {
      show(i, 'echec', detail, cause, true);
      engine.needsAction(id, cause);
      throw new Refused(cause);
    };

    // main pas prêt (pas sur main, fichiers non enregistrés) : c'est à vous de le régler, pas à l'agent.
    try { assertMainReady(repo); } catch (err) {
      engine.setActivity(id, { label: 'Validation', steps, at: new Date().toISOString(), error: (err as Error).message, fixable: false });
      throw err;
    }
    let i = 0;
    if (test) {
      show(i, 'en-cours');
      const r = await runCommand(test, { cwd: worktreeOf(repo, id), ticket: id });
      if (!r.ok) fail(i, r.summary.split('\n').slice(0, 2).join(' '), `Tests rouges dans la branche de ${id} : rien n’est réuni dans main. ${r.summary.split('\n')[0]}`);
      show(i++, 'ok', r.summary.split('\n')[0]);
    }
    show(i, 'en-cours');
    let m: { before: string; merge: string };
    try { m = mergeTicket(repo, id, t.title); } catch (err) {
      const msg = (err as Error).message;
      const files = [...msg.matchAll(/conflict in (\S+)/gi)].map((x) => x[1]);
      return fail(i, msg, files.length ? `Conflit avec main dans ${files.join(', ')} : un autre ticket a changé les mêmes lignes. Rien n’a changé dans main.` : `Réunion impossible : ${msg}`);
    }
    show(i++, 'ok', `commit ${m.merge}`);
    // Audit LBA-11, point 2 : les tests sont relancés dans main APRÈS la réunion.
    // Deux tickets verts chacun peuvent donner un main rouge : dans ce cas on annule la réunion.
    if (test) {
      show(i, 'en-cours');
      const after = await runCommand(test, { cwd: repo, ticket: id });
      if (!after.ok) {
        const rev = revertMerge(repo, m.merge);
        engine.live(id, { kind: 'bug', ok: false, text: 'Tests rouges dans main après la réunion : réunion annulée.', detail: `${after.summary.split('\n')[0]} ; annulée par le commit ${rev}, rien n’est effacé.` }, 'programme');
        fail(i, after.summary.split('\n').slice(0, 2).join(' '), `Tests rouges dans main après la réunion de ${id} : réunion annulée (commit ${rev}), rien n’est effacé. ${after.summary.split('\n')[0]}`);
      }
      show(i, 'ok', after.summary.split('\n')[0]);
    }
    const msg = engine.validate(id);
    engine.live(id, { kind: 'systeme', ok: true, text: `Réuni dans main (${m.merge})`, detail: `Point de retour : ${m.before}. Pour annuler : git revert -m 1 ${m.merge}` }, 'programme');
    removeWorktree(repo, id);
    return `${msg} Réuni dans main (${m.merge}), point de retour ${m.before}.`;
  }

  // « Demander à l'agent de résoudre » : pour tout ticket en « Besoin d'action ». Le programme met d'abord
  // la branche à jour avec main (conflits laissés marqués dans les fichiers), puis l'agent qui a fait le
  // travail reprend sa conversation avec la cause exacte, résout, et repasse les tests.
  function fix(id: string): string {
    const t = engine.ticket(id);
    if (t.status !== 'action') throw new Refused(`${id} n’est pas en « Besoin d’action » : rien à résoudre.`);
    const repo = dirs[t.projectId];
    const wt = repo ? worktreeOf(repo, id) : '';
    let conflicts: string[] = [];
    if (wt && existsSync(wt)) conflicts = mergeMainInto(wt).conflicts;
    const test = repo ? profileOf(t.projectId).commands.test : undefined;
    const problem = [
      `Problème à résoudre : ${t.needAction ?? 'voir le direct'}.`,
      conflicts.length ? `Ta branche a été mise à jour avec main. Conflits à résoudre dans : ${conflicts.join(', ')} (marqueurs <<<<<<<, =======, >>>>>>>). Garde les deux changements quand c’est possible, puis « git add » et « git commit ».` : '',
      test ? `Relance « ${test} » jusqu’à ce que tout soit vert.` : '',
    ].filter(Boolean).join(' ');
    engine.setActivity(id, null);
    engine.reject(id, problem, true);
    return `L’agent de ${id} reprend sa conversation pour résoudre : ${conflicts.length ? `${conflicts.length} conflit(s) à régler` : 'le problème indiqué'}.`;
  }

  return { validate, resume, fix, running: () => [...runs.keys()], validating: () => [...validating] };
}
