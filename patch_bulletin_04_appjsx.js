// patch_bulletin_04_appjsx.js
// Ajoute :
//  1) les fonctions de parsing du bulletin de commande / déroulé prévisionnel (texte PDF + fallback OCR)
//  2) le composant BulletinImportButton
//  3) son intégration dans la toolbar de Mon Planning (PersonalView), réservée au titulaire du planning
// Exécution : node patch_bulletin_04_appjsx.js (depuis la racine du projet)

const fs = require('fs');
const path = require('path');

function mustReplaceOnce(content, search, replace, label) {
  const count = content.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`[${label}] Ancre trouvée ${count} fois (attendu 1). Abandon sans modification.`);
  }
  return content.replace(search, replace);
}

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

if (content.includes('function BulletinImportButton')) {
  console.log('⚠️  BulletinImportButton existe déjà dans App.jsx — aucune modification appliquée.');
  process.exit(0);
}

// ── 1. Helpers de parsing + composant (insérés en scope module, avant TODAY) ──
const anchorHelpers = `const _todayDate=new Date();`;

const helpersBlock = `// ─── IMPORT BULLETIN DE COMMANDE / DÉROULÉ PRÉVISIONNEL ──────────────────────
const BULLETIN_OCR_APIKEY = "K85147389088957";

async function ocrImageViaOcrSpace(imageB64, mimeType) {
  const form = new URLSearchParams();
  form.append("apikey", BULLETIN_OCR_APIKEY);
  form.append("base64Image", "data:" + mimeType + ";base64," + imageB64);
  form.append("filetype", "Auto");
  form.append("OCREngine", "2");
  form.append("isTable", "true");
  const res = await fetch("https://api.ocr.space/parse/image", { method: "POST", body: form });
  const data = await res.json();
  if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage?.[0] || "Erreur OCR");
  return data.ParsedResults?.map(r => r.ParsedText).join("\\n") || "";
}

async function extraireTextePdfNatif(base64Pdf) {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  const raw = atob(base64Pdf);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tcontent = await page.getTextContent();
    const rows = {};
    tcontent.items.forEach(it => {
      const y = Math.round(it.transform[5]);
      if (!rows[y]) rows[y] = [];
      rows[y].push({ x: it.transform[4], s: it.str });
    });
    const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    const lines = ys.map(y => rows[y].sort((a, b) => a.x - b.x).map(o => o.s).join(" ").replace(/\\s+/g, " ").trim()).filter(Boolean);
    pages.push(lines.join("\\n"));
  }
  return pages.join("\\n");
}

// Déduit le code_equipe (M/AM/N/J/RP/CA/...) depuis le code brut "Utilisation" du bulletin
function deriveCodeEquipeBulletin(code, heureDebut) {
  if (/^RP$/.test(code)) return "RP";
  if (/^RU$/.test(code)) return "RU";
  if (/^RQ$/.test(code)) return "RQ";
  if (/^C$/.test(code) || /^CA$/.test(code)) return "CA";
  if (/^F\\d$/.test(code)) return "JF";
  if (/^DISPO$/i.test(code)) return "DISPO";
  if (code.endsWith("J")) return "J";
  if (code.endsWith("-")) return "M";
  if (code.endsWith("O")) return "AM";
  if (code.endsWith("X")) return "N";
  if (heureDebut) {
    const h = parseInt(heureDebut.slice(0, 2), 10);
    if (h >= 4 && h < 11) return "M";
    if (h >= 11 && h < 20) return "AM";
    return "N";
  }
  return null;
}

// Déroulé prévisionnel : pas d'horaire fourni dans le document -> horaire générique de l'équipe (EQUIPES)
function deduireHoraireGeneriqueEquipe(codeEquipe) {
  const eq = EQ[codeEquipe];
  if (!eq || !eq.heures) return { heure_debut: null, heure_fin: null };
  const m = eq.heures.match(/(\\d{2})h(\\d{2}).(\\d{2})h(\\d{2})/);
  if (!m) return { heure_debut: null, heure_fin: null };
  return { heure_debut: \`\${m[1]}:\${m[2]}:00\`, heure_fin: \`\${m[3]}:\${m[4]}:00\` };
}

// Parse un bulletin de commande SNCF (texte déjà extrait, PDF natif ou OCR) :
// capture la date d'édition + chaque jour (code "Utilisation" + PS/FS si présents)
function parseBulletinCommande(text) {
  const editionMatch = text.match(/Edition le\\s*(\\d{2})\\/(\\d{2})\\/(\\d{4})\\s*,?\\s*(\\d{2}):(\\d{2})/i);
  const editionDate = editionMatch
    ? \`\${editionMatch[3]}-\${editionMatch[2]}-\${editionMatch[1]} \${editionMatch[4]}:\${editionMatch[5]}:00\`
    : null;

  const dayRe = /(Lun|Mar|Mer|Jeu|Ven|Sam|Dim)\\s+(\\S+)/g;
  const matches = [...text.matchAll(dayRe)];
  const jours = [];
  const echecs = [];

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const blockStart = m.index;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const block = text.slice(blockStart, blockEnd);
    const dateMatch = block.match(/(\\d{2})\\/(\\d{2})\\/(\\d{4})/);
    if (!dateMatch) { echecs.push({ extrait: block.slice(0, 50) }); continue; }
    const dateJour = \`\${dateMatch[3]}-\${dateMatch[2]}-\${dateMatch[1]}\`;

    let code = (m[2] || "").trim().replace(/[.,;:]+$/, "");
    if (!code) { echecs.push({ date: dateJour, motif: "code_illisible" }); continue; }

    const psMatch = block.match(/\\b(?:PS|OS)\\s*(\\d{2}):(\\d{2})/i);
    const fsMatch = block.match(/\\b(?:FS|ES)\\s*(\\d{2}):(\\d{2})/i);
    const heureDebut = psMatch ? \`\${psMatch[1]}:\${psMatch[2]}:00\` : null;
    const heureFin = fsMatch ? \`\${fsMatch[1]}:\${fsMatch[2]}:00\` : null;
    const codeEquipe = deriveCodeEquipeBulletin(code, heureDebut);
    const estCodeSpecial = /^(RP|RU|RQ|C|CA|DISPO)$/.test(code) || /^F\\d$/.test(code);

    jours.push({
      date_jour: dateJour,
      code_poste: estCodeSpecial ? null : code,
      code_equipe: codeEquipe,
      heure_debut: heureDebut,
      heure_fin: heureFin,
      source_edition_date: editionDate,
    });
  }
  return { editionDate, jours, echecs };
}

function BulletinImportButton({ agentCp, onImported }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setBusy(true); setResult(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = reader.result.split(",")[1];
        let text = "";
        if (file.type === "application/pdf") {
          text = await extraireTextePdfNatif(b64);
          if (!text || text.replace(/\\s/g, "").length < 30) {
            // PDF scanné sans texte natif -> fallback OCR page par page
            const pdfjsLib = await import("pdfjs-dist");
            pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
            const raw = atob(b64); const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
            const texts = [];
            for (let n = 1; n <= pdf.numPages; n++) {
              const page = await pdf.getPage(n);
              const viewport = page.getViewport({ scale: 3.0 });
              const canvas = document.createElement("canvas");
              canvas.width = viewport.width; canvas.height = viewport.height;
              await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
              const pageB64 = canvas.toDataURL("image/png").split(",")[1];
              texts.push(await ocrImageViaOcrSpace(pageB64, "image/png"));
            }
            text = texts.join("\\n");
          }
        } else {
          text = await ocrImageViaOcrSpace(b64, file.type || "image/jpeg");
        }
        if (!text) throw new Error("Aucun texte extrait du document");

        const { jours, echecs } = parseBulletinCommande(text);
        if (jours.length === 0) throw new Error("Aucun jour reconnu — vérifie le format du document");

        const entries = jours.map(j => {
          if (!j.heure_debut && j.code_equipe && ["M", "AM", "N", "J"].includes(j.code_equipe)) {
            const h = deduireHoraireGeneriqueEquipe(j.code_equipe);
            return { ...j, heure_debut: h.heure_debut, heure_fin: h.heure_fin };
          }
          return j;
        });

        const resp = await api.planning.importBulletin(agentCp, entries, "bulletin");
        setResult({ nb: resp?.nb_appliques || 0, ignores: resp?.ignores || [], echecs });
        if (typeof onImported === "function") onImported();
      } catch (err) {
        setResult({ error: err.message });
      }
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ cursor: "pointer" }}>
        <div style={{ background: busy ? "#94a3b8" : "#0f4c81", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
          {busy ? "⏳ Analyse…" : "📥 Importer un bulletin"}
        </div>
        <input type="file" accept=".pdf,image/*" onChange={handleFile} style={{ display: "none" }} disabled={busy} />
      </label>
      {result?.nb !== undefined && !result.error && <span style={{ fontSize: 10, background: "#f0fdf4", color: "#16a34a", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>
        ✅ {result.nb} jour(s) importé(s){result.ignores?.length ? \` · \${result.ignores.length} ignoré(s) (déjà à jour)\` : ""}{result.echecs?.length ? \` · \${result.echecs.length} jour(s) à vérifier manuellement\` : ""}
      </span>}
      {result?.error && <span style={{ fontSize: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "4px 10px", fontWeight: 700 }}>❌ {result.error}</span>}
    </div>
  );
}

`;

