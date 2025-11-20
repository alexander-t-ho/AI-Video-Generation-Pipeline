'use client';

import { useState, Suspense } from 'react';
import SubjectReferenceSelector from '@/components/stylized/SubjectReferenceSelector';
import StyleSelector from '@/components/stylized/StyleSelector';
import PreviewGrid from '@/components/stylized/PreviewGrid';
import type { StylizedPreview } from '@/lib/types/stylized';
import { Loader2, Sparkles } from 'lucide-react';

function StylizedPreviewContent() {
  const [subjectImageUrl, setSubjectImageUrl] = useState<string>('');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [basePrompt, setBasePrompt] = useState<string>('');
  const [previews, setPreviews] = useState<StylizedPreview[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStyleToggle = (styleId: string) => {
    setSelectedStyles((prev) => {
      if (prev.includes(styleId)) {
        return prev.filter((id) => id !== styleId);
      } else {
        return [...prev, styleId];
      }
    });
  };

  const handleGenerate = async () => {
    // Validation
    if (!subjectImageUrl) {
      setError('Please select or upload a subject image');
      return;
    }

    if (selectedStyles.length === 0) {
      setError('Please select at least one directing style');
      return;
    }

    setError(null);
    setIsGenerating(true);
    setPreviews([]);

    try {
      const response = await fetch('/api/stylized-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subjectImageUrl,
          selectedStyles,
          basePrompt: basePrompt.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate previews');
      }

      if (data.previews) {
        setPreviews(data.previews);
      }
    } catch (err: any) {
      console.error('Error generating previews:', err);
      setError(err.message || 'Failed to generate previews');
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = subjectImageUrl && selectedStyles.length > 0 && !isGenerating;

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-8 h-8 text-white" />
            <h1 className="text-4xl font-bold">Stylized Preview Generator</h1>
          </div>
          <p className="text-white/60">
            Generate 5-second preview videos showcasing different directing styles. Upload a car image or select from an existing project, then choose styles to compare.
          </p>
        </div>

        {/* Subject Reference Selector */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Step 1: Select Subject Image</h2>
          <SubjectReferenceSelector
            onImageSelected={(url) => {
              setSubjectImageUrl(url);
              setError(null);
            }}
            selectedImageUrl={subjectImageUrl}
          />
        </div>

        {/* Style Selector */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Step 2: Choose Directing Styles</h2>
          <StyleSelector
            selectedStyles={selectedStyles}
            onStyleToggle={handleStyleToggle}
          />
        </div>

        {/* Optional Base Prompt */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Step 3: Base Prompt (Optional)</h2>
          <div>
            <label htmlFor="base-prompt" className="block text-sm font-medium text-white/80 mb-2">
              Custom Base Prompt
            </label>
            <textarea
              id="base-prompt"
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              placeholder="e.g., A luxury car driving through a scenic mountain road at sunset"
              className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent resize-y min-h-[100px]"
              rows={4}
            />
            <p className="mt-2 text-xs text-white/60">
              Leave empty to use the default automotive prompt. The selected styles will enhance this prompt automatically.
            </p>
          </div>
        </div>

        {/* Generate Button */}
        <div className="flex items-center justify-center">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className={`
              px-8 py-4 rounded-lg font-semibold text-lg transition-all flex items-center space-x-3
              ${
                canGenerate
                  ? 'bg-white text-black hover:bg-white/90'
                  : 'bg-white/20 text-white/40 cursor-not-allowed'
              }
            `}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating Previews...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate {selectedStyles.length} Preview{selectedStyles.length !== 1 ? 's' : ''}</span>
              </>
            )}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/50">
            <p className="text-red-400">Error: {error}</p>
          </div>
        )}

        {/* Preview Grid */}
        {previews.length > 0 && (
          <div className="space-y-4">
            <PreviewGrid previews={previews} />
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 p-6 rounded-lg border border-white/20 bg-white/5">
          <h3 className="text-lg font-semibold mb-3">About Stylized Previews</h3>
          <ul className="space-y-2 text-sm text-white/70">
            <li>• Each preview is 5 seconds long, showcasing a distinct directing style</li>
            <li>• Videos are generated sequentially to ensure quality and avoid rate limits</li>
            <li>• You can download any completed preview video</li>
            <li>• Styles are applied through enhanced prompts that capture each director's unique aesthetic</li>
            <li>• Generation time varies but typically takes 1-3 minutes per preview</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function StylizedPreviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    }>
      <StylizedPreviewContent />
    </Suspense>
  );
}

