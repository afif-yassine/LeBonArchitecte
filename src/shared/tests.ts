// Types de tests et lecture de leur sortie, sans IA. Partagé par le moteur (qui résume) et la fiche (qui range).

export type TestKind = 'unitaires' | 'fonctionnels' | 'bout-en-bout' | 'verification' | 'documents';

export const TEST_KINDS: { id: TestKind; label: string; what: string }[] = [
  { id: 'unitaires', label: 'Tests unitaires', what: 'chaque fonction seule' },
  { id: 'fonctionnels', label: 'Tests fonctionnels', what: 'une fonctionnalité de bout en bout côté moteur (API)' },
  { id: 'bout-en-bout', label: 'Tests bout en bout', what: 'l’interface dans un vrai navigateur' },
  { id: 'verification', label: 'Vérification du code', what: 'types, compilation, règles d’écriture' },
  { id: 'documents', label: 'Contrôle des documents', what: 'documents et rapports bien formés' },
];

// Chaque morceau de commande doit COMMENCER par l'outil : « grep 'npm test' README » n'est pas un test.
const RULES: { kind: TestKind; re: RegExp }[] = [
  { kind: 'bout-en-bout', re: /^(npx playwright|playwright test|npx cypress|cypress run|npm run (e2e|test:e2e))\b/ },
  { kind: 'fonctionnels', re: /^npm run (test:api|test:func\w*)\b/ },
  { kind: 'documents', re: /^npm run (docs?|check:docs)\b/ },
  { kind: 'unitaires', re: /^(npm (run )?test|node --test|npx (vitest|jest)|vitest|jest)\b/ },
  { kind: 'verification', re: /^(npm run (check|build|lint|typecheck)|npx (tsc|eslint)|tsc --noEmit|eslint)\b/ },
];

// Une commande (même composée : « npm run check ; npm test ») peut couvrir plusieurs types.
export function testKinds(command: string): TestKind[] {
  const parts = command.split(/;|&&|\|\|/).map((p) => p.trim());
  const out = new Set<TestKind>();
  for (const p of parts) {
    const hit = RULES.find((r) => r.re.test(p));
    if (hit) out.add(hit.kind);
  }
  return [...out];
}

export const isTestCommand = (command: string) => testKinds(command).length > 0;

export interface TestCounts { pass?: number; fail?: number; failures: string[] }

// Chiffres et noms des tests en échec (node --test, vitest, jest, playwright, TAP).
export function readTestOutput(output: string): TestCounts {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pick = (re: RegExp) => lines.map((l) => l.match(re)?.[1]).find((x) => x !== undefined);
  const num = (s?: string) => (s === undefined ? undefined : Number(s));
  const pass = num(pick(/^ℹ pass (\d+)/) ?? pick(/^# pass (\d+)/) ?? pick(/Tests:?\s+.*?(\d+) passed/) ?? pick(/(\d+) passed/));
  const fail = num(pick(/^ℹ fail (\d+)/) ?? pick(/^# fail (\d+)/) ?? pick(/Tests:?\s+.*?(\d+) failed/) ?? pick(/(\d+) failed/));
  const names = new Set<string>();
  for (const l of lines) {
    const m = l.match(/^✖\s+(.+?)(\s+\(\d[\d.]*m?s\))?$/) ?? l.match(/^not ok \d+ - (.+)$/) ?? l.match(/^(?:×|✗)\s+(.+?)(\s+\d+m?s)?$/) ?? l.match(/^FAIL\s+(.+)$/);
    const name = m?.[1]?.trim();
    if (name && !/^failing tests:?$/i.test(name) && !/^\d+ (tests? )?failed/i.test(name)) names.add(name.slice(0, 160));
  }
  return { pass, fail, failures: [...names].slice(0, 8) };
}

// Détail enregistré dans le direct : une ligne de chiffres, puis un test en échec par ligne (« ✖ nom »).
export function testDetail(c: TestCounts): string {
  const head = c.pass !== undefined || c.fail !== undefined ? `Tests : ${c.pass ?? 0} passés, ${c.fail ?? 0} en échec.` : '';
  return [head, ...c.failures.map((f) => `✖ ${f}`)].filter(Boolean).join('\n');
}
