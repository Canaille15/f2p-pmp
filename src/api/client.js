// ─── F2P.PMP — API REST Client ────────────────────────────────────────────────
// Remplace tous les appels Supabase (sbFetch) par des appels à l'API Node.js/Express
// Fichier : src/api/client.js
//
// Usage :
//   import api from './api/client';
//   const { token, agent } = await api.auth.login('6810186B', '17444');
//   const agents = await api.agents.getAll();
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── TOKEN JWT ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'f2ppmp_jwt';

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (token) => {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  },
};

// ─── FETCH DE BASE ────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = tokenStore.get();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers || {}),
  };

  const res = await fetch(`${API_BASE}/api${path}`, {
    ...opts,
    headers,
  });

  // 401 sur une requete authentifiee (token deja present) → session expiree,
  // on nettoie et on redirige vers login. Un 401 SANS token deja envoye (ex:
  // tentative de connexion avec un mauvais PIN) n'est pas une session expiree
  // mais une erreur de connexion normale — geree par l'appelant (LoginPage),
  // pas de deconnexion forcee ni d'alerte bloquante dans ce cas.
  //
  // Cas supplementaire (17/07, trouve en debuggant des sauvegardes qui
  // echouaient silencieusement) : le token peut disparaitre de localStorage
  // (vide, onglet ancien, quota depasse...) alors que l'agent croit toujours
  // etre connecte (f2ppmp_currentUser encore present). Dans ce cas, apiFetch
  // envoie la requete SANS Authorization, le serveur repond 401 "Token
  // manquant", mais token est null donc l'ancienne condition ne se declenchait
  // JAMAIS — l'erreur remontait silencieusement jusqu'a un .catch(()=>{})
  // quelque part dans l'appli (ex: sauvegarde de couleur, validation d'une
  // pause figee...) sans que rien ne soit visible pour l'agent : l'action
  // semblait avoir echoue sans message, et au rechargement suivant la vraie
  // valeur serveur (jamais mise a jour) ecrasait ce qui avait ete saisi.
  let etaitConnecte = false;
  try { etaitConnecte = !!localStorage.getItem('f2ppmp_currentUser'); } catch {}
  if (res.status === 401 && (token || etaitConnecte)) {
    tokenStore.clear();
    // Déclencher un event custom pour que l'app redirige vers login
    window.dispatchEvent(new CustomEvent('f2ppmp:unauthorized'));
    throw new Error('Session expirée — reconnectez-vous');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Erreur ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return null;

  return res.json();
}

// ─── MODULE AUTH ──────────────────────────────────────────────────────────────

export const auth = {
  /**
   * Connexion agent
   * @param {string} cp  — Code Personnel (ex: "6810186B")
   * @param {string} pin — PIN 4 chiffres
   * @returns {{ token: string, agent: object }}
   */
  async login(cp, pin) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ cp, pin }),
    });
    if (data.token) tokenStore.set(data.token);
    return data;
  },

  /**
   * Première connexion — crée le PIN d'un compte qui n'en a pas encore
   * @param {string} cp
   * @param {string} pin — PIN choisi et confirmé côté frontend
   * @returns {{ token: string, agent: object }}
   */
  async register(cp, pin) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ cp, pin }),
    });
    if (data.token) tokenStore.set(data.token);
    return data;
  },

  /**
   * Déconnexion — vide le token local
   */
  logout() {
    tokenStore.clear();
  },

  /**
   * Vérifie si un token est présent (ne valide pas côté serveur)
   */
  isLoggedIn() {
    return !!tokenStore.get();
  },

  /**
   * Récupère le profil de l'agent connecté depuis le token
   * (décode le JWT sans vérification de signature — pour affichage uniquement)
   */
  getCurrentAgentFromToken() {
    const token = tokenStore.get();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload;
    } catch {
      return null;
    }
  },

  /**
   * Changer son propre PIN (necessite de connaitre le PIN actuel)
   */
  async changePin(pinActuel, pinNouveau) {
    return apiFetch('/auth/change-pin', {
      method: 'POST',
      body: JSON.stringify({ pin_actuel: pinActuel, pin_nouveau: pinNouveau }),
    });
  },
};

