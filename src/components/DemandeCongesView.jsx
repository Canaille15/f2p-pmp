import { useState, useRef } from "react";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ─── Coordonnées validées sur le formulaire officiel SNCF "GA_demande_autorisation_absence.pdf" ───
const RECT = {
  nom: [83.5, 223.6],
  prenom: [269.2, 412.4],
  cp: [
    [414.376, 428.591], [431.969, 445.63], [447.095, 461.31], [462.752, 477.522],
    [478.409, 492.625], [493.535, 507.195], [507.66, 522.43], [525.402, 539.061],
  ],
  grade: [93.36, 128.4],
  unite: [212.88, 426],
  etablissement: [128.4, 426],
  dateHeure: [552.96, 636.48],
  periodes: [
    { debut: [171.232, 261.544], fin: [297.463, 381.703], jours: [427.111, 518.071] },
    { debut: [171.232, 261.544], fin: [297.463, 381.703], jours: [427.111, 518.071] },
    { debut: [171.232, 261.544], fin: [296.687, 380.927], jours: [427.111, 518.071] },
  ],
};
const Y = {
  identite: 413, cp: 413, grade: 398, unite: 400, etablissement: 383,
  dateHeureLigne1: 402, dateHeureLigne2: 390,
  periodes: [362, 347, 333],
  repartition: 250,
};
const A4_W = 841.89, A4_H = 595.276;

const OPTIONS_POSTE = ["PRCI PMP", "PAR PMP"];

// Types d'absence sélectionnables (multi-choix), avec quantité optionnelle
const TYPES_ABSENCE = ["Congé annuel", "RU", "RQ", "RN", "Fête légale", "Congé supplémentaire", "Reliquat de congé"];

// Calcul explicite en UTC pour éviter tout souci de fuseau horaire /
// d'interprétation de date selon le moteur JS.
function nbJours(debut, fin) {
  if (!debut || !fin) return "";
  const [a1, m1, j1] = debut.split("-").map(Number);
  const [a2, m2, j2] = fin.split("-").map(Number);
  if (!a1 || !a2) return "";
  const d1 = Date.UTC(a1, m1 - 1, j1);
  const d2 = Date.UTC(a2, m2 - 1, j2);
  const diff = Math.round((d2 - d1) / 86400000) + 1;
  return diff > 0 ? diff : "";
}
function versDDMMYYYY(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

function messageEmail({ prenom, nom, periodes, repartition }) {
  const periodesValides = periodes.filter(p => p.debut && p.fin);
  const periodesTexte = periodesValides
    .map(p => `du ${versDDMMYYYY(p.debut)} au ${versDDMMYYYY(p.fin)}`)
    .join(" et ");
  const parts = TYPES_ABSENCE.filter(t => repartition[t]?.checked).map(t => {
    let s = t;
    if (t === "Fête légale" && repartition[t].precision) s += ` - ${repartition[t].precision}`;
    if (repartition[t].jours) s += ` (${repartition[t].jours} jour${repartition[t].jours > 1 ? "s" : ""})`;
    return s;
  });
  const repartitionTexte = parts.length
    ? `Je souhaite affecter cette absence sur : ${parts.join(", ")}.`
    : "";
  return `Bonjour,

Ci-joint ma demande d'autorisation d'absence ${periodesTexte}.
${repartitionTexte}

Cordialement,
${prenom} ${nom}`;
}

async function genererPdf({ nom, prenom, cp, grade, poste, etablissement, periodes }) {
  const existingBytes = await fetch("/GA_demande_autorisation_absence.pdf").then(r => r.arrayBuffer());
  const srcDoc = await PDFDocument.load(existingBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);

  const [pageForm] = await outDoc.embedPdf(srcDoc, [1]);
  const [pageInstructions] = await outDoc.embedPdf(srcDoc, [2]);

  function tailleAuto(texte, largeurDispo, tailleMax, f = font, marge = 4) {
    let taille = tailleMax;
    while (taille > 4 && f.widthOfTextAtSize(texte, taille) > (largeurDispo - marge)) taille -= 0.5;
    return taille;
  }

  function fabriquerPageMiseEnPage(embedded) {
    const origW = embedded.width, origH = embedded.height;
    const scale = Math.min(A4_W / origW, A4_H / origH);
    const offsetX = (A4_W - origW * scale) / 2;
    const offsetY = (A4_H - origH * scale) / 2;
    const page = outDoc.addPage([A4_W, A4_H]);
    page.drawPage(embedded, { x: offsetX, y: offsetY, xScale: scale, yScale: scale });
    const versX = (x) => offsetX + x * scale;
    const versY = (y) => offsetY + y * scale;
    const versTaille = (t) => t * scale;
    return { page, versX, versY, versTaille };
  }

  const { page: page1, versX, versY, versTaille } = fabriquerPageMiseEnPage(pageForm);

  function gauche(texte, [x0, x1], y, tailleMax, gras = false) {
    if (!texte) return;
    const f = gras ? fontBold : font;
    const taille = tailleAuto(String(texte), x1 - x0, tailleMax, f);
    page1.drawText(String(texte), { x: versX(x0 + 2), y: versY(y), size: versTaille(taille), font: f });
  }
  function centre(texte, [x0, x1], y, tailleMax) {
    if (!texte) return;
    const taille = tailleAuto(String(texte), x1 - x0, tailleMax);
    const tw = font.widthOfTextAtSize(String(texte), taille);
    page1.drawText(String(texte), { x: versX(x0 + (x1 - x0 - tw) / 2), y: versY(y), size: versTaille(taille), font });
  }

  gauche(nom?.toUpperCase(), RECT.nom, Y.identite, 10);
  gauche(prenom, RECT.prenom, Y.identite, 10);

  const cpStr = (cp || "").toUpperCase().padEnd(8, " ");
  RECT.cp.forEach((rect, i) => centre(cpStr[i]?.trim(), rect, Y.cp, 12));

  gauche(grade, RECT.grade, Y.grade, 7);
  gauche(poste, RECT.unite, Y.unite, 9);
  gauche(etablissement, RECT.etablissement, Y.etablissement, 9);

  const maintenant = new Date();
  centre(maintenant.toLocaleDateString("fr-FR"), RECT.dateHeure, Y.dateHeureLigne1, 9);
  centre(maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), RECT.dateHeure, Y.dateHeureLigne2, 9);

  periodes.forEach((p, i) => {
    if (!p.debut || !p.fin) return;
    const r = RECT.periodes[i];
    const y = Y.periodes[i];
    gauche(versDDMMYYYY(p.debut), r.debut, y, 8);
    gauche(versDDMMYYYY(p.fin), r.fin, y, 8);
    gauche(nbJours(p.debut, p.fin), r.jours, y, 9);
  });

  fabriquerPageMiseEnPage(pageInstructions);

  return outDoc.save();
}

