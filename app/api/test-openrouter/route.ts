/**
 * Test endpoint to verify OpenRouter API key works
 * 
 * DELETE THIS FILE BEFORE FINAL DEPLOYMENT
 * Or protect it with authentication
 */

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return Response.json({
      success: false,
      error: 'OPENROUTER_API_KEY is not set',
      suggestion: 'Add OPENROUTER_API_KEY to your .env.local file',
    }, { status: 500 });
  }

  // Check format
  const isValidFormat = apiKey.startsWith('sk-or-v1-') || apiKey.startsWith('sk-');
  
  if (!isValidFormat) {
    return Response.json({
      success: false,
      error: 'Invalid API key format',
      format: apiKey.substring(0, 10) + '...',
      expected: 'Should start with "sk-or-v1-" or "sk-"',
      suggestion: 'Get your API key from https://openrouter.ai/keys',
    }, { status: 500 });
  }

  // Try a simple API call to verify the key works
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'AI Video Generation Pipeline',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API key test failed: ${response.status} ${response.statusText}`;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch {
        // Use default error message
      }

      return Response.json({
        success: false,
        error: errorMessage,
        status: response.status,
        suggestion: response.status === 401 || response.status === 403
          ? 'Your API key may be invalid or expired. Get a new key from https://openrouter.ai/keys'
          : 'Check the OpenRouter API status or try again later',
      }, { status: 500 });
    }

    const data = await response.json();
    
    // Now test a simple chat completion to verify the key works for actual requests
    let chatTestSuccess = false;
    let chatTestError = null;
    
    try {
      const chatResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'AI Video Generation Pipeline',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [
            {
              role: 'user',
              content: 'Say "Hello"',
            },
          ],
        }),
      });

      if (chatResponse.ok) {
        const chatData = await chatResponse.json();
        chatTestSuccess = true;
      } else {
        const errorText = await chatResponse.text();
        let errorMsg = `Chat test failed: ${chatResponse.status}`;
        try {
          const errorData = JSON.parse(errorText);
          errorMsg = errorData.error?.message || errorData.message || errorText;
        } catch {
          errorMsg = errorText;
        }
        chatTestError = errorMsg;
      }
    } catch (error) {
      chatTestError = error instanceof Error ? error.message : String(error);
    }

    return Response.json({
      success: chatTestSuccess,
      message: chatTestSuccess 
        ? 'OpenRouter API key is valid and chat completions work!'
        : 'OpenRouter API key is valid but chat completions failed',
      keyFormat: apiKey.startsWith('sk-or-v1-') ? 'sk-or-v1-...' : 'sk-...',
      availableModels: data.data?.length || 0,
      chatTest: {
        success: chatTestSuccess,
        error: chatTestError,
      },
      suggestion: chatTestError 
        ? 'Check if your account has access to openai/gpt-4o model or try a different model'
        : null,
    }, { status: chatTestSuccess ? 200 : 500 });
  } catch (error) {
    return Response.json({
      success: false,
      error: 'Failed to test API key',
      details: error instanceof Error ? error.message : String(error),
      suggestion: 'Check your internet connection and try again',
    }, { status: 500 });
  }
}

