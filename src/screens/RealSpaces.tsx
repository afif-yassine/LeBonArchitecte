// Onglets branchés sur les vraies données du projet (lot 1) : documents, cahier des charges, règles, git, tokens.
// Tout vient du moteur local (fichiers et git), sans IA et sans données d'exemple.
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { Markdown } from '../components/FileViewer';
import { fmtTokens } from '../components/ui';

interface DocEntry { path: string; title: string; size: number; at: string }
interface GitInfo {
  branch: string; remote: string; ahead: number; behind: number; dirty: string[];
  commits: { hash: string; at: string; subject: string }[];
  tickets: { branch: string; merged: boolean; last: string; worktree: boolean }[];
}
interface Usage {
  total: { used: number; cacheRead: number; costUsd: number; runs: number };
  byTicket: { id: string; title: string; used: number; cacheRead: number; costUsd: number; runs: number }[];
  byDay: { day: string; used: number }[];
}

// Relit à chaque changement du moteur (rev) : l'écran suit le travail sans actualiser.
function useApi<T>(path: string): { data?: T; error?: string } {
  const { rev } = useStore();
  const [s, setS] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    fetch(`/api${path}`).then(async (r) => {
      const j = await r.json();
      if (!live) return;
      setS(r.ok ? { data: j as T } : { error: (j as { message?: string }).message ?? `Erreur ${r.status}` });
    }).catch(() => live && setS({ error: 'Le moteur est arrêté : lancez « npm run dev ».' }));
    return () => { live = false; };
  }, [path, rev]);
  return s;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const when = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const Wait = ({ error }: { error?: string }) => <p className={error ? 'small' : 'faint small'}>{error ?? 'Lecture…'}</p>;

function DocReader({ projectId, path }: { projectId: string; path: string }) {
  const { data, error } = useApi<{ content: string }>(`/projects/${projectId}/doc?path=${encodeURIComponent(path)}`);
  return data ? <Markdown text={data.content} /> : <Wait error={error} />;
}

