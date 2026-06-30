const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = '  },[currentUser?.agent?.id]); // eslint-disable-line\n  \r\n  const [loginTarget,setLoginTarget]=useState(null);';

const replacement = [
  '  },[currentUser?.agent?.id]); // eslint-disable-line',
  '',
  '  // Recharge le planning de l\'agent visualisé quand un admin bascule sur un autre agent,',
  '  // et continue à l\'actualiser toutes les 45s tant que cet agent est affiché',
  '  // (le chargement initial dans handleLogin ne couvre que l\'agent réellement connecté)',
  '  useEffect(()=>{',
  '    if(!currentAgent) return;',
  '    const agId = currentAgent.immatriculation||currentAgent.cp||currentAgent.id;',
  '    const myId = currentUser?.agent?.immatriculation||currentUser?.agent?.cp||currentUser?.agent?.id;',
  '    if(!agId||agId===myId) return;',
  '    const chargerPlanningVisualise=()=>{',
  '      api.planning.getSchedule(agId).then(entries=>{',
  '        if(entries) setSchedule(prev=>({...prev,...entries}));',
  '      }).catch(()=>{});',
  '    };',
  '    chargerPlanningVisualise();',
  '    const interval=setInterval(chargerPlanningVisualise,45000);',
  '    return ()=>clearInterval(interval);',
  '  },[currentAgent]); // eslint-disable-line',
  '  \r\n  const [loginTarget,setLoginTarget]=useState(null);',
].join('\n');

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Rechargement du planning de l\'agent visualisé ajouté avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
