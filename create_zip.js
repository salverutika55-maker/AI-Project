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

// Add the Start_Connector.bat
archive.file('scripts/desktop_agent/Start_Connector.bat', { name: 'Start_Connector.bat' });

// Add the Reset_Connector.bat
archive.file('scripts/desktop_agent/Reset_Connector.bat', { name: 'Reset_Connector.bat' });

// Add the official node.exe
archive.file('scripts/desktop_agent/FinAnalyzer_Connector/node.exe', { name: 'node.exe' });

// Add the raw javascript file
archive.file('scripts/desktop_agent/index.js', { name: 'agent.js' });

archive.finalize();
