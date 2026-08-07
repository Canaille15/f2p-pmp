import { useState, useRef } from "react";
import { PDFDocument, PDFName } from "pdf-lib";

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
//
// Retours du 07/08 (2e passe) : le formulaire épargne hors congés permet de
// cocher PLUSIEURS types de jours à la fois (RQ+RN+TC+TY+RCF+médaille),
// chacun dispatché indépendamment entre compte courant et fin d'activité sur
// le MÊME document — reproduit ici via une grille par source (2 champs
// jours par ligne) plutôt qu'un simple source+sous-compte+jours. Le champ
// PDF "types de jours" est un vrai groupe radio (un seul sélectionné à la
// fois côté format officiel) : impossible de cocher plusieurs cases via
// l'API RadioGroup.select() sans écraser les précédentes. Contournement :
// manipulation directe des widgets (voir cocherPlusieursTypes) — sans danger
// car le formulaire est aplati (form.flatten()) juste après, donc l'état
// "un seul sélectionné" du champ interactif n'a plus d'importance, seul le
// rendu visuel de chaque case cochée est conservé.

const TYPES = [
  { k: "epargne", label: "Demande d'épargne sur le CET (hors congés annuels)" },
  { k: "intention", label: "Intention d'épargne de congés annuels" },
  { k: "utilisationCourant", label: "Demande d'utilisation en temps — sous-compte courant" },
  { k: "utilisation", label: "Demande d'utilisation en temps — sous-compte fin d'activité" },
  { k: "monetisation", label: "Demande de monétisation — sous-compte fin d'activité" },
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

// Motifs de monétisation (imprimé "Demande de monétisation — sous-compte fin
// d'activité") — texte verbatim de l'imprimé officiel, jamais reformulé.
const MOTIFS_MONETISATION = [
  { code: "rh0926", label: "Article 5-2 point e) du RH0926", detail: "dans les 2 mois suivant l'évènement considéré, avec justificatifs" },
  { code: "rh0930", label: "Article 5-2 point e) du RH0930", detail: "Loi du 20/08/2008 « portant rénovation de la démocratie sociale et réforme du temps de travail »" },
];

// Sources sélectionnables pour la Demande d'épargne hors congés — limitées à
// ce que l'appli suit réellement (voir CetView.jsx SOURCES_EPARGNE) : RS et
// RG existent sur l'imprimé officiel mais n'ont aucune donnée correspondante
// dans l'appli, "abondement" est un mouvement automatique jamais demandé
// explicitement par l'agent — les trois sont donc volontairement absents ici.
// RCF (repos compensateur de fêtes) ajouté le 07/08 sur demande d'Olivier.
const SOURCES_EPARGNE_HC = [
  { code: "RQ", label: "RQ (repos supplémentaires)", radio: "RQ", suffix: "RQ Repos supplémentaires" },
  { code: "RN", label: "RN (repos compensateur de nuit)", radio: "RN", suffix: "RN Repos compensateur de nuit" },
  { code: "TC", label: "TC (temps compensé mensuel)", radio: "TC", suffix: "TC Temps compensé mensuel" },
  { code: "TY", label: "TY (temps compensé semestriel)", radio: "TY", suffix: "TY Temps compensé semestriel" },
  { code: "RCF", label: "RCF (repos compensateur de fêtes)", radio: "RCF", suffix: "RCF repos compensateur de fêtes" },
  { code: "MEDAILLE", label: "Congé médaille d'honneur des Chemins de Fer", radio: "Congé médaille", suffix: "Congé Médaille" },
];

function joursVides() {
  return Object.fromEntries(SOURCES_EPARGNE_HC.map(s => [s.code, { courant: "", finActivite: "" }]));
}

function dateAuj() {
  return new Date().toLocaleDateString("fr-FR");
}

// ─── Remplissage identité, commun aux 6 imprimés (mêmes noms de champs :
// Nom1 / Prénom1 / Code CP12..82 / "Etablissement  Signature1") ───────────
function remplirIdentite(form, { nom, prenom, cp }) {
  const set = (name, val) => { try { form.getTextField(name).setText(val || ""); } catch (e) {} };
  set("Nom1", (nom || "").toUpperCase());
  set("Prénom1", prenom || "");
  set("Etablissement  Signature1", "EIC PSO");
  const cpStr = (cp || "").toUpperCase().padEnd(8, " ");
  for (let i = 0; i < 8; i++) set(`Code CP${i + 1}2`, cpStr[i]?.trim() || "");
}

// Coche plusieurs cases d'un groupe radio à la fois, en manipulant chaque
// widget directement (contourne la contrainte "un seul sélectionné" de
// form.getRadioGroup().select(), qui décoche tout le reste à chaque appel).
// Sans danger ici : le formulaire est aplati juste après, donc seul le
// rendu visuel de chaque widget compte, plus son état de champ interactif.
function cocherPlusieurs(form, nomChamp, valeursACocher) {
  try {
    const field = form.getRadioGroup(nomChamp);
    const widgets = field.acroField.getWidgets();
    widgets.forEach(w => {
      const onVal = w.getOnValue();
      const nom = onVal ? onVal.decodeText() : null;
      if (nom && valeursACocher.has(nom)) w.setAppearanceState(onVal);
      else w.setAppearanceState(PDFName.of("Off"));
    });
  } catch (e) {}
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

// lignes : [{ source, courant, finActivite }], déjà filtrées aux entrées
// non-vides (au moins un des deux nombres > 0) par l'appelant.
async function genererEpargneHorsConges({ nom, prenom, cp, lignes }) {
  const { doc, form } = await chargerFormulaire("/CET_epargne_hors_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  const radiosACocher = new Set();
  for (const l of lignes) {
    const src = SOURCES_EPARGNE_HC.find(s => s.code === l.source);
    if (!src) continue;
    radiosACocher.add(src.radio);
    if (l.courant) { try { form.getTextField(`Courant${src.suffix}`).setText(String(l.courant)); } catch (e) {} }
    if (l.finActivite) { try { form.getTextField(`Fin dactivité${src.suffix}`).setText(String(l.finActivite)); } catch (e) {} }
  }
  cocherPlusieurs(form, "types de jours", radiosACocher);
  try { form.getTextField("Date de la demande").setText(dateAuj()); } catch (e) {}
  return finaliser(doc, form);
}

async function genererIntentionConges({ nom, prenom, cp, joursCourant, joursFinActivite }) {
  const { doc, form } = await chargerFormulaire("/CET_intention_epargne_conges.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  if (joursCourant) { try { form.getTextField("Sous compte courantNombre de congés à épargner").setText(String(joursCourant)); } catch (e) {} }
  if (joursFinActivite) { try { form.getTextField("Sous compte fin dactivitéNombre de congés à épargner").setText(String(joursFinActivite)); } catch (e) {} }
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

async function genererMonetisationFinActivite({ nom, prenom, cp, jours, motif }) {
  const { doc, form } = await chargerFormulaire("/CET_monetisation_fin_activite.pdf");
  remplirIdentite(form, { nom, prenom, cp });
  try { form.getTextField("Nombre de jours à monétiser").setText(String(jours)); } catch (e) {}
  try { form.getRadioGroup("motif choisi").select(motif); } catch (e) {}
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

function messageEmail({ type, prenom, nom, jours, lignesEpargne, joursCourant, joursFinActivite, demandeComplementaire, motif }) {
  let corps = "";
  if (type === "epargne") {
    const parts = lignesEpargne.map(l => {
      const label = SOURCES_EPARGNE_HC.find(s => s.code === l.source)?.label || l.source;
      const sousParts = [];
      if (l.courant) sousParts.push(`${l.courant}j sur le compte courant`);
      if (l.finActivite) sousParts.push(`${l.finActivite}j sur le compte fin d'activité`);
      return `${label} : ${sousParts.join(" et ")}`;
    });
    corps = `Ci-joint ma demande d'épargne sur le CET (hors congés annuels) :\n${parts.map(p => `- ${p}`).join("\n")}`;
  } else if (type === "intention") {
    const parts = [];
    if (joursCourant) parts.push(`${joursCourant} jour(s) sur le compte courant`);
    if (joursFinActivite) parts.push(`${joursFinActivite} jour(s) sur le compte fin d'activité`);
    corps = `Ci-joint mon intention d'épargne de congés annuels : ${parts.join(" et ")}.`;
  } else if (type === "utilisation") {
    corps = `Ci-joint ma demande d'utilisation en temps des jours du sous-compte de fin d'activité : ${jours} jour(s).`;
  } else if (type === "monetisation") {
    const motifLabel = MOTIFS_MONETISATION.find(m => m.code === motif)?.label || "";
    corps = `Ci-joint ma demande de monétisation des jours du sous-compte de fin d'activité : ${jours} jour(s), au titre de ${motifLabel}.`;
  } else if (type === "utilisationCourant") {
    if (demandeComplementaire) {
      return `Bonjour,

Ci-joint ma demande d'utilisation en temps des jours du sous-compte courant : ${jours} jour(s).

Je souhaite compléter par des jours d'absences non issus du CET.
Ma demande réglementaire d'absence en complément est en pièce jointe.

Merci.
Cordialement.

${prenom} ${nom}`;
    }
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
  const [epargneLignes, setEpargneLignes] = useState(joursVides());
  const [joursCourant, setJoursCourant] = useState("");
  const [joursFinActivite, setJoursFinActivite] = useState("");
  const [jours, setJours] = useState("");
  const [demandeComplementaire, setDemandeComplementaire] = useState(false);
  const [motif, setMotif] = useState(MOTIFS_MONETISATION[0].code);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [messageCopie, setMessageCopie] = useState(false);
  const [messageSurligne, setMessageSurligne] = useState(false);
  const emailCardRef = useRef(null);

  const changerType = (k) => {
    setType(k); setJours(""); setDemandeComplementaire(false);
    setEpargneLignes(joursVides()); setJoursCourant(""); setJoursFinActivite("");
    setMotif(MOTIFS_MONETISATION[0].code); setErr(null);
  };

  const majEpargneLigne = (code, sc, val) => {
    setEpargneLignes(prev => ({ ...prev, [code]: { ...prev[code], [sc]: val } }));
  };

  const nom = currentAgent?.nom || "";
  const prenom = currentAgent?.prenom || "";
  const cp = currentAgent?.cp || currentAgent?.id || "";

  const lignesEpargneValides = SOURCES_EPARGNE_HC
    .map(s => ({ source: s.code, courant: Number(epargneLignes[s.code].courant) || 0, finActivite: Number(epargneLignes[s.code].finActivite) || 0 }))
    .filter(l => l.courant > 0 || l.finActivite > 0);

  const joursValides = type === "utilisationCourant"
    ? jours !== "" && Number(jours) >= 5 && Number(jours) <= 20
    : type === "epargne"
    ? lignesEpargneValides.length > 0
    : type === "intention"
    ? (Number(joursCourant) || 0) > 0 || (Number(joursFinActivite) || 0) > 0
    : jours !== "" && Number(jours) > 0;

  const messageGenere = messageEmail({ type, prenom, nom, jours, lignesEpargne: lignesEpargneValides, joursCourant, joursFinActivite, demandeComplementaire, motif });

  const copierMessage = () => {
    navigator.clipboard.writeText(messageGenere).then(() => {
      setMessageCopie(true);
      setTimeout(() => setMessageCopie(false), 2000);
    });
  };

  const generer = async () => {
    setErr(null);
    if (!joursValides) {
      const messages = {
        utilisationCourant: "Indique un nombre de jours entre 5 et 20 (règle de cet imprimé).",
        epargne: "Indique au moins un nombre de jours (courant ou fin d'activité) pour un type de jours.",
        intention: "Indique au moins un nombre de congés (courant ou fin d'activité).",
      };
      setErr(messages[type] || "Indique un nombre de jours valide.");
      return;
    }
    setBusy(true);
    try {
      let bytes, nomFichier;
      const dateNom = new Date().toISOString().slice(0, 10);
      if (type === "epargne") {
        bytes = await genererEpargneHorsConges({ nom, prenom, cp, lignes: lignesEpargneValides });
        nomFichier = `CET epargne du ${dateNom}.pdf`;
      } else if (type === "intention") {
        bytes = await genererIntentionConges({ nom, prenom, cp, joursCourant, joursFinActivite });
        nomFichier = `CET intention epargne conges du ${dateNom}.pdf`;
      } else if (type === "utilisation") {
        bytes = await genererUtilisationFinActivite({ nom, prenom, cp, jours });
        nomFichier = `CET utilisation fin activite du ${dateNom}.pdf`;
      } else if (type === "monetisation") {
        bytes = await genererMonetisationFinActivite({ nom, prenom, cp, jours, motif });
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
  const miniInputStyle = { width: 60, textAlign: "center", padding: "7px 4px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 700 };

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
              <label style={labelStyle}>Jours à épargner — par type, réparti entre les 2 sous-comptes si besoin</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, paddingLeft: 4 }}>
                  <div style={{ flex: 1 }} />
                  <div style={{ width: 60, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#64748b" }}>Courant</div>
                  <div style={{ width: 60, textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#64748b" }}>Fin d'activité</div>
                </div>
                {SOURCES_EPARGNE_HC.map(s => (
                  <div key={s.code} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: "#1e293b" }}>{s.label}</div>
                    <input type="number" min="0" style={miniInputStyle} value={epargneLignes[s.code].courant} onChange={e => majEpargneLigne(s.code, "courant", e.target.value)} />
                    <input type="number" min="0" style={miniInputStyle} value={epargneLignes[s.code].finActivite} onChange={e => majEpargneLigne(s.code, "finActivite", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {type === "intention" && (
            <div>
              <label style={labelStyle}>Nombre de congés à épargner — par sous-compte</label>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>Compte courant</div>
                  <input type="number" min="0" value={joursCourant} onChange={e => setJoursCourant(e.target.value)} style={champStyle} placeholder="ex : 1" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 }}>Compte fin d'activité</div>
                  <input type="number" min="0" value={joursFinActivite} onChange={e => setJoursFinActivite(e.target.value)} style={champStyle} placeholder="ex : 1" />
                </div>
              </div>
            </div>
          )}

          {type === "monetisation" && (
            <div>
              <label style={labelStyle}>Motif choisi</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {MOTIFS_MONETISATION.map(m => (
                  <button key={m.code} onClick={() => setMotif(m.code)} style={pillStyle(motif === m.code)}>
                    <div>{m.label}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 500, color: motif === m.code ? "#e9d5ff" : "#94a3b8", marginTop: 2 }}>{m.detail}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(type === "utilisation" || type === "monetisation" || type === "utilisationCourant" || type === "transfert") && (
            <div>
              <label style={labelStyle}>
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
          )}

          {type === "utilisationCourant" && (
            <div>
              <label style={labelStyle}>Demande complémentaire de jours d'absence</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setDemandeComplementaire(false)} style={{ ...pillStyle(!demandeComplementaire), flex: 1, textAlign: "center" }}>Non</button>
                <button onClick={() => setDemandeComplementaire(true)} style={{ ...pillStyle(demandeComplementaire), flex: 1, textAlign: "center" }}>Oui</button>
              </div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 5 }}>
                Coche "oui" si cette demande doit être complétée par des jours d'absences non issus du CET — joins alors une demande réglementaire d'absence en complément.
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
          readOnly value={messageGenere} rows={9}
          style={{ width: "100%", padding: 12, border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "#f8fafc", color: "#1e293b" }}
        />
        <button onClick={copierMessage} style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", background: messageCopie ? "#16a34a" : "#5b21b6", color: "#fff" }}>
          {messageCopie ? "✓ Copié !" : "Copier le message"}
        </button>
      </div>
    </div>
  );
}
