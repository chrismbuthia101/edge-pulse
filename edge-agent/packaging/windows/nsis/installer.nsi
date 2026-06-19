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
!define SERVICE_NAME        "EdgePulseAgent"
!define SERVICE_DISPLAY     "EdgePulse Monitoring Agent"
!define EXE_NAME            "edge-agent.exe"

!define DIST_DIR            "..\..\..\packaging\dist"
OutFile "${DIST_DIR}\EdgePulse-Agent-Setup-${PRODUCT_VERSION}.exe"

!define BUNDLE_DIR          "..\..\..\dist\edgepulse"

Name                "${PRODUCT_NAME} ${PRODUCT_VERSION}"
InstallDir          "${INSTALL_DIR}"
InstallDirRegKey    HKLM "${PRODUCT_DIR_REGKEY}" ""
RequestExecutionLevel admin
ShowInstDetails     show
ShowUnInstDetails   show
SetCompressor       /SOLID lzma

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

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${PRODUCT_VERSION}.0"
VIAddVersionKey "ProductName"     "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion"  "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName"     "${PRODUCT_PUBLISHER}"
VIAddVersionKey "LegalCopyright"  "(C) ${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} Installer"
VIAddVersionKey "FileVersion"     "${PRODUCT_VERSION}"

Section "EdgePulse Agent" SecMain
    SectionIn RO

    ${IfNot} ${AtLeastWin10}
        MessageBox MB_OK|MB_ICONSTOP "EdgePulse Agent requires Windows 10 or later."
        Abort
    ${EndIf}

    ExecWait 'sc stop "${SERVICE_NAME}"' $0
    Sleep 2000

    ReadEnvStr $R0 "ALLUSERSPROFILE"
    StrCpy $R0 "$R0\EdgePulse"

    SetOutPath "$INSTDIR"
    File /r "${BUNDLE_DIR}\*.*"

    CreateDirectory "$R0"
    CreateDirectory "$R0\models"
    CreateDirectory "$R0\data"
    CreateDirectory "$R0\logs"

    ${IfNot} ${FileExists} "$R0\agent_config.json"
        ${If} ${FileExists} "$INSTDIR\agent_config.json"
            CopyFiles /SILENT "$INSTDIR\agent_config.json" "$R0\agent_config.json"
        ${EndIf}
    ${EndIf}

    DetailPrint "Registering Windows Service: ${SERVICE_DISPLAY}..."
    ExecWait '"$INSTDIR\${EXE_NAME}" service install' $0
    ${If} $0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Service registration returned $0.$\r$\nYou can register it manually later with:$\r$\n  edge-agent service install"
    ${EndIf}

    ExecWait 'sc start "${SERVICE_NAME}"' $0

    ReadRegStr $1 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${StrStr} $2 $1 $INSTDIR
    ${If} $2 == ""
        WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
            "Path" "$1;$INSTDIR"
        SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    ${EndIf}

    WriteUninstaller "$INSTDIR\uninstall.exe"

    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayName"     "${PRODUCT_NAME}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "DisplayVersion"  "${PRODUCT_VERSION}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "Publisher"       "${PRODUCT_PUBLISHER}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "URLInfoAbout"    "${PRODUCT_URL}"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKLM "${PRODUCT_UNINST_KEY}" "UninstallString" "$INSTDIR\uninstall.exe"
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoModify"      1
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "NoRepair"      1

    ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
    IntFmt $0 "0x%08X" $0
    WriteRegDWORD HKLM "${PRODUCT_UNINST_KEY}" "EstimatedSize" "$0"

    CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
    CreateShortcut  "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" \
                    "$INSTDIR\${EXE_NAME}" "" \
                    "$INSTDIR\${EXE_NAME}" 0 SW_SHOWNORMAL
    CreateShortcut  "$SMPROGRAMS\${PRODUCT_NAME}\Uninstall ${PRODUCT_NAME}.lnk" \
                    "$INSTDIR\uninstall.exe" "" \
                    "$INSTDIR\uninstall.exe" 0 SW_SHOWNORMAL
SectionEnd

Section "Uninstall"
    ExecWait 'sc stop "${SERVICE_NAME}"' $0
    Sleep 2000
    ExecWait '"$INSTDIR\${EXE_NAME}" service uninstall' $0
    ExecWait 'sc delete "${SERVICE_NAME}"' $0

    RMDir /r "$INSTDIR"
    RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"

    ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" "Path"
    ${WordReplace} "$0" ";$INSTDIR" "" "+*" $1
    ${WordReplace} "$1" "$INSTDIR;" "" "+*" $2
    WriteRegExpandStr HKLM "SYSTEM\CurrentControlSet\Control\Session Manager\Environment" \
        "Path" "$2"
    SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000

    DeleteRegKey HKLM "${PRODUCT_UNINST_KEY}"
    DeleteRegKey HKLM "${PRODUCT_DIR_REGKEY}"

    ReadEnvStr $R0 "ALLUSERSPROFILE"
    StrCpy $R0 "$R0\EdgePulse"
    MessageBox MB_YESNO|MB_ICONQUESTION \
        "Do you also want to remove all EdgePulse data (logs, config, models)?$\r$\n$\r$\nChoose No to keep your configuration and logs." \
        IDNO skip_data_removal
        RMDir /r "$R0"
    skip_data_removal:
SectionEnd

Function .onInit
    ${IfNot} ${RunningX64}
        MessageBox MB_OK|MB_ICONSTOP "EdgePulse Agent requires a 64-bit version of Windows."
        Abort
    ${EndIf}

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
