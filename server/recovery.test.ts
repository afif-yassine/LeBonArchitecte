// LBA-16 : reprise après redémarrage ou panne. Sans IA : l'agent est remplacé par un faux qui note ce qu'il reçoit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { backupDb, openDb } from './db.ts';
import { Engine } from './engine.ts';
import { Refused } from './tickets.ts';
import { startSupervisor } from './supervisor.ts';
import { contextOf, transcriptOf } from './claude.ts';
import { ensureWorktree, worktreeOf } from './git.ts';

const engine = () => { const e = new Engine(openDb(':memory:')); e.setPilot({ on: false, maxParallel: 5 }); return e; };
const ticket = (e: Engine, project = 'p', title = 'Correctif') => e.createTicket(project, { title, expected: 'x', criteria: ['y'] });
const profile = () => ({ commands: {} }) as never;

function gitRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'lba-reprise-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.lba/\n');
  git('add', '-A'); git('commit', '-q', '-m', 'init');
  return repo;
}

// Faux agent : aucun processus lancé, on garde seulement ce que le superviseur lui transmet.
function fakeAgent() {
  const calls: { id: string; session?: string; why?: string; handoff?: string }[] = [];
  const run = ((_e, t, _cwd, _complaint, _onEnd, session, why, handoff) => { calls.push({ id: t.id, session, why, handoff }); return { kill() {} }; }) as NonNullable<Parameters<typeof startSupervisor>[3]>;
  return { calls, run };
}

async function until(ok: () => boolean) {
  for (let i = 0; i < 50 && !ok(); i++) await new Promise((r) => setImmediate(r));
  assert.ok(ok(), 'condition jamais atteinte');
}

test('au redémarrage, aucun ticket ne reste « en cours » sans agent, et rien ne repart seul', () => {
  const e = engine();
  const repo = gitRepo();
  const cut = ticket(e); const manual = ticket(e); const demo = ticket(e, 'demo');
  e.launch(cut.id); e.launch(manual.id, { manual: true }); e.launch(demo.id);
  const first = e.ticket(cut.id).steps[0];
  e.stepDone(cut.id, first.id, { ok: true, evidence: 'lu' });
  // Un long direct ne doit pas faire oublier que le travail est manuel.
  for (let i = 0; i < 320; i++) e.live(manual.id, { kind: 'action', text: `action ${i}` });

  const { calls, run } = fakeAgent();
  startSupervisor(e, { p: repo }, profile, run);

  const t = e.ticket(cut.id);
  assert.equal(t.status, 'action');
  assert.equal(t.interrupted?.lastProved, first.label);
  assert.match(t.needAction ?? '', /Dernière étape prouvée/);
  assert.equal(e.ticket(manual.id).status, 'en-cours', 'le travail manuel n’a jamais eu d’agent');
  assert.equal(e.ticket(demo.id).status, 'en-cours', 'projet d’exemple : pas concerné');
  assert.equal(calls.length, 0, 'aucun agent relancé sans votre accord');
  assert.ok(existsSync(join(repo, '.lba', 'passations', `${cut.id}.md`)));
});

