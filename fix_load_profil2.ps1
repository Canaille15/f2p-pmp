$f = 'src\App.jsx'
$c = Get-Content $f -Raw

# Cherche la ligne avec catch et handleLogout (avec CRLF)
$old = "    }).catch(()=>{});`r`n  };`r`n  const handleLogout=()=>{"
$new = "    }).catch(()=>{});`r`n    api.profil.get(agentId).then(p=>{if(p&&p.habilitations)setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations}}));}).catch(()=>{});`r`n  };`r`n  const handleLogout=()=>{"

if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    Set-Content $f $c -NoNewline
    Write-Host "OK - remplace avec CRLF"
} else {
    # Essai avec LF seulement
    $old2 = "    }).catch(()=>{});`n  };`n  const handleLogout=()=>{"
    $new2 = "    }).catch(()=>{});`n    api.profil.get(agentId).then(p=>{if(p&&p.habilitations)setAgentProfiles(prev=>({...prev,[agentId]:{...(prev[agentId]||{}),...p,habilitations:p.habilitations}}));}).catch(()=>{});`n  };`n  const handleLogout=()=>{"
    if ($c.Contains($old2)) {
        $c = $c.Replace($old2, $new2)
        Set-Content $f $c -NoNewline
        Write-Host "OK - remplace avec LF"
    } else {
        Write-Host "ERREUR - texte non trouve"
    }
}
