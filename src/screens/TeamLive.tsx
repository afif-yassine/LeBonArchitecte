// Équipe réelle (décision 0019, lots E2 et E3) : les fiches de rôle du projet et ce que chaque rôle a vraiment fait.
// Un rôle ne crée pas d'agent en plus : il règle l'agent unique d'un ticket. Les chiffres viennent du journal.
import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Sparkles, X } from 'lucide-react';
import { useNotify } from '../components/notify';
import { fmtTokens } from '../components/ui';
import { useApi } from './RealSpaces';
import type { Go } from '../view';
import '../equipe.css';

interface Role {
  id: string; nom: string; mission: string; actif: boolean; modele?: 'Opus' | 'Sonnet' | 'Haiku';
  commandes?: string[]; mcp?: { config: string; outils: string[] }; ecrire?: string[]; mots?: string[]; budgetUsd?: number; web?: boolean;
}
interface Stat { tickets: number; finis: number; premierCoup: number; tokens: number; enCours: string[] }
interface EquipeData { roles: Role[]; source: 'fichier' | 'defaut'; stats: Record<string, Stat>; templates: Role[]; proposition: { roles: Role[]; why: string[] } | null }

const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

function RoleForm({ role, onSave, onCancel, busy }: { role: Role; onSave: (r: Role) => void; onCancel: () => void; busy: boolean }) {
  const [r, setR] = useState({
    nom: role.nom, mission: role.mission, modele: role.modele ?? '', mots: (role.mots ?? []).join(', '), ecrire: (role.ecrire ?? []).join('\n'),
    commandes: (role.commandes ?? []).join('\n'), mcpConfig: role.mcp?.config ?? '', mcpOutils: (role.mcp?.outils ?? []).join(', '), budget: role.budgetUsd?.toString() ?? '',
  });
  const set = (k: keyof typeof r) => (e: { target: { value: string } }) => setR({ ...r, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      ...role, nom: r.nom, mission: r.mission, modele: (r.modele || undefined) as Role['modele'], mots: lines(r.mots), ecrire: lines(r.ecrire), commandes: lines(r.commandes),
      mcp: r.mcpConfig.trim() ? { config: r.mcpConfig.trim(), outils: lines(r.mcpOutils) } : undefined, budgetUsd: r.budget.trim() ? Number(r.budget.replace(',', '.')) : undefined,
    });
  };
  const id = `role-${role.id}`;
  return (
    <form className="eq__form" onSubmit={submit}>
      <label htmlFor={`${id}-nom`}>Nom</label><input id={`${id}-nom`} value={r.nom} onChange={set('nom')} maxLength={40} />
      <label htmlFor={`${id}-modele`}>Modèle par défaut</label>
      <select id={`${id}-modele`} value={r.modele} onChange={set('modele')}><option value="">Celui du ticket</option><option>Opus</option><option>Sonnet</option><option>Haiku</option></select>
      <label htmlFor={`${id}-mission`}>Mission</label><textarea id={`${id}-mission`} value={r.mission} onChange={set('mission')} rows={2} maxLength={600} />
      <label htmlFor={`${id}-mots`}>Appelé quand le ticket parle de</label><input id={`${id}-mots`} value={r.mots} onChange={set('mots')} placeholder="docker, jenkins, déploiement" />
      <label htmlFor={`${id}-ecrire`}>Écrit seulement dans <span className="faint">(un par ligne ; vide = partout)</span></label><textarea id={`${id}-ecrire`} value={r.ecrire} onChange={set('ecrire')} rows={2} placeholder="deploy/&#10;Dockerfile" />
      <label htmlFor={`${id}-cmd`}>Commandes permises en plus <span className="faint">(une par ligne)</span></label><textarea id={`${id}-cmd`} value={r.commandes} onChange={set('commandes')} rows={2} placeholder="docker build *" />
      <label htmlFor={`${id}-mcp`}>MCP <span className="faint">(fichier .json du projet)</span></label><input id={`${id}-mcp`} value={r.mcpConfig} onChange={set('mcpConfig')} placeholder=".lba/mcp/images.json" />
      <label htmlFor={`${id}-outils`}>Outils MCP permis <span className="faint">(seulement eux sont chargés)</span></label><input id={`${id}-outils`} value={r.mcpOutils} onChange={set('mcpOutils')} placeholder="generate_image, upscale_image" />
      <label htmlFor={`${id}-budget`}>Budget par lancement ($)</label><input id={`${id}-budget`} value={r.budget} onChange={set('budget')} inputMode="decimal" placeholder="3" />
      <div className="eq__formacts">
        <button className="btn btn--primary btn--sm" disabled={busy || !r.nom.trim()}>Enregistrer</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Annuler</button>
      </div>
      <p className="xsmall faint eq__guard">Jamais permis, même écrit ici : git push, suppression, téléchargement, interpréteur (node, bash…), enchaînement de commandes, chemin hors du projet, Fable.</p>
    </form>
  );
}

