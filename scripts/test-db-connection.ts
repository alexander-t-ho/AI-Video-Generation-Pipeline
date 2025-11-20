import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  try {
    // Test 1: Check database connection
    console.log('1. Checking database connection...');
    await prisma.$connect();
    console.log('   ✅ Connected successfully!\n');

    // Test 2: Get database version
    console.log('2. Checking database version...');
    const result = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    console.log('   ✅ Database version:', result[0].version.split(' ')[0], '\n');

    // Test 3: Count tables
    console.log('3. Checking schema...');
    const companies = await prisma.company.count();
    const users = await prisma.user.count();
    const projects = await prisma.project.count();
    
    console.log('   ✅ Schema loaded successfully!');
    console.log('   📊 Current data:');
    console.log(`      - Companies: ${companies}`);
    console.log(`      - Users: ${users}`);
    console.log(`      - Projects: ${projects}\n`);

    // Test 4: Check migrations
    console.log('4. Checking migrations...');
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string, finished_at: Date }>>`
      SELECT migration_name, finished_at 
      FROM _prisma_migrations 
      ORDER BY finished_at DESC 
      LIMIT 5
    `;
    
    if (migrations.length > 0) {
      console.log('   ✅ Recent migrations:');
      migrations.forEach(m => {
        console.log(`      - ${m.migration_name} (${new Date(m.finished_at).toLocaleString()})`);
      });
    } else {
      console.log('   ⚠️  No migrations found');
    }

    console.log('\n✅ All database tests passed!');
    
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error('Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('getaddrinfo')) {
        console.error('\n💡 Tip: Check your DATABASE_URL - the host may be incorrect');
      } else if (error.message.includes('authentication')) {
        console.error('\n💡 Tip: Check your database credentials in DATABASE_URL');
      } else if (error.message.includes('does not exist')) {
        console.error('\n💡 Tip: Run "npm run db:push" or "npm run db:migrate" to set up the schema');
      }
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

