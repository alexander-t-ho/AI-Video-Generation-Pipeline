'use client';

import { PRESET_STYLES, type PresetStyle } from '@/lib/types/stylized';
import { Check } from 'lucide-react';

interface StyleSelectorProps {
  selectedStyles: string[];
  onStyleToggle: (styleId: string) => void;
  className?: string;
}

export default function StyleSelector({
  selectedStyles,
  onStyleToggle,
  className = '',
}: StyleSelectorProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">
          Select Directing Styles
        </h3>
        <p className="text-sm text-white/60">
          Choose one or more styles to generate preview videos. Each style will create a unique 5-second preview.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PRESET_STYLES.map((style) => {
          const isSelected = selectedStyles.includes(style.id);
          return (
            <button
              key={style.id}
              onClick={() => onStyleToggle(style.id)}
              className={`
                relative p-4 rounded-lg border-2 transition-all text-left
                ${
                  isSelected
                    ? 'border-white bg-white/10 ring-2 ring-white/50'
                    : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
                }
              `}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center">
                  <Check className="w-4 h-4 text-black" />
                </div>
              )}

              {/* Style Info */}
              <div className="space-y-2">
                <h4 className="font-semibold text-white text-lg">{style.name}</h4>
                <p className="text-sm text-white/70">{style.description}</p>
                
                {/* Style Details */}
                <div className="pt-2 border-t border-white/10 space-y-1">
                  {style.colorPalette && (
                    <div>
                      <span className="text-xs text-white/50">Colors: </span>
                      <span className="text-xs text-white/70">{style.colorPalette}</span>
                    </div>
                  )}
                  {style.cameraStyle && (
                    <div>
                      <span className="text-xs text-white/50">Camera: </span>
                      <span className="text-xs text-white/70">{style.cameraStyle}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedStyles.length > 0 && (
        <div className="p-3 rounded-lg bg-white/5 border border-white/20">
          <p className="text-sm text-white/80">
            <span className="font-semibold">{selectedStyles.length}</span> style{selectedStyles.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}
    </div>
  );
}

