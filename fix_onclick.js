const fs = require('fs');
const f = 'src/App.jsx';
let c = fs.readFileSync(f, 'utf8');

const old = `              onClick={()=>{
                if(codeActif==="EFFACER"){ setDay(dk,null); return; }
                if(codeActif){ setDay(dk,code===codeActif?null:codeActif); return; }
                setDayPopup({dk, entry:en||null});
              }}`;

const newCode = `              onClick={()=>{ setDayPopup({dk, entry:en||null}); }}`;

if (c.includes(old)) {
    c = c.replace(old, newCode);
    fs.writeFileSync(f, c, 'utf8');
    console.log('OK - onClick simplifie');
} else {
    console.log('ERREUR - texte non trouve');
}
