#!/usr/bin/env tsx

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('=== Verifying Car Data in Database ===\n');

    // Fetch all car models with variants and media
    const carModels = await prisma.carModel.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
          },
        },
        variants: {
          include: {
            media: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (carModels.length === 0) {
      console.log('No car models found in database.');
      return;
    }

    console.log(`Found ${carModels.length} car model(s):\n`);

    for (const model of carModels) {
      console.log(`Model: ${model.name}`);
      console.log(`  Company: ${model.company.name} (${model.company.id})`);
      console.log(`  Created: ${model.createdAt.toISOString()}`);
      console.log(`  Variants: ${model.variants.length}`);

      for (const variant of model.variants) {
        console.log(`\n  Variant: ${variant.year} ${variant.trim}`);
        console.log(`    ID: ${variant.id}`);
        console.log(`    Media files: ${variant.media.length}`);

        for (const media of variant.media) {
          console.log(`      - ${media.type}: ${media.filename} (${media.s3Key})`);
        }
      }

      console.log('\n---\n');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
