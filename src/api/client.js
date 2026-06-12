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

  // 401 → token expiré → on nettoie
  if (res.status === 401) {
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
    apiFetch(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /**
   * Supprimer un agent (admin)
   */
  delete: (id) =>
    apiFetch(`/agents/${id}`, { method: 'DELETE' }),
};

// ─── MODULE PLANNING ─────────────────────────────────────────────────────────

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
      result[`${agentId}-${date}`] = {
        // Si fin_nuit seule : equipe=null, finNuit=true
        equipe:   isFinNuit && !p2 ? null : (p1.code_equipe || null),
        equipe2:  p2 ? 'N' : null,
        jsCode:   isFinNuit && !p2 ? null : (p1.code_poste || null),
        jsCode2:  p2 ? (p2.code_poste || null) : null,
        horaires: isFinNuit ? null : horaires,
        prive:    !!p1.prive,
        finNuit:  isFinNuit,
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
        code_poste: (entry.jsCode && entry.jsCode.length <= 10 && !/^(M|AM|N|J|RP|RU|RQ|CA|CP|MA|VT|ABS|FOR|DISPO|NU|TC|TY|RN|JF)$/.test(entry.jsCode) && !/^(PI|PA)/.test(entry.jsCode)) ? entry.jsCode : null,
        heure_debut: entry.horaires ? entry.horaires.split('–')[0]?.trim().replace('h',':') : null,
        heure_fin:   entry.horaires ? entry.horaires.split('–')[1]?.trim().replace('h',':') : null,
        prive: entry.prive || false,
        note: entry.finNuit ? 'fin_nuit' : null,
      });
    }
    // Periode nuit ce soir (si equipe2=N)
    if (entry.equipe2 === 'N') {
      periodes.push({
        ordre: periodes.length + 1,
        code_equipe: 'N',
        code_poste: (entry.jsCode2 && !/^(PI|PA)/.test(entry.jsCode2)) ? entry.jsCode2 : null,
        heure_debut: '22:15',
        heure_fin: '06:17',
        prive: false,
        note: 'debut_nuit',
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
      });
    }
    if (periodes.length === 0) periodes.push({ordre:1, code_equipe:'N', code_poste:null, heure_debut:null, heure_fin:null, prive:false, note:null});
    // Ajouter periode de nuit si debut de nuit ce soir
    if (entry.equipe2 === 'N') {
      periodes.push({
        ordre: 2,
        code_equipe: 'N',
        code_poste: (entry.jsCode2 && !/^(PI|PA)/.test(entry.jsCode2)) ? entry.jsCode2 : null,
        heure_debut: '22:15',
        heure_fin: '06:17',
        prive: false,
        note: 'debut_nuit',
      });
    }
    return apiFetch(`/planning/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ periodes, source: 'manuel' }),
    });
  },
  deleteEntry: (agentId, date) =>
    apiFetch(`/planning/${agentId}/${date}`, { method: 'DELETE' }),
};

// ─── MODULE PROFIL ────────────────────────────────────────────────────────────

export const profil = {
  /**
   * Charger le profil d'un agent (habilitations, roulement, couleurs, etc.)
   * @param {string} agentId
   */
  async get(agentId) {
    const row = await apiFetch(`/profil/${agentId}`);
    if (!row) return null;
    // Mapper snake_case → camelCase (structure attendue par App.jsx)
    return {
      pinHash:                  row.pin_hash               || null,
      isAdmin:                  row.is_admin               || false,
      roulement:                row.roulement              || null,
      isReserve:                row.is_reserve             || false,
      famillesHab:              row.familles_hab           || null,
      habilitations:            Array.isArray(row.habilitations) ? Object.fromEntries((row.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (row.habilitations||{}),
      agentColors:              row.agent_colors           || {},
      pauseFigee:               row.pause_figee            || {},
      compteurCorrections:      row.compteur_corrections   || {},
      departDate:               row.depart_date            || null,
      fetesTracking:            row.fetes_tracking         || {},
      pauseFigeeFiaMois:        row.pause_figee_fia_mois   || {},
      pauseFigeeFiaDone:        row.pause_figee_fia_done   || {},
      demandesConges:           row.demandes_conges        || [],
      notificationsAcquittees:  row.notifications_acquittees || [],
    };
  },

  /**
   * Sauvegarder le profil d'un agent
   * @param {string} agentId
   * @param {object} data — structure camelCase (comme ci-dessus)
   */
  save: (agentId, data) =>
    apiFetch(`/profil/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify({
        pin_hash:                  data.pinHash               || null,
        is_admin:                  data.isAdmin               || false,
        roulement:                 data.roulement             || null,
        is_reserve:                data.isReserve             || false,
        familles_hab:              data.famillesHab           || null,
        habilitations:             data.habilitations         || {},
        agent_colors:              data.agentColors           || {},
        pause_figee:               data.pauseFigee            || {},
        compteur_corrections:      data.compteurCorrections   || {},
        depart_date:               data.departDate            || null,
        fetes_tracking:            data.fetesTracking         || {},
        pause_figee_fia_mois:      data.pauseFigeeFiaMois     || {},
        pause_figee_fia_done:      data.pauseFigeeFiaDone     || {},
        demandes_conges:           data.demandesConges        || [],
        notifications_acquittees:  data.notificationsAcquittees || [],
      }),
    }),

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
  /** Toutes les demandes d'échange visibles pour un agent */
  getAll: (agentId) => apiFetch(`/echanges?agentId=${agentId}`),

  /** Créer une demande d'échange */
  create: (data) =>
    apiFetch('/echanges', { method: 'POST', body: JSON.stringify(data) }),

  /** Répondre à une demande */
  repondre: (echangeId, agentId, statut) =>
    apiFetch(`/echanges/${echangeId}/reponse`, {
      method: 'PUT',
      body: JSON.stringify({ agentId, statut }),
    }),
};

// ─── MODULE PAUSES ────────────────────────────────────────────────────────────

export const pauses = {
  /** Pauses figées d'un agent */
  getAll: (agentId) => apiFetch(`/pauses/${agentId}`),

  /** Ajouter une pause figée */
  add: (agentId, date) =>
    apiFetch(`/pauses/${agentId}`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    }),

  /** Supprimer une pause figée */
  delete: (agentId, date) =>
    apiFetch(`/pauses/${agentId}/${date}`, { method: 'DELETE' }),

  /** Mettre à jour le mois FIA d'une pause */
  setFiaMois: (agentId, date, moisKey) =>
    apiFetch(`/pauses/${agentId}/${date}/fia`, {
      method: 'PUT',
      body: JSON.stringify({ mois_fia: moisKey }),
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

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────

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
