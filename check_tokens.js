const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();
require('dotenv').config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(text) {
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return text;
  }
}

async function check() {
  const c = await prisma.client.findFirst({where: {id: 'cmofxajoa0002l504dapzj3jh'}});
  const decrypted = decrypt(c.oauthToken);
  console.log("Decrypted Token:", decrypted);
}
check().catch(console.error).finally(() => prisma.$disconnect());
