// Backlog réel, comme une ESN (décisions 0019 et 0020) :
// - le cahier des charges dit CE QUE le projet doit être (stable) ; le backlog dit CE QUI RESTE à faire pour y
//   arriver depuis l'état actuel, dans l'ordre, en gros morceaux reliés aux exigences ;
// - un sprint prend des morceaux en tête, l'Architecte les découpe en tickets, et le sprint finit par un rapport ;
// - si le cahier ou une décision change, on analyse seulement ce qui est touché.
import { useState, type DragEvent, type FormEvent } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, FileText, Flag, GripVertical, Pencil, Plus, Scissors, Sparkles, Ticket as TicketIcon, X } from 'lucide-react';
import type { BacklogItem, Sprint } from '../shared/contract';
import { useNotify } from '../components/notify';
import { Bar, fmtTokens } from '../components/ui';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../backlog.css';

interface Facts { tickets: number; done: number; tokens: number; days: number; ids: string[] }
interface Data {
  items: BacklogItem[]; sprint: (Sprint & { elements: BacklogItem[] }) | null; done: BacklogItem[]; status: Record<string, string>;
  coverage: { total: number; covered: number; missing: { id: string; title: string }[] };
  changes: { changed: boolean; versionFrom?: string; versionTo?: string; added?: string[]; removed?: string[]; modified?: string[]; decisions?: string[] };
  sprints: (Sprint & { facts: Facts })[]; nextSprint: number;
}
const SIZE: Record<string, string> = { S: 'petit', M: 'moyen', L: 'gros' };
const STATUS: Record<string, string> = { 'a-faire': 'à faire', 'en-cours': 'en cours', action: 'besoin d’action', 'a-tester': 'à tester', termine: 'fini' };
const who = (o: string) => (o === 'vous' ? 'vous' : o === 'architecte' ? 'l’Architecte' : o);
const list = (xs?: string[]) => (xs?.length ? xs.join(', ') : '—');

