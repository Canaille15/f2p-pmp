$f = 'src\api\client.js'
$c = Get-Content $f -Raw

$old = "habilitations:            row.habilitations          || {},"
$new = "habilitations:            Array.isArray(row.habilitations) ? Object.fromEntries((row.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (row.habilitations||{}),"

$c = $c.Replace($old, $new)
Set-Content $f $c -NoNewline
Write-Host "OK"
