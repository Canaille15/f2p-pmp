const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

function mustReplaceOnce(str, target, replacement, label) {
  const count = str.split(target).length - 1;
  if (count !== 1) {
    console.error('ATTENTION : "' + label + '" trouvé ' + count + ' fois (attendu 1). Ignoré par sécurité.');
    return { str, ok: false };
  }
  console.log('OK : ' + label);
  return { str: str.split(target).join(replacement), ok: true };
}

let ok = true;

// 1. Préambule de VuePlanning : gestion interne d'une fenêtre de mois extensible
{
  const oldPreamble = [
    'function VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile, onDayClick}){',
    '  const todayRowRef = useRef(null);',
    '  useEffect(()=>{ todayRowRef.current?.scrollIntoView({block:"center"}); },[dates]);',
    '  useEffect(()=>{',
    '    const handler=()=>todayRowRef.current?.scrollIntoView({block:"center",behavior:"smooth"});',
    '    window.addEventListener("f2ppmp:scrolltoday",handler);',
    '    return ()=>window.removeEventListener("f2ppmp:scrolltoday",handler);',
    '  },[]);',
    '  // Vue liste verticale scrollable (style Google Agenda mobile)',
    '  // Un jour par ligne, bloc horaire visuel à droite',
    '',
    '  const JOURS_LONG = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];',
    '  const BAR_PX_PER_MIN = 0.5; // 1px = 2 minutes → barre de 480px pour 24h',
    '',
    '  const lignes = dates.map(dk=>{',
  ].join('\r\n');

  const newPreamble = [
    'function VuePlanning({dates, agent, schedule, getColor, getTc, isOwnProfile, onDayClick}){',
    '  const todayRowRef = useRef(null);',
    '  const scrollContainerRef = useRef(null);',
    '  const topSentinelRef = useRef(null);',
    '  const bottomSentinelRef = useRef(null);',
    '  const loadingRef = useRef(false);',
    '  const moisCourant = ()=>{ const d=new Date(); return {year:d.getFullYear(), month:d.getMonth()+1}; };',
    '  const [monthsRange, setMonthsRange] = useState(()=>[moisCourant()]);',
    '',
    '  const allDates = useMemo(()=>{',
    '    let arr=[];',
    '    monthsRange.forEach(({year,month})=>{ arr = arr.concat(getMonthDates(year,month)); });',
    '    return arr;',
    '  },[monthsRange]);',
    '',
    '  const ajouterMoisApres = ()=>{',
    '    if(loadingRef.current) return; loadingRef.current=true;',
    '    setMonthsRange(prev=>{',
    '      const last=prev[prev.length-1];',
    '      let y=last.year, m=last.month+1; if(m>12){m=1;y++;}',
    '      return [...prev,{year:y,month:m}];',
    '    });',
    '    setTimeout(()=>{loadingRef.current=false;},300);',
    '  };',
    '  const ajouterMoisAvant = ()=>{',
    '    if(loadingRef.current) return; loadingRef.current=true;',
    '    const container=scrollContainerRef.current;',
    '    const prevScrollHeight = container?container.scrollHeight:0;',
    '    const prevScrollTop = container?container.scrollTop:0;',
    '    setMonthsRange(prev=>{',
    '      const first=prev[0];',
    '      let y=first.year, m=first.month-1; if(m<1){m=12;y--;}',
    '      return [{year:y,month:m},...prev];',
    '    });',
    '    requestAnimationFrame(()=>{',
    '      requestAnimationFrame(()=>{',
    '        if(container){',
    '          const newScrollHeight=container.scrollHeight;',
    '          container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);',
    '        }',
    '        loadingRef.current=false;',
    '      });',
    '    });',
    '  };',
    '',
    '  useEffect(()=>{',
    '    const container=scrollContainerRef.current;',
    '    if(!container) return;',
    '    const obsBas = new IntersectionObserver((entries)=>{ if(entries[0].isIntersecting) ajouterMoisApres(); },{root:container, threshold:0});',
    '    const obsHaut = new IntersectionObserver((entries)=>{ if(entries[0].isIntersecting) ajouterMoisAvant(); },{root:container, threshold:0});',
    '    if(bottomSentinelRef.current) obsBas.observe(bottomSentinelRef.current);',
    '    if(topSentinelRef.current) obsHaut.observe(topSentinelRef.current);',
    '    return ()=>{ obsBas.disconnect(); obsHaut.disconnect(); };',
    '  },[monthsRange]);',
    '',
    '  useEffect(()=>{ todayRowRef.current?.scrollIntoView({block:"center"}); },[]);',
    '  useEffect(()=>{',
    '    const handler=()=>{',
    '      setMonthsRange([moisCourant()]);',
    '      requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ todayRowRef.current?.scrollIntoView({block:"center",behavior:"smooth"}); }); });',
    '    };',
    '    window.addEventListener("f2ppmp:scrolltoday",handler);',
    '    return ()=>window.removeEventListener("f2ppmp:scrolltoday",handler);',
    '  },[]);',
    '  // Vue liste verticale scrollable, scroll infini mois par mois (style Google Agenda mobile)',
    '  // Un jour par ligne, bloc horaire visuel à droite',
    '',
    '  const JOURS_LONG = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];',
    '  const BAR_PX_PER_MIN = 0.5; // 1px = 2 minutes → barre de 480px pour 24h',
    '',
    '  const lignes = allDates.map(dk=>{',
  ].join('\r\n');

  const r = mustReplaceOnce(content, oldPreamble, newPreamble, 'préambule VuePlanning : scroll infini mois par mois');
  content = r.str; ok = ok && r.ok;
}