// ─── MODULE AGENTS ────────────────────────────────────────────────────────────

export const agents = {
  /** Tous les agents */
  getAll: () => apiFetch('/agents'),

  /** Un agent par ID */
  getById: (id) => apiFetch(`/agents/${id}`),

  /**
   * Créer un agent (admin)
   * @param {{ prenom, nom, grade, poste, famille, cp }} data
   */
  create: (data) =>
    apiFetch('/agents', { method: 'POST', body: JSON.stringify(data) }),

  /**
   * Mettre à jour un agent (admin)
   */
  update: (id, data) =>
    apiFetch(`/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  /**
   * Supprimer un agent (admin)
   */
  delete: (id) =>
    apiFetch(`/agents/${id}`, { method: 'DELETE' }),
  /**
   * Activer/desactiver le partage du planning perso vers le Planning Previsionnel
   */
  setPartagePrevisionnel: (cp, actif) =>
    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify({ partage_previsionnel: actif }) }),

  resetPin: (cp, newPin) =>
    apiFetch(`/profil/${cp}/pin`, { method: 'PUT', body: JSON.stringify({ pin: newPin }) }),
};

// ─── MODULE PLANNING ─────────────────────────────────────────────────────────

const MAPPING_3X8 = {
  CCL:  { M: "PICCL-", AM: "PICCLO", N: "PICCLX" },
  ADJ:  { M: "PIADJ-", AM: "PIADJO", N: "PIADJX" },
  LNE:  { M: "PILNE-", AM: "PILNEO", N: "PILNEX" },
  LNO:  { M: "PILNO-", AM: "PILNOO", N: "PILNOX" },
  VGD:  { M: "PIVGD-", AM: "PIVGDO", N: null },
  LC:   { M: "PILCL-", AM: "PILCLO", N: "PILCLX" },
  AC1:  { M: "PAAC1-", AM: "PAAC1O", N: "PAAC1X" },
  AC2:  { M: "PAAC2-", AM: "PAAC2O", N: "PAAC2X" },
  ACXX: { M: null, AM: null, N: "PAACXX" },
};
const MAPPING_JOURNEE = {
  PA1J: "PIPA1J", PA2J: "PIPA2J", PA3J: "PIPA3J",
  DPXJ: "PIDPXJ", ASSJ: "PIASSJ", AFOPR: "AFOPRCI",
  PARJ: "PAPAUJ", DPXP: "PADPXJ", ASMP: "PAASMJ",
  PPRCI: "PPRCI",
  PPAR: "PPAR",
};

// Codes jsCode déjà canoniques (ceux que renvoie convertirCodePosteVersJsCode
// ci-dessous) — sert à distinguer un code court local (ex: "PA1J", à traduire)
// d'un code déjà traduit (ex: "PIPA1J", à ne pas re-sauvegarder tel quel).
// Un simple prefixe "PI"/"PA" ne suffit PAS : plusieurs codes courts locaux
// commencent aussi par "PA" par coïncidence (PA1J/PA2J/PA3J/PARJ, les
// "Pauseur") et se faisaient à tort filtrer comme "déjà canoniques",
// écrasant silencieusement le poste choisi à la sauvegarde (signalé par
// Olivier le 13/07 : le poste Pauseur s'affichait puis disparaissait après
// quelques secondes, la journée retombant en "non affecté").
// PPRCI/PPAR sont exclus : ils sont leur propre code canonique (court ===
// traduit), les exclure ici évite de les nuller à tort quand ils arrivent
// comme code court en entrée.
const CANONICAL_JSCODES = new Set([
  ...Object.values(MAPPING_3X8).flatMap(v => Object.values(v)).filter(Boolean),
  ...Object.entries(MAPPING_JOURNEE).filter(([k,v]) => k !== v).map(([,v]) => v),
]);

export function convertirCodePosteVersJsCode(codePoste, equipe) {
  if (!codePoste) return null;
  if (equipe === "J" || equipe === "JF") {
    return MAPPING_JOURNEE[codePoste] || null;
  }
  if (MAPPING_3X8[codePoste]) {
    return MAPPING_3X8[codePoste][equipe] || null;
  }
  return null;
}

export const planning = {
  /**
   * Charger tout le planning d'un agent
   * Retourne un objet { "AGENTID-YYYY-MM-DD": { equipe, jsCode, horaires, prive, ... } }
   * Compatible avec la structure schedule existante dans App.jsx
   * @param {string} agentId
   */
  async getSchedule(agentId) {
    const rows = await apiFetch(`/planning/${agentId}`);
    if (!rows) return {};
    // Grouper par date (plusieurs periodes par jour)
    const byDate = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date;
      if (!byDate[date]) byDate[date] = [];
      byDate[date].push(row);
    });
    const result = {};
    Object.entries(byDate).forEach(([date, periodes]) => {
      const p1 = periodes.find(p => p.note !== 'debut_nuit') || periodes[0];
      const p2 = periodes.find(p => p.note === 'debut_nuit');
      const horaires = p1.heure_debut ? (p1.heure_debut.slice(0,5).replace(':','h')+'–'+(p1.heure_fin||'').slice(0,5).replace(':','h')) : null;
      const isFinNuit = p1.note === 'fin_nuit';
      // Deux marqueurs synthétiques différents peuvent forcer code_equipe='N'
      // sans que ce soit une vraie nuit :
      // (a) 'fin_nuit' : SEULE la case "descente de nuit" est cochée.
      // (b) 'note_seule' : il ne reste QUE la note, plus aucun contenu du tout
      //     (repli total dans saveEntry côté sauvegarde).
      // Dans les deux cas, ce 'N' est un simple repère technique, pas une
      // vraie nuit → il faut l'ignorer. Mais si une VRAIE équipe (RP, M...)
      // a en plus la case "descente de nuit" cochée, il ne faut surtout pas
      // effacer cette équipe réelle (d'où la condition code_equipe==='N').
      const isPlaceholder = (p1.note === 'fin_nuit' || p1.note === 'note_seule') && p1.code_equipe === 'N' && !p2;
      result[`${agentId}-${date}`] = {
        equipe:   isPlaceholder ? null : (p1.code_equipe || null),
        equipe2:  p2 ? 'N' : null,
        jsCode:   isPlaceholder ? null : (convertirCodePosteVersJsCode(p1.code_poste, p1.code_equipe) || p1.code_poste || null),
        jsCode2:  p2 ? (convertirCodePosteVersJsCode(p2.code_poste, 'N') || p2.code_poste || null) : null,
        horaires: isPlaceholder ? null : horaires,
        prive:    !!p1.prive,
        finNuit:  isFinNuit,
        notePerso: p1.note_perso || null,
        impressionAt: null,
      };
    });
    return result;
  },

    async getAllSchedules() {
    const rows = await apiFetch('/planning');
    if (!rows) return {};
    const result = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date;
result[`${row.agent_id || agentId}-${date}`] = {
        equipe:       row.code_equipe  || row.equipe  || null,
        equipe2:      row.equipe2      || null,
        jsCode:       row.code_poste   || row.js_code || null,
        horaires:     row.heure_debut  ? (row.heure_debut.slice(0,5).replace(':','h')+'–'+(row.heure_fin||'').slice(0,5).replace(':','h')) : (row.horaires||null),
        prive:        row.prive        || false,
        finNuit:      row.fin_nuit     || false,
        impressionAt: row.impression_at || null,
      };
    });
    return result;
  },

  /**
   * Sauvegarder / mettre à jour une entrée de planning
   * @param {string} agentId
   * @param {string} date     — "YYYY-MM-DD"
   * @param {object} entry    — { equipe, equipe2, jsCode, horaires, prive, finNuit, impressionAt }
   */
  saveEntry: (agentId, date, entry) => {
    const periodes = [];
    // Periode 1 : journee (si equipe non null)
    if (entry.equipe) {
      periodes.push({
        ordre: 1,
        code_equipe: entry.equipe,
        code_poste: (entry.jsCode && entry.jsCode.length <= 10 && !/^(M|AM|N|J|RP|RU|RQ|CA|CP|MA|VT|ABS|FOR|DISPO|NU|TC|TY|RN|JF)$/.test(entry.jsCode) && !CANONICAL_JSCODES.has(entry.jsCode)) ? entry.jsCode : null,
        heure_debut: entry.horaires ? entry.horaires.split('–')[0]?.trim().replace('h',':') : null,
        heure_fin:   entry.horaires ? entry.horaires.split('–')[1]?.trim().replace('h',':') : null,
        prive: entry.prive || false,
        note: entry.finNuit ? 'fin_nuit' : null,
        note_perso: entry.notePerso || null,
      });
    }
    // Periode nuit ce soir (si equipe2=N)
    if (entry.equipe2 === 'N') {
      const estPeriodeUnique = periodes.length === 0; // cas "nuit seule" : pas de journée avant
      periodes.push({
        ordre: periodes.length + 1,
        code_equipe: 'N',
        code_poste: (entry.jsCode2 && !CANONICAL_JSCODES.has(entry.jsCode2)) ? entry.jsCode2 : null,
        heure_debut: '22:15',
        heure_fin: '06:17',
        prive: false,
        note: 'debut_nuit',
        // Si nuit seule, cette periode fait office de periode N°1 : elle doit
        // porter la note (sinon la note n'a nulle part ou etre sauvegardee).
        ...(estPeriodeUnique ? {note_perso: entry.notePerso || null} : {}),
      });
    }
    // Si rien du tout mais finNuit : juste noter la fin de nuit
    if (periodes.length === 0 && entry.finNuit) {
      periodes.push({
        ordre: 1,
        code_equipe: 'N',
        code_poste: entry.jsCode || null,
        heure_debut: null,
        heure_fin: null,
        prive: false,
        note: 'fin_nuit',
        note_perso: entry.notePerso || null,
      });
    }
    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:'note_seule', note_perso: entry.notePerso || null});
    return apiFetch(`/planning/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ periodes, source: 'manuel' }),
    });
  },
  deleteEntry: (agentId, date) =>
    apiFetch(`/planning/${agentId}/${date}`, { method: 'DELETE' }),
  /**
   * Importer un lot de jours extraits d'un bulletin de commande ou d'un déroulé prévisionnel.
   * @param {string} agentId - CP de l'agent (toujours l'agent connecté lui-même)
   * @param {Array}  entries - [{date_jour, code_equipe, code_poste, heure_debut, heure_fin, source_edition_date}]
   * @param {string} sourceType - 'bulletin' | 'previsionnel'
   * @returns {Promise<{message, nb_appliques, appliques, ignores}>}
   */
  importBulletin: (agentId, entries, sourceType) =>
    apiFetch(`/planning/${agentId}/import-bulletin`, {
      method: 'POST',
      body: JSON.stringify({ entries, source_type: sourceType || 'bulletin' }),
    }),
  /**
   * Charger le planning PUBLIC de tous les agents sur une periode
   * (pour le Planning Previsionnel Partage)
   */

  async getAllPublic(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(`/planning/public?${params.toString()}`);
    if (!rows) return {};
    // Grouper par agent+date (plusieurs periodes par jour)
    const byKey = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date_jour;
      const key = `${row.cp_agent}|${date}`;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(row);
    });
    const result = {};
    Object.entries(byKey).forEach(([key, periodes]) => {
      const [agentId, date] = key.split('|');
      const p1 = periodes.find(p => p.note !== 'debut_nuit') || periodes[0];
      const p2 = periodes.find(p => p.note === 'debut_nuit');
      const horaires = p1.heure_debut ? (String(p1.heure_debut).slice(0,5).replace(':','h')+'–'+(p1.heure_fin||'').slice(0,5).replace(':','h')) : null;
      const isFinNuit = p1.note === 'fin_nuit';
      result[`${agentId}-${date}`] = {
        equipe:   isFinNuit && !p2 ? null : (p1.code_equipe || null),
        equipe2:  p2 ? 'N' : null,
        jsCode:   isFinNuit && !p2 ? null : (convertirCodePosteVersJsCode(p1.code_poste, p1.code_equipe) || p1.code_poste || null),
        jsCode2:  p2 ? (convertirCodePosteVersJsCode(p2.code_poste, 'N') || p2.code_poste || null) : null,
        horaires: isFinNuit ? null : horaires,
        prive:    false,
        finNuit:  isFinNuit,
      };
    });
    return result;
  }
};

