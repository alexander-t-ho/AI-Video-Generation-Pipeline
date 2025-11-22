'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Download, X, ChevronDown, ChevronUp } from 'lucide-react';

interface ImageWithPreview {
  file: File;
  preview: string;
}

interface ApiCallLog {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  data: Record<string, unknown>;
}

const DURATION_OPTIONS = [4, 6, 8] as const;
type Duration = typeof DURATION_OPTIONS[number];

const ASPECT_RATIO_OPTIONS = ['16:9', '9:16'] as const;
type AspectRatio = typeof ASPECT_RATIO_OPTIONS[number];

const RESOLUTION_OPTIONS = ['720p', '1080p'] as const;
type Resolution = typeof RESOLUTION_OPTIONS[number];

export default function VeoTestPage() {
  const [primaryImage, setPrimaryImage] = useState<ImageWithPreview | null>(null);
  const [additionalImages, setAdditionalImages] = useState<ImageWithPreview[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [duration, setDuration] = useState<Duration>(6);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Resolution>('720p');
  const [seed, setSeed] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [showApiLogs, setShowApiLogs] = useState(true);
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);

  const addApiLog = (type: ApiCallLog['type'], data: Record<string, unknown>) => {
    setApiLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      data
    }]);
  };

  const handlePrimaryImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const preview = URL.createObjectURL(file);
      setPrimaryImage({ file, preview });
      setError('');
    }
  };

  const handleAdditionalImagesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith('image/')).slice(0, 3 - additionalImages.length);

    const newImages: ImageWithPreview[] = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setAdditionalImages((prev) => [...prev, ...newImages].slice(0, 3));
    setError('');

    if (additionalFileInputRef.current) {
      additionalFileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent, isPrimary: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));

    if (isPrimary && imageFiles.length > 0) {
      const file = imageFiles[0];
      const preview = URL.createObjectURL(file);
      setPrimaryImage({ file, preview });
      setError('');
    } else if (!isPrimary && imageFiles.length > 0) {
      const newImages: ImageWithPreview[] = imageFiles.slice(0, 3 - additionalImages.length).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setAdditionalImages((prev) => [...prev, ...newImages].slice(0, 3));
      setError('');
    }
  };

  const removePrimaryImage = () => {
    if (primaryImage) {
      URL.revokeObjectURL(primaryImage.preview);
      setPrimaryImage(null);
    }
    if (primaryFileInputRef.current) {
      primaryFileInputRef.current.value = '';
    }
  };

  const removeAdditionalImage = (index: number) => {
    setAdditionalImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!primaryImage || !prompt.trim()) {
      setError('Please provide at least a primary image and a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedVideo('');
    setApiLogs([]);

    try {
      const formData = new FormData();
      formData.append('image', primaryImage.file);

      additionalImages.forEach((img) => {
        formData.append('images', img.file);
      });

      formData.append('prompt', prompt);

      if (negativePrompt.trim()) {
        formData.append('negativePrompt', negativePrompt);
      }

      formData.append('duration', duration.toString());
      formData.append('aspectRatio', aspectRatio);
      formData.append('resolution', resolution);

      if (seed.trim()) {
        formData.append('seed', seed);
      }

      // Log the request
      addApiLog('request', {
        endpoint: '/api/veo-test/generate',
        method: 'POST',
        primaryImage: primaryImage.file.name,
        primaryImageSize: `${(primaryImage.file.size / 1024).toFixed(1)} KB`,
        referenceImages: additionalImages.map(img => img.file.name),
        prompt: prompt,
        negativePrompt: negativePrompt || '(none)',
        duration: `${duration}s`,
        aspectRatio,
        resolution,
        seed: seed || '(random)',
      });

      const response = await fetch('/api/veo-test/generate', {
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
        throw new Error(data.error || 'Failed to generate video');
      }

      addApiLog('response', {
        status: response.status,
        success: data.success,
        videoUrl: data.videoUrl,
        predictionId: data.predictionId,
      });

      if (data.videoUrl) {
        setGeneratedVideo(data.videoUrl);
      } else {
        throw new Error('No video URL returned');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error generating video:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedVideo) return;

    try {
      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `veo3-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error downloading video:', err);
      setError('Failed to download video');
    }
  };

  useEffect(() => {
    return () => {
      if (primaryImage) {
        URL.revokeObjectURL(primaryImage.preview);
      }
      additionalImages.forEach((img) => {
        URL.revokeObjectURL(img.preview);
      });
    };
  }, [primaryImage, additionalImages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Veo 3.1 Fast Test</h1>
          <p className="text-gray-400">Google's state-of-the-art video generation with native audio</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - Input */}
          <div className="space-y-4">
            {/* Primary Image Upload */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-1">Primary Image *</h2>
              <p className="text-gray-400 text-sm mb-3">First frame for video generation (720p+ recommended)</p>

              {!primaryImage ? (
                <div
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, true)}
                  onClick={() => primaryFileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-gray-500 transition-colors"
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-300 mb-1">Click to upload or drag and drop</p>
                  <p className="text-gray-500 text-sm">PNG, JPG, or WebP</p>
                  <input
                    ref={primaryFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePrimaryImageSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                <div className="relative">
                  <img
                    src={primaryImage.preview}
                    alt="Primary preview"
                    className="w-full h-auto rounded-xl max-h-48 object-contain bg-gray-900"
                  />
                  <button
                    onClick={removePrimaryImage}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Reference Images */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-1">Reference Images (Optional)</h2>
              <p className="text-gray-400 text-sm mb-3">Up to 3 images for style/character consistency</p>

              {additionalImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {additionalImages.map((img, index) => (
                    <div key={index} className="relative aspect-square">
                      <img
                        src={img.preview}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        onClick={() => removeAdditionalImage(index)}
                        className="absolute top-1 right-1 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {additionalImages.length < 3 && (
                <div
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, false)}
                  onClick={() => additionalFileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center cursor-pointer hover:border-gray-500 transition-colors"
                >
                  <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                  <p className="text-gray-400 text-sm">Add reference ({3 - additionalImages.length} remaining)</p>
                  <input
                    ref={additionalFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleAdditionalImagesSelect}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {/* Prompt */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-3">Prompt *</h2>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the video you want to generate..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>

            {/* Negative Prompt */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-1">Negative Prompt</h2>
              <p className="text-gray-400 text-sm mb-3">What to avoid in the video</p>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="blurry, distorted, low quality, artifacts..."
                rows={2}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>

            {/* Video Settings */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700 space-y-4">
              <h2 className="text-lg font-semibold text-white">Video Settings</h2>

              {/* Duration */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Duration</label>
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setDuration(option)}
                      className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                        duration === option
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-900/50 border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {option}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Aspect Ratio</label>
                <div className="flex gap-2">
                  {ASPECT_RATIO_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setAspectRatio(option)}
                      className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                        aspectRatio === option
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-900/50 border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {option === '16:9' ? 'Landscape' : 'Portrait'} ({option})
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Resolution</label>
                <div className="flex gap-2">
                  {RESOLUTION_OPTIONS.map((option) => (
                    <button
                      key={option}
                      onClick={() => setResolution(option)}
                      className={`flex-1 py-2.5 px-3 rounded-lg font-medium text-sm transition-all ${
                        resolution === option
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-900/50 border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seed */}
              <div>
                <label className="text-gray-400 text-sm mb-2 block">Seed (Optional)</label>
                <input
                  type="text"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
                  placeholder="Leave empty for random"
                  className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-500"
                />
                <p className="text-gray-500 text-xs mt-1">Use same seed for reproducible results (0-4294967295)</p>
              </div>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!primaryImage || !prompt.trim() || isGenerating}
              className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-3"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Video...
                </>
              ) : (
                'Generate Video'
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Right Column - Output */}
          <div className="space-y-4">
            {/* Generated Video */}
            <div className="bg-gray-800/50 rounded-2xl p-5 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">Generated Video</h2>

              {generatedVideo ? (
                <div className="space-y-4">
                  <video
                    src={generatedVideo}
                    controls
                    autoPlay
                    className="w-full rounded-xl"
                  />
                  <button
                    onClick={handleDownload}
                    className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Download Video
                  </button>
                </div>
              ) : (
                <div className="aspect-video bg-gray-900/50 rounded-xl border-2 border-dashed border-gray-700 flex items-center justify-center">
                  <p className="text-gray-500 text-center">
                    {isGenerating ? 'Generating your video...' : 'Your video will appear here'}
                  </p>
                </div>
              )}
            </div>

            {/* Tips */}
            <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-4">
              <h3 className="text-blue-300 font-semibold mb-2">Tips:</h3>
              <ul className="text-blue-200/80 text-sm space-y-1 list-disc list-inside">
                <li>Use 720p+ images for best quality</li>
                <li>Be descriptive - include motion, camera angles, lighting</li>
                <li>Reference images help maintain character consistency</li>
                <li>Native audio is generated automatically</li>
                <li>Generation takes 1-6 minutes depending on settings</li>
              </ul>
            </div>

            {/* API Call Debug Panel */}
            <div className="bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden">
              <button
                onClick={() => setShowApiLogs(!showApiLogs)}
                className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-700/30 transition-colors"
              >
                <div>
                  <h3 className="text-white font-semibold">API Call Debug</h3>
                  <p className="text-gray-400 text-sm">View request/response details</p>
                </div>
                {showApiLogs ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showApiLogs && (
                <div className="px-5 pb-5 space-y-3">
                  {apiLogs.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center">
                      API calls will appear here when you generate a video
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
    </div>
  );
}
