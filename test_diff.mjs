import { PrismaClient } from '@prisma/client';
import http from 'http';

async function run() {
  const res = await fetch('http://localhost:3000/api/clients/cmq6n9c6b0001l304y8ya0py5/balance-sheet?year=2025');
  const data = await res.json();
  
  const getMainTotal = (main, month) => {
    const nodes = data.dataNodes.filter(n => n.mainGroup === main && n.period === month);
    return nodes.reduce((sum, n) => sum + n.amount, 0);
  };
  
  const months = ["Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
  console.log("Reconciliation Test:");
  months.forEach(m => {
      const assets = getMainTotal("Assets", m);
      const liabs = getMainTotal("Liabilities", m);
      const diff = Math.abs(assets - liabs);
      console.log(`${m}: Assets=${assets}, Liabs+Eq=${liabs}, Diff=${diff}`);
  });
}

run();
