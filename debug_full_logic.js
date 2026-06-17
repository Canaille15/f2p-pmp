const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('AGENTS_INIT');
const idx2 = c.indexOf('];', idx);
const block = c.slice(idx, idx2);
const agentMatches = [...block.matchAll(/id:"([^"]+)"[^}]*?nom:"([^"]+)"/g)];
const agents = agentMatches.map(m => ({id: m[1], nom: m[2]}));

const text = `16/06/2026 - 15h49	FEUILLE DE PRESENCE JOURNALIERE	
DU : 17/06/2026	
U.O.P. : PAR LGV RESERVE	
JOURNEE DE SERVICE	COUVERTE PAR ...	
JS	Grade	Horaires	Nom	Prénom	Grade	Cde	Observ.	
PAAC1-	06:15 - 14:07	HUMEZ	CINDY	C05	
AC PAR (Pause de 11h15 à 12h45 sf SDF)	
PAAC2-	06:15 - 14:07	USSON	ANTOINE	CP5NIV1	x	
Aide AC PAR	
PAASMJ	08:00 - 16:45	K= 12:00 - 13:00	LE MOISY	Tom	CP5NIV1	x	
ASMTE PAR	
PADPXJ	08:00 - 16:45	K= 12:00 - 13:00	LAMBERT	OLIVIER	CP6NIV1	
Dpx PAR	
F-PAR	09:00 - 17:45	K= 12:00 - 13:00	MILLES	VALERIE	CP5NIV3	
PAPAUJ	09:00 -	17:45	K= 12:45 - 13:45	AUREILLE	BAPTISTE	CP5NIV2	
Pauseur : PAR (11h15-12h45 et 14h45-16h15) Aide ASMTE PAR (09h00-11h15 et de 13h45-14h40 et de 16h10-17h45	
PAAC10	14:05 - 21:57	RACAMIER	ALEXANDRE CO5	
AC PAR (Pause de 14h45 a 16h15)	
PAAC2O	14:05 - 21:57	VALES-TOLEDANO	AVA	C05	
Aide AC PAR (AC de 20h30 à 21h45)	
PAACXX	21:30 - 06:00	ILIC-HERBIVO	THEO	CP5NIV2	
CT AC Travaux	
PAAC1X	21:55 - 06:15	MAILLET	ANTOINE	C05	
AC PAR (Secteur Tronc Commun)	
PAAC2X	21:55 - 06:15	BARBASTE	THOMAS	C05	
Aide AC PAR (Secteur Aquitaine Bretagne)	
signification des préfixes accolés aux codes des JS : * pour JS demi-couverte # pour JS modifiée € pour JS demi-couverte et modifiée	
SOCIETE NATIONALE DES CHEMINS DE FER FRANCAIS	
Page : 1`;

const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
let nb=0, ec=0;
const updates = [];
const dateStr = '2026-06-17';

lines.forEach((line, lineIdx) => {
  const horaireMatch = line.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
  if(!horaireMatch) { console.log(`[${lineIdx}] SKIP (no horaire):`, JSON.stringify(line.slice(0,50))); return; }

  const jsCodeMatch = line.match(/\b(PA[A-Z0-9]{2,6}[-OX]?|PI[A-Z0-9]{2,6}[-OX]?)\b/);
  const jsCode = jsCodeMatch ? jsCodeMatch[1] : null;

  const ag = agents.find(a => line.toUpperCase().includes(a.nom.toUpperCase()));
  if(!ag) { console.log(`[${lineIdx}] SKIP (no agent found):`, JSON.stringify(line.slice(0,50))); return; }

  console.log(`[${lineIdx}] MATCH: agent=${ag.nom} (${ag.id}), jsCode=${jsCode}, horaire=${horaireMatch[0]}`);

  const hDebut = parseInt(horaireMatch[1]);
  let equipe = "J";
  if(hDebut>=4 && hDebut<11) equipe="M";
  else if(hDebut>=11 && hDebut<20) equipe="AM";
  else equipe="N";
  if(jsCode && /J$/.test(jsCode)) equipe="J";

  const key = `${ag.id}-${dateStr}`;
  updates.push({key, equipe, jsCode, agent: ag.nom});
  nb++;
});

console.log('\n=== TOTAL UPDATES:', nb, '===');
updates.forEach(u => console.log(JSON.stringify(u)));
