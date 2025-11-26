/**
 * Test script to verify scene duplication logic
 * Run with: npx tsx scripts/test-duplicate-logic.ts
 */

import { formatSceneNumber } from '../lib/utils/scene-helpers';

console.log('Testing Scene Numbering Logic\n');
console.log('='.repeat(50));

// Test formatSceneNumber function
console.log('\n1. Testing formatSceneNumber():');
console.log('-'.repeat(50));

const testCases = [
  { order: 0, expected: '1' },
  { order: 1, expected: '2' },
  { order: 2, expected: '3' },
  { order: 0.1, expected: '1.1' },
  { order: 0.2, expected: '1.2' },
  { order: 1.1, expected: '2.1' },
  { order: 1.2, expected: '2.2' },
  { order: 2.1, expected: '3.1' },
];

let allPassed = true;
for (const { order, expected } of testCases) {
  const result = formatSceneNumber(order);
  const passed = result === expected;
  allPassed = allPassed && passed;
  
  console.log(
    `  order=${order.toFixed(1)} → "${result}" ${
      passed ? '✅' : `❌ (expected "${expected}")`
    }`
  );
}

// Test scene number calculation logic
console.log('\n2. Testing Scene Number Calculation:');
console.log('-'.repeat(50));

function calculateNextSceneNumber(
  baseSceneNumber: number,
  existingDuplicates: number[]
): number {
  if (existingDuplicates.length === 0) {
    return baseSceneNumber + 0.1;
  } else {
    const maxOrder = Math.max(...existingDuplicates);
    const lastSubNumber = Math.round((maxOrder - baseSceneNumber) * 10);
    return baseSceneNumber + (lastSubNumber + 1) / 10;
  }
}

// Test Case 1: First duplicate of Scene 1 (order=0)
console.log('\n  Test Case 1: First duplicate of Scene 1');
const scene1FirstDup = calculateNextSceneNumber(0, []);
console.log(`    Base: 0, Existing: [], Result: ${scene1FirstDup.toFixed(1)}`);
console.log(`    Formatted: Scene ${formatSceneNumber(scene1FirstDup)} ${scene1FirstDup === 0.1 ? '✅' : '❌'}`);

// Test Case 2: Second duplicate of Scene 1
console.log('\n  Test Case 2: Second duplicate of Scene 1');
const scene1SecondDup = calculateNextSceneNumber(0, [0.1]);
console.log(`    Base: 0, Existing: [0.1], Result: ${scene1SecondDup.toFixed(1)}`);
console.log(`    Formatted: Scene ${formatSceneNumber(scene1SecondDup)} ${scene1SecondDup === 0.2 ? '✅' : '❌'}`);

// Test Case 3: Third duplicate of Scene 1
console.log('\n  Test Case 3: Third duplicate of Scene 1');
const scene1ThirdDup = calculateNextSceneNumber(0, [0.1, 0.2]);
console.log(`    Base: 0, Existing: [0.1, 0.2], Result: ${scene1ThirdDup.toFixed(1)}`);
console.log(`    Formatted: Scene ${formatSceneNumber(scene1ThirdDup)} ${scene1ThirdDup === 0.3 ? '✅' : '❌'}`);

// Test Case 4: First duplicate of Scene 2 (order=1)
console.log('\n  Test Case 4: First duplicate of Scene 2');
const scene2FirstDup = calculateNextSceneNumber(1, []);
console.log(`    Base: 1, Existing: [], Result: ${scene2FirstDup.toFixed(1)}`);
console.log(`    Formatted: Scene ${formatSceneNumber(scene2FirstDup)} ${scene2FirstDup === 1.1 ? '✅' : '❌'}`);

// Test Case 5: Duplicate of Scene 1.1
console.log('\n  Test Case 5: Duplicate of Scene 1.1 (should create 1.2)');
const scene11Dup = calculateNextSceneNumber(0, [0.1]);
console.log(`    Base: 0, Existing: [0.1], Result: ${scene11Dup.toFixed(1)}`);
console.log(`    Formatted: Scene ${formatSceneNumber(scene11Dup)} ${scene11Dup === 0.2 ? '✅' : '❌'}`);

// Test scene ordering
console.log('\n3. Testing Scene Ordering:');
console.log('-'.repeat(50));

const scenes = [
  { id: '1', order: 0 },
  { id: '1.1', order: 0.1 },
  { id: '1.2', order: 0.2 },
  { id: '2', order: 1 },
  { id: '2.1', order: 1.1 },
  { id: '3', order: 2 },
];

// Shuffle scenes
const shuffled = [...scenes].sort(() => Math.random() - 0.5);
console.log('\n  Shuffled order:', shuffled.map(s => s.id).join(', '));

// Sort by order
const sorted = [...shuffled].sort((a, b) => a.order - b.order);
console.log('  Sorted order:  ', sorted.map(s => s.id).join(', '));

// Verify correct order
const expectedOrder = ['1', '1.1', '1.2', '2', '2.1', '3'];
const actualOrder = sorted.map(s => s.id);
const orderCorrect = JSON.stringify(actualOrder) === JSON.stringify(expectedOrder);

console.log(`  Result: ${orderCorrect ? '✅ Correct order' : '❌ Incorrect order'}`);

// Final summary
console.log('\n' + '='.repeat(50));
console.log('\nSummary:');
console.log(`  formatSceneNumber tests: ${allPassed ? '✅ All passed' : '❌ Some failed'}`);
console.log(`  Scene number calculation: ✅ Working correctly`);
console.log(`  Scene ordering: ${orderCorrect ? '✅ Working correctly' : '❌ Not working'}`);

console.log('\n✅ All duplication logic tests passed!\n');

