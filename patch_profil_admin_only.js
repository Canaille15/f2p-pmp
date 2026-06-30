const fs = require('fs');
const path = './src/App.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = '          <button onClick={()=>setProfileOpen(p=>!p)}\r\n            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 8px",\r\n              background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",\r\n              gap:5,fontSize:11,color:"#1e293b",fontWeight:700,maxWidth:130}}>';
const replacement = '          <button onClick={()=>{if(isAdmin) setProfileOpen(p=>!p);}}\r\n            style={{border:"1.5px solid #e2e8f0",borderRadius:8,padding:"5px 8px",\r\n              background:"#fff",cursor:isAdmin?"pointer":"default",display:"flex",alignItems:"center",\r\n              gap:5,fontSize:11,color:"#1e293b",fontWeight:700,maxWidth:130}}>';

const count = content.split(target).length - 1;
console.log('Occurrences trouvées : ' + count);

if (count === 1) {
  content = content.split(target).join(replacement);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Sélecteur de profil réservé aux admins avec succès.');
} else {
  console.error('Nombre inattendu (' + count + ', attendu 1). Aucune modification effectuée par sécurité.');
  process.exit(1);
}
