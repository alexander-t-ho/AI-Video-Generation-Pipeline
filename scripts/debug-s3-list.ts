import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function listCarAssets() {
  console.log('🔍 Debugging S3 Assets...');

  const bucket = process.env.AWS_S3_BUCKET || 'ai-video-pipeline-outputs';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Using Bucket: ${bucket} (${region})`);
  
  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.error('❌ AWS_ACCESS_KEY_ID is missing!');
    return;
  }

  const client = new S3Client({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  try {
    // 1. Check root assets folder
    console.log('\n📂 Checking "assets/cars/" prefix:');
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'assets/cars/',
    });

    const response = await client.send(command);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('⚠️  No files found in "assets/cars/"');
      
      // 2. If empty, check "cars" prefix (no trailing slash)
      console.log('\n📂 Checking "cars" prefix:');
      const carsCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'cars',
        MaxKeys: 50,
      });
      
      const carsResponse = await client.send(carsCommand);
      if (carsResponse.Contents && carsResponse.Contents.length > 0) {
        console.log(`✅ Found ${carsResponse.Contents.length} files in "cars":`);
        carsResponse.Contents.forEach(obj => console.log(`   - ${obj.Key}`));
      } else {
        console.log('⚠️  No files found in "cars" either');
        
        // 3. Check root
        console.log('\n📂 Checking bucket root (first 20 files):');
        const rootCommand = new ListObjectsV2Command({
          Bucket: bucket,
          MaxKeys: 20,
        });
        const rootResponse = await client.send(rootCommand);
        rootResponse.Contents?.forEach(obj => console.log(`   - ${obj.Key}`));
      }

    } else {
      console.log(`✅ Found ${response.Contents.length} files:`);
      response.Contents.forEach(obj => console.log(`   - ${obj.Key}`));
    }

  } catch (error: any) {
    console.error('❌ Error listing S3 objects:', error.message);
  }
}

listCarAssets();
