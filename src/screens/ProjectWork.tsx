// Cahier des charges, comptes rendus, Git et santé du travail d'un projet.
import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileCheck2, FileClock, FileImage, FileText, FolderGit2, FolderOpen, GitBranch, GitMerge, History,
  Info, RotateCcw, ShieldCheck, Upload, Wrench,
} from 'lucide-react';
import { branches, cdcFiles, cdcFolder, commits, health as initialHealth, incidents, requirements, worktrees } from '../mock/data';
import type { GitCommit } from '../shared/contract';
import { Tabs, fmtTokens } from '../components/ui';
import { useNotify } from '../components/notify';
import { useStore } from '../store';
import type { Go } from '../view';

// ---------------- Cahier des charges ----------------
export function Cdc({ go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { tickets } = useStore();
  const status = (ids: string[]) => {
    if (ids.length === 0) return 'aucun';
    const st = ids.map((id) => tickets.find((t) => t.id === id)?.status);
    if (st.every((s) => s === 'termine')) return 'fait';
    return 'encours';
  };
  const counts = { fait: 0, encours: 0, aucun: 0 };
  requirements.forEach((r) => { counts[status(r.tickets)]++; });
  const n = requirements.length;

  return (
    <div className="page">
      <h1>Cahier des charges</h1>
      <p className="lead">La source de vérité du projet. Chaque ticket est relié à une exigence, et chaque agent reçoit les exigences de son ticket.</p>

      <div className="folder" style={{ marginTop: 24 }}>
        <span className="folder__icon"><FolderOpen size={19} /></span>
        <div style={{ flex: 1 }}>
          <div className="strong mono">{cdcFolder}</div>
          <div className="small muted">Déposez ici le cahier des charges, les maquettes et les annexes. Le programme les relit à chaque changement.</div>
        </div>
        <button className="btn" onClick={() => notify('Maquette : le fichier est copié dans le dossier, puis l’Analyste met à jour les exigences.')}><Upload size={15} />Ajouter un fichier</button>
      </div>
      <div className="box box--flush" style={{ marginTop: 10 }}>
        {cdcFiles.map((f) => (
          <div key={f.name} className="fileline">
            {f.kind === 'image' ? <FileImage size={16} /> : <FileText size={16} />}
            <span className="mono" style={{ flex: 1 }}>{f.name}</span>
            <span className="xsmall faint">{f.size}</span>
            <span className="xsmall faint" style={{ width: 90, textAlign: 'right' }}>modifié le {f.updated}</span>
          </div>
        ))}
      </div>

      <section className="section">
        <div className="section__head"><h2>Couverture des exigences</h2><span className="small muted num">{n} exigences</span></div>
        <div className="coverage" role="img" aria-label={`${counts.fait} faites, ${counts.encours} en cours, ${counts.aucun} sans ticket`}>
          <span style={{ width: `${(counts.fait / n) * 100}%`, background: 'var(--ok)' }} />
          <span style={{ width: `${(counts.encours / n) * 100}%`, background: 'var(--accent-fill)' }} />
          <span style={{ width: `${(counts.aucun / n) * 100}%`, background: 'var(--wait)' }} />
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--ok)' }} />{counts.fait} faites</span>
          <span><i style={{ background: 'var(--accent-fill)' }} />{counts.encours} en cours</span>
          <span><i style={{ background: 'var(--wait)' }} />{counts.aucun} sans ticket</span>
        </div>
        <div className="box box--flush" style={{ marginTop: 16 }}>
          {requirements.map((r) => {
            const s = status(r.tickets);
            return (
              <div key={r.id} className="req">
                <span className="req__id">{r.id}</span>
                <div><div>{r.text}</div><div className="req__sec">{r.section}</div></div>
                <div className="row" style={{ justifyContent: 'flex-end', gap: 5 }}>
                  {r.tickets.map((id) => <button key={id} className="tag" style={{ cursor: 'pointer' }} onClick={() => go({ kind: 'ticket', ticketId: id })}>{id}</button>)}
                  {s === 'aucun' && <button className="btn btn--sm" onClick={() => notify(`Maquette : l’Analyste propose un ticket pour ${r.id}, doublons vérifiés.`)}>Créer le ticket</button>}
                  {s === 'fait' && <CheckCircle2 size={16} style={{ color: 'var(--ok)' }} aria-label="faite" />}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// ---------------- Comptes rendus ----------------
export function Reports({ projectId, go }: { projectId: string; go: Go }) {
  const { reports, unreported, writeReport, tickets } = useStore();
  const pending = unreported(projectId);
  const projReports = reports.filter((r) => r.tickets.some((id) => tickets.find((t) => t.id === id)?.projectId === projectId));

  return (
    <div className="report">
      <p className="muted">Écrits par le programme à partir des tickets, 0 token. L’IA ajoute au plus 5 lignes. Un ticket réalisé n’est jamais rapporté deux fois, ni oublié.</p>

      <section className="section" style={{ marginTop: 24 }}>
        <div className="section__head">
          <h2>Prochain compte rendu</h2>
          <button className="btn btn--primary" onClick={() => writeReport(projectId)} disabled={pending.length === 0}>Écrire le compte rendu</button>
        </div>
        {pending.length === 0 ? (
          <div className="empty"><h3>Tout est déjà rapporté</h3><p>Les prochains tickets réalisés apparaîtront ici automatiquement.</p></div>
        ) : (
          <div className="box box--flush">
            {pending.map((t) => (
              <div key={t.id} className="fileline">
                <FileClock size={16} style={{ color: 'var(--wait)' }} />
                <button className="link" onClick={() => go({ kind: 'ticket', ticketId: t.id })}>{t.id}</button>
                <span style={{ flex: 1 }}>{t.title}<span className="faint small"> {t.realized?.summary ?? ''}</span></span>
                <span className={`pill ${t.status === 'termine' ? 'pill--ok' : 'pill--accent'}`}>{t.status === 'termine' ? 'fini' : 'à tester'}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <h2>Déjà écrits</h2>
        {projReports.map((r) => (
          <div key={r.id} className="box">
            <div className="report__head">
              <h3 style={{ flex: 1 }}>{r.id}, {r.date}</h3>
              <span className="xsmall faint num">{fmtTokens(r.tokens)} tokens ce jour-là</span>
            </div>
            <dl className="facts">
              <dt>Fait</dt><dd>{r.done.join(', ')}</dd>
              <dt>En cours</dt><dd>{r.inProgress.join(', ') || 'Rien'}</dd>
              {r.blocked.length > 0 && <><dt>Bloqué</dt><dd>{r.blocked.join(', ')}</dd></>}
              <dt>Vous attend</dt><dd>{r.waiting.join(', ')}</dd>
              <dt>Tickets</dt><dd className="row" style={{ gap: 5 }}>{r.tickets.map((id) => <span key={id} className="tag"><FileCheck2 size={11} />{id}</span>)}</dd>
            </dl>
            {r.aiNote && <p className="small muted" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>Note de l’IA : {r.aiNote}</p>}
          </div>
        ))}
      </section>
    </div>
  );
}

// ---------------- Git ----------------
const BR_LABEL = { principale: ['principale', 'accent'], 'en-cours': ['en cours', ''], 'a-reunir': ['à réunir', 'ok'], reunie: ['réunie', ''], conflit: ['conflit', 'danger'], orpheline: ['oubliée', 'wait'] } as const;

export function Git({ go }: { go: Go }) {
  const notify = useNotify();
  const [confirm, setConfirm] = useState<GitCommit | null>(null);

  return (
    <div className="page">
      <h1>Git</h1>
      <p className="lead">Une branche par ticket. Le travail validé est réuni dans main tout de suite. Avant chaque réunion, un point de retour est créé.</p>

      <section className="section" style={{ marginTop: 28 }}>
        <h2>Branches</h2>
        <div className="box box--flush">
          <table className="table">
            <thead><tr><th>Branche</th><th>Ticket</th><th>État</th><th className="num">Avance / retard</th><th>Dernier commit</th><th /></tr></thead>
            <tbody>
              {branches.map((b) => {
                const [label, tone] = BR_LABEL[b.status];
                return (
                  <tr key={b.name}>
                    <td><span className="flag" style={{ color: 'var(--text-strong)' }}><GitBranch size={14} /><span className="mono">{b.name}</span></span></td>
                    <td>{b.ticket ? <button className="link" onClick={() => go({ kind: 'ticket', ticketId: b.ticket! })}>{b.ticket}</button> : <span className="faint">—</span>}</td>
                    <td><span className={`pill ${tone ? `pill--${tone}` : ''}`}>{label}</span></td>
                    <td className="num muted">+{b.ahead} / −{b.behind}</td>
                    <td className="small muted">{b.lastCommit}<div className="xsmall faint">{b.at}</div></td>
                    <td className="num">
                      {b.status === 'a-reunir' && <button className="btn btn--sm btn--primary" onClick={() => notify(`Maquette : point de retour créé, puis ${b.name} réunie dans main sur votre accord.`)}><GitMerge size={13} />Réunir</button>}
                      {b.status === 'conflit' && <button className="btn btn--sm" onClick={() => notify('Maquette : l’agent du ticket reçoit les 2 fichiers en conflit et propose une résolution, que vous validez.')}><Wrench size={13} />Résoudre</button>}
                      {b.status === 'orpheline' && <button className="btn btn--sm" onClick={() => notify('Branche nettoyée. Rien n’est perdu : tout est dans main.')}>Nettoyer</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Espaces de travail (worktrees)</h2><span className="small muted">Un dossier par ticket : deux agents ne se gênent jamais</span></div>
        <div className="box box--flush">
          <table className="table">
            <thead><tr><th>Dossier</th><th>Branche</th><th>Ticket et agent</th><th>État</th><th className="num">Taille</th><th /></tr></thead>
            <tbody>
              {worktrees.map((w) => (
                <tr key={w.path}>
                  <td><span className="flag" style={{ color: 'var(--text-strong)' }}><FolderGit2 size={14} /><span className="mono">{w.path}</span></span></td>
                  <td className="mono small muted">{w.branch}</td>
                  <td>{w.ticket && <button className="link" onClick={() => go({ kind: 'ticket', ticketId: w.ticket! })}>{w.ticket}</button>}<span className="faint small">{w.agent ? ` ${w.agent}` : ' sans agent'}</span></td>
                  <td><span className={`pill ${w.state === 'actif' ? 'pill--accent pill--dot' : w.state === 'orphelin' ? 'pill--wait' : ''}`}>{w.state === 'actif' ? 'en travail' : w.state === 'orphelin' ? 'oublié' : 'propre'}</span></td>
                  <td className="num muted">{w.size}</td>
                  <td className="num">{w.state !== 'actif' && <button className="btn btn--sm" onClick={() => notify(`Espace ${w.path} supprimé (${w.size} libérés). La branche reste dans Git.`)}>Nettoyer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section">
        <div className="section__head"><h2>Historique de main</h2><span className="small muted">Chaque réunion a son point de retour</span></div>
        <div className="box">
          <ol className="commits">
            {commits.map((c, i) => (
              <li key={c.sha} className="commit">
                <span className="commit__dot" aria-hidden="true" />
                <div>
                  <div className="commit__msg">{c.message}</div>
                  <div className="commit__meta"><span className="mono">{c.sha}</span><span>{c.at}</span>{c.restorePoint && <span className="tag"><History size={11} />{c.restorePoint}</span>}{i === 0 && <span className="pill pill--accent">version actuelle</span>}</div>
                </div>
                {i > 0 && <button className="btn btn--sm" onClick={() => setConfirm(c)}><RotateCcw size={13} />Revenir ici</button>}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {confirm && (
        <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="rb-title">
            <h2 id="rb-title">Revenir à « {confirm.message} » ?</h2>
            <p className="muted">Ce qui sera fait, dans l’ordre :</p>
            <ol className="steps" style={{ margin: '12px 0 18px' }}>
              <li>Un point de retour « avant-retour » est créé sur la version actuelle.</li>
              <li>Les changements faits après {confirm.sha} sont annulés par un nouveau commit (git revert). L’historique n’est pas effacé.</li>
              <li>Les tickets concernés repassent « À tester » avec la cause écrite.</li>
            </ol>
            <p className="flag flag--ok" style={{ marginBottom: 18 }}><ShieldCheck size={15} />Réversible : vous pouvez revenir à la version actuelle à tout moment.</p>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn--ghost" onClick={() => setConfirm(null)}>Annuler</button>
              <button className="btn btn--primary" onClick={() => { setConfirm(null); notify(`Maquette : retour à ${confirm.sha} fait par git revert. Point de retour « avant-retour » créé.`); }}>Oui, revenir ici</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Santé : audit du fonctionnement ----------------
const SEV_ICON = { grave: AlertTriangle, attention: AlertTriangle, info: Info };

export function Health({ go }: { go: Go }) {
  const notify = useNotify();
  const [list, setList] = useState(initialHealth);
  const [tab, setTab] = useState<'controles' | 'incidents'>('controles');
  const open = list.filter((h) => h.status === 'ouvert');
  const fix = (id: string, label: string) => { setList((l) => l.map((h) => (h.id === id ? { ...h, status: 'resolu' } : h))); notify(`« ${label} » : fait par une recette connue, 0 token.`); };

  return (
    <div className="page">
      <h1>Santé du travail</h1>
      <p className="lead">L’audit permanent de la façon dont l’équipe travaille : tokens, compactages, boucles, sessions, Git, disque. Calculé par le programme, sans IA.</p>

      <div className="healthbar" style={{ margin: '26px 0 30px' }}>
        <div className="hcard"><div className="hcard__v">{open.filter((h) => h.severity === 'grave').length}</div><div className="hcard__l">problème grave</div><div className="hcard__s" style={{ color: 'var(--danger)' }}>compactage sans retour</div></div>
        <div className="hcard"><div className="hcard__v">9 k</div><div className="hcard__l">tokens par ticket, moyenne</div><div className="hcard__s" style={{ color: 'var(--wait)' }}>T-13 à 28 k</div></div>
        <div className="hcard"><div className="hcard__v">5 / 6</div><div className="hcard__l">compactages revenus</div><div className="hcard__s faint">1 en attente depuis 6 min</div></div>
        <div className="hcard"><div className="hcard__v">1,2</div><div className="hcard__l">boucles par ticket</div><div className="hcard__s" style={{ color: 'var(--ok)' }}>0 boucle aveugle</div></div>
      </div>

      <Tabs label="Santé" value={tab} onChange={setTab} tabs={[{ id: 'controles', label: `Contrôles (${open.length} à traiter)` }, { id: 'incidents', label: `Incidents (${incidents.filter((i) => i.status === 'ouvert').length} ouvert)` }]} />

      {tab === 'controles' && (
        <div className="box box--flush">
          {list.map((h) => {
            const Icon = h.status === 'resolu' ? CheckCircle2 : SEV_ICON[h.severity];
            return (
              <div key={h.id} className="check-item">
                <span className={`sev-ic sev-ic--${h.status === 'resolu' ? 'ok' : h.severity}`}><Icon size={15} /></span>
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="strong">{h.title}</span>
                    <span className="tag">{h.area}</span>
                    {h.status === 'resolu' && <span className="pill pill--ok">{h.auto ? 'réparé seul' : 'résolu'}</span>}
                  </div>
                  <dl className="facts">
                    <dt>Cause</dt><dd>{h.cause}</dd>
                    <dt>Preuve</dt><dd className="muted">{h.proof}</dd>
                    <dt>Solution</dt><dd>{h.fix}</dd>
                  </dl>
                </div>
                <div>{h.status === 'ouvert' && h.fixLabel && <button className={`btn btn--sm ${h.severity === 'grave' ? 'btn--primary' : ''}`} onClick={() => fix(h.id, h.fixLabel!)}>{h.fixLabel}</button>}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'incidents' && incidents.map((inc) => (
        <div key={inc.id} className="incident">
          <div className="row">
            <span className="strong">{inc.id}</span><span className="strong" style={{ fontWeight: 500 }}>{inc.title}</span>
            <span className={`pill ${inc.status === 'ouvert' ? 'pill--danger' : 'pill--ok'}`} style={{ marginLeft: 'auto' }}>{inc.status === 'ouvert' ? 'ouvert' : 'résolu'}</span>
          </div>
          <div className="xsmall faint" style={{ marginTop: 2 }}>Ouvert le {inc.opened}{inc.ticket && <> sur <button className="link" onClick={() => go({ kind: 'ticket', ticketId: inc.ticket! })}>{inc.ticket}</button></>}</div>
          <ol className="tl">{inc.timeline.map((e, i) => <li key={i}><span>{e.at}</span><span>{e.text}</span></li>)}</ol>
          {inc.resolution && <p className="small" style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}><strong>Résolution :</strong> {inc.resolution}</p>}
          {inc.status === 'ouvert' && <div className="row" style={{ marginTop: 12 }}><button className="btn btn--primary btn--sm" onClick={() => notify('Session neuve lancée pour agent-13 avec sa passation. INC-4 sera fermé au premier retour.')}>Relancer en session neuve</button><button className="btn btn--sm" onClick={() => notify('Incident marqué résolu par vous.')}>Marquer résolu</button></div>}
        </div>
      ))}
    </div>
  );
}
