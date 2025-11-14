/**
 * Test endpoint to verify API keys are configured
 * 
 * DELETE THIS FILE BEFORE FINAL DEPLOYMENT
 * Or protect it with authentication
 */

export async function GET() {
  const results: Record<string, { set: boolean; valid: boolean; error?: string }> = {};

  // Check Replicate API Token
  const replicateToken = process.env.REPLICATE_API_TOKEN;
  results.REPLICATE_API_TOKEN = {
    set: !!replicateToken,
    valid: !!replicateToken && replicateToken.startsWith('r8_'),
  };
  if (!replicateToken) {
    results.REPLICATE_API_TOKEN.error = 'Not set';
  } else if (!replicateToken.startsWith('r8_')) {
    results.REPLICATE_API_TOKEN.error = 'Invalid format (should start with r8_)';
  }

  // Check OpenRouter API Key
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  results.OPENROUTER_API_KEY = {
    set: !!openRouterKey,
    valid: !!openRouterKey && (openRouterKey.startsWith('sk-or-v1-') || openRouterKey.startsWith('sk-')),
  };
  if (!openRouterKey) {
    results.OPENROUTER_API_KEY.error = 'Not set';
  } else if (!openRouterKey.startsWith('sk-')) {
    results.OPENROUTER_API_KEY.error = 'Invalid format';
  }

  // Check AWS Credentials
  const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
  const awsBucket = process.env.AWS_S3_BUCKET;

  results.AWS_ACCESS_KEY_ID = {
    set: !!awsAccessKey,
    valid: !!awsAccessKey && awsAccessKey.startsWith('AKIA'),
  };
  if (!awsAccessKey) {
    results.AWS_ACCESS_KEY_ID.error = 'Not set';
  }

  results.AWS_SECRET_ACCESS_KEY = {
    set: !!awsSecretKey,
    valid: !!awsSecretKey && awsSecretKey.length > 20,
  };
  if (!awsSecretKey) {
    results.AWS_SECRET_ACCESS_KEY.error = 'Not set';
  }

  results.AWS_S3_BUCKET = {
    set: !!awsBucket,
    valid: !!awsBucket && awsBucket.length > 0,
  };
  if (!awsBucket) {
    results.AWS_S3_BUCKET.error = 'Not set';
  }

  // Check App URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  results.NEXT_PUBLIC_APP_URL = {
    set: !!appUrl,
    valid: !!appUrl && (appUrl.startsWith('http://') || appUrl.startsWith('https://')),
  };
  if (!appUrl) {
    results.NEXT_PUBLIC_APP_URL.error = 'Not set (optional, but recommended)';
  }

  const allValid = Object.values(results).every(r => r.valid);
  const allSet = Object.values(results).every(r => r.set);

  return Response.json({
    success: allValid,
    summary: {
      allSet,
      allValid,
      total: Object.keys(results).length,
      valid: Object.values(results).filter(r => r.valid).length,
    },
    results,
  }, { status: allValid ? 200 : 500 });
}

