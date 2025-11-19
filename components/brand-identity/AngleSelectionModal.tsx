'use client';

import { useState } from 'react';
import { X, Camera } from 'lucide-react';
import { ANGLE_OPTIONS } from '@/lib/constants';
import type { AngleType } from '@/lib/types';

interface AngleSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (selectedAngles: AngleType[]) => void;
  currentImageUrl?: string;
  isGenerating?: boolean;
}

export default function AngleSelectionModal({
  isOpen,
  onClose,
  onGenerate,
  currentImageUrl,
  isGenerating = false
}: AngleSelectionModalProps) {
  const [selectedAngles, setSelectedAngles] = useState<AngleType[]>([]);

  const handleAngleToggle = (angleId: AngleType) => {
    if (selectedAngles.includes(angleId)) {
      // Remove from selection
      setSelectedAngles(selectedAngles.filter(id => id !== angleId));
    } else {
      // Add to selection
      setSelectedAngles([...selectedAngles, angleId]);
    }
  };

  const handleSelectAll = () => {
    if (selectedAngles.length === ANGLE_OPTIONS.length) {
      // Deselect all
      setSelectedAngles([]);
    } else {
      // Select all
      setSelectedAngles(ANGLE_OPTIONS.map(angle => angle.id));
    }
  };

  const handleGenerate = () => {
    if (selectedAngles.length === 0) return;
    onGenerate(selectedAngles);
  };

  const handleClose = () => {
    if (!isGenerating) {
      setSelectedAngles([]);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white/10 border border-white/20 rounded-3xl backdrop-blur-sm p-6 w-full max-w-4xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-white" />
            <h3 className="text-lg font-medium text-white">Generate Turnaround Angles</h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isGenerating}
            className="p-1 text-white/60 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Reference Image */}
        {currentImageUrl && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-white/80 mb-3">Reference Image</h4>
            <div className="relative max-w-xs mx-auto">
              <img
                src={currentImageUrl}
                alt="Reference"
                className="w-full h-auto rounded-lg border border-white/20"
              />
              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                Base Reference
              </div>
            </div>
            <p className="text-sm text-white/60 text-center mt-2">
              This will be used as the base reference for generating angle variations
            </p>
          </div>
        )}

        {/* Angle Selection */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-medium text-white/80">Select Angles to Generate</h4>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/60">
                {selectedAngles.length} of {ANGLE_OPTIONS.length} selected
              </span>
              <button
                onClick={handleSelectAll}
                disabled={isGenerating}
                className="px-3 py-1.5 rounded-lg border border-white/20 text-white text-sm hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {selectedAngles.length === ANGLE_OPTIONS.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ANGLE_OPTIONS.map((angle) => (
              <button
                key={angle.id}
                onClick={() => handleAngleToggle(angle.id)}
                disabled={isGenerating}
                className={`p-4 rounded-lg border-2 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedAngles.includes(angle.id)
                    ? 'border-white bg-white/10'
                    : 'border-white/20 bg-white/5 hover:border-white/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-4 h-4 rounded border-2 mt-0.5 flex-shrink-0 ${
                    selectedAngles.includes(angle.id)
                      ? 'bg-white border-white'
                      : 'border-white/40'
                  }`}>
                    {selectedAngles.includes(angle.id) && (
                      <div className="w-full h-full bg-black rounded-sm" />
                    )}
                  </div>
                  <div>
                    <h5 className="font-medium text-white text-sm">{angle.label}</h5>
                    <p className="text-xs text-white/60 mt-1">{angle.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isGenerating}
            className="px-6 py-2 text-white/60 hover:text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={selectedAngles.length === 0 || isGenerating}
            className="px-6 py-3 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 disabled:bg-white/5 disabled:opacity-50 border border-purple-400/30 disabled:border-white/10 rounded-xl text-white transition-all disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : `Generate ${selectedAngles.length} Angle${selectedAngles.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}




