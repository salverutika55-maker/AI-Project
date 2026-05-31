[Setup]
; App Information
AppName=FinAnalyzer Tally Connector
AppVersion=1.1.0
AppPublisher=FinAnalyzer Technologies
AppPublisherURL=https://finanalyzer.com
AppSupportURL=https://finanalyzer.com/support
AppUpdatesURL=https://finanalyzer.com/downloads

; Output configuration
DefaultDirName={autopf}\FinAnalyzer Connector
DefaultGroupName=FinAnalyzer Connector
AllowNoIcons=yes
OutputDir=.\dist
OutputBaseFilename=FinAnalyzer_Connector_Setup
Compression=lzma2/ultra
SolidCompression=yes
SetupIconFile=compiler:SetupClassicIcon.ico

; Security and privileges
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "FinAnalyzerSync.exe"; DestDir: "{app}"; Flags: ignoreversion
; NOTE: Don't use "Flags: ignoreversion" on any shared system files

[Icons]
Name: "{group}\FinAnalyzer Connector"; Filename: "{app}\FinAnalyzerSync.exe"
Name: "{group}\{cm:UninstallProgram,FinAnalyzer Connector}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\FinAnalyzer Connector"; Filename: "{app}\FinAnalyzerSync.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\FinAnalyzerSync.exe"; Description: "{cm:LaunchProgram,FinAnalyzer Connector}"; Flags: nowait postinstall skipifsilent
