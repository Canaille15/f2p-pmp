// Patch 3/5 — Annuaire : ajoute le module api.annuaire dans src/api/client.js
// Usage : node patch_annuaire_3_client_module.js
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

// ── 1. Insertion du module annuaire avant l'export principal ──
const anchorExport = "// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────";

const newModule = [
  "// ─── MODULE ANNUAIRE ──────────────────────────────────────────────────────────",
  "",
  "export const annuaire = {",
  "  /** Agents visibles dans l'annuaire (tel/email déchiffrés, filtrés sur annuaire_visible) */",
  "  getAgents: () => apiFetch('/annuaire/agents'),",
  "",
  "  /** Fiches Encadrants (par fonction) */",
  "  getEncadrants: () => apiFetch('/annuaire/encadrants'),",
  "  createEncadrant: (data) =>",
  "    apiFetch('/annuaire/encadrants', { method: 'POST', body: JSON.stringify(data) }),",
  "  updateEncadrant: (id, data) =>",
  "    apiFetch(`/annuaire/encadrants/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),",
  "  deleteEncadrant: (id) =>",
  "    apiFetch(`/annuaire/encadrants/${id}`, { method: 'DELETE' }),",
  "",
  "  /** Accès rapide (ex: Astreinte) */",
  "  getAccesRapide: () => apiFetch('/annuaire/acces-rapide'),",
  "  createAccesRapide: (data) =>",
  "    apiFetch('/annuaire/acces-rapide', { method: 'POST', body: JSON.stringify(data) }),",
  "  updateAccesRapide: (id, data) =>",
  "    apiFetch(`/annuaire/acces-rapide/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),",
  "  deleteAccesRapide: (id) =>",
  "    apiFetch(`/annuaire/acces-rapide/${id}`, { method: 'DELETE' }),",
  "",
  "  /** Activer/désactiver sa propre visibilité dans l'annuaire */",
  "  setVisible: (cp, visible) =>",
  "    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify({ annuaire_visible: visible ? 1 : 0 }) }),",
  "",
  "  /** Mettre à jour ses propres email/téléphone (réutilise la route agents existante) */",
  "  updateMesCoordonnees: (cp, data) =>",
  "    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify(data) }),",
  "};",
  "",
  anchorExport,
].join(NL);

content = mustReplaceOnce(content, anchorExport, newModule, 'insert-annuaire-module');

// ── 2. Ajout de "annuaire," dans l'objet api final ──
const oldApiEnd = `  journeeSpecialeNotes,${NL}};`;
const newApiEnd = `  journeeSpecialeNotes,${NL}  annuaire,${NL}};`;
content = mustReplaceOnce(content, oldApiEnd, newApiEnd, 'add-annuaire-to-api-object');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — client.js patché (module api.annuaire ajouté)');
