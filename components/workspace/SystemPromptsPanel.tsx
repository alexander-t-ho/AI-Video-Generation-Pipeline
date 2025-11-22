'use client';

import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface SystemPrompt {
  id: string;
  name: string;
  description: string;
  content: string;
  category: 'story' | 'image' | 'video' | 'other';
}

interface SystemPromptsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_SYSTEM_PROMPTS: SystemPrompt[] = [
  {
    id: 'story-idea',
    name: 'Story Idea Generation',
    description: 'Used when generating story ideas from initial prompts',
    category: 'story',
    content: `You are an expert advertising creative director and storytelling consultant. Your job is to refine raw ideas into compelling advertising narratives.

Given a user's initial vision or prompt, create a concise, compelling story idea with EXACTLY this format:

**WHO**: [Target audience - who is this for? Be specific about demographics, psychographics, aspirations]
**WHAT**: [What are you selling - focus on the FEELING, emotion, or aspiration, not just the product]
**STORY IDEA**: [A brief narrative concept - describe the story arc in 2-3 sentences]
**FEEL/DO**: [What should viewers feel or do after watching?]

IMPORTANT: You MUST use this exact format with **WHO**, **WHAT**, **STORY IDEA**, and **FEEL/DO** headers.
Keep each section concise (1-2 sentences max). Write in a clear, punchy style. Focus on emotions and aspirations over technical details.`,
  },
  {
    id: 'storyboard-generation',
    name: 'Storyboard Generation',
    description: 'Used when generating detailed scenes from a story idea',
    category: 'story',
    content: `You are an expert film director and cinematographer. Your job is to break down a story concept into detailed, filmable scenes with specific visual directions.

Create a detailed storyboard with exactly 3 scenes (Scene 0, Scene 1, Scene 2) that tell the story. For each scene, provide:

**Scene [N]: [Title]**
- **Visual Description**: Detailed description of what's on screen (composition, camera angle, subject positioning)
- **Camera Movement**: Pan, zoom, track, or static
- **Lighting/Color**: Mood, color palette, lighting style
- **Duration**: Suggested duration in seconds
- **Action/Motion**: What's happening in the scene (keep it simple)

Make each scene visually distinct and tell a coherent story. Focus on visual storytelling.`,
  },
  {
    id: 'image-prompt-refinement',
    name: 'Image Prompt Refinement',
    description: 'Used when refining text-to-image prompts for better generation',
    category: 'image',
    content: `You are an expert prompt engineer specializing in AI image generation. Your job is to take scene descriptions and create detailed, filmable prompts for AI image generation.

For each scene, create a visual prompt that is:
- Specific about composition (camera angle, perspective, framing)
- Detailed about lighting (time of day, mood, color temperature)
- Clear about subject positioning and scale
- Rich in atmospheric details (weather, environment, textures)
- Free of conflicting or ambiguous directives

Focus on visual clarity and cinematic quality.`,
  },
];

export default function SystemPromptsPanel({ isOpen, onClose }: SystemPromptsPanelProps) {
  const [prompts] = useState<SystemPrompt[]>(DEFAULT_SYSTEM_PROMPTS);
  const [selectedPromptId, setSelectedPromptId] = useState<string>(DEFAULT_SYSTEM_PROMPTS[0].id);
  const [editedContent, setEditedContent] = useState<string>(DEFAULT_SYSTEM_PROMPTS[0].content);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const selectedPrompt = prompts.find(p => p.id === selectedPromptId);

  const handlePromptSelect = (promptId: string) => {
    setSelectedPromptId(promptId);
    const prompt = prompts.find(p => p.id === promptId);
    if (prompt) {
      setEditedContent(prompt.content);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(editedContent);
    setCopiedId(selectedPromptId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-black shadow-xl border-l border-white/20 flex flex-col z-50 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/20">
        <div>
          <h2 className="text-lg font-semibold text-white">System Prompts</h2>
          <p className="text-xs text-white/60 mt-1">View and test system prompts</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Prompt Selector */}
        <div className="px-4 py-3 border-b border-white/20 space-y-2">
          <label className="block text-xs font-medium text-white">
            Select Prompt
          </label>
          <div className="flex gap-1 overflow-x-auto pb-2">
            {prompts.map(prompt => (
              <button
                key={prompt.id}
                onClick={() => handlePromptSelect(prompt.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                  selectedPromptId === prompt.id
                    ? 'bg-white/20 text-white border border-white/40'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                {prompt.name}
              </button>
            ))}
          </div>
        </div>

        {/* Prompt Details */}
        {selectedPrompt && (
          <div className="flex-1 overflow-y-auto flex flex-col p-4 space-y-3">
            {/* Info */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">
                {selectedPrompt.name}
              </h3>
              <p className="text-xs text-white/60">
                {selectedPrompt.description}
              </p>
            </div>

            {/* Content Textarea */}
            <div className="flex-1 flex flex-col min-h-0">
              <label className="text-xs font-medium text-white mb-2">
                Prompt Content
              </label>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="flex-1 w-full px-3 py-2 text-xs bg-white/5 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 text-white placeholder-white/40 resize-none font-mono backdrop-blur-sm"
                placeholder="Prompt content..."
              />
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-white/20 border border-white/20 transition-colors text-sm font-medium"
            >
              {copiedId === selectedPromptId ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy to Clipboard
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-white/20 bg-white/5">
        <p className="text-xs text-white/60 italic">
          💡 Tip: Edit prompts here for testing. Changes are for reference only and won't affect actual API calls.
        </p>
      </div>
    </div>
  );
}
