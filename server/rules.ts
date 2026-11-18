// Règles de l'orchestrateur (décision 0004). Fonctions pures, 0 token, testées dans rules.test.ts.
import type { Ticket } from '../src/shared/contract.ts';
import { RESEARCH } from '../src/shared/plan.ts';

export interface PilotSettings { on: boolean; maxParallel: number; stopAtLotEnd: boolean; respectBudget: boolean }

// Définition de fini : tous les critères tenus, toutes les étapes prouvées, tous les contrôles verts.
export function checkDone(t: Ticket): { ok: boolean; missing: string[] } {
  const missing = [
    ...t.criteria.filter((c) => !c.done).map((c) => `critère « ${c.text} »`),
    ...(t.steps ?? []).filter((s) => s.state !== 'prouve').map((s) => `étape « ${s.label} » non prouvée`),
    ...t.done.filter((d) => d.state !== 'ok').map((d) => d.label.toLowerCase()),
  ];
  return { ok: missing.length === 0, missing };
}

export const isReady = (t: Ticket, all: Ticket[]) => t.deps.every((d) => all.find((x) => x.id === d)?.status === 'termine');

export const running = (all: Ticket[], project: string) => all.filter((t) => t.projectId === project && t.status === 'en-cours');

// Prochain ticket à lancer par le pilote : prêt, du même lot si demandé, par priorité.
export function nextReady(all: Ticket[], project: string, s: PilotSettings, lot?: number): Ticket | undefined {
  if (!s.on || running(all, project).length >= s.maxParallel) return undefined;
  return all
    .filter((t) => t.projectId === project && t.status === 'a-faire' && t.planOk && isReady(t, all))
    .filter((t) => !s.stopAtLotEnd || lot === undefined || t.lot === lot)
    .sort((a, b) => a.priority - b.priority)[0];
}

// Même erreur deux fois de suite : on arrête, jamais de boucle aveugle.
export function sameErrorTwice(errors: string[]): boolean {
  const n = errors.length;
  return n >= 2 && errors[n - 1].trim() === errors[n - 2].trim();
}

// Choix du modèle par règles. Jamais Fable.
const RISKY = /sécurité|securite|paiement|stripe|base de données|prisma|migration|architecture|auth|déploiement|deploiement/i;
const IMPORTANT = /architecture|cahier des charges|audit|cadrage|backlog|conception|stratégie|refonte|migration/i;
const SIMPLE = /texte|traduction|style|couleur|faute|libellé|page à propos|note de version|documentation/i;

export function pickModel(t: Ticket, failedBefore = false): { model: string; reason: string } {
  const text = `${t.title} ${t.part} ${t.description.expected}`;
  let level = 1; // 0 Haiku, 1 Sonnet, 2 Opus
  let reason = 'Fonctionnalité normale.';
  const research = t.steps?.some((s) => s.role === 'eclaireur');
  if (RISKY.test(text) || t.files.length > 8) { level = 2; reason = 'Sujet à risque (sécurité, paiement, données ou architecture) ou plus de 8 fichiers.'; }
  // Décision 0007 : architecture et tâches importantes sur le modèle le plus fort, effort haut.
  // Refaire un travail mal fait coûte plus cher que les tokens économisés.
  else if (IMPORTANT.test(text) && !research) { level = 2; reason = 'Tâche importante (architecture, cahier des charges, audit, cadrage) : modèle le plus fort pour ne pas avoir à refaire.'; }
  else if (SIMPLE.test(text) && t.files.length <= 2) { level = 0; reason = 'Tâche simple : texte, style ou petit correctif.'; }
  // Recherche : surtout de la lecture, Haiku suffit et use beaucoup moins le quota (mesure LBA-10, 18 nov.).
  else if (research) { level = 0; reason = 'Recherche : lecture et synthèse, Haiku suffit.'; }
  if (failedBefore && level < 2) { level += 1; reason += ' Un cran au-dessus après un échec.'; }
  if (t.tool === 'codex') return { model: level === 0 ? 'gpt-codex-mini' : 'gpt-codex', reason };
  return { model: ['Haiku', 'Sonnet', 'Opus'][level], reason };
}

// Mode de travail : « direct » (un seul appel sans outils, contexte préparé par le programme)
// pour les tâches simples de texte ; « agent » (explore, code, teste) pour le reste.
// Mesuré : un agent pour un README = 71 770 tokens ; le plancher d'un appel direct ≈ 4 300.
export function pickMode(t: Ticket): 'direct' | 'agent' {
  const text = `${t.title} ${t.part} ${t.description.expected}`;
  // Une recherche a besoin du web : jamais en mode direct.
  return SIMPLE.test(text) && !RISKY.test(text) && !RESEARCH.test(text) && t.files.length <= 2 ? 'direct' : 'agent';
}

// Bascule d'outil quand le quota 5 h dépasse le seuil de la fiche du projet.
export const mustSwitch = (quota5h: number, threshold = 90) => quota5h >= threshold;

// Contexte : compactage une seule fois à 85 % du plafond, ensuite session neuve.
export function contextAction(tokens: number, ceiling: number, alreadyCompacted: boolean): 'rien' | 'compacter' | 'session-neuve' {
  if (tokens < ceiling * 0.85) return 'rien';
  return alreadyCompacted ? 'session-neuve' : 'compacter';
}
