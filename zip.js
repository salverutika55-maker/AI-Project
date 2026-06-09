const fs = require('fs');
const archiver = require('archiver');
archiver.registerFormat('zip-encrypted', require('archiver-zip-encrypted'));

const output = fs.createWriteStream('public/downloads/FinAnalyzerSync_Portable.zip');
const archive = archiver('zip-encrypted', {
  zlib: { level: 9 },
  encryptionMethod: 'zip20',
  password: 'tally'
});

output.on('close', function() {
  console.log(archive.pointer() + ' total bytes');
  console.log('archiver has been finalized and the output file descriptor has closed.');
});

archive.on('error', function(err) {
  throw err;
});

archive.pipe(output);
archive.file('scripts/desktop_agent/FinAnalyzerSync.exe', { name: 'FinAnalyzerSync.exe' });
archive.finalize();