export function BacklogLive({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { data, error } = useApi<Data>(`/projects/${projectId}/backlog`);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [size, setSize] = useState('');
  const [refs, setRefs] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', detail: '', size: '', refs: '' });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [goal, setGoal] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);

  const call = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const j = await r.json();
      if (!r.ok || /sprint|vu/.test(path)) notify(j.message ?? (r.ok ? 'Fait.' : 'Refusé.'));
      return r.ok;
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); return false; }
    finally { setBusy(false); }
  };
  const ask = (text: string) => go({ kind: 'projet', projectId, space: 'architecte', ask: text });
  const refList = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await call('POST', '/backlog', { title, detail, size, refs: refList(refs) })) { setTitle(''); setDetail(''); setSize(''); setRefs(''); }
  };
  const move = (id: string, to: number) => void call('POST', `/backlog/${id}/ordre`, { to });
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault(); setOver(null);
    const id = dragging; setDragging(null);
    if (!id || !data) return;
    const from = data.items.findIndex((b) => b.id === id);
    if (from >= 0 && from !== to) move(id, from < to ? to - 1 : to);
  };

  if (error) return <div className="page"><p className="muted">{error}</p></div>;
  if (!data) return <div className="page"><h1>Backlog</h1><p className="muted">Lecture du backlog…</p></div>;
  const { items, sprint, coverage: cov, changes: ch } = data;
  const pdf = (n: number) => `/api/projects/${projectId}/raw?path=${encodeURIComponent(`lba/comptes-rendus/sprint-${n}.pdf`)}`;
  const sprintDone = sprint ? sprint.elements.flatMap((x) => x.tickets).filter((t) => data.status[t] === 'termine').length : 0;
  const sprintAll = sprint ? sprint.elements.flatMap((x) => x.tickets).length : 0;

  const Refs = ({ r }: { r?: string[] }) => (r?.length ? <span className="bl__refs" title="Exigences du cahier des charges">{r.join(' · ')}</span> : null);

  return (
    <div className="page bl">
      <h1>Backlog</h1>
      <p className="lead">Le cahier des charges dit <b>ce que</b> le projet doit être. Le backlog dit <b>ce qui reste à faire</b> pour y arriver depuis l’état actuel, dans l’ordre, en gros morceaux. Un sprint prend les premiers morceaux, l’Architecte les découpe en tickets, et le sprint finit par un rapport.</p>

      {ch.changed && (
        <section className="bl__change" role="status">
          <div className="bl__changehead"><AlertTriangle size={16} aria-hidden="true" /><strong>Le cahier des charges ou les décisions ont changé</strong></div>
          <p>Exigences ajoutées : {list(ch.added)} ; modifiées : {list(ch.modified)} ; enlevées : {list(ch.removed)}. Décisions nouvelles : {list(ch.decisions)}.</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" onClick={() => ask(`Le cahier des charges ou les décisions ont changé : exigences ajoutées ${list(ch.added)}, modifiées ${list(ch.modified)}, enlevées ${list(ch.removed)} ; décisions nouvelles ${list(ch.decisions)}. Liste seulement les éléments du backlog et les tickets touchés, et ce que tu changerais. Ne change rien avant mon oui.`)}>
              <Sparkles size={14} />Analyser l’impact avec l’Architecte</button>
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void call('POST', '/backlog/changement-vu')}>C’est vu</button>
          </div>
        </section>
      )}

      <section className="bl__cov" aria-label="Couverture du cahier des charges">
        <div className="meter__head"><span>Cahier des charges couvert par le backlog ou les tickets</span><span className="num">{cov.covered} / {cov.total} exigences</span></div>
        <Bar value={cov.covered} max={Math.max(1, cov.total)} label="Couverture du cahier" tone="ok" />
        {!!cov.missing.length && <p className="bl__missing">Sans rien encore : {cov.missing.map((m) => <span key={m.id} className="bl__refs" title={m.title}>{m.id} {m.title}</span>)}</p>}
        <button className="btn btn--sm" onClick={() => ask(`Remplis le backlog du projet comme une ESN : pars du cahier des charges, des décisions, des règles et de l’état actuel du projet (ce qui existe déjà n’y va pas). Exigences sans rien aujourd’hui : ${cov.missing.map((m) => m.id).join(', ') || 'aucune'}. Ajoute des gros morceaux jusqu’à l’état final (lba backlog-ajouter --exigences … --taille …), dans l’ordre de priorité, sans doublon avec le backlog et les tickets. Pas de tickets détaillés. À la fin, dis-moi ce que tu as ajouté et pourquoi cet ordre.`)}
          title="L’Architecte (Opus) lit le cahier, les décisions et le projet : environ 20 à 40 k tokens, une fois"><Sparkles size={14} />Remplir le backlog depuis le cahier et l’état actuel</button>
      </section>

      {sprint ? (
        <section className="bl__sprint" aria-label={`Sprint ${sprint.n}`}>
          <div className="bl__sprinthead">
            <Flag size={16} aria-hidden="true" /><strong>Sprint {sprint.n}</strong><span className="bl__goal">{sprint.objectif}</span>
            <span className="faint xsmall">ouvert le {new Date(sprint.openedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>
          </div>
          <div className="meter__head"><span>Tickets finis</span><span className="num">{sprintDone} / {sprintAll}</span></div>
          <Bar value={sprintDone} max={Math.max(1, sprintAll)} label="Avancement du sprint" tone="ok" />
          <ul className="bl__selems">
            {sprint.elements.map((x) => (
              <li key={x.id}>
                <span className="bl__id">{x.id}</span><span className="bl__stitle">{x.title}</span><Refs r={x.refs} />
                <span className="bl__stickets">{x.tickets.length ? x.tickets.map((t) => <button key={t} className={`link bl__tk is-${data.status[t]}`} onClick={() => go({ kind: 'ticket', ticketId: t })}>{t} ({STATUS[data.status[t]] ?? '?'})</button>) : <span className="faint">pas encore découpé</span>}</span>
              </li>
            ))}
          </ul>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" onClick={() => ask(`Découpe le sprint ${sprint.n} (« ${sprint.objectif} ») en tickets : pour chaque élément ${sprint.elements.filter((x) => !x.tickets.length).map((x) => x.id).join(', ') || sprint.elements.map((x) => x.id).join(', ')}, 1 à 4 tickets précis avec 2 à 4 critères vérifiables, avec lba creer … --depuis B-n. Ne les lance pas.`)}>
              <Scissors size={14} />Découper en tickets (Architecte)</button>
            <a className="btn btn--ghost btn--sm" href={pdf(sprint.n)} target="_blank" rel="noopener"><FileText size={14} />Rapport en cours</a>
            {closing
              ? <><button className="btn btn--sm" disabled={busy} onClick={async () => { if (await call('POST', '/sprints/fermer')) setClosing(false); }}>Confirmer : fermer le sprint {sprint.n}</button><button className="btn btn--ghost btn--sm" onClick={() => setClosing(false)}>Annuler</button></>
              : <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setClosing(true)} title="Le rapport complet est fait par le programme ; un court résumé est écrit par Sonnet (environ 5 à 8 k)">Fermer le sprint</button>}
          </div>
        </section>
      ) : planning ? (
        <section className="bl__sprint is-plan" aria-label="Préparer le sprint">
          <div className="bl__sprinthead"><Flag size={16} aria-hidden="true" /><strong>Préparer le sprint {data.nextSprint}</strong></div>
          <label htmlFor="bl-goal" className="xsmall muted">Objectif : ce qui doit marcher à la fin</label>
          <input id="bl-goal" className="bl__goalin" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Par exemple : les comptes et la connexion marchent" maxLength={300} />
          <p className="xsmall muted">Cochez les éléments du sprint dans la liste « À venir » ci-dessous ({picked.length} choisi{picked.length > 1 ? 's' : ''}).</p>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn--primary btn--sm" disabled={busy || !goal.trim() || !picked.length} onClick={async () => { if (await call('POST', '/sprints', { objectif: goal, items: picked })) { setPlanning(false); setGoal(''); setPicked([]); } }}>Ouvrir le sprint {data.nextSprint}</button>
            <button className="btn btn--ghost btn--sm" onClick={() => ask(`Propose l’objectif et les éléments du prochain sprint (sprint ${data.nextSprint}) : les plus importants en tête du backlog, assez petits pour finir en quelques jours. Ne l’ouvre pas : je l’ouvre moi-même.`)}><Sparkles size={14} />Demander une proposition</button>
            <button className="btn btn--ghost btn--sm" onClick={() => { setPlanning(false); setPicked([]); }}>Annuler</button>
          </div>
        </section>
      ) : (
        <div className="bl__nosprint">
          <span className="muted">Aucun sprint ouvert.</span>
          <button className="btn btn--sm" disabled={!items.length} onClick={() => { setPlanning(true); setPicked(items.slice(0, 3).map((x) => x.id)); }}><Flag size={14} />Préparer le sprint {data.nextSprint}</button>
        </div>
      )}

      <h2 className="bl__h2">À venir</h2>
      <form className="bl__add" onSubmit={add}>
        <label className="sr-only" htmlFor="bl-title">Nouvel élément</label>
        <input id="bl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un morceau ou un besoin, en une phrase" maxLength={160} />
        <label className="sr-only" htmlFor="bl-size">Taille estimée</label>
        <select id="bl-size" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Taille ?</option><option value="S">Petit</option><option value="M">Moyen</option><option value="L">Gros</option>
        </select>
        <button className="btn btn--primary btn--sm" disabled={!title.trim() || busy}><Plus size={14} />Ajouter</button>
        <label className="sr-only" htmlFor="bl-detail">Détail (facultatif)</label>
        <textarea id="bl-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={1} placeholder="Détail, si besoin : pourquoi, pour qui, un exemple" maxLength={2000} />
        <label className="sr-only" htmlFor="bl-refs">Exigences du cahier</label>
        <input id="bl-refs" className="bl__refsin" value={refs} onChange={(e) => setRefs(e.target.value)} placeholder="Exigences du cahier, par exemple E13, A10" />
      </form>

      {!items.length ? (
        <p className="bl__empty">Rien à venir. « Remplir le backlog depuis le cahier » demande à l’Architecte de le remplir jusqu’à l’état final.</p>
      ) : (
        <ol className="bl__list" onDragOver={(e) => e.preventDefault()}>
          {items.map((b, i) => (
            <li key={b.id} className={`bl__item ${dragging === b.id ? 'is-drag' : ''} ${over === i ? 'is-over' : ''} ${planning ? 'is-plan' : ''}`}
              draggable={editing !== b.id && !planning} onDragStart={() => setDragging(b.id)} onDragEnd={() => { setDragging(null); setOver(null); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDrop={(e) => onDrop(e, i)}>
              {planning
                ? <input type="checkbox" className="bl__pick" aria-label={`Prendre ${b.id} dans le sprint`} checked={picked.includes(b.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.id] : picked.filter((x) => x !== b.id))} />
                : <span className="bl__grip" aria-hidden="true"><GripVertical size={15} /></span>}
              <span className="bl__rank">{i + 1}</span>
              {editing === b.id ? (
                <form className="bl__edit" onSubmit={async (e) => { e.preventDefault(); if (await call('PATCH', `/backlog/${b.id}`, { ...draft, refs: refList(draft.refs) })) setEditing(null); }}>
                  <input aria-label="Titre" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={160} />
                  <textarea aria-label="Détail" value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} rows={2} maxLength={2000} />
                  <input aria-label="Exigences du cahier" value={draft.refs} onChange={(e) => setDraft({ ...draft, refs: e.target.value })} placeholder="E13, A10" />
                  <div className="row">
                    <select aria-label="Taille" value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value })}>
                      <option value="">Taille ?</option><option value="S">Petit</option><option value="M">Moyen</option><option value="L">Gros</option>
                    </select>
                    <button className="btn btn--primary btn--sm" disabled={busy || !draft.title.trim()}>Enregistrer</button>
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(null)}>Annuler</button>
                  </div>
                </form>
              ) : (
                <div className="bl__body">
                  <div className="bl__title"><span className="bl__id">{b.id}</span>{b.title}{b.size && <span className={`bl__size is-${b.size}`}>{SIZE[b.size]}</span>}<Refs r={b.refs} /></div>
                  {b.detail && <p className="bl__detail">{b.detail}</p>}
                  <div className="bl__meta">Ajouté par {who(b.origin)}, le {new Date(b.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>
                </div>
              )}
              {editing !== b.id && !planning && (
                <div className="bl__acts">
                  <button className="btn btn--sm" disabled={busy} onClick={() => ask(`Fais un ticket depuis ${b.id} du backlog : « ${b.title} »${b.detail ? ` (${b.detail})` : ''}. Écris 2 à 4 critères vérifiables, puis crée-le avec lba creer … --depuis ${b.id}. Ne le lance pas.`)} title="Hors sprint : l’Architecte écrit les critères et crée le ticket (environ 3 à 8 k tokens)"><TicketIcon size={14} />En faire un ticket</button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Monter ${b.id}`} disabled={busy || i === 0} onClick={() => move(b.id, i - 1)}><ArrowUp size={15} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Descendre ${b.id}`} disabled={busy || i === items.length - 1} onClick={() => move(b.id, i + 1)}><ArrowDown size={15} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Modifier ${b.id}`} disabled={busy} onClick={() => { setEditing(b.id); setDraft({ title: b.title, detail: b.detail, size: b.size ?? '', refs: (b.refs ?? []).join(', ') }); }}><Pencil size={14} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Retirer ${b.id}`} title="Retirer du backlog (il reste dans le journal)" disabled={busy} onClick={() => void call('DELETE', `/backlog/${b.id}`)}><X size={15} /></button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!!data.sprints.filter((s) => s.closedAt).length && (
        <section className="bl__done" aria-label="Sprints passés">
          <h2>Sprints passés</h2>
          <table className="table">
            <thead><tr><th>Sprint</th><th>Objectif</th><th className="num">Tickets finis</th><th className="num">Tokens</th><th className="num">Jours</th><th>Rapport</th></tr></thead>
            <tbody>
              {data.sprints.filter((s) => s.closedAt).reverse().map((s) => (
                <tr key={s.n}><td>{s.n}</td><td>{s.objectif}</td><td className="num">{s.facts.done} / {s.facts.tickets}</td><td className="num">{fmtTokens(s.facts.tokens)}</td><td className="num">{s.facts.days}</td>
                  <td><a href={pdf(s.n)} target="_blank" rel="noopener" className="link"><FileText size={12} aria-hidden="true" /> PDF</a></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!!data.done.length && (
        <section className="bl__done" aria-label="Faits">
          <h2>Faits</h2>
          <ul>
            {data.done.map((b) => (
              <li key={b.id}><span className="bl__id">{b.id}</span>{b.title}{b.sprint ? <span className="faint"> (sprint {b.sprint})</span> : null} → {b.tickets.map((t) => <button key={t} className="link" onClick={() => go({ kind: 'ticket', ticketId: t })}>{t}</button>)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
