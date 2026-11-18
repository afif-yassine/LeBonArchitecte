import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Activity, BookOpen, Brain, Check, ChevronsUpDown, Compass, FileStack, GitBranch, Hand, KanbanSquare, ListTree,
  Lock, MessagesSquare, ScrollText, PanelLeftClose, PanelLeftOpen, Plug, Plus, Route, Settings2, SlidersHorizontal, Users,
} from 'lucide-react';
import { branches, health, projects } from '../mock/data';
import { ESN_STEPS } from '../shared/contract';
import { useStore } from '../store';
import { SPACE_GROUPS, type Go, type ProjectSpace, type View } from '../view';
import { useNotify } from './notify';

const ICONS: Record<ProjectSpace, ReactNode> = {
  architecte: <MessagesSquare size={16} />, regles: <ScrollText size={16} />,
  flux: <Route size={16} />, travail: <KanbanSquare size={16} />, 'pour-vous': <Hand size={16} />,
  cdc: <BookOpen size={16} />, backlog: <ListTree size={16} />, equipe: <Users size={16} />,
  docs: <FileStack size={16} />, git: <GitBranch size={16} />, sante: <Activity size={16} />, memoire: <Brain size={16} />,
  parametres: <SlidersHorizontal size={16} />,
};

interface Props { view: View; go: Go; projectId: string; mini: boolean; toggleMini: () => void }

export function Sidebar({ view, go, projectId, mini, toggleMini }: Props) {
  const notify = useNotify();
  const { autopilot, tickets, actions, unreported, online } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const p = projects.find((x) => x.id === projectId)!;
  const space = view.kind === 'projet' ? view.space : view.kind === 'ticket' ? 'travail' : null;
  const run = tickets.filter((t) => t.projectId === projectId && t.status === 'en-cours').length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key); };
  }, [open]);

  const counts: Partial<Record<ProjectSpace, [number, string]>> = {
    'pour-vous': [actions(projectId).length, 'wait'],
    travail: [run, 'run'],
    docs: [unreported(projectId).length, ''],
    // Projet réel : pas de fausses pastilles (git et santé seront branchés plus tard).
    git: !projects.find((p) => p.id === projectId)?.demo ? [0, ''] : [branches.filter((b) => b.status === 'conflit' || b.status === 'a-reunir').length, ''],
    sante: !projects.find((p) => p.id === projectId)?.demo ? [0, ''] : [health.filter((h) => h.status === 'ouvert' && h.severity === 'grave').length, 'danger'],
  };

  return (
    <nav className="side" aria-label="Navigation du projet">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true"><Compass size={16} strokeWidth={2.2} /></span>
        <span className="brand__name">Le Bon Architecte</span>
        <button className="btn btn--ghost btn--icon btn--sm brand__toggle" onClick={toggleMini} aria-label={mini ? 'Déplier la barre' : 'Replier la barre'} title={mini ? 'Déplier' : 'Replier'}>
          {mini ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <div className="switcher" ref={ref}>
        <button className="switcher__btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Changer de projet">
          <span className="pdot pdot--lg" aria-hidden="true">{p.name[0].toUpperCase()}</span>
          <span className="switcher__text">
            <span className="switcher__name">{p.name}{p.private && <Lock size={11} className="faint" aria-label="privé" />}</span>
            <span className="switcher__sub">Étape {ESN_STEPS.findIndex((s) => s.id === p.step) + 1}, {ESN_STEPS.find((s) => s.id === p.step)!.label}</span>
          </span>
          <ChevronsUpDown size={15} className="faint switcher__chev" />
        </button>
        {open && (
          <div className="switcher__menu" role="listbox" aria-label="Projets">
            {projects.map((x) => {
              const n = actions(x.id).length;
              return (
                <button key={x.id} role="option" aria-selected={x.id === projectId} className="switcher__item"
                  onClick={() => { setOpen(false); go({ kind: 'projet', projectId: x.id, space: 'travail' }); }}>
                  <span className="pdot" aria-hidden="true">{x.name[0].toUpperCase()}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="switcher__name">{x.name}{x.private && <Lock size={11} className="faint" />}{x.demo && <span className="tag">exemple</span>}</span>
                    <span className="switcher__sub">{ESN_STEPS.find((s) => s.id === x.step)!.label}{n > 0 ? `, ${n} action${n > 1 ? 's' : ''} pour vous` : ''}</span>
                  </span>
                  {x.id === projectId && <Check size={15} style={{ color: 'var(--accent)' }} />}
                </button>
              );
            })}
            <div className="switcher__sep" />
            <button className="switcher__item" onClick={() => { setOpen(false); notify('Nouveau projet : importer, cloner ou partir d’un modèle. Le scan gratuit passe d’abord (J1).'); }}>
              <span className="pdot" aria-hidden="true"><Plus size={12} /></span><span>Nouveau projet</span>
            </button>
          </div>
        )}
      </div>

      {SPACE_GROUPS.map((g) => (
        <div key={g.label}>
          <div className="side__label">{g.label}</div>
          {g.items.map((s) => {
            const c = counts[s.id];
            return (
              <button key={s.id} className="nav" aria-current={space === s.id ? 'page' : undefined} onClick={() => go({ kind: 'projet', projectId, space: s.id })} title={s.label}>
                {ICONS[s.id]}<span className="nav__text">{s.label}</span>
                {c && c[0] > 0 && (c[1] === 'run' ? <span className="live" aria-label={`${c[0]} en cours`} /> : <span className={`nav__count ${c[1] ? `nav__count--${c[1]}` : ''}`}>{c[0]}</span>)}
              </button>
            );
          })}
        </div>
      ))}
      <button className="nav" style={{ marginTop: 6 }} aria-current={space === 'parametres' ? 'page' : undefined} onClick={() => go({ kind: 'projet', projectId, space: 'parametres' })} title="Paramètres du projet">
        {ICONS.parametres}<span className="nav__text">Paramètres du projet</span>
      </button>

      <div className="side__spacer" />

      <div className="side__foot">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="strong">Pilote automatique</span>
          {autopilot.on && autopilot.budgetHit
            ? <span className="pill pill--dot pill--wait">budget atteint</span>
            : <span className={`pill pill--dot ${autopilot.on ? 'pill--accent' : ''}`}>{autopilot.on ? 'actif' : 'coupé'}</span>}
        </div>
        <div className="faint" style={{ marginTop: 4 }}>{run} sur {autopilot.maxParallel} agents au travail.</div>
        <div className="engine-state" style={{ color: online ? 'var(--ok)' : 'var(--danger)' }}>
          <span className="sdot" style={{ background: 'currentColor' }} />{online ? 'Moteur connecté' : 'Moteur arrêté'}
        </div>
      </div>
      <button className="nav" aria-current={view.kind === 'reglages' && view.tab === 'connexions' ? 'page' : undefined} onClick={() => go({ kind: 'reglages', tab: 'connexions' })} title="Connexions et quotas">
        <Plug size={16} /><span className="nav__text">Connexions et quotas</span>
      </button>
      <button className="nav" aria-current={view.kind === 'reglages' && view.tab !== 'connexions' ? 'page' : undefined} onClick={() => go({ kind: 'reglages', tab: 'apparence' })} title="Réglages">
        <Settings2 size={16} /><span className="nav__text">Réglages</span>
      </button>
    </nav>
  );
}
