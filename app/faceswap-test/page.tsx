'use client';

import { useState } from 'react';
import { Upload, Download, ArrowLeft, X, RefreshCw, ChevronDown, ChevronUp, User } from 'lucide-react';
import Link from 'next/link';

interface ApiCallLog {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  data: Record<string, unknown>;
}

const MODELS = {
  simple: {
    id: 'codeplugtech/face-swap',
    name: 'Simple Face Swap',
    description: 'Fast and cost-efficient (~$0.003/run, ~29s)',
  },
  advanced: {
    id: 'easel/advanced-face-swap',
    name: 'Advanced Face Swap',
    description: 'Commercial-grade quality with more options',
  },
} as const;

type ModelType = keyof typeof MODELS;

const GENDER_OPTIONS = ['a man', 'a woman'] as const;
type Gender = typeof GENDER_OPTIONS[number];

const HAIR_SOURCE_OPTIONS = ['user', 'target'] as const;
type HairSource = typeof HAIR_SOURCE_OPTIONS[number];

const RESTORATION_METHODS = ['codeformer', 'gfpgan'] as const;
type RestorationMethod = typeof RESTORATION_METHODS[number];

export default function FaceSwapTestPage() {
  // Images
  const [targetImage, setTargetImage] = useState<{ file: File; preview: string } | null>(null);
  const [swapImage, setSwapImage] = useState<{ file: File; preview: string } | null>(null);
  const [swapImageB, setSwapImageB] = useState<{ file: File; preview: string } | null>(null);

  // Model selection
  const [model, setModel] = useState<ModelType>('simple');

  // Advanced options (for easel/advanced-face-swap)
  const [userGender, setUserGender] = useState<Gender>('a woman');
  const [userBGender, setUserBGender] = useState<Gender>('a woman');
  const [hairSource, setHairSource] = useState<HairSource>('user');
  const [upscale, setUpscale] = useState(true);
  const [detailer, setDetailer] = useState(false);

  // Face restoration options
  const [enableRestoration, setEnableRestoration] = useState(false);
  const [restorationMethod, setRestorationMethod] = useState<RestorationMethod>('codeformer');
  const [fidelity, setFidelity] = useState(0.7);
  const [restorationUpscale, setRestorationUpscale] = useState(2);

  // State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'swapping' | 'restoring' | 'complete'>('idle');
  const [swappedImage, setSwappedImage] = useState<string>('');
  const [restoredImage, setRestoredImage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [showApiLogs, setShowApiLogs] = useState(true);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);

  const addApiLog = (type: ApiCallLog['type'], data: Record<string, unknown>) => {
    setApiLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      data
    }]);
  };

  const handleImageSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<{ file: File; preview: string } | null>>
  ) => {
    const file = e.target.files?.[0];
    
    if (!file) {
      console.log('[FaceSwap] No file selected');
      return;
    }

    console.log('[FaceSwap] File selected:', {
      name: file.name,
      type: file.type,
      size: file.size,
      isImage: file.type.startsWith('image/'),
    });

    // Check if it's an image file
    if (!file.type.startsWith('image/')) {
      const errorMsg = `Invalid file type: ${file.type}. Please select an image file.`;
      console.error('[FaceSwap]', errorMsg);
      setError(errorMsg);
      e.target.value = '';
      return;
    }

    try {
      const preview = URL.createObjectURL(file);
      console.log('[FaceSwap] Preview URL created:', preview);
      setter({ file, preview });
      setError('');
    } catch (error) {
      console.error('[FaceSwap] Error creating preview:', error);
      setError('Failed to load image preview. Please try again.');
    }
    
    // Reset the input value so the same file can be selected again
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!targetImage || !swapImage) {
      setError('Please provide both a target image and a face image to swap');
      return;
    }

    setIsGenerating(true);
    setGenerationPhase('swapping');
    setError('');
    setSwappedImage('');
    setRestoredImage('');
    setApiLogs([]);

    try {
      const formData = new FormData();
      formData.append('targetImage', targetImage.file);
      formData.append('swapImage', swapImage.file);
      formData.append('model', model);

      if (model === 'advanced') {
        if (swapImageB) {
          formData.append('swapImageB', swapImageB.file);
        }
        formData.append('userGender', userGender);
        formData.append('userBGender', userBGender);
        formData.append('hairSource', hairSource);
        formData.append('upscale', upscale.toString());
        formData.append('detailer', detailer.toString());
      }

      // Add restoration parameters
      formData.append('enableRestoration', enableRestoration.toString());
      if (enableRestoration) {
        formData.append('restorationMethod', restorationMethod);
        formData.append('fidelity', fidelity.toString());
        formData.append('restorationUpscale', restorationUpscale.toString());
      }

      // Log the request
      const requestData: Record<string, unknown> = {
        endpoint: '/api/faceswap-test/generate',
        method: 'POST',
        model: MODELS[model].id,
        targetImage: targetImage.file.name,
        swapImage: swapImage.file.name,
        enableRestoration,
      };

      if (model === 'advanced') {
        requestData.swapImageB = swapImageB?.file.name || '(none)';
        requestData.userGender = userGender;
        requestData.userBGender = userBGender;
        requestData.hairSource = hairSource;
        requestData.upscale = upscale;
        requestData.detailer = detailer;
      }

      if (enableRestoration) {
        requestData.restorationMethod = restorationMethod;
        requestData.fidelity = fidelity;
        requestData.restorationUpscale = restorationUpscale;
      }

      addApiLog('request', requestData);

      // Update phase if restoration is enabled
      if (enableRestoration) {
        // We can't know exactly when the API transitions, so we'll show swapping first
        // The API handles both phases sequentially
      }

      const response = await fetch('/api/faceswap-test/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        addApiLog('error', {
          status: response.status,
          statusText: response.statusText,
          error: data.error || 'Unknown error',
        });
        throw new Error(data.error || 'Failed to generate image');
      }

      addApiLog('response', {
        status: response.status,
        success: data.success,
        swappedImageUrl: data.swappedImageUrl,
        restoredImageUrl: data.restoredImageUrl,
        predictionId: data.predictionId,
        restorationPredictionId: data.restorationPredictionId,
        restorationMethod: data.restorationMethod,
      });

      if (data.success && data.swappedImageUrl) {
        setSwappedImage(data.swappedImageUrl);
        if (data.restoredImageUrl) {
          setRestoredImage(data.restoredImageUrl);
        }
        setGenerationPhase('complete');
      } else {
        throw new Error(data.error || 'No image URL returned');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during generation';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
      setGenerationPhase('idle');
    }
  };

  const handleDownload = async (imageUrl: string, suffix: string = '') => {
    if (!imageUrl) return;

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `faceswap${suffix}-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleModelChange = (newModel: ModelType) => {
    setModel(newModel);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-black to-gray-900 text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <h1 className="text-4xl font-light mb-2">Face Swap</h1>
        <p className="text-white/60">Swap faces between images using AI-powered face detection and transfer</p>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Model Selection */}
          <div className="bg-white/5 border border-purple-500/20 rounded-xl p-5">
            <h3 className="text-lg font-medium mb-3">Model</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleModelChange('simple')}
                className={`p-3 rounded-lg text-left transition-all ${
                  model === 'simple'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="font-medium text-sm">{MODELS.simple.name}</div>
                <div className={`text-xs mt-1 ${model === 'simple' ? 'text-white/80' : 'text-white/40'}`}>
                  {MODELS.simple.description}
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleModelChange('advanced')}
                className={`p-3 rounded-lg text-left transition-all ${
                  model === 'advanced'
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="font-medium text-sm">{MODELS.advanced.name}</div>
                <div className={`text-xs mt-1 ${model === 'advanced' ? 'text-white/80' : 'text-white/40'}`}>
                  {MODELS.advanced.description}
                </div>
              </button>
            </div>
          </div>

          {/* Image Uploads */}
          <div className="bg-white/5 border border-purple-500/20 rounded-xl p-5 space-y-4">
            <h3 className="text-lg font-medium">Images</h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Target Image */}
              <div>
                <div className="block text-sm font-medium mb-2">
                  Target Image <span className="text-red-400">*</span>
                </div>
                <p className="text-white/40 text-xs mb-3">The image to swap faces onto</p>

                {targetImage ? (
                  <div className="relative group">
                    <img
                      src={targetImage.preview}
                      alt="Target"
                      className="w-full h-48 object-contain rounded-lg border border-purple-500/30 bg-black/20"
                    />
                    <button
                      type="button"
                      onClick={() => setTargetImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-purple-500/30 rounded-lg p-6 hover:border-purple-500/50 transition-all cursor-pointer bg-purple-500/5 flex flex-col items-center justify-center h-48">
                    <Upload className="w-8 h-8 text-purple-500/40 mb-2" />
                    <span className="text-white/40 text-sm">Click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setTargetImage)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {/* Swap Image */}
              <div>
                <div className="block text-sm font-medium mb-2">
                  Face Image <span className="text-red-400">*</span>
                </div>
                <p className="text-white/40 text-xs mb-3">The face to swap from</p>

                {swapImage ? (
                  <div className="relative group">
                    <img
                      src={swapImage.preview}
                      alt="Face"
                      className="w-full h-48 object-contain rounded-lg border border-purple-500/30 bg-black/20"
                    />
                    <button
                      type="button"
                      onClick={() => setSwapImage(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-purple-500/30 rounded-lg p-6 hover:border-purple-500/50 transition-all cursor-pointer bg-purple-500/5 flex flex-col items-center justify-center h-48">
                    <Upload className="w-8 h-8 text-purple-500/40 mb-2" />
                    <span className="text-white/40 text-sm">Click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setSwapImage)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Second face for advanced model */}
            {model === 'advanced' && (
              <div>
                <div className="block text-sm font-medium mb-2">
                  Second Face Image <span className="text-white/40 text-xs ml-2">(Optional)</span>
                </div>
                <p className="text-white/40 text-xs mb-3">Optional second face for multi-person swaps</p>

                {swapImageB ? (
                  <div className="relative group">
                    <img
                      src={swapImageB.preview}
                      alt="Second Face"
                      className="w-full h-48 object-contain rounded-lg border border-purple-500/30 bg-black/20"
                    />
                    <button
                      type="button"
                      onClick={() => setSwapImageB(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-purple-500/30 rounded-lg p-6 hover:border-purple-500/50 transition-all cursor-pointer bg-purple-500/5 flex flex-col items-center justify-center h-48">
                    <Upload className="w-8 h-8 text-purple-500/40 mb-2" />
                    <span className="text-white/40 text-sm">Click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageSelect(e, setSwapImageB)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          {/* Advanced Options (for advanced model) */}
          {model === 'advanced' && (
            <div className="bg-white/5 border border-purple-500/20 rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
              >
                <h3 className="text-lg font-medium">Advanced Options</h3>
                {showAdvancedOptions ? (
                  <ChevronUp className="w-5 h-5 text-white/40" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-white/40" />
                )}
              </button>

              {showAdvancedOptions && (
                <div className="px-5 pb-5 space-y-4">
                  {/* Gender Selection */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-white/60 mb-2">User Gender</label>
                      <div className="flex gap-2">
                        {GENDER_OPTIONS.map((option) => (
                          <button
                            type="button"
                            key={option}
                            onClick={() => setUserGender(option)}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                              userGender === option
                                ? 'bg-purple-500 text-white'
                                : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm text-white/60 mb-2">Second User Gender</label>
                      <div className="flex gap-2">
                        {GENDER_OPTIONS.map((option) => (
                          <button
                            type="button"
                            key={option}
                            onClick={() => setUserBGender(option)}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                              userBGender === option
                                ? 'bg-purple-500 text-white'
                                : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Hair Source */}
                  <div>
                    <label className="block text-sm text-white/60 mb-2">Hair Source</label>
                    <div className="flex gap-2">
                      {HAIR_SOURCE_OPTIONS.map((option) => (
                        <button
                          type="button"
                          key={option}
                          onClick={() => setHairSource(option)}
                          className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                            hairSource === option
                              ? 'bg-purple-500 text-white'
                              : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {option === 'user' ? 'From Face Image' : 'From Target'}
                        </button>
                      ))}
                    </div>
                    <p className="text-white/40 text-xs mt-2">Choose whose hairstyle to preserve</p>
                  </div>

                  {/* Toggles */}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={upscale}
                        onChange={(e) => setUpscale(e.target.checked)}
                        className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                      />
                      <div>
                        <div className="text-sm font-medium">Upscale 2x</div>
                        <div className="text-white/40 text-xs">Boost quality</div>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={detailer}
                        onChange={(e) => setDetailer(e.target.checked)}
                        className="w-5 h-5 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                      />
                      <div>
                        <div className="text-sm font-medium">Detailer (Beta)</div>
                        <div className="text-white/40 text-xs">Improve details</div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Face Restoration Options */}
          <div className="bg-white/5 border border-purple-500/20 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">Face Restoration</h3>
                <p className="text-white/40 text-sm">Enhance face quality after swap</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableRestoration}
                  onChange={(e) => setEnableRestoration(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
              </label>
            </div>

            {enableRestoration && (
              <div className="space-y-4 pt-2">
                {/* Restoration Method */}
                <div>
                  <label className="block text-sm text-white/60 mb-2">Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRestorationMethod('codeformer')}
                      className={`p-3 rounded-lg text-left transition-all ${
                        restorationMethod === 'codeformer'
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-medium text-sm">CodeFormer</div>
                      <div className={`text-xs mt-1 ${restorationMethod === 'codeformer' ? 'text-white/80' : 'text-white/40'}`}>
                        Better quality, more control
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRestorationMethod('gfpgan')}
                      className={`p-3 rounded-lg text-left transition-all ${
                        restorationMethod === 'gfpgan'
                          ? 'bg-purple-500 text-white'
                          : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-medium text-sm">GFPGAN</div>
                      <div className={`text-xs mt-1 ${restorationMethod === 'gfpgan' ? 'text-white/80' : 'text-white/40'}`}>
                        Faster, good quality
                      </div>
                    </button>
                  </div>
                </div>

                {/* Fidelity Slider (CodeFormer only) */}
                {restorationMethod === 'codeformer' && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm text-white/60">Fidelity</label>
                      <span className="text-sm text-purple-400 font-mono">{fidelity.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.1"
                      value={fidelity}
                      onChange={(e) => setFidelity(parseFloat(e.target.value))}
                      className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    />
                    <div className="flex justify-between text-xs text-white/40 mt-1">
                      <span>Quality</span>
                      <span>Identity</span>
                    </div>
                  </div>
                )}

                {/* Upscale Factor */}
                <div>
                  <label className="block text-sm text-white/60 mb-2">Upscale Factor</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((scale) => (
                      <button
                        type="button"
                        key={scale}
                        onClick={() => setRestorationUpscale(scale)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          restorationUpscale === scale
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Generate Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!targetImage || !swapImage || isGenerating}
            className="w-full py-4 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                <span>{generationPhase === 'restoring' ? 'Restoring Face...' : 'Swapping Faces...'}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                <span>{enableRestoration ? 'Swap & Restore' : 'Swap Faces'}</span>
              </>
            )}
          </button>

          {/* Error Message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Right Column - Output */}
        <div className="space-y-6">
          {/* Results Section */}
          <div>
            <label className="block text-sm font-medium mb-3">
              {restoredImage ? 'Results (Swapped & Restored)' : 'Result'}
            </label>

            {/* Show both images if restoration was used */}
            {swappedImage && restoredImage ? (
              <div className="space-y-4">
                {/* Restored Image (Primary) */}
                <div className="relative border-2 border-purple-500/30 rounded-xl p-4 bg-purple-500/5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-green-400">Restored</span>
                    <span className="text-xs text-white/40">({restorationMethod.toUpperCase()})</span>
                  </div>
                  <img
                    src={restoredImage}
                    alt="Restored face swap result"
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleDownload(restoredImage, '-restored')}
                    className="mt-3 w-full py-3 bg-green-500/20 border border-green-500/30 rounded-xl hover:bg-green-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Restored</span>
                  </button>
                </div>

                {/* Swapped Image (Secondary) */}
                <div className="relative border-2 border-white/10 rounded-xl p-4 bg-white/5 backdrop-blur-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-purple-400">Original Swap</span>
                  </div>
                  <img
                    src={swappedImage}
                    alt="Original face swap result"
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => handleDownload(swappedImage, '-swapped')}
                    className="mt-3 w-full py-2 bg-white/5 border border-white/20 rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Original</span>
                  </button>
                </div>
              </div>
            ) : swappedImage ? (
              /* Single result (no restoration) */
              <div className="relative border-2 border-purple-500/20 rounded-xl p-8 bg-purple-500/5 backdrop-blur-sm">
                <img
                  src={swappedImage}
                  alt="Face swap result"
                  className="w-full h-auto rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => handleDownload(swappedImage, '')}
                  className="mt-4 w-full py-3 bg-purple-500/20 border border-purple-500/30 rounded-xl hover:bg-purple-500/30 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  <span>Download Image</span>
                </button>
              </div>
            ) : isGenerating ? (
              <div className="relative border-2 border-purple-500/20 rounded-xl p-8 bg-purple-500/5 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/60">
                    {generationPhase === 'restoring' ? 'Restoring face quality...' : 'Processing face swap...'}
                  </p>
                  <p className="text-white/40 text-sm mt-2">
                    {enableRestoration ? 'This may take 1-2 minutes' : 'This may take 30-60 seconds'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="relative border-2 border-purple-500/20 rounded-xl p-8 bg-purple-500/5 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
                <div className="text-center">
                  <User className="w-12 h-12 text-purple-500/40 mx-auto mb-4" />
                  <p className="text-white/60">Your face swap result will appear here</p>
                </div>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <h3 className="text-purple-300 font-semibold mb-2">Tips:</h3>
            <ul className="text-purple-200/80 text-sm space-y-1 list-disc list-inside">
              <li>Use clear, front-facing photos for best results</li>
              <li>Ensure good lighting on both faces</li>
              <li>Similar head angles work better</li>
              <li>Advanced model supports swapping two faces at once</li>
              <li>Enable upscaling for higher quality output</li>
            </ul>
          </div>

          {/* API Call Debug Panel */}
          <div className="bg-white/5 rounded-xl border border-purple-500/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowApiLogs(!showApiLogs)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
            >
              <div>
                <h3 className="text-white font-semibold">API Call Debug</h3>
                <p className="text-white/40 text-sm">View request/response details</p>
              </div>
              {showApiLogs ? (
                <ChevronUp className="w-5 h-5 text-white/40" />
              ) : (
                <ChevronDown className="w-5 h-5 text-white/40" />
              )}
            </button>

            {showApiLogs && (
              <div className="px-5 pb-5 space-y-3">
                {apiLogs.length === 0 ? (
                  <p className="text-white/40 text-sm py-4 text-center">
                    API calls will appear here when you swap faces
                  </p>
                ) : (
                  apiLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg text-sm font-mono ${
                        log.type === 'request'
                          ? 'bg-blue-500/10 border border-blue-500/30'
                          : log.type === 'response'
                          ? 'bg-green-500/10 border border-green-500/30'
                          : 'bg-red-500/10 border border-red-500/30'
                      }`}
                    >
                      <div className={`text-xs font-semibold mb-2 ${
                        log.type === 'request' ? 'text-blue-400' :
                        log.type === 'response' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        [{log.timestamp.split('T')[1].split('.')[0]}] {log.type.toUpperCase()}
                      </div>
                      <pre className="text-gray-300 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(log.data, null, 2)}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
