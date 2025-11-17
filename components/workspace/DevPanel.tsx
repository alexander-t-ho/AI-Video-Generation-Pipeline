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
            {model.name} - {model.provider}{model.description ? ` • ${model.description}` : ''}
          </option>
        ))}
      </select>
      {selectedModel?.description && (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          {selectedModel.description}
        </p>
      )}
      {selectedModel?.supportedInputs && selectedModel.supportedInputs.length > 0 && (
        <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-600">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Supported Inputs:
          </p>
          <div className="flex flex-wrap gap-1">
            {selectedModel.supportedInputs.map((input) => (
              <span
                key={input}
                className="inline-block px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded font-mono"
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

        {/* Background Removal Toggle */}
        <div className="space-y-2">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Background Removal
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
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
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
              <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                {config.enableBackgroundRemoval !== false ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>
        </div>

        {/* Edge Cleanup Iterations */}
        {config.enableBackgroundRemoval !== false && (
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Edge Cleanup Iterations
              </label>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Number of edge cleanup passes after background removal (helps remove artifacts, 0-3)
              </p>
            </div>
            <select
              value={config.edgeCleanupIterations ?? 1}
              onChange={(e) => {
                const newConfig = { ...config, edgeCleanupIterations: parseInt(e.target.value, 10) };
                setConfig(newConfig);
                saveRuntimeConfig(newConfig);
              }}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-gray-900 dark:text-white"
            >
              <option value={0}>0 - No edge cleanup</option>
              <option value={1}>1 - Single pass (default)</option>
              <option value={2}>2 - Double pass</option>
              <option value={3}>3 - Triple pass</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 italic">
              More iterations may improve edge quality but increase processing time. Test different values to find the best balance.
            </p>
          </div>
        )}

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
