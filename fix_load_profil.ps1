$f = 'src\App.jsx'
$c = Get-Content $f -Raw

$old = '    }).catch(()=>{});
  };
  const handleLogout=()=>{'

$new = '    }).catch(()=>{});
    api.profil.get(agentId).then(p=>{if(p&&p.habilitations)setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations}}));}).catch(()=>{});
  };
  const handleLogout=()=>{'

$c = $c.Replace($old, $new)
Set-Content $f $c -NoNewline
Write-Host "OK"
