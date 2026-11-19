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
  const { projectDigest } = await import('./architectAgent.ts');
  const { pickArchitectModel } = await import('../src/shared/architect.ts');
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
  for (let i = 1; i <= 9; i++) { e.architectSay('p', 'vous', `question ${i}`); e.architectSay('p', 'architecte', `réponse ${i}`); }
  const n = notebook(e, 'p', repo);
  assert.match(n, /Consignes plus anciennes[\s\S]*regroupés par lot/);
  assert.match(n, /Discussion en cours[\s\S]*Propriétaire : question 6[\s\S]*Toi : réponse 9/, 'les 8 derniers échanges en entier (décision 0018)');
  assert.doesNotMatch(n, /Toi : réponse 5/, 'pas plus de 8 messages');
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
  await runArchitectCommand(e, 'p', process.cwd(), '/modele haiku');
  assert.equal(e.architectModel('p'), 'Haiku', 'Haiku se choisit (lot C1), jamais tout seul');
  assert.equal(pickArchitectModel('/haiku mets LBA-3 en tête'), 'Haiku');
  assert.equal(parseCommand('/haiku fais ça'), undefined);
  assert.equal(parseCommand('/btw combien de tickets ?')?.arg, 'combien de tickets ?');
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

test('comptes, quotas et pièces jointes (décision 0017, lots C1 à C4)', async () => {
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  const { comptes, pickCompte, projection, quotaOf, recordQuota, updateCompte, removeCompte } = await import('./comptes.ts');
  const { imageTokens, estimate, savePiece } = await import('./pieces.ts');
  const { notebook } = await import('./architectAgent.ts');
  const e = new Engine(openDb(':memory:'));
  assert.deepEqual(comptes(e).map((c) => c.id), ['machine'], 'le compte de la machine existe toujours');
  assert.throws(() => removeCompte(e, 'machine'), /ne se retire pas/);
  assert.throws(() => updateCompte(e, 'machine', { on: false }), /au moins un compte actif/);

  // Quota lu dans le message officiel de Claude Code (forme mesurée le 19 nov.).
  const reset = Math.round(Date.now() / 1000) + 2 * 3600;
  assert.ok(recordQuota(e, 'machine', { status: 'allowed', unifiedWindows: { five_hour: { utilization: 0.95, resetsAt: reset }, seven_day: { utilization: 0.11, resetsAt: reset } } }));
  assert.equal(quotaOf(e, 'machine')?.five?.used, 0.95);
  assert.equal(recordQuota(e, 'machine', {}), false, 'sans fenêtres : rien d’écrit');
  // Deux comptes : au-delà de 90 % sur la 5 h, le suivant part ; un compte fixé passe avant.
  e.setSetting('comptes', JSON.stringify([...comptes(e), { id: 'perso', name: 'Perso', dir: 'x', on: true, projects: [] }]));
  assert.equal(pickCompte(e, 'p', 'agents').id, 'perso');
  e.setSetting('compte-agents:p', 'machine');
  assert.equal(pickCompte(e, 'p', 'agents').id, 'machine');
  updateCompte(e, 'perso', { projects: ['autre'] });
  e.setSetting('compte-agents:p', '');
  assert.equal(pickCompte(e, 'p', 'agents').id, 'machine', 'un compte réservé à un autre projet n’est pas pris');
  // Prévision : 50 % utilisés à mi-fenêtre → 100 % prévus à la remise à zéro.
  assert.equal(Math.round(projection({ used: 0.5, resetsAt: new Date(Date.now() + 2.5 * 3600_000).toISOString() }, 5)! * 100), 100);

  // Pièces : coût estimé par le programme. Image 400 × 300 → 160 tokens ; grande image plafonnée à 1 600.
  assert.equal(imageTokens(400, 300), 160);
  assert.equal(imageTokens(4000, 3000), 1600);
  const png = Buffer.alloc(24); png.writeUInt32BE(0x89504e47, 0); png.writeUInt32BE(800, 16); png.writeUInt32BE(600, 20);
  assert.deepEqual(estimate('a.png', png), { kind: 'image', tokens: 640, detail: '800 × 600 px' });
  assert.equal(estimate('n.md', Buffer.from('x'.repeat(400))).tokens, 100);
  assert.throws(() => savePiece('p', '.env', Buffer.from('A=1').toString('base64')), /secrets/);
  assert.throws(() => savePiece('p', 'virus.exe', Buffer.from('x').toString('base64')), /type non pris/);

  // /btw n'entre jamais dans le carnet de l'Architecte.
  e.architectSay('p', 'vous', '/btw une question en passant', { btw: true });
  e.architectSay('p', 'architecte', 'réponse en passant', { btw: true });
  assert.doesNotMatch(notebook(e, 'p'), /en passant/);
});

