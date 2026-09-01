// Service worker volontairement vide de toute stratégie de cache -- présent
// uniquement pour satisfaire le critère d'installabilité de Chrome/Android
// (qui exige un fetch handler enregistré). Chaque requête part directement
// au réseau, sans jamais servir une réponse mise en cache : aucun risque
// qu'un agent reste bloqué sur une ancienne version de l'appli après un
// déploiement.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
