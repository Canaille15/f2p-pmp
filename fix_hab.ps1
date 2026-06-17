$f = 'src\api\client.js'
$c = Get-Content $f -Raw

# Texte a inserer dans le module profil, avant la fermeture
$newFunc = @'
  setHabilitations: (agentId, habs) =>
    apiFetch(`/profil/${agentId}/habilitations`, {
      method: 'PUT',
      body: JSON.stringify({ habilitations: habs }),
    }),
'@

# On cherche changePin et on insere avant
$c = $c.Replace("  changePin: (agentId, newPin) =>", "$newFunc  changePin: (agentId, newPin) =>")

Set-Content $f $c -NoNewline
Write-Host "OK - setHabilitations ajoute"
