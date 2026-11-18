// Onglets branchés sur les vraies données du projet (lot 1) : documents, cahier des charges, règles, git, tokens.
// Tout vient du moteur local (fichiers et git), sans IA et sans données d'exemple.
import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { useStore } from '../store';
import { headings, Markdown } from '../components/Markdown';
import { Bar, fmtTokens } from '../components/ui';
import { MILESTONE_TARGETS, type MilestoneStats } from '../shared/targets';

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
  stats: MilestoneStats;
}

// Une cible et sa mesure : « tenue » ou « pas encore » ; rien tant qu'il n'y a pas de mesure.
function Target({ text, held }: { text: string; held: boolean | null }) {
  return <td className="num">{text}{held !== null && <> <span className={`pill ${held ? 'pill--ok' : 'pill--wait'}`}>{held ? 'tenue' : 'pas encore'}</span></>}</td>;
}

// Relit à chaque changement du moteur (rev) : l'écran suit le travail sans actualiser.
export function useApi<T>(path: string) /* partagé avec le cahier des charges */: { data?: T; error?: string } {
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

// ---------- Bibliothèque de documents ----------
const GROUPS: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: 'cdc', label: 'Cahier des charges', test: (p) => p.startsWith('docs/cahier-des-charges/') },
  { id: 'dec', label: 'Décisions', test: (p) => p.startsWith('docs/decisions/') },
  { id: 'cr', label: 'Comptes rendus', test: (p) => p.startsWith('lba/comptes-rendus/') },
  { id: 'rap', label: 'Rapports', test: (p) => p.startsWith('docs/rapports/') },
  { id: 'rec', label: 'Recherches', test: (p) => p.startsWith('docs/recherche/') },
  { id: 'jou', label: 'Journal', test: (p) => /JOURNAL\.md$/i.test(p) },
  { id: 'aut', label: 'Autres', test: () => true },
];

interface Item { key: string; title: string; md?: DocEntry; pdf?: DocEntry; at: string; group: string }

