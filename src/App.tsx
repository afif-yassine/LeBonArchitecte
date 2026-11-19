import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ChevronRight, CircleHelp, Focus, Lock, Moon, PanelRightOpen, Search, Sun } from 'lucide-react';
import { projects } from './mock/data';
import { RealDocs, RealRules } from './screens/RealSpaces';
import { CahierScreen } from './screens/Cahier'; // cahier des charges réel (point 2)
import { GitGraphScreen } from './screens/GitGraph'; // Git en schéma (point 3)
import { Soon } from './components/ui';

import { NOT_PLUGGED } from './shared/screens';
import { SPACES, type Go, type View } from './view';
import { useSettings } from './settings';
import { StoreProvider, useStore } from './store';
import { NotifyProvider, useNotify } from './components/notify';
import { Sidebar } from './components/Sidebar';
import { CommandPalette, type Command } from './components/CommandPalette';
import { CommandBar } from './components/CommandBar';
import { LaunchDialog } from './components/LaunchDialog';
import { OrchestratorPanel } from './components/OrchestratorPanel';
import { HelpSheet } from './components/HelpSheet';
import { QuotaChip } from './components/Comptes';
import { Frise } from './components/ui';
import { ProjectBoard } from './screens/ProjectBoard';
import { TicketView } from './screens/TicketView';
import { Actions } from './screens/Actions';
import { Flow } from './screens/Flow';
import { Cdc, Git, Health } from './screens/ProjectWork';
import { Backlog, Documents, Team } from './screens/ProjectSpaces';
import { Architect } from './screens/Architect';
import { ArchitectLive } from './screens/ArchitectLive';
import { BacklogLive } from './screens/BacklogLive';
import { MemoryContext, Rules } from './screens/Knowledge';
import { ProjectSettings } from './screens/ProjectSettings';
import { SettingsScreen } from './screens/Settings';

const TAB_LABEL = { connexions: 'Comptes et quotas', quotas: 'Quotas et budgets', securite: 'Sécurité', apparence: 'Apparence', notifications: 'Notifications' } as const;

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
};

function ProjectHeader({ projectId }: { projectId: string }) {
  const p = projects.find((x) => x.id === projectId)!;
  return (
    <div className="projhead">
      <div className="projhead__top">
        <div style={{ minWidth: 0 }}>
          <div className="projhead__title">{p.name}{p.private && <Lock size={15} className="faint" aria-label="privé" />}</div>
          <div className="projhead__sum">{p.summary}</div>
        </div>
        <div className="projhead__right" style={{ width: 'min(560px, 50%)' }}><Frise step={p.step} /></div>
      </div>
    </div>
  );
}

