// Backlog réel (lot B) : les idées et besoins pas encore décidés, dans l'ordre où vous les voulez.
// Un élément devient un ticket par l'Architecte (il écrit les critères) : il quitte alors le backlog.
// Le Kanban garde le travail décidé ; le backlog, ce qui ne l'est pas encore. Une information, un seul endroit.
import { useState, type DragEvent, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Ticket as TicketIcon, X } from 'lucide-react';
import type { BacklogItem } from '../shared/contract';
import { useNotify } from '../components/notify';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../backlog.css';

const SIZE: Record<string, string> = { S: 'petit', M: 'moyen', L: 'gros' };
const who = (o: string) => (o === 'vous' ? 'vous' : o === 'architecte' ? 'l’Architecte' : o);

export function BacklogLive({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { data, error } = useApi<{ items: BacklogItem[]; done: BacklogItem[] }>(`/projects/${projectId}/backlog`);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [size, setSize] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ title: '', detail: '', size: '' });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (method: string, path: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/backlog${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
      const j = await r.json();
      if (!r.ok) notify(j.message ?? 'Refusé.');
      return r.ok;
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); return false; }
    finally { setBusy(false); }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await call('POST', '', { title, detail, size })) { setTitle(''); setDetail(''); setSize(''); }
  };
  const move = (id: string, to: number) => void call('POST', `/${id}/ordre`, { to });
  const onDrop = (e: DragEvent, to: number) => {
    e.preventDefault(); setOver(null);
    const id = dragging; setDragging(null);
    if (!id || !data) return;
    const from = data.items.findIndex((b) => b.id === id);
    if (from >= 0 && from !== to) move(id, from < to ? to - 1 : to);
  };
  const toTicket = (b: BacklogItem) => go({
    kind: 'projet', projectId, space: 'architecte',
    ask: `Fais un ticket depuis ${b.id} du backlog : « ${b.title} »${b.detail ? ` (${b.detail})` : ''}. Écris 2 à 4 critères vérifiables, puis crée-le avec lba creer … --depuis ${b.id}. Ne le lance pas.`,
  });

  if (error) return <div className="page"><p className="muted">{error}</p></div>;
  const items = data?.items ?? [];

  return (
    <div className="page bl">
      <h1>Backlog</h1>
      <p className="lead">Les idées et les besoins pas encore décidés. Rangez-les par importance, en les glissant. « En faire un ticket » demande à l’Architecte d’écrire les critères : l’élément quitte alors le backlog et rejoint le Kanban.</p>

      <form className="bl__add" onSubmit={add}>
        <label className="sr-only" htmlFor="bl-title">Nouvelle idée ou nouveau besoin</label>
        <input id="bl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Une idée ou un besoin, en une phrase" maxLength={160} />
        <label className="sr-only" htmlFor="bl-size">Taille estimée</label>
        <select id="bl-size" value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">Taille ?</option><option value="S">Petit</option><option value="M">Moyen</option><option value="L">Gros</option>
        </select>
        <button className="btn btn--primary btn--sm" disabled={!title.trim() || busy}><Plus size={14} />Ajouter</button>
        <label className="sr-only" htmlFor="bl-detail">Détail (facultatif)</label>
        <textarea id="bl-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={1} placeholder="Détail, si besoin : pourquoi, pour qui, un exemple" maxLength={2000} />
      </form>

      {!data ? <p className="muted">Lecture du backlog…</p> : !items.length ? (
        <p className="bl__empty">Le backlog est vide. Ajoutez une idée ci-dessus, ou demandez à l’Architecte : « remplis le backlog avec ce qui manque au projet ».</p>
      ) : (
        <ol className="bl__list" onDragOver={(e) => e.preventDefault()}>
          {items.map((b, i) => (
            <li key={b.id} className={`bl__item ${dragging === b.id ? 'is-drag' : ''} ${over === i ? 'is-over' : ''}`}
              draggable={editing !== b.id} onDragStart={() => setDragging(b.id)} onDragEnd={() => { setDragging(null); setOver(null); }}
              onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDrop={(e) => onDrop(e, i)}>
              <span className="bl__grip" aria-hidden="true"><GripVertical size={15} /></span>
              <span className="bl__rank">{i + 1}</span>
              {editing === b.id ? (
                <form className="bl__edit" onSubmit={async (e) => { e.preventDefault(); if (await call('PATCH', `/${b.id}`, draft)) setEditing(null); }}>
                  <input aria-label="Titre" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={160} />
                  <textarea aria-label="Détail" value={draft.detail} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} rows={2} maxLength={2000} />
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
                  <div className="bl__title"><span className="bl__id">{b.id}</span>{b.title}{b.size && <span className={`bl__size is-${b.size}`}>{SIZE[b.size]}</span>}</div>
                  {b.detail && <p className="bl__detail">{b.detail}</p>}
                  <div className="bl__meta">Ajouté par {who(b.origin)}, le {new Date(b.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>
                </div>
              )}
              {editing !== b.id && (
                <div className="bl__acts">
                  <button className="btn btn--sm" disabled={busy} onClick={() => toTicket(b)} title="L’Architecte écrit les critères et crée le ticket (environ 3 à 8 k tokens)"><TicketIcon size={14} />En faire un ticket</button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Monter ${b.id}`} disabled={busy || i === 0} onClick={() => move(b.id, i - 1)}><ArrowUp size={15} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Descendre ${b.id}`} disabled={busy || i === items.length - 1} onClick={() => move(b.id, i + 1)}><ArrowDown size={15} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Modifier ${b.id}`} disabled={busy} onClick={() => { setEditing(b.id); setDraft({ title: b.title, detail: b.detail, size: b.size ?? '' }); }}><Pencil size={14} /></button>
                  <button className="btn btn--ghost btn--icon" aria-label={`Retirer ${b.id}`} title="Retirer du backlog (il reste dans le journal)" disabled={busy} onClick={() => void call('DELETE', `/${b.id}`)}><X size={15} /></button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!!data?.done.length && (
        <section className="bl__done" aria-label="Devenus des tickets">
          <h2>Devenus des tickets</h2>
          <ul>
            {data.done.map((b) => (
              <li key={b.id}><span className="bl__id">{b.id}</span>{b.title} → <button className="link" onClick={() => go({ kind: 'ticket', ticketId: b.ticket! })}>{b.ticket}</button></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
