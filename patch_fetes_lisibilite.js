// patch_fetes_lisibilite.js
// Ameliore la lisibilite du panneau 'Suivi des fetes legales'
// (textes, legendes, couleurs, boutons) en desktop et mobile.
// Ne touche a AUCUNE logique : uniquement les valeurs de style inline
// dans la fonction FetesSection (App.jsx, ~lignes 2900-3163).
// Usage : cd C:\Users\olive\Desktop\f2p-pmp && node patch_fetes_lisibilite.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

function mustReplaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    throw new Error('ANCRE INTROUVABLE (' + label + ') - le fichier a peut-etre deja ete modifie ou differe de la version attendue.');
  }
  const idx2 = content.indexOf(oldStr, idx + 1);
  if (idx2 !== -1) {
    throw new Error('ANCRE NON UNIQUE (' + label + ') - trouvee plusieurs fois, patch annule par securite.');
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
}

let count = 0;
content = mustReplaceOnce(content, "    <div style={{marginTop:14,border:\"1.5px solid #e2e8f0\",borderRadius:14,overflow:\"hidden\",background:\"#fff\"}}>\r\n", "    <div style={{marginTop:14,border:\"2px solid #e2e8f0\",borderRadius:14,overflow:\"hidden\",background:\"#fff\",boxShadow:\"0 1px 3px rgba(0,0,0,.06)\"}}>\r\n", 'hunk_0_L2900');
count++;
content = mustReplaceOnce(content, "        style={{background:\"linear-gradient(135deg,#9d174d,#be185d)\",padding:\"11px 16px\",\r\n          display:\"flex\",alignItems:\"center\",gap:8,cursor:\"pointer\",userSelect:\"none\",flexWrap:\"wrap\"}}>\r\n", "        style={{background:\"linear-gradient(135deg,#831843,#9d174d)\",padding:\"16px 20px\",\r\n          display:\"flex\",alignItems:\"center\",gap:10,cursor:\"pointer\",userSelect:\"none\",flexWrap:\"wrap\"}}>\r\n", 'hunk_1_L2904');
count++;
content = mustReplaceOnce(content, "        <span style={{fontSize:15,flexShrink:0}}>\ud83e\ude77</span>\r\n        <span style={{fontSize:13,fontWeight:800,color:\"#fff\",flex:1,minWidth:120}}>\r\n", "        <span style={{fontSize:20,flexShrink:0}}>\ud83e\ude77</span>\r\n        <span style={{fontSize:17,fontWeight:800,color:\"#fff\",flex:1,minWidth:140}}>\r\n", 'hunk_2_L2908');
count++;
content = mustReplaceOnce(content, "            background:\"rgba(22,163,74,.85)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:3,flexShrink:0}}>\r\n", "            background:\"rgba(22,163,74,.95)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:4,flexShrink:0}}>\r\n", 'hunk_3_L2918');
count++;
content = mustReplaceOnce(content, "            background:\"rgba(59,130,246,.85)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:3,flexShrink:0}}>\r\n", "            background:\"rgba(59,130,246,.95)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:4,flexShrink:0}}>\r\n", 'hunk_4_L2926');
count++;
content = mustReplaceOnce(content, "            background:\"rgba(22,163,74,.7)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:3,flexShrink:0}}\r\n", "            background:\"rgba(22,163,74,.82)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:4,flexShrink:0}}\r\n", 'hunk_5_L2934');
count++;
content = mustReplaceOnce(content, "            background:\"rgba(245,158,11,.8)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:3,flexShrink:0}}\r\n", "            background:\"rgba(245,158,11,.92)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:4,flexShrink:0}}\r\n", 'hunk_6_L2943');
count++;
content = mustReplaceOnce(content, "            background:\"rgba(59,130,246,.7)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:3,flexShrink:0}}\r\n", "            background:\"rgba(59,130,246,.82)\",color:\"#fff\",\r\n            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,\r\n            display:\"inline-flex\",alignItems:\"center\",gap:4,flexShrink:0}}\r\n", 'hunk_7_L2952');
count++;
content = mustReplaceOnce(content, "            borderRadius:20,padding:\"2px 8px\",fontSize:10,fontWeight:700,flexShrink:0}}>\r\n", "            borderRadius:20,padding:\"4px 11px\",fontSize:12,fontWeight:700,flexShrink:0}}>\r\n", 'hunk_8_L2962');
count++;
content = mustReplaceOnce(content, "        <span style={{fontSize:9,color:\"rgba(255,255,255,.35)\",fontStyle:\"italic\",flexShrink:0}}>GRH00143</span>\r\n        <span style={{color:\"#fff\",fontSize:14,fontWeight:700,transition:\"transform .2s\",\r\n", "        <span style={{fontSize:11,color:\"rgba(255,255,255,.55)\",fontStyle:\"italic\",flexShrink:0}}>GRH00143</span>\r\n        <span style={{color:\"#fff\",fontSize:18,fontWeight:700,transition:\"transform .2s\",\r\n", 'hunk_9_L2967');
count++;
content = mustReplaceOnce(content, "            padding:\"9px 14px\",display:\"flex\",alignItems:\"center\",gap:8,flexWrap:\"wrap\"}}>\r\n            <span style={{fontSize:15,flexShrink:0}}>\u26a0\ufe0f</span>\r\n", "            padding:\"12px 16px\",display:\"flex\",alignItems:\"center\",gap:10,flexWrap:\"wrap\"}}>\r\n            <span style={{fontSize:19,flexShrink:0}}>\u26a0\ufe0f</span>\r\n", 'hunk_10_L2978');
count++;
content = mustReplaceOnce(content, "              <div style={{fontSize:11,fontWeight:800,color:\"#c2410c\"}}>\r\n", "              <div style={{fontSize:14,fontWeight:800,color:\"#c2410c\"}}>\r\n", 'hunk_11_L2981');
count++;
content = mustReplaceOnce(content, "              <div style={{fontSize:10,color:\"#92400e\",marginTop:1}}>\r\n", "              <div style={{fontSize:12,color:\"#92400e\",marginTop:2}}>\r\n", 'hunk_12_L2984');
count++;
content = mustReplaceOnce(content, "            {canEdit&&<div style={{display:\"flex\",gap:5,flexShrink:0}}>\r\n", "            {canEdit&&<div style={{display:\"flex\",gap:7,flexShrink:0}}>\r\n", 'hunk_13_L2993');
count++;
content = mustReplaceOnce(content, "                style={{background:\"#16a34a\",color:\"#fff\",border:\"none\",borderRadius:7,\r\n                  padding:\"5px 10px\",cursor:\"pointer\",fontSize:10,fontWeight:700}}>\u2713 Pris</button>\r\n", "                style={{background:\"#16a34a\",color:\"#fff\",border:\"none\",borderRadius:8,\r\n                  padding:\"8px 14px\",cursor:\"pointer\",fontSize:13,fontWeight:700,minHeight:36}}>\u2713 Pris</button>\r\n", 'hunk_14_L2995');
count++;
content = mustReplaceOnce(content, "                style={{background:\"#f1f5f9\",color:\"#475569\",border:\"1px solid #e2e8f0\",\r\n                  borderRadius:7,padding:\"5px 10px\",cursor:\"pointer\",fontSize:10}}>\u23f0 +10j</button>\r\n", "                style={{background:\"#f1f5f9\",color:\"#475569\",border:\"1px solid #cbd5e1\",\r\n                  borderRadius:8,padding:\"8px 14px\",cursor:\"pointer\",fontSize:13,fontWeight:600,minHeight:36}}>\u23f0 +10j</button>\r\n", 'hunk_15_L2998');
count++;
content = mustReplaceOnce(content, "                <div style={{display:\"flex\",alignItems:\"center\",gap:8,padding:\"9px 12px\"}}>\r\n", "                <div style={{display:\"flex\",alignItems:\"center\",gap:10,padding:\"12px 14px\"}}>\r\n", 'hunk_16_L3017');
count++;
content = mustReplaceOnce(content, "                    borderRadius:7,padding:\"3px 8px\",\r\n                    fontFamily:\"monospace\",fontSize:11,fontWeight:800,\r\n                    flexShrink:0,minWidth:36,textAlign:\"center\",\r\n", "                    borderRadius:8,padding:\"5px 10px\",\r\n                    fontFamily:\"monospace\",fontSize:13,fontWeight:800,\r\n                    flexShrink:0,minWidth:44,textAlign:\"center\",\r\n", 'hunk_17_L3022');
count++;
content = mustReplaceOnce(content, "                    <div style={{fontSize:11,fontWeight:700,color:\"#1e293b\",\r\n", "                    <div style={{fontSize:14,fontWeight:700,color:\"#1e293b\",\r\n", 'hunk_18_L3029');
count++;
content = mustReplaceOnce(content, "                      {l.estDimanche&&<span style={{fontSize:9,color:\"#dc2626\",marginLeft:5,fontWeight:800}}>\u26a0\ufe0fDim.</span>}\r\n", "                      {l.estDimanche&&<span style={{fontSize:11,color:\"#dc2626\",marginLeft:6,fontWeight:800}}>\u26a0\ufe0fDim.</span>}\r\n", 'hunk_19_L3032');
count++;
content = mustReplaceOnce(content, "                    <div style={{fontSize:9,color:\"#64748b\",marginTop:1,display:\"flex\",gap:6,flexWrap:\"wrap\"}}>\r\n", "                    <div style={{fontSize:11,color:\"#475569\",marginTop:2,display:\"flex\",gap:7,flexWrap:\"wrap\"}}>\r\n", 'hunk_20_L3034');
count++;
content = mustReplaceOnce(content, "                        fontWeight:600,\r\n", "                        fontWeight:700,\r\n", 'hunk_21_L3042');
count++;
content = mustReplaceOnce(content, "                    borderRadius:20,padding:\"3px 9px\",\r\n                    fontSize:9,fontWeight:700,whiteSpace:\"nowrap\",flexShrink:0,\r\n", "                    borderRadius:20,padding:\"5px 12px\",\r\n                    fontSize:12,fontWeight:700,whiteSpace:\"nowrap\",flexShrink:0,\r\n", 'hunk_22_L3056');
count++;
content = mustReplaceOnce(content, "                <div style={{display:\"flex\",alignItems:\"center\",gap:6,\r\n                  padding:\"0 12px 8px\",flexWrap:\"wrap\"}}>\r\n", "                <div style={{display:\"flex\",alignItems:\"center\",gap:8,\r\n                  padding:\"0 14px 11px\",flexWrap:\"wrap\"}}>\r\n", 'hunk_23_L3066');
count++;
content = mustReplaceOnce(content, "                    <div style={{display:\"flex\",gap:4,alignItems:\"center\",flex:1}}>\r\n", "                    <div style={{display:\"flex\",gap:6,alignItems:\"center\",flex:1}}>\r\n", 'hunk_24_L3071');
count++;
content = mustReplaceOnce(content, "                        style={{border:\"1px solid #e2e8f0\",borderRadius:6,padding:\"3px 7px\",\r\n                          fontSize:10,outline:\"none\",flex:1}}/>\r\n", "                        style={{border:\"1px solid #cbd5e1\",borderRadius:7,padding:\"6px 9px\",\r\n                          fontSize:13,outline:\"none\",flex:1,minHeight:34}}/>\r\n", 'hunk_25_L3074');
count++;
content = mustReplaceOnce(content, "                          borderRadius:5,padding:\"3px 8px\",cursor:\"pointer\",fontSize:10}}>\u2713</button>\r\n", "                          borderRadius:7,padding:\"6px 12px\",cursor:\"pointer\",fontSize:13,minHeight:34}}>\u2713</button>\r\n", 'hunk_26_L3078');
count++;
content = mustReplaceOnce(content, "                        style={{background:\"#f1f5f9\",color:\"#475569\",border:\"none\",\r\n                          borderRadius:5,padding:\"3px 8px\",cursor:\"pointer\",fontSize:10}}>\u2715</button>\r\n", "                        style={{background:\"#f1f5f9\",color:\"#475569\",border:\"1px solid #cbd5e1\",\r\n                          borderRadius:7,padding:\"6px 12px\",cursor:\"pointer\",fontSize:13,minHeight:34}}>\u2715</button>\r\n", 'hunk_27_L3080');
count++;
content = mustReplaceOnce(content, "                    <div style={{flex:1,fontSize:10}}>\r\n", "                    <div style={{flex:1,fontSize:12}}>\r\n", 'hunk_28_L3084');
count++;
content = mustReplaceOnce(content, "                          ? <span style={{color:\"#3b82f6\",fontWeight:600}}>\r\n", "                          ? <span style={{color:\"#2563eb\",fontWeight:700}}>\r\n", 'hunk_29_L3088');
count++;
content = mustReplaceOnce(content, "                              <div style={{color:\"#3b82f6\",fontWeight:700,fontSize:10}}>\r\n", "                              <div style={{color:\"#2563eb\",fontWeight:700,fontSize:12}}>\r\n", 'hunk_30_L3093');
count++;
content = mustReplaceOnce(content, "                              <div style={{color:\"#f59e0b\",fontWeight:600,fontSize:9,marginTop:2,\r\n                                display:\"flex\",alignItems:\"center\",gap:3}}>\r\n", "                              <div style={{color:\"#b45309\",fontWeight:700,fontSize:11,marginTop:3,\r\n                                display:\"flex\",alignItems:\"center\",gap:4}}>\r\n", 'hunk_31_L3096');
count++;
content = mustReplaceOnce(content, "                          : <span style={{color:\"#94a3b8\",fontStyle:\"italic\"}}>Non renseign\u00e9</span>\r\n", "                          : <span style={{color:\"#64748b\",fontStyle:\"italic\"}}>Non renseign\u00e9</span>\r\n", 'hunk_32_L3101');
count++;
content = mustReplaceOnce(content, "                  {canEdit&&!isEditing&&<div style={{display:\"flex\",gap:4,flexShrink:0}}>\r\n", "                  {canEdit&&!isEditing&&<div style={{display:\"flex\",gap:6,flexShrink:0}}>\r\n", 'hunk_33_L3107');
count++;
content = mustReplaceOnce(content, "                      style={{background:\"#f1f5f9\",border:\"1px solid #e2e8f0\",borderRadius:6,\r\n                        padding:\"3px 7px\",cursor:\"pointer\",fontSize:10}}>\ud83d\udcc5</button>\r\n", "                      style={{background:\"#f1f5f9\",border:\"1px solid #cbd5e1\",borderRadius:8,\r\n                        padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,minWidth:38,minHeight:38}}>\ud83d\udcc5</button>\r\n", 'hunk_34_L3110');
count++;
content = mustReplaceOnce(content, "                        border:`1px solid ${l.estPayee?\"#bfdbfe\":\"#e2e8f0\"}`,\r\n                        borderRadius:6,padding:\"3px 7px\",cursor:\"pointer\",fontSize:10}}>\ud83d\udcb6</button>\r\n", "                        border:`1.5px solid ${l.estPayee?\"#93c5fd\":\"#cbd5e1\"}`,\r\n                        borderRadius:8,padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,minWidth:38,minHeight:38}}>\ud83d\udcb6</button>\r\n", 'hunk_35_L3115');
count++;
content = mustReplaceOnce(content, "                        border:`1px solid ${motifVisible?\"#fbcfe8\":\"#e2e8f0\"}`,\r\n                        borderRadius:6,padding:\"3px 7px\",cursor:\"pointer\",fontSize:10,\r\n", "                        border:`1.5px solid ${motifVisible?\"#f9a8d4\":\"#cbd5e1\"}`,\r\n                        borderRadius:8,padding:\"7px 11px\",cursor:\"pointer\",fontSize:15,\r\n                        minWidth:38,minHeight:38,\r\n", 'hunk_36_L3122');
count++;
content = mustReplaceOnce(content, "                  margin:\"0 12px 10px\",\r\n", "                  margin:\"0 14px 12px\",\r\n", 'hunk_37_L3130');
count++;
content = mustReplaceOnce(content, "                  borderRadius:8,padding:\"8px 10px\",\r\n                  fontSize:9,lineHeight:1.5,\r\n                  color:l.estPerdue?\"#991b1b\":l.code===\"VN\"?\"#6b21a8\":\"#475569\",\r\n                  border:`1px solid ${l.estPerdue?\"#fecaca\":l.code===\"VN\"?\"#e9d5ff\":\"#e2e8f0\"}`,\r\n", "                  borderRadius:8,padding:\"10px 13px\",\r\n                  fontSize:12,lineHeight:1.55,\r\n                  color:l.estPerdue?\"#991b1b\":l.code===\"VN\"?\"#6b21a8\":\"#334155\",\r\n                  border:`1.5px solid ${l.estPerdue?\"#fecaca\":l.code===\"VN\"?\"#e9d5ff\":\"#cbd5e1\"}`,\r\n", 'hunk_38_L3132');
count++;
content = mustReplaceOnce(content, "                  {l.estPerdue&&<div style={{fontWeight:800,fontSize:10,marginBottom:3}}>\u274c PERDUE</div>}\r\n", "                  {l.estPerdue&&<div style={{fontWeight:800,fontSize:13,marginBottom:4}}>\u274c PERDUE</div>}\r\n", 'hunk_39_L3137');
count++;
content = mustReplaceOnce(content, "        <div style={{padding:\"7px 12px\",borderTop:\"1px solid #f1f5f9\",\r\n          display:\"flex\",gap:8,flexWrap:\"wrap\",alignItems:\"center\",background:\"#fafafa\"}}>\r\n", "        <div style={{padding:\"11px 14px\",borderTop:\"1px solid #e2e8f0\",\r\n          display:\"flex\",gap:11,flexWrap:\"wrap\",alignItems:\"center\",background:\"#f8fafc\"}}>\r\n", 'hunk_40_L3146');
count++;
content = mustReplaceOnce(content, "            <span key={l} style={{display:\"inline-flex\",alignItems:\"center\",gap:3,fontSize:9}}>\r\n              <span style={{width:7,height:7,borderRadius:\"50%\",background:bg,flexShrink:0}}/>\r\n              <span style={{color:\"#64748b\"}}>{l}</span>\r\n", "            <span key={l} style={{display:\"inline-flex\",alignItems:\"center\",gap:5,fontSize:11}}>\r\n              <span style={{width:10,height:10,borderRadius:\"50%\",background:bg,flexShrink:0}}/>\r\n              <span style={{color:\"#475569\",fontWeight:600}}>{l}</span>\r\n", 'hunk_41_L3157');
count++;
content = mustReplaceOnce(content, "          <span style={{fontSize:8,color:\"#cbd5e1\",fontStyle:\"italic\"}}>GRH00143</span>\r\n", "          <span style={{fontSize:10,color:\"#94a3b8\",fontStyle:\"italic\"}}>GRH00143</span>\r\n", 'hunk_42_L3163');
count++;

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK - ' + count + ' remplacements appliques sur ' + filePath);
console.log('Pense a: npm run build puis verifier le panneau Fetes legales avant de deployer.');