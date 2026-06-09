@echo off
title FinAnalyzer Tally Connector
cd /d "%~dp0"

IF NOT EXIST "node.exe" (
    color 0C
    echo =================================================================
    echo ERROR: Missing node.exe! 
    echo.
    echo It looks like you are running this file directly from inside the ZIP file.
    echo Windows does not extract the other required files when you do this.
    echo.
    echo PLEASE CLOSE THIS WINDOW, RIGHT-CLICK THE ZIP FILE, AND SELECT "EXTRACT ALL...".
    echo Then run the .bat file from the extracted folder!
    echo =================================================================
    pause
    exit /b
)

node.exe index.js
pause
