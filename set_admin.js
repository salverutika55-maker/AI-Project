const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'salverutika55@gmail.com';
  try {
    const updatedUser = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN' },
    });
    console.log('Successfully updated user to ADMIN:', updatedUser.email);
  } catch (error) {
    console.error('Error updating user:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
