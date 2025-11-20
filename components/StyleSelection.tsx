'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';

interface StyleOption {
  id: 'whimsical' | 'luxury' | 'offroad';
  label: string;
  videoPath: string;
  prompt: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: 'whimsical',
    label: 'Whimsical',
    videoPath: '/styles/whimsical.gif',
    prompt: 'Wes Anderson cinematography with static tripod shots flat horizon line, retro 1960s gas station, vintage car commercial aesthetic, pastel color palette with burnt orange and seafoam green, film grain texture, shallow focus on car, deliberate staging, whimsical yet melancholic mood, golden hour lighting, desert landscape, methodical camera movement',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    videoPath: '/styles/luxury.gif',
    prompt: 'Cinematic luxury car commercial, beautifully lit car driving through empty desert highway at golden hour, slow tracking shot following the vehicle, dramatic side lighting highlighting reflective paint, shallow depth of field, 2.35:1 aspect ratio, high-end production quality, smooth camera movement. Elegant, powerful, sophisticated, and refined',
  },
  {
    id: 'offroad',
    label: 'Offroad',
    videoPath: '/styles/offroad.gif',
    prompt: 'High-energy action sports aesthetic with aggressive, adrenaline-fueled pacing. Think muddy trail runs, rock bouncing, and full-throttle excitement. Fast cuts, dynamic camera angles, and visceral close-ups that put you IN the action. Vibrant, punchy color grading - saturated greens of forest trails, rich brown mud splatter, bright pops of the vehicle color against natural terrain. High contrast with deep blacks and bright highlights. Gritty, textured look with visible dirt, mud spray, and water flying everywhere. Camera work is aggressive and immersive - mounted GoPros on bumpers and fenders capturing mud rooster tails and tire spin, chest-mounted POV shots from inside the cabin showing the wheel wrestling and driver reactions, low-angle tight shots of tires chewing through mud bogs. Quick whip pans and impact cuts when the vehicle hits obstacles or drops off ledges. Slow-motion used for maximum drama - mud exploding off tires, suspension compression on big hits, water crossings with massive splashes erupting. Paired with real-time speed ramping for that holy shit moment energy. Raw, authentic, Fun with a capital F. More YouTube off-road channel energy than luxury brand - this is about capability, adventure, and getting dirty. Think weekend warrior excitement and take your buddies out vibes.',
  },
];

export default function StyleSelection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedStyle, setSelectedStyle } = useProjectStore();
  const [localSelectedStyle, setLocalSelectedStyle] = useState<string | null>(selectedStyle);
  const [loadingVideos, setLoadingVideos] = useState<Record<string, boolean>>({
    whimsical: true,
    luxury: true,
    offroad: true,
  });
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const handleStyleSelect = (style: StyleOption) => {
    setLocalSelectedStyle(style.id);
    setSelectedStyle(style.id, style.prompt);
  };

  const handleContinue = () => {
    if (localSelectedStyle) {
      // Get the original prompt and car params from URL
      const prompt = searchParams.get('prompt');
      const carBrand = searchParams.get('carBrand');
      const carModel = searchParams.get('carModel');
      const carYear = searchParams.get('carYear');
      const carConfidence = searchParams.get('carConfidence');

      // Build query string
      const params = new URLSearchParams();
      if (prompt) params.set('prompt', prompt);
      if (carBrand) params.set('carBrand', carBrand);
      if (carModel) params.set('carModel', carModel);
      if (carYear) params.set('carYear', carYear);
      if (carConfidence) params.set('carConfidence', carConfidence);

      const queryString = params.toString();
      router.push(`/your-story${queryString ? `?${queryString}` : ''}`);
    }
  };

  const handleVideoLoaded = (styleId: string) => {
    setLoadingVideos(prev => ({ ...prev, [styleId]: false }));
  };

  return (
    <div className="min-h-screen flex flex-col cinematic-gradient relative overflow-hidden">
      {/* Top Left Logo */}
      <div className="fixed top-6 left-6 z-40">
        <h1 className="text-2xl font-light text-white tracking-tighter select-none whitespace-nowrap leading-none">
          Scen3
        </h1>
      </div>

      {/* Back and Continue Buttons - Bottom Right */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={handleContinue}
          disabled={!localSelectedStyle}
          className="px-6 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </button>
      </div>

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-4 sm:px-6 flex flex-col justify-center min-h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-light text-white/90 tracking-tight mb-2">
            Visual Style
          </h2>
          <p className="text-sm sm:text-base text-white/60">
            Select a style to guide your video's look and feel
          </p>
        </div>

        {/* Style Options Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {STYLE_OPTIONS.map((style) => (
            <button
              key={style.id}
              onClick={() => handleStyleSelect(style)}
              className={`group relative rounded-2xl overflow-hidden transition-all ${
                localSelectedStyle === style.id
                  ? 'ring-4 ring-white/60 shadow-2xl shadow-white/20'
                  : 'ring-2 ring-white/20 hover:ring-white/40'
              }`}
            >
              {/* Video Container */}
              <div className="relative aspect-square bg-black/20">
                {/* Loading Spinner */}
                {loadingVideos[style.id] && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                )}

                {/* Video/GIF */}
                <img
                  ref={(el) => {
                    if (el) videoRefs.current[style.id] = el as any;
                  }}
                  src={style.videoPath}
                  alt={style.label}
                  className="w-full h-full object-cover"
                  onLoad={() => handleVideoLoaded(style.id)}
                />

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />

                {/* Label */}
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-2xl font-medium text-white tracking-tight">
                    {style.label}
                  </h3>
                </div>

                {/* Selection Indicator */}
                {localSelectedStyle === style.id && (
                  <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-black"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Helper Text */}
        {!localSelectedStyle && (
          <div className="text-center mt-10">
            <p className="text-sm text-white/40">
              Choose a visual style to continue
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

