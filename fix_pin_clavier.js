const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Remplacer les inputs PIN du login par un clavier visuel
const start = c.indexOf('display:"flex",gap:10,position:"relative"}}');
const end = c.indexOf('</div>', c.indexOf('</div>', start) + 1) + 6;

if(start === -1) { console.log('ERREUR'); process.exit(1); }

const newKeypad = `display:"flex",gap:10}}>\r\n        {[0,1,2,3].map(i=>(<div key={i} style={{width:48,height:56,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,fontWeight:800,border:\`2px solid \${error?"#ef4444":arr[i]?"#0891b2":"#e2e8f0"}\`,borderRadius:10,background:arr[i]?"#f0fdff":"#fff"}}>\r\n          {arr[i]?"●":""}\r\n        </div>))}\r\n      </div>\r\n      {/* Clavier numérique personnalisé */}\r\n      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%",maxWidth:240}}>\r\n        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,idx)=>(\r\n          <button key={idx} onClick={()=>{\r\n            if(k==="⌫"){\r\n              const last=arr.map((d,i)=>d).filter(d=>d).length-1;\r\n              if(last>=0){const next=[...arr];next[last]="";setArr(next);}\r\n            } else if(k!==""){\r\n              const first=arr.findIndex(d=>!d);\r\n              if(first!==-1){const next=[...arr];next[first]=String(k);setArr(next);\r\n                if(first===3){\r\n                  const full=[...arr];full[first]=String(k);\r\n                  const pin=full.join("");\r\n                  if(pin.length===4){\r\n                    if(step==="login") setTimeout(()=>handleLogin(),50);\r\n                    else if(step==="first_time"&&confStr.length===4) setTimeout(()=>handleFirstTime(),50);\r\n                    else setTimeout(()=>setStep("confirm"),50);\r\n                  }\r\n                }\r\n              }\r\n            }\r\n          }}\r\n          style={{padding:"14px 0",fontSize:k==="⌫"?18:20,fontWeight:700,background:k===""?"transparent":"#f8fafc",border:k===""?"none":"1.5px solid #e2e8f0",borderRadius:10,cursor:k===""?"default":"pointer",color:"#1e293b"}}>\r\n            {k}\r\n          </button>\r\n        ))}\r\n      </div>\r\n    </div>`;

c = c.slice(0, start) + newKeypad + c.slice(end);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - clavier numérique personnalisé');
