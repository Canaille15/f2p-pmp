import { useState, useRef, useEffect } from "react";

// ─── Signature agent (09/08) ────────────────────────────────────────────────
// Olivier : "chaque agent peux creer sa signature pour pourvoir l'integrer
// dans les generateur de pdf" — deux façons de la produire (dessin au doigt/
// souris/stylet via Pointer Events, ou photo d'une signature papier avec
// extraction du fond) qui produisent toutes les deux le même format de sortie
// (PNG à fond transparent, recadré sur le trait), donc un seul pipeline de
// stockage/insertion PDF pour les deux. Stockée dans
// agentProfiles[agentId].signatureDataUrl — persistante par défaut (pas
// besoin de la refaire à chaque PDF), mais entièrement supprimable/refaisable
// à tout moment par l'agent (bouton dédié) pour ceux que la fiabilité
// inquiète.

const MAX_SORTIE_LARGEUR = 500; // limite la taille du PNG stocké (quelques Ko)
const MAX_PHOTO_DIM = 1000;     // limite la résolution de travail d'une photo importée

// Recadre un canvas sur le rectangle englobant des pixels non-transparents
// (le trait de signature) — évite de stocker toute la zone blanche autour.
function recadrerSurContenu(source) {
  const w = source.width, h = source.height;
  if (!w || !h) return null;
  const ctx = source.getContext("2d");
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // rien de dessiné
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw; out.height = ch;
  out.getContext("2d").drawImage(source, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

// Garde la taille finale du PNG raisonnable (quelques Ko), peu importe la
// résolution d'origine (surtout utile pour une photo importée).
function limiterTaille(canvas, maxLargeur = MAX_SORTIE_LARGEUR) {
  if (canvas.width <= maxLargeur) return canvas;
  const scale = maxLargeur / canvas.width;
  const out = document.createElement("canvas");
  out.width = maxLargeur; out.height = Math.round(canvas.height * scale);
  out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

// Applique un seuil de luminosité : tout pixel plus clair que le seuil (le
// papier) devient transparent, le reste (l'encre) reste opaque — aucun appel
// externe, aucun OCR, juste un parcours de pixels côté navigateur.
function appliquerSeuil(source, seuil) {
  const w = source.width, h = source.height;
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const octx = out.getContext("2d");
  octx.drawImage(source, 0, 0);
  const imgData = octx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i + 3] = lum > seuil ? 0 : 255;
  }
  octx.putImageData(imgData, 0, 0);
  return out;
}

export default function SignaturePad({ agent, agentProfiles, setAgentProfiles }) {
  const existante = agentProfiles?.[agent?.id]?.signatureDataUrl || null;
  const [refaire, setRefaire] = useState(!existante);
  const [mode, setMode] = useState("dessiner"); // "dessiner" | "photo"
  const [estVide, setEstVide] = useState(true);
  const [seuil, setSeuil] = useState(190);
  const [erreur, setErreur] = useState("");
  const [confirme, setConfirme] = useState(false);

  const drawCanvasRef = useRef(null);
  const ctxRef = useRef(null);
  const isDrawingRef = useRef(false);
  const photoSrcRef = useRef(null); // canvas source (photo chargée, résolution plafonnée)
  const photoPreviewRef = useRef(null); // canvas visible, résultat du seuillage courant
  const [photoChargee, setPhotoChargee] = useState(false);

  // Initialise/reset le canvas de dessin à chaque entrée en mode "dessiner"
  // (changer d'onglet repart d'une feuille vierge — simple et prévisible).
  useEffect(() => {
    if (mode !== "dessiner" || !refaire) return;
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = 180;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.lineWidth = 2.6; ctx.strokeStyle = "#111827";
    ctxRef.current = ctx;
    setEstVide(true);
    setErreur("");
  }, [mode, refaire]);

  const getPos = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);
    isDrawingRef.current = true;
  };
  const onPointerMove = (e) => {
    if (!isDrawingRef.current) return;
    const { x, y } = getPos(e);
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    setEstVide(false);
  };
  const onPointerUp = () => { isDrawingRef.current = false; };

  const effacerDessin = () => {
    const canvas = drawCanvasRef.current;
    ctxRef.current.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    setEstVide(true);
    setErreur("");
  };

  const choisirPhoto = (file) => {
    if (!file) return;
    setErreur("");
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_PHOTO_DIM || height > MAX_PHOTO_DIM) {
        const s = MAX_PHOTO_DIM / Math.max(width, height);
        width = Math.round(width * s); height = Math.round(height * s);
      }
      const src = document.createElement("canvas");
      src.width = width; src.height = height;
      src.getContext("2d").drawImage(img, 0, 0, width, height);
      photoSrcRef.current = src;
      URL.revokeObjectURL(url);
      setPhotoChargee(true);
    };
    img.onerror = () => setErreur("Impossible de lire cette photo — réessaie avec une autre.");
    img.src = url;
  };

  // Redessine l'aperçu à chaque changement de seuil (ou nouvelle photo).
  useEffect(() => {
    if (!photoChargee || !photoSrcRef.current) return;
    const seuille = appliquerSeuil(photoSrcRef.current, seuil);
    const preview = photoPreviewRef.current;
    if (!preview) return;
    preview.width = seuille.width; preview.height = seuille.height;
    const ctx = preview.getContext("2d");
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.drawImage(seuille, 0, 0);
  }, [seuil, photoChargee]);

  const recommencerPhoto = () => {
    photoSrcRef.current = null;
    setPhotoChargee(false);
    setErreur("");
  };

  const valider = () => {
    setErreur("");
    const source = mode === "dessiner" ? drawCanvasRef.current : photoPreviewRef.current;
    if (!source || (mode === "photo" && !photoChargee)) {
      setErreur(mode === "dessiner" ? "Dessine ta signature avant de valider." : "Importe une photo avant de valider.");
      return;
    }
    const recadre = recadrerSurContenu(source);
    if (!recadre) {
      setErreur("Rien n'a été détecté — dessine ou importe une signature plus nette.");
      return;
    }
    const finale = limiterTaille(recadre);
    const dataUrl = finale.toDataURL("image/png");
    setAgentProfiles(prev => ({ ...prev, [agent.id]: { ...(prev[agent.id] || {}), signatureDataUrl: dataUrl } }));
    setRefaire(false);
    setPhotoChargee(false);
    photoSrcRef.current = null;
    setConfirme(true);
    setTimeout(() => setConfirme(false), 2500);
  };

  const supprimer = () => {
    // Tombstone explicite (null, jamais delete) — le backend fusionne
    // donnees_json via JSON_MERGE_PATCH, piège déjà documenté sur ce projet.
    setAgentProfiles(prev => ({ ...prev, [agent.id]: { ...(prev[agent.id] || {}), signatureDataUrl: null } }));
    setRefaire(true);
    setMode("dessiner");
  };

  const pillStyle = (actif) => ({
    flex: 1, padding: "9px 10px", borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
    border: actif ? "1.5px solid #0C447C" : "1.5px solid #e2e8f0",
    background: actif ? "#0C447C" : "#fff", color: actif ? "#fff" : "#334155",
  });

  return (
    <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>✍️ Ma signature</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Une fois enregistrée, elle est insérée automatiquement dans les PDF que tu génères (Demande de congés, CET). Optionnel — sans signature, les PDF se génèrent exactement comme avant.
      </div>

      {!refaire && existante && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={existante} alt="Ma signature" style={{ maxWidth: "100%", maxHeight: 100, display: "block" }} />
          </div>
          {confirme && <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>✓ Signature enregistrée</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setRefaire(true)} style={{ flex: 1, padding: "9px 0", border: "1.5px solid #0C447C", borderRadius: 9, fontWeight: 700, fontSize: 12.5, cursor: "pointer", background: "#fff", color: "#0C447C" }}>✏️ Refaire ma signature</button>
            <button onClick={supprimer} style={{ flex: 1, padding: "9px 0", border: "1.5px solid #fca5a5", borderRadius: 9, fontWeight: 700, fontSize: 12.5, cursor: "pointer", background: "#fff", color: "#991b1b" }}>🗑️ Supprimer</button>
          </div>
        </div>
      )}

      {refaire && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setMode("dessiner")} style={pillStyle(mode === "dessiner")}>✍️ Dessiner</button>
            <button onClick={() => setMode("photo")} style={pillStyle(mode === "photo")}>📷 Importer une photo</button>
          </div>

          {mode === "dessiner" && (
            <div>
              <canvas
                ref={drawCanvasRef}
                style={{ width: "100%", height: 180, borderRadius: 10, border: "1.5px dashed #cbd5e1", background: "#f8fafc", touchAction: "none", cursor: "crosshair" }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Dessine au doigt, à la souris ou au stylet.</div>
                <button onClick={effacerDessin} style={{ border: "none", background: "none", color: "#991b1b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Effacer</button>
              </div>
            </div>
          )}

          {mode === "photo" && (
            <div>
              {!photoChargee ? (
                <label style={{
                  display: "flex", alignItems: "center", justifyContent: "center", height: 180, borderRadius: 10,
                  border: "1.5px dashed #cbd5e1", background: "#f8fafc", cursor: "pointer", color: "#64748b", fontSize: 13, fontWeight: 600,
                }}>
                  📷 Prendre ou choisir une photo de ta signature (sur papier blanc)
                  {/* Pas de `capture="environment"` : sur la plupart des navigateurs
                      mobiles, cet attribut saute directement à l'appareil photo et
                      empêche de choisir une photo déjà existante dans la galerie
                      (signalé par Olivier, 09/08) — sans lui, le sélecteur natif
                      propose bien les deux (prendre une photo OU en choisir une). */}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => choisirPhoto(e.target.files?.[0])} />
                </label>
              ) : (
                <div>
                  <div style={{ background: "#f8fafc", border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100 }}>
                    <canvas ref={photoPreviewRef} style={{ maxWidth: "100%", maxHeight: 160 }} />
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#334155" }}>Sensibilité (ajuste jusqu'à ce que ce soit net)</label>
                    <input type="range" min="80" max="240" value={seuil} onChange={e => setSeuil(Number(e.target.value))} style={{ width: "100%" }} />
                  </div>
                  <button onClick={recommencerPhoto} style={{ marginTop: 4, border: "none", background: "none", color: "#991b1b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🔄 Reprendre une autre photo</button>
                </div>
              )}
            </div>
          )}

          {erreur && <div style={{ fontSize: 12, fontWeight: 600, color: "#991b1b" }}>{erreur}</div>}

          <div style={{ display: "flex", gap: 8 }}>
            {existante && <button onClick={() => setRefaire(false)} style={{ flex: 1, padding: "10px 0", border: "1.5px solid #e2e8f0", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", background: "#fff", color: "#334155" }}>Annuler</button>}
            <button onClick={valider} disabled={mode === "dessiner" ? estVide : !photoChargee} style={{
              flex: 2, padding: "10px 0", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13,
              cursor: (mode === "dessiner" ? estVide : !photoChargee) ? "not-allowed" : "pointer",
              background: (mode === "dessiner" ? estVide : !photoChargee) ? "#cbd5e1" : "#0C447C", color: "#fff",
            }}>✓ Valider ma signature</button>
          </div>
        </div>
      )}
    </div>
  );
}
