import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get('image') as File | null;
    const prompt = formData.get('prompt') as string;

    if (!image || !prompt) {
      return NextResponse.json(
        { success: false, error: 'Image and prompt are required' },
        { status: 400 }
      );
    }

    // Convert file to base64 data URI
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const imageBase64 = `data:${image.type};base64,${imageBuffer.toString('base64')}`;

    // Run Flux Pro image-to-image
    const output = await replicate.run('black-forest-labs/flux-1.1-pro', {
      input: {
        prompt,
        image: imageBase64,
        prompt_upsampling: true,
      },
    });

    const imageUrl = String(output);

    return NextResponse.json({
      success: true,
      imageUrl,
    });
  } catch (error: any) {
    console.error('Flux generation error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate image' },
      { status: 500 }
    );
  }
}
