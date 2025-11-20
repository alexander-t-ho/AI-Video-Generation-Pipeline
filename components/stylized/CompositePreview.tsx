'use client';

import { Image as ImageIcon } from 'lucide-react';

interface CompositePreviewProps {
  carImageUrl?: string;
  backgroundImageUrl?: string;
  className?: string;
}

export default function CompositePreview({
  carImageUrl,
  backgroundImageUrl,
  className = '',
}: CompositePreviewProps) {
  if (!carImageUrl || !backgroundImageUrl) {
    return (
      <div className={`space-y-4 ${className}`}>
        <h3 className="text-lg font-semibold">Preview</h3>
        <div className="w-full h-64 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Upload car and background images to see preview
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <h3 className="text-lg font-semibold">Preview</h3>
      <div className="relative w-full h-64 rounded-lg overflow-hidden border-2 border-gray-300 bg-gray-100">
        {/* Background */}
        <img
          src={backgroundImageUrl}
          alt="Background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Car overlay (centered, scaled down) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={carImageUrl}
            alt="Car"
            className="max-w-[60%] max-h-[60%] object-contain drop-shadow-lg"
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 text-center">
        This is a preview. The final composite will have color-matched and styled car.
      </p>
    </div>
  );
}

