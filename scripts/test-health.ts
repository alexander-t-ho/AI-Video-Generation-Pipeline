import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function testHealth() {
  console.log('🏥 Testing health endpoint...\n');

  const url = `${BASE_URL}/api/health`;
  console.log(`🔗 Testing: ${url}\n`);

  try {
    // Test 1: Make request to health endpoint
    console.log('1. Making request to health endpoint...');
    const startTime = Date.now();

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    console.log(`   ✅ Response: ${response.status} (${responseTime}ms)\n`);

    // Test 2: Check response content
    console.log('2. Checking response content...');
    const data = await response.json();

    console.log('   📄 Response data:');
    console.log(`      - Status: ${data.status}`);
    console.log(`      - Service: ${data.service}`);
    console.log(`      - Timestamp: ${data.timestamp}\n`);

    // Test 3: Validate response structure
    console.log('3. Validating response structure...');

    if (response.status === 200 && data.status === 'ok') {
      console.log('   ✅ Health check passed!\n');
      console.log('🎉 App is healthy and responding correctly!');
    } else {
      console.log('   ❌ Health check failed - unexpected response\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Health check failed!');
    console.error('Error:', error);

    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        console.error('\n💡 Tip: Make sure the app is running locally with `npm run dev`');
        console.error('   Or provide NEXT_PUBLIC_BASE_URL for remote testing');
      } else if (error.message.includes('ECONNREFUSED')) {
        console.error('\n💡 Tip: App is not running or not accessible');
      }
    }

    process.exit(1);
  }
}

// Allow testing remote URLs
if (process.argv[2]) {
  process.env.NEXT_PUBLIC_BASE_URL = process.argv[2];
}

testHealth();
