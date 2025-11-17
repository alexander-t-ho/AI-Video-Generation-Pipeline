'use client';

import { useState, useEffect } from 'react';
import { Settings, X, RotateCcw } from 'lucide-react';
import {
  AVAILABLE_TEXT_MODELS,
  AVAILABLE_T2I_MODELS,
  AVAILABLE_I2I_MODELS,
  AVAILABLE_VIDEO_MODELS,
  ModelOption,
} from '@/lib/config/ai-models';
import {
  getRuntimeConfig,
  saveRuntimeConfig,
  resetRuntimeConfig,
  RuntimeModelConfig,
  ModelCategory,
} from '@/lib/config/model-runtime';

interface ModelSelectorProps {
  label: string;
  description: string;
  category: ModelCategory;
  options: ModelOption[];
  selectedId: string;
  onChange: (modelId: string) => void;
}

function ModelSelector({ label, description, category, options, selectedId, onChange }: ModelSelectorProps) {
  const selectedModel = options.find(m => m.id === selectedId);

  return (
    <div className="space-y-2">
      <div>
        <label className="text-sm font-medium text-white">
          {label}
        </label>
        <p className="text-xs text-white/60 mt-0.5">
          {description}
        </p>
      </div>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm"
      >
        {options.map((model) => (
          <option key={model.id} value={model.id} className="bg-black text-white">
            {model.name} - {model.provider}{model.description ? ` • ${model.description}` : ''}
          </option>
        ))}
      </select>
      {selectedModel?.description && (
        <p className="text-xs text-white/60 italic">
          {selectedModel.description}
        </p>
      )}
      {selectedModel?.supportedInputs && selectedModel.supportedInputs.length > 0 && (
        <div className="mt-2 p-2 bg-white/5 rounded border border-white/20 backdrop-blur-sm">
          <p className="text-xs font-medium text-white/80 mb-1">
            Supported Inputs:
          </p>
          <div className="flex flex-wrap gap-1">
            {selectedModel.supportedInputs.map((input) => (
              <span
                key={input}
                className="inline-block px-2 py-0.5 text-xs bg-white/10 text-white rounded font-mono border border-white/20"
              >
                {input}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface DevPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DevPanel({ isOpen, onClose }: DevPanelProps) {
  const [config, setConfig] = useState<RuntimeModelConfig>(getRuntimeConfig());

  // Load config on mount
  useEffect(() => {
    setConfig(getRuntimeConfig());
  }, []);

  const handleModelChange = (category: ModelCategory, modelId: string) => {
    const newConfig = { ...config, [category]: modelId };
    setConfig(newConfig);
    saveRuntimeConfig(newConfig);
  };

  const handleReset = () => {
    resetRuntimeConfig();
    setConfig(getRuntimeConfig());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-black shadow-xl border-l border-white/20 flex flex-col z-50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-white" />
          <h2 className="text-lg font-semibold text-white">
            Model Configuration
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-white/60">
            Select AI models for each generation stage. Changes apply immediately.
          </p>
        </div>

        {/* Text Model */}
        <ModelSelector
          label="Text Model"
          description="For generating storyboards from prompts"
          category="text"
          options={AVAILABLE_TEXT_MODELS}
          selectedId={config.text}
          onChange={(modelId) => handleModelChange('text', modelId)}
        />

        {/* T2I Model */}
        <ModelSelector
          label="Text-to-Image (T2I)"
          description="For generating images from text prompts"
          category="t2i"
          options={AVAILABLE_T2I_MODELS}
          selectedId={config.t2i}
          onChange={(modelId) => handleModelChange('t2i', modelId)}
        />

        {/* I2I Model */}
        <ModelSelector
          label="Image-to-Image (I2I)"
          description="For transforming images with reference images"
          category="i2i"
          options={AVAILABLE_I2I_MODELS}
          selectedId={config.i2i}
          onChange={(modelId) => handleModelChange('i2i', modelId)}
        />

        {/* Background Removal Toggle */}
        <div className="space-y-2">
          <div>
            <label className="text-sm font-medium text-white">
              Background Removal
            </label>
            <p className="text-xs text-white/60 mt-0.5">
              Automatically remove backgrounds from uploaded reference images (2 iterations)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enableBackgroundRemoval !== false}
                onChange={(e) => {
                  const newConfig = { ...config, enableBackgroundRemoval: e.target.checked };
                  setConfig(newConfig);
                  saveRuntimeConfig(newConfig);
                }}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-white/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/40 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-white/40"></div>
              <span className="ml-3 text-sm text-white/80">
                {config.enableBackgroundRemoval !== false ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        {/* Video Model */}
        <ModelSelector
          label="Video Model"
          description="For generating videos from images"
          category="video"
          options={AVAILABLE_VIDEO_MODELS}
          selectedId={config.video}
          onChange={(modelId) => handleModelChange('video', modelId)}
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/20">
        <button
          onClick={handleReset}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-white/5 text-white/80 rounded-lg hover:bg-white/10 border border-white/20 transition-colors backdrop-blur-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
