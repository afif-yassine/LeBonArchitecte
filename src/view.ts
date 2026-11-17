import type { Space } from './shared/contract';

export type ProjectSpace = Space | 'parametres';
export type SettingsTab = 'connexions' | 'quotas' | 'securite' | 'apparence' | 'notifications';

// Chaque projet est un espace isolé : on est toujours dans un projet, ou dans les réglages généraux.
export type View =
  | { kind: 'projet'; projectId: string; space: ProjectSpace; ask?: string }
  | { kind: 'ticket'; ticketId: string }
  | { kind: 'reglages'; tab: SettingsTab };

export type Go = (v: View) => void;

// La structure d'un projet, organisée comme dans une ESN.
export const SPACE_GROUPS: { label: string; items: { id: ProjectSpace; label: string }[] }[] = [
  { label: 'Piloter', items: [{ id: 'architecte', label: 'Architecte' }, { id: 'flux', label: 'Flux de travail' }, { id: 'travail', label: 'Travail' }, { id: 'pour-vous', label: 'Pour vous' }] },
  { label: 'Construire', items: [{ id: 'cdc', label: 'Cahier des charges' }, { id: 'backlog', label: 'Backlog' }, { id: 'equipe', label: 'Équipe' }, { id: 'regles', label: 'Règles du projet' }] },
  { label: 'Suivre', items: [{ id: 'docs', label: 'Documents' }, { id: 'git', label: 'Git' }, { id: 'sante', label: 'Santé' }, { id: 'memoire', label: 'Mémoire et contexte' }] },
];

export const SPACES: { id: ProjectSpace; label: string }[] = [...SPACE_GROUPS.flatMap((g) => g.items), { id: 'parametres', label: 'Paramètres' }];
