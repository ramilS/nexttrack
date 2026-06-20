/**
 * Test data constants matching seed-dev.ts output.
 * Source: apps/api/prisma/seed-dev.ts
 */

export const ADMIN_USER = {
  email: 'admin@nexttrack.local',
  password: 'Password123!',
  name: 'Alex Morgan',
} as const;

export const TEAM_MEMBER = {
  email: 'jordan.rivera@company.dev',
  password: 'Password123!',
  name: 'Jordan Rivera',
} as const;

/** All seeded team members (non-admin). All share Password123! */
export const TEAM_MEMBERS = {
  JORDAN: { email: 'jordan.rivera@company.dev', password: 'Password123!', name: 'Jordan Rivera' },
  SAM: { email: 'sam.chen@company.dev', password: 'Password123!', name: 'Sam Chen' },
  TAYLOR: { email: 'taylor.brooks@company.dev', password: 'Password123!', name: 'Taylor Brooks' },
  CASEY: { email: 'casey.williams@company.dev', password: 'Password123!', name: 'Casey Williams' },
  MORGAN: { email: 'morgan.lee@company.dev', password: 'Password123!', name: 'Morgan Lee' },
  RILEY: { email: 'riley.patel@company.dev', password: 'Password123!', name: 'Riley Patel' },
  QUINN: { email: 'quinn.johnson@company.dev', password: 'Password123!', name: 'Quinn Johnson' },
  AVERY: { email: 'avery.kim@company.dev', password: 'Password123!', name: 'Avery Kim' },
  DREW: { email: 'drew.martinez@company.dev', password: 'Password123!', name: 'Drew Martinez' },
  JAMIE: { email: 'jamie.thompson@company.dev', password: 'Password123!', name: 'Jamie Thompson' },
  BLAKE: { email: 'blake.turner@company.dev', password: 'Password123!', name: 'Blake Turner' },
} as const;

/** First 3 projects created by seed (COUNTS.projects = 3) */
export const PROJECTS = {
  PLAT: { key: 'PLAT', name: 'Platform Core' },
  WEB: { key: 'WEB', name: 'Web Application' },
  MOB: { key: 'MOB', name: 'Mobile App' },
} as const;

/** Some known issue titles from seed ISSUE_TEMPLATES */
export const KNOWN_ISSUES = [
  'Implement user avatar upload with crop functionality',
  'Fix login redirect loop when session expires',
  'Add keyboard shortcuts for common actions',
  'Database query optimization for project listing',
] as const;

/** Auth storage state path */
export const AUTH_FILE = 'fixtures/.auth/user.json';

/** Default password for all seeded users */
export const DEFAULT_PASSWORD = 'Password123!';
