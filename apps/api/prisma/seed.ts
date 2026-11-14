import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/luxtax?schema=public';

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
  });
}

async function seedUser(params: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isEmailVerified?: boolean;
}) {
  const normalizedEmail = params.email.trim().toLowerCase();
  const passwordHash = await hashPassword(params.password);

  const user = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: {
      passwordHash,
      isEmailVerified: params.isEmailVerified ?? true,
      isActive: true,
      emailVerificationTokenHash: null,
      emailVerificationExpiresAt: null,
    },
    create: {
      email: normalizedEmail,
      passwordHash,
      isEmailVerified: params.isEmailVerified ?? true,
      isActive: true,
      profile: {
        create: {
          firstName: params.firstName,
          lastName: params.lastName,
          taxResidence: 'RESIDENT',
        },
      },
    },
    include: {
      profile: true,
    },
  });

  // Ensure profile exists if user was updated
  if (!user.profile) {
    await prisma.personProfile.create({
      data: {
        userId: user.id,
        firstName: params.firstName,
        lastName: params.lastName,
        taxResidence: 'RESIDENT',
      },
    });
  }

  return user;
}

async function ensureHouseholdAndWorkspace(userId: string, householdName: string, slug: string) {
  let household = await prisma.household.findUnique({
    where: { slug },
  });

  if (!household) {
    household = await prisma.household.create({
      data: {
        name: householdName,
        slug,
        createdById: userId,
        members: {
          create: {
            userId,
            role: 'PRIMARY_FILER',
            status: 'ACTIVE',
          },
        },
      },
    });
  } else {
    // Ensure membership
    const membership = await prisma.householdMembership.findFirst({
      where: { householdId: household.id, userId },
    });
    if (!membership) {
      await prisma.householdMembership.create({
        data: {
          householdId: household.id,
          userId,
          role: 'PRIMARY_FILER',
          status: 'ACTIVE',
        },
      });
    }
  }

  // Ensure 2025 workspace
  let workspace = await prisma.taxYearWorkspace.findFirst({
    where: {
      householdId: household.id,
      taxYear: 2025,
    },
  });

  if (!workspace) {
    workspace = await prisma.taxYearWorkspace.create({
      data: {
        householdId: household.id,
        taxYear: 2025,
        taxClass: 'CLASS_1',
        status: 'DRAFT',
      },
    });
  }

  return { household, workspace };
}

async function main() {
  console.log(`\n🌱 Seeding database at: ${connectionString.replace(/:[^:@]+@/, ':****@')}`);

  // 1. Platform Administrator
  // Default allowlisted in test/dev: operator@luxtax.example
  const adminOperator = await seedUser({
    email: 'operator@luxtax.example',
    password: 'AdminPassword123!',
    firstName: 'Platform',
    lastName: 'Operator',
    isEmailVerified: true,
  });
  await ensureHouseholdAndWorkspace(adminOperator.id, 'Operator Household', 'operator-household');

  // Alternative standard admin email
  const adminLu = await seedUser({
    email: 'admin@luxtax.lu',
    password: 'AdminPassword123!',
    firstName: 'System',
    lastName: 'Admin',
    isEmailVerified: true,
  });
  await ensureHouseholdAndWorkspace(adminLu.id, 'Admin Household', 'admin-household');

  // 2. Standard Taxpayer
  const taxpayer = await seedUser({
    email: 'user@luxtax.lu',
    password: 'Password123!',
    firstName: 'Jean',
    lastName: 'Dupont',
    isEmailVerified: true,
  });
  await ensureHouseholdAndWorkspace(taxpayer.id, 'Dupont Household', 'dupont-household');

  // 3. Demo Account (if existing in database)
  const demoUser = await prisma.user.findUnique({
    where: { email: 'camille.site.20261110a@example.lu' },
  });
  if (demoUser) {
    const passwordHash = await hashPassword('Password123!');
    await prisma.user.update({
      where: { id: demoUser.id },
      data: {
        passwordHash,
        isEmailVerified: true,
        isActive: true,
      },
    });
    console.log('   ✓ Updated existing demo user: camille.site.20261110a@example.lu');
  }

  console.log('\n======================================================');
  console.log('  Lux-Tax Default Seed Credentials');
  console.log('======================================================');
  console.log('  1. Platform Administrator (Allowlisted in Dev):');
  console.log('     Email:    operator@luxtax.example');
  console.log('     Password: AdminPassword123!');
  console.log('     Role:     Platform Administrator & Primary Filer');
  console.log('------------------------------------------------------');
  console.log('  2. System Administrator:');
  console.log('     Email:    admin@luxtax.lu');
  console.log('     Password: AdminPassword123!');
  console.log('     Role:     Administrator (requires ADMIN_EMAILS allowlist)');
  console.log('------------------------------------------------------');
  console.log('  3. Standard Taxpayer:');
  console.log('     Email:    user@luxtax.lu');
  console.log('     Password: Password123!');
  console.log('     Role:     Primary Filer (Tax Year 2025)');
  if (demoUser) {
    console.log('------------------------------------------------------');
    console.log('  4. E2E Demo Taxpayer (with preloaded salary & facts):');
    console.log('     Email:    camille.site.20261110a@example.lu');
    console.log('     Password: Password123!');
  }
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
