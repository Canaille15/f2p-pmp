$f = 'src\App.jsx'
$c = Get-Content $f -Raw

$old = 'api.profil.setHabilitations(agent.immatriculation||agent.cp||agent.id,Object.entries(hab).filter(([,v])=>v==="HC").map(([c])=>({code_poste:c,date_debut:new Date().toISOString().slice(0,10)}))).catch(()=>{})'

$new = 'const agCp2=agent.immatriculation||agent.cp||agent.id;api.profil.setHabilitations(agCp2,Object.entries(hab).filter(([,v])=>v==="HC").map(([c])=>({code_poste:c,date_debut:new Date().toISOString().slice(0,10)}))).then(()=>api.profil.get(agCp2).then(p=>{if(p&&p.habilitations)setProfile({habilitations:p.habilitations});})).catch(()=>{})'

$c = $c.Replace($old, $new)
Set-Content $f $c -NoNewline
Write-Host "OK"