export function RealDocs({ projectId, title, lead, prefix }: { projectId: string; title: string; lead: string; prefix?: string }) {
  const { data, error } = useApi<DocEntry[]>(`/projects/${projectId}/docs`);
  const docs = (data ?? []).filter((d) => !prefix || d.path.startsWith(prefix));
  const [open, setOpen] = useState<string | null>(null);
  const cur = open ?? docs.find((d) => d.path.endsWith('.md'))?.path ?? null;
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {!data ? <Wait error={error} /> : docs.length === 0 ? <p className="muted">Aucun document ici pour l’instant.</p> : (
        <div style={{ marginTop: 18 }}>
          <ul className="files" aria-label="Documents">
            {docs.map((d) => (
              <li key={d.path}>
                {d.path.endsWith('.pdf')
                  ? <span className="fileopen" title="PDF : à ouvrir sur votre PC"><FileText size={14} aria-hidden="true" /><span className="mono">{d.path}</span></span>
                  : <button className={`fileopen ${cur === d.path ? 'is-open' : ''}`} onClick={() => setOpen(d.path)} aria-pressed={cur === d.path}><FileText size={14} aria-hidden="true" /><span className="mono">{d.title}</span></button>}
                <span className="faint xsmall" style={{ marginLeft: 'auto' }}>{d.path.endsWith('.pdf') ? 'PDF, ' : ''}{day(d.at)}</span>
              </li>
            ))}
          </ul>
          {cur && (
            <div className="fileview">
              <div className="fileview__head"><span className="mono small">{cur}</span></div>
              <div className="fileview__body"><DocReader projectId={projectId} path={cur} /></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Règles : la partie « Règles de travail » du cahier des charges, seul endroit où elles sont écrites.
export function RealRules({ projectId }: { projectId: string }) {
  const path = 'docs/cahier-des-charges/cahier-des-charges.md';
  const { data, error } = useApi<{ content: string }>(`/projects/${projectId}/doc?path=${encodeURIComponent(path)}`);
  const part = data?.content.match(/^## 1\.[\s\S]*?(?=^## )/m)?.[0];
  return (
    <div className="page">
      <h1>Règles du projet</h1>
      <p className="lead">Lues dans le cahier des charges ({path}), le seul endroit où elles sont écrites. Pour les changer, on change ce fichier.</p>
      {!data ? <Wait error={error} /> : part ? <Markdown text={part} /> : <p className="muted">Partie « 1. Règles » introuvable dans le cahier des charges.</p>}
    </div>
  );
}

export function RealGit({ projectId }: { projectId: string }) {
  const { data: g, error } = useApi<GitInfo>(`/projects/${projectId}/git`);
  if (!g) return <div className="page"><h1>Git</h1><Wait error={error} /></div>;
  return (
    <div className="page">
      <h1>Git</h1>
      <p className="lead">
        Branche <b>{g.branch}</b>{g.remote && <> · GitHub : {g.remote.replace(/^https:\/\/github.com\//, '').replace(/\.git$/, '')}</>}.{' '}
        {g.ahead > 0 ? <span className="pill pill--wait">{g.ahead} commit{g.ahead > 1 ? 's' : ''} pas encore envoyé{g.ahead > 1 ? 's' : ''}</span> : <span className="pill pill--ok">À jour avec GitHub</span>}
        {g.behind > 0 && <span className="pill pill--danger">{g.behind} en retard</span>}
      </p>

      <section className="section">
        <div className="section__head"><h2>Branches des tickets</h2><span className="muted small">une branche par ticket, réunie dans main après des tests verts</span></div>
        {g.tickets.length === 0 ? <p className="muted">Aucune branche de ticket.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Branche</th><th>État</th><th>Dernier changement</th></tr></thead>
            <tbody>{g.tickets.map((t) => (
              <tr key={t.branch}><td><code>{t.branch}</code></td>
                <td>{t.merged ? <span className="pill pill--ok">Réunie dans main</span> : t.worktree ? <span className="pill pill--accent">En travail</span> : <span className="pill pill--wait">Pas réunie</span>}</td>
                <td className="muted">{t.last ? when(t.last) : ''}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="section">
        <div className="section__head"><h2>Derniers commits</h2></div>
        <div className="table-wrap"><table className="table">
          <tbody>{g.commits.map((c) => <tr key={c.hash}><td><code>{c.hash}</code></td><td>{c.subject}</td><td className="muted" style={{ whiteSpace: 'nowrap' }}>{when(c.at)}</td></tr>)}</tbody>
        </table></div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Changements pas encore enregistrés</h2><span className="muted small">{g.dirty.length} fichier{g.dirty.length > 1 ? 's' : ''}</span></div>
        {g.dirty.length === 0 ? <p className="muted">Rien : tout est enregistré.</p> : <ul className="small">{g.dirty.map((d) => <li key={d}><code>{d}</code></li>)}</ul>}
      </section>
    </div>
  );
}

export function RealUsage({ projectId }: { projectId: string }) {
  const { data: u, error } = useApi<Usage>(`/projects/${projectId}/usage`);
  if (!u) return <Wait error={error} />;
  const max = Math.max(...u.byDay.map((d) => d.used), 1);
  return (
    <div>
      <p className="lead">
        Mesuré pour chaque lancement d’agent, sans estimation : <b>{fmtTokens(u.total.used)}</b> tokens en {u.total.runs} lancement{u.total.runs > 1 ? 's' : ''},
        plus {fmtTokens(u.total.cacheRead)} relus depuis le cache (environ 10 fois moins chers). Coût estimé {u.total.costUsd.toFixed(2)} $, pris sur votre abonnement.
      </p>
      {u.byDay.length > 0 && (
        <div className="chart" role="img" aria-label={u.byDay.map((d) => `${day(d.day)} ${fmtTokens(d.used)}`).join(', ')} style={{ marginTop: 16 }}>
          {u.byDay.map((d) => (
            <div key={d.day} className="chart__col">
              <span className="chart__val">{fmtTokens(d.used)}</span>
              <span className="chart__bar" style={{ height: `${Math.max(4, (d.used / max) * 100)}%` }} />
              <span className="chart__day">{day(d.day)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="table-wrap" style={{ marginTop: 16 }}><table className="table">
        <thead><tr><th>Ticket</th><th>Tokens</th><th>Relus du cache</th><th>Lancements</th><th>Coût estimé</th></tr></thead>
        <tbody>{u.byTicket.map((t) => (
          <tr key={t.id}><td><b>{t.id}</b> <span className="muted">{t.title}</span></td><td className="num">{fmtTokens(t.used)}</td>
            <td className="num muted">{fmtTokens(t.cacheRead)}</td><td className="num">{t.runs}</td><td className="num">{t.costUsd.toFixed(2)} $</td></tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}
