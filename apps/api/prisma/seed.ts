import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaClient, GlobalRole, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Permission, SYSTEM_ROLES } from '@repo/shared';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedSystemRoles() {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { permissions: [...role.permissions] as Prisma.InputJsonValue },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions] as Prisma.InputJsonValue,
        isSystem: true,
      },
    });
  }
  console.log(`Seeded ${SYSTEM_ROLES.length} system roles`);
}

async function main() {
  await seedSystemRoles();

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@nexttrack.local';
  const adminPassword =
    process.env.ADMIN_PASSWORD ?? crypto.randomBytes(16).toString('hex');

  const existingAdmin = await prisma.user.findFirst({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Admin',
        passwordHash,
        hasPassword: true,
        role: GlobalRole.ADMIN,
      },
    });
    console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
    console.log(
      'IMPORTANT: Save this password now! Set ADMIN_PASSWORD env var to use a specific password.',
    );
  } else {
    console.log('Admin user already exists');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
