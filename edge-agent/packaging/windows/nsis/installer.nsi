; =============================================================================
;  installer.nsi  —  NSIS Installer Script for EdgePulse Agent
;
;  Usage (from edge-agent/ directory, after running PyInstaller):
;      makensis packaging\windows\nsis\installer.nsi
;
;  Or with an explicit version override (as called by build_windows.ps1):
;      makensis /DPRODUCT_VERSION=1.2.3 packaging\windows\nsis\installer.nsi
;
;  Output: packaging\dist\EdgePulse-Agent-Setup-<version>.exe
;
;  Prerequisites:
;      - NSIS 3.x installed and on PATH
;      - PyInstaller bundle at dist\edgepulse\
;      - Bootstrapped model at dist\edgepulse\models\
; =============================================================================

; ---------------------------------------------------------------------------
; NSIS Modern UI settings
; ---------------------------------------------------------------------------
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "WinVer.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!include "WordFunc.nsh"

!ifndef PRODUCT_VERSION
  !define PRODUCT_VERSION "0.1.0"
!endif

!define PRODUCT_NAME        "EdgePulse Agent"
!define PRODUCT_PUBLISHER   "EdgePulse"
!define PRODUCT_URL         "https://edgepulse.io"
!define PRODUCT_UNINST_KEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}"
!define PRODUCT_DIR_REGKEY  "Software\${PRODUCT_PUBLISHER}\${PRODUCT_NAME}"
!define INSTALL_DIR         "$PROGRAMFILES64\EdgePulse"
!define DATA_DIR            "$COMMONAPPDATA\EdgePulse"
!define SERVICE_NAME        "EdgePulseAgent"
!define SERVICE_DISPLAY     "EdgePulse Monitoring Agent"
!define EXE_NAME            "edge-agent.exe"

; Output filename — computed relative to this script
!define DIST_DIR            "..\..\..\packaging\dist"
OutFile "${DIST_DIR}\EdgePulse-Agent-Setup-${PRODUCT_VERSION}.exe"

; Where PyInstaller put the bundle (relative to edge-agent\)
!define BUNDLE_DIR          "..\..\..\dist\edgepulse"

; ---------------------------------------------------------------------------
; General
; ---------------------------------------------------------------------------
Name                "${PRODUCT_NAME} ${PRODUCT_VERSION}"
InstallDir          "${INSTALL_DIR}"
InstallDirRegKey    HKLM "${PRODUCT_DIR_REGKEY}" ""
RequestExecutionLevel admin
ShowInstDetails     show
ShowUnInstDetails   show
SetCompressor       /SOLID lzma

; ---------------------------------------------------------------------------
; MUI Interface settings
; ---------------------------------------------------------------------------
!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"

!define MUI_WELCOMEPAGE_TEXT "This wizard will install ${PRODUCT_NAME} ${PRODUCT_VERSION} on your computer.$\r$\n$\r$\nEdgePulse provides AI-powered security monitoring and anomaly detection for your endpoint.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_TEXT "EdgePulse Agent has been installed.$\r$\n$\r$\nThe Windows Service has been registered and will start automatically on boot.$\r$\n$\r$\nClick Finish to exit Setup."
!define MUI_FINISHPAGE_RUN           "$INSTDIR\${EXE_NAME}"
!define MUI_FINISHPAGE_RUN_TEXT      "Start EdgePulse Agent now"
!define MUI_FINISHPAGE_RUN_PARAMETERS "run"
!define MUI_FINISHPAGE_LINK          "Open EdgePulse documentation"
!define MUI_FINISHPAGE_LINK_LOCATION "https://docs.edgepulse.io"

; Pages
!insertmacro MUI_PAGE_WELCOME
; NOTE: If you have a LICENSE file, set the correct relative path here.
;       The path below assumes a LICENSE file at the repository root
;       (one level above edge-agent\).  If absent, comment out this line.
;!insertmacro MUI_PAGE_LICENSE "..\..\..\..\LICENSE"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; ---------------------------------------------------------------------------
; Version information (shown in Windows Explorer)
; ---------------------------------------------------------------------------
VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName"     "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion"  "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName"     "${PRODUCT_PUBLISHER}"
VIAddVersionKey "LegalCopyright"  "(C) ${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Installer"
VIAddVersionKey "FileVersion"     "${PRODUCT_VERSION}"

; ---------------------------------------------------------------------------
; Installer sections
; ---------------------------------------------------------------------------

