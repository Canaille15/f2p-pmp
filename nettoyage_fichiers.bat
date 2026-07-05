@echo off
setlocal enabledelayedexpansion
echo ===================================================
echo   NETTOYAGE F2P.PMP - scripts a usage unique + fichiers parasites
echo ===================================================
echo.
echo Ce script va supprimer :
echo   - Les scripts patch_*.js deja appliques (annuaire, adminpanel)
echo   - Le script import_agents_vcard.js (deja execute)
echo   - Les fichiers parasites sans extension a la racine (cd, node, npm...)
echo.
echo AUCUNE suppression de fichier de code source (App.jsx, client.js, etc.)
echo.
pause

cd /d C:\Users\olive\Desktop\f2p-pmp

echo.
echo --- Racine du projet ---

for %%F in (
  patch_annuaire_3_client_module.js
  patch_annuaire_4_appjsx_profil.js
  patch_annuaire_5_appjsx_view.js
  patch_annuaire_7_appjsx_profil_fonction.js
  patch_annuaire_8_appjsx_agents_uo.js
  patch_annuaire_9_appjsx_contraste.js
  patch_annuaire_10_appjsx_resilience_contraste.js
  patch_annuaire_11_appjsx_menu_acces_rapide.js
  patch_annuaire_12_appjsx_icone_svg.js
  patch_annuaire_13_appjsx_icones_note.js
  patch_annuaire_14_appjsx_visibilite_uo.js
  patch_annuaire_15_appjsx_agents_visibles.js
  patch_annuaire_16_appjsx_onglet_persistant.js
  patch_annuaire_17_appjsx_sms_note_fix.js
  patch_annuaire_18_appjsx_titulaire_dynamique.js
  patch_adminpanel_telephone_email.js
  patch_nettoyage_code_mort.js
) do (
  if exist "%%F" (
    del /f /q "%%F"
    echo   supprime : %%F
  )
)

echo.
echo --- Fichiers parasites connus (racine) ---
for %%F in (cd node npm dir vite powershell 11.18.0) do (
  if exist "%%F" (
    del /f /q "%%F"
    echo   supprime : %%F
  )
)
if exist "f2p-pmp@1.0.0" (
  del /f /q "f2p-pmp@1.0.0"
  echo   supprime : f2p-pmp@1.0.0
)

echo.
echo --- api\api ---
cd api\api

for %%F in (
  patch_annuaire_1_server_mount.js
  patch_annuaire_2_agentcontroller_visible.js
  patch_annuaire_6_agentcontroller_fonction.js
  patch_annuaire_11b_agentcontroller_getone_safe.js
  patch_diag_updateUo_log.js
  import_agents_vcard.js
) do (
  if exist "%%F" (
    del /f /q "%%F"
    echo   supprime : %%F
  )
)

cd /d C:\Users\olive\Desktop\f2p-pmp

echo.
echo ===================================================
echo   Termine. Verifie ci-dessous s'il reste des fichiers
echo   suspects a la racine (sans extension, noms bizarres) :
echo ===================================================
echo.
dir /b /a-d | findstr /v /r "\."

echo.
echo (les noms ci-dessus, s'il y en a, sont probablement d'autres
echo  residus de terminal colle par erreur lors de sessions passees -
echo  a verifier un par un avant suppression manuelle)
echo.
pause
