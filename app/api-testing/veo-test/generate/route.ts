import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const primaryImage = formData.get('image') as File | null;
    const prompt = formData.get('prompt') as string;
    const negativePrompt = formData.get('negativePrompt') as string || '';
    const duration = parseInt(formData.get('duration') as string || '6');
    const aspectRatio = formData.get('aspectRatio') as string || '16:9';
    const resolution = formData.get('resolution') as string || '720p';
    const seed = formData.get('seed') as string;

    if (!primaryImage || !prompt) {
      return NextResponse.json(
        { success: false, error: 'Primary image and prompt are required' },
        { status: 400 }
      );
    }

    // Convert file to base64 data URI
    const imageBuffer = Buffer.from(await primaryImage.arrayBuffer());
    const imageBase64 = `data:${primaryImage.type};base64,${imageBuffer.toString('base64')}`;

    // Get additional reference images
    const referenceImages: string[] = [];
    const additionalFiles = formData.getAll('images') as File[];
    for (const file of additionalFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      referenceImages.push(`data:${file.type};base64,${buffer.toString('base64')}`);
    }

    // Run Veo 3.1 Fast video generation
    const input: Record<string, unknown> = {
      prompt,
      image: imageBase64,
      duration,
      aspect_ratio: aspectRatio,
    };

    if (negativePrompt) {
      input.negative_prompt = negativePrompt;
    }

    if (seed) {
      input.seed = parseInt(seed);
    }

    // Use Google Veo 3.1 Fast for video generation
    const output = await replicate.run('google/veo-3.1-fast', {
      input,
    });

    // Output is typically a video URL
    const videoUrl = Array.isArray(output) ? String(output[0]) : String(output);

    return NextResponse.json({
      success: true,
      videoUrl,
    });
  } catch (error: any) {
    console.error('Veo generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate video' },
      { status: 500 }
    );
  }
}
