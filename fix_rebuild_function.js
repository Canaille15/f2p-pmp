const fs = require('fs');
const path = require('path');
const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const marker = 'if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");\nimport api from "./api/client";';

if(!c.includes(marker)) {
  console.log('ERREUR - marqueur exact non trouve, tentative alternative');
  // Essai avec \r\n
  const marker2 = 'if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");\r\nimport api from "./api/client";';
  if(c.includes(marker2)) {
    const replacement = `if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");

        setSchedule(prev=>{
          const next={...prev};
          updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});
          return next;
        });
        setCpsResult({date:dateStr,nb,ecarts:ec});
      }catch(err){
        alert("Erreur import CPS : "+err.message);
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };
import api from "./api/client";`;
    c = c.replace(marker2, replacement);
    fs.writeFileSync(filePath, c, 'utf8');
    console.log('OK - fonction reconstruite (variante CRLF)');
  } else {
    console.log('ERREUR TOTALE - aucun marqueur trouve');
  }
} else {
  const replacement = `if(updates.length===0) throw new Error("Aucun agent reconnu dans le document. Verifiez le format.");

        setSchedule(prev=>{
          const next={...prev};
          updates.forEach(u=>{next[u.key]={equipe:u.equipe,jsCode:u.jsCode,horaires:u.horaires,prive:false,impressionAt:new Date().toISOString()};});
          return next;
        });
        setCpsResult({date:dateStr,nb,ecarts:ec});
      }catch(err){
        alert("Erreur import CPS : "+err.message);
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };
import api from "./api/client";`;
  c = c.replace(marker, replacement);
  fs.writeFileSync(filePath, c, 'utf8');
  console.log('OK - fonction reconstruite');
}
