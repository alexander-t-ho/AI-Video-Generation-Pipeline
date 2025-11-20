'use client';

import { PRESET_STYLES, type PresetStyle } from '@/lib/types/stylized';
import { Check } from 'lucide-react';

interface StyleSelectorSingleProps {
  selectedStyle?: string;
  onStyleSelect: (styleId: string) => void;
  className?: string;
}

export default function StyleSelectorSingle({
  selectedStyle,
  onStyleSelect,
  className = '',
}: StyleSelectorSingleProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold mb-2">
          Select Directing Style
        </h3>
        <p className="text-sm text-gray-600">
          Choose a directing style to apply to the composite. The car will be color-matched to the background and styled accordingly.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRESET_STYLES.map((style) => {
          const isSelected = selectedStyle === style.id;
          return (
            <button
              key={style.id}
              onClick={() => onStyleSelect(style.id)}
              className={`
                relative p-4 rounded-lg border-2 transition-all text-left
                ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check className="w-4 h-4 text-white" />
                </div>
              )}

              {/* Style Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-900 text-lg">{style.name}</h4>
                <p className="text-sm text-gray-600">{style.description}</p>
                
                {/* Style Details */}
                <div className="pt-2 border-t border-gray-200 space-y-1">
                  {style.colorPalette && (
                    <div>
                      <span className="text-xs text-gray-500">Colors: </span>
                      <span className="text-xs text-gray-700">{style.colorPalette}</span>
                    </div>
                  )}
                  {style.cameraStyle && (
                    <div>
                      <span className="text-xs text-gray-500">Camera: </span>
                      <span className="text-xs text-gray-700">{style.cameraStyle}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedStyle && (
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">{PRESET_STYLES.find(s => s.id === selectedStyle)?.name}</span> style selected
          </p>
        </div>
      )}
    </div>
  );
}

