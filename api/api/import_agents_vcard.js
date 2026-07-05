// Import ponctuel — renseigne telephone/email des agents à partir de la
// vCard Google Contacts, en croisant nom+prénom exacts avec la table agent.
// 45 agents sur 70 ont été trouvés dans la vCard (25 non trouvés, laissés
// tels quels). Numéros reformatés en français (paires d'espaces, sans
// tirets), format international corrigé pour les numéros mal exportés.
//
// SÉCURITÉ : ce script ne touche JAMAIS un agent qui a déjà renseigné
// lui-même son téléphone ou son email — il ne complète que les champs vides,
// jamais d'écrasement d'une donnée existante.
//
// telephone/email sont chiffrés côté application (AES) — ce script réutilise
// EXACTEMENT la même fonction encrypt() que le reste de l'app pour garantir
// que les données seront déchiffrables normalement ensuite.
//
// Usage : node import_agents_vcard.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp\api\api

require('dotenv').config();
const pool = require('./src/config/db');
const { encrypt } = require('./src/utils/crypto');

const donnees = [
  { cp: '7308021B', nom: 'AUDREN', prenom: 'Gildas', telephone: '06 44 90 74 91', email: null },
  { cp: '9310997Z', nom: 'AUDREN', prenom: 'Yvon', telephone: '07 82 68 47 69', email: null },
  { cp: '9306595P', nom: 'AUREILLE', prenom: 'Baptiste', telephone: '06 75 89 14 69', email: 'baptiste.aureille@reseau.sncf.fr' },
  { cp: '9111837W', nom: 'BARBASTE', prenom: 'Thomas', telephone: '06 19 31 46 95', email: null },
  { cp: '8012546B', nom: 'BATY', prenom: 'Audrey', telephone: '06 25 61 00 60', email: null },
  { cp: '9708096B', nom: 'BECHTOLD', prenom: 'Romain', telephone: '06 66 89 07 60', email: null },
  { cp: '6810186B', nom: 'BEFFARAL', prenom: 'Olivier', telephone: '06 20 60 11 34', email: 'olivier.beffaral@reseau.sncf.fr' },
  { cp: '7610086H', nom: 'BELLISSENT', prenom: 'Christophe', telephone: '06 08 37 62 01', email: 'christophe.bellissent@reseau.sncf.fr' },
  { cp: '8610828W', nom: 'BELOTTI', prenom: 'Florent', telephone: '06 24 15 63 17', email: 'florent.belotti@reseau.sncf.fr' },
  { cp: '8610679J', nom: 'BENDIKHA', prenom: 'Sofiane', telephone: '07 77 31 29 15', email: null },
  { cp: '7611330K', nom: 'BOLZER', prenom: 'Charles', telephone: '06 85 23 21 47', email: 'charles.bolzer@reseau.sncf.fr' },
  { cp: '0020937H', nom: 'BOUHEND', prenom: 'Ryad', telephone: '06 85 93 45 84', email: null },
  { cp: '8910463L', nom: 'CAILLET', prenom: 'Maxime', telephone: '06 52 19 01 96', email: null },
  { cp: '8308634Z', nom: 'CAMPOY', prenom: 'Nicolas', telephone: '06 73 73 67 17', email: 'nicolas.campoy@reseau.sncf.fr' },
  { cp: '7706626T', nom: 'CHAHMI', prenom: 'Rochdi', telephone: '06 66 05 46 24', email: 'rochdi.chahmi@reseau.sncf.fr' },
  { cp: '8601333A', nom: 'CHENEVOTOT', prenom: 'Lionel', telephone: '06 69 05 61 07', email: null },
  { cp: '7912579E', nom: 'CHOUAIB', prenom: 'Wassim', telephone: '07 66 38 67 30', email: null },
  { cp: '8408451W', nom: 'COIRRE', prenom: 'Yannick', telephone: '06 19 30 86 51', email: 'yannick.coirre@reseau.sncf.fr' },
  { cp: '0021824X', nom: 'CORDEAU', prenom: 'Maxime', telephone: '06 25 14 40 03', email: null },
  { cp: '7810718E', nom: 'COSAQUE', prenom: 'Patrick', telephone: '06 99 28 46 67', email: null },
  { cp: '8311899Y', nom: 'DRAME', prenom: 'Ibrahima', telephone: '06 17 18 29 47', email: null },
  { cp: '8702389U', nom: 'DUPUY', prenom: 'Victorien', telephone: '07 86 89 50 15', email: 'victorien.dupuy@reseau.sncf.fr' },
  { cp: '8403120B', nom: 'EL ADRAOUI', prenom: 'Mounir', telephone: '06 26 85 10 22', email: null },
  { cp: '0018785U', nom: 'FAROUIL', prenom: 'Cameron', telephone: '07 82 98 54 71', email: null },
  { cp: '8408011T', nom: 'HAIDER', prenom: 'Zesheen', telephone: '06 68 33 59 16', email: 'zesheen.haider@reseau.sncf.fr' },
  { cp: '8912949N', nom: 'HERN', prenom: 'Michael', telephone: '06 50 67 71 08', email: null },
  { cp: '9708087U', nom: 'HUMEZ', prenom: 'Cindy', telephone: '06 79 36 40 96', email: null },
  { cp: '8812202F', nom: 'HUTIN', prenom: 'Thomas', telephone: '06 70 69 38 22', email: null },
  { cp: '8411537A', nom: 'JAN', prenom: 'Kevin', telephone: '06 31 47 12 98', email: null },
  { cp: '8611158E', nom: 'KINET', prenom: 'Julien', telephone: '07 68 17 36 16', email: null },
  { cp: '7810294A', nom: 'LAFRANCE', prenom: 'Cyril', telephone: '06 61 26 92 56', email: null },
  { cp: '9506539V', nom: 'LE MOISY', prenom: 'Tom', telephone: '06 25 70 25 77', email: null },
  { cp: '8902138M', nom: 'LEGOGUELIN', prenom: 'Antoine', telephone: '06 95 40 23 11', email: 'antoine.legoguelin@reseau.sncf.fr' },
  { cp: '9004046G', nom: 'LOGEAIS', prenom: 'Leslie', telephone: '06 37 76 06 51', email: 'leslie.logeais@reseau.sncf.fr' },
  { cp: '7904979U', nom: 'LUCAS', prenom: 'Samuel', telephone: '06 63 66 10 82', email: null },
  { cp: '9608170N', nom: 'MAILLET', prenom: 'Antoine', telephone: '06 72 66 18 84', email: null },
  { cp: '9408295H', nom: 'MALY', prenom: 'Christophe', telephone: '06 95 45 32 90', email: 'christophe.maly@reseau.sncf.fr' },
  { cp: '8411092S', nom: 'MASUY', prenom: 'Thomas', telephone: '06 48 15 03 93', email: null },
  { cp: '8311909J', nom: 'MENDY', prenom: 'Alexandre', telephone: '07 65 83 84 40', email: null },
  { cp: '9002923L', nom: 'MERCIER', prenom: 'Yoann', telephone: '06 35 54 83 79', email: 'yoann.mercier@reseau.sncf.fr' },
  { cp: '7112569D', nom: 'MIGNOT', prenom: 'Olivier', telephone: '06 81 64 23 83', email: 'olivier.mignot@reseau.sncf.fr' },
  { cp: '7809865J', nom: 'MILLERAND', prenom: 'Thomas', telephone: '06 21 65 47 99', email: null },
  { cp: '9207889A', nom: 'PASTANT', prenom: 'Maxime', telephone: '06 84 47 74 73', email: null },
  { cp: '9104869X', nom: 'SCHRAMM', prenom: 'Camille', telephone: '06 34 69 31 82', email: null },
  { cp: '8811132T', nom: 'VICENTE CARREIRA', prenom: 'Lucile', telephone: '06 32 52 43 58', email: null },
];

