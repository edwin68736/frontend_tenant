; Hooks del instalador NSIS (Tauri v2).
; Al desinstalar, elimina los datos de la app en %APPDATA% para que un
; reinstalar pida nuevamente el RUC (vinculación de empresa).
; app_data_dir() en Windows = %APPDATA%\<identifier> = %APPDATA%\com.tukifac.tenant

!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$APPDATA\com.tukifac.tenant"
!macroend
