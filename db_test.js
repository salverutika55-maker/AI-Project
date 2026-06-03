const { PrismaClient } = require('@prisma/client');
const { decrypt } = require('./src/lib/encryption.ts'); // Wait, I can't require TS directly like this.

// I will just copy the decrypt function into the script.
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_secret_key_32_chars_long_!!'; // Must be 32 chars

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
  if (clients.length === 0) return console.log("No clients found");
  
  const activeClient = clients.find(c => c.name.includes("SSA TAX")) || clients[0];
  console.log("Active Client ID:", activeClient.id);
  
  const pnlValues = await prisma.pNLValue.findMany({
    where: { clientId: activeClient.id }
  });
  
  console.log("PNL Values count:", pnlValues.length);
  
  for (const p of pnlValues) {
    if (p.year === 2024 && (p.month === 'Apr' || p.month === 'May' || p.month === 'Jun')) {
      const val = decryptText(p.amount);
      console.log(`${p.year}-${p.month} | ${p.headName}: ${val}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
