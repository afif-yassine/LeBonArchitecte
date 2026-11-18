// Rangement des tests par type et lecture de leur sortie (onglet Tests de la fiche).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTestOutput, testDetail, testKinds } from '../src/shared/tests.ts';
import { summarize } from './executor.ts';

test('une commande est rangée par type, même composée ; une recherche du mot « test » n’en est pas une', () => {
  assert.deepEqual(testKinds('npm test 2>&1 | tail -15'), ['unitaires']);
  assert.deepEqual(testKinds('npm run check 2>&1 | tail -5; npm test | tail -9; npm run build'), ['verification', 'unitaires']);
  assert.deepEqual(testKinds('npx playwright test'), ['bout-en-bout']);
  assert.deepEqual(testKinds('npm run test:e2e'), ['bout-en-bout']);
  assert.deepEqual(testKinds('grep -n "npm test" README.md'), []);
  assert.deepEqual(testKinds('ls server/*.test.ts'), []);
});

test('chiffres et noms des tests en échec, sans doublon', () => {
  const out = [
    '✔ le pilote lance le lot suivant (12ms)',
    '✖ la validation refuse un conflit (40.5ms)',
    'ℹ tests 3', 'ℹ pass 2', 'ℹ fail 1',
    '✖ failing tests:',
    '✖ la validation refuse un conflit (40.5ms)',
  ].join('\n');
  const c = readTestOutput(out);
  assert.equal(c.pass, 2);
  assert.equal(c.fail, 1);
  assert.deepEqual(c.failures, ['la validation refuse un conflit']);
  assert.equal(testDetail(c), 'Tests : 2 passés, 1 en échec.\n✖ la validation refuse un conflit');
  assert.match(summarize(out, false), /✖ la validation refuse un conflit/);
});

test('compte rendu : ticket léger par défaut, pas de compte rendu de lot tant que le lot n’est pas fini', async () => {
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  const { reportDocs, ticketReport } = await import('./reports.ts');
  const e = new Engine(openDb(':memory:'));
  const t = e.createTicket('p', { title: 'Petit correctif', expected: 'x', criteria: ['y'] });
  const r = ticketReport(e, e.ticket(t.id));
  assert.equal(r.problem, e.ticket(t.id).description.context);
  assert.equal(r.heavy.filter((h) => !/Opus/.test(h)).length, 0, 'aucune autre raison d’être lourd');
  assert.equal(reportDocs(e, 'p').length, 0, 'rien de fini : aucun compte rendu');
});

test('points que l’agent dit ne pas avoir vérifiés (cas LBA-17), sans fausse alerte', async () => {
  const { unverifiedClaims } = await import('../src/shared/claims.ts');
  const s = 'LBA-17 est terminé, mais deux choses n’ont pas pu être vérifiées. Je n’ai pas regardé les nouveaux écrans dans un navigateur, car je n’ai pas le droit de lancer le moteur ici. La réparation automatique n’a pas non plus été essayée avec un vrai agent : sa règle est testée. ## Ce qui a été fait Les 53 tests passent.';
  const c = unverifiedClaims(s);
  assert.equal(c.length, 3);
  assert.match(c[1], /navigateur/);
  assert.match(c[2], /réparation automatique/);
  assert.deepEqual(unverifiedClaims('Les tests passent. Je n’ai pas cassé les tests existants. Tout est vérifié dans le navigateur.'), []);
});

test('schémas des comptes rendus : frise et barres en SVG, rien si pas assez de données', async () => {
  const { timelineSvg, tokenBarsSvg } = await import('./reportCharts.ts');
  assert.equal(timelineSvg([{ at: '2026-11-18T10:00:00Z', label: 'Lancé', tone: 'accent' }]), '');
  const t = timelineSvg([{ at: '2026-11-18T10:00:00Z', label: 'Lancé', tone: 'accent' }, { at: '2026-11-18T11:00:00Z', label: 'Validé', tone: 'ok' }]);
  assert.match(t, /^<svg[\s\S]*Validé[\s\S]*<\/svg>$/);
  assert.match(tokenBarsSvg([{ id: 'LBA-1', tokens: 9000, testsOk: true, heavy: false }]), /LBA-1[\s\S]*9 k/);
});

test('Architecte : ses actions sont écrites à son nom, et les portes du propriétaire lui sont fermées', async () => {
  const { architectRefusal, actorStore, currentActor } = await import('./acteurs.ts');
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  for (const [m, u] of [['POST', '/api/tickets/LBA-1/validate'], ['PUT', '/api/pilot'], ['POST', '/api/projects/lba/git/revert'], ['POST', '/api/tickets/LBA-1/steps/s1/prove'], ['POST', '/api/projects/lba/architect/decide'], ['DELETE', '/api/tickets/LBA-1']]) {
    assert.ok(architectRefusal(m, u), `${m} ${u} doit rester au propriétaire`);
  }
  for (const [m, u] of [['POST', '/api/tickets/LBA-1/launch'], ['POST', '/api/projects/lba/tickets'], ['POST', '/api/tickets/LBA-1/priority'], ['GET', '/api/tickets']]) {
    assert.equal(architectRefusal(m, u), undefined, `${m} ${u} est permis à l’Architecte`);
  }
  const e = new Engine(openDb(':memory:'));
  e.actorOverride = currentActor;
  const mine = e.createTicket('p', { title: 'A', expected: 'x', criteria: ['y'] });
  const his = actorStore.run('architecte', () => e.createTicket('p', { title: 'B', expected: 'x', criteria: ['y'], model: 'Haiku' }));
  const actor = (id: string) => e.events({ ticket: id }).find((x) => x.type === 'ticket-cree')?.actor;
  assert.equal(actor(mine.id), 'vous');
  assert.equal(actor(his.id), 'architecte');
  assert.equal(e.ticket(his.id).model, 'Haiku');
});

