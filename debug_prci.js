const fs = require('fs');
const c = fs.readFileSync('src/App.jsx', 'utf8');
const idx = c.indexOf('AGENTS_INIT');
const idx2 = c.indexOf('];', idx);
const block = c.slice(idx, idx2);
const agentMatches = [...block.matchAll(/id:"([^"]+)"[^}]*?nom:"([^"]+)"/g)];
const agents = agentMatches.map(m => ({id: m[1], nom: m[2]}));

const text = `PIVGD-	06:10 - 14:02	LUCAS	SAMUEL	CP4NIV1	
PIVGD-/	06:10 - 14:02	HERN	MICHAEL	CO4	x	
PIADJ-	06:15 - 14:07	FAROUIL	CAMERON	C05	
PICCL-	06:15 - 14:17	DUPUY	VICTORIEN	CP6NIV1	
PILCL-	06:15 - 14:17	BENNEQUIN	BENJAMIN	C05	
PILNE-	06:15 - 14:17	CHOUAIB	WASSIM	C05	
#PINE-/	09:00 - 17:02	LEGOGUELIN	ANTOINE	CP5NIV2	
PILNO-	06:15 - 14:17	BOUHEND	RYAD	C05	
PIASSJ	08:00 - 16:45	K= 12:00 - 13:00	CAMPOY	NICOLAS	CP6NIV1	
PIDPXJ	08:00 -	16:45	K= 12:00 - 13:00	BAILLON	GUILLAUME	CP7NIV1	
SD%	08:00 - 16:43	K= 12:00 - 13:00	HAIDER	ZESHEEN	CP6NIV1	
PIPA1J	08:45 -	18:15	K= 13:15 - 15:00	KINET	JULIEN	CP5NIV2	
PIPA3J	08:45 - 16:30	AUDREN	GILDAS	CP4NIV2	
AFOPROI	09:00 - 16:45	GUAY	SEBASTIEN CP6NIV2	x	
F-PRCI	09:00 - 17:45	K= 12:00 - 13:00	MERCIER	YOANN	CP6NIV1	
K-PRCI	09:00 - 17:45	K= 12:00 - 13:00	TOUNKARA	EL-HAJ	C05	
K-PRCI	09:00 - 17:45	K= 12:00 - 13:00	SOUNALATH	VYTHOUNE	C05	x	
#PPRCI	09:00 -	17:45	K=	12:00 - 13:00	OUBRAHAM	ADEL	C05	
PIPA2J	10:15 - 19:45	K= 13:15 - 15:00	PASTANT	MAXIME	CP5NIV2	
PIVGDOR	13:52 - 21:29	MOUAOUED	ABDELKHALIE CP5NIV1	x	
PIADJO	14:05 - 21:59	MILLERAND	THOMAS	CP5NIV2	
PICCLO	14:15 - 22:17	BELOTTI	FLORENT	CP6NIV1	
PILCLO	14:15 - 22:17	FAIAD	ZOE	C05	
PILNEO	14:15 - 22:17	BATY	AUDREY	C05	
PILNOO	14:15 - 22:17	CAILLET	MAXIME	CP5NIV1	
PIADIX	21:57 - 06:17	HUTIN	THOMAS	CP5NIV2	
PICCLX	22:15 - 06:17	BELLISSENT	CHRISTOPHE CP6NIV2	
PILCLX	22:15 -	06:17	MALY	CHRISTOPHE CP5NIV1	
PILNEX	22:15 -	06:15	AUDREN	YVON	C05	
PILNOX	22:15 - 06:17	MENDY	ALEXANDRE C05`;

const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);

lines.forEach((line, lineIdx) => {
  const horaireMatch = line.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
  if(!horaireMatch) { console.log(`[${lineIdx}] SKIP (no horaire):`, JSON.stringify(line.slice(0,60))); return; }

  const jsCodeMatch = line.match(/\b(PA[A-Z0-9]+-?|PI[A-Z0-9]+-?)/);
  let jsCode = jsCodeMatch ? jsCodeMatch[1] : null;

  const ag = agents.find(a => line.toUpperCase().includes(a.nom.toUpperCase()));
  if(!ag) { console.log(`[${lineIdx}] SKIP (no agent found): jsCode=${jsCode}`, JSON.stringify(line.slice(0,60))); return; }

  console.log(`[${lineIdx}] MATCH: agent=${ag.nom} (${ag.id}), jsCode=${jsCode}, horaire=${horaireMatch[0]}`);
});
