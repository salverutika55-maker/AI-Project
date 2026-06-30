const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

// Copy of encrypt function from src/lib/encryption.ts
const IV_LENGTH = 12;
function getEncryptionKey() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required and must be 32 characters');
  }
  return Buffer.from(encryptionKey);
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { pnlMappings: true }
  });
  
  if (!client) {
    console.error("Client not found!");
    return;
  }
  
  // Group all vouchers by year and month
  const vouchersFromDb = await prisma.normalizedVoucher.findMany({
    where: { clientId },
    include: {
      lines: {
        include: {
          ledger: true
        }
      }
    }
  });

  const vouchersByMonth = {};
  for (const v of vouchersFromDb) {
    const d = new Date(v.date);
    const mShort = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    const syncYearToSave = d.getMonth() < 3 ? year - 1 : year;
    const periodKey = `${syncYearToSave}-${mShort}`;
    
    if (!vouchersByMonth[periodKey]) {
      vouchersByMonth[periodKey] = [];
    }
    vouchersByMonth[periodKey].push(v);
  }

  console.log("Analyzing all months...");
  for (const [periodKey, vouchers] of Object.entries(vouchersByMonth)) {
    const monthBalances = {};
    for (const v of vouchers) {
      for (const line of v.lines) {
        if (!line.ledgerName) continue;
        const ledgerNameLower = line.ledgerName.trim().toLowerCase();
        const amt = line.isDebit ? -line.amount : line.amount;
        monthBalances[ledgerNameLower] = (monthBalances[ledgerNameLower] || 0) + amt;
      }
    }

    const headBalances = {};
    for (const m of client.pnlMappings) {
      const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
      let balance = 0;
      
      for (const alias of aliases) {
        const exactMatchKey = Object.keys(monthBalances).find(k => k === alias);
        if (exactMatchKey) {
          balance += monthBalances[exactMatchKey];
        }
      }

      if (balance !== 0) {
        headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + balance;
      }
    }

    const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
      clientId: client.id,
      headName,
      amount: Math.abs(balance)
    }));

    console.log(`  - Period ${periodKey}: Vouchers=${vouchers.length}, PNL Entries to save=${finalEntries.length}`);
  }
}

// Load env variables from root .env file
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
run().catch(console.error).finally(() => prisma.$disconnect());
