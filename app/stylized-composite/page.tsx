'use client';

import { useState } from 'react';
import CarImageUpload from '@/components/stylized/CarImageUpload';
import BackgroundImageUpload from '@/components/stylized/BackgroundImageUpload';
import StyleSelectorSingle from '@/components/stylized/StyleSelectorSingle';
import CompositePreview from '@/components/stylized/CompositePreview';
import CompositeResult from '@/components/stylized/CompositeResult';
import { CompositingResult, PRESET_STYLES } from '@/lib/types/stylized';
import { Loader2 } from 'lucide-react';

export default function StylizedCompositePage() {
  const [carImageUrl, setCarImageUrl] = useState<string>('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [result, setResult] = useState<CompositingResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateComposite = async () => {
    if (!carImageUrl || !backgroundImageUrl || !selectedStyle) {
      setError('Please upload both car and background images and select a style');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/stylized/composite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          carImageUrl,
          backgroundImageUrl,
          styleId: selectedStyle,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create composite');
      }

      if (data.result) {
        setResult(data.result);
      }
    } catch (err: any) {
      console.error('Error generating composite:', err);
      setError(err.message || 'Failed to generate composite');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateVideo = async (compositeImageUrl: string, styleId: string) => {
    // Custom prompt for Runway video generation
    const RUNWAY_PROMPT = `White sports car powers forward through muddy terrain, wheels spinning and throwing massive chunks of wet dirt and mud high into the air on both sides, vehicle surges toward camera with aggressive momentum, mud explodes upward and outward in dramatic sprays, wheels churn through deep puddles, dirt clumps fly in all directions, dynamic forward motion with intense energy, commercial automotive action sequence, powerful and relentless movement, camera remains steady as car approaches, cinematic truck commercial style`;

    try {
      // Use the existing video generation API with Runway Gen-4 Turbo
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Model-Video': 'runwayml/gen4-turbo', // Set model to Runway Gen-4 Turbo
        },
        body: JSON.stringify({
          imageUrl: compositeImageUrl,
          prompt: RUNWAY_PROMPT,
          projectId: `runway-video-${Date.now()}`,
          sceneIndex: 0,
          duration: 5,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate video');
      }

      // Show success message with prediction ID
      const predictionId = data.data?.predictionId;
      if (predictionId) {
        alert(`Video generation started!\n\nPrediction ID: ${predictionId}\n\nCheck the "video testing" folder for the output once generation completes.`);
      } else {
        alert('Video generation started! Check the "video testing" folder for the output.');
      }
    } catch (err: any) {
      console.error('Error generating video:', err);
      alert(`Failed to generate video: ${err.message}`);
      throw err;
    }
  };

  const canGenerate = carImageUrl && backgroundImageUrl && selectedStyle && !isGenerating;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Stylized Car Composite
          </h1>
          <p className="text-gray-600">
            Upload a car image and background, select a directing style, and create a styled composite
            with automatic color matching.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Inputs */}
          <div className="space-y-6">
            {/* Car Image Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <CarImageUpload
                onImageSelected={setCarImageUrl}
                selectedImageUrl={carImageUrl}
              />
            </div>

            {/* Background Image Upload */}
            <div className="bg-white rounded-lg shadow p-6">
              <BackgroundImageUpload
                onImageSelected={setBackgroundImageUrl}
                selectedImageUrl={backgroundImageUrl}
              />
            </div>

            {/* Style Selector */}
            <div className="bg-white rounded-lg shadow p-6">
              <StyleSelectorSingle
                selectedStyle={selectedStyle}
                onStyleSelect={setSelectedStyle}
              />
            </div>

            {/* Generate Button */}
            <div className="bg-white rounded-lg shadow p-6">
              <button
                onClick={handleGenerateComposite}
                disabled={!canGenerate}
                className={`
                  w-full px-6 py-3 rounded-lg font-semibold transition-colors
                  ${
                    canGenerate
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }
                  flex items-center justify-center gap-2
                `}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating Composite...
                  </>
                ) : (
                  'Generate Composite'
                )}
              </button>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Preview and Result */}
          <div className="space-y-6">
            {/* Preview */}
            {!result && (
              <div className="bg-white rounded-lg shadow p-6">
                <CompositePreview
                  carImageUrl={carImageUrl}
                  backgroundImageUrl={backgroundImageUrl}
                />
              </div>
            )}

            {/* Result */}
            {result && (
              <div className="bg-white rounded-lg shadow p-6">
                <CompositeResult
                  result={result}
                  onGenerateVideo={handleGenerateVideo}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

