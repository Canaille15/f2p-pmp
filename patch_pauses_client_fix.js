// Patch — Corrige le module api.pauses dans src/api/client.js pour qu'il
// appelle les VRAIES routes du backend (pausesController.js). L'ancien module
// appelait des routes inexistantes (POST /pauses/:id, PUT /pauses/:id/:date/fia)
// — ce qui explique pourquoi rien n'était jamais réellement sauvegardé côté
// serveur pour les pauses figées.
// Usage : node patch_pauses_client_fix.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'api', 'client.js');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = [
  'export const pauses = {',
  '  /** Pauses figées d\'un agent */',
  '  getAll: (agentId) => apiFetch(`/pauses/${agentId}`),',
  '',
  '  /** Ajouter une pause figée */',
  '  add: (agentId, date) =>',
  '    apiFetch(`/pauses/${agentId}`, {',
  '      method: \'POST\',',
  '      body: JSON.stringify({ date }),',
  '    }),',
  '',
  '  /** Supprimer une pause figée */',
  '  delete: (agentId, date) =>',
  '    apiFetch(`/pauses/${agentId}/${date}`, { method: \'DELETE\' }),',
  '',
  '  /** Mettre à jour le mois FIA d\'une pause */',
  '  setFiaMois: (agentId, date, moisKey) =>',
  '    apiFetch(`/pauses/${agentId}/${date}/fia`, {',
  '      method: \'PUT\',',
  '      body: JSON.stringify({ mois_fia: moisKey }),',
  '    }),',
  '};',
].join(NL);

const new1 = [
  'export const pauses = {',
  '  /** Pauses figées d\'un agent */',
  '  getAll: (agentId) => apiFetch(`/pauses/${agentId}`),',
  '',
  '  /** Ajouter une pause figée (crée la ligne en base, jour non pris en compte FIA par défaut) */',
  '  add: (agentId, date) =>',
  '    apiFetch(`/pauses/${agentId}/${date}`, {',
  '      method: \'PUT\',',
  '      body: JSON.stringify({}),',
  '    }),',
  '',
  '  /** Supprimer une pause figée */',
  '  delete: (agentId, date) =>',
  '    apiFetch(`/pauses/${agentId}/${date}`, { method: \'DELETE\' }),',
  '',
  '  /** Mettre à jour le mois FIA d\'une pause */',
  '  setFiaMois: (agentId, date, moisKey) =>',
  '    apiFetch(`/pauses/${agentId}/${date}`, {',
  '      method: \'PUT\',',
  '      body: JSON.stringify({ mois_fia: moisKey }),',
  '    }),',
  '',
  '  /** Marquer/démarquer une pause comme prise en compte FIA */',
  '  setFiaDone: (agentId, date, done) =>',
  '    apiFetch(`/pauses/${agentId}/${date}`, {',
  '      method: \'PUT\',',
  '      body: JSON.stringify({ fia_done: !!done }),',
  '    }),',
  '};',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'fix-module-pauses');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — client.js patché (module api.pauses corrigé sur les vraies routes backend)');
