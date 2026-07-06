// Patch — BarreSaisie (agent en roulement, pas réserviste) ignorait
// totalement les habilitations pour les postes "journée unique" (DPX PAR,
// Pauseur PAR, ASMTE PAR...) : un bouton générique "Journée" était toujours
// affiché, sans jamais vérifier si l'agent était habilité sur un poste
// journée précis — contrairement aux postes 3×8, déjà correctement gérés
// juste au-dessus dans le même fichier. Corrigé : si l'agent a au moins une
// habilitation sur un poste journée, on propose ce(s) poste(s) précis
// (ex: "ASMTE PAR") au lieu du bouton générique. Sinon, comportement
// inchangé (bouton générique "Journée" conservé).
//
// Usage : node patch_barresaisie_postes_journee_habilites.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'App.jsx');
const NL = '\r\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

const old1 = [
  '    // Journée',
  '    boutonsTravaill.push({',
  '      id:"J", label:"Journée", sublabel:"J",',
  '      equipe:"J", jsCode:"J", prive:false,',
  '      color:getColor("J"), tc:getTc("J"),',
  '    });',
  '  }',
].join(NL);

const new1 = [
  '    // Journée — poste précis si l\'agent y est habilité (ex: ASMTE PAR),',
  '    // sinon bouton générique "Journée" comme avant',
  '    const postesJourneeHab = POSTES_JOURNEE.filter(p=>habilitations && habilitations[p.jsCode]);',
  '    if(postesJourneeHab.length>0){',
  '      postesJourneeHab.forEach(p=>{',
  '        boutonsTravaill.push({',
  '          id: p.jsCode, label: p.label, sublabel:"J",',
  '          equipe:"J", jsCode: p.jsCode, prive:false,',
  '          color:getColor("J"), tc:getTc("J"),',
  '        });',
  '      });',
  '    } else {',
  '      boutonsTravaill.push({',
  '        id:"J", label:"Journée", sublabel:"J",',
  '        equipe:"J", jsCode:"J", prive:false,',
  '        color:getColor("J"), tc:getTc("J"),',
  '      });',
  '    }',
  '  }',
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'postes-journee-habilites');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — App.jsx patché (postes journée habilités proposés spécifiquement, ex: ASMTE PAR)');
