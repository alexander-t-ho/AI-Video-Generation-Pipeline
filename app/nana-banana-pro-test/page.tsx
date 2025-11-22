'use client';

import { useState, useRef } from 'react';
import { Upload, Sparkles, Download, ArrowLeft, X, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';

interface ImageItem {
  file: File;
  preview: string;
}

interface ApiCallLog {
  timestamp: string;
  type: 'request' | 'response' | 'error';
  data: Record<string, unknown>;
}

const ASPECT_RATIO_OPTIONS = [
  'match_input_image',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;
type AspectRatio = typeof ASPECT_RATIO_OPTIONS[number];

const OUTPUT_FORMAT_OPTIONS = ['jpg', 'png'] as const;
type OutputFormat = typeof OUTPUT_FORMAT_OPTIONS[number];

export default function NanaBananaProTestPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('match_input_image');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('png');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [apiLogs, setApiLogs] = useState<ApiCallLog[]>([]);
  const [showApiLogs, setShowApiLogs] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addApiLog = (type: ApiCallLog['type'], data: Record<string, unknown>) => {
    setApiLogs(prev => [...prev, {
      timestamp: new Date().toISOString(),
      type,
      data
    }]);
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      // Use Promise.all to wait for all images to load
      const imagePromises = imageFiles.map((file): Promise<ImageItem> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              file,
              preview: e.target?.result as string
            });
          };
          reader.onerror = () => {
            reject(new Error(`Failed to read file: ${file.name}`));
          };
          reader.readAsDataURL(file);
        });
      });

      try {
        const newImages = await Promise.all(imagePromises);
        setImages(prev => [...prev, ...newImages]);
        setError('');
        setGeneratedImage('');
      } catch (error) {
        console.error('Error loading images:', error);
        setError(error instanceof Error ? error.message : 'Failed to load images');
      }
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (images.length === 0 || !prompt.trim()) {
      setError('Please provide at least one image and a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedImage('');
    setApiLogs([]);

    try {
      const formData = new FormData();
      images.forEach((img, index) => {
        formData.append(`image${index}`, img.file);
      });
      formData.append('imageCount', images.length.toString());
      formData.append('prompt', prompt);
      formData.append('aspectRatio', aspectRatio);
      formData.append('outputFormat', outputFormat);

      // Log the request
      addApiLog('request', {
        endpoint: '/api/nana-banana-pro-test/generate',
        method: 'POST',
        imageCount: images.length,
        images: images.map(img => img.file.name),
        prompt: prompt,
        aspectRatio,
        outputFormat,
      });

      const response = await fetch('/api/nana-banana-pro-test/generate', {
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
        imageUrl: data.imageUrl,
        predictionId: data.predictionId,
      });

      if (data.success && data.imageUrl) {
        setGeneratedImage(data.imageUrl);
      } else {
        throw new Error(data.error || 'No image URL returned');
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during generation';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!generatedImage) return;

    try {
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nana-banana-pro-generated-${Date.now()}.${outputFormat}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-900/20 via-black to-gray-900 text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <h1 className="text-4xl font-light mb-2">Nana Banana Pro</h1>
        <p className="text-white/60">Google's Gemini 2.5 Flash Image - high-quality image editing with natural language</p>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-3">Input Images ({images.length})</label>

            {/* Image Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {images.map((img, index) => (
                <div key={index} className="relative group aspect-square">
                  <img
                    src={img.preview}
                    alt={`Input ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-yellow-500/30"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-full transition-all opacity-0 group-hover:opacity-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <span className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-xs">
                    {index + 1}
                  </span>
                </div>
              ))}

              {/* Add Image Button */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-yellow-500/30 rounded-lg hover:border-yellow-500/50 transition-all cursor-pointer bg-yellow-500/5 flex flex-col items-center justify-center"
              >
                <Plus className="w-8 h-8 text-yellow-500/40 mb-2" />
                <span className="text-white/40 text-sm">Add Image</span>
              </div>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />

            {images.length === 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-yellow-500/30 rounded-xl p-8 hover:border-yellow-500/50 transition-all cursor-pointer bg-yellow-500/5 backdrop-blur-sm"
              >
                <div className="flex flex-col items-center justify-center h-32">
                  <Upload className="w-12 h-12 text-yellow-500/40 mb-4" />
                  <p className="text-white/60">Click to upload images</p>
                  <p className="text-white/40 text-sm mt-2">PNG, JPG, WebP - Multiple allowed</p>
                </div>
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium mb-3">Edit Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how you want to edit or combine the images..."
              rows={4}
              className="w-full px-4 py-3 bg-white/5 border border-yellow-500/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-yellow-500/40 focus:bg-white/10 backdrop-blur-sm resize-none"
            />
          </div>

          {/* Image Settings */}
          <div className="bg-white/5 border border-yellow-500/20 rounded-xl p-5 space-y-4">
            <h3 className="text-lg font-medium">Image Settings</h3>

            {/* Aspect Ratio */}
            <div>
              <label className="block text-sm text-white/60 mb-2">Aspect Ratio</label>
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_RATIO_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setAspectRatio(option)}
                    className={`py-2 px-2 rounded-lg text-xs font-medium transition-all ${
                      aspectRatio === option
                        ? 'bg-yellow-500 text-black'
                        : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {option === 'match_input_image' ? 'Match Input' : option}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-2">
                Use "Match Input" to preserve the original image dimensions
              </p>
            </div>

            {/* Output Format */}
            <div>
              <label className="block text-sm text-white/60 mb-2">Output Format</label>
              <div className="flex gap-2">
                {OUTPUT_FORMAT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    onClick={() => setOutputFormat(option)}
                    className={`flex-1 py-2.5 px-4 rounded-lg font-medium transition-all ${
                      outputFormat === option
                        ? 'bg-yellow-500 text-black'
                        : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-white/40 text-xs mt-2">
                PNG for transparency support, JPG for smaller file sizes
              </p>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleSubmit}
            disabled={images.length === 0 || !prompt.trim() || isGenerating}
            className="w-full py-4 bg-yellow-500 text-black rounded-xl font-medium hover:bg-yellow-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                <span>Generate Image</span>
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
          <div>
            <label className="block text-sm font-medium mb-3">Generated Image</label>
            <div className="relative border-2 border-yellow-500/20 rounded-xl p-8 bg-yellow-500/5 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
              {generatedImage ? (
                <div className="w-full">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    onClick={handleDownload}
                    className="mt-4 w-full py-3 bg-yellow-500/20 border border-yellow-500/30 rounded-xl hover:bg-yellow-500/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Image</span>
                  </button>
                </div>
              ) : isGenerating ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/60">Processing your images...</p>
                  <p className="text-white/40 text-sm mt-2">This may take a minute</p>
                </div>
              ) : (
                <div className="text-center">
                  <Sparkles className="w-12 h-12 text-yellow-500/40 mx-auto mb-4" />
                  <p className="text-white/60">Your generated image will appear here</p>
                </div>
              )}
            </div>
          </div>

          {/* Tips */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <h3 className="text-yellow-300 font-semibold mb-2">Tips:</h3>
            <ul className="text-yellow-200/80 text-sm space-y-1 list-disc list-inside">
              <li>Works best with clear, high-resolution input images</li>
              <li>Be specific about the edits you want</li>
              <li>Multiple images can be combined or used as reference</li>
              <li>Use "Match Input" aspect ratio to preserve original dimensions</li>
              <li>Generation typically takes 10-30 seconds</li>
            </ul>
          </div>

          {/* API Call Debug Panel */}
          <div className="bg-white/5 rounded-xl border border-yellow-500/20 overflow-hidden">
            <button
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
                    API calls will appear here when you generate an image
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
