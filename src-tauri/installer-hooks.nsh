; The compressed TeX payload is bundled, not downloaded on the user's machine.
; This file's digest is updated together with scripts/build/tex-runtime.lock.json.
!define SIMPLELEXEDITOR_TEX_SHA256 "bc87b62b6875d6dbfd39026e5adabe47b54fe97d74b3550d00e6cd156e0c22eb"

!macro NSIS_HOOK_PREINSTALL
  ; Reserve additional space for the expanded package tree (KiB). The archive
  ; itself is already counted by Tauri's generated resource size calculation.
  AddSize 8388608
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "LaTeX, Schriften und wissenschaftliche Pakete werden eingerichtet …"
  ; All files below tex and tex-staging are application-managed resources.
  RMDir /r "$INSTDIR\tex-staging"
  nsExec::ExecToLog '"$INSTDIR\tex-runtime.exe" -y "-o$INSTDIR\tex-staging"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "Die LaTeX-Umgebung konnte nicht entpackt werden. Prüfe freien Speicherplatz und starte den SimpleLexEditor-Installer erneut."
    Abort
  ${EndIf}
  ${IfNot} ${FileExists} "$INSTDIR\tex-staging\TinyTeX\bin\windows\biber.exe"
    MessageBox MB_ICONSTOP "Die LaTeX-Umgebung ist unvollständig. Starte den SimpleLexEditor-Installer erneut."
    Abort
  ${EndIf}
  RMDir /r "$INSTDIR\tex"
  ClearErrors
  Rename "$INSTDIR\tex-staging" "$INSTDIR\tex"
  ${If} ${Errors}
    MessageBox MB_ICONSTOP "Die LaTeX-Umgebung ist noch in Verwendung. Schließe SimpleLexEditor und starte den Installer erneut."
    Abort
  ${EndIf}
  FileOpen $0 "$INSTDIR\tex\roxena-runtime.sha256" w
  FileWrite $0 "${SIMPLELEXEDITOR_TEX_SHA256}"
  FileClose $0
  Delete "$INSTDIR\tex-runtime.exe"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$INSTDIR\tex"
  RMDir /r "$INSTDIR\tex-staging"
  RMDir "$INSTDIR"
!macroend
