'use client';

import { type StylizedPreview } from '@/lib/types/stylized';
import { Loader2, Check, X, Download, Play } from 'lucide-react';
import { useState, useEffect } from 'react';

interface PreviewGridProps {
  previews: StylizedPreview[];
  className?: string;
}

export default function PreviewGrid({ previews, className = '' }: PreviewGridProps) {
  const [localPreviews, setLocalPreviews] = useState<StylizedPreview[]>(previews);

  // Update local state when previews prop changes
  useEffect(() => {
    setLocalPreviews(previews);
  }, [previews]);

  const handleDownload = (preview: StylizedPreview) => {
    if (!preview.videoUrl) return;

    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = preview.videoUrl;
    link.download = `${preview.styleName.toLowerCase().replace(/\s+/g, '-')}-preview.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (localPreviews.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Generated Previews
        </h3>
        <p className="text-sm text-white/60">
          {localPreviews.filter(p => p.status === 'completed').length} of {localPreviews.length} previews completed
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {localPreviews.map((preview) => {
          const isCompleted = preview.status === 'completed';
          const isProcessing = preview.status === 'processing';
          const isFailed = preview.status === 'failed';
          const isPending = preview.status === 'pending';

          return (
            <div
              key={preview.id}
              className="relative rounded-lg border border-white/20 bg-white/5 overflow-hidden"
            >
              {/* Video/Status Display */}
              <div className="relative aspect-video bg-black/50">
                {isCompleted && preview.videoUrl ? (
                  <>
                    <video
                      src={preview.videoUrl}
                      className="w-full h-full object-cover"
                      controls
                      loop
                      muted
                      playsInline
                    />
                    {/* Download Button */}
                    <button
                      onClick={() => handleDownload(preview)}
                      className="absolute top-2 right-2 p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors"
                      title="Download preview"
                    >
                      <Download className="w-4 h-4 text-white" />
                    </button>
                  </>
                ) : isProcessing ? (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white/60 animate-spin mb-2" />
                    <p className="text-sm text-white/60">Generating...</p>
                  </div>
                ) : isFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-4">
                    <X className="w-8 h-8 text-red-400 mb-2" />
                    <p className="text-sm text-red-400 text-center">Failed</p>
                    {preview.error && (
                      <p className="text-xs text-white/40 mt-1 text-center">{preview.error}</p>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Play className="w-8 h-8 text-white/40 mb-2" />
                    <p className="text-sm text-white/40">Pending</p>
                  </div>
                )}
              </div>

              {/* Preview Info */}
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-white">{preview.styleName}</h4>
                  {isCompleted && (
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/60 line-clamp-2">{preview.prompt}</p>
                {preview.completedAt && (
                  <p className="text-xs text-white/40">
                    Completed {new Date(preview.completedAt).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

