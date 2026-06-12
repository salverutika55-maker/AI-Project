@echo off
echo Resetting FinAnalyzer Connector configuration...
"%~dp0node.exe" "%~dp0index.js" --reset
pause
