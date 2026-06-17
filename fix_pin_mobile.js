const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src', 'App.jsx');
let c = fs.readFileSync(filePath, 'utf8');

// Remplacer la section des inputs PIN par un input unique caché
const oldInputs = `<div style={{display:"flex",gap:12}}>
          {[0,1,2,3].map(i=>(<input key={i} ref={refs[i]} type="password" inputMode="numeric" maxLength={1}
            value={active[i]} onChange={e=>handleDigit(i,e.target.value,active,setActive)}
            onKeyDown={e=>{if(e.key==="Enter"&&active.every(d=>d))submit();if(e.key==="Backspace"&&!active[i]&&i>0)refs[i-1].current?.focus();}}
            style={{width:54,height:62,textAlign:"center",fontSize:28,fontWeight:800,border:\`2px solid \${error?"#ef4444":"#e2e8f0"}\`,borderRadius:12,outline:"none",transition:"border-color .15s"}}/>))}
        </div>`;

const newInputs = `<div style={{display:"flex",gap:12,position:"relative"}} onClick={()=>p0.current?.focus()}>
          <input ref={p0} type="tel" inputMode="numeric" maxLength={4}
            value={active.join("")}
            onChange={e=>{
              const val=e.target.value.replace(/\\D/g,"").slice(0,4);
              const next=["","","",""];
              val.split("").forEach((d,i)=>{next[i]=d;});
              setActive(next);
              if(val.length===4) setTimeout(()=>submit(),100);
            }}
            onKeyDown={e=>{if(e.key==="Enter"&&active.every(d=>d))submit();}}
            style={{position:"absolute",opacity:0,width:"100%",height:"100%",top:0,left:0,zIndex:1,fontSize:16}}
            autoComplete="off"
          />
          {[0,1,2,3].map(i=>(<div key={i} style={{width:54,height:62,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:800,border:\`2px solid \${error?"#ef4444":active[i]?"#3b82f6":"#e2e8f0"}\`,borderRadius:12,background:active[i]?"#f0f9ff":"#fff",transition:"all .15s",cursor:"pointer"}}>
            {active[i]?"●":""}
          </div>))}
        </div>`;

if(c.includes(oldInputs)) {
  c = c.replace(oldInputs, newInputs);
  console.log('OK - inputs PIN remplacés');
} else {
  console.log('ERREUR - inputs non trouvés');
}

fs.writeFileSync(filePath, c, 'utf8');
console.log('Terminé');
