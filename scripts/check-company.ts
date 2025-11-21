#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  try {
    // Check if companies exist
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
      },
      take: 5,
    });

    if (companies.length === 0) {
      console.log('No companies found in database.');
      console.log('Creating a default company...');

      const company = await prisma.company.create({
        data: {
          name: 'Default Company',
        },
      });

      console.log(`Created company: ${company.name} (${company.id})`);
      console.log(`\nUse this company ID for upload: ${company.id}`);
    } else {
      console.log('Found companies:');
      companies.forEach(company => {
        console.log(`  - ${company.name} (${company.id})`);
      });
      console.log(`\nUse the first company ID for upload: ${companies[0].id}`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
