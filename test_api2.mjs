import http from 'http';

http.get('http://localhost:3000/api/clients/cm0j91j5q0000a6o8h1n3w719/balance-sheet?year=2026&fyType=APR_MAR', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    const json = JSON.parse(data);
    const nodes = json.dataNodes || [];
    console.log(`Total nodes: ${nodes.length}`);
    const assets = nodes.filter(n => n.mainGroup === 'Assets');
    console.log(`Assets nodes: ${assets.length}`);
    
    // Check sums for April 2026
    const aprAssets = assets.filter(n => n.period === 'Apr');
    let sum = 0;
    aprAssets.forEach(n => sum += n.amount);
    console.log(`Sum of Assets for Apr: ${sum}`);
    
    // Which subGroups have non-zero amounts in Apr?
    const groups = {};
    aprAssets.forEach(n => {
        if (n.amount !== 0) {
            groups[n.subGroupName] = (groups[n.subGroupName] || 0) + n.amount;
        }
    });
    console.log("SubGroups with non-zero amounts in Apr:");
    console.log(groups);
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
