const fs = require('fs');
const path = 'src/components/AdminPanel.jsx';
let content = fs.readFileSync(path, 'utf8');

if (content.includes('nouveauCp')) {
  console.log('Deja modifie, rien a faire.');
  process.exit(0);
}

// ETAPE 1 : ajouter l'etat nouveauCp dans ModalModifier
const anchor1 = 'const [form, setForm] = useState({ nom: agent.nom || "", prenom: agent.prenom || "", grade: agent.grade || "CO5", famille: agent.famille || "PRCI" });';
const idx1 = content.indexOf(anchor1);
if (idx1 === -1) { console.log('ERREUR: anchor1 introuvable'); process.exit(1); }
const new1 = anchor1 + '\n  const [nouveauCp, setNouveauCp] = useState(agent.cp || "");';
content = content.slice(0, idx1) + new1 + content.slice(idx1 + anchor1.length);
console.log('Etape 1 OK - etat nouveauCp ajoute');

// ETAPE 2 : modifier la fonction submit pour inclure nouveau_cp et la confirmation
const idx2Start = content.indexOf('function submit() {\n    if (!form.nom.trim())');
if (idx2Start === -1) { console.log('ERREUR: submit de ModalModifier introuvable'); process.exit(1); }
const idx2End = content.indexOf('\n  }', idx2Start) + 3;
const originalSubmit = content.slice(idx2Start, idx2End);
console.log('submit() capture:');
console.log(originalSubmit);

const newSubmit = `function submit() {
    if (!form.nom.trim()) return setErr("Le nom est obligatoire");
    if (!form.prenom.trim()) return setErr("Le prenom est obligatoire");
    if (!nouveauCp.trim()) return setErr("Le CP est obligatoire");
    const cpChange = nouveauCp.trim().toUpperCase() !== agent.cp;
    if (cpChange && !window.confirm(\`Changer le CP de \${agent.cp} vers \${nouveauCp.trim().toUpperCase()} ? Cette action met a jour toutes les donnees liees a cet agent.\`)) return;
    setErr("");
    onConfirm({ nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim(), grade: form.grade, famille: form.famille, ...(cpChange ? { nouveau_cp: nouveauCp.trim().toUpperCase() } : {}) });
  }`;

content = content.slice(0, idx2Start) + newSubmit + content.slice(idx2End);
console.log('Etape 2 OK - submit modifie (nouveau_cp + confirmation)');

// ETAPE 3 : remplacer le champ CP en lecture seule par un champ modifiable
const anchor3 = `<div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>CP SNCF</div>
          <input value={agent.cp} disabled style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#f8fafc", color: "#94a3b8" }}/>
        </div>`;
const idx3 = content.indexOf(anchor3);
if (idx3 === -1) { console.log('ERREUR: anchor3 introuvable'); process.exit(1); }
const new3 = `<div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>CP SNCF</div>
          <input value={nouveauCp} onChange={e => setNouveauCp(e.target.value)} style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}/>
        </div>`;
content = content.slice(0, idx3) + new3 + content.slice(idx3 + anchor3.length);
console.log('Etape 3 OK - champ CP rendu modifiable');

fs.writeFileSync(path, content, 'utf8');
console.log('TERMINE - fichier sauvegarde');
