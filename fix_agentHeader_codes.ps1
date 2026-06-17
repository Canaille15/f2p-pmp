$f = 'src\components\AgentHeader.jsx'
$c = Get-Content $f -Raw

$old = @'
const HAB_PRCI = [
  { code:"CCL",  label:"CCL"        },
  { code:"ADJ",  label:"Adj CCL"    },
  { code:"LNE",  label:"AC LNE"     },
  { code:"LNO",  label:"AC LNO"     },
  { code:"VGD",  label:"AC VGD"     },
  { code:"LC",   label:"AC LC"      },
];
const HAB_PAR = [
  { code:"AC1",  label:"AC PAR"        },
  { code:"AC2",  label:"Aide AC PAR"   },
  { code:"ACXX", label:"CT AC Travaux" },
];
'@

$new = @'
const HAB_PRCI = [
  { code:"PICCL",   label:"CCL"         },
  { code:"PIADJ",   label:"Adj CCL"     },
  { code:"PILNE",   label:"AC LNE"      },
  { code:"PILNO",   label:"AC LNO"      },
  { code:"PIVGD",   label:"AC VGD"      },
  { code:"PILCL",   label:"AC LC"       },
  { code:"PIPA1J",  label:"Pauseur PA1" },
  { code:"PIPA2J",  label:"Pauseur PA2" },
  { code:"PIPA3J",  label:"Pauseur PA3" },
  { code:"PIDPXJ",  label:"DPX PRCI"   },
  { code:"PIASSJ",  label:"Adj DPX"    },
  { code:"PPRCI",   label:"PPRCI"      },
  { code:"AFOPRCI", label:"AFO PRCI"   },
];
const HAB_PAR = [
  { code:"PAAC1-", label:"AC PAR"        },
  { code:"PAAC2-", label:"Aide AC PAR"   },
  { code:"PAACXX", label:"CT AC Travaux" },
  { code:"PAPAUJ", label:"Pauseur PAR"   },
  { code:"PADPXJ", label:"DPX PAR"      },
  { code:"PAASMJ", label:"ASMTE PAR"    },
];
'@

if ($c.Contains($old.Trim())) {
    $c = $c.Replace($old.Trim(), $new.Trim())
    Set-Content $f $c -NoNewline
    Write-Host "OK"
} else {
    Write-Host "ERREUR - texte non trouve"
}
