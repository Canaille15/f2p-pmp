// ─── F2P.PMP — API REST Client ────────────────────────────────────────────────
// Fichier : src/api/client.js
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ─── TOKEN JWT ────────────────────────────────────────────────────────────────

const TOKEN_KEY = 'f2ppmp_jwt';

export const tokenStore = {
  get:   () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set:   (t) => { try { localStorage.setItem(TOKEN_KEY, t); } catch {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch {} },
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

  if (res.status === 401) {
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent('f2ppmp:unauthorized'));
    throw new Error('Session expirée — reconnectez-vous');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Erreur ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const auth = {
  async login(cp, pin) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ cp, pin }),
    });
    if (data.token) tokenStore.set(data.token);
    return data;
  },
  logout()    { tokenStore.clear(); },
  isLoggedIn(){ return !!tokenStore.get(); },
  getCurrentAgentFromToken() {
    const token = tokenStore.get();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])); } catch { return null; }
  },
};

// ─── AGENTS ───────────────────────────────────────────────────────────────────

export const agents = {
  getAll:   ()         => apiFetch('/agents'),
  getById:  (id)       => apiFetch(`/agents/${id}`),
  create:   (data)     => apiFetch('/agents', { method: 'POST', body: JSON.stringify(data) }),
  update:   (id, data) => apiFetch(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete:   (id)       => apiFetch(`/agents/${id}`, { method: 'DELETE' }),
  resetPin: (cp, newPin) => apiFetch(`/agents/${cp}/reset-pin`, { method: 'PUT', body: JSON.stringify({ newPin }) }),
};

// ─── PLANNING ─────────────────────────────────────────────────────────────────

export const planning = {
  async getSchedule(agentId) {
    const rows = await apiFetch(`/planning/${agentId}`);
    if (!rows) return {};
    const result = {};
    rows.forEach((row) => {
      result[`${row.agent_id}-${row.date}`] = {
        equipe:       row.equipe        || null,
        equipe2:      row.equipe2       || null,
        jsCode:       row.js_code       || null,
        horaires:     row.horaires      || null,
        prive:        row.prive         || false,
        finNuit:      row.fin_nuit      || false,
        impressionAt: row.impression_at || null,
      };
    });
    return result;
  },

  async getAllSchedules() {
    const rows = await apiFetch('/planning');
    if (!rows) return {};
    const result = {};
    rows.forEach((row) => {
      result[`${row.agent_id}-${row.date}`] = {
        equipe:       row.equipe        || null,
        equipe2:      row.equipe2       || null,
        jsCode:       row.js_code       || null,
        horaires:     row.horaires      || null,
        prive:        row.prive         || false,
        finNuit:      row.fin_nuit      || false,
        impressionAt: row.impression_at || null,
      };
    });
    return result;
  },

 saveEntry: (agentId, date, entry) =>
    apiFetch(`/planning/${agentId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({
        periodes: [{
          ordre: 1,
          code_equipe: entry.equipe || null,
          code_poste:  null,
          heure_debut: entry.horaires ? entry.horaires.split('–')[0]?.trim().replace('h',':') : null,
heure_fin:   entry.horaires ? entry.horaires.split('–')[1]?.trim().replace('h',':') : null,
          prive:       entry.prive || false,
          note:        entry.finNuit ? 'fin_nuit' : null,
        }],
        source: 'manuel',
      }),
    }),
  

  deleteEntry: (agentId, date) =>
    apiFetch(`/planning/${agentId}/${date}`, { method: 'DELETE' }),
};

// ─── PROFIL ───────────────────────────────────────────────────────────────────

export const profil = {
  async get(agentId) {
    const row = await apiFetch(`/profil/${agentId}`);
    if (!row) return null;
    return {
      pinHash:                 row.pin_hash                || null,
      isAdmin:                 row.is_admin                || false,
      roulement:               row.roulement               || null,
      isReserve:               row.is_reserve              || false,
      famillesHab:             row.familles_hab            || null,
      habilitations:           row.habilitations           || {},
      agentColors:             row.agent_colors            || {},
      pauseFigee:              row.pause_figee             || {},
      compteurCorrections:     row.compteur_corrections    || {},
      departDate:              row.depart_date             || null,
      fetesTracking:           row.fetes_tracking          || {},
      pauseFigeeFiaMois:       row.pause_figee_fia_mois    || {},
      pauseFigeeFiaDone:       row.pause_figee_fia_done    || {},
      demandesConges:          row.demandes_conges         || [],
      notificationsAcquittees: row.notifications_acquittees|| [],
    };
  },

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

  changePin: (agentId, newPin) =>
    apiFetch(`/profil/${agentId}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pin: newPin }),
    }),
};

// ─── CONGÉS ───────────────────────────────────────────────────────────────────

export const conges = {
  getAll:       (agentId)              => apiFetch(`/conges/${agentId}`),
  create:       (agentId, data)        => apiFetch(`/conges/${agentId}`, { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (congeId, statut, dec) => apiFetch(`/conges/${congeId}/statut`, { method: 'PUT', body: JSON.stringify({ statut, decompte: dec }) }),
  delete:       (congeId)              => apiFetch(`/conges/${congeId}`, { method: 'DELETE' }),
};

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export const notifications = {
  getAll:    (agentId)       => apiFetch(`/notifications/${agentId}`),
  acquitter: (id)            => apiFetch(`/notifications/${id}/acquitter`, { method: 'PUT' }),
  create:    (agentId, data) => apiFetch(`/notifications/${agentId}`, { method: 'POST', body: JSON.stringify(data) }),
};

// ─── ÉCHANGES ─────────────────────────────────────────────────────────────────

export const echanges = {
  getAll:   (agentId)             => apiFetch(`/echanges?agentId=${agentId}`),
  create:   (data)                => apiFetch('/echanges', { method: 'POST', body: JSON.stringify(data) }),
  repondre: (echangeId, agId, st) => apiFetch(`/echanges/${echangeId}/reponse`, { method: 'PUT', body: JSON.stringify({ agentId: agId, statut: st }) }),
};

// ─── PAUSES ───────────────────────────────────────────────────────────────────

export const pauses = {
  getAll:    (agentId)           => apiFetch(`/pauses/${agentId}`),
  add:       (agentId, date)     => apiFetch(`/pauses/${agentId}`, { method: 'POST', body: JSON.stringify({ date }) }),
  delete:    (agentId, date)     => apiFetch(`/pauses/${agentId}/${date}`, { method: 'DELETE' }),
  setFiaMois:(agentId, date, m)  => apiFetch(`/pauses/${agentId}/${date}/fia`, { method: 'PUT', body: JSON.stringify({ mois_fia: m }) }),
};

// ─── FÊTES ────────────────────────────────────────────────────────────────────

export const fetes = {
  get:    (agentId, year)             => apiFetch(`/fetes/${agentId}/${year}`),
  update: (agentId, year, code, data) => apiFetch(`/fetes/${agentId}/${year}/${code}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ─── EXPORT ───────────────────────────────────────────────────────────────────

const api = { auth, agents, planning, profil, conges, notifications, echanges, pauses, fetes };
export default api;
