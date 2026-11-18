// Bandeau d'état en haut de la fiche d'un ticket : en une phrase, ce qui se passe et ce qu'on attend de vous.
// Les étapes d'une validation (ou de tests) s'y affichent pendant qu'elles se font, et l'erreur y reste écrite.
import { AlertTriangle, Check, CircleDot, Loader2, Pause, Play, RotateCcw, Wrench, X } from 'lucide-react';
import { useState } from 'react';
import type { Ticket, TicketActivity } from '../shared/contract';
import { unverifiedClaims } from '../shared/claims';
import '../ticket-status.css';

type Tone = 'run' | 'ok' | 'wait' | 'danger' | 'calm';

function Steps({ a }: { a: TicketActivity }) {
  return (
    <ol className="ts__steps" aria-label={`Étapes : ${a.label}`}>
      {a.steps.map((s) => (
        <li key={s.label} className={`ts__step is-${s.state}`}>
          <span className="ts__ico" aria-hidden="true">
            {s.state === 'ok' ? <Check size={13} strokeWidth={3} /> : s.state === 'echec' ? <X size={13} strokeWidth={3} /> : s.state === 'en-cours' ? <Loader2 size={13} className="spin" /> : <CircleDot size={12} />}
          </span>
          <span className="ts__label">{s.label}</span>
          {s.detail && <span className="ts__detail">{s.detail}</span>}
          <span className="sr-only">{s.state === 'ok' ? ' : fait' : s.state === 'echec' ? ' : en échec' : s.state === 'en-cours' ? ' : en cours' : ' : en attente'}</span>
        </li>
      ))}
    </ol>
  );
}

export function TicketStatus({ t, busy, ready, onValidate, onReject, onFix, onPause, onResume, onLaunch, onLook }: {
  t: Ticket; busy: boolean; ready: boolean;
  onValidate: () => void; onReject: () => void; onFix: () => void; onPause: () => void; onResume: () => void; onLaunch: () => void; onLook: () => void;
}) {
  const a = t.activity;
  const unverified = t.status === 'a-tester' ? unverifiedClaims(t.realized?.summary) : [];
  const [sure, setSure] = useState(false);
  const running = a?.steps.some((s) => s.state === 'en-cours') || busy;
  const proven = t.steps.filter((s) => s.state === 'prouve').length;
  const current = t.steps.find((s) => s.state !== 'prouve');

  let tone: Tone = 'calm';
  let title = '';
  let text: string | undefined;
  let actions: React.ReactNode = null;

  if (running) {
    tone = 'run';
    title = a?.label === 'Tests' ? 'Tests en cours…' : 'Validation en cours…';
    text = 'Le programme travaille : chaque étape s’affiche ici dès qu’elle est faite. Rien à faire pour l’instant.';
  } else if (t.status === 'action') {
    tone = 'danger';
    title = t.interrupted ? 'Travail interrompu : à reprendre' : 'Besoin de vous';
    text = t.needAction;
    actions = (<>
      {t.interrupted
        ? <button className="btn btn--primary btn--sm" onClick={onResume}><RotateCcw size={14} />Reprendre</button>
        : <button className="btn btn--primary btn--sm" onClick={onFix} title="L’agent qui a fait le travail reprend sa conversation avec cette cause, résout et repasse les tests"><Wrench size={14} />Demander à l’agent de résoudre</button>}
      <button className="btn btn--sm" onClick={onLook}>Voir le déroulé</button>
    </>);
  } else if (a?.error && t.status === 'a-tester') {
    tone = 'danger';
    title = a.fixable ? 'Validation refusée' : 'Validation refusée : à régler de votre côté';
    text = a.error;
    actions = <button className="btn btn--sm" onClick={onValidate}><Check size={14} />Réessayer de valider</button>;
  } else if (t.status === 'en-cours') {
    tone = 'run';
    title = 'L’agent travaille';
    text = current ? `Étape ${proven + 1} sur ${t.steps.length} : ${current.label}` : 'Toutes les étapes sont prouvées : le programme vérifie la fin.';
    actions = <button className="btn btn--sm" onClick={onPause} title="Son travail et sa conversation sont gardés"><Pause size={14} />Pause</button>;
  } else if (t.status === 'a-tester') {
    tone = unverified.length ? 'wait' : 'ok';
    title = unverified.length ? `Prêt à tester, mais l’agent signale ${unverified.length} point${unverified.length > 1 ? 's' : ''} non vérifié${unverified.length > 1 ? 's' : ''}` : 'Prêt à tester';
    text = `${proven} étape${proven > 1 ? 's' : ''} sur ${t.steps.length} prouvée${proven > 1 ? 's' : ''} par le programme. Valider relance les tests, réunit dans main, puis reteste main.`;
    // Points non vérifiés : premier clic = « Valider quand même ? », deuxième clic = valider.
    actions = (<>
      {unverified.length && !sure
        ? <button className="btn btn--sm" onClick={() => setSure(true)}><Check size={14} />Valider</button>
        : <button className="btn btn--primary btn--sm" onClick={onValidate}><Check size={14} />{unverified.length ? 'Valider quand même' : 'Valider'}</button>}
      <button className="btn btn--sm" onClick={onReject}><X size={14} />Ça ne marche pas</button>
    </>);
  } else if (t.status === 'termine') {
    tone = 'ok';
    title = 'Fini : réuni dans main';
  } else if (t.paused) {
    tone = 'wait';
    title = 'En pause';
    text = 'Le pilote ne le lance pas. Son travail et sa conversation sont gardés.';
    actions = <button className="btn btn--primary btn--sm" onClick={onResume}><Play size={14} />Reprendre</button>;
  } else {
    tone = 'calm';
    title = !t.planOk ? 'Plan à valider' : !ready ? `Attend ${t.deps.join(', ')}` : 'Prêt, en file';
    text = !t.planOk ? 'Le pilote ne lance que les plans validés.' : !ready ? 'Il partira dès que ces tickets seront finis.' : 'Le pilote le lancera dès qu’une place se libère.';
    actions = <button className="btn btn--sm" onClick={onLaunch}><Play size={14} />Lancer maintenant</button>;
  }

  return (
    <section className={`ts is-${tone}`} aria-live="polite" aria-label="État du ticket">
      <div className="ts__head">
        <span className="ts__badge" aria-hidden="true">
          {tone === 'run' ? <Loader2 size={16} className="spin" /> : tone === 'danger' ? <AlertTriangle size={16} /> : tone === 'ok' ? <Check size={16} strokeWidth={3} /> : tone === 'wait' ? <Pause size={15} /> : <CircleDot size={15} />}
        </span>
        <div className="ts__text">
          <h2 className="ts__title">{title}</h2>
          {text && <p className="ts__sub">{text}</p>}
        </div>
        {actions && <div className="ts__acts">{actions}</div>}
      </div>
      {a && a.steps.length > 0 && <Steps a={a} />}
      {unverified.length > 0 && (
        <div className="ts__warn">
          <p>{sure ? 'Vous validez sans que ces points soient vérifiés. Regardez-les vous-même ou cliquez « Ça ne marche pas » pour les faire vérifier :' : 'Écrit par l’agent dans son résumé, à regarder avant de valider :'}</p>
          <ul>{unverified.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
