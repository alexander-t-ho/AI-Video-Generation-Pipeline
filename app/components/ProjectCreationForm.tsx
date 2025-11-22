// app/components/ProjectCreationForm.tsx
'use client';

import { useState } from 'react';
import { useProjectStore } from '@/lib/state/project-store';

export default function ProjectCreationForm() {
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(15);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { createProject, setStoryboard } = useProjectStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    setIsGenerating(true);

    try {
      // 1. Create project in store
      const name = `Project ${new Date().toLocaleDateString()}`;
      createProject(name, prompt, duration);

      // 2. Generate storyboard
      const response = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, targetDuration: duration }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate storyboard');
      }

      const data = await response.json();
      
      // 3. Update store with storyboard
      setStoryboard(data.scenes);

      // Navigate to scene generation page
      window.location.href = '/generate';
      
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to generate storyboard. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-4xl font-bold mb-2">AI Video Generator</h1>
      <p className="text-gray-600 mb-8">
        Create professional video ads from a single prompt
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Prompt Input */}
        <div>
          <label htmlFor="prompt" className="block text-sm font-medium mb-2">
            Video Prompt
          </label>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g., Luxury watch advertisement with golden hour lighting and elegant models"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={4}
            disabled={isGenerating}
          />
          <p className="text-sm text-gray-500 mt-1">
            Describe the video you want to create. Be specific about style, mood, and visuals.
          </p>
        </div>

        {/* Duration Selector */}
        <div>
          <label htmlFor="duration" className="block text-sm font-medium mb-2">
            Target Duration
          </label>
          <div className="grid grid-cols-3 gap-4">
            {[15, 30, 60].map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setDuration(sec)}
                className={`py-3 px-4 rounded-lg border-2 transition-colors ${
                  duration === sec
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                disabled={isGenerating}
              >
                <div className="text-2xl font-bold">{sec}s</div>
                <div className="text-xs text-gray-600">
                  {sec === 15 ? 'Quick' : sec === 30 ? 'Standard' : 'Long'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isGenerating || !prompt.trim()}
          className="w-full py-4 px-6 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Storyboard...
            </span>
          ) : (
            'Generate Video'
          )}
        </button>
      </form>

      {/* Example Prompts */}
      <div className="mt-12">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Example Prompts:
        </h3>
        <div className="space-y-2">
          {[
            'Luxury watch advertisement with golden hour lighting and elegant models',
            'Energy drink ad with extreme sports, skateboarding, vibrant neon colors',
            'Minimalist skincare product on clean white background with soft lighting',
          ].map((example, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setPrompt(example)}
              className="block w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isGenerating}
            >
              "{example}"
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
