import { useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'clair' | 'sombre';
export type Ambiance = 'ardoise' | 'papier' | 'brume';

export const AMBIANCES: { id: Ambiance; label: string; desc: string }[] = [
  { id: 'ardoise', label: 'Ardoise', desc: 'Bleu ardoise, accent lagon, police Geist. Net et calme.' },
  { id: 'papier', label: 'Papier', desc: 'Papier et encre, accent bleu encre, police IBM Plex. Angles nets, esprit bureau d’études.' },
  { id: 'brume', label: 'Brume', desc: 'Gris brume, accent lilas, police Manrope. Formes arrondies, très doux.' },
];

export interface Settings {
  theme: ThemeChoice;
  ambiance: Ambiance;
  scale: number;
  density: 'aeree' | 'compacte';
  nightFilter: boolean;
  motion: boolean;
}

const DEFAULTS: Settings = { theme: 'auto', ambiance: 'ardoise', scale: 1, density: 'aeree', nightFilter: true, motion: true };
const KEY = 'lba.reglages.v2';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// Automatique selon l'heure : clair de 7 h à 19 h, sombre le reste du temps.
export function resolveTheme(choice: ThemeChoice, hour: number): 'clair' | 'sombre' {
  if (choice !== 'auto') return choice;
  return hour >= 7 && hour < 19 ? 'clair' : 'sombre';
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* stockage indisponible : on garde en mémoire */ }
  }, [settings]);

  const theme = resolveTheme(settings.theme, hour);
  const night = settings.nightFilter && (hour >= 20 || hour < 7);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = theme;
    r.dataset.amb = settings.ambiance;
    r.dataset.density = settings.density;
    r.dataset.motion = settings.motion ? 'on' : 'off';
    r.dataset.night = night ? 'on' : 'off';
    r.style.setProperty('--scale', String(settings.scale));
    const bg = getComputedStyle(r).getPropertyValue('--side').trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [theme, settings, night]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  return { settings, update, theme, night };
}
