const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'api', 'client.js');
let c = fs.readFileSync(filePath, 'utf8');

const old = `    }),\r\n};\r\n\r\n// \u2500\u2500\u2500 MODULE CONG\u00c9S`;
const newCode = `    }),\r\n\r\n  /**\r\n   * Sauvegarder le profil d'un agent (couleurs, habilitations, etc.)\r\n   */\r\n  async save(agentId, data) {\r\n    return apiFetch(\`/profil/\${agentId}\`, {\r\n      method: 'PUT',\r\n      headers: { 'Content-Type': 'application/json' },\r\n      body: JSON.stringify({\r\n        roulement:                data.roulement              || null,\r\n        is_reserve:               data.isReserve              || false,\r\n        familles_hab:             data.famillesHab            || null,\r\n        habilitations:            data.habilitations          || {},\r\n        agent_colors:             data.agentColors            || {},\r\n        pause_figee:              data.pauseFigee             || {},\r\n        compteur_corrections:     data.compteurCorrections    || {},\r\n        fetes_tracking:           data.fetesTracking          || {},\r\n        pause_figee_fia_mois:     data.pauseFigeeFiaMois      || {},\r\n        pause_figee_fia_done:     data.pauseFigeeFiaDone      || {},\r\n        demandes_conges:          data.demandesConges         || [],\r\n        notifications_acquittees: data.notificationsAcquittees|| [],\r\n      }),\r\n    });\r\n  },\r\n};\r\n\r\n// \u2500\u2500\u2500 MODULE CONG\u00c9S`;

if(c.includes(old)) {
  c = c.replace(old, newCode);
  console.log('OK - fonction save ajoutée dans profil');
} else {
  console.log('ERREUR - fin du module profil non trouvée');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
