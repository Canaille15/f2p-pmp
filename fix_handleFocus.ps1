$f = 'src\App.jsx'
$c = Get-Content $f -Raw

$old = "          habilitations:       profile.habilitations||{},"
$new = "          habilitations:       Array.isArray(profile.habilitations) ? Object.fromEntries((profile.habilitations||[]).map(h=>[h.code_poste,'HC'])) : (profile.habilitations||{}),"

if ($c.Contains($old)) {
    $c = $c.Replace($old, $new)
    Set-Content $f $c -NoNewline
    Write-Host "OK"
} else {
    Write-Host "ERREUR - texte non trouve"
}
