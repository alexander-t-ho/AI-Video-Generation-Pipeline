import { ArrowRight } from 'lucide-react';
import type { ActionButtonsProps } from '../types';

export function ActionButtons({
  onSkip,
  onContinue,
  continueDisabled = false,
  continueText = 'Continue',
  showSkip = true
}: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-white/20">
      {showSkip && onSkip && (
        <button
          onClick={onSkip}
          className="px-6 py-3 rounded-full border border-white/20 text-white text-base font-medium hover:bg-white/10 transition-colors"
        >
          Skip This Step
        </button>
      )}
      {showSkip && !onSkip && <div />} {/* Spacer */}
      {onContinue && (
        <button
          onClick={onContinue}
          disabled={continueDisabled}
          className="px-8 py-3 rounded-full bg-white text-black text-base font-semibold hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {continueText}
          <ArrowRight className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
