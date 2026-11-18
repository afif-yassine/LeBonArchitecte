// Cibles chiffrées par jalon (règle 2 du cahier des charges : chaque jalon est mesuré).
// Recopiées dans docs/JOURNAL.md ; un test vérifie que les deux restent identiques.
export interface MilestoneTarget { id: string; name: string; tokensPerTicket: number; firstTryPct: number; minutesPerTicket: number }

export const MILESTONE_TARGETS: MilestoneTarget[] = [
  { id: 'J2', name: 'Moteur', tokensPerTicket: 60_000, firstTryPct: 60, minutesPerTicket: 45 },
  { id: 'J3', name: 'Agents', tokensPerTicket: 50_000, firstTryPct: 70, minutesPerTicket: 30 },
  { id: 'J4', name: 'Orchestrateur et démarche', tokensPerTicket: 40_000, firstTryPct: 80, minutesPerTicket: 20 },
];

// Ce que le programme mesure, à comparer aux cibles. null : encore rien à mesurer.
export interface MilestoneStats { tickets: number; tokensPerTicket: number | null; firstTryPct: number | null; minutesPerTicket: number | null }
