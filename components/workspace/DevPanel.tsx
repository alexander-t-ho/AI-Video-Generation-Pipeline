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
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {description}
        </p>
      </div>
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white"
      >
        {options.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name} - {model.provider}
          </option>
        ))}
      </select>
      {selectedModel?.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          {selectedModel.description}
        </p>
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
    <div className="fixed inset-y-0 right-0 w-96 bg-white dark:bg-gray-800 shadow-xl border-l border-gray-200 dark:border-gray-700 flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Model Configuration
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-gray-600 dark:text-gray-400">
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
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={handleReset}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