Section "EdgePulse Agent" SecMain
    SectionIn RO  ; cannot be deselected

    ; ---- Check OS version ----
    ${IfNot} ${AtLeastWin10}
        MessageBox MB_OK|MB_ICONSTOP "EdgePulse Agent requires Windows 10 or later."
        Abort
    ${EndIf}

    ; ---- Stop existing service before overwriting files ----
    ExecWait 'sc stop "${SERVICE_NAME}"' $0
    Sleep 2000

    ; ---- Install files ----
    SetOutPath "$INSTDIR"
    File /r "${BUNDLE_DIR}\*.*"

    ; ---- Create data directories ----
    CreateDirectory "${DATA_DIR}"
    CreateDirectory "${DATA_DIR}\models"
    CreateDirectory "${DATA_DIR}\data"
    CreateDirectory "${DATA_DIR}\logs"

    ; ---- Write default config if not present ----
    ${IfNot} ${FileExists} "${DATA_DIR}\agent_config.json"
        FileOpen $0 "${DATA_DIR}\agent_config.json" w
        FileWrite $0 '{$\r$\n'
        FileWrite $0 '  "device_id": null,$\r$\n'
        FileWrite $0 '  "environment": "production",$\r$\n'
        FileWrite $0 '  "api": {$\r$\n'
        FileWrite $0 '    "enabled": true,$\r$\n'
        FileWrite $0 '    "mode": "auto",$\r$\n'
        FileWrite $0 '    "port": 8080,$\r$\n'
        FileWrite $0 '    "require_auth": false,$\r$\n'
        FileWrite $0 '    "socket_path": null,$\r$\n'
        FileWrite $0 '    "min_memory_mb": 512,$\r$\n'
        FileWrite $0 '    "min_cpu_cores": 2$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "sync": {$\r$\n'
        FileWrite $0 '    "supabase_url": "https://YOUR_PROJECT.supabase.co",$\r$\n'
        FileWrite $0 '    "supabase_key": "YOUR_SUPABASE_ANON_KEY",$\r$\n'
        FileWrite $0 '    "batch_size": 50,$\r$\n'
        FileWrite $0 '    "retry_max_attempts": 5,$\r$\n'
        FileWrite $0 '    "offline_queue_max": 10000,$\r$\n'
        FileWrite $0 '    "sync_interval": 300$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "collection": {$\r$\n'
        FileWrite $0 '    "interval": 60,$\r$\n'
        FileWrite $0 '    "window_1min": 60,$\r$\n'
        FileWrite $0 '    "window_5min": 300,$\r$\n'
        FileWrite $0 '    "window_15min": 900,$\r$\n'
        FileWrite $0 '    "enable_process_monitoring": true,$\r$\n'
        FileWrite $0 '    "enable_network_monitoring": true,$\r$\n'
        FileWrite $0 '    "max_processes": 100$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "features": {$\r$\n'
        FileWrite $0 '    "feature_dimension": 50,$\r$\n'
        FileWrite $0 '    "history_retention_hours": 24,$\r$\n'
        FileWrite $0 '    "enable_auto_scaling": true,$\r$\n'
        FileWrite $0 '    "normalize_features": true,$\r$\n'
        FileWrite $0 '    "feature_selection": false$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "detection": {$\r$\n'
        FileWrite $0 '    "threshold": 0.5,$\r$\n'
        FileWrite $0 '    "use_autoencoder": false,$\r$\n'
        FileWrite $0 '    "use_ensemble": true,$\r$\n'
        FileWrite $0 '    "isolation_forest_n_estimators": 100,$\r$\n'
        FileWrite $0 '    "isolation_forest_contamination": "auto",$\r$\n'
        FileWrite $0 '    "autoencoder_encoding_dim": 8,$\r$\n'
        FileWrite $0 '    "autoencoder_hidden_layers": [64, 32, 16],$\r$\n'
        FileWrite $0 '    "autoencoder_learning_rate": 0.001,$\r$\n'
        FileWrite $0 '    "autoencoder_input_dim": null,$\r$\n'
        FileWrite $0 '    "autoencoder_use_tflite": false$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "privacy": {$\r$\n'
        FileWrite $0 '    "data_retention_days": 30,$\r$\n'
        FileWrite $0 '    "anonymization_level": "basic",$\r$\n'
        FileWrite $0 '    "collect_command_lines": false,$\r$\n'
        FileWrite $0 '    "encrypt_storage": false,$\r$\n'
        FileWrite $0 '    "hash_sensitive_data": true$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "alerting": {$\r$\n'
        FileWrite $0 '    "enabled": true,$\r$\n'
        FileWrite $0 '    "correlation_window": 300,$\r$\n'
        FileWrite $0 '    "rate_limit": 5,$\r$\n'
        FileWrite $0 '    "rate_window": 3600,$\r$\n'
        FileWrite $0 '    "min_severity": "medium",$\r$\n'
        FileWrite $0 '    "enable_local_notifications": true$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "logging": {$\r$\n'
        FileWrite $0 '    "level": "INFO",$\r$\n'
        FileWrite $0 '    "format": "json",$\r$\n'
        FileWrite $0 '    "file_path": null,$\r$\n'
        FileWrite $0 '    "max_file_size_mb": 100,$\r$\n'
        FileWrite $0 '    "backup_count": 5,$\r$\n'
        FileWrite $0 '    "enable_console": true$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "metrics": {$\r$\n'
        FileWrite $0 '    "enabled": true,$\r$\n'
        FileWrite $0 '    "prometheus_enabled": false,$\r$\n'
        FileWrite $0 '    "prometheus_port": 9090,$\r$\n'
        FileWrite $0 '    "collection_interval": 30,$\r$\n'
        FileWrite $0 '    "retention_hours": 168$\r$\n'
        FileWrite $0 '  },$\r$\n'
        FileWrite $0 '  "enable_ml_features": true,$\r$\n'
        FileWrite $0 '  "max_memory_usage_mb": 1024,$\r$\n'
        FileWrite $0 '  "graceful_shutdown_timeout": 30,$\r$\n'
        FileWrite $0 '  "health_check_interval": 60$\r$\n'
        FileWrite $0 '}$\r$\n'
        FileClose $0
    ${EndIf}

    ; ---- Bootstrap the ML model if not already present ----
    ${IfNot} ${FileExists} "${DATA_DIR}\models\edgepulse_primary_isolation_forest.joblib"
        DetailPrint "Bootstrapping anomaly detection model (may take ~10 seconds)..."
        ExecWait '"$INSTDIR\${EXE_NAME}" bootstrap --output-dir "${DATA_DIR}\models"' $0
        ${If} $0 != 0
            DetailPrint "Model bootstrap returned $0 — agent will prompt on first run."
        ${EndIf}
    ${EndIf}

    ; ---- Register Windows Service ----
    DetailPrint "Registering Windows Service: ${SERVICE_DISPLAY}..."
    ExecWait '"$INSTDIR\${EXE_NAME}" service install' $0
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Service registration returned $0.$\r$\nYou can register it manually later with:$\r$\n  edge-agent service install"
    ${EndIf}

    ; ---- Start the service ----
    ExecWait 'sc start "${SERVICE_NAME}"' $0

    ; ---- Add to PATH ----
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${IfNot} "$0" contains "$INSTDIR"
        WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
            "Path" "$0;$INSTDIR"
        SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    ${EndIf}

    ; ---- Write uninstaller ----
    WriteUninstaller "$INSTDIR\uninstall.exe"

    ; ---- Write registry (Add/Remove Programs) ----
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName"     "${PRODUCT_NAME}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion"  "${PRODUCT_VERSION}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher"       "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout"    "${PRODUCT_URL}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify"      1
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair"      1

    ; ---- Estimate install size ----
    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"

    ; ---- Start Menu shortcut ----
    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortcut  "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" \
                    "$INSTDIR\${EXE_NAME}" "" \
                    "$INSTDIR\${EXE_NAME}" 0 SW_SHOWNORMAL
    CreateShortcut  "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall ${PRODUCT_NAME}.lnk" \
                    "$INSTDIR\uninstall.exe" "" \
                    "$INSTDIR\uninstall.exe" 0 SW_SHOWNORMAL

