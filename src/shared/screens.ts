// Écrans pas encore branchés sur les vraies données : ce qu'il manque, en clair (au lieu de faux contenu).
// Partagé par l'écran (message « pas encore branché ») et par l'état du projet donné à l'Architecte
// (décision 0018) : il n'a pas besoin de chercher dans le code lesquels sont des maquettes.
export const NOT_PLUGGED: Record<string, string> = {
  flux: 'Le schéma du flux de travail sera tiré des vrais tickets et de leurs dépendances (lot 2).',
  equipe: 'L’équipe montrera les rôles configurés et les agents qui tournent vraiment (lot 2).',
  sante: 'La santé montrera les vrais résultats des tests, de la compilation et les bugs du direct (lot 2).',
  memoire: 'La mémoire partagée n’est pas encore construite : elle suivra la stratégie choisie au cadrage (rapport LBA-10).',
};
