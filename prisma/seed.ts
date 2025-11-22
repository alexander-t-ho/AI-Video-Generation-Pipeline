import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create a demo company
  const demoCompany = await prisma.company.upsert({
    where: { id: 'demo-company-id' },
    update: {},
    create: {
      id: 'demo-company-id',
      name: 'Demo Auto Company',
    },
  });

  console.log('Created demo company:', demoCompany.name);

  // Create an admin user
  const hashedPassword = await bcrypt.hash('password123', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@demo.com' },
    update: {},
    create: {
      email: 'admin@demo.com',
      name: 'Admin User',
      password: hashedPassword,
      role: 'ADMIN',
      companyId: demoCompany.id,
    },
  });

  console.log('Created admin user:', adminUser.email);

  // Create a member user
  const memberUser = await prisma.user.upsert({
    where: { email: 'member@demo.com' },
    update: {},
    create: {
      email: 'member@demo.com',
      name: 'Member User',
      password: hashedPassword,
      role: 'MEMBER',
      companyId: demoCompany.id,
    },
  });

  console.log('Created member user:', memberUser.email);

  // Create a test admin user
  const testAdminUser = await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {
      password: hashedPassword,
    },
    create: {
      email: 'admin@test.com',
      name: 'Test Admin',
      password: hashedPassword,
      role: 'ADMIN',
      companyId: demoCompany.id,
    },
  });

  console.log('Created test admin user:', testAdminUser.email);

  // Create some company assets
  const colorScheme = await prisma.companyAsset.create({
    data: {
      companyId: demoCompany.id,
      type: 'COLOR_SCHEME',
      value: {
        primary: '#2563eb',
        secondary: '#1e40af',
        accent: '#3b82f6',
        text: '#ffffff',
        background: '#1f2937',
      },
    },
  });

  console.log('Created color scheme asset');

  // Create a car model
  const carModel = await prisma.carModel.create({
    data: {
      companyId: demoCompany.id,
      name: 'Mustang',
      variants: {
        create: [
          {
            year: 2024,
            trim: 'GT',
          },
          {
            year: 2024,
            trim: 'EcoBoost',
          },
          {
            year: 2023,
            trim: 'Mach-E',
          },
        ],
      },
    },
    include: {
      variants: true,
    },
  });

  console.log('Created car model:', carModel.name, 'with', carModel.variants.length, 'variants');

  // Create a demo project
  const project = await prisma.project.create({
    data: {
      companyId: demoCompany.id,
      ownerId: adminUser.id,
      name: 'Summer Campaign 2024',
      prompt: 'A cinematic advertisement showcasing the 2024 Mustang GT driving through scenic mountain roads at sunset, highlighting its performance and elegance.',
      targetDuration: 30,
      status: 'STORYBOARD',
      scenes: {
        create: [
          {
            sceneNumber: 1,
            sceneTitle: 'Opening Shot',
            sceneSummary: 'Wide aerial shot of mountain landscape at golden hour, camera slowly reveals the winding road below.',
            imagePrompt: 'Cinematic aerial shot of mountain landscape at golden hour, winding mountain road visible below, dramatic clouds, 4K quality',
            videoPrompt: 'Slow camera pan across mountain landscape, revealing winding road below, dramatic clouds moving, golden hour lighting',
            suggestedDuration: 4,
          },
          {
            sceneNumber: 2,
            sceneTitle: 'Car Introduction',
            sceneSummary: 'First glimpse of the Mustang GT appearing around a curve, engine sound building.',
            imagePrompt: '2024 Ford Mustang GT in deep blue, emerging from mountain curve, motion blur background, cinematic lighting, professional car photography',
            videoPrompt: 'Mustang GT emerges from mountain curve, camera follows the car, motion blur background, engine sound building, cinematic camera movement',
            suggestedDuration: 5,
          },
          {
            sceneNumber: 3,
            sceneTitle: 'Performance Details',
            sceneSummary: 'Close-up shots of performance features: wheels spinning, exhaust, hood lines.',
            imagePrompt: 'Close-up of Mustang GT performance wheel spinning, brake caliper visible, dynamic action shot, shallow depth of field',
            videoPrompt: 'Wheel spinning in motion, brake caliper visible, dynamic camera movement, shallow depth of field, performance-focused action',
            suggestedDuration: 6,
          },
          {
            sceneNumber: 4,
            sceneTitle: 'Driving Experience',
            sceneSummary: 'Interior shot of driver enjoying the ride, hands on steering wheel, dashboard visible.',
            imagePrompt: 'Interior shot of driver in Mustang GT, hands on steering wheel, digital dashboard glowing, leather seats, sunset light streaming through window',
            videoPrompt: 'Driver hands on steering wheel, dashboard glowing, camera moves through interior, sunset light streaming through window, immersive driving experience',
            suggestedDuration: 5,
          },
          {
            sceneNumber: 5,
            sceneTitle: 'Final Shot',
            sceneSummary: 'Hero shot of the car parked at scenic overlook with sunset, logo fade in.',
            imagePrompt: 'Ford Mustang GT parked at scenic mountain overlook, sunset background, hero shot, professional automotive photography, dramatic composition',
            videoPrompt: 'Mustang GT parked at scenic overlook, camera slowly circles the car, sunset in background, logo fade in, dramatic final shot',
            suggestedDuration: 10,
          },
        ],
      },
    },
    include: {
      scenes: true,
    },
  });

  console.log('Created demo project:', project.name, 'with', project.scenes.length, 'scenes');

  console.log('\nDatabase seeding completed!');
  console.log('\nDemo credentials:');
  console.log('  Admin: admin@demo.com / password123');
  console.log('  Member: member@demo.com / password123');
  console.log('  Test Admin: admin@test.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
