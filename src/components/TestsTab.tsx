import { useState } from 'react';
import { Check, Minus, X } from 'lucide-react';
import type { LiveItem } from '../shared/contract';
import { TEST_KINDS, isTestCommand, testKinds, type TestKind } from '../shared/tests';

// Commande d'un passage de tests : « npm test : vert » → « npm test ».
export const commandOf = (it: LiveItem) => it.text.trim().replace(/\s:\s(vert|en échec)$/, '');
// Un vrai passage de tests avec son résultat (pas l'annonce « l'agent lance… » ni une recherche du mot « test »).
export const isTestResult = (it: LiveItem) =>
  (it.kind === 'test' || (it.kind === 'commande' && it.ok !== undefined)) && isTestCommand(commandOf(it));

const who = (w?: string) => (w === 'programme' ? 'le programme' : w === 'vous' ? 'vous' : 'l’agent');
const when = (at: string) => new Date(at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function readDetail(detail?: string) {
  const lines = (detail ?? '').split('\n');
  const m = lines[0]?.match(/Tests : (\d+) passés, (\d+) en échec/);
  return {
    pass: m ? Number(m[1]) : undefined,
    fail: m ? Number(m[2]) : undefined,
    failures: lines.filter((l) => l.startsWith('✖ ')).map((l) => l.slice(2)),
    other: m ? undefined : lines[0] || undefined,
  };
}

// Onglet Tests : un bloc par type de test, avec le dernier résultat, le nom des tests en échec,
// la commande exacte et qui l'a lancée. L'historique complet reste replié dessous.
export function TestsTab({ feed }: { feed: LiveItem[] }) {
  const [history, setHistory] = useState(false);
  const runs = feed.filter(isTestResult);
  if (!runs.length) return (
    <div className="empty"><h3>Aucun test lancé pour l’instant</h3><p>Chaque passage des tests (par l’agent, par le programme, ou par vous avec « Tester ») s’affiche ici, rangé par type.</p></div>
  );
  const byKind = new Map<TestKind, LiveItem[]>();
  for (const r of runs) for (const k of testKinds(commandOf(r))) byKind.set(k, [...(byKind.get(k) ?? []), r]);
  const missing = TEST_KINDS.filter((k) => !byKind.has(k.id));

  return (
    <div className="tt">
      <ul className="tt-kinds">
        {TEST_KINDS.filter((k) => byKind.has(k.id)).map((k) => {
          const list = byKind.get(k.id)!;
          const last = list[list.length - 1];
          const d = readDetail(last.detail);
          const ko = last.ok === false;
          return (
            <li key={k.id} className={`tt-kind ${ko ? 'is-ko' : 'is-ok'}`}>
              <span className="tt-kind__mark" aria-hidden="true">{ko ? <X size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}</span>
              <div className="tt-kind__body">
                <div className="tt-kind__head">
                  <h3 className="tt-kind__name">{k.label}</h3>
                  <span className="tt-kind__result">
                    {d.pass !== undefined
                      ? <><b>{d.pass}</b> passés, <b className={d.fail ? 'is-ko' : ''}>{d.fail}</b> en échec</>
                      : ko ? 'en échec' : 'vert'}
                  </span>
                </div>
                <p className="tt-kind__what">{k.what}</p>
                {d.failures.length > 0 && (
                  <ul className="tt-fails" aria-label="Tests en échec">
                    {d.failures.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
                {ko && !d.failures.length && d.other && <p className="tt-kind__err">{d.other}</p>}
                <p className="tt-kind__meta">
                  <code>{commandOf(last)}</code>
                  <span>par {who(last.who)}, {when(last.at)}</span>
                  {list.length > 1 && <span>{list.length} passages</span>}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {missing.length > 0 && (
        <p className="tt-missing">
          <Minus size={13} aria-hidden="true" />
          Pas lancés dans ce ticket : {missing.map((k) => k.label.toLowerCase()).join(', ')}.
        </p>
      )}

      <button className="sd-more" aria-expanded={history} onClick={() => setHistory((v) => !v)}>
        Historique : {runs.length} passage{runs.length > 1 ? 's' : ''} {history ? '▴' : '▾'}
      </button>
      {history && (
        <ol className="testruns">
          {runs.slice().reverse().map((i) => (
            <li key={i.id} className={`testrun ${i.ok === false ? 'is-ko' : 'is-ok'}`}>
              <span className="testrun__mark" aria-hidden="true">{i.ok === false ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}</span>
              <span className="testrun__what">{commandOf(i)}<span className="sr-only">{i.ok === false ? ', en échec' : ', vert'}</span></span>
              <span className="testrun__who">{who(i.who)}</span>
              <span className="testrun__at">{when(i.at)}</span>
              {i.detail && <span className="testrun__detail">{i.detail.split('\n')[0]}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
