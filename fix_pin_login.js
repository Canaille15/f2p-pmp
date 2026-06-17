const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const start = c.indexOf('display:"flex",gap:10}}>');
const end = c.indexOf('</div>', c.indexOf('</div>', start) + 1) + 6;

if(start === -1) { console.log('ERREUR - début non trouvé'); process.exit(1); }

const newInputs = `display:"flex",gap:10,position:"relative"}} onClick={()=>refs[0].current?.focus()}>\r\n        <input ref={refs[0]} type="tel" inputMode="numeric" maxLength={4}\r\n          value={arr.join("")}\r\n          onChange={e=>{\r\n            const val=e.target.value.replace(/\\D/g,"").slice(0,4);\r\n            const next=["","","",""];\r\n            val.split("").forEach((d,i)=>{next[i]=d;});\r\n            setArr(next);\r\n            if(val.length===4){\r\n              if(step==="login") setTimeout(()=>handleLogin(),100);\r\n              else if(step==="first_time"&&confStr.length===4) setTimeout(()=>handleFirstTime(),100);\r\n              else setTimeout(()=>setStep("confirm"),100);\r\n            }\r\n          }}\r\n          onKeyDown={e=>{\r\n            if(e.key==="Enter"&&arr.every(d=>d)){\r\n              if(step==="login") handleLogin();\r\n              else if(step==="first_time"&&confStr.length===4) handleFirstTime();\r\n              else setStep("confirm");\r\n            }\r\n          }}\r\n          style={{position:"absolute",opacity:0,width:"100%",height:"100%",top:0,left:0,zIndex:1,fontSize:16}}\r\n          autoComplete="off"\r\n        />\r\n        {[0,1,2,3].map(i=>(<div key={i} style={{width:48,height:56,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,border:\`2px solid \${error?"#ef4444":arr[i]?"#0891b2":"#e2e8f0"}\`,borderRadius:10,background:arr[i]?"#f0fdff":"#fff",transition:"all .15s",cursor:"pointer"}}>\r\n          {arr[i]?"●":""}\r\n        </div>))}\r\n      </div>\r\n    </div>`;

c = c.slice(0, start) + newInputs + c.slice(end);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - inputs PIN login remplacés');