test('Architecte autonome : modèle choisi par règle, état préparé sans token, fil et tokens comptés', async () => {
  const { pickArchitectModel, projectDigest } = await import('./architectAgent.ts');
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  assert.equal(pickArchitectModel('Crée un ticket pour corriger le titre de la page Git'), 'Sonnet');
  assert.equal(pickArchitectModel('Fais une revue de l’architecture et des risques'), 'Opus');
  assert.equal(pickArchitectModel('/opus range le kanban'), 'Opus');
  assert.equal(pickArchitectModel('Fais les agents dev, test et devops'), 'Opus');
  assert.equal(pickArchitectModel('Lance un agent sur LBA-13'), 'Sonnet');
  const e = new Engine(openDb(':memory:'));
  const a = e.createTicket('p', { title: 'Socle', expected: 'x', criteria: ['y'] });
  e.createTicket('p', { title: 'Suite', expected: 'x', criteria: ['y'], deps: [a.id] });
  const d = projectDigest(e, 'p');
  assert.match(d, /À faire \(2\)/);
  assert.ok(d.includes(`Suite (plan à valider) (attend ${a.id})`), d);
  e.architectSay('p', 'vous', 'Bonjour');
  e.architectTokens('p', { used: 5000, cacheRead: 9000, costUsd: 0.1, turns: 2, model: 'Sonnet' });
  assert.equal(e.architectThread('p').length, 1);
  assert.equal(e.spentToday(), 5000, 'les tokens de l’Architecte comptent dans le budget du jour');
});

test('carnet de l’Architecte : vos consignes passées, ses actions et le titre des décisions (pour voir une contradiction)', async () => {
  const { notebook } = await import('./architectAgent.ts');
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const repo = mkdtempSync(join(tmpdir(), 'lba-carnet-'));
  mkdirSync(join(repo, 'docs', 'decisions'), { recursive: true });
  writeFileSync(join(repo, 'docs', 'decisions', '0012-comptes-rendus.md'), '# Décision 0012 : comptes rendus selon le poids\n\nTexte long…');
  const e = new Engine(openDb(':memory:'));
  e.architectSay('p', 'vous', 'Les tickets légers sont regroupés par lot.');
  e.architectSay('p', 'action', 'lba creer --titre X');
  const n = notebook(e, 'p', repo);
  assert.match(n, /Consignes passées[\s\S]*regroupés par lot/);
  assert.match(n, /Tes dernières actions[\s\S]*lba creer/);
  assert.match(n, /Décisions prises[\s\S]*Décision 0012 : comptes rendus selon le poids/);
  assert.doesNotMatch(n, /Texte long/, 'seulement le titre, pas le texte');
});

test('commandes du chat de l’Architecte : reconnues, faites par le programme, jamais Fable (décision 0015)', async () => {
  const { parseCommand } = await import('../src/shared/commands.ts');
  const { pickArchitectModel } = await import('../src/shared/architect.ts');
  assert.deepEqual(parseCommand('/usage'), { name: 'usage', arg: '' });
  assert.deepEqual(parseCommand('/coût LBA-2'), { name: 'cout', arg: 'LBA-2' });
  assert.equal(parseCommand('/modèle opus')?.name, 'modele');
  assert.equal(parseCommand('/xyz')?.name, 'inconnue');
  assert.equal(parseCommand('/opus fais une revue'), undefined, '/opus reste un choix de modèle pour une demande');
  assert.equal(parseCommand('bonjour'), undefined);

  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  const { runArchitectCommand } = await import('./architectCommands.ts');
  const { notebook } = await import('./architectAgent.ts');
  const e = new Engine(openDb(':memory:'));
  const last = () => e.architectThread('p').slice(-1)[0];
  assert.equal(await runArchitectCommand(e, 'p', process.cwd(), 'quel ticket lancer ?'), undefined, 'une vraie demande va à l’agent');

  await runArchitectCommand(e, 'p', process.cwd(), '/modele fable');
  assert.match(String(last().text), /jamais le modèle Fable/);
  assert.equal(e.architectModel('p'), undefined);
  await runArchitectCommand(e, 'p', process.cwd(), '/modele opus');
  assert.equal(e.architectModel('p'), 'Opus');
  assert.equal(pickArchitectModel('mets LBA-3 en tête', e.architectModel('p')), 'Opus');
  assert.equal(pickArchitectModel('/sonnet mets LBA-3 en tête', e.architectModel('p')), 'Sonnet', 'le préfixe passe avant');
  await runArchitectCommand(e, 'p', process.cwd(), '/modele auto');
  assert.equal(e.architectModel('p'), undefined);

  e.setSession('architecte-p', 'session-inexistante');
  await runArchitectCommand(e, 'p', process.cwd(), '/compact');
  assert.equal(e.sessionOf('architecte-p'), '', '/compact oublie la conversation');
  assert.match(String(last().text), /repartira à neuf/);

  await runArchitectCommand(e, 'p', process.cwd(), '/usage');
  assert.match(String(last().text), /Architecte/);
  assert.equal(last().model, 'programme');
  assert.equal(last().tokens, 0);
  assert.equal(e.spentToday(), 0, 'les commandes ne coûtent aucun token');
  assert.doesNotMatch(notebook(e, 'p'), /\/usage|\/modele/, 'les commandes ne vont pas dans le carnet');
});
