import { useState } from 'react';
import { FolderGit2, Plus, X } from 'lucide-react';
import { projects } from '../mock/data';
import { TOOLS, type ToolId } from '../shared/contract';
import { LocalSwitch, Setting, Switch } from '../components/ui';
import { useNotify } from '../components/notify';
import { useStore } from '../store';

export function ProjectSettings({ projectId }: { projectId: string }) {
  const notify = useNotify();
  const { autopilot, setAutopilot } = useStore();
  const p = projects.find((x) => x.id === projectId)!;
  const [tool, setTool] = useState<ToolId>('claude-code');
  const [method, setMethod] = useState<'complete' | 'courte'>('complete');
  const [forbids, setForbids] = useState(['git push', 'git merge', 'rm -rf', '.env', '*.pem', '.github/workflows/']);
  const [newForbid, setNewForbid] = useState('');
  const saved = () => notify('Enregistré pour ce projet.');

  return (
    <div className="page settings">
      <h1>Paramètres de {p.name}</h1>
      <p className="lead">Ces réglages valent pour ce projet seulement. Les tickets peuvent toujours les changer un par un.</p>

      <div className="section setgroup">
        <h2>Général</h2>
        <Setting label="Nom du projet"><input className="input" defaultValue={p.name} onBlur={saved} /></Setting>
        <Setting label="Dossier" desc="Sans espace ni chemin trop long : évite les erreurs Windows."><span className="mono small muted">C:\Projets\{p.repo}</span></Setting>
        <Setting label="Projet privé" desc="Invisible des autres projets, de leurs agents et de leur mémoire."><LocalSwitch initial={p.private} label="Projet privé" onToggle={saved} /></Setting>
        <Setting label="Démarche" desc="Complète : les 6 étapes avec leurs portes. Courte : un ticket, un agent, sans cérémonie.">
          <div className="seg">
            <button aria-pressed={method === 'complete'} onClick={() => { setMethod('complete'); saved(); }}>Complète</button>
            <button aria-pressed={method === 'courte'} onClick={() => { setMethod('courte'); saved(); }}>Courte</button>
          </div>
        </Setting>
      </div>

      <div className="setgroup">
        <h2>Dépôts</h2>
        <p>Un projet peut avoir plusieurs dépôts. Chaque ticket travaille dans son propre espace (worktree).</p>
        <div className="box" style={{ padding: '4px 18px' }}>
          <Setting label={p.repo} desc="Branche principale : main. 0 branche oubliée."><span className="row"><FolderGit2 size={15} className="faint" /><span className="pill pill--ok">à jour</span></span></Setting>
        </div>
        <button className="btn btn--ghost btn--sm" style={{ marginTop: 8 }} onClick={() => notify('Maquette : ajouter un dépôt lance son scan gratuit (J1).')}><Plus size={14} />Ajouter un dépôt</button>
      </div>

      <div className="setgroup">
        <h2>Pilote automatique</h2>
        <p>Quand un ticket est fini, le suivant prêt dans la file démarre seul. Vous pouvez toujours lancer ou arrêter un ticket vous-même.</p>
        <Setting label="Activé"><Switch checked={autopilot.on} label="Pilote automatique" onChange={(v) => setAutopilot({ on: v })} /></Setting>
        <Setting label="Agents en même temps" desc="Réglé selon vos quotas. Plus d’agents = plus vite, mais plus de tokens.">
          <select value={autopilot.maxParallel} onChange={(e) => setAutopilot({ maxParallel: Number(e.target.value) })} aria-label="Agents en même temps"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select>
        </Setting>
        <Setting label="S’arrêter à la fin du lot" desc="Le pilote attend votre recette avant de commencer le lot suivant."><Switch checked={autopilot.stopAtLotEnd} label="Arrêt en fin de lot" onChange={(v) => setAutopilot({ stopAtLotEnd: v })} /></Setting>
        <Setting label="Respecter les budgets et quotas" desc="Toujours actif : aucun ticket ne démarre si le budget du jour ou un quota est dépassé."><span className="pill pill--accent">toujours</span></Setting>
      </div>

      <div className="setgroup">
        <h2>Agents par défaut</h2>
        <Setting label="Outil" desc="Utilisé quand un ticket n’en précise pas.">
          <select value={tool} onChange={(e) => { setTool(e.target.value as ToolId); saved(); }} aria-label="Outil par défaut">
            {(Object.keys(TOOLS) as ToolId[]).map((k) => <option key={k} value={k}>{TOOLS[k].label}</option>)}
          </select>
        </Setting>
        <Setting label="Choix du modèle" desc="Par règles : Haiku pour le simple, Sonnet par défaut, Opus pour la sécurité et l’architecture. Jamais Fable.">
          <select defaultValue="auto" onChange={saved} aria-label="Choix du modèle">
            <option value="auto">Automatique selon le risque</option>
            {TOOLS[tool].models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Setting>
        <Setting label="Sous-agents par ticket" desc="Interdits pour un travail que l’agent peut faire seul.">
          <select defaultValue="1" onChange={saved} aria-label="Sous-agents"><option value="0">Aucun</option><option value="1">1 au plus</option><option value="2">2 au plus</option></select>
        </Setting>
        <Setting label="Relances sur une même erreur" desc="Au-delà, le ticket passe en « Besoin d’action » avec la cause. Jamais de boucle aveugle.">
          <select defaultValue="1" onChange={saved} aria-label="Relances"><option value="0">Aucune</option><option value="1">1</option><option value="2">2</option></select>
        </Setting>
      </div>

      <div className="setgroup">
        <h2>Budgets</h2>
        <Setting label="Par ticket" desc="Dépassement : arrêt propre et « Besoin d’action »."><select defaultValue="40" onChange={saved} aria-label="Budget par ticket"><option value="20">20 k tokens</option><option value="40">40 k tokens</option><option value="100">100 k tokens</option></select></Setting>
        <Setting label="Par jour pour ce projet"><select defaultValue="200" onChange={saved} aria-label="Budget par jour"><option value="100">100 k tokens</option><option value="200">200 k tokens</option><option value="500">500 k tokens</option></select></Setting>
      </div>

      <div className="setgroup">
        <h2>Scans gratuits</h2>
        <p>Lancés avant toute IA, à l’ouverture du projet et à la fin de chaque ticket. 0 token.</p>
        <Setting label="Graphify" desc="Graphe du code et des documents. Les agents le lisent avant d’ouvrir un fichier."><LocalSwitch initial label="Graphify" onToggle={saved} /></Setting>
        <Setting label="Secrets (gitleaks)"><LocalSwitch initial label="gitleaks" onToggle={saved} /></Setting>
        <Setting label="Dépendances vulnérables (osv-scanner, npm audit)"><LocalSwitch initial label="osv-scanner" onToggle={saved} /></Setting>
        <Setting label="Failles dans le code (Semgrep)"><LocalSwitch initial label="Semgrep" onToggle={saved} /></Setting>
        <Setting label="Code dupliqué (jscpd)"><LocalSwitch initial={false} label="jscpd" onToggle={saved} /></Setting>
        <Setting label="Carte Floorplan" desc="Utilise l’IA, donc des tokens : seulement sur votre demande."><button className="btn btn--sm" onClick={() => notify('Maquette : Floorplan sera évalué en J1 avant d’être proposé.')}>Dessiner la carte</button></Setting>
      </div>

      <div className="setgroup">
        <h2>Skills actives</h2>
        {['Audit', 'Ticket', 'Tests', 'Sécurité', 'Compte rendu', 'Déploiement', 'Design'].map((s, i) => (
          <Setting key={s} label={s}><LocalSwitch initial={i < 5} label={s} onToggle={saved} /></Setting>
        ))}
      </div>

      <div className="setgroup">
        <h2>Interdits</h2>
        <p>Commandes et fichiers bloqués par le programme avant même d’être exécutés.</p>
        <div className="chipset" style={{ justifyContent: 'flex-start' }}>
          {forbids.map((f) => (
            <span key={f} className="chiprm">{f}<button aria-label={`Retirer ${f}`} onClick={() => setForbids((l) => l.filter((x) => x !== f))}><X size={12} /></button></span>
          ))}
        </div>
        <form className="row" style={{ marginTop: 10, maxWidth: 420 }} onSubmit={(e) => { e.preventDefault(); if (newForbid.trim()) { setForbids((l) => [...l, newForbid.trim()]); setNewForbid(''); saved(); } }}>
          <input className="input" style={{ flex: 1 }} placeholder="Ex. : prisma migrate reset" value={newForbid} onChange={(e) => setNewForbid(e.target.value)} aria-label="Nouvel interdit" />
          <button className="btn" type="submit">Ajouter</button>
        </form>
      </div>

      <div className="setgroup">
        <h2>Git</h2>
        <Setting label="Un espace de travail par ticket" desc="Chaque agent travaille sur sa branche, sans gêner les autres."><LocalSwitch initial label="Worktree par ticket" onToggle={saved} /></Setting>
        <Setting label="Réunir dans main" desc="Toujours sur votre accord. Le travail validé devient visible tout de suite."><span className="pill">sur votre accord</span></Setting>
        <Setting label="Liaison GitHub ou GitLab" desc="Facultative. Aucun push sans votre accord."><button className="btn btn--sm" onClick={() => notify('Maquette : liaison facultative (J5).')}>Lier</button></Setting>
      </div>
    </div>
  );
}
