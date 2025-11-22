'use client';

import { useState, useRef } from 'react';
import { Upload, Film, Download, ArrowLeft, Play, X, Plus } from 'lucide-react';
import Link from 'next/link';

interface ImageItem {
  file: File;
  preview: string;
}

const DURATION_OPTIONS = [5, 10] as const;
type Duration = typeof DURATION_OPTIONS[number];

export default function SeedanceTestPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<Duration>(5);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideo, setGeneratedVideo] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length > 0) {
      const newImages: ImageItem[] = [];

      imageFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
          newImages.push({
            file,
            preview: e.target?.result as string
          });

          if (newImages.length === imageFiles.length) {
            setImages(prev => [...prev, ...newImages]);
          }
        };
        reader.readAsDataURL(file);
      });

      setError('');
      setGeneratedVideo('');
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
      setError('Please provide at least one reference image and a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedVideo('');

    try {
      const formData = new FormData();
      images.forEach((img, index) => {
        formData.append(`image${index}`, img.file);
      });
      formData.append('imageCount', images.length.toString());
      formData.append('prompt', prompt);
      formData.append('duration', duration.toString());

      const response = await fetch('/api/seedance-test/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.videoUrl) {
        setGeneratedVideo(data.videoUrl);
      } else {
        setError(data.error || 'Failed to generate video');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during generation');
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
      a.download = `seedance-generated-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
        <h1 className="text-4xl font-light mb-2">Seedance 1 Pro Fast</h1>
        <p className="text-white/60">ByteDance's cinematic AI video generation - 3x faster with high visual fidelity</p>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-3">Reference Images ({images.length})</label>

            {/* Image Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              {images.map((img, index) => (
                <div key={index} className="relative group aspect-square">
                  <img
                    src={img.preview}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-white/20"
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
                className="aspect-square border-2 border-dashed border-white/20 rounded-lg hover:border-white/40 transition-all cursor-pointer bg-white/5 flex flex-col items-center justify-center"
              >
                <Plus className="w-8 h-8 text-white/40 mb-2" />
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
                className="border-2 border-dashed border-white/20 rounded-xl p-8 hover:border-white/40 transition-all cursor-pointer bg-white/5 backdrop-blur-sm"
              >
                <div className="flex flex-col items-center justify-center h-32">
                  <Upload className="w-12 h-12 text-white/40 mb-4" />
                  <p className="text-white/60">Click to upload reference images</p>
                  <p className="text-white/40 text-sm mt-2">PNG, JPG, WebP - Multiple allowed</p>
                </div>
              </div>
            )}
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium mb-3">Motion Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the motion you want in the video..."
              rows={6}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 backdrop-blur-sm resize-none"
            />
          </div>

          {/* Duration Toggle */}
          <div>
            <label className="block text-sm font-medium mb-3">Video Duration</label>
            <div className="flex gap-2">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option}
                  onClick={() => setDuration(option)}
                  className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
                    duration === option
                      ? 'bg-white text-black'
                      : 'bg-white/5 border border-white/20 text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {option} seconds
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleSubmit}
            disabled={images.length === 0 || !prompt.trim() || isGenerating}
            className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                <span>Generating Video...</span>
              </>
            ) : (
              <>
                <Film className="w-5 h-5" />
                <span>Generate Video</span>
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
            <label className="block text-sm font-medium mb-3">Generated Video</label>
            <div className="relative border-2 border-white/20 rounded-xl p-8 bg-white/5 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
              {generatedVideo ? (
                <div className="w-full">
                  <video
                    src={generatedVideo}
                    controls
                    autoPlay
                    loop
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    onClick={handleDownload}
                    className="mt-4 w-full py-3 bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Video</span>
                  </button>
                </div>
              ) : isGenerating ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/60">Generating your video...</p>
                  <p className="text-white/40 text-sm mt-2">This may take a few minutes</p>
                </div>
              ) : (
                <div className="text-center">
                  <Play className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60">Your generated video will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
