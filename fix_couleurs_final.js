const fs = require('fs');

const filePath = process.cwd() + '/src/App.jsx';
let c = fs.readFileSync(filePath, 'utf8');

// ── 1. Ajouter state dédié pour les couleurs après useState schedule ──
const oldState = `const [schedule,setSchedule]=usePersist("schedule",{});`;
const newState = `const [schedule,setSchedule]=usePersist("schedule",{});
  const [agentCouleurs, setAgentCouleurs] = React.useState({});`;

if(c.includes(oldState)) {
  c = c.replace(oldState, newState);
  console.log('OK 1 - state agentCouleurs ajouté');
} else {
  console.log('ERREUR 1');
}

// ── 2. Au login, charger les couleurs depuis Railway dans le state dédié ──
const oldLogin = `api.profil.get(agentId).then(p=>{if(p&&p.habilitations)setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations,agentColors:p.agentColors||{}}}));}).catch(()=>{});`;
const newLogin = `api.profil.get(agentId).then(p=>{
    if(p){
      if(p.habilitations) setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations}}));
      if(p.agentColors && Object.keys(p.agentColors).length>0) setAgentCouleurs(p.agentColors);
    }
  }).catch(()=>{});`;

if(c.includes(oldLogin)) {
  c = c.replace(oldLogin, newLogin);
  console.log('OK 2 - chargement couleurs au login');
} else {
  console.log('ERREUR 2');
}

// ── 3. setAgentColors met à jour le state dédié ──
const oldSetter = `const setAgentColors = useCallback((updater)=>{\r\n    setAgentProfiles(p=>{\r\n      const agKeyLocal=agent.immatriculation||agent.cp||agent.id;const prev = p[agKeyLocal]?.agentColors || {};\r\n      const next = typeof updater===\"function\" ? updater(prev) : updater;\r\n      return {...p, [agKeyLocal]:{...(p[agKeyLocal]||{}), agentColors:next}};\r\n    });\r\n  },[agent?.id, setAgentProfiles]);`;

const newSetter = `const setAgentColors = useCallback((updater)=>{
    setAgentCouleurs(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      return next;
    });
  },[]);`;

if(c.includes(oldSetter)) {
  c = c.replace(oldSetter, newSetter);
  console.log('OK 3 - setter couleurs');
} else {
  console.log('ERREUR 3 - cherchons autrement');
  // Cherche sans \r\n
  const idx = c.indexOf('const setAgentColors = useCallback');
  if(idx !== -1) {
    const end = c.indexOf('])', idx) + 2;
    const old2 = c.slice(idx, end+1);
    c = c.replace(old2, `const setAgentColors = useCallback((updater)=>{
    setAgentCouleurs(prev => {
      const next = typeof updater==="function" ? updater(prev) : updater;
      return next;
    });
  },[]);`);
    console.log('OK 3b - setter couleurs via index');
  }
}

// ── 4. getColor lit agentCouleurs directement ──
const oldGetColor = `const getColor=(code)=>{\r\n    // Lire directement agentProfiles pour la réactivité maximale\r\n    const agKeyGC=agent?.immatriculation||agent?.cp||agent?.id;const colors = agentProfiles[agKeyGC]?.agentColors || {};`;
const newGetColor = `const getColor=(code)=>{
    const colors = agentCouleurs || {};`;

if(c.includes(oldGetColor)) {
  c = c.replace(oldGetColor, newGetColor);
  console.log('OK 4 - getColor lit agentCouleurs');
} else {
  // Sans \r\n
  const idx = c.indexOf('const getColor=(code)=>{');
  if(idx !== -1) {
    const nextLine = c.indexOf('const colors = ', idx);
    if(nextLine !== -1) {
      const endLine = c.indexOf('\n', nextLine)+1;
      c = c.slice(0, idx) + `const getColor=(code)=>{\n    const colors = agentCouleurs || {};` + c.slice(endLine);
      console.log('OK 4b - getColor via index');
    }
  } else {
    console.log('ERREUR 4');
  }
}

// ── 5. onClose du ColorCustomizer sauvegarde vers Railway ──
const oldClose = `onClose={()=>setShowColorPicker(false)}/>}`;
const newClose = `onClose={()=>{
          setShowColorPicker(false);
          const agKeyS=agent?.immatriculation||agent?.cp||agent?.id;
          if(Object.keys(agentCouleurs).length>0) api.profil.save(agKeyS, {agentColors: agentCouleurs});
        }}/>}`;

if(c.includes(oldClose)) {
  c = c.replace(oldClose, newClose);
  console.log('OK 5 - sauvegarde à la fermeture');
} else {
  console.log('ERREUR 5');
}

// ── 6. Passer agentCouleurs au ColorCustomizer ──
const oldColorCustomizer = `agentColors={agentProfiles[agent?.id]?.agentColors||{}}`;
const newColorCustomizer = `agentColors={agentCouleurs}`;

if(c.includes(oldColorCustomizer)) {
  c = c.replace(oldColorCustomizer, newColorCustomizer);
  console.log('OK 6 - agentColors passé au CustomColorizer');
} else {
  console.log('ERREUR 6');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('\nTerminé');
