// Superviseur des vrais agents : il démarre Claude Code quand un ticket d'un vrai projet est lancé
// (par vous ou par le pilote), l'arrête quand vous l'arrêtez, puis fait vérifier les preuves par le programme.
// Un lancement = un seul passage d'agent : jamais de boucle aveugle.
import { existsSync } from 'node:fs';
import type { ChildProcess } from 'node:child_process';
import type { Engine } from './engine.ts';
import type { ProjectProfile } from './scan.ts';
import { isResearch, runClaude, type RunOutcome } from './claude.ts';
import { RESEARCH_DIRS } from '../src/shared/plan.ts';
import { runDirect } from './direct.ts';
import { pickMode } from './rules.ts';
import { runCommand } from './executor.ts';
import { branchOf, changedFiles, commitWorktree, diffOf, ensureWorktree, mergeTicket, removeWorktree, worktreeOf } from './git.ts';
import { Refused } from './tickets.ts';

const SECRET = /(sk-ant-[\w-]{10,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

export function startSupervisor(engine: Engine, dirs: Record<string, string>, profileOf: (p: string) => ProjectProfile) {
  const runs = new Map<string, ChildProcess>();
  const handled = new Set<number>();
  const startEvent = (id: string) => engine.events({ ticket: id, limit: 300 }).find((e) => e.type === 'ticket-lance' || e.type === 'reclamation');

  // Au démarrage du moteur, on ne relance pas les agents d'avant : il faut un nouveau lancement.
  for (const t of engine.tickets()) { const e = startEvent(t.id); if (e?.id) handled.add(e.id); }

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
      start(t.id, e.type === 'reclamation' ? String(e.data.problem ?? '') : undefined);
    }
  }

  function start(id: string, complaint?: string) {
    const t = engine.ticket(id);
    let wt: string;
    try { wt = ensureWorktree(dirs[t.projectId], id); } catch (err) {
      engine.live(id, { kind: 'systeme', ok: false, text: (err as Error).message }, 'programme');
      return;
    }
    engine.live(id, { kind: 'etape', text: `Espace de travail prêt : .lba/worktrees/${id}`, detail: `Branche ${branchOf(id)} ; main n’est pas touché avant les tests verts` }, 'programme');
    const onEnd = (o: RunOutcome) => {
      runs.delete(id);
      if (engine.ticket(id).status !== 'en-cours') return;
      finish(id, wt, o).catch((err) => engine.live(id, { kind: 'systeme', ok: false, text: `Fin de l’agent mal terminée : ${(err as Error).message}` }, 'programme'));
    };
    // Tâche simple de texte : un seul appel sans outils ; sinon un agent complet.
    runs.set(id, pickMode(t) === 'direct'
      ? runDirect(engine, t, wt, profileOf(t.projectId), complaint, onEnd)
      : runClaude(engine, t, wt, complaint, onEnd));
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
    engine.live(id, { kind: 'systeme', text: 'Contrôles sans outil pour l’instant : périmètre, failles, documentation. À regarder à la recette.' }, 'programme');
    engine.agentDone(id, {
      criteriaOk: o.ok,
      checks: {
        'Critères tenus': o.ok ? 'ok' : 'echec', 'Tests verts': testsOk === false ? 'echec' : 'ok',
        'Périmètre respecté': outside.length ? 'echec' : 'ok', 'Aucun secret': leaked ? 'echec' : 'ok', 'Aucune nouvelle faille': 'ok', 'Documentation à jour': 'ok',
      },
    });
  }

  // Valider un ticket d'un vrai projet : tests relancés dans son espace, puis réunion dans main.
  async function validate(id: string): Promise<string> {
    const t = engine.ticket(id);
    const repo = dirs[t.projectId];
    if (!repo || !existsSync(worktreeOf(repo, id))) return engine.validate(id);
    if (t.status !== 'a-tester') throw new Refused(`${id} n’est pas « à tester ».`);
    const test = profileOf(t.projectId).commands.test;
    if (test) {
      const r = await runCommand(test, { cwd: worktreeOf(repo, id), ticket: id });
      if (!r.ok) throw new Refused(`Tests rouges dans l’espace de ${id} : pas de réunion dans main. ${r.summary.split('\n')[0]}`);
    }
    const m = mergeTicket(repo, id, t.title);
    const msg = engine.validate(id);
    engine.live(id, { kind: 'systeme', ok: true, text: `Réuni dans main (${m.merge})`, detail: `Point de retour : ${m.before}. Pour annuler : git revert -m 1 ${m.merge}` }, 'programme');
    removeWorktree(repo, id);
    return `${msg} Réuni dans main (${m.merge}), point de retour ${m.before}.`;
  }

  return { validate, running: () => [...runs.keys()] };
}
