// Tests du moteur, sans IA ni réseau : base en mémoire, tickets de démonstration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from './db.ts';
import { Engine } from './engine.ts';
import { Refused, TRANSITIONS } from './tickets.ts';
import { contextAction, mustSwitch, pickModel, sameErrorTwice } from './rules.ts';
import { tickets } from '../src/mock/data.ts';

const fresh = () => { const e = new Engine(openDb(':memory:')); e.seed(tickets); return e; };
const OK = { criteriaOk: true, checks: { 'Critères tenus': 'ok', 'Tests verts': 'ok', 'Périmètre respecté': 'ok', 'Aucun secret': 'ok', 'Aucune nouvelle faille': 'ok', 'Documentation à jour': 'ok' } } as const;

test('un ticket fini ne peut pas revenir en arrière', () => {
  assert.deepEqual(TRANSITIONS.termine, []);
  const e = fresh();
  assert.throws(() => e.launch('T-3'), Refused);
});

test('la fin d’un agent avec tout vert passe « À tester » et le pilote lance le suivant prêt', () => {
  const e = fresh();
  const msg = e.agentDone('T-12', OK);
  assert.equal(e.ticket('T-12').status, 'a-tester');
  assert.equal(e.ticket('T-17').status, 'en-cours');
  assert.match(msg, /T-17 démarre/);
});

test('un ticket inachevé ne va jamais « À tester » : besoin d’action avec la cause', () => {
  const e = fresh();
  e.agentDone('T-12', { criteriaOk: false, checks: { 'Tests verts': 'echec' } });
  const t = e.ticket('T-12');
  assert.equal(t.status, 'action');
  assert.match(t.needAction ?? '', /tests verts/);
});

test('le pilote respecte les dépendances : T-16 attend T-12', () => {
  const e = fresh();
  e.agentDone('T-12', OK); // T-12 à tester, pas fini : T-16 doit encore attendre
  assert.equal(e.ticket('T-16').status, 'a-faire');
});

test('lancer quand toutes les places sont prises est refusé, sauf en remplaçant un ticket', () => {
  const e = fresh();
  assert.throws(() => e.launch('T-17'), /Plus de place/);
  e.launch('T-17', { replace: 'T-13' });
  assert.equal(e.ticket('T-17').status, 'en-cours');
  assert.equal(e.ticket('T-13').status, 'a-faire');
  assert.equal(e.ticket('T-13').priority, 0);
});

test('recette : valider finit le ticket, une réclamation le renvoie au même agent', () => {
  const e = fresh();
  e.validate('T-14');
  assert.equal(e.ticket('T-14').status, 'termine');
  e.agentDone('T-12', OK);
  assert.throws(() => e.reject('T-12', '  '), /Décrivez/);
  e.reject('T-12', 'La page reste blanche sur mobile.');
  assert.equal(e.ticket('T-12').status, 'en-cours');
  assert.equal(e.ticket('T-12').loops, 2);
});

test('compte rendu : un ticket n’est rapporté qu’une fois', () => {
  const e = fresh();
  const first = e.report('padel', 'CR-15');
  assert.ok(first.includes('T-11') && first.includes('T-14'));
  assert.deepEqual(e.report('padel', 'CR-16'), []);
});

test('chaque changement est écrit dans le journal', () => {
  const e = fresh();
  e.stop('T-13');
  const ev = e.events({ ticket: 'T-13' });
  assert.equal(ev[0].type, 'ticket-arrete');
});

test('choix du modèle par règles', () => {
  const t = tickets.find((x) => x.id === 'T-16')!; // paiement
  assert.equal(pickModel(t).model, 'Opus');
  const simple = { ...tickets.find((x) => x.id === 'T-15')!, title: 'Traduction des textes', tool: 'claude-code' as const, files: [] };
  assert.equal(pickModel(simple).model, 'Haiku');
  assert.equal(pickModel(simple, true).model, 'Sonnet');
});

test('règles : même erreur deux fois, bascule de quota, contexte', () => {
  assert.equal(sameErrorTwice(['SMS_API_KEY undefined', 'SMS_API_KEY undefined']), true);
  assert.equal(sameErrorTwice(['a', 'b']), false);
  assert.equal(mustSwitch(92), true);
  assert.equal(contextAction(52000, 60000, false), 'compacter');
  assert.equal(contextAction(52000, 60000, true), 'session-neuve');
  assert.equal(contextAction(20000, 60000, false), 'rien');
});