// Un document = son texte (.md) et, s'il existe, son PDF du même nom.
function itemsOf(docs: DocEntry[]): Item[] {
  const by = new Map<string, Item>();
  for (const d of docs) {
    const key = d.path.replace(/\.(md|pdf)$/, '');
    const it = by.get(key) ?? { key, title: '', at: d.at, group: GROUPS.find((g) => g.test(d.path))!.id };
    if (d.path.endsWith('.pdf')) it.pdf = d; else { it.md = d; it.title = d.title; }
    if (!it.title) it.title = key.split('/').pop()!.replace(/^\d+-/, '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
    if (d.at > it.at) it.at = d.at;
    by.set(key, it);
  }
  return [...by.values()];
}

const pdfUrl = (projectId: string, path: string) => `/api/projects/${projectId}/raw?path=${encodeURIComponent(path)}`;
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

function DocPage({ projectId, item, onLink }: { projectId: string; item: Item; onLink: (href: string) => void }) {
  const { data, error } = useApi<{ content: string }>(item.md ? `/projects/${projectId}/doc?path=${encodeURIComponent(item.md.path)}` : '/health');
  const body = item.md && data?.content ? data.content.replace(/^\s*# .+\r?\n/, '') : '';
  const toc = headings(body).filter((h) => h.level === 2);
  const minutes = Math.max(1, Math.round(body.split(/\s+/).length / 220));
  const group = GROUPS.find((g) => g.id === item.group)!.label;
  return (
    <article className="doc" aria-labelledby="doc-title">
      <header className="doc__head">
        <p className="doc__kind">{group}</p>
        <h2 id="doc-title" className="doc__title">{item.title}</h2>
        <div className="doc__meta">
          <span>Mis à jour le {day(item.at)}</span>
          {item.md && <span>{minutes} min de lecture</span>}
          <span className="mono">{(item.md ?? item.pdf)!.path}</span>
        </div>
        {item.pdf && (
          <a className="btn btn--sm doc__pdf" href={pdfUrl(projectId, item.pdf.path)} target="_blank" rel="noopener">
            <FileText size={14} aria-hidden="true" /> Ouvrir le PDF {item.pdf.size > 0 && <span className="faint">{size(item.pdf.size)}</span>}
          </a>
        )}
      </header>
      {!item.md ? (
        <p className="muted doc__nomd">Ce rapport existe seulement en PDF. Il s’ouvre dans un nouvel onglet du navigateur.</p>
      ) : !data ? <Wait error={error} /> : (
        <div className={`doc__body ${toc.length >= 3 ? 'has-toc' : ''}`}>
          <Markdown text={body} onLink={onLink} />
          {toc.length >= 3 && (
            <nav className="doc__toc" aria-label="Sommaire">
              <p className="doc__toclabel">Sommaire</p>
              <ol>{toc.map((h) => <li key={h.id}><a href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{h.text}</a></li>)}</ol>
            </nav>
          )}
        </div>
      )}
    </article>
  );
}

export function RealDocs({ projectId, title, lead, prefix, exclude }: { projectId: string; title: string; lead: string; prefix?: string; exclude?: string }) {
  const { data, error } = useApi<DocEntry[]>(`/projects/${projectId}/docs`);
  // Une information = un seul endroit : pas de fichier sommaire (README) ni de doublon d'un autre onglet.
  const items = itemsOf((data ?? []).filter((d) => (!prefix || d.path.startsWith(prefix)) && (!exclude || !d.path.startsWith(exclude)) && !/\/README\.md$/i.test(d.path)));
  const [open, setOpen] = useState<string | null>(null);
  const cur = items.find((i) => i.key === open) ?? items.find((i) => i.md) ?? items[0];
  // Lien entre documents (ex. « voir la décision 0003 ») : on l'ouvre ici.
  const onLink = (href: string) => {
    const k = href.replace(/^\.?\//, '').replace(/\.(md|pdf)$/, '');
    const hit = items.find((i) => i.key.endsWith(k.replace(/^(\.\.\/)+/, '')));
    if (hit) setOpen(hit.key);
  };
  const pick = (it: Item) => (it.md ? setOpen(it.key) : window.open(pdfUrl(projectId, it.pdf!.path), '_blank', 'noopener'));
  return (
    <div className="page page--lib">
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {!data ? <Wait error={error} /> : items.length === 0 ? <p className="muted">Aucun document ici pour l’instant.</p> : (
        <div className="lib">
          <nav className="lib__nav" aria-label="Documents">
            {GROUPS.map((g) => {
              const list = items.filter((i) => i.group === g.id).sort((a, b) => (g.id === 'rap' || g.id === 'rec' ? b.at.localeCompare(a.at) : a.key.localeCompare(b.key)));
              if (!list.length) return null;
              return (
                <section key={g.id} className="lib__group">
                  <h3>{g.label} <span className="faint">{list.length}</span></h3>
                  <ul>
                    {list.map((it) => (
                      <li key={it.key}>
                        <button className={`lib__item ${cur?.key === it.key ? 'is-on' : ''}`} onClick={() => pick(it)} aria-current={cur?.key === it.key ? 'page' : undefined}>
                          <span className="lib__title">{it.title}</span>
                          <span className="lib__sub">{day(it.at)}{it.pdf && <span className="lib__pdf">PDF</span>}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </nav>
          {cur && <DocPage key={cur.key} projectId={projectId} item={cur} onLink={onLink} />}
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
  const { autopilot } = useStore();
  const { data: u, error } = useApi<Usage>(`/projects/${projectId}/usage`);
  if (!u) return <Wait error={error} />;
  const max = Math.max(...u.byDay.map((d) => d.used), 1);
  const s = u.stats;
  return (
    <div>
      <p className="lead">
        Mesuré pour chaque lancement d’agent, sans estimation : <b>{fmtTokens(u.total.used)}</b> tokens en {u.total.runs} lancement{u.total.runs > 1 ? 's' : ''},
        plus {fmtTokens(u.total.cacheRead)} relus depuis le cache (environ 10 fois moins chers). Coût estimé {u.total.costUsd.toFixed(2)} $, pris sur votre abonnement.
      </p>
      <div className="box" style={{ marginTop: 16 }}>
        <div className="meter__head"><span>Budget du jour, tous projets</span><span className="num">{fmtTokens(autopilot.spentToday)} sur {fmtTokens(autopilot.dayBudget)}</span></div>
        <Bar value={autopilot.spentToday} max={autopilot.dayBudget} label="Budget du jour" thick />
        <p className="xsmall faint" style={{ marginTop: 10 }}>{autopilot.budgetHit ? 'Atteint : le pilote ne lance plus de ticket aujourd’hui.' : 'Une fois atteint, le pilote s’arrête et vous prévient.'}</p>
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}><table className="table">
        <thead><tr><th>Objectifs par jalon</th><th>Tokens par ticket</th><th>Validé du premier coup</th><th>Temps par ticket</th></tr></thead>
        <tbody>
          <tr><td><b>Mesuré</b> <span className="muted">{s.tickets} ticket{s.tickets > 1 ? 's' : ''} d’agent</span></td>
            <td className="num"><b>{s.tokensPerTicket === null ? '—' : fmtTokens(s.tokensPerTicket)}</b></td>
            <td className="num"><b>{s.firstTryPct === null ? '—' : `${s.firstTryPct} %`}</b></td>
            <td className="num"><b>{s.minutesPerTicket === null ? '—' : `${s.minutesPerTicket} min`}</b></td></tr>
          {MILESTONE_TARGETS.map((c) => (
            <tr key={c.id}><td><b>{c.id}</b> <span className="muted">{c.name}</span></td>
              <Target text={`${fmtTokens(c.tokensPerTicket)} au plus`} held={s.tokensPerTicket === null ? null : s.tokensPerTicket <= c.tokensPerTicket} />
              <Target text={`${c.firstTryPct} % au moins`} held={s.firstTryPct === null ? null : s.firstTryPct >= c.firstTryPct} />
              <Target text={`${c.minutesPerTicket} min au plus`} held={s.minutesPerTicket === null ? null : s.minutesPerTicket <= c.minutesPerTicket} /></tr>
          ))}
        </tbody>
      </table></div>
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
