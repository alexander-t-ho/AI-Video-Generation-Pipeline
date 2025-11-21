#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('=== Checking Users in Database ===\n');

    // Fetch all users with their companies
    const users = await prisma.user.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        email: 'asc',
      },
    });

    if (users.length === 0) {
      console.log('No users found in database.');
      return;
    }

    console.log(`Found ${users.length} user(s):\n`);

    for (const user of users) {
      console.log(`Email: ${user.email}`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Role: ${user.role}`);
      console.log(`  Company: ${user.company.name} (${user.company.id})`);
      console.log(`  Created: ${user.createdAt.toISOString()}`);
      console.log('');
    }

    // Check specifically for Porsche company users
    const porscheUsers = users.filter(u => u.company.name === 'Porsche');

    if (porscheUsers.length === 0) {
      console.log('⚠️  No users found for Porsche company!');
      console.log('\nTo access the Porsche 911 data on the brand identity page, you need a user account');
      console.log('associated with the Porsche company (00595f90-8957-4367-9861-05e5758e98d6).');
    } else {
      console.log(`✓ Found ${porscheUsers.length} Porsche company user(s)`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
