const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error('ENCRYPTION_KEY environment variable is required');
}

function decryptText(text) {
  if (!text) return text;
  try {
    const parts = text.split(':');
    if (parts.length === 3) {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encryptedText = parts[2];
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    return text;
  } catch (error) {
    return text;
  }
}

const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany();
  const activeClient = clients.find(c => c.name.includes("SSA TAX")) || clients[0];
  
  const pnlValues = await prisma.pNLValue.findMany({
    where: { clientId: activeClient.id }
  });

  const monthMap = new Map();
  const monthsOrder = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

  for (const p of pnlValues) {
    const calYear = ['Jan', 'Feb', 'Mar'].includes(p.month) ? p.year + 1 : p.year;
    const mm = monthsOrder[p.month];
    const periodKey = `${calYear}-${mm}`;

    if (!monthMap.has(periodKey)) {
      monthMap.set(periodKey, { period: periodKey, revenue: 0 });
    }
    const rec = monthMap.get(periodKey);
    const val = parseFloat(decryptText(p.amount)) || 0;
    const lowerName = p.headName.toLowerCase();
    if (["sales", "income", "revenue"].some(kw => lowerName.includes(kw))) rec.revenue += val;
  }

  const records = Array.from(monthMap.values()).sort((a, b) => a.period.localeCompare(b.period));
  for (const r of records) {
    console.log(`${r.period}: ${r.revenue}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
