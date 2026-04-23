const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.update({
  where: { email: 'salverutika55@gmail.com' },
  data: { role: 'ADMIN' }
}).then(u => {
  console.log('Updated user:', u.email, 'to', u.role);
}).catch(console.error).finally(() => prisma.$disconnect());
