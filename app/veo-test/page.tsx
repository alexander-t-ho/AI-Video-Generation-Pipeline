'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, Loader2, Download, X } from 'lucide-react';

interface ImageWithPreview {
  file: File;
  preview: string;
}

export default function VeoTestPage() {
  const [primaryImage, setPrimaryImage] = useState<ImageWithPreview | null>(null);
  const [additionalImages, setAdditionalImages] = useState<ImageWithPreview[]>([]);
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string>('');
  const [error, setError] = useState<string>('');
  const primaryFileInputRef = useRef<HTMLInputElement>(null);
  const additionalFileInputRef = useRef<HTMLInputElement>(null);

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
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    
    const newImages: ImageWithPreview[] = imageFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    
    setAdditionalImages((prev) => [...prev, ...newImages]);
    setError('');
    
    // Reset input
    if (additionalFileInputRef.current) {
      additionalFileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent, isPrimary: boolean) => {
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
      const newImages: ImageWithPreview[] = imageFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setAdditionalImages((prev) => [...prev, ...newImages]);
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

    try {
      // Create form data with images and prompts
      const formData = new FormData();
      formData.append('image', primaryImage.file);
      
      // Add additional images
      additionalImages.forEach((img) => {
        formData.append('images', img.file);
      });
      
      formData.append('prompt', prompt);
      
      if (negativePrompt.trim()) {
        formData.append('negativePrompt', negativePrompt);
      }

      // Call the API endpoint
      const response = await fetch('/api/veo-test/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate video');
      }

      const data = await response.json();

      if (data.videoUrl) {
        setGeneratedVideo(data.videoUrl);
      } else {
        throw new Error('No video URL returned');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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

  // Cleanup blob URLs on unmount
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
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Veo 3 Test</h1>
          <p className="text-gray-400">Upload an image and prompt to generate a video</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left Column - Input */}
          <div className="space-y-6">
            {/* Primary Image Upload */}
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-2">Primary Image *</h2>
              <p className="text-gray-400 text-sm mb-4">Required: Main input image for video generation</p>

              {!primaryImage ? (
                <div
                  onDragOver={(e) => handleDragOver(e, true)}
                  onDrop={(e) => handleDrop(e, true)}
                  onClick={() => primaryFileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-gray-500 transition-colors"
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-300 mb-2">Click to upload or drag and drop</p>
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
                    className="w-full h-auto rounded-xl"
                  />
                  <button
                    onClick={removePrimaryImage}
                    className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Additional Reference Images */}
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-2">Reference Images (Optional)</h2>
              <p className="text-gray-400 text-sm mb-4">Additional images for consistency and style reference</p>

              {additionalImages.length > 0 && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {additionalImages.map((img, index) => (
                    <div key={index} className="relative">
                      <img
                        src={img.preview}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-32 object-cover rounded-lg"
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

              <div
                onDragOver={(e) => handleDragOver(e, false)}
                onDrop={(e) => handleDrop(e, false)}
                onClick={() => additionalFileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-gray-500 transition-colors"
              >
                <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-300 text-sm mb-1">Add reference images</p>
                <p className="text-gray-500 text-xs">Click or drag and drop multiple images</p>
                <input
                  ref={additionalFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleAdditionalImagesSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Prompt Input */}
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Prompt *</h2>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the video you want to generate..."
                rows={6}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
              />
            </div>

            {/* Negative Prompt Input */}
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-2">Negative Prompt (Optional)</h2>
              <p className="text-gray-400 text-sm mb-4">Specify what you want to avoid in the video</p>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                placeholder="Things to avoid (e.g., blurry, distorted, low quality)..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-gray-500 resize-none"
              />
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

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4">
                <p className="text-red-400">{error}</p>
              </div>
            )}
          </div>

          {/* Right Column - Output */}
          <div className="space-y-6">
            <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-4">Generated Video</h2>

              {generatedVideo ? (
                <div className="space-y-4">
                  <video
                    src={generatedVideo}
                    controls
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

            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/50 rounded-xl p-4">
              <h3 className="text-blue-300 font-semibold mb-2">Tips:</h3>
              <ul className="text-blue-200/80 text-sm space-y-1 list-disc list-inside">
                <li>Use high-quality images for best results</li>
                <li>Be descriptive in your prompts</li>
                <li>Reference images help maintain consistency</li>
                <li>Negative prompts help avoid unwanted elements</li>
                <li>Video generation may take 1-6 minutes</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
