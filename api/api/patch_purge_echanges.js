const fs = require('fs');
const path = './src/controllers/echangesController.js';
let content = fs.readFileSync(path, 'utf8');

const target = `async function getEchanges(req, res) {
  try {
    const [rows] = await pool.query(`;

const replacement = `async function getEchanges(req, res) {
  try {
    // Purge automatique : on retire les demandes dont la date est passée de plus de 2 mois
    await pool.query("DELETE FROM echange WHERE date_jour < DATE_SUB(CURDATE(), INTERVAL 2 MONTH)");

    const [rows] = await pool.query(`;

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Purge automatique ajoutée avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
