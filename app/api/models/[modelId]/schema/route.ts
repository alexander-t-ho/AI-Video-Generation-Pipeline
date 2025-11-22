import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

/**
 * GET /api/models/[modelId]/schema
 * Fetches the input schema for a Replicate model
 * 
 * URL Parameters:
 * - modelId: The Replicate model identifier (e.g., "google/veo-3.1" or "google/veo-3.1:version-hash")
 * 
 * Response:
 * {
 *   success: boolean;
 *   schema?: {
 *     type: "object";
 *     properties: Record<string, any>;
 *     required?: string[];
 *   };
 *   error?: string;
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { modelId: string } }
) {
  try {
    const { modelId } = params;

    if (!modelId) {
      return NextResponse.json(
        { success: false, error: 'Model ID is required' },
        { status: 400 }
      );
    }

    // Check for required environment variables
    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: 'REPLICATE_API_TOKEN environment variable is not set.',
        },
        { status: 500 }
      );
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Parse model ID and version
    // Format: "owner/model" or "owner/model:version-hash"
    const [modelPath, versionHash] = modelId.split(':');
    const [owner, modelName] = modelPath.split('/');

    if (!owner || !modelName) {
      return NextResponse.json(
        { success: false, error: 'Invalid model ID format. Expected "owner/model" or "owner/model:version"' },
        { status: 400 }
      );
    }

    let schema: any;

    if (versionHash) {
      // Fetch specific version
      try {
        const version = await replicate.models.versions.get(owner, modelName, versionHash);
        const openapiSchema = version.openapi_schema as any;
        schema = openapiSchema?.components?.schemas?.Input || openapiSchema?.components?.schemas?.input;
      } catch (error: any) {
        console.error(`[Model Schema API] Error fetching version ${versionHash}:`, error);
        // Fall back to latest version
      }
    }

    // If no version specified or version fetch failed, get latest version
    if (!schema) {
      try {
        const model = await replicate.models.get(owner, modelName);
        if (model.latest_version) {
          const openapiSchema = model.latest_version.openapi_schema as any;
          schema = openapiSchema?.components?.schemas?.Input ||
                   openapiSchema?.components?.schemas?.input;
        }
      } catch (error: any) {
        console.error(`[Model Schema API] Error fetching model:`, error);
        return NextResponse.json(
          {
            success: false,
            error: error.message || `Failed to fetch schema for model ${modelId}`,
          },
          { status: 404 }
        );
      }
    }

    if (!schema) {
      return NextResponse.json(
        {
          success: false,
          error: `No schema found for model ${modelId}`,
        },
        { status: 404 }
      );
    }

    // Normalize the schema format
    // Replicate schemas can be in different formats, normalize to a consistent structure
    const normalizedSchema = {
      type: schema.type || 'object',
      properties: schema.properties || {},
      required: schema.required || [],
      title: schema.title || 'Input',
    };

    return NextResponse.json({
      success: true,
      schema: normalizedSchema,
    });
  } catch (error: any) {
    console.error('[Model Schema API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch model schema',
      },
      { status: 500 }
    );
  }
}