test('« Reprendre » garde les preuves et donne la passation à un nouvel agent si la session est perdue', async () => {
  const e = engine();
  const repo = gitRepo();
  const t = ticket(e);
  e.launch(t.id);
  const first = e.ticket(t.id).steps[0];
  e.stepDone(t.id, first.id, { ok: true, evidence: 'lu' });
  writeFileSync(join(ensureWorktree(repo, t.id), 'travail.txt'), 'commencé');
  e.live(t.id, { kind: 'message', text: 'Je finis le module.' }, 'claude-sonnet');

  const { calls, run } = fakeAgent();
  const sup = startSupervisor(e, { p: repo }, profile, run);
  assert.match(sup.resume(t.id), /passation/);
  await until(() => calls.length === 1);

  assert.equal(e.ticket(t.id).status, 'en-cours');
  assert.equal(e.ticket(t.id).interrupted, undefined);
  assert.equal(e.ticket(t.id).steps[0].state, 'prouve', 'la preuve n’est pas à refaire');
  assert.equal(calls[0].session, undefined);
  assert.match(calls[0].handoff ?? '', new RegExp(`Dernière étape prouvée : ${first.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(calls[0].handoff ?? '', /travail\.txt/);
  assert.match(calls[0].handoff ?? '', /Je finis le module/);
  assert.equal(readFileSync(join(repo, '.lba', 'passations', `${t.id}.md`), 'utf8').trim(), calls[0].handoff);
});

test('« Reprendre » réutilise la session Claude, mais jamais tant que l’ancien agent peut encore écrire', async () => {
  const home = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const fake = mkdtempSync(join(tmpdir(), 'lba-home-'));
  process.env.USERPROFILE = fake; process.env.HOME = fake;
  try {
    const e = engine();
    const repo = gitRepo();
    const t = ticket(e);
    e.launch(t.id);
    e.setSession(t.id, 'session-1');
    const log = transcriptOf(worktreeOf(repo, t.id), 'session-1');
    mkdirSync(dirname(log), { recursive: true });
    writeFileSync(log, '');

    const { calls, run } = fakeAgent();
    const sup = startSupervisor(e, { p: repo }, profile, run);
    assert.throws(() => sup.resume(t.id), /90 secondes/);
    assert.equal(e.ticket(t.id).status, 'action');

    const old = new Date(Date.now() - 600_000);
    utimesSync(log, old, old);
    sup.resume(t.id);
    await until(() => calls.length === 1);
    assert.equal(calls[0].session, 'session-1');
    assert.equal(calls[0].why, 'redemarrage');
    assert.ok(calls[0].handoff);
  } finally {
    process.env.USERPROFILE = home.USERPROFILE; process.env.HOME = home.HOME;
  }
});

test('sans espace de travail possible, le ticket ne reste pas « en cours »', async () => {
  const e = engine();
  const notRepo = mkdtempSync(join(tmpdir(), 'lba-vide-'));
  const { calls, run } = fakeAgent();
  startSupervisor(e, { p: notRepo }, profile, run);
  const t = ticket(e);
  e.launch(t.id);
  await until(() => e.ticket(t.id).status === 'action');
  assert.ok(e.ticket(t.id).interrupted);
  assert.match(e.ticket(t.id).needAction ?? '', /Impossible de créer l’espace de travail/);
  assert.equal(calls.length, 0);
});

test('« Reprendre » respecte les places libres et la limite d’abonnement', () => {
  const e = engine();
  e.setPilot({ maxParallel: 1 });
  const a = ticket(e); const b = ticket(e); const never = ticket(e);
  assert.throws(() => e.resume(never.id), Refused);
  e.launch(a.id);
  e.interrupt(a.id, 'Coupé.');
  assert.equal(e.ticket(a.id).status, 'action');
  e.launch(b.id);
  assert.throws(() => e.resume(a.id), /Plus de place/);
  e.quotaPause(b.id, new Date(Date.now() + 3600_000).toISOString(), 'limit');
  assert.throws(() => e.resume(a.id), /Limite de l’abonnement/);
  assert.ok(e.liveFeed(a.id).some((i) => /Coupé/.test(i.text)));
});

test('sauvegarde de l’état : copie lisible, au plus une par heure, 10 gardées', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lba-sauve-'));
  const db = openDb(join(dir, 'lba.db'));
  const e = new Engine(db);
  const t = ticket(e);
  const backups = join(dir, 'sauvegardes');
  const t0 = Date.parse('2026-11-18T08:00:00Z');

  const file = backupDb(db, backups, new Date(t0));
  assert.ok(file);
  const copy = openDb(file);
  assert.equal(new Engine(copy).ticket(t.id).title, t.title);
  copy.close(); // Windows refuse d'effacer un fichier encore ouvert
  assert.equal(backupDb(db, backups, new Date(t0 + 600_000)), undefined, 'pas deux sauvegardes dans la même heure');

  for (let h = 1; h <= 12; h++) assert.ok(backupDb(db, backups, new Date(t0 + h * 3_600_000)));
  const kept = readdirSync(backups).filter((f) => f.endsWith('.db'));
  assert.equal(kept.length, 10);
  assert.ok(!kept.includes('lba-2026-11-18T08-00-00.db'), 'les plus anciennes partent d’abord');
  assert.ok(!readdirSync(backups).some((f) => f.endsWith('.tmp')));
});

test('petite correction : session reprise si le cache est chaud, nouvel agent avec passation après une longue pause', async () => {
  const home = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const fake = mkdtempSync(join(tmpdir(), 'lba-home-'));
  process.env.USERPROFILE = fake; process.env.HOME = fake;
  try {
    const e = engine();
    const repo = gitRepo();
    const { calls, run } = fakeAgent();
    const sup2 = startSupervisor(e, { p: repo }, profile, run);
    const setup = (ageMs: number) => {
      const t = ticket(e);
      e.launch(t.id);
      e.setSession(t.id, `s-${t.id}`);
      ensureWorktree(repo, t.id);
      const log = transcriptOf(worktreeOf(repo, t.id), `s-${t.id}`);
      mkdirSync(dirname(log), { recursive: true });
      writeFileSync(log, '');
      const at = new Date(Date.now() - ageMs);
      utimesSync(log, at, at);
      e.needsAction(t.id, 'Conflit dans a.ts');
      return t.id;
    };
    const warm = setup(60_000);
    sup2.fix(warm);
    await until(() => calls.some((c) => c.id === warm));
    const w = calls.find((c) => c.id === warm)!;
    assert.equal(w.session, `s-${warm}`, 'cache encore chaud : on reprend la conversation');

    // Le cache dure 1 h (décision 0018) : 30 min reste « chaud », il faut plus d'une heure pour repartir à neuf.
    const half = setup(30 * 60_000);
    sup2.fix(half);
    await until(() => calls.some((c) => c.id === half));
    assert.equal(calls.find((c) => c.id === half)!.session, `s-${half}`, '30 min de pause : le cache d’une heure tient encore');

    const cold = setup(70 * 60_000);
    sup2.fix(cold);
    await until(() => calls.some((c) => c.id === cold));
    const c = calls.find((x) => x.id === cold)!;
    assert.equal(c.session, undefined, 'pause longue : pas de rechargement de toute la conversation');
    assert.equal(c.why, 'correction');
    assert.match(c.handoff ?? '', /Passation/);
  } finally {
    process.env.USERPROFILE = home.USERPROFILE; process.env.HOME = home.HOME;
  }
});

test('contexte : les rechargements après une pause de plus de 5 minutes sont comptés', () => {
  const home = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME };
  const fake = mkdtempSync(join(tmpdir(), 'lba-home-'));
  process.env.USERPROFILE = fake; process.env.HOME = fake;
  try {
    const cwd = mkdtempSync(join(tmpdir(), 'lba-ctx-'));
    const log = transcriptOf(cwd, 's');
    mkdirSync(dirname(log), { recursive: true });
    const msg = (id: string, at: string, write: number) => JSON.stringify({ type: 'assistant', timestamp: at, message: { id, content: [], usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: write, cache_read_input_tokens: 0 } } });
    writeFileSync(log, [
      msg('a', '2026-01-01T10:00:00Z', 10_000),
      msg('b', '2026-01-01T10:01:00Z', 2_000),
      msg('c', '2026-01-01T11:30:00Z', 80_000),
      msg('d', '2026-01-01T11:31:00Z', 1_000),
    ].join('\n'));
    const ctx = contextOf(cwd, 's');
    assert.equal(ctx.reloads, 1);
    assert.equal(ctx.reloadTokens, 80_000);
  } finally {
    process.env.USERPROFILE = home.USERPROFILE; process.env.HOME = home.HOME;
  }
});