export function TeamLive({ projectId, go }: { projectId: string; go: Go }) {
  const notify = useNotify();
  const { data, error } = useApi<EquipeData>(`/projects/${projectId}/equipe`);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (roles: Role[]) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/equipe`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ roles }) });
      const j = await r.json();
      notify(j.message ?? (r.ok ? 'Enregistré.' : 'Refusé.'));
      if (r.ok) setEditing(null);
      return r.ok;
    } catch { notify('Le moteur est arrêté : lancez « npm run dev ».'); return false; }
    finally { setBusy(false); }
  };
  if (error) return <div className="page"><p className="muted">{error}</p></div>;
  if (!data) return <div className="page"><h1>Équipe</h1><p className="muted">Lecture de l’équipe…</p></div>;
  const { roles, stats } = data;
  const replace = (r: Role) => roles.map((x) => (x.id === r.id ? r : x));

  return (
    <div className="page eq">
      <h1>Équipe</h1>
      <p className="lead">Chaque ticket a un rôle, trouvé par le programme d’après ses mots (0 token). Un rôle ne crée pas d’agent en plus : il règle l’agent unique du ticket (sa mission, ce qu’il peut faire, où il peut écrire, son budget). Les chiffres viennent du journal.</p>

      {data.proposition && (
        <section className="eq__prop" aria-label="Équipe proposée">
          <div className="eq__prophead"><Sparkles size={16} aria-hidden="true" /><strong>Équipe proposée pour ce projet</strong><span className="faint xsmall">par le programme, d’après ce qu’il contient : 0 token</span></div>
          <ul>{data.proposition.why.map((w) => <li key={w}>{w}</li>)}</ul>
          <div className="row">
            <button className="btn btn--primary btn--sm" disabled={busy} onClick={() => void save(data.proposition!.roles)}>Accepter cette équipe</button>
            <span className="xsmall faint">Pour l’adapter, demandez à l’Architecte, ou changez les fiches après.</span>
          </div>
        </section>
      )}

      <div className="eq__list">
        {roles.map((r) => {
          const s = stats[r.id];
          return (
            <section key={r.id} className={`eq__role ${r.actif ? '' : 'is-off'}`} aria-label={r.nom}>
              <header className="eq__head">
                <span className="eq__logo" aria-hidden="true">{r.nom.slice(0, 2)}</span>
                <div className="eq__name"><strong>{r.nom}</strong><span className="faint xsmall mono"> {r.id}</span>{!r.actif && <span className="faint xsmall"> : inactif</span>}</div>
                {r.modele && <span className="eq__chip">{r.modele}</span>}
                <div className="eq__acts">
                  {r.id !== 'developpeur' && (
                    <label className="eq__toggle"><input type="checkbox" checked={r.actif} disabled={busy} onChange={(e) => void save(replace({ ...r, actif: e.target.checked }))} />Actif</label>
                  )}
                  <button className="btn btn--ghost btn--icon" aria-label={`Modifier ${r.nom}`} disabled={busy} onClick={() => setEditing(editing === r.id ? null : r.id)}><Pencil size={14} /></button>
                  {r.id !== 'developpeur' && <button className="btn btn--ghost btn--icon" aria-label={`Retirer ${r.nom}`} disabled={busy} onClick={() => void save(roles.filter((x) => x.id !== r.id))}><X size={15} /></button>}
                </div>
              </header>
              {editing === r.id ? <RoleForm role={r} busy={busy} onCancel={() => setEditing(null)} onSave={(n) => void save(replace(n))} /> : (
                <>
                  <p className="eq__mission">{r.mission || <span className="faint">Pas de mission écrite.</span>}</p>
                  <dl className="eq__facts">
                    <div><dt>Appelé pour</dt><dd>{r.id === 'developpeur' ? 'tout ticket sans autre rôle' : r.mots?.length ? r.mots.join(', ') : 'seulement si on le choisit'}</dd></div>
                    <div><dt>Écrit dans</dt><dd>{r.ecrire?.length ? r.ecrire.join(', ') : 'tout le projet'}</dd></div>
                    {(r.commandes?.length || r.web) && <div><dt>En plus</dt><dd>{[...(r.web ? ['recherche web'] : []), ...(r.commandes ?? [])].join(', ')}</dd></div>}
                    {r.mcp && <div><dt>MCP</dt><dd>{r.mcp.config} : {r.mcp.outils.join(', ')}</dd></div>}
                    {r.budgetUsd !== undefined && <div><dt>Budget</dt><dd>{r.budgetUsd} $ par lancement</dd></div>}
                  </dl>
                  <div className="eq__stats" aria-label={`Ce que ${r.nom} a fait`}>
                    {s?.tickets ? (
                      <>
                        <span><b>{s.finis}</b> ticket{s.finis > 1 ? 's' : ''} fini{s.finis > 1 ? 's' : ''} sur {s.tickets}</span>
                        {s.finis > 0 && <span><b>{Math.round((s.premierCoup / s.finis) * 100)} %</b> validés du premier coup</span>}
                        <span><b>{fmtTokens(s.tokens)}</b> tokens</span>
                        {s.enCours.map((id) => <button key={id} className="link" onClick={() => go({ kind: 'ticket', ticketId: id })}>{id} en cours</button>)}
                      </>
                    ) : <span className="faint">Aucun ticket encore.</span>}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>

      {!!data.templates.length && (
        <section className="eq__add" aria-label="Ajouter un rôle">
          <h2>Ajouter un rôle</h2>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {data.templates.map((t) => (
              <button key={t.id} className="btn btn--sm" disabled={busy} title={t.mission} onClick={() => void save([...roles, { ...t, actif: true }])}><Plus size={14} />{t.nom}</button>
            ))}
          </div>
          <p className="xsmall faint">Un rôle ajouté est réglable ensuite (crayon). Son MCP éventuel : seulement les outils listés sont chargés, pour ne pas payer les autres.</p>
        </section>
      )}
      {data.source === 'defaut' && !data.proposition && <p className="xsmall faint">Équipe de base : aucun fichier .lba/equipe.json encore. Il sera créé à votre premier changement.</p>}
    </div>
  );
}
