@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo   NETTOYAGE - scripts Pause Figee deja appliques
echo ===================================================
echo.
pause

cd /d C:\Users\olive\Desktop\f2p-pmp

for %%F in (
  patch_pausefigee_appjsx.js
  patch_pausefigee_v2_ergonomie.js
  patch_pausefigee_v3_palette.js
  patch_pausefigee_v4_logique_fia.js
  patch_pausefigee_v5_reset_complet.js
  patch_pausefigee_v6_badge_couleur.js
  patch_pausefigee_v7_mois_verrouille.js
  patch_pausefigee_v8_retrait_migration.js
  patch_pauses_client_fix.js
  ALTER
) do (
  if exist "%%F" (
    del /f /q "%%F"
    echo   supprime : %%F
  )
)

echo.
echo ===================================================
echo   Termine. Verifie ci-dessous s'il reste des fichiers
echo   suspects a la racine (sans extension) :
echo ===================================================
dir /b /a-d | findstr /v /r "\."
echo.
pause