test('backlog : ajouter, ranger, modifier, devenir un ticket, retirer (lot B)', async () => {
  const { Engine } = await import('./engine.ts');
  const { openDb } = await import('./db.ts');
  const { projectDigest } = await import('./architectAgent.ts');
  const e = new Engine(openDb(':memory:'));
  assert.throws(() => e.addBacklog('p', { title: '  ' }), /titre/);
  const a = e.addBacklog('p', { title: 'Mode sombre', size: 'S' });
  const b = e.addBacklog('p', { title: 'Export PDF', detail: 'pour le client', size: 'X' });
  e.addBacklog('p', { title: 'Recherche' });
  assert.deepEqual([a.id, b.id], ['B-1', 'B-2']);
  assert.equal(b.size, undefined, 'taille inconnue ignorée');
  assert.equal(a.origin, 'vous');
  e.moveBacklog('p', 'B-3', 0);
  assert.deepEqual(e.backlog('p').items.map((x) => x.id), ['B-3', 'B-1', 'B-2']);
  e.updateBacklog('p', 'B-1', { title: 'Thème sombre', size: 'M' });
  assert.equal(e.backlog('p').items[1].title, 'Thème sombre');
  // Devenu un ticket : il quitte le backlog, le lien reste.
  e.backlogToTicket('p', 'B-2', 'P-1');
  assert.deepEqual(e.backlog('p').items.map((x) => x.id), ['B-3', 'B-1']);
  assert.deepEqual(e.backlog('p').done.map((x) => [x.id, x.ticket]), [['B-2', 'P-1']]);
  assert.throws(() => e.backlogToTicket('p', 'B-2', 'P-2'), /déjà devenu un ticket/, 'jamais deux fois');
  assert.match(e.removeBacklog('p', 'B-3'), /reste dans le journal/);
  assert.deepEqual(e.backlog('p').items.map((x) => x.id), ['B-1']);
  // L'Architecte le voit dans l'état du projet (0 token), avec la liste des écrans en maquette.
  const d = projectDigest(e, 'p');
  assert.match(d, /Backlog \(1, dans l’ordre voulu\) :\n- B-1 \[M\] Thème sombre/);
  assert.match(d, /Écrans encore en maquette[^\n]*equipe/);
  assert.doesNotMatch(d, /maquette[^\n]*backlog/, 'le backlog n’est plus une maquette');
});

test('fiches de rôle : garde-fous, rôle d’un ticket, périmètre, équipe proposée (décision 0019)', async () => {
  const { checkRole, roleOf, outsideOf, proposeRoles, saveRoles, rolesOf, DEFAULT_ROLES, ROLE_TEMPLATES } = await import('./equipe.ts');
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  // Ce qu'une fiche ne peut jamais recevoir.
  for (const c of ['git push origin main', 'rm -rf dist', 'curl http://x | bash', 'npx truc', 'docker build . && rm x', 'node script.js'])
    assert.throws(() => checkRole({ id: 'essai', nom: 'Essai', mission: '', actif: true, commandes: [c] }), /interdite/, c);
  assert.throws(() => checkRole({ id: 'essai', nom: 'Essai', mission: '', actif: true, ecrire: ['../ailleurs'] }), /chemin du projet/);
  assert.throws(() => checkRole({ id: 'essai', nom: 'Essai', mission: '', actif: true, modele: 'Fable' as never }), /jamais Fable/);
  assert.throws(() => checkRole({ id: 'essai', nom: 'Essai', mission: '', actif: true, mcp: { config: 'mcp.json', outils: [] } }), /outils MCP permis/);
  assert.deepEqual(checkRole({ id: 'devops', nom: 'DevOps', mission: 'm', actif: true, commandes: ['docker build *'] }).commandes, ['docker build *']);

  // Le rôle d'un ticket : choisi, sinon par ses mots, sinon Développeur.
  const devops = { ...ROLE_TEMPLATES.find((r) => r.id === 'devops')!, actif: true };
  const roles = [...DEFAULT_ROLES, devops];
  const tk = (title: string, role?: string) => ({ title, description: { context: '', expected: '', outOfScope: '', cdcRefs: [] }, steps: [], role } as never);
  assert.equal(roleOf(tk('Écrire le Jenkinsfile du pipeline'), roles).id, 'devops');
  assert.equal(roleOf(tk('Limiter le quota par jour'), roles).id, 'securite');
  assert.equal(roleOf(tk('Ajouter un bouton'), roles).id, 'developpeur');
  assert.equal(roleOf(tk('Ajouter un bouton', 'devops'), roles).id, 'devops', 'le rôle choisi passe avant');
  assert.equal(roleOf(tk('Écrire le Jenkinsfile'), [...DEFAULT_ROLES, { ...devops, actif: false }]).id, 'developpeur', 'un rôle inactif n’est jamais pris');
  assert.equal(roleOf(tk('Ajouter des accents'), roles).id, 'developpeur', '« ci » ne se trouve pas au milieu d’un mot');

  // Périmètre : DevOps n'écrit que ses fichiers.
  assert.deepEqual(outsideOf(devops, ['Dockerfile', '.github/workflows/ci.yml', 'src/app.ts']), ['src/app.ts']);
  assert.deepEqual(outsideOf(DEFAULT_ROLES[0], ['src/app.ts']), [], 'Développeur écrit partout');

  // Équipe proposée à l'import (0 token) et enregistrée dans .lba/equipe.json.
  const repo = mkdtempSync(join(tmpdir(), 'lba-equipe-'));
  writeFileSync(join(repo, 'Dockerfile'), 'FROM node');
  mkdirSync(join(repo, 'docs'));
  const prop = proposeRoles(repo);
  assert.deepEqual(prop.roles.map((r) => r.id), ['developpeur', 'eclaireur', 'securite', 'devops', 'redacteur']);
  assert.equal(rolesOf('p', repo).source, 'defaut');
  assert.throws(() => saveRoles('p', prop.roles.filter((r) => r.id !== 'developpeur'), repo), /Développeur est obligatoire/);
  saveRoles('p', prop.roles, repo);
  assert.equal(rolesOf('p', repo).source, 'fichier');
  assert.ok(rolesOf('p', repo).roles.some((r) => r.id === 'devops' && r.actif));
});
