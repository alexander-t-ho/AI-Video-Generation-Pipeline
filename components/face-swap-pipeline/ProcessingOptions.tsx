'use client';

import { useState } from 'react';
import { ProcessingOptions as ProcessingOptionsType } from '@/lib/types/face-swap-pipeline';

interface ProcessingOptionsProps {
  options: ProcessingOptionsType;
  onOptionsChange: (options: ProcessingOptionsType) => void;
  className?: string;
}

export default function ProcessingOptions({
  options,
  onOptionsChange,
  className = '',
}: ProcessingOptionsProps) {
  const updateOption = <K extends keyof ProcessingOptionsType>(
    key: K,
    value: ProcessingOptionsType[K]
  ) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <h3 className="text-lg font-semibold text-white">Processing Options</h3>

      {/* Frame Extraction */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white/80">Frame Extraction</h4>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.processKeyFramesOnly || false}
              onChange={(e) => updateOption('processKeyFramesOnly', e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
            />
            <span className="text-white/80 text-sm">Process key frames only</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/60 mb-1">Extract every N frames</label>
              <input
                type="number"
                min="1"
                value={options.frameExtractionRate || ''}
                onChange={(e) => updateOption('frameExtractionRate', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm"
                placeholder="e.g., 30"
              />
            </div>
            <div>
              <label className="block text-xs text-white/60 mb-1">Extract every N seconds</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={options.extractByTimeInterval || ''}
                onChange={(e) => updateOption('extractByTimeInterval', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm"
                placeholder="e.g., 1.0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Processing Features */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white/80">Processing Features</h4>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.enableFaceSwap || false}
              onChange={(e) => updateOption('enableFaceSwap', e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
            />
            <span className="text-white/80 text-sm">Enable face swapping</span>
          </label>

          {options.enableFaceSwap && (
            <div className="ml-6">
              <label className="block text-xs text-white/60 mb-1">Face swap model</label>
              <select
                value={options.faceSwapModel || 'simple'}
                onChange={(e) => updateOption('faceSwapModel', e.target.value as 'simple' | 'advanced')}
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm"
              >
                <option value="simple">Simple (Fast)</option>
                <option value="advanced">Advanced (High Quality)</option>
              </select>
            </div>
          )}

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.enablePersonReplacement || false}
              onChange={(e) => updateOption('enablePersonReplacement', e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
            />
            <span className="text-white/80 text-sm">Enable person replacement</span>
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.enableCarReplacement || false}
              onChange={(e) => updateOption('enableCarReplacement', e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
            />
            <span className="text-white/80 text-sm">Enable car replacement</span>
          </label>
        </div>
      </div>

      {/* Enhancement */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white/80">Enhancement</h4>
        
        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={options.enableEnhancement || false}
              onChange={(e) => updateOption('enableEnhancement', e.target.checked)}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
            />
            <span className="text-white/80 text-sm">Enable enhancement</span>
          </label>

          {options.enableEnhancement && (
            <div className="ml-6 space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={options.enableUpscaling || false}
                  onChange={(e) => updateOption('enableUpscaling', e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500"
                />
                <span className="text-white/80 text-sm">Enable upscaling</span>
              </label>

              {options.enableUpscaling && (
                <div>
                  <label className="block text-xs text-white/60 mb-1">Upscaling model</label>
                  <select
                    value={options.upscalingModel || 'real-esrgan'}
                    onChange={(e) => updateOption('upscalingModel', e.target.value as 'real-esrgan' | 'realesrgan')}
                    className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm"
                  >
                    <option value="real-esrgan">Real-ESRGAN</option>
                    <option value="realesrgan">RealESRGAN</option>
                  </select>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

