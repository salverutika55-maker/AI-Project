const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/clients/REDACTED_TEST_BEARER/balance-sheet?t=' + Date.now(),
  method: 'GET',
};

const req = http.request(options, res => {
  let data = '';
  res.on('data', d => { data += d; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log("Structure Assets keys:", Object.keys(json.structure["Assets"] || {}));
    } catch(e) {
      console.log("Response:", data.substring(0, 500));
    }
  });
});

req.on('error', error => {
  console.error(error);
});

req.end();
