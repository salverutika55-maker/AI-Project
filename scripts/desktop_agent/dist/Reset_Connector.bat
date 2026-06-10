@echo off
color 0C
title FinAnalyzer - Factory Reset
echo =======================================================
echo    FinAnalyzer Tally Sync - FACTORY RESET
echo =======================================================
echo.
echo WARNING: This will permanently delete all saved pairing
echo configurations from this PC.
echo.
echo You will need to enter a new 6-digit handshake code 
echo the next time you run the Connector.
echo.
pause
echo.
echo Deleting configuration files...
IF EXIST "%APPDATA%\FinAnalyzer\config.json" (
    del /F /Q "%APPDATA%\FinAnalyzer\config.json"
    echo Successfully deleted config.json
) ELSE (
    echo Config file already deleted or does not exist.
)
echo.
echo Factory Reset Complete! You can now close this window.
pause
