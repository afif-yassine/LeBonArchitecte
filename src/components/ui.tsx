import { useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { ESN_STEPS, TOOLS, type AgentState, type EsnStep, type ToolId } from '../shared/contract';

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`;
  if (n >= 1000) return `${Math.round(n / 1000)} k`;
  return String(n);
}

export const toolLabel = (t: ToolId) => TOOLS[t].label;
export const toolShort = (t: ToolId) => TOOLS[t].short;

export const STATE: Record<AgentState, { label: string; tone: string }> = {
  travaille: { label: 'Travaille', tone: 'accent' },
  tests: { label: 'Lance les tests', tone: 'accent' },
  attend: { label: 'Attend votre réponse', tone: 'wait' },
  bloque: { label: 'Bloqué', tone: 'danger' },
  fini: { label: 'Fini', tone: 'ok' },
  erreur: { label: 'Erreur', tone: 'danger' },
  'en-pause': { label: 'En pause', tone: '' },
};

export function StatePill({ state }: { state: AgentState }) {
  const s = STATE[state];
  return <span className={`pill pill--dot ${s.tone ? `pill--${s.tone}` : ''}`}>{s.label}</span>;
}

export function Bar({ value, max = 100, label, thick, tone }: { value: number; max?: number; label: string; thick?: boolean; tone?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  const auto = tone ?? (pct >= 90 ? 'danger' : pct >= 75 ? 'wait' : '');
  return (
    <div className={`bar ${thick ? 'bar--thick' : ''} ${auto ? `bar--${auto}` : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

// Les 6 étapes de la démarche ESN, numérotées : c'est une vraie séquence.
export function Frise({ step }: { step: EsnStep }) {
  const idx = ESN_STEPS.findIndex((s) => s.id === step);
  return (
    <ol className="frise" aria-label={`Étapes du projet. Étape actuelle : ${ESN_STEPS[idx].label}`}>
      {ESN_STEPS.map((s, i) => {
        const state = i < idx ? 'fait' : i === idx ? 'actuel' : 'futur';
        return (
          <li key={s.id} style={{ display: 'contents' }}>
            {i > 0 && <span className={`frise__line ${i <= idx ? 'is-done' : ''}`} aria-hidden="true" />}
            <span className={`frise__step is-${state}`} aria-current={i === idx ? 'step' : undefined} title={s.question}>
              <span className="frise__num">{i < idx ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
              <span className="frise__label">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function StepBadge({ step }: { step: EsnStep }) {
  const i = ESN_STEPS.findIndex((s) => s.id === step);
  return <span className="stepbadge"><span className="frise__num">{i + 1}</span>{ESN_STEPS[i].label}</span>;
}

export function CopyCommand({ command }: { command: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* presse-papiers refusé : la commande reste lisible */ }
  };
  return (
    <div className="cmd">
      <code>{command}</code>
      <button className="btn btn--ghost btn--icon" onClick={copy} aria-label={done ? 'Commande copiée' : 'Copier la commande'} title="Copier">
        {done ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Setting({ label, desc, children }: { label: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div className="setting__label">{label}</div>
        {desc && <div className="setting__desc">{desc}</div>}
      </div>
      <div className="setting__control">{children}</div>
    </div>
  );
}

// Interrupteur avec état local : pratique pour la maquette.
export function LocalSwitch({ initial, label, onToggle }: { initial: boolean; label: string; onToggle?: (v: boolean) => void }) {
  const [v, setV] = useState(initial);
  return <Switch checked={v} label={label} onChange={(n) => { setV(n); onToggle?.(n); }} />;
}

export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} className="tab" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}
