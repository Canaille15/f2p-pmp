const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const start = c.indexOf('display:"flex",gap:12}}>');
const end = c.indexOf('</div>', c.indexOf('</div>', start) + 1) + 6;

if(start === -1) { console.log('ERREUR - début non trouvé'); process.exit(1); }

const newInputs = `display:"flex",gap:12,position:"relative"}} onClick={()=>p0.current?.focus()}>\r\n          <input ref={p0} type="tel" inputMode="numeric" maxLength={4}\r\n            value={active.join("")}\r\n            onChange={e=>{\r\n              const val=e.target.value.replace(/\\D/g,"").slice(0,4);\r\n              const next=["","","",""];\r\n              val.split("").forEach((d,i)=>{next[i]=d;});\r\n              setActive(next);\r\n              if(val.length===4) setTimeout(()=>submit(),100);\r\n            }}\r\n            onKeyDown={e=>{if(e.key==="Enter"&&active.every(d=>d))submit();}}\r\n            style={{position:"absolute",opacity:0,width:"100%",height:"100%",top:0,left:0,zIndex:1,fontSize:16}}\r\n            autoComplete="off"\r\n          />\r\n          {[0,1,2,3].map(i=>(<div key={i} style={{width:54,height:62,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,border:\`2px solid \${error?"#ef4444":active[i]?"#3b82f6":"#e2e8f0"}\`,borderRadius:12,background:active[i]?"#f0f9ff":"#fff",transition:"all .15s",cursor:"pointer"}}>\r\n            {active[i]?"●":""}\r\n          </div>))}\r\n        </div>`;

c = c.slice(0, start) + newInputs + c.slice(end);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - inputs PIN remplacés');
