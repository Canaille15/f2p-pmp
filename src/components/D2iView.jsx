import { useState, useRef, useEffect } from "react";
import { PDFDocument, StandardFonts } from "pdf-lib";

// ─── D2I — Déclaration Individuelle d'Intention (grève) ────────────────────
// Document reconstruit intégralement en vectoriel (15/08, à partir d'un scan
// papier fourni par Olivier) — texte identique au mot près à l'original, sauf
// "Paris Rive Gauche" → "Paris Sud-Ouest" et "UO Paris Montparnasse COGC" →
// "UO Paris Versailles" (demandés explicitement). Coordonnées ci-dessous
// extraites directement du script qui a construit public/D2I_declaration_greve.pdf
// (mêmes valeurs, jamais devinées) — toute vraie case à cocher dessinée par-
// dessus une case vide du PDF de fond, même principe que DemandeCongesView.jsx.
const RECT = {
  preavisDuDate: { x: 186.67, y: 612.99, w: 60 },
  preavisDuH: { x: 257.79, y: 612.99, w: 26 },
  preavisDuM: { x: 289.35, y: 612.99, w: 26 },
  preavisAuDate: { x: 334.81, y: 612.99, w: 60 },
  preavisAuH: { x: 405.93, y: 612.99, w: 26 },
  preavisAuM: { x: 437.49, y: 612.99, w: 26 },
  nom: { x: 147.24, y: 519.99, w: 130 },
  prenom: { x: 337.31, y: 519.99, w: 110 },
  cp: { x: 477.38, y: 519.99, w: 80 },
  etablissement: { x: 188.34, y: 497.99, w: 300 },
  cbIntention: { x: 55, y: 470.69, w: 8, h: 8 },
  intentionDate: { x: 350.87, y: 471.99, w: 60 },
  intentionH: { x: 421.99, y: 471.99, w: 30 },
  intentionM: { x: 457.55, y: 471.99, w: 30 },
  cbSuiteDii: { x: 55, y: 448.69, w: 8, h: 8 },
  diiNumero: { x: 180.44, y: 449.99, w: 70 },
  cbRenoncer: { x: 95, y: 430.69, w: 8, h: 8 },
  cbReprendre: { x: 95, y: 412.69, w: 8, h: 8 },
  reprendreDate: { x: 264.4, y: 413.99, w: 60 },
  reprendreH: { x: 335.52, y: 413.99, w: 30 },
  reprendreM: { x: 371.08, y: 413.99, w: 30 },
  agentLieu: { x: 64.45, y: 373.99, w: 140 },
  agentDate: { x: 223.35, y: 373.99, w: 80 },
  // 15/08, 2e passe (signature trop petite, signale par Olivier — "un
  // confetti") : la boite 2 du template a ete elargie verticalement autour de
  // cette ligne spécifiquement pour degager une vraie zone de signature
  // (avant : 22pt de haut, largement insuffisant pour une signature ~500x250px
  // sans l'ecraser a une taille illisible). Desormais 40pt de haut, la plus
  // grande zone que la mise en page du cadre permet sans chevaucher la ligne
  // "Reprendre le travail" au-dessus ni les renvois (1)-(4) en dessous.
  agentSignature: { x: 385, y: 367.99, w: 145, h: 40 },
  recuNomAgent: { x: 176.02, y: 100.99, w: 150 },
};

// Notice réglementaire DII (15/08, texte fourni verbatim par Olivier — pas
// d'interprétation, même principe que les autres notices du projet).
const NOTICE_DII = `Rappel sur la DII de grève :

- La DII doit être portée à la connaissance de l'employeur au plus tard 48 heures avant que l'agent participe à la grève.
Pour être prise en compte, la DII doit être envoyée par l'agent à l'adresse mail suivante : uo.pmpcogc.dii@sncf.fr

- Les agents qui renoncent à participer à la grève doivent informer leur employeur au plus tard 24 heures avant l'heure prévue de leur participation.

- L'agent qui participe à la grève et qui décide de reprendre son service en informe son employeur au plus tard vingt-quatre heures avant l'heure de sa reprise.
Cette information n'est pas requise lorsque la reprise du service est consécutive à la fin de la grève.`;

function NoticeDii() {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (ouvert) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [ouvert]);
  return (
    <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 14 }}>
      <button onClick={() => setOuvert(v => !v)} style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {ouvert ? "▴" : "▾"} 📖 La Déclaration d'Intention Individuelle (DII)
      </button>
      {ouvert && (
        <div ref={ref} style={{ marginTop: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: "#334155", whiteSpace: "pre-line", lineHeight: 1.5 }}>
          {NOTICE_DII}
        </div>
      )}
    </div>
  );
}

function versDDMMYYYY(iso) {
  if (!iso) return "";
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}