// 2. Conteneur scrollable : sentinelles haut/bas + ref
{
  const target = '<div style={{overflowY:"auto",maxHeight:"75vh",WebkitOverflowScrolling:"touch"}}>\r\n        {lignesAvecSep.map((l,i)=>{';
  const replacement = '<div ref={scrollContainerRef} style={{overflowY:"auto",maxHeight:"75vh",WebkitOverflowScrolling:"touch"}}>\r\n        <div ref={topSentinelRef} style={{height:1}}/>\r\n        {lignesAvecSep.map((l,i)=>{';
  const r = mustReplaceOnce(content, target, replacement, 'sentinelle haute + ref du conteneur scrollable');
  content = r.str; ok = ok && r.ok;
}

// 2bis. Sentinelle basse, juste avant la fermeture du conteneur scrollable
{
  const target = [
    '              </div>',
    '            </div>',
    '          );',
    '        })}',
    '      </div>',
    '    </div>',
    '  );',
    '}',
  ].join('\r\n');
  const replacement = [
    '              </div>',
    '            </div>',
    '          );',
    '        })}',
    '        <div ref={bottomSentinelRef} style={{height:1}}/>',
    '      </div>',
    '    </div>',
    '  );',
    '}',
  ].join('\r\n');
  const r = mustReplaceOnce(content, target, replacement, 'sentinelle basse (fermeture conteneur scrollable)');
  content = r.str; ok = ok && r.ok;
}

// 3. Légende mise à jour
{
  const target = '<span style={{fontSize:9,color:"#94a3b8"}}>— Scroll pour naviguer dans le mois</span>';
  const replacement = '<span style={{fontSize:9,color:"#94a3b8"}}>— Scroll pour naviguer entre les mois</span>';
  const r = mustReplaceOnce(content, target, replacement, 'légende mise à jour');
  content = r.str; ok = ok && r.ok;
}

// 4. Suppression du glissement horizontal dans la vue Planning (le scroll prend le relais)
{
  const target = '{calView==="planning"&&<div onTouchStart={swipeMonth.onTouchStart} onTouchEnd={swipeMonth.onTouchEnd}>';
  const replacement = '{calView==="planning"&&<div>';
  const r = mustReplaceOnce(content, target, replacement, 'glissement horizontal désactivé dans la vue Planning');
  content = r.str; ok = ok && r.ok;
}

if (!ok) {
  console.error('\nAU MOINS UN REMPLACEMENT A ÉCHOUÉ — fichier NON modifié, par sécurité.');
  process.exit(1);
}

fs.writeFileSync(path, content, 'utf8');
console.log('\nApp.jsx mis à jour avec succès.');
