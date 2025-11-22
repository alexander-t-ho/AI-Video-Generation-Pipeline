'use client';

import { Download } from 'lucide-react';

interface ResultVideoProps {
  videoUrl: string;
  className?: string;
}

export default function ResultVideo({
  videoUrl,
  className = '',
}: ResultVideoProps) {
  const handleDownload = async () => {
    try {
      const response = await fetch(videoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `face-swap-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Failed to download video:', error);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Result Video</h3>
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      </div>

      <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
        <video
          src={videoUrl}
          controls
          className="w-full h-full"
        />
      </div>
    </div>
  );
}