async function genererPdf({ nom, prenom, cp, etablissement, preavis, choix, intention, diiNumero, sousChoix, reprendre, lieu, signatureDataUrl }) {
  const templateBytes = await fetch("/D2I_declaration_greve.pdf").then(r => r.arrayBuffer());
  const srcDoc = await PDFDocument.load(templateBytes);
  const outDoc = await PDFDocument.create();
  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const [pageEmbedded] = await outDoc.embedPdf(srcDoc, [0]);
  const page = outDoc.addPage([pageEmbedded.width, pageEmbedded.height]);
  page.drawPage(pageEmbedded, { x: 0, y: 0, xScale: 1, yScale: 1 });

  function texte(str, rect, size = 9.5) {
    if (!str) return;
    page.drawText(String(str), { x: rect.x + 2, y: rect.y + 2, size, font });
  }
  function centreDans(str, rect, size = 9.5) {
    if (!str) return;
    const w = font.widthOfTextAtSize(String(str), size);
    page.drawText(String(str), { x: rect.x + (rect.w - w) / 2, y: rect.y + 2, size, font });
  }
  function cocher(rect) {
    page.drawText("X", { x: rect.x + 1.5, y: rect.y + 1.2, size: 8, font: fontBold });
  }

  texte(nom?.toUpperCase(), RECT.nom, 10);
  texte(prenom, RECT.prenom, 10);
  texte(cp, RECT.cp, 10);
  texte(etablissement, RECT.etablissement, 10);

  if (preavis.duDate) {
    centreDans(versDDMMYYYY(preavis.duDate), RECT.preavisDuDate, 9);
    centreDans(preavis.duH, RECT.preavisDuH, 9);
    centreDans(preavis.duM, RECT.preavisDuM, 9);
  }
  if (preavis.auDate) {
    centreDans(versDDMMYYYY(preavis.auDate), RECT.preavisAuDate, 9);
    centreDans(preavis.auH, RECT.preavisAuH, 9);
    centreDans(preavis.auM, RECT.preavisAuM, 9);
  }

  if (choix === "intention") {
    cocher(RECT.cbIntention);
    centreDans(versDDMMYYYY(intention.date), RECT.intentionDate, 9);
    centreDans(intention.h, RECT.intentionH, 9);
    centreDans(intention.m, RECT.intentionM, 9);
  } else if (choix === "suiteDii") {
    cocher(RECT.cbSuiteDii);
    texte(diiNumero, RECT.diiNumero, 9.5);
    if (sousChoix === "renoncer") {
      cocher(RECT.cbRenoncer);
    } else if (sousChoix === "reprendre") {
      cocher(RECT.cbReprendre);
      centreDans(versDDMMYYYY(reprendre.date), RECT.reprendreDate, 9);
      centreDans(reprendre.h, RECT.reprendreH, 9);
      centreDans(reprendre.m, RECT.reprendreM, 9);
    }
  }

  texte(lieu, RECT.agentLieu, 10);
  const maintenant = new Date();
  texte(maintenant.toLocaleDateString("fr-FR"), RECT.agentDate, 10);

  if (signatureDataUrl) {
    try {
      const sig = await outDoc.embedPng(signatureDataUrl);
      const pad = 4;
      const availW = RECT.agentSignature.w - pad * 2, availH = RECT.agentSignature.h - pad * 2;
      const scale = Math.min(availW / sig.width, availH / sig.height, 1);
      const w = sig.width * scale, h = sig.height * scale;
      const x = RECT.agentSignature.x + (RECT.agentSignature.w - w) / 2;
      const y = RECT.agentSignature.y + (RECT.agentSignature.h - h) / 2;
      page.drawImage(sig, { x, y, width: w, height: h });
    } catch (e) { console.error("Erreur insertion signature:", e); }
  }

  // Accusé de réception — seule la ligne "A reçu la déclaration de M. ..." est
  // pré-remplie (demandé explicitement), le reste reste vide pour l'établissement.
  texte(`${nom?.toUpperCase() || ""} ${prenom || ""}`.trim(), RECT.recuNomAgent, 9.5);

  return outDoc.save();
}

