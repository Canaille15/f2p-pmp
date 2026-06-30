const fs = require('fs');
const path = './src/api/client.js';
let content = fs.readFileSync(path, 'utf8');

const target = `    // Ajouter periode de nuit si debut de nuit ce soir
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
`;

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join('');
  fs.writeFileSync(path, content, 'utf8');
  console.log('Bloc dupliqué retiré avec succès. client.js mis à jour.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
