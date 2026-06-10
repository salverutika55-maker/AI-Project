const fs = require('fs');
const archiver = require('archiver');

const output = fs.createWriteStream('public/downloads/FinAnalyzer_Connector_v2.zip');
const archive = archiver('zip', {
  zlib: { level: 9 }
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);

// Add the newly built .exe
archive.file('scripts/desktop_agent/FinAnalyzerSync.exe', { name: 'FinAnalyzerSync.exe' });

// Add the Start_Connector.bat
archive.file('scripts/desktop_agent/Start_Connector.bat', { name: 'Start_Connector.bat' });

// Create a Reset_Connector.bat
const resetBatContent = `
@echo off
echo Resetting FinAnalyzer Connector configuration...
del /F /Q FinAnalyzer_Connector\\config.json
echo Config deleted. You can now pair a new client.
pause
`;
archive.append(resetBatContent, { name: 'Reset_Connector.bat' });

archive.finalize();
