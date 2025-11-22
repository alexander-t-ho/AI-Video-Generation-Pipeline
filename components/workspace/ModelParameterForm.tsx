'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, AlertCircle, Info, X } from 'lucide-react';
import { ModelInputSchema, ModelParameters, ParameterValue, isParameterRequired, getParameterDefault, isParameterNullable, validateParameterValue } from '@/lib/types/model-schema';
import { getActiveModel } from '@/lib/config/model-runtime';
import { useProjectStore } from '@/lib/state/project-store';

interface ModelParameterFormProps {
  modelId?: string;
  initialParameters?: ModelParameters;
  onChange?: (parameters: ModelParameters) => void;
  disabled?: boolean;
  sceneIndex?: number;
}

/**
 * Dynamic form component that renders input fields based on a model's input schema
 */
export default function ModelParameterForm({
  modelId,
  initialParameters = {},
  onChange,
  disabled = false,
  sceneIndex,
}: ModelParameterFormProps) {
  const [schema, setSchema] = useState<ModelInputSchema | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parameters, setParameters] = useState<ModelParameters>(initialParameters);
  const [useSeedImage, setUseSeedImage] = useState(initialParameters.useSeedImage !== false); // Default to true

  // Get the effective model ID (use provided or get from runtime config)
  const effectiveModelId = modelId || getActiveModel('video');
  
  // Get scene state for image preview
  const { scenes, currentSceneIndex } = useProjectStore();
  const activeSceneIndex = sceneIndex ?? currentSceneIndex;
  const sceneState = scenes[activeSceneIndex];
  const selectedImage = sceneState?.selectedImageId
    ? sceneState.generatedImages?.find((img: any) => img.id === sceneState.selectedImageId)
    : sceneState?.generatedImages?.[0];

  // Fetch schema when model changes
  useEffect(() => {
    if (!effectiveModelId) {
      setSchema(null);
      setError(null);
      return;
    }

    const fetchSchema = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/models/${encodeURIComponent(effectiveModelId)}/schema`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to fetch model schema');
        }

        setSchema(data.schema);
        
        // Initialize parameters with defaults from schema
        const defaultParams: ModelParameters = { ...initialParameters };
        if (data.schema?.properties) {
          for (const [paramName, paramDef] of Object.entries(data.schema.properties)) {
            if (!(paramName in defaultParams)) {
              const defaultValue = getParameterDefault(paramName, data.schema);
              if (defaultValue !== undefined) {
                defaultParams[paramName] = defaultValue;
              }
            }
          }
        }
        
        // Initialize useSeedImage if not set (default to true)
        if (!('useSeedImage' in defaultParams)) {
          defaultParams.useSeedImage = true;
        }
        
        setParameters(defaultParams);
        onChange?.(defaultParams);
      } catch (err) {
        console.error('[ModelParameterForm] Error fetching schema:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch model schema');
        setSchema(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSchema();
  }, [effectiveModelId]);

  // Update parameters when initialParameters change externally
  useEffect(() => {
    if (initialParameters && Object.keys(initialParameters).length > 0) {
      setParameters(prev => ({ ...prev, ...initialParameters }));
      // Update useSeedImage state if it's in initialParameters
      if ('useSeedImage' in initialParameters) {
        setUseSeedImage(initialParameters.useSeedImage !== false);
      }
    }
  }, [initialParameters]);

  const handleParameterChange = useCallback((paramName: string, value: ParameterValue) => {
    setParameters(prev => {
      const updated = { ...prev, [paramName]: value };
      onChange?.(updated);
      return updated;
    });
  }, [onChange]);

  // Sort parameters by x-order if available
  const sortedParameters = schema?.properties ? Object.entries(schema.properties).sort((a, b) => {
    const orderA = a[1]['x-order'] ?? 999;
    const orderB = b[1]['x-order'] ?? 999;
    return orderA - orderB;
  }) : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-white/60">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading model parameters...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-400">Failed to load parameters</p>
          <p className="text-xs text-red-300/80 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!schema || sortedParameters.length === 0) {
    return (
      <div className="flex items-start gap-2 p-3 bg-white/5 border border-white/20 rounded-lg">
        <Info className="w-5 h-5 text-white/60 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm text-white/80">No custom parameters available</p>
          <p className="text-xs text-white/60 mt-1">This model uses default parameters only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Model Parameters</h3>
        <span className="text-xs text-white/60">{effectiveModelId}</span>
      </div>

      {/* Seed Image Control (I2I) */}
      <div className="space-y-2 pb-3 border-b border-white/10">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={useSeedImage}
                  onChange={(e) => {
                    const newValue = e.target.checked;
                    setUseSeedImage(newValue);
                    // Notify parent about seed image preference
                    const updatedParams = { 
                      ...parameters, 
                      useSeedImage: newValue 
                    };
                    onChange?.(updatedParams);
                  }}
                  disabled={disabled || !selectedImage}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-2 focus:ring-blue-400/40 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-xs font-medium text-white/90 group-hover:text-white transition-colors">
                  Use Seed Image (I2I)
                </span>
              </label>
              {selectedImage && useSeedImage && (
                <button
                  onClick={() => {
                    setUseSeedImage(false);
                    const updatedParams = { 
                      ...parameters, 
                      useSeedImage: false 
                    };
                    onChange?.(updatedParams);
                  }}
                  disabled={disabled}
                  className="ml-auto px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded border border-red-400/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  title="Deselect seed image"
                >
                  <X className="w-3 h-3" />
                  Deselect
                </button>
              )}
            </div>
            <p className="text-xs text-white/50">
              {useSeedImage 
                ? 'Using selected image as reference for image-to-image generation' 
                : 'Disabled - using pure text-to-image generation'}
            </p>
          </div>
        </div>

        {/* Seed Image Preview */}
        {useSeedImage && selectedImage && (
          <div className="bg-black/40 rounded-lg p-2 border border-green-500/30">
            <div className="flex items-start gap-2">
              {selectedImage.localPath && (
                <img
                  src={`/api/serve-image?path=${encodeURIComponent(selectedImage.localPath)}`}
                  alt="Seed image"
                  className="h-16 w-auto rounded border border-green-400/40 object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-300 text-xs rounded-full border border-green-400/30">
                    ✓ Active Seed
                  </span>
                </div>
                <p className="text-xs text-white/60 truncate">
                  {selectedImage.url}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No Image Warning */}
        {!selectedImage && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
            <p className="text-xs text-yellow-300">
              ⚠️ No image generated yet. Generate an image first to use as seed.
            </p>
          </div>
        )}

        {/* Disabled State */}
        {!useSeedImage && selectedImage && (
          <div className="bg-white/5 border border-white/10 rounded-lg p-2">
            <p className="text-xs text-white/60">
              ℹ️ Seed image deselected - using pure text-to-image generation
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">{sortedParameters.map(([paramName, paramDef]) => {
          const isRequired = isParameterRequired(paramName, schema);
          const isNull = isParameterNullable(paramName, schema);
          const currentValue = parameters[paramName];
          const defaultValue = getParameterDefault(paramName, schema);
          
          // Skip rendering if value is null and parameter is nullable (unless it's required)
          if (currentValue === null && !isRequired && isNull) {
            return null;
          }

          return (
            <div key={paramName} className="space-y-1.5">
              <label className="block text-xs font-medium text-white/90">
                {paramDef.title || paramName}
                {isRequired && <span className="text-red-400 ml-1">*</span>}
              </label>
              
              {paramDef.description && (
                <p className="text-xs text-white/60">{paramDef.description}</p>
              )}

              {/* Render appropriate input based on type */}
              {renderParameterInput(
                paramName,
                paramDef,
                currentValue ?? defaultValue,
                isRequired,
                disabled,
                handleParameterChange
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Render the appropriate input field for a parameter
 */
function renderParameterInput(
  paramName: string,
  paramDef: any,
  value: ParameterValue,
  isRequired: boolean,
  disabled: boolean,
  onChange: (paramName: string, value: ParameterValue) => void
) {
  const paramType = Array.isArray(paramDef.type) 
    ? paramDef.type.filter((t: string) => t !== 'null')[0] 
    : paramDef.type;

  // Enum/Select dropdown
  if (paramDef.enum && paramDef.enum.length > 0) {
    return (
      <select
        value={value as string || ''}
        onChange={(e) => onChange(paramName, e.target.value || null)}
        disabled={disabled}
        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {!isRequired && <option value="">-- Not set --</option>}
        {paramDef.enum.map((option: any) => (
          <option key={option} value={option} className="bg-black text-white">
            {String(option)}
          </option>
        ))}
      </select>
    );
  }

  // Boolean/Checkbox
  if (paramType === 'boolean') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(paramName, e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-white/20 bg-white/5 text-white focus:ring-2 focus:ring-white/40 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <span className="text-xs text-white/80">
          {value === true ? 'Enabled' : 'Disabled'}
        </span>
      </label>
    );
  }

  // Number/Integer
  if (paramType === 'number' || paramType === 'integer') {
    return (
      <input
        type="number"
        value={value as number ?? ''}
        onChange={(e) => {
          const numValue = e.target.value === '' ? null : Number(e.target.value);
          onChange(paramName, numValue);
        }}
        min={paramDef.minimum}
        max={paramDef.maximum}
        step={paramType === 'integer' ? 1 : undefined}
        disabled={disabled}
        placeholder={paramDef.default !== undefined ? String(paramDef.default) : undefined}
        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    );
  }

  // Array (for reference_images, etc.)
  if (paramType === 'array') {
    const arrayValue = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {arrayValue.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const newArray = [...arrayValue];
                newArray[index] = e.target.value;
                onChange(paramName, newArray);
              }}
              disabled={disabled}
              placeholder="Image URL"
              className="flex-1 px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => {
                const newArray = arrayValue.filter((_, i) => i !== index);
                onChange(paramName, newArray.length > 0 ? newArray : null);
              }}
              disabled={disabled}
              className="px-3 py-2 text-sm bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            const newArray = [...arrayValue, ''];
            onChange(paramName, newArray);
          }}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm bg-white/5 text-white/80 rounded-lg hover:bg-white/10 border border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          + Add Item
        </button>
      </div>
    );
  }

  // String/Text (default)
  // Handle URI format specially
  if (paramDef.format === 'uri') {
    return (
      <input
        type="url"
        value={value as string || ''}
        onChange={(e) => onChange(paramName, e.target.value || null)}
        disabled={disabled}
        placeholder={paramDef.default || 'https://...'}
        className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
      />
    );
  }

  // Default text input
  return (
    <input
      type="text"
      value={value as string || ''}
      onChange={(e) => onChange(paramName, e.target.value || null)}
      disabled={disabled}
      placeholder={paramDef.default || paramDef.description}
      className="w-full px-3 py-2 text-sm bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