// ─── MODULE PROFIL ────────────────────────────────────────────────────────────

export const profil = {
  /**
   * Charger le profil d'un agent (habilitations, roulement, couleurs, etc.)
   * @param {string} agentId
   */
  async get(agentId) {
    const raw = await apiFetch(`/profil/${agentId}`);
    if (!raw) return null;
    const row = raw.profil || raw;
    const hab = raw.habilitations || [];
    const extra = typeof row.donnees_json === 'string' ? JSON.parse(row.donnees_json) : (row.donnees_json || {});
    // Mapper snake_case → camelCase (structure attendue par App.jsx)
    return {
      pinHash:                  row.pin_hash               || null,
      isAdmin:                  row.is_admin               || false,
      roulement:                row.roulement              || null,
      isReserve:                row.is_reserve             || false,
      famillesHab:              row.familles_hab           || null,
      habilitations:            Array.isArray(hab) ? Object.fromEntries((hab||[]).map(h=>[h.code_poste,'HC'])) : (row.habilitations||{}),
      agentColors:              row.couleurs               || {},
      // Champs stockés dans donnees_json (colonne JSON unique, voir profilController.js)
      pauseFigee:               extra.pauseFigee              || {},
      compteurCorrections:      extra.compteurCorrections     || {},
      departDate:               extra.departDate              || null,
      fetesTracking:            extra.fetesTracking           || {},
      pauseFigeeFiaMois:        extra.pauseFigeeFiaMois       || {},
      pauseFigeeFiaDone:        extra.pauseFigeeFiaDone       || {},
      demandesConges:           extra.demandesConges          || [],
      notificationsAcquittees:  extra.notificationsAcquittees || [],
      congesEntitlement:        extra.congesEntitlement       || {},
      congesReports:            extra.congesReports           || {},
      ruReports:                extra.ruReports               || {},
      rpReports:                extra.rpReports               || {},
      rqReports:                extra.rqReports               || {},
      rnReports:                extra.rnReports               || {},
      tcReports:                extra.tcReports               || {},
      tyReports:                extra.tyReports               || {},
      rpAcquis:                 extra.rpAcquis                || {},
      ruAcquis:                 extra.ruAcquis                || {},
      rqAcquis:                 extra.rqAcquis                || {},
      rnAcquis:                 extra.rnAcquis                || {},
      tcAcquis:                 extra.tcAcquis                || {},
      tyAcquis:                 extra.tyAcquis                || {},
      vtEntitlement:            extra.vtEntitlement           || {},
      vtTracking:               extra.vtTracking              || {},
      vtReports:                extra.vtReports               || {},
      congesDemandes:           extra.congesDemandes          || {},
      tcAjustementManuel:       extra.tcAjustementManuel      || {},
      tcLedger:                 extra.tcLedger                || [],
      tyLedger:                 extra.tyLedger                || [],
      rnLedger:                 extra.rnLedger                || [],
    };
  },

  /**
   * Changer le PIN d'un agent
   * @param {string} agentId
   * @param {string} newPin — PIN en clair (hashé côté serveur)
   */
  setHabilitations: (agentId, habs) =>
    apiFetch(`/profil/${agentId}/habilitations`, {
      method: 'PUT',
      body: JSON.stringify({ habilitations: habs }),
    }),  changePin: (agentId, newPin) =>
    apiFetch(`/profil/${agentId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin: newPin }),
    }),

  /**
   * Sauvegarder le profil d'un agent (couleurs, habilitations, compteurs, etc.)
   * @param {string} agentId
   * @param {object} data — structure camelCase, PARTIELLE OU COMPLÈTE : seules les
   *   clés effectivement présentes (!== undefined) sont envoyées/écrasées, le reste
   *   est préservé côté backend (COALESCE + JSON_MERGE_PATCH) — un appel qui ne
   *   passe que {agentColors} ne touche donc plus au reste du profil.
   */
  async save(agentId, data) {
    const EXTRA_KEYS = [
      'pauseFigee','compteurCorrections','departDate','fetesTracking',
      'pauseFigeeFiaMois','pauseFigeeFiaDone','demandesConges','notificationsAcquittees',
      'congesEntitlement','congesReports','ruReports','rpReports','rqReports','rnReports',
      'tcReports','tyReports','rpAcquis','ruAcquis','rqAcquis','rnAcquis','tcAcquis','tyAcquis',
      'vtEntitlement','vtTracking','vtReports','congesDemandes','tcAjustementManuel',
      'tcLedger','tyLedger','rnLedger',
    ];
    const donnees_json = {};
    EXTRA_KEYS.forEach(k => { if (data[k] !== undefined) donnees_json[k] = data[k]; });

    const body = {};
    if (data.roulement      !== undefined) body.roulement      = data.roulement;
    if (data.isReserve      !== undefined) body.is_reserve     = data.isReserve;
    if (data.famillesHab    !== undefined) body.familles_hab   = data.famillesHab;
    if (data.habilitations  !== undefined) body.habilitations  = data.habilitations;
    if (data.agentColors    !== undefined) body.agent_colors   = data.agentColors;
    if (Object.keys(donnees_json).length > 0) body.donnees_json = donnees_json;

    return apiFetch(`/profil/${agentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },
};

// ─── MODULE CPS (planning officiel SNCF importé) ──────────────────────────────

export const cps = {
  /**
   * Charger tout le planning CPS sur une période
   * Retourne un objet { "AGENTID-YYYY-MM-DD": { equipe, jsCode, horaires, famille } }
   */
  async getSchedule(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(`/cps?${params.toString()}`);
    if (!rows) return {};
    const result = {};
    rows.forEach((row) => {
      const date = row.date_jour ? row.date_jour.split('T')[0] : row.date;
      result[`${row.cp_agent}-${date}`] = {
        equipe: row.equipe || null,
        jsCode: row.js_code || null,
        horaires: row.horaires || null,
        famille: row.famille || null,
        prive: false,
      };
    });
    return result;
  },

  /**
   * Importer en masse des entrées CPS (n'importe quel agent connecté)
   * @param {Array<{cp_agent, date_jour, equipe, js_code, horaires, famille}>} entries
   */
  import: (entries) =>
    apiFetch('/cps/import', {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),

  /**
   * Date/heure + auteur du dernier import CPS (ou null si aucun import)
   */
  getLastImport: () => apiFetch('/cps/last-import'),

  /**
   * Historique des imports CPS des 90 derniers jours
   */
  getHistory: () => apiFetch('/cps/history'),

  /**
   * Annule le tout dernier import CPS (restaure l'état précédent)
   */
  undoLastImport: () =>
    apiFetch('/cps/undo-last', { method: 'POST' }),
};

// ─── MODULE CONGÉS ────────────────────────────────────────────────────────────

export const conges = {
  /** Toutes les demandes de congés d'un agent */
  getAll: (agentId) => apiFetch(`/conges/${agentId}`),

  /** Créer une demande */
  create: (agentId, data) =>
    apiFetch(`/conges/${agentId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  /** Mettre à jour le statut (admin) */
  updateStatus: (congeId, statut, decompte) =>
    apiFetch(`/conges/${congeId}/statut`, {
      method: 'PUT',
      body: JSON.stringify({ statut, decompte }),
    }),

  /** Supprimer une demande */
  delete: (congeId) =>
    apiFetch(`/conges/${congeId}`, { method: 'DELETE' }),
};

// ─── MODULE NOTIFICATIONS ─────────────────────────────────────────────────────

export const notifications = {
  /** Toutes les notifications d'un agent */
  getAll: (agentId) => apiFetch(`/notifications/${agentId}`),

  /** Acquitter une notification */
  acquitter: (notifId) =>
    apiFetch(`/notifications/${notifId}/acquitter`, { method: 'PUT' }),

  /** Créer une notification (admin / CPS) */
  create: (agentId, data) =>
    apiFetch(`/notifications/${agentId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── MODULE ÉCHANGES ─────────────────────────────────────────────────────────

export const echanges = {
  /** Toutes les demandes d'échange, triées par date la plus proche */
  getAll: () => apiFetch('/echanges'),

  /** Liste des agents intéressés par une demande */
  getInteresses: (id) => apiFetch(`/echanges/${id}/interesses`),

  /** Créer une demande d'échange pour une journée */
  create: (data) =>
    apiFetch('/echanges', { method: 'POST', body: JSON.stringify(data) }),

  /** Modifier les critères d'une demande (seul le demandeur, tant qu'ouverte) */
  update: (id, data) =>
    apiFetch(`/echanges/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** Se déclarer intéressé / retirer son intérêt (bascule) */
  toggleInteret: (id) =>
    apiFetch(`/echanges/${id}/interet`, { method: 'POST' }),

  /** Clôturer la demande en précisant avec qui l'échange a eu lieu */
  cloturer: (id, cpEchangeAvec) =>
    apiFetch(`/echanges/${id}/cloturer`, {
      method: 'POST',
      body: JSON.stringify({ cp_echange_avec: cpEchangeAvec }),
    }),

  /** Supprimer une demande (seul le demandeur, à tout moment) */
  delete: (id) =>
    apiFetch(`/echanges/${id}`, { method: 'DELETE' }),
};

// ─── MODULE PAUSES ────────────────────────────────────────────────────────────

export const pauses = {
  /** Pauses figées d'un agent */
  getAll: (agentId) => apiFetch(`/pauses/${agentId}`),

  /** Ajouter une pause figée (crée la ligne en base, jour non pris en compte FIA par défaut) */
  add: (agentId, date) =>
    apiFetch(`/pauses/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({}),
    }),

  /** Supprimer une pause figée */
  delete: (agentId, date) =>
    apiFetch(`/pauses/${agentId}/${date}`, { method: 'DELETE' }),

  /** Mettre à jour le mois FIA d'une pause */
  setFiaMois: (agentId, date, moisKey) =>
    apiFetch(`/pauses/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ mois_fia: moisKey }),
    }),

  /** Marquer/démarquer une pause comme prise en compte FIA */
  setFiaDone: (agentId, date, done) =>
    apiFetch(`/pauses/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ fia_done: !!done }),
    }),
};

// ─── MODULE FÊTES ─────────────────────────────────────────────────────────────

export const fetes = {
  /** Suivi des fêtes d'un agent pour une année */
  get: (agentId, year) => apiFetch(`/fetes/${agentId}/${year}`),

  /** Mettre à jour le tracking d'une fête */
  update: (agentId, year, code, data) =>
    apiFetch(`/fetes/${agentId}/${year}/${code}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};

// ─── MODULE ANNUAIRE ──────────────────────────────────────────────────────────

export const annuaire = {
  /** Agents visibles dans l'annuaire (tel/email déchiffrés, filtrés sur annuaire_visible) */
  getAgents: () => apiFetch('/annuaire/agents'),

  /** Fiches UO (unités opérationnelles, par poste/fonction) */
  getUo: () => apiFetch('/annuaire/uo'),
  createUo: (data) =>
    apiFetch('/annuaire/uo', { method: 'POST', body: JSON.stringify(data) }),
  updateUo: (id, data) =>
    apiFetch(`/annuaire/uo/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteUo: (id) =>
    apiFetch(`/annuaire/uo/${id}`, { method: 'DELETE' }),

  /** Accès rapide (ex: Astreinte) */
  getAccesRapide: () => apiFetch('/annuaire/acces-rapide'),
  createAccesRapide: (data) =>
    apiFetch('/annuaire/acces-rapide', { method: 'POST', body: JSON.stringify(data) }),
  updateAccesRapide: (id, data) =>
    apiFetch(`/annuaire/acces-rapide/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAccesRapide: (id) =>
    apiFetch(`/annuaire/acces-rapide/${id}`, { method: 'DELETE' }),

  /** Activer/désactiver sa propre visibilité dans l'annuaire */
  setVisible: (cp, visible) =>
    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify({ annuaire_visible: visible ? 1 : 0 }) }),

  /** Mettre à jour ses propres email/téléphone (réutilise la route agents existante) */
  updateMesCoordonnees: (cp, data) =>
    apiFetch(`/agents/${cp}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────

// ─── ALEAS CPS (echanges, erreurs, postes non tenus) ───────────────────────
const cpsAleas = {
  /**
   * Charger tous les aleas sur une periode
   */
  async getAll(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(`/cps-aleas?${params.toString()}`);
    return rows || [];
  },
  /**
   * Signaler un alea (echange, erreur_cps, ou non_tenu)
   * @param {object} data { js_code, date_jour, famille, type, agents_concernes, motif }
   */
  async create(data) {
    return apiFetch('/cps-aleas', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /**
   * Retirer un alea (retour a l'affichage officiel)
   */
  async remove(id) {
    return apiFetch(`/cps-aleas/${id}`, { method: 'DELETE' });
  },
};

const previsionnelSignalements = {
  /**
   * Charger tous les signalements actifs sur une periode
   * (la resolution automatique est appliquee cote backend)
   */
  async getAll(from, to) {
    const params = new URLSearchParams();
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const rows = await apiFetch(`/previsionnel-signalements?${params.toString()}`);
    return rows || [];
  },
  /**
   * Signaler qui assure reellement le poste
   * @param {object} data { agent_titulaire_cp, date_jour, agents_remplacants, motif }
   */
  async create(data) {
    return apiFetch('/previsionnel-signalements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /**
   * Annuler un signalement (manuel, en cas d'erreur)
   */
  async remove(id) {
    return apiFetch(`/previsionnel-signalements/${id}`, { method: 'DELETE' });
  },
};

const journeeSpecialeNotes = {
  /**
   * Charger tous les messages publics Journee speciale
   */
  async getAll() {
    const rows = await apiFetch('/journee-speciale-notes');
    return rows || [];
  },
  /**
   * Ecrire ou mettre a jour le message public d'un agent pour une date donnee
   * @param {object} data { cp_agent, date_jour, message }
   */
  async save(data) {
    return apiFetch('/journee-speciale-notes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  /**
   * Supprimer un message
   */
  async remove(id) {
    return apiFetch(`/journee-speciale-notes/${id}`, { method: 'DELETE' });
  },
};
const api = {
  auth,
  agents,
  planning,
  profil,
  conges,
  notifications,
  echanges,
  pauses,
  fetes,
  cps,
  cpsAleas,
  previsionnelSignalements,
  journeeSpecialeNotes,
  annuaire,
};

export default api;


// ─────────────────────────────────────────────────────────────────────────────
// GUIDE D'INTÉGRATION DANS App.jsx
// ─────────────────────────────────────────────────────────────────────────────
//
// 1. REMPLACER sbSaveEntry / sbDeleteEntry :
//
//    AVANT  : sbSaveEntry(agent.id, dk, entry)
//    APRÈS  : api.planning.saveEntry(agent.id, dk, entry)
//
//    AVANT  : sbDeleteEntry(agent.id, dk)
//    APRÈS  : api.planning.deleteEntry(agent.id, dk)
//
// 2. REMPLACER sbLoadProfile / sbSaveProfile :
//
//    AVANT  : sbLoadProfile(agentId)
//    APRÈS  : api.profil.get(agentId)
//
//    AVANT  : sbSaveProfile(agentId, data)
//    APRÈS  : api.profil.save(agentId, data)
//
// 3. REMPLACER sbLoadSchedule :
//
//    AVANT  : sbLoadSchedule(agentId)
//    APRÈS  : api.planning.getSchedule(agentId)
//
// 4. AJOUTER le login dans App (composant racine) :
//
//    const handleLogin = async (cp, pin) => {
//      const { token, agent } = await api.auth.login(cp, pin);
//      setCurrentUser({ agent, token });
//    };
//
// 5. CHARGER les agents depuis l'API au démarrage :
//
//    useEffect(() => {
//      api.agents.getAll().then(setAgents).catch(console.error);
//    }, []);
//
// 6. GÉRER la déconnexion automatique (token expiré) :
//
//    useEffect(() => {
//      const handler = () => { setCurrentUser(null); };
//      window.addEventListener('f2ppmp:unauthorized', handler);
//      return () => window.removeEventListener('f2ppmp:unauthorized', handler);
//    }, []);
//
// 7. FICHIER .env.local (racine du projet) :
//
//    VITE_API_URL=http://localhost:3001
//
//    FICHIER .env.production (Vercel) :
//    VITE_API_URL=https://votre-api.railway.app
//
// ─────────────────────────────────────────────────────────────────────────────
