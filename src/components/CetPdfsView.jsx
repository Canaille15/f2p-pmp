import { useState, useRef } from "react";
import { PDFDocument } from "pdf-lib";

// ─── CET Phase 5 (07/08) : génération des PDF officiels CET ───────────────
// Contrairement à "Demande de congés" (GA_demande_autorisation_absence.pdf,
// un scan sans champs — DemandeCongesView.jsx dessine le texte à des
// coordonnées fixes), les imprimés CET fournis par Olivier sont de vrais
// formulaires PDF avec des champs remplissables (AcroForm) — on les remplit
// donc directement par nom de champ (pdf-lib form.getTextField/getRadioGroup),
// puis on aplatit (form.flatten()) pour livrer un PDF final non modifiable,
// comme un vrai document généré. Vue isolée, indépendante du ledger CET
// (CetView.jsx) — un pur générateur de document, même principe que
// DemandeCongesView.jsx n'écrit jamais dans congesDemandes.
//
// 5e et 6e imprimés ajoutés le 07/08 (utilisation compte courant + transfert
// de jours courant→fin d'activité) — Olivier les avait oubliés lors de l'envoi
// initial du 06/08 ; les 4 premiers imprimés déjà livrés ont été reconfirmés
// identiques (checksum) aux versions renvoyées, aucun changement nécessaire.

const TYPES = [
  { k: "epargne", label: "Demande d'épargne sur le CET (hors congés annuels)" },
  { k: "intention", label: "Intention d'épargne de congés annuels" },
  { k: "utilisation", label: "Demande d'utilisation en temps — sous-compte fin d'activité" },
  { k: "monetisation", label: "Demande de monétisation — sous-compte fin d'activité" },
  { k: "utilisationCourant", label: "Demande d'utilisation en temps — sous-compte courant" },
  { k: "transfert", label: "Demande de transfert de jours (courant → fin d'activité)" },
];

// Sous-compte courant : le nombre de jours doit être compris entre 5 et 20
// (règle du formulaire officiel), réparti en 3 paliers avec des délais de
// prévenance différents — chaque palier a sa propre paire de champs sur le
// PDF (nombre de jours + date de la demande), un seul palier est rempli par
// génération (celui qui correspond au nombre de jours saisi par l'agent).
const PALIERS_UTIL_COURANT = [
  { min: 5, max: 9, radio: "de 5 à 9", suffixJours: "de 5 à 9 jours", suffixDate: "de 5 à 9 jours", delai: "1 mois avant le 1er jour" },
  { min: 10, max: 15, radio: "de 10 à 15", suffixJours: "de 10 à 15 jours", suffixDate: "de 10 à 15 jours", delai: "2 mois avant le 1er jour" },
  { min: 16, max: 20, radio: "de 16 à 20", suffixJours: "de 16 à 20 jours", suffixDate: "de 16 à 20 jours", delai: "4 mois avant le 1er jour" },
];

const SOUS_COMPTES = [
  { k: "courant", label: "Compte courant" },
  { k: "finActivite", label: "Compte fin d'activité" },
];

