/**
 * Test script for storyboard generation
 * 
 * Usage:
 *   npx tsx scripts/test-storyboard.ts
 * 
 * Or with ts-node:
 *   npx ts-node scripts/test-storyboard.ts
 */

import { generateStoryboard } from '../lib/ai/storyboard-generator';
import fsSync from 'fs';
import path from 'path';

// Load environment variables from .env.local if it exists (synchronous for top-level)
try {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fsSync.existsSync(envPath)) {
    const envContent = fsSync.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').replace(/^["']|["']$/g, '');
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      }
    });
    console.log('✅ Loaded environment variables from .env.local\n');
  } else {
    console.log('ℹ️  No .env.local file found (using system environment variables)\n');
  }
} catch (error) {
  // .env.local doesn't exist or can't be read, that's okay
  console.log('ℹ️  Could not load .env.local (using system environment variables)\n');
}

// Test prompts from PRD
const TEST_PROMPTS = [
  {
    name: 'Luxury Watch',
    prompt: 'Create a luxury watch advertisement with golden hour lighting, elegant model wearing the watch, close-up product shots, sophisticated minimalist aesthetic',
    duration: 15,
  },
  {
    name: 'Energy Drink',
    prompt: 'Create an energy drink ad with extreme sports footage, skateboarding, parkour, vibrant neon colors, high energy movement, urban environment',
    duration: 15,
  },
  {
    name: 'Skincare',
    prompt: 'Create a minimalist skincare advertisement with clean white background, soft natural lighting, product close-ups, botanical elements, serene aesthetic',
    duration: 15,
  },
];

async function testStoryboardGeneration() {
  console.log('🧪 Testing Storyboard Generation\n');
  console.log('=' .repeat(60));

  // Check for API key
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('❌ ERROR: OPENROUTER_API_KEY environment variable is not set');
    console.error('   Please set it in .env.local file');
    process.exit(1);
  }

  console.log('✅ OpenRouter API key found\n');

  // Test each prompt
  for (const testCase of TEST_PROMPTS) {
    console.log(`\n📝 Test: ${testCase.name}`);
    console.log(`   Prompt: "${testCase.prompt.substring(0, 60)}..."`);
    console.log(`   Duration: ${testCase.duration}s`);
    console.log('-'.repeat(60));

    try {
      const startTime = Date.now();
      const scenes = await generateStoryboard(testCase.prompt, testCase.duration);
      const duration = Date.now() - startTime;

      console.log(`✅ Success! Generated in ${duration}ms`);
      console.log(`   Total scenes: ${scenes.length}`);
      console.log(`   Total duration: ${scenes.reduce((sum, s) => sum + s.suggestedDuration, 0)}s`);

      // Display scenes
      scenes.forEach((scene, index) => {
        console.log(`\n   Scene ${scene.order + 1}:`);
        console.log(`     ID: ${scene.id}`);
        console.log(`     Description: ${scene.description.substring(0, 60)}...`);
        console.log(`     Duration: ${scene.suggestedDuration}s`);
        console.log(`     Image Prompt: ${scene.imagePrompt.substring(0, 60)}...`);
      });
    } catch (error) {
      console.error(`❌ Failed:`, error instanceof Error ? error.message : error);
      if (error instanceof Error && error.stack) {
        console.error('   Stack:', error.stack);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests completed!');
}

// Run tests
testStoryboardGeneration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