export default function D2iView({ currentAgent, agentProfiles }) {
  const signatureDataUrl = agentProfiles?.[currentAgent?.id]?.signatureDataUrl || null;
  const nom = currentAgent?.nom || "";
  const prenom = currentAgent?.prenom || "";
  const cp = currentAgent?.cp || currentAgent?.id || "";

  const [etablissement, setEtablissement] = useState("EIC PSO");
  const [preavisDuDate, setPreavisDuDate] = useState("");
  const [preavisDuH, setPreavisDuH] = useState("");
  const [preavisAuDate, setPreavisAuDate] = useState("");
  const [preavisAuH, setPreavisAuH] = useState("");

  const [choix, setChoix] = useState(""); // "intention" | "suiteDii"
  const [intentionDate, setIntentionDate] = useState("");
  const [intentionH, setIntentionH] = useState("");

  const [diiNumero, setDiiNumero] = useState("");
  const [sousChoix, setSousChoix] = useState(""); // "renoncer" | "reprendre"
  const [reprendreDate, setReprendreDate] = useState("");
  const [reprendreH, setReprendreH] = useState("");

  const [lieu, setLieu] = useState("Paris");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const splitHeure = (h) => {
    if (!h) return { h: "", m: "" };
    const [hh, mm] = h.split(":");
    return { h: hh, m: mm };
  };

  const valide = choix === "intention"
    ? intentionDate !== ""
    : choix === "suiteDii"
    ? diiNumero.trim() !== "" && (sousChoix === "renoncer" || (sousChoix === "reprendre" && reprendreDate !== ""))
    : false;

  const generer = async () => {
    setErr(null);
    if (!choix) { setErr("Coche la mention qui correspond à ta déclaration."); return; }
    if (!valide) {
      setErr(choix === "intention"
        ? "Indique la date à compter de laquelle tu comptes participer à la grève."
        : !diiNumero.trim()
        ? "Indique le numéro de la DII concernée."
        : !sousChoix
        ? "Choisis Renoncer ou Reprendre le travail."
        : "Indique la date de reprise du travail.");
      return;
    }
    setBusy(true);
    try {
      const bytes = await genererPdf({
        nom, prenom, cp, etablissement,
        preavis: { duDate: preavisDuDate, duH: splitHeure(preavisDuH).h, duM: splitHeure(preavisDuH).m, auDate: preavisAuDate, auH: splitHeure(preavisAuH).h, auM: splitHeure(preavisAuH).m },
        choix,
        intention: { date: intentionDate, ...splitHeure(intentionH) },
        diiNumero,
        sousChoix,
        reprendre: { date: reprendreDate, ...splitHeure(reprendreH) },
        lieu,
        signatureDataUrl,
      });
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const nomAgent = (nom || "Agent").toUpperCase().replace(/\s+/g, "_");
      const dateNom = new Date().toISOString().slice(0, 10).split("-").reverse().join("-");
      a.href = url;
      a.download = `D2I_${nomAgent}_${dateNom}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setErr("Erreur lors de la génération du PDF. Réessaie.");
    }
    setBusy(false);
  };

  const champStyle = { width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14 };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 4, display: "block" };
  const pillStyle = (actif) => ({
    padding: "10px 12px", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer",
    border: actif ? "1.5px solid #334155" : "1.5px solid #e2e8f0",
    background: actif ? "#334155" : "#fff", color: actif ? "#fff" : "#334155",
    textAlign: "left", width: "100%",
  });

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>✊ D2I — Déclaration Individuelle d'Intention</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Nom, prénom et CP sont pris automatiquement depuis ton profil. La date du jour et le lieu sont ajoutés automatiquement.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Établissement / Entité</label>
            <input value={etablissement} onChange={e => setEtablissement(e.target.value)} style={champStyle} />
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          <div>
            <label style={labelStyle}>Préavis — du</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={preavisDuDate} onChange={e => setPreavisDuDate(e.target.value)} style={champStyle} />
              <input type="time" value={preavisDuH} onChange={e => setPreavisDuH(e.target.value)} style={{ ...champStyle, maxWidth: 110 }} />
            </div>
            <label style={{ ...labelStyle, marginTop: 8 }}>au</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="date" value={preavisAuDate} onChange={e => setPreavisAuDate(e.target.value)} style={champStyle} />
              <input type="time" value={preavisAuH} onChange={e => setPreavisAuH(e.target.value)} style={{ ...champStyle, maxWidth: 110 }} />
            </div>
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          <div>
            <label style={labelStyle}>Ta déclaration (coche une seule mention)</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={() => setChoix("intention")} style={pillStyle(choix === "intention")}>
                Déclare avoir l'intention de participer à la grève
              </button>
              {choix === "intention" && (
                <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
                  <input type="date" value={intentionDate} onChange={e => setIntentionDate(e.target.value)} style={champStyle} />
                  <input type="time" value={intentionH} onChange={e => setIntentionH(e.target.value)} style={{ ...champStyle, maxWidth: 110 }} />
                </div>
              )}

              <button onClick={() => setChoix("suiteDii")} style={pillStyle(choix === "suiteDii")}>
                Déclare, suite à la DII N°...
              </button>
              {choix === "suiteDii" && (
                <div style={{ padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label style={{ ...labelStyle, marginBottom: 4 }}>Numéro de la DII</label>
                    <input value={diiNumero} onChange={e => setDiiNumero(e.target.value)} placeholder="ex : 2026-045" style={champStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button onClick={() => setSousChoix("renoncer")} style={pillStyle(sousChoix === "renoncer")}>Renoncer à participer à la grève</button>
                    <button onClick={() => setSousChoix("reprendre")} style={pillStyle(sousChoix === "reprendre")}>Reprendre le travail</button>
                  </div>
                  {sousChoix === "reprendre" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="date" value={reprendreDate} onChange={e => setReprendreDate(e.target.value)} style={champStyle} />
                      <input type="time" value={reprendreH} onChange={e => setReprendreH(e.target.value)} style={{ ...champStyle, maxWidth: 110 }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          <div>
            <label style={labelStyle}>Lieu</label>
            <input value={lieu} onChange={e => setLieu(e.target.value)} style={champStyle} />
          </div>

          {err && <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>{err}</div>}

          <button onClick={generer} disabled={busy} style={{ padding: "13px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer", background: "#b45309", color: "#fff", marginTop: 8 }}>
            {busy ? "Génération…" : "📄 Générer le PDF"}
          </button>

          <NoticeDii />
        </div>
      </div>
    </div>
  );
}
