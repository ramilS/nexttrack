import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../.env') });

import { PrismaClient, GlobalRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { ALL_PERMISSIONS, Permission } from '@repo/shared';

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SYSTEM_ROLES = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Project Admin',
    description: 'Full access to all project features and settings',
    permissions: ALL_PERMISSIONS,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Developer',
    description: 'Full issue management, comments, articles, tags, boards, and time tracking',
    permissions: [
      Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE,
      Permission.ISSUE_DELETE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE,
      Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE,
      Permission.TAG_MANAGE, Permission.BOARD_MANAGE,
      Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'QA',
    description: 'Same as Developer plus can delete issues',
    permissions: [
      Permission.ISSUE_READ, Permission.ISSUE_CREATE, Permission.ISSUE_UPDATE,
      Permission.ISSUE_DELETE, Permission.ISSUE_MOVE, Permission.ISSUE_LINK_MANAGE,
      Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ, Permission.ARTICLE_CREATE, Permission.ARTICLE_UPDATE,
      Permission.SPRINT_MANAGE, Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Reporter',
    description: 'Can create issues and comments, read articles, and log own time',
    permissions: [
      Permission.ISSUE_READ, Permission.ISSUE_CREATE,
      Permission.COMMENT_CREATE, Permission.COMMENT_EDIT_OWN,
      Permission.ARTICLE_READ, Permission.TIME_LOG_OWN,
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Observer',
    description: 'Read-only access to issues and articles',
    permissions: [Permission.ISSUE_READ, Permission.ARTICLE_READ],
  },
];

async function seedSystemRoles() {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: { permissions: role.permissions as any },
      create: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions: role.permissions as any,
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
