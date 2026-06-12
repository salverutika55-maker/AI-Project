@echo off
echo Resetting FinAnalyzer Connector configuration...
del /F /Q "%APPDATA%\FinAnalyzer\config.json"
del /F /Q "%APPDATA%\FinAnalyzer\credentials.json"
echo Config deleted. You can now pair a new client.
pause
