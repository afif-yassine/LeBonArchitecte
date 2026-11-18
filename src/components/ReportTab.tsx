import type { ReactNode } from 'react';
import { Check, FileText, GitBranch, Layers, X } from 'lucide-react';
import { Markdown } from './Markdown';
import { fmtTokens } from './ui';
import { useApi } from '../screens/RealSpaces';
import '../report.css';

// Même forme que server/reports.ts (TicketReport).
interface Report {
  id: string; lot: number; status: string; validatedAt?: string; heavy: string[]; unverified?: string[];
  problem: string; solution: string; why?: string; limits?: string;
  how: { branch?: string; commits: string[]; files: { path: string }[]; decisions: string[] };
  tests: { kind: string; ok: boolean; result: string; command: string; failures: string[] }[];
  calls: { model: string; effort: string; passes: number; turns: number; tokens: number; costUsd: number; minutes: number; yourMessages: string[]; problems: string[] };
}

const clean = (s: string) => s.replace(/ (#{2,3} )/g, '\n\n$1').replace(/ - \*\*/g, '\n- **');

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="cr-part">
      <span className="cr-part__n" aria-hidden="true">{n}</span>
      <div className="cr-part__body"><h3 className="cr-part__title">{title}</h3>{children}</div>
    </section>
  );
}

const Missing = ({ children }: { children: ReactNode }) => <p className="cr-missing">{children}</p>;

// Compte rendu du ticket : 7 parties fixes. L'agent écrit le problème, la solution, le pourquoi et les limites ;
// le programme ajoute ce qu'il a mesuré (fichiers, tests, appels). files : la liste des fichiers avec leur diff.
export function ReportTab({ ticketId, files, onDocs, onTests }: { ticketId: string; files: ReactNode; onDocs: () => void; onTests: () => void }) {
  const { data: r } = useApi<Report>(`/tickets/${ticketId}/report`);
  if (!r) return <p className="faint small">Lecture…</p>;
  const old = !r.why && !r.limits;
  return (
    <div className="cr">
      <div className={`cr-kind ${r.heavy.length ? 'is-heavy' : ''}`}>
        {r.heavy.length ? <FileText size={16} aria-hidden="true" /> : <Layers size={16} aria-hidden="true" />}
        <p>
          {r.heavy.length
            ? <><strong>Ticket lourd</strong> : {r.heavy.join(', ')}. {r.status === 'termine' ? 'Son compte rendu est aussi dans Documents.' : 'Son compte rendu ira dans Documents une fois validé.'}</>
            : <><strong>Ticket léger</strong> : regroupé dans le compte rendu du lot {r.lot}, quand le lot sera fini.</>}
        </p>
        <button className="link" onClick={onDocs}>Comptes rendus</button>
      </div>

      <Part n={1} title="Le problème"><div className="cr-text"><Markdown text={r.problem} /></div></Part>
      <Part n={2} title="La solution">
        {r.solution ? <div className="cr-text"><Markdown text={clean(r.solution)} /></div> : <Missing>L’agent n’a pas encore écrit son résumé.</Missing>}
      </Part>
      <Part n={3} title="Pourquoi cette solution">
        {r.why ? <div className="cr-text"><Markdown text={r.why} /></div> : <Missing>{old ? 'Pas écrit : ce ticket a été fait avant la nouvelle consigne.' : 'L’agent ne l’a pas écrit.'}</Missing>}
      </Part>
      <Part n={4} title="Comment">
        <p className="cr-meta">
          <GitBranch size={13} aria-hidden="true" /><code>{r.how.branch ?? 'pas de branche'}</code>
          <span>{r.how.commits.length} commit{r.how.commits.length > 1 ? 's' : ''}</span>
          <span>{r.how.files.length} fichier{r.how.files.length > 1 ? 's' : ''}</span>
        </p>
        {r.how.files.length > 0 && files}
      </Part>
      <Part n={5} title="Tests">
        {r.tests.length === 0 ? <Missing>Aucun test lancé.</Missing> : (
          <ul className="cr-tests">
            {r.tests.map((x) => (
              <li key={x.kind} className={x.ok ? 'is-ok' : 'is-ko'}>
                <span className="cr-tests__mark" aria-hidden="true">{x.ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}</span>
                <span className="cr-tests__kind">{x.kind}</span>
                <span className="cr-tests__res">{x.result}</span>
                <code className="cr-tests__cmd">{x.command}</code>
                {x.failures.map((f) => <span key={f} className="cr-tests__fail">✖ {f}</span>)}
              </li>
            ))}
          </ul>
        )}
        <button className="link cr-more" onClick={onTests}>Tous les passages dans l’onglet Tests</button>
      </Part>
      <Part n={6} title="Appels">
        <dl className="cr-calls">
          <dt>Agent</dt><dd>Claude {r.calls.model}, effort {r.calls.effort}</dd>
          <dt>Travail</dt><dd>{r.calls.passes} passage{r.calls.passes > 1 ? 's' : ''}, {r.calls.turns} échanges, {r.calls.minutes} min</dd>
          <dt>Consommation</dt><dd>{fmtTokens(r.calls.tokens)} tokens, environ {r.calls.costUsd.toFixed(2)} $ d’équivalent</dd>
          <dt>Vos messages</dt><dd>{r.calls.yourMessages.length ? <ul>{r.calls.yourMessages.map((m, i) => <li key={i}>« {m} »</li>)}</ul> : 'aucun'}</dd>
          {r.calls.problems.length > 0 && <><dt>Problèmes</dt><dd><ul>{r.calls.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></dd></>}
        </dl>
      </Part>
      <Part n={7} title="Limites et suite">
        {r.limits ? <div className="cr-text"><Markdown text={r.limits} /></div> : !r.unverified?.length && <Missing>{old ? 'Pas écrit : ce ticket a été fait avant la nouvelle consigne.' : 'Rien de signalé.'}</Missing>}
        {!!r.unverified?.length && (
          <div className="ts__warn" style={{ marginLeft: 0 }}>
            <p>Non vérifié, d’après l’agent :</p>
            <ul>{r.unverified.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        )}
        {r.how.decisions.length > 0 && <p className="cr-meta">Décisions liées : {r.how.decisions.map((d) => <code key={d}>{d.split('/').pop()}</code>)}</p>}
      </Part>
    </div>
  );
}
