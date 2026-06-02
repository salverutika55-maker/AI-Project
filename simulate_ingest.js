const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CRYPTO_KEY = "testkeytestkeytestkeytestkeytest"; // 32 chars
const crypto = require('crypto');

const IV_LENGTH = 16;
function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(CRYPTO_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

async function testIngest() {
  const client = await prisma.client.findFirst({
    include: { pnlMappings: true }
  });
  
  if (!client) {
    console.log("No client found");
    return;
  }

  const period = "2026-04";
  const [yearStr, monthStr] = period.split("-");
  const dateObj = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
  const mShort = dateObj.toLocaleString('default', { month: 'short' }); 
  
  const monthNum = parseInt(monthStr);
  const syncYearToSave = monthNum < 4 ? parseInt(yearStr) - 1 : parseInt(yearStr);
  
  const headBalances = {};
  const accounts = { "Sales Accounts": 1000, "Rent Expenses": 500 };
  
  for (const m of client.pnlMappings) {
    const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
    let balance = 0;
    
    for (const alias of aliases) {
      const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
      if (exactMatchKey) {
        balance += accounts[exactMatchKey];
      } else {
        const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
        if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
      }
    }

    if (balance !== 0) {
      headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
    }
  }

  const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
    clientId: client.id,
    headName,
    month: mShort,
    year: syncYearToSave,
    amount: encrypt(balance.toString())
  }));

  if (finalEntries.length > 0) {
    console.log("Creating:", finalEntries);
    await prisma.pNLValue.deleteMany({
      where: { clientId: client.id, month: mShort, year: syncYearToSave }
    });
    await prisma.pNLValue.createMany({ data: finalEntries });
    console.log("Success");
  } else {
    console.log("No final entries");
  }
}

testIngest().catch(console.error).finally(() => prisma.$disconnect());
