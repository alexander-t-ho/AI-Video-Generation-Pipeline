'use client';

import { useState, useEffect } from 'react';
import { Palette, X, Check } from 'lucide-react';

interface ColorPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onColorSelect: (color: string) => void;
  presetColors?: string[]; // Colors available for this car
  selectedColor?: string;
}

const MAX_RECENT_COLORS = 10;
const RECENT_COLORS_KEY = 'brand-identity-recent-colors';

export default function ColorPicker({
  isOpen,
  onClose,
  onColorSelect,
  presetColors = [],
  selectedColor
}: ColorPickerProps) {
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState('#000000');

  // Load recent colors from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(RECENT_COLORS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentColors(parsed);
        }
      } catch (e) {
        console.warn('Failed to parse recent colors from localStorage');
      }
    }
  }, []);

  // Save recent colors to localStorage
  const saveRecentColors = (colors: string[]) => {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(colors));
    setRecentColors(colors);
  };

  // Handle color selection
  const handleColorSelect = (color: string) => {
    // Add to recent colors (remove duplicates, keep most recent first)
    const newRecentColors = [color, ...recentColors.filter(c => c !== color)].slice(0, MAX_RECENT_COLORS);
    saveRecentColors(newRecentColors);

    onColorSelect(color);
    onClose();
  };

  // Handle custom color picker change
  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
  };

  const handleCustomColorSubmit = () => {
    handleColorSelect(customColor);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/10 border border-white/20 rounded-3xl backdrop-blur-sm p-6 w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 text-white" />
            <h3 className="text-lg font-medium text-white">Change Color</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Colors */}
        {presetColors.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-white/80 mb-3">Available Colors</h4>
            <div className="grid grid-cols-6 gap-3">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 ${
                    selectedColor === color
                      ? 'border-white shadow-lg shadow-white/20'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  {selectedColor === color && (
                    <Check className="w-5 h-5 text-white drop-shadow-lg" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recent Colors */}
        {recentColors.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-white/80 mb-3">Recent Colors</h4>
            <div className="grid grid-cols-6 gap-3">
              {recentColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all hover:scale-110 ${
                    selectedColor === color
                      ? 'border-white shadow-lg shadow-white/20'
                      : 'border-white/20 hover:border-white/40'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                >
                  {selectedColor === color && (
                    <Check className="w-5 h-5 text-white drop-shadow-lg" />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Custom Color Picker */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-white/80 mb-3">Custom Color</h4>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="w-12 h-10 rounded-lg border border-white/20 cursor-pointer"
            />
            <span className="text-white/80 text-sm font-mono">{customColor.toUpperCase()}</span>
            <button
              onClick={handleCustomColorSubmit}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-white text-sm transition-all"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center">
          <button
            onClick={onClose}
            className="px-6 py-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}




