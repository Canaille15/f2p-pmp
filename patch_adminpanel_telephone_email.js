// Patch — AdminPanel : ajoute les champs Téléphone/Email dans la modale
// "Modifier un agent". Le backend accepte déjà ces champs pour un admin
// (agentController.update ne les restreint pas à l'auto-édition) — aucun
// changement backend nécessaire, uniquement l'UI qui manquait.
// L'agent garde la main pour mettre à jour lui-même ces champs depuis
// "Mon profil" (et choisir sa visibilité dans l'Annuaire) — l'admin ne fait
// que compléter la même donnée, dans le même sens, sans rien court-circuiter.
// Usage : node patch_adminpanel_telephone_email.js
// À exécuter depuis : C:\Users\olive\Desktop\f2p-pmp

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'src', 'components', 'AdminPanel.jsx');
const NL = '\n';

function mustReplaceOnce(content, oldStr, newStr, label) {
  const count = content.split(oldStr).length - 1;
  if (count === 0) throw new Error(`[${label}] Ancre introuvable dans ${FILE}`);
  if (count > 1) throw new Error(`[${label}] Ancre trouvée ${count} fois (doit être unique) dans ${FILE}`);
  return content.replace(oldStr, newStr);
}

let content = fs.readFileSync(FILE).toString('utf-8');

// ── 1. État initial + chargement des valeurs actuelles (déchiffrées) au montage ──
const old1 = [
  `function ModalModifier({ agent, onConfirm, onClose }) {`,
  `  const [form, setForm] = useState({ nom: agent.nom || "", prenom: agent.prenom || "", grade: agent.grade || "CO5", famille: agent.famille || "PRCI" });`,
  `  const [nouveauCp, setNouveauCp] = useState(agent.cp || "");`,
  `  const [err, setErr] = useState("");`,
].join(NL);

const new1 = [
  `function ModalModifier({ agent, onConfirm, onClose }) {`,
  `  const [form, setForm] = useState({ nom: agent.nom || "", prenom: agent.prenom || "", grade: agent.grade || "CO5", famille: agent.famille || "PRCI", telephone: "", email: "" });`,
  `  const [nouveauCp, setNouveauCp] = useState(agent.cp || "");`,
  `  const [err, setErr] = useState("");`,
  `  const [coordLoading, setCoordLoading] = useState(true);`,
  `  useEffect(() => {`,
  `    api.agents.getById(agent.cp).then(full => {`,
  `      setForm(p => ({ ...p, telephone: full?.telephone || "", email: full?.email || "" }));`,
  `      setCoordLoading(false);`,
  `    }).catch(() => setCoordLoading(false));`,
  `  }, [agent.cp]);`,
].join(NL);

content = mustReplaceOnce(content, old1, new1, 'modalmodifier-etat-coordonnees');

// ── 2. Inclure telephone/email dans le payload envoyé ──
const old2 = `    onConfirm({ nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim(), grade: form.grade, famille: form.famille, ...(cpChange ? { nouveau_cp: nouveauCp.trim().toUpperCase() } : {}) });`;
const new2 = `    onConfirm({ nom: form.nom.trim().toUpperCase(), prenom: form.prenom.trim(), grade: form.grade, famille: form.famille, telephone: form.telephone.trim(), email: form.email.trim(), ...(cpChange ? { nouveau_cp: nouveauCp.trim().toUpperCase() } : {}) });`;
content = mustReplaceOnce(content, old2, new2, 'modalmodifier-payload-coordonnees');

// ── 3. Champs de saisie Téléphone/Email dans le formulaire ──
const old3 = [
  `          { label: "Prenom *", key: "prenom", placeholder: "ex: Jean" },`,
  `        ].map(({ label, key, placeholder }) => (`,
  `          <div key={key}>`,
  `            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</div>`,
  `            <input`,
  `              value={form[key]}`,
  `              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}`,
  `              placeholder={placeholder}`,
  `              style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}`,
  `            />`,
  `          </div>`,
  `        ))}`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Grade</div>`,
  `          <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}`,
  `            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}>`,
  `            {GRADES.map(g => <option key={g}>{g}</option>)}`,
  `          </select>`,
  `        </div>`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Famille</div>`,
].join(NL);

const new3 = [
  `          { label: "Prenom *", key: "prenom", placeholder: "ex: Jean" },`,
  `        ].map(({ label, key, placeholder }) => (`,
  `          <div key={key}>`,
  `            <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>{label}</div>`,
  `            <input`,
  `              value={form[key]}`,
  `              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}`,
  `              placeholder={placeholder}`,
  `              style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}`,
  `            />`,
  `          </div>`,
  `        ))}`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Téléphone {coordLoading&&"(chargement…)"}</div>`,
  `          <input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))}`,
  `            placeholder="ex: 06 12 34 56 78"`,
  `            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}`,
  `          />`,
  `        </div>`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Email {coordLoading&&"(chargement…)"}</div>`,
  `          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}`,
  `            placeholder="ex: prenom.nom@sncf.fr"`,
  `            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" }}`,
  `          />`,
  `        </div>`,
  `        <div style={{ fontSize: 11, color: "#94a3b8" }}>L'agent peut toujours modifier ces informations lui-même depuis "Mon profil", et choisir d'apparaître ou non dans l'Annuaire.</div>`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Grade</div>`,
  `          <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))}`,
  `            style={{ width: "100%", padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}>`,
  `            {GRADES.map(g => <option key={g}>{g}</option>)}`,
  `          </select>`,
  `        </div>`,
  `        <div>`,
  `          <div style={{ fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Famille</div>`,
].join(NL);

content = mustReplaceOnce(content, old3, new3, 'modalmodifier-champs-coordonnees');

fs.writeFileSync(FILE, content, 'utf-8');
console.log('OK — AdminPanel.jsx patché (téléphone/email éditables par un admin)');