async function run() {
  let miseAJour = 0, ignoreDejaRempli = 0, introuvable = 0;
  for (const d of donnees) {
    const [rows] = await pool.query('SELECT telephone, email FROM agent WHERE cp = ?', [d.cp]);
    if (!rows.length) {
      console.log(`⚠ CP introuvable en base, ignoré : ${d.cp} (${d.nom} ${d.prenom})`);
      introuvable++;
      continue;
    }
    const agent = rows[0];
    const fields = [], values = [];
    if (d.telephone && !agent.telephone) { fields.push('telephone = ?'); values.push(encrypt(d.telephone)); }
    if (d.email && !agent.email)         { fields.push('email = ?');     values.push(encrypt(d.email)); }
    if (!fields.length) {
      console.log(`— ${d.nom} ${d.prenom} (${d.cp}) : déjà renseigné, non touché`);
      ignoreDejaRempli++;
      continue;
    }
    values.push(d.cp);
    await pool.query(`UPDATE agent SET ${fields.join(', ')} WHERE cp = ?`, values);
    console.log(`✓ ${d.nom} ${d.prenom} (${d.cp}) mis à jour`);
    miseAJour++;
  }
  console.log(`\nTerminé : ${miseAJour} agent(s) mis à jour, ${ignoreDejaRempli} déjà renseigné(s) (non écrasés), ${introuvable} CP introuvable(s).`);
  try { await pool.end(); } catch(e) {}
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