content = mustReplaceOnce(content, anchorHelpers, helpersBlock + anchorHelpers, 'App.jsx helpers bulletin');

// ── 2. Intégration du bouton dans la toolbar de Mon Planning (PersonalView) ──
const anchorButton = `<AgentHeader agent={agent} profile={profile} counts={counts} compteurYear={compteurYear} setCompteurYear={setCompteurYear} onImportDP={onImportDP} onDemandeConges={()=>setShowDemandeConges(true)} onCouleurs={()=>setShowColorPicker(true)} onHabilitations={()=>setShowHab(true)} onRoulementChange={r=>setProfile({roulement:r})} onReservisteChange={v=>setProfile({isReserve:v})} isOwnProfile={isOwnProfile}/>`;

const buttonBlock = anchorButton + `
    {isOwnProfile && <BulletinImportButton agentCp={agent.immatriculation||agent.cp||agent.id} onImported={()=>{
      const agCp=agent.immatriculation||agent.cp||agent.id;
      api.planning.getSchedule(agCp).then(entries=>{ if (entries) setSchedule(prev=>({...prev, ...entries})); });
    }}/>}`;

content = mustReplaceOnce(content, anchorButton, buttonBlock, 'App.jsx bouton import bulletin');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ App.jsx mis à jour : parsing bulletin + bouton "Importer un bulletin" ajoutés (Mon Planning, titulaire uniquement).');
console.log("⚠️  Rappel : tester d'abord avec le PDF Pastant/Dupuy fournis avant de valider en prod.");
