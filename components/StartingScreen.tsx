'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DevPanel from './workspace/DevPanel';
import { StartingScreenProps } from '@/lib/types/components';
import { Settings, ArrowRight, Image, X } from 'lucide-react';

export default function StartingScreen({
  onCreateProject,
  isLoading: externalLoading,
}: StartingScreenProps) {
  const [isDevPanelOpen, setIsDevPanelOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Use ref to prevent race conditions from rapid clicks
  const isTransitioningRef = useRef(false);

  const router = useRouter();

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file => 
      file.type.startsWith('image/')
    );
    if (files.length > 0) {
      setImages(prevImages => [...prevImages, ...files]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('image/')
    );

    if (files.length > 0) {
      setImages(prevImages => [...prevImages, ...files]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prevImages => prevImages.filter((_, i) => i !== index));
  };

  const handleInitialPrompt = async () => {
    // Prevent multiple rapid clicks (race condition fix)
    if (!prompt.trim() || externalLoading || isTransitioning || isTransitioningRef.current) {
      console.warn('[StartingScreen] handleInitialPrompt called but already transitioning or invalid state');
      return;
    }

    isTransitioningRef.current = true;

    // Trigger crumble animation
    setIsTransitioning(true);

    // Extract car model from prompt using AI
    let carParams = '';
    try {
      const response = await fetch('/api/extract-car-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.carInfo) {
          const { brand, model, year, confidence } = data.carInfo;
          if (confidence !== 'none') {
            const params = new URLSearchParams();
            if (brand) params.set('carBrand', brand);
            if (model) params.set('carModel', model);
            if (year) params.set('carYear', year.toString());
            params.set('carConfidence', confidence);
            carParams = `&${params.toString()}`;
          }
        }
      }
    } catch (error) {
      console.warn('[StartingScreen] Failed to extract car model:', error);
      // Continue without car info - not critical
    }

    // After smooth transition, navigate to your story page with prompt as query param
    // The new flow: / -> /your-story -> /brand-identity -> /workspace
    setTimeout(() => {
      setIsTransitioning(false);
      isTransitioningRef.current = false;
      router.push(`/your-story?prompt=${encodeURIComponent(prompt.trim())}${carParams}`);
    }, 600);
  };

  return (
    <div 
      className="min-h-screen flex flex-col items-center p-6 cinematic-gradient relative overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="absolute inset-0 bg-white/10 backdrop-blur-sm z-50 flex items-center justify-center border-4 border-dashed border-white/40">
          <div className="text-center">
            <p className="text-2xl text-white font-semibold mb-2">Drop images here</p>
            <p className="text-white/60">Add reference images for your project</p>
          </div>
        </div>
      )}

      {/* Large Background Text - Monologue style */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>
      
      {/* Top Left Logo */}
      <div className="fixed top-6 left-6 z-40">
        <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>
      
      {/* Dev Panel Toggle Button */}
      <button
        onClick={() => setIsDevPanelOpen(!isDevPanelOpen)}
        className="fixed top-6 right-6 z-40 p-2.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 hover:text-white/80 border border-white/10 backdrop-blur-sm transition-all"
        title="Model Configuration"
      >
        <Settings className="w-4 h-4" />
      </button>

      <div className="relative z-10 w-full max-w-6xl px-6 mt-20">
        {/* Initial Prompt Screen - Monologue style */}
        <div className={`space-y-8 ${isTransitioning ? 'animate-fade-out' : 'animate-fade-in'}`}>
          {/* Tagline */}
          <div className="text-center mb-12 w-full overflow-x-hidden">
            <h2 className="text-[36px] uppercase text-white/80 tracking-[0.5em] whitespace-nowrap" style={{ fontFamily: 'Porsche911, sans-serif' }}>
              Build your vision
            </h2>
          </div>

          {/* Main Prompt Box - Replaces the white device box */}
          <div className="relative group">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Tab fills in default prompt
                if (e.key === 'Tab' && !prompt.trim()) {
                  e.preventDefault();
                  setPrompt('Create a cinematic advertisement for a Porsche 911');
                }
                // Enter submits, Shift+Enter creates new line
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (prompt.trim() && !externalLoading) {
                    handleInitialPrompt();
                  }
                }
              }}
              placeholder="Create a cinematic advertisement for a Porsche 911"
              disabled={externalLoading}
              rows={6}
              className="w-full px-8 py-6 bg-white/5 border border-white/20 rounded-3xl text-white text-xl font-light placeholder-white/40 focus:outline-none focus:border-white/40 focus:bg-white/10 backdrop-blur-sm transition-all resize-none disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl"
            />
            {/* Gallery Icon - Bottom Left */}
            <input
              type="file"
              id="image-upload"
              accept="image/*"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => document.getElementById('image-upload')?.click()}
              className="absolute bottom-4 left-4 p-2 text-white/20 hover:text-white/50 transition-colors"
              title="Add reference images"
            >
              <Image className="w-5 h-5" />
            </button>
          </div>

          {/* Image Previews */}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-3 animate-slide-down">
              {images.map((image, index) => (
                <div key={index} className="relative group/image">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Reference ${index + 1}`}
                    className="w-24 h-24 object-cover rounded-lg border border-white/20"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 p-1 bg-white/90 hover:bg-white rounded-full text-black transition-all opacity-0 group-hover/image:opacity-100"
                    title="Remove image"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Continue Button */}
          <div className="fixed bottom-6 right-6 z-40">
            <button
              onClick={handleInitialPrompt}
              disabled={!prompt.trim() || externalLoading}
              className="group relative px-10 py-5 bg-white text-black rounded-full text-lg font-medium hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3 shadow-2xl shadow-white/20"
            >
              <span>Continue</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* Dev Panel */}
      <DevPanel isOpen={isDevPanelOpen} onClose={() => setIsDevPanelOpen(false)} />
    </div>
  );
}