function Shell() {
  const notify = useNotify();
  const { tickets, actions, online } = useStore();
  const { settings, update, theme } = useSettings();
  const [view, setView] = useState<View>({ kind: 'projet', projectId: 'lba', space: 'travail' });
  const [projectId, setProjectId] = useState('lba');
  const [panel, setPanel] = useState(true);
  const [mini, setMini] = useState(false);
  const [focus, setFocus] = useState(false);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const waiting = actions(projectId).length;

  const go: Go = useCallback((v) => {
    setView(v);
    if (v.kind === 'projet') setProjectId(v.projectId);
    if (v.kind === 'ticket') { const t = tickets.find((x) => x.id === v.ticketId); if (t) setProjectId(t.projectId); }
    document.getElementById('content')?.scrollTo({ top: 0 });
  }, [tickets]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && k === 'k') { e.preventDefault(); setPalette(true); return; }
      if (mod && k === '.') { e.preventDefault(); setPanel((v) => !v); return; }
      if (e.altKey && k === '1') { e.preventDefault(); go({ kind: 'projet', projectId, space: 'travail' }); return; }
      if (e.altKey && k === '2') { e.preventDefault(); go({ kind: 'projet', projectId, space: 'pour-vous' }); return; }
      if (e.altKey && k === '3') { e.preventDefault(); go({ kind: 'reglages', tab: 'connexions' }); return; }
      if (e.key === 'Escape') { setHelp(false); setFocus(false); return; }
      if (mod || e.altKey || isTyping(e) || palette) return;
      if (e.key === '?' || e.key === 'F1') { e.preventDefault(); setHelp((v) => !v); }
      else if (k === 'f') setFocus((v) => !v);
      else if (k === 'n') notify('Nouveau ticket : le programme vérifie d’abord les doublons (J2).');
      else if (k === '/') {
        e.preventDefault();
        const el = (document.getElementById('cmdbar') ?? document.getElementById('arch-input')) as HTMLInputElement | null;
        if (el) { el.focus(); if (!el.value) { el.value = ''; } }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, notify, palette, projectId]);

  const commands = useMemo<Command[]>(() => [
    ...SPACES.map((s) => ({ id: `s-${s.id}`, group: 'Aller à', label: s.label, run: () => go({ kind: 'projet', projectId, space: s.id }) })),
    { id: 'cnx', group: 'Aller à', label: 'Connexions Claude et Codex', hint: 'Alt 3', run: () => go({ kind: 'reglages', tab: 'connexions' }) },
    { id: 'n-t', group: 'Agir', label: 'Nouveau ticket (vérifie les doublons)', hint: 'N', run: () => notify('Le programme vérifie les doublons avant de créer le ticket (J2).') },
    { id: 'audit', group: 'Agir', label: 'Lancer l’audit du projet', run: () => notify('Maquette : scan gratuit, puis un seul agent remplit les grilles (J4).') },
    { id: 'ordre', group: 'Agir', label: 'Donner un ordre', hint: '/', run: () => setTimeout(() => document.getElementById('cmdbar')?.focus(), 0) },
    ...projects.map((p) => ({ id: `p-${p.id}`, group: 'Changer de projet', label: p.name, run: () => go({ kind: 'projet', projectId: p.id, space: 'travail' }) })),
    ...tickets.filter((t) => t.projectId === projectId).map((t) => ({ id: `t-${t.id}`, group: 'Ticket', label: `${t.id} ${t.title}`, run: () => go({ kind: 'ticket', ticketId: t.id }) })),
    { id: 'amb', group: 'Affichage', label: 'Changer d’ambiance', run: () => go({ kind: 'reglages', tab: 'apparence' }) },
    { id: 'focus', group: 'Affichage', label: 'Mode focus', hint: 'F', run: () => setFocus(true) },
    { id: 'th-c', group: 'Affichage', label: 'Thème clair', run: () => update({ theme: 'clair' }) },
    { id: 'th-s', group: 'Affichage', label: 'Thème sombre', run: () => update({ theme: 'sombre' }) },
  ], [go, notify, projectId, update, tickets]);

  const crumbs = (() => {
    const sep = (k: string) => <span key={k} className="crumbs__sep" aria-hidden="true"><ChevronRight size={14} /></span>;
    const cur = (k: string, t: string) => <span key={k} aria-current="page">{t}</span>;
    if (view.kind === 'reglages') return [<span key="r" style={{ padding: '3px 6px' }}>Réglages</span>, sep('1'), cur('c', TAB_LABEL[view.tab])];
    const p = projects.find((x) => x.id === projectId)!;
    const pBtn = <button key="p" onClick={() => go({ kind: 'projet', projectId: p.id, space: 'travail' })}>{p.name}</button>;
    if (view.kind === 'projet') return [pBtn, sep('1'), cur('c', SPACES.find((s) => s.id === view.space)!.label)];
    const t = tickets.find((x) => x.id === view.ticketId)!;
    return [pBtn, sep('1'), <button key="w" onClick={() => go({ kind: 'projet', projectId: p.id, space: 'travail' })}>Travail</button>, sep('2'), cur('c', t.id)];
  })();

  const projectScreen = (pid: string, space: string) => {
    // Vrai projet : jamais de données d'exemple. Onglet branché = vraies données ; sinon on le dit.
    if (!projects.find((p) => p.id === pid)?.demo) {
      switch (space) {
        case 'cdc': return <CahierScreen projectId={pid} go={go} />;
        case 'docs': return <RealDocs projectId={pid} title="Documents" exclude="docs/cahier-des-charges/" lead="Décisions, rapports, recherches et journal du projet. Un PDF s’ouvre dans un nouvel onglet. Le cahier des charges a son propre onglet." />;
        case 'regles': return <RealRules projectId={pid} />;
        case 'git': return <GitGraphScreen projectId={pid} go={go} />;
        case 'backlog': return <BacklogLive projectId={pid} go={go} />;
        case 'architecte': return <ArchitectLive key={`${pid}-${view.kind === 'projet' ? view.ask ?? '' : ''}`} projectId={pid} go={go} ask={view.kind === 'projet' ? view.ask : undefined} />;
      }
      const later = NOT_PLUGGED[space];
      if (later) return <div className="page"><Soon title="Pas encore branché sur ce projet" text={later} /></div>;
    }
    switch (space) {
      case 'architecte': return <Architect key={`${pid}-${view.kind === 'projet' ? view.ask ?? '' : ''}`} projectId={pid} go={go} ask={view.kind === 'projet' ? view.ask : undefined} />;
      case 'regles': return <Rules />;
      case 'flux': return <Flow projectId={pid} go={go} />;
      case 'travail': return <ProjectBoard key={pid} projectId={pid} go={go} />;
      case 'pour-vous': return <Actions key={pid} projectId={pid} go={go} />;
      case 'cdc': return <Cdc projectId={pid} go={go} />;
      case 'backlog': return <Backlog go={go} />;
      case 'equipe': return <Team projectId={pid} go={go} />;
      case 'docs': return <Documents projectId={pid} go={go} />;
      case 'git': return <Git go={go} />;
      case 'sante': return <Health go={go} />;
      case 'memoire': return <MemoryContext go={go} />;
      default: return <ProjectSettings key={pid} projectId={pid} />;
    }
  };

  const screen = view.kind === 'ticket'
    ? <TicketView key={view.ticketId} ticketId={view.ticketId} go={go} />
    : view.kind === 'reglages'
      ? <SettingsScreen tab={view.tab} go={go} settings={settings} update={update} />
      : projectScreen(view.projectId, view.space);

  const showHeader = view.kind === 'projet' && view.space === 'travail';
  const showAsk = view.kind !== 'reglages' && !(view.kind === 'projet' && view.space === 'architecte');

  return (
    <div className={`app ${focus ? 'focus' : !panel ? 'no-panel' : ''} ${mini ? 'side-mini' : ''}`}>
      {!focus && <Sidebar view={view} go={go} projectId={projectId} mini={mini} toggleMini={() => setMini((v) => !v)} />}
      <main className="canvas">
        {!focus && (
          <header className="topbar">
            <nav className="crumbs" aria-label="Fil d’Ariane">{crumbs}</nav>
            <div className="topbar__right">
              <button className="search" onClick={() => setPalette(true)} aria-label="Commandes (Ctrl+K)">
                <Search size={15} /><span className="search__text">Chercher ou aller à</span><span className="kbd">Ctrl K</span>
              </button>
              {online && <QuotaChip onOpen={() => go({ kind: 'reglages', tab: 'connexions' })} />}
              <button className="btn btn--ghost btn--icon bell" onClick={() => go({ kind: 'projet', projectId, space: 'pour-vous' })} aria-label={`${waiting} actions pour vous dans ce projet`} title="Pour vous">
                <Bell size={17} />{waiting > 0 && <span className="bell__count" aria-hidden="true">{waiting}</span>}
              </button>
              <button className="btn btn--ghost btn--icon" onClick={() => update({ theme: theme === 'sombre' ? 'clair' : 'sombre' })} aria-label={theme === 'sombre' ? 'Passer au thème clair' : 'Passer au thème sombre'} title="Clair ou sombre">
                {theme === 'sombre' ? <Moon size={17} /> : <Sun size={17} />}
              </button>
              <button className="btn btn--ghost btn--icon" onClick={() => setHelp(true)} aria-label="Que puis-je faire ici ? (?)" title="Que puis-je faire ici ? (?)"><CircleHelp size={17} /></button>
              <button className="btn btn--ghost btn--icon" onClick={() => setFocus(true)} aria-label="Mode focus (F)" title="Mode focus (F)"><Focus size={17} /></button>
              {!panel && <button className="btn btn--ghost btn--icon" onClick={() => setPanel(true)} aria-label="Ouvrir l’orchestrateur (Ctrl+.)" title="Orchestrateur (Ctrl+.)"><PanelRightOpen size={17} /></button>}
            </div>
          </header>
        )}
        {!online && (
          <div className="offline" role="status">
            <strong>Moteur arrêté.</strong> L’écran montre des données de démonstration, en lecture seule. Pour agir, lancez <code>npm run dev</code> dans le dossier du projet.
          </div>
        )}
        {showHeader && <ProjectHeader projectId={projectId} />}
        <div className="content" id="content">{screen}</div>
        {showAsk && <CommandBar onAsk={(text) => go({ kind: 'projet', projectId, space: 'architecte', ask: text })} />}
      </main>
      {!focus && panel && <OrchestratorPanel onClose={() => setPanel(false)} go={go} projectId={projectId} />}
      {focus && <button className="btn focus-exit" onClick={() => setFocus(false)}>Quitter le mode focus <span className="kbd">Échap</span></button>}
      {palette && <CommandPalette commands={commands} onClose={() => setPalette(false)} onLaunch={(id) => setLaunching(id)} />}
      {help && <HelpSheet view={view} projectId={projectId} onClose={() => setHelp(false)} />}
      {launching && <LaunchDialog ticketId={launching} onClose={() => setLaunching(null)} />}
    </div>
  );
}

export default function App() {
  return <NotifyProvider><StoreProvider><Shell /></StoreProvider></NotifyProvider>;
}