// Sources sélectionnables pour la Demande d'épargne hors congés — limitées à
// ce que l'appli suit réellement (voir CetView.jsx SOURCES_EPARGNE) : RS et
// RG existent sur l'imprimé officiel mais n'ont aucune donnée correspondante
// dans l'appli, "abondement" est un mouvement automatique jamais demandé
// explicitement par l'agent — les trois sont donc volontairement absents ici.
const SOURCES_EPARGNE_HC = [
  { code: "RQ", label: "RQ (repos supplémentaires)", radio: "RQ", suffix: "RQ Repos supplémentaires" },
  { code: "RN", label: "RN (repos compensateur de nuit)", radio: "RN", suffix: "RN Repos compensateur de nuit" },
  { code: "TC", label: "TC (temps compensé mensuel)", radio: "TC", suffix: "TC Temps compensé mensuel" },
  { code: "TY", label: "TY (temps compensé semestriel)", radio: "TY", suffix: "TY Temps compensé semestriel" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", radio: "Congé médaille", suffix: "Congé Médaille" },
];

function dateAuj() {
  return new Date().toLocaleDateString("fr-FR");
}

// ─── Remplissage identité, commun aux 4 imprimés (mêmes noms de champs sur
// les 4 PDF : Nom1 / Prénom1 / Code CP12..82 / "Etablissement  Signature1") ─
function remplirIdentite(form, { nom, prenom, cp }) {
  const set = (name, val) => { try { form.getTextField(name).setText(val || ""); } catch (e) {} };
  set("Nom1", (nom || "").toUpperCase());
  set("Prénom1", prenom || "");
  set("Etablissement  Signature1", "EIC PSO");
  const cpStr = (cp || "").toUpperCase().padEnd(8, " ");
  for (let i = 0; i < 8; i++) set(`Code CP${i + 1}2`, cpStr[i]?.trim() || "");
}

async function chargerFormulaire(url) {
  const bytes = await fetch(url).then(r => r.arrayBuffer());
  const doc = await PDFDocument.load(bytes);
  return { doc, form: doc.getForm() };
}

async function finaliser(doc, form) {
  try { form.flatten(); } catch (e) {}
  return doc.save();
}

async function genererEpargneHorsConges({ nom, prenom, cp, source, sousCompte, jours }) {
  const { doc, form } = await chargerFormulaire("/CET_epargne_hors_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const src = SOURCES_EPARGNE_HC.find(s => s.code === source);
  try { form.getRadioGroup("types de jours").select(src.radio); } catch (e) {}
  const prefix = sousCompte === "courant" ? "Courant" : "Fin dactivité";
  try { form.getTextField(`${prefix}${src.suffix}`).setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

async function genererIntentionConges({ nom, prenom, cp, sousCompte, jours }) {
  const { doc, form } = await chargerFormulaire("/CET_intention_epargne_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const champ = sousCompte === "courant"
    ? "Sous compte courantNombre de congés à épargner"
    : "Sous compte fin dactivitéNombre de congés à épargner";
  try { form.getTextField(champ).setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de demande Row1").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

async function genererUtilisationFinActivite({ nom, prenom, cp, jours }) {
  const { doc, form } = await chargerFormulaire("/CET_utilisation_fin_activite.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getRadioGroup("Forme d'absence").select("Congé fin activité"); } catch (e) {}
  try { form.getTextField("nombre jours congé").setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de la demande de lagent").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

async function genererMonetisationFinActivite({ nom, prenom, cp, jours }) {
  const { doc, form } = await chargerFormulaire("/CET_monetisation_fin_activite.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getTextField("Nombre de jours à monétiser").setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

async function genererUtilisationCourant({ nom, prenom, cp, jours, demandeComplementaire }) {
  const { doc, form } = await chargerFormulaire("/CET_utilisation_courant.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const palier = PALIERS_UTIL_COURANT.find(p => Number(jours) >= p.min && Number(jours) <= p.max);
  if (palier) {
    try { form.getRadioGroup("durée jours").select(palier.radio); } catch (e) {}
    try { form.getTextField(`Nombre de jours issus du CET entre 5 et 20${palier.suffixJours}`).setText(String(jours)); } catch (e) {}
    try { form.getTextField(`Date de la demande${palier.suffixDate}`).setText(dateAuj()); } catch (e) {}
  }
  try { form.getRadioGroup("demande complémentaire").select(demandeComplementaire ? "oui" : "non"); } catch (e) {}
  return finaliser(doc, form);
}

async function genererTransfertJours({ nom, prenom, cp, jours }) {
  const { doc, form } = await chargerFormulaire("/CET_transfert_jours.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getTextField("nombre de jours transférer").setText(String(jours)); } catch (e) {}
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

function messageEmail({ type, prenom, nom, jours, source, sousCompte }) {
  const sousCompteLabel = SOUS_COMPTES.find(s => s.k === sousCompte)?.label?.toLowerCase() || "";
  let corps = "";
  if (type === "epargne") {
    const sourceLabel = SOURCES_EPARGNE_HC.find(s => s.code === source)?.label || "";
    corps = `Ci-joint ma demande d'épargne sur le CET (hors congés annuels) : ${jours} jour(s) de ${sourceLabel} sur le ${sousCompteLabel}.`;
  } else if (type === "intention") {
    corps = `Ci-joint mon intention d'épargne de congés annuels : ${jours} jour(s) de congés sur le ${sousCompteLabel}.`;
  } else if (type === "utilisation") {
    corps = `Ci-joint ma demande d'utilisation en temps des jours du sous-compte de fin d'activité : ${jours} jour(s).`;
  } else if (type === "monetisation") {
    corps = `Ci-joint ma demande de monétisation des jours du sous-compte de fin d'activité : ${jours} jour(s).`;
  } else if (type === "utilisationCourant") {
    corps = `Ci-joint ma demande d'utilisation en temps des jours du sous-compte courant : ${jours} jour(s).`;
  } else if (type === "transfert") {
    corps = `Ci-joint ma demande de transfert de jours du sous-compte courant vers le sous-compte de fin d'activité : ${jours} jour(s).`;
  }
  return `Bonjour,

${corps}

Cordialement,
${prenom} ${nom}`;
}

export default function CetPdfsView({ currentAgent }) {
  const [type, setType] = useState(TYPES[0].k);
  const [source, setSource] = useState(SOURCES_EPARGNE_HC[0].code);
  const [sousCompte, setSousCompte] = useState(SOUS_COMPTES[0].k);
  const [jours, setJours] = useState("");
  const [demandeComplementaire, setDemandeComplementaire] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [messageCopie, setMessageCopie] = useState(false);
  const [messageSurligne, setMessageSurligne] = useState(false);
  const emailCardRef = useRef(null);

  const changerType = (k) => { setType(k); setJours(""); setDemandeComplementaire(false); setErr(null); };

  const nom = currentAgent?.nom || "";
  const prenom = currentAgent?.prenom || "";
  const cp = currentAgent?.cp || currentAgent?.id || "";

  const joursValides = type === "utilisationCourant"
    ? jours !== "" && Number(jours) >= 5 && Number(jours) <= 20
    : jours !== "" && Number(jours) > 0;
  const messageGenere = messageEmail({ type, prenom, nom, jours, source, sousCompte });

  const copierMessage = () => {
    navigator.clipboard.writeText(messageGenere).then(() => {
      setMessageCopie(true);
      setTimeout(() => setMessageCopie(false), 2000);
    });
  };

  const generer = async () => {
    setErr(null);
    if (!joursValides) {
      setErr(type === "utilisationCourant" ? "Indique un nombre de jours entre 5 et 20 (règle de cet imprimé)." : "Indique un nombre de jours valide.");
      return;
    }
    setBusy(true);
    try {
      let bytes, nomFichier;
      const dateNom = new Date().toISOString().slice(0, 10);
      if (type === "epargne") {
        bytes = await genererEpargneHorsConges({ nom, prenom, cp, source, sousCompte, jours });
        nomFichier = `CET epargne ${source} du ${dateNom}.pdf`;
      } else if (type === "intention") {
        bytes = await genererIntentionConges({ nom, prenom, cp, sousCompte, jours });
        nomFichier = `CET intention epargne conges du ${dateNom}.pdf`;
      } else if (type === "utilisation") {
        bytes = await genererUtilisationFinActivite({ nom, prenom, cp, jours });
        nomFichier = `CET utilisation fin activite du ${dateNom}.pdf`;
      } else if (type === "monetisation") {
        bytes = await genererMonetisationFinActivite({ nom, prenom, cp, jours });
        nomFichier = `CET monetisation fin activite du ${dateNom}.pdf`;
      } else if (type === "utilisationCourant") {
        bytes = await genererUtilisationCourant({ nom, prenom, cp, jours, demandeComplementaire });
        nomFichier = `CET utilisation courant du ${dateNom}.pdf`;
      } else {
        bytes = await genererTransfertJours({ nom, prenom, cp, jours });
        nomFichier = `CET transfert jours du ${dateNom}.pdf`;
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomFichier;
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
  const pillStyle = (actif) => ({
    padding: "9px 12px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: actif ? "1.5px solid #5b21b6" : "1.5px solid #e2e8f0",
    background: actif ? "#5b21b6" : "#fff", color: actif ? "#fff" : "#334155",
    textAlign: "left",
  });

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>🏦 CET — Générer un PDF officiel</div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Nom, prénom et CP sont pris automatiquement depuis ton profil. Ce générateur ne modifie rien dans ton suivi CET — c'est un simple imprimé à envoyer.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={labelStyle}>Type de demande</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TYPES.map(t => (
                <button key={t.k} onClick={() => changerType(t.k)} style={pillStyle(type === t.k)}>{t.label}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 1, background: "#e2e8f0", margin: "4px 0" }} />

          {type === "epargne" && (
            <div>
              <label style={labelStyle}>Source</label>
              <select value={source} onChange={e => setSource(e.target.value)} style={champStyle}>
                {SOURCES_EPARGNE_HC.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </div>
          )}

          {(type === "epargne" || type === "intention") && (
            <div>
              <label style={labelStyle}>Sous-compte</label>
              <div style={{ display: "flex", gap: 8 }}>
                {SOUS_COMPTES.map(s => (
                  <button key={s.k} onClick={() => setSousCompte(s.k)} style={{ ...pillStyle(sousCompte === s.k), flex: 1, textAlign: "center" }}>{s.label}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>
              {type === "epargne" && "Nombre de jours à épargner"}
              {type === "intention" && "Nombre de congés à épargner"}
              {type === "utilisation" && "Nombre de jours à utiliser (congé fin d'activité)"}
              {type === "monetisation" && "Nombre de jours à monétiser"}
              {type === "utilisationCourant" && "Nombre de jours à utiliser (entre 5 et 20)"}
              {type === "transfert" && "Nombre de jours à transférer (courant → fin d'activité)"}
            </label>
            <input
              type="number" min={type === "utilisationCourant" ? 5 : 0} max={type === "utilisationCourant" ? 20 : undefined}
              step="1" value={jours} onChange={e => setJours(e.target.value)} style={champStyle}
              placeholder={type === "utilisationCourant" ? "ex : 12" : "ex : 2"}
            />
            {type === "utilisationCourant" && jours !== "" && (
              (() => {
                const palier = PALIERS_UTIL_COURANT.find(p => Number(jours) >= p.min && Number(jours) <= p.max);
                return palier
                  ? <div style={{ fontSize: 11.5, color: "#5b21b6", marginTop: 5, fontWeight: 600 }}>Délai de prévenance : {palier.delai}</div>
                  : <div style={{ fontSize: 11.5, color: "#991b1b", marginTop: 5, fontWeight: 600 }}>⚠️ Cet imprimé n'accepte qu'un nombre de jours entre 5 et 20</div>;
              })()
            )}
          </div>

          {type === "utilisationCourant" && (
            <div>
              <label style={labelStyle}>Demande complémentaire de jours d'absence</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDemandeComplementaire(false)} style={{ ...pillStyle(!demandeComplementaire), flex: 1, textAlign: "center" }}>Non</button>
                <button onClick={() => setDemandeComplementaire(true)} style={{ ...pillStyle(demandeComplementaire), flex: 1, textAlign: "center" }}>Oui</button>
              </div>
            </div>
          )}

          {err && <div style={{ fontSize: 13, fontWeight: 600, color: "#991b1b" }}>{err}</div>}

          <div style={{ fontSize: 12, color: "#5b21b6", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 10px", fontWeight: 600 }}>
            💡 Un message email prêt à copier t'attend juste en dessous — pense à l'envoyer avec ton PDF.
          </div>

          <button onClick={generer} disabled={busy} style={{ padding: "13px 0", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer", background: "#5b21b6", color: "#fff", marginTop: 8 }}>
            {busy ? "Génération…" : "📄 Générer le PDF"}
          </button>
        </div>
      </div>

      <div ref={emailCardRef} style={{
        background: "#fff",
        border: messageSurligne ? "1.5px solid #5b21b6" : "1.5px solid #e2e8f0",
        borderRadius: 14, padding: 20,
        boxShadow: messageSurligne ? "0 0 0 4px #e9d5ff" : "none",
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
        <button onClick={copierMessage} style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", background: messageCopie ? "#16a34a" : "#5b21b6", color: "#fff" }}>
          {messageCopie ? "✓ Copié !" : "Copier le message"}
        </button>
      </div>
    </div>
  );
}
