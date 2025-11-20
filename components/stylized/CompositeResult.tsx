'use client';

import { useState } from 'react';
import { Download, Video, Loader2 } from 'lucide-react';
import { CompositingResult } from '@/lib/types/stylized';

interface CompositeResultProps {
  result: CompositingResult;
  onGenerateVideo?: (compositeImageUrl: string, styleId: string) => void;
  className?: string;
}

export default function CompositeResult({
  result,
  onGenerateVideo,
  className = '',
}: CompositeResultProps) {
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const handleDownload = () => {
    if (result.compositeImageUrl) {
      const link = document.createElement('a');
      link.href = result.compositeImageUrl;
      link.download = `composite-${result.id}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleGenerateVideo = async () => {
    if (!onGenerateVideo || !result.compositeImageUrl) return;

    setIsGeneratingVideo(true);
    try {
      await onGenerateVideo(result.compositeImageUrl, result.styleId);
    } catch (error) {
      console.error('Failed to generate video:', error);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  if (result.status === 'processing') {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-lg font-semibold">Generating Composite</h3>
        <div className="w-full h-64 rounded-lg border-2 border-gray-300 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-600">Processing...</p>
          </div>
        </div>
      </div>
    );
  }

  if (result.status === 'failed') {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-lg font-semibold text-red-600">Generation Failed</h3>
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{result.error || 'Unknown error occurred'}</p>
        </div>
      </div>
    );
  }

  if (result.status === 'completed' && result.compositeImageUrl) {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Composite Result</h3>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            {onGenerateVideo && (
              <button
                onClick={handleGenerateVideo}
                disabled={isGeneratingVideo}
                className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingVideo ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Video className="w-4 h-4" />
                    Generate Video
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="relative w-full rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100">
          <img
            src={result.compositeImageUrl}
            alt="Composite result"
            className="w-full h-auto"
          />
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold text-gray-700">Style: </span>
              <span className="text-gray-600">{result.styleName}</span>
            </div>
            {result.completedAt && (
              <div>
                <span className="font-semibold text-gray-700">Completed: </span>
                <span className="text-gray-600">
                  {new Date(result.completedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

