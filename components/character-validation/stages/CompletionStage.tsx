'use client';

import { useRouter } from 'next/navigation';
import { useProjectStore } from '@/lib/state/project-store';
import { Check, ArrowRight } from 'lucide-react';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { ImagePreview } from '../shared/ImagePreview';

export function CompletionStage() {
  const router = useRouter();
  const {
    project,
    mainReferenceImage,
    angleReferenceImages,
    selectedAngles,
    setCharacterValidationStage,
    setCharacterReferences,
    setAngleReferenceImage,
    characterReferenceModel,
    setCharacterDescription
  } = useProjectStore();

  // Collect all reference images
  const allReferences: Array<{
    id: string;
    url: string;
    localPath: string;
    prompt: string;
    replicateId: string;
    createdAt: string;
    angleType: any; // AngleType
    generationModel: string;
    isUpscaled: boolean;
    originalPrompt: string;
    label: string;
  }> = [];
  if (mainReferenceImage) {
    allReferences.push({ ...mainReferenceImage, label: 'Main Reference' });
  }

  // Add angle references
  selectedAngles.forEach(angle => {
    if (angleReferenceImages[angle]) {
      const angleLabels: Record<string, string> = {
        'front': 'Front View',
        'rear': 'Rear View',
        'left-side': 'Left Side',
        'right-side': 'Right Side',
        'front-left-45': 'Front 3/4 Left',
        'front-right-45': 'Front 3/4 Right',
        'top': 'Top View',
        'low-angle': 'Low Angle'
      };
      allReferences.push({
        ...angleReferenceImages[angle],
        label: angleLabels[angle] || angle
      });
    }
  });

  const handleComplete = () => {
    if (!project?.id) {
      console.error('Cannot navigate: Project ID is missing');
      return;
    }

    // Save all reference images to project store for media drawer
    const referenceUrls = allReferences.map(ref => ref.url);
    setCharacterReferences(referenceUrls);

    router.push(`/workspace?projectId=${project.id}`);
  };

  const handleBack = () => {
    setCharacterValidationStage('angle-generation');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
      {/* Large Background Text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Complete
        </h1>
      </div>

      <div className="relative z-10 w-full max-w-6xl mx-auto">
        <ProgressIndicator currentStage="complete" totalStages={5} />

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Character Validation Complete
          </h1>
          <p className="text-white/60">
            Your reference images are ready for video generation
          </p>
        </div>

        <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl p-8 space-y-6">
          {/* Summary Stats */}
          <div className="text-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{allReferences.length}</div>
                <div className="text-sm text-white/60">Reference Images</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{selectedAngles.length + 1}</div>
                <div className="text-sm text-white/60">Angles Generated</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">
                  {allReferences.filter(img => img.isUpscaled).length}
                </div>
                <div className="text-sm text-white/60">Upscaled Images</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">✓</div>
                <div className="text-sm text-white/60">Ready for Video</div>
              </div>
            </div>
          </div>

          {/* Reference Images Grid */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white text-center">
              Your Reference Collection
            </h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allReferences.map((image, index) => (
                <div
                  key={image.id || index}
                  className="relative group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden border border-white/20 bg-white/5">
                    <img
                      src={image.url}
                      alt={image.label}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2">
                    <div className="font-medium">{image.label}</div>
                    {image.angleType && (
                      <div className="text-white/60 text-[10px]">
                        {image.generationModel}
                      </div>
                    )}
                  </div>
                  {image.isUpscaled && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      HD
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Character Description */}
          {project?.characterDescription && (
            <div className="p-4 bg-white/5 rounded-lg border border-white/20">
              <h3 className="text-sm font-medium text-white mb-2">Character Description</h3>
              <p className="text-sm text-white/80">
                {project.characterDescription}
              </p>
            </div>
          )}

          {/* What's Next */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <h3 className="text-sm font-medium text-blue-400 mb-2">What's Next?</h3>
            <ul className="text-sm text-blue-300 space-y-1">
              <li>• Your reference images are now available in the media library</li>
              <li>• Video generation will automatically use these references</li>
              <li>• Consistent character appearance across all scenes</li>
              <li>• High-quality results optimized for automotive content</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-white/20">
            <button
              onClick={handleBack}
              className="px-6 py-3 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/10 transition-colors"
            >
              ← Back to Generation
            </button>

            <button
              onClick={handleComplete}
              className="px-8 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors flex items-center gap-2"
            >
              Continue to Workspace
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
