import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const prompt = formData.get('prompt') as string;
    const duration = parseInt(formData.get('duration') as string || '5');
    const imageCount = parseInt(formData.get('imageCount') as string || '0');

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Collect all reference images
    const referenceImages: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      const file = formData.get(`image${i}`) as File | null;
      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        referenceImages.push(`data:${file.type};base64,${buffer.toString('base64')}`);
      }
    }

    if (referenceImages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one reference image is required' },
        { status: 400 }
      );
    }

    // Run Seedance 1 Pro Fast video generation
    const input: Record<string, unknown> = {
      prompt,
      image: referenceImages[0], // Primary image
      duration,
    };

    // Add additional reference images if available
    if (referenceImages.length > 1) {
      input.reference_images = referenceImages.slice(1);
    }

    // Use MiniMax Hailuo for fast video generation
    const output = await replicate.run('minimax/hailuo-2.3-fast', {
      input,
    });

    // Output is typically a video URL
    const videoUrl = Array.isArray(output) ? String(output[0]) : String(output);

    return NextResponse.json({
      success: true,
      videoUrl,
    });
  } catch (error: any) {
    console.error('Seedance generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate video' },
      { status: 500 }
    );
  }
}
