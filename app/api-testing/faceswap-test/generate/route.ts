import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const targetImage = formData.get('targetImage') as File | null;
    const swapImage = formData.get('swapImage') as File | null;
    const model = formData.get('model') as string || 'simple';
    const enableRestoration = formData.get('enableRestoration') === 'true';
    const restorationMethod = formData.get('restorationMethod') as string || 'codeformer';
    const fidelity = parseFloat(formData.get('fidelity') as string || '0.7');
    const restorationUpscale = parseInt(formData.get('restorationUpscale') as string || '2');

    if (!targetImage || !swapImage) {
      return NextResponse.json(
        { success: false, error: 'Both target image and swap image are required' },
        { status: 400 }
      );
    }

    // Convert files to base64 data URIs
    const targetBuffer = Buffer.from(await targetImage.arrayBuffer());
    const swapBuffer = Buffer.from(await swapImage.arrayBuffer());
    const targetBase64 = `data:${targetImage.type};base64,${targetBuffer.toString('base64')}`;
    const swapBase64 = `data:${swapImage.type};base64,${swapBuffer.toString('base64')}`;

    let swappedImageUrl: string;

    if (model === 'advanced') {
      // Advanced model: easel/advanced-face-swap
      const swapImageB = formData.get('swapImageB') as File | null;
      const userGender = formData.get('userGender') as string || 'a woman';
      const userBGender = formData.get('userBGender') as string || 'a woman';
      const hairSource = formData.get('hairSource') as string || 'user';
      const upscale = formData.get('upscale') === 'true';
      const detailer = formData.get('detailer') === 'true';

      const input: Record<string, unknown> = {
        target: targetBase64,
        user: swapBase64,
        user_gender: userGender,
        hair_source: hairSource,
        upscale,
        detailer,
      };

      if (swapImageB) {
        const swapBBuffer = Buffer.from(await swapImageB.arrayBuffer());
        input.user_b = `data:${swapImageB.type};base64,${swapBBuffer.toString('base64')}`;
        input.user_b_gender = userBGender;
      }

      const output = await replicate.run('easel/advanced-face-swap', { input });
      swappedImageUrl = String(output);
    } else {
      // Simple model: codeplugtech/face-swap
      const output = await replicate.run('codeplugtech/face-swap:278a81e7ebb22db98bcba54de985d22cc1abeead2754eb1f2af717247be69b34', {
        input: {
          swap_image: swapBase64,
          target_image: targetBase64,
        },
      });
      swappedImageUrl = String(output);
    }

    // Optionally apply face restoration
    let restoredImageUrl: string | undefined;
    if (enableRestoration && swappedImageUrl) {
      if (restorationMethod === 'codeformer') {
        const restorationOutput = await replicate.run('sczhou/codeformer:7de2ea26c616d5bf2245ad0d5e24f0ff9a6204578a5c876db53142edd9d2cd56', {
          input: {
            image: swappedImageUrl,
            upscale: restorationUpscale,
            face_upsample: true,
            codeformer_fidelity: fidelity,
          },
        });
        restoredImageUrl = String(restorationOutput);
      } else {
        // GFPGAN
        const restorationOutput = await replicate.run('tencentarc/gfpgan:0fbacf7afc6c914f9d750b4bf5cee44f68784c4d', {
          input: {
            img: swappedImageUrl,
            scale: restorationUpscale,
          },
        });
        restoredImageUrl = String(restorationOutput);
      }
    }

    return NextResponse.json({
      success: true,
      swappedImageUrl,
      restoredImageUrl,
      restorationMethod: enableRestoration ? restorationMethod : undefined,
    });
  } catch (error: any) {
    console.error('Face swap error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process face swap' },
      { status: 500 }
    );
  }
}
