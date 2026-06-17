const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Trouver et remplacer le bloc des 4 inputs PIN
const start = c.indexOf('display:"flex",gap:10}}>');
const end = c.indexOf('</div>', c.indexOf('</div>', start) + 1) + 6;

if(start === -1) { console.log('ERREUR - bloc non trouvé'); process.exit(1); }

const newBlock = `display:"flex",gap:10,position:"relative",cursor:"text"}} onClick={()=>{const inp=document.getElementById('pin-input-hidden');if(inp)inp.focus();}}>
          <input
            id="pin-input-hidden"
            type="tel"
            inputMode="numeric"
            maxLength={4}
            value={arr.join("")}
            autoComplete="off"
            autoFocus
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
              position:"absolute",
              top:0, left:0,
              width:"100%", height:"100%",
              opacity:0.01,
              zIndex:10,
              fontSize:16,
              border:"none",
              outline:"none",
              background:"transparent",
            }}
          />
          {[0,1,2,3].map(i=>(
            <div key={i} style={{
              width:48, height:56,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:24, fontWeight:800,
              border:\`2px solid \${error?"#ef4444":arr[i]?"#0891b2":"#e2e8f0"}\`,
              borderRadius:10,
              background:arr[i]?"#f0fdff":"#fff",
              transition:"border-color .15s",
              position:"relative", zIndex:1,
              pointerEvents:"none",
            }}>
              {arr[i]?"●":""}
            </div>
          ))}
        </div>
      </div>`;

c = c.slice(0, start) + newBlock + c.slice(end);

// Supprimer aussi le useEffect qui focus sur le premier input
c = c.replace("useEffect(()=>{ pinRefs[0].current?.focus(); },[]);", "");

fs.writeFileSync(filePath, c, 'utf8');
console.log('OK - PIN single input');