SectionEnd

; ---------------------------------------------------------------------------
; Uninstaller
; ---------------------------------------------------------------------------

Section "Uninstall"
    ; Stop and remove service
    ExecWait 'sc stop "${SERVICE_NAME}"' $0
    Sleep 2000
    ExecWait '"$INSTDIR\${EXE_NAME}" service uninstall' $0
    ExecWait 'sc delete "${SERVICE_NAME}"' $0

    ; Remove files
    RMDir /r "$INSTDIR"

    ; Remove Start Menu shortcuts
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

    ; Remove from PATH
    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${WordReplace} "$0" ";$INSTDIR" "" "+*" $1
    ${WordReplace} "$1" "$INSTDIR;" "" "+*" $2
    WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
        "Path" "$2"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

    ; Remove registry keys
    DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
    DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"

    ; NOTE: ProgramData is intentionally NOT deleted to preserve logs/config
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Do you also want to remove all EdgePulse data (logs, config, models)?$\r$\n$\r$\nChoose No to keep your configuration and logs." \
        IDNO skip_data_removal
        RMDir /r "${DATA_DIR}"
    skip_data_removal:

SectionEnd

; ---------------------------------------------------------------------------
; Functions
; ---------------------------------------------------------------------------

Function .onInit
    ; Check for 64-bit OS
    ${IfNot} ${RunningX64}
        MessageBox MB_OK|MB_ICONSTOP "EdgePulse Agent requires a 64-bit version of Windows."
        Abort
    ${EndIf}

    ; Check for already installed instance
    ReadRegStr $0 HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion"
    ${If} $0 != ""
        MessageBox MB_YESNO|MB_ICONQUESTION \
            "EdgePulse Agent ${PRODUCT_VERSION} is about to be installed.$\r$\n$\r$\nVersion $0 is already installed. Do you want to upgrade?" \
            IDYES continue_install
        Abort
        continue_install:
    ${EndIf}
FunctionEnd

Function un.onInit
    MessageBox MB_ICONQUESTION|MB_YESNO|MB_DEFBUTTON2 \
        "Are you sure you want to completely remove ${PRODUCT_NAME}?" \
        IDYES +2
    Abort
FunctionEnd