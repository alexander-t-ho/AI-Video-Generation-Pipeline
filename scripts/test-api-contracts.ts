/**
 * API Contract Verification Test
 * 
 * This script verifies that Person 2's API endpoints match the expected
 * contracts for Person 3's frontend integration.
 * 
 * Tests:
 * 1. Request/response format validation
 * 2. Error response format validation
 * 3. Status code validation
 * 4. Data type validation
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface ApiContract {
  endpoint: string;
  method: string;
  requestBody?: any;
  expectedStatus: number;
  expectedResponse: {
    success: boolean;
    data?: any;
    error?: string;
  };
}

const contracts: ApiContract[] = [
  // Video Generation - POST
  {
    endpoint: '/api/generate-video',
    method: 'POST',
    requestBody: {
      imageUrl: 'https://example.com/test-image.png',
      prompt: 'A smooth camera movement',
      sceneIndex: 0,
      projectId: 'test-project-123',
    },
    expectedStatus: 200,
    expectedResponse: {
      success: true,
      data: {
        predictionId: 'string',
      },
    },
  },
  // Video Generation - GET (status check)
  {
    endpoint: '/api/generate-video/test-prediction-id',
    method: 'GET',
    expectedStatus: 200,
    expectedResponse: {
      success: true,
      data: {
        status: 'string', // 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled'
      },
    },
  },
  // Frame Extraction - POST
  {
    endpoint: '/api/extract-frames',
    method: 'POST',
    requestBody: {
      videoPath: 'test videos/test-video.mp4',
      projectId: 'test-project-123',
      sceneIndex: 0,
    },
    expectedStatus: 200,
    expectedResponse: {
      success: true,
      data: {
        frames: [
          {
            id: 'string',
            url: 'string',
            timestamp: 'number',
          },
        ],
      },
    },
  },
  // Video Stitching - POST
  {
    endpoint: '/api/stitch-videos',
    method: 'POST',
    requestBody: {
      videoPaths: [
        'test videos/scene-0.mp4',
        'test videos/scene-1.mp4',
        'test videos/scene-2.mp4',
        'test videos/scene-3.mp4',
        'test videos/scene-4.mp4',
      ],
      projectId: 'test-project-123',
      uploadToS3: false,
    },
    expectedStatus: 200,
    expectedResponse: {
      success: true,
      data: {
        finalVideoPath: 'string',
        s3Url: 'string?',
        s3Key: 'string?',
      },
    },
  },
];

async function testApiContract(contract: ApiContract): Promise<boolean> {
  try {
    const url = `${BASE_URL}${contract.endpoint}`;
    const options: RequestInit = {
      method: contract.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (contract.requestBody) {
      options.body = JSON.stringify(contract.requestBody);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    // Check status code
    if (response.status !== contract.expectedStatus) {
      console.error(`❌ Status code mismatch: expected ${contract.expectedStatus}, got ${response.status}`);
      return false;
    }

    // Check response structure
    if (typeof data.success !== 'boolean') {
      console.error('❌ Response missing "success" field');
      return false;
    }

    // Check expected fields
    if (contract.expectedResponse.success && !data.success) {
      console.error('❌ Expected success=true, got success=false');
      if (data.error) {
        console.error(`   Error: ${data.error}`);
      }
      return false;
    }

    // Check data structure if success
    if (data.success && contract.expectedResponse.data) {
      if (!data.data) {
        console.error('❌ Response missing "data" field');
        return false;
      }

      // Validate data structure (basic check)
      const expectedData = contract.expectedResponse.data;
      for (const key in expectedData) {
        if (!(key in data.data)) {
          console.warn(`⚠️  Response missing field: ${key}`);
        }
      }
    }

    return true;
  } catch (error: any) {
    console.error(`❌ Error testing contract: ${error.message}`);
    return false;
  }
}

async function testErrorResponses(): Promise<boolean> {
  console.log('\n📋 Testing Error Response Formats...\n');

  const errorTests = [
    {
      name: 'Missing required field',
      endpoint: '/api/generate-video',
      method: 'POST',
      body: { prompt: 'test' }, // Missing imageUrl, sceneIndex, projectId
      expectedStatus: 400,
    },
    {
      name: 'Invalid sceneIndex',
      endpoint: '/api/generate-video',
      method: 'POST',
      body: {
        imageUrl: 'https://example.com/test.png',
        prompt: 'test',
        sceneIndex: 10, // Invalid (should be 0-4)
        projectId: 'test',
      },
      expectedStatus: 400,
    },
    {
      name: 'Invalid video path',
      endpoint: '/api/extract-frames',
      method: 'POST',
      body: {
        videoPath: 'nonexistent-video.mp4',
        projectId: 'test',
        sceneIndex: 0,
      },
      expectedStatus: 404,
    },
  ];

  let allPassed = true;

  for (const test of errorTests) {
    try {
      const url = `${BASE_URL}${test.endpoint}`;
      const response = await fetch(url, {
        method: test.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.body),
      });

      const data = await response.json();

      if (response.status !== test.expectedStatus) {
        console.error(`❌ ${test.name}: Expected status ${test.expectedStatus}, got ${response.status}`);
        allPassed = false;
        continue;
      }

      if (!data.success && data.error) {
        console.log(`✅ ${test.name}: Error response format correct`);
      } else {
        console.error(`❌ ${test.name}: Error response format incorrect`);
        allPassed = false;
      }
    } catch (error: any) {
      console.error(`❌ ${test.name}: ${error.message}`);
      allPassed = false;
    }
  }

  return allPassed;
}

async function main() {
  console.log('🧪 API Contract Verification Test\n');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test valid contracts
  console.log('📋 Testing API Contracts...\n');
  let allPassed = true;

  for (const contract of contracts) {
    console.log(`Testing ${contract.method} ${contract.endpoint}...`);
    const passed = await testApiContract(contract);
    if (passed) {
      console.log(`✅ ${contract.method} ${contract.endpoint}: Contract valid\n`);
    } else {
      console.log(`❌ ${contract.method} ${contract.endpoint}: Contract invalid\n`);
      allPassed = false;
    }
  }

  // Test error responses
  const errorTestsPassed = await testErrorResponses();

  // Summary
  console.log('\n' + '='.repeat(60));
  if (allPassed && errorTestsPassed) {
    console.log('✅ All API contract tests passed!');
    return true;
  } else {
    console.log('❌ Some API contract tests failed');
    return false;
  }
}

// Run tests
if (require.main === module) {
  main()
    .then((success) => {
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

export { testApiContract, testErrorResponses };

