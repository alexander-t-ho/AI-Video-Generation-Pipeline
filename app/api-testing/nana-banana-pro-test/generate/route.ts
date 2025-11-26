import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const prompt = formData.get('prompt') as string;
    const aspectRatio = formData.get('aspectRatio') as string || 'match_input_image';
    const outputFormat = formData.get('outputFormat') as string || 'png';
    const imageCount = parseInt(formData.get('imageCount') as string || '0');

    if (!prompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Collect all input images
    const inputImages: string[] = [];
    for (let i = 0; i < imageCount; i++) {
      const file = formData.get(`image${i}`) as File | null;
      if (file) {
        const buffer = Buffer.from(await file.arrayBuffer());
        inputImages.push(`data:${file.type};base64,${buffer.toString('base64')}`);
      }
    }

    if (inputImages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one input image is required' },
        { status: 400 }
      );
    }

    // Run Gemini 2.5 Flash image editing
    const input: Record<string, unknown> = {
      prompt,
      image: inputImages[0], // Primary image
      aspect_ratio: aspectRatio,
      output_format: outputFormat,
    };

    // Add additional images if available
    if (inputImages.length > 1) {
      input.reference_images = inputImages.slice(1);
    }

    // Use Google Nano Banana Pro for image editing with reference images
    const output = await replicate.run('google/nano-banana-pro', {
      input,
    });

    // Output is typically an image URL
    const imageUrl = Array.isArray(output) ? String(output[0]) : String(output);

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error: any) {
    console.error('Nana Banana Pro generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate image' },
      { status: 500 }
    );
  }
}
