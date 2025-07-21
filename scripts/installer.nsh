!macro preInit
  SetShellVarContext all
!macroend

!macro customInstall
  IfFileExists "$INSTDIR\${PRODUCT_NAME}.exe" 0 +2
    Goto skipShortcut
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  MessageBox MB_YESNO|MB_ICONQUESTION "Should a desktop shortcut be created?" IDYES +2
    Goto skipShortcut
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  skipShortcut:
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
!macroend