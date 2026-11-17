import { useEffect, useRef } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { projects, tickets } from '../mock/data';
import { ESN_STEPS } from '../shared/contract';
import { SPACES, type View } from '../view';

interface Help { here: string; todo: string[] }

function helpFor(view: View, projectId: string): Help {
  const p = projects.find((x) => x.id === projectId)!;
  const step = ESN_STEPS.findIndex((s) => s.id === p.step);
  switch (view.kind) {
    case 'reglages':
      return { here: 'Vous êtes dans les réglages généraux.', todo: ['Connecter Claude Code ou Codex', 'Choisir l’ordre de bascule automatique', 'Régler l’apparence et les notifications'] };
    case 'ticket': {
      const t = tickets.find((x) => x.id === view.ticketId)!;
      return { here: `Vous êtes dans le ticket ${t.id}, ${t.title}.`, todo: ['Répondre à l’agent dans la conversation', 'Changer d’outil ou de modèle sans rien perdre', 'Lire le journal, les fichiers, le diff ou les tests'] };
    }
    case 'projet':
      return {
        here: `Vous êtes dans ${p.name}, ${SPACES.find((s) => s.id === view.space)?.label}, étape ${step + 1} ${ESN_STEPS[step].label}.`,
        todo: ['Tester T-14 puis le valider (tous les critères sont tenus)', 'Débloquer T-15 (clé SMS) dans « Pour vous »', 'Donner un ordre en bas : lance T-16, arrête T-13', 'Lire le compte rendu dans Documents'],
      };
  }
}

export function HelpSheet({ view, projectId, onClose }: { view: View; projectId: string; onClose: () => void }) {
  const h = helpFor(view, projectId);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <>
      <div className="overlay" style={{ background: 'transparent' }} onMouseDown={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div className="sheet__head">
          <div>
            <h1 id="help-title" style={{ fontSize: '1.3rem' }}>Que puis-je faire ici ?</h1>
            <p className="muted small">{h.here}</p>
          </div>
          <button ref={closeRef} className="btn btn--ghost btn--icon" onClick={onClose} aria-label="Fermer (Échap)"><X size={17} /></button>
        </div>

        <h2>Possible maintenant</h2>
        <ul className="todo">{h.todo.map((c) => <li key={c}><ArrowRight size={14} />{c}</li>)}</ul>

        <h2>Raccourcis</h2>
        <ul className="keys">
          <li>Commandes <span className="kbd">Ctrl K</span></li>
          <li>Nouveau ticket <span className="kbd">N</span></li>
          <li>Donner un ordre <span className="kbd">/</span></li>
          <li>Mode focus <span className="kbd">F</span></li>
          <li>Ce guide <span className="kbd">?</span></li>
          <li>Orchestrateur <span className="kbd">Ctrl .</span></li>
          <li>Travail, pour vous, connexions <span><span className="kbd">Alt 1</span> <span className="kbd">Alt 2</span> <span className="kbd">Alt 3</span></span></li>
        </ul>

        <h2>La vie d’un ticket</h2>
        <ol className="steps" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          <li>À faire : il attend que ses dépendances soient finies.</li>
          <li>En cours : un agent travaille sur sa propre branche.</li>
          <li>Action : il vous attend, avec la cause écrite.</li>
          <li>À tester : le programme a vérifié la définition de fini.</li>
          <li>Fini : votre accord réunit le travail dans main.</li>
        </ol>
      </aside>
    </>
  );
}
