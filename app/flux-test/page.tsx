'use client';

import { useState, useRef } from 'react';
import { Upload, Sparkles, Download, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function FluxTestPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      setError('');
      setGeneratedImage('');
    }
  };

  const handleSubmit = async () => {
    if (!imageFile || !prompt.trim()) {
      setError('Please provide both an image and a prompt');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedImage('');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('prompt', prompt);

      const response = await fetch('/api/flux-test/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success && data.imageUrl) {
        setGeneratedImage(data.imageUrl);
      } else {
        setError(data.error || 'Failed to generate image');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during generation');
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
      a.download = `flux-generated-${Date.now()}.png`;
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
        <h1 className="text-4xl font-light mb-2">Flux Pro Image Generation</h1>
        <p className="text-white/60">Upload an image and provide a prompt to generate a new image</p>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Input */}
        <div className="space-y-6">
          {/* Image Upload */}
          <div>
            <label className="block text-sm font-medium mb-3">Input Image</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed border-white/20 rounded-xl p-8 hover:border-white/40 transition-all cursor-pointer bg-white/5 backdrop-blur-sm"
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-64 object-contain rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-64">
                  <Upload className="w-12 h-12 text-white/40 mb-4" />
                  <p className="text-white/60">Click to upload an image</p>
                  <p className="text-white/40 text-sm mt-2">PNG, JPG, WebP</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Prompt Input */}
          <div>
            <label className="block text-sm font-medium mb-3">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how you want to transform the image..."
              rows={6}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 backdrop-blur-sm resize-none"
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleSubmit}
            disabled={!imageFile || !prompt.trim() || isGenerating}
            className="w-full py-4 bg-white text-black rounded-xl font-medium hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
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
            <div className="relative border-2 border-white/20 rounded-xl p-8 bg-white/5 backdrop-blur-sm min-h-[400px] flex items-center justify-center">
              {generatedImage ? (
                <div className="w-full">
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="w-full h-auto rounded-lg"
                  />
                  <button
                    onClick={handleDownload}
                    className="mt-4 w-full py-3 bg-white/10 border border-white/20 rounded-xl hover:bg-white/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Image</span>
                  </button>
                </div>
              ) : isGenerating ? (
                <div className="text-center">
                  <div className="w-12 h-12 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-white/60">Generating your image...</p>
                  <p className="text-white/40 text-sm mt-2">This may take a minute</p>
                </div>
              ) : (
                <div className="text-center">
                  <Sparkles className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60">Your generated image will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
