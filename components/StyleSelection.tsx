'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useProjectStore } from '@/lib/state/project-store';
import { generateStoryboard } from '@/lib/api-client';

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
    prompt: 'Wes Anderson cinematography with static tripod shots flat horizon line, vintage car commercial aesthetic, pastel color palette with burnt orange and seafoam green, film grain texture, shallow focus on car, deliberate staging, whimsical yet melancholic mood, methodical structured camera movement each shot should be a little hazy and vintage. CRITICAL REQUIREMENTS: Every imagePrompt MUST include the exact phrases "Wes Anderson style" and "whimsical". Every videoPrompt MUST include the exact phrases "Wes Anderson style shot" and "whimsical". Any human characters must be described as eccentrically dressed in Wes Anderson style with distinctive vintage clothing, bold color coordination, and quirky accessories.',
  },
  {
    id: 'luxury',
    label: 'Luxury',
    videoPath: '/styles/luxury.gif',
    prompt: 'Cinematic luxury car commercial, beautifully lit car, high-end production quality, smooth camera movement. Elegant, powerful, sophisticated, and refined. dark and moody. Highlighting the beauty and elegance of the car body.',
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
  const { selectedStyle, setSelectedStyle, setStoryboard, createProject } = useProjectStore();
  const [localSelectedStyle, setLocalSelectedStyle] = useState<string | null>(selectedStyle);
  const [loadingVideos, setLoadingVideos] = useState<Record<string, boolean>>({
    whimsical: true,
    luxury: true,
    offroad: true,
  });
  const [isGeneratingStoryboard, setIsGeneratingStoryboard] = useState(false);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const storyboardGenerationRef = useRef<Promise<void> | null>(null);

  // Add keyboard event listener for Enter key
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && localSelectedStyle) {
        handleContinue();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [localSelectedStyle]);

  const handleStyleSelect = (style: StyleOption) => {
    setLocalSelectedStyle(style.id);
    setSelectedStyle(style.id, style.prompt);

    // Start background storyboard generation immediately when style is selected
    const prompt = searchParams.get('prompt');
    console.log('[StyleSelection] handleStyleSelect called', { styleId: style.id, prompt: prompt?.substring(0, 50), hasPrompt: !!prompt });
    if (prompt && !storyboardGenerationRef.current) {
      storyboardGenerationRef.current = generateStoryboardInBackground(prompt, style.prompt);
    } else {
      console.log('[StyleSelection] Skipping generation:', { noPrompt: !prompt, alreadyGenerating: !!storyboardGenerationRef.current });
    }
  };

  const generateStoryboardInBackground = async (initialPrompt: string, stylePrompt: string) => {
    try {
      setIsGeneratingStoryboard(true);
      console.log('[StyleSelection] Starting background storyboard generation...');

      // Get target duration from URL params (default to 30 if not provided)
      const targetDuration = parseInt(searchParams.get('targetDuration') || '30', 10);
      console.log('[StyleSelection] Target duration:', targetDuration);

      // Build the full prompt
      const fullPrompt = `${initialPrompt}\n\nVisual style: ${stylePrompt}`;
      console.log('[StyleSelection] Full prompt length:', fullPrompt.length);

      // Initialize project first
      createProject('My Video Project', initialPrompt, targetDuration);

      // Get asset description and color from project store
      const project = useProjectStore.getState().project;
      const assetDescription = project?.assetDescription;
      const color = project?.selectedColor;

      console.log('[StyleSelection] Asset context:', { assetDescription, color });

      // Generate storyboard in background with asset context
      console.log('[StyleSelection] Calling generateStoryboard API...');
      const response = await generateStoryboard(
        fullPrompt,
        targetDuration,
        undefined, // referenceImageUrls
        assetDescription, // Pass asset description
        color // Pass color
      );
      console.log('[StyleSelection] API response received:', { success: response.success, sceneCount: response.scenes?.length });

      if (response.success && response.scenes) {
        await setStoryboard(response.scenes);
        console.log('[StyleSelection] Storyboard generated in background:', response.scenes.length, 'scenes');
      } else {
        console.error('[StyleSelection] Storyboard generation failed:', response.error || 'No error message');
        // Reset ref so user can retry
        storyboardGenerationRef.current = null;
      }
    } catch (error) {
      console.error('[StyleSelection] Background storyboard generation failed:', error);
      // Reset ref so user can retry
      storyboardGenerationRef.current = null;
    } finally {
      setIsGeneratingStoryboard(false);
    }
  };

  const handleContinue = () => {
    if (localSelectedStyle) {
      // Get the original prompt and car params from URL
      const prompt = searchParams.get('prompt');
      const carBrand = searchParams.get('carBrand');
      const carModel = searchParams.get('carModel');
      const carYear = searchParams.get('carYear');
      const carConfidence = searchParams.get('carConfidence');

      // If storyboard generation hasn't started yet, start it now
      if (prompt && !storyboardGenerationRef.current) {
        const selectedStyleOption = STYLE_OPTIONS.find(s => s.id === localSelectedStyle);
        if (selectedStyleOption) {
          storyboardGenerationRef.current = generateStoryboardInBackground(prompt, selectedStyleOption.prompt);
        }
      }

      // Build query string
      const params = new URLSearchParams();
      if (prompt) params.set('prompt', prompt);
      if (carBrand) params.set('carBrand', carBrand);
      if (carModel) params.set('carModel', carModel);
      if (carYear) params.set('carYear', carYear);
      if (carConfidence) params.set('carConfidence', carConfidence);

      const queryString = params.toString();
      // Skip /your-story page - go directly to brand-identity
      router.push(`/brand-identity${queryString ? `?${queryString}` : ''}`);
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
          className={`group relative px-10 py-5 rounded-full text-lg font-medium transition-all flex items-center gap-3 shadow-2xl ${
            localSelectedStyle
              ? 'bg-white text-black hover:bg-white/90 shadow-white/20 cursor-pointer'
              : 'bg-white/10 text-white/40 border border-white/20 backdrop-blur-sm opacity-50 cursor-not-allowed'
          }`}
        >
          <span>Continue</span>
          {localSelectedStyle && (
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          )}
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

