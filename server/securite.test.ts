// Gardes de sécurité gratuites (lot S, décision 0016). Les fausses clés sont construites en morceaux :
// ce fichier lui-même ne doit jamais être pris pour un secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envNotIgnored, findSecrets, forbiddenFile, hasAbuseTest, NOT_A_SECRET, quickScan, sensitiveZones } from './securite.ts';
import { ensureWorktree } from './git.ts';

const FAKE_ANT = 'sk-ant-' + 'api03-' + 'x'.repeat(24);
const FAKE_GH = 'gh' + 'p_' + 'A'.repeat(36);

test('secrets reconnus dans les lignes ajoutées, sans jamais garder leur valeur', () => {
  const patch = [
    '+++ b/src/config.ts', `+const key = "${FAKE_ANT}";`, `-const old = "${FAKE_GH}";`,
    '+++ b/src/db.ts', '+const password = "hunter2hunter2";', // lba:pas-un-secret
    '+++ b/src/fixture.test.ts', `+const password = "faux-mot-de-passe"; // ${NOT_A_SECRET}`, // lba:pas-un-secret
    '+++ b/src/ok.ts', '+const password = process.env.DB_PASSWORD;', '+const apiKey = "${KEY}";',
  ].join('\n');
  const s = findSecrets(patch);
  assert.deepEqual(s, [{ file: 'src/config.ts', kind: 'clé Anthropic' }, { file: 'src/db.ts', kind: 'mot de passe ou clé écrit en dur' }]);
  assert.ok(!JSON.stringify(s).includes('hunter2'), 'la valeur n’est jamais gardée');
  // Le marqueur ne couvre pas une vraie clé de fournisseur.
  assert.equal(findSecrets(`+++ b/a.ts\n+const k = "${FAKE_GH}"; // ${NOT_A_SECRET}`).length, 1);
});

test('fichiers interdits dans git : .env, clés ; les modèles d’exemple restent permis', () => {
  for (const f of ['.env', 'app/.env.local', '.env.production', 'certs/server.pem', 'id_rsa', 'deploy.key', 'credentials.json']) assert.ok(forbiddenFile(f), f);
  for (const f of ['.env.example', '.env.sample', 'src/env.ts', 'README.md', 'keys.ts', 'id_rsa.pub']) assert.ok(!forbiddenFile(f), f);
});

test('zones sensibles et test d’abus : la triche du quota est repérée', () => {
  assert.deepEqual(sensitiveZones(['server/quota.ts'], ''), ['quotas et limites']);
  assert.deepEqual(sensitiveZones(['src/a.ts'], '+++ b/src/a.ts\n+if (user.isAdmin) allow();'), ['connexion et droits']);
  assert.deepEqual(sensitiveZones(['docs/a.md', 'server/quota.test.ts'], '+++ b/docs/a.md\n+le quota du jour'), [], 'documents et tests ne comptent pas');
  assert.ok(hasAbuseTest([{ text: 'Test d’abus : supprimer puis remettre le fichier ne remet pas le quota à zéro' }]));
  assert.ok(!hasAbuseTest([{ text: 'Les tests passent' }]));
});

test('un secret ajouté puis effacé est quand même trouvé, et un .env ajouté bloque', () => {
  const repo = mkdtempSync(join(tmpdir(), 'lba-secu-'));
  const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'test'); git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(repo, '.gitignore'), '.lba/\n');
  writeFileSync(join(repo, 'README.md'), '# test\n');
  git('add', '-A'); git('commit', '-q', '-m', 'init');

  const wt = ensureWorktree(repo, 'T-1');
  const wgit = (...a: string[]) => execFileSync('git', a, { cwd: wt, stdio: 'pipe' });
  writeFileSync(join(wt, 'a.ts'), 'export const x = 1;\n');
  wgit('add', '-A'); wgit('commit', '-q', '-m', 'propre');
  assert.equal(quickScan(repo, 'T-1').blocked, false, 'rien à signaler');

  writeFileSync(join(wt, 'a.ts'), `export const x = "${FAKE_ANT}";\n`);
  wgit('add', '-A'); wgit('commit', '-q', '-m', 'oups');
  writeFileSync(join(wt, 'a.ts'), 'export const x = process.env.X;\n');
  wgit('add', '-A'); wgit('commit', '-q', '-m', 'effacé');
  const s = quickScan(repo, 'T-1');
  assert.equal(s.blocked, true, 'l’historique garde le secret effacé');
  assert.deepEqual(s.secrets.map((x) => x.file), ['a.ts']);
  assert.match(s.cause!, /historique/);
  assert.ok(!s.cause!.includes(FAKE_ANT), 'la clé n’est jamais affichée');

  // .env pas ignoré : signalé (noms seulement), puis bloqué s'il entre dans git.
  writeFileSync(join(repo, '.env'), 'X=1\n');
  assert.deepEqual(envNotIgnored(repo, wt), ['.env']);
  writeFileSync(join(wt, '.gitignore'), '.lba/\n.env\n');
  assert.deepEqual(envNotIgnored(repo, wt), [], 'ignoré dans la branche');
  unlinkSync(join(wt, '.gitignore'));
  writeFileSync(join(wt, '.env'), 'X=1\n');
  wgit('add', '-A'); wgit('commit', '-q', '-m', 'env');
  assert.deepEqual(quickScan(repo, 'T-2').forbidden, [], 'autre ticket : rien');
  assert.deepEqual(quickScan(repo, 'T-1').forbidden, ['.env']);
});
