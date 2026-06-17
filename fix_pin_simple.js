const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

const start = c.indexOf('display:"flex",gap:10}}>');
const end = c.indexOf('</div>', c.indexOf('</div>', start) + 1) + 6;

if(start === -1) { console.log('ERREUR'); process.exit(1); }

// Un seul input visible stylisé
const newBlock = `display:"flex",gap:0}}>
          <input
            ref={refs[0]}
            type="tel"
            inputMode="numeric"
            maxLength={4}
            value={arr.join("")}
            autoComplete="one-time-code"
            onChange={e=>{
              const val=e.target.value.replace(/\\D/g,"").slice(0,4);
              const next=["","","",""];
              val.split("").forEach((d,i2)=>{next[i2]=d;});
              setArr(next);
              if(val.length===4){
                if(step==="login") setTimeout(()=>handleLogin(),50);
                else if(step==="first_time"&&confStr.length===4) setTimeout(()=>handleFirstTime(),50);
                else setTimeout(()=>setStep("confirm"),50);
              }
            }}
            onKeyDown={e=>{
              if(e.key==="Enter"&&arr.every(d=>d)){
                if(step==="login") handleLogin();
                else if(step==="first_time"&&confStr.length===4) handleFirstTime();
                else setStep("confirm");
              }
            }}
            style={{
              width:200,
              height:56,
              fontSize:32,
              fontWeight:800,
              letterSpacing:16,
              textAlign:"center",
              border:\`2px solid \${error?"#ef4444":arr.some(d=>d)?"#0891b2":"#e2e8f0"}\`,
              borderRadius:12,
              outline:"none",
              background:arr.some(d=>d)?"#f0fdff":"#fff",
              color:"#0891b2",
              padding:"0 16px",
              WebkitTextSecurity:"disc",
            }}
          />
        </div>
      </div>`;

c = c.slice(0, start) + newBlock + c.slice(end);
fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - PIN input simple');
