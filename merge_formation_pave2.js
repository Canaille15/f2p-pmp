const fs = require('fs');
let c = fs.readFileSync('src/App.jsx', 'utf8');

const idx = c.indexOf('const diversRows=[]');
const idxEnd = c.indexOf('return sections;', idx);

if (idx === -1 || idxEnd === -1) {
  console.log('ERREUR - marqueurs non trouves');
  process.exit(1);
}

const oldBlock = c.slice(idx, idxEnd);

const newBlock = `const diversRows=[];
  const pcD=PERIOD_COLORS.DIVERS;

  // jsCode des postes qui sont eux-memes des formations (regroupes dans le pave Formation)
  const jsCodesFormationPostes=new Set(
    POSTES_JOURNEE.filter(x=>x.subtitle&&/formation/i.test(x.subtitle)).map(x=>x.jsCode)
  );
  // Postes journée non principaux PRCI (hors postes-formation)
  if(filterF!=="PAR"){
    POSTES_JOURNEE.filter(x=>x.famille==="PRCI"&&!x.principal&&!jsCodesFormationPostes.has(x.jsCode)).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[\`\${a.id}-\${dateKey}\`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PRCI",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Postes journée non principaux PAR (hors postes-formation)
  if(filterF!=="PRCI"){
    POSTES_JOURNEE.filter(x=>x.famille==="PAR"&&!x.principal&&!jsCodesFormationPostes.has(x.jsCode)).forEach(poste=>{
      const ags=agents.filter(a=>{const en=schedule[\`\${a.id}-\${dateKey}\`];return en&&(en.jsCode===poste.jsCode||en.poste===poste.label);});
      if(ags.length>0)diversRows.push({poste,jsCode:poste.jsCode,agents:ags,famille:"PAR",isJournee:true,maxSlots:poste.maxSlots||99});
    });
  }
  // Disponibles
  const dispos=agents.filter(a=>{const en=schedule[\`\${a.id}-\${dateKey}\`];return en&&en.equipe==="DISPO";});
  if(dispos.length>0){
    diversRows.push({poste:{jsCode:"DISPO",label:"Disponibles",subtitle:""},jsCode:"DISPO",agents:dispos,famille:null,isDispo:true,maxSlots:99});
  }
  // Formation — pave unique : badge generique FOR + tous les postes-formation (K-PAR, K-PRCI, F-PRCI...)
  const enFormation=agents.filter(a=>{
    const en=schedule[\`\${a.id}-\${dateKey}\`];
    return en&&(en.equipe==="FOR"||jsCodesFormationPostes.has(en.jsCode));
  });
  if(enFormation.length>0){
    diversRows.push({poste:{jsCode:"FOR",label:"Formation",subtitle:""},jsCode:"FOR",agents:enFormation,famille:null,isFormation:true,maxSlots:99});
  }
  // VM (visite medicale)
  const enVM=agents.filter(a=>{
    const en=schedule[\`\${a.id}-\${dateKey}\`];
    return en&&en.equipe==="VM";
  });
  if(enVM.length>0){
    diversRows.push({poste:{jsCode:"VM",label:"VM",subtitle:""},jsCode:"VM",agents:enVM,famille:null,isVM:true,maxSlots:99});
  }

  if(diversRows.length>0){
    sections.push({id:"DIVERS",label:"🗂 Divers",equipe:"J",pc:pcD,rows:diversRows});
  }

  `;

c = c.slice(0, idx) + newBlock + c.slice(idxEnd);
fs.writeFileSync('src/App.jsx', c, 'utf8');
console.log('OK - pave Formation unique cree');
