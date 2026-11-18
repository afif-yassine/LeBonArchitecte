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