export default function DemandeCongesView({ currentAgent }) {
  const [poste, setPoste] = useState(OPTIONS_POSTE[0]);
  const [periodes, setPeriodes] = useState([{ debut: "", fin: "" }]);
  const [repartition, setRepartition] = useState(
    Object.fromEntries(TYPES_ABSENCE.map(t => [t, { checked: false, jours: "", precision: "" }]))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [messageCopie, setMessageCopie] = useState(false);
  const [messageSurligne, setMessageSurligne] = useState(false);
  const emailCardRef = useRef(null);

  const majPeriode = (i, champ, val) => {
    setPeriodes(prev => prev.map((p, idx) => idx === i ? { ...p, [champ]: val } : p));
  };
  const ajouterPeriode = () => { if (periodes.length < 3) setPeriodes(prev => [...prev, { debut: "", fin: "" }]); };
  const retirerPeriode = (i) => setPeriodes(prev => prev.filter((_, idx) => idx !== i));

  const toggleType = (type) => {
    setRepartition(prev => ({ ...prev, [type]: { ...prev[type], checked: !prev[type].checked } }));
  };
  const majJours = (type, val) => {
    setRepartition(prev => ({ ...prev, [type]: { ...prev[type], jours: val } }));
  };
  const majPrecision = (type, val) => {
    setRepartition(prev => ({ ...prev, [type]: { ...prev[type], precision: val } }));
  };

  const periodesValides = periodes.filter(p => p.debut && p.fin);
  const messageGenere = messageEmail({
    prenom: currentAgent?.prenom || "", nom: currentAgent?.nom || "",
    periodes, repartition,
  });

  const copierMessage = () => {
    navigator.clipboard.writeText(messageGenere).then(() => {
      setMessageCopie(true);
      setTimeout(() => setMessageCopie(false), 2000);
    });
  };

  const generer = async () => {
    setErr(null);
    if (!periodesValides.length) { setErr("Renseigne au moins une période d'absence."); return; }
    const periodeInvalide = periodesValides.find(p => nbJours(p.debut, p.fin) === "");
    if (periodeInvalide) { setErr("Une période a une date de fin antérieure à sa date de début — corrige-la avant de générer."); return; }
    setBusy(true);
    try {
      const bytes = await genererPdf({
        nom: currentAgent?.nom || "",
        prenom: currentAgent?.prenom || "",
        cp: currentAgent?.cp || currentAgent?.id || "",
        grade: currentAgent?.grade || "",
        poste,
        etablissement: "EIC PSO",
        periodes: periodesValides,
      });
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const dateNom = periodesValides[0].debut.split("-").reverse().join("-");
      a.href = url;
      a.download = `Demande de conges du ${dateNom}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      emailCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setMessageSurligne(true);
      setTimeout(() => setMessageSurligne(false), 2500);
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la génération du PDF. Réessaie.");
    }
    setBusy(false);
  };

  const champStyle = { width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14 };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4, display: "block" };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🗓️ Demande de congés</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Nom, prénom, CP et grade sont pris automatiquement depuis ton profil.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Poste</label>
            <select value={poste} onChange={e => setPoste(e.target.value)} style={champStyle}>
              {OPTIONS_POSTE.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          {periodes.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 8, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>{["1ère", "2ème", "3ème"][i]} période</label>
                {periodes.length > 1 && (
                  <button onClick={() => retirerPeriode(i)} style={{ border: "none", background: "none", color: "#991b1b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Retirer</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={p.debut} onChange={e => majPeriode(i, "debut", e.target.value)} style={champStyle} />
                <span style={{ color: "#94a3b8", fontSize: 12 }}>au</span>
                <input type="date" value={p.fin} onChange={e => majPeriode(i, "fin", e.target.value)} style={champStyle} />
              </div>
              {p.debut && p.fin && nbJours(p.debut, p.fin) !== "" && (
                <div style={{ fontSize: 12, color: "#0C447C", fontWeight: 600 }}>{nbJours(p.debut, p.fin)} jour(s) — calculé automatiquement</div>
              )}
              {p.debut && p.fin && nbJours(p.debut, p.fin) === "" && (
                <div style={{ fontSize: 12, color: "#991b1b", fontWeight: 600 }}>⚠️ La date de fin doit être après la date de début</div>
              )}
            </div>
          ))}

          {periodes.length < 3 && (
            <button onClick={ajouterPeriode} style={{ border: "none", background: "none", color: "#0C447C", fontWeight: 700, fontSize: 13, cursor: "pointer", textAlign: "left", padding: 0 }}>
              + Ajouter une période
            </button>
          )}

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          <div>
            <label style={labelStyle}>Répartition souhaitée (coche un ou plusieurs, quantité optionnelle)</label>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>
              Laisse le nombre de jours vide si tu préfères laisser l'agent de commande répartir lui-même sur la période — coche juste ce que tu veux voir décompté.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TYPES_ABSENCE.map(type => (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#1e293b", minWidth: 140, cursor: "pointer" }}>
                    <input type="checkbox" checked={repartition[type].checked} onChange={() => toggleType(type)} />
                    {type}
                  </label>
                  {repartition[type].checked && (
                    <>
                      <input
                        type="number" min="0" step="0.5" placeholder="jours (optionnel)"
                        value={repartition[type].jours}
                        onChange={e => majJours(type, e.target.value)}
                        style={{ width: 130, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                      />
                      {type === "Fête légale" && (
                        <input
                          placeholder="laquelle (ex: Pentecôte)"
                          value={repartition[type].precision}
                          onChange={e => majPrecision(type, e.target.value)}
                          style={{ flex: 1, minWidth: 140, padding: "6px 8px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {err && <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>{err}</div>}

          <div style={{ fontSize: 12, color: "#0C447C", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "8px 10px", fontWeight: 600 }}>
            💡 Un message email prêt à copier t'attend juste en dessous — pense à l'envoyer avec ton PDF.
          </div>

          <button onClick={generer} disabled={busy} style={{ padding: "13px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer", background: "#0C447C", color: "#fff", marginTop: 8 }}>
            {busy ? "Génération…" : "📄 Générer le PDF"}
          </button>
        </div>
      </div>

      <div ref={emailCardRef} style={{
        background: "#fff",
        border: messageSurligne ? "1.5px solid #0C447C" : "1.5px solid #e2e8f0",
        borderRadius: 14, padding: 20,
        boxShadow: messageSurligne ? "0 0 0 4px #bfdbfe" : "none",
        transition: "box-shadow .3s, border-color .3s",
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>✉️ Message pour ton email</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
          À coller toi-même dans ton email au moment d'envoyer le PDF généré ci-dessus.
        </div>
        <textarea
          readOnly value={messageGenere} rows={7}
          style={{ width: "100%", padding: 12, border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "#f8fafc", color: "#1e293b" }}
        />
        <button onClick={copierMessage} style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", background: messageCopie ? "#16a34a" : "#0C447C", color: "#fff" }}>
          {messageCopie ? "✓ Copié !" : "Copier le message"}
        </button>
      </div>
    </div>
  );
}
