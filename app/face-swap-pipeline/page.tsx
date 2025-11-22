'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Loader2 } from 'lucide-react';
import Link from 'next/link';
import VideoUpload from '@/components/face-swap-pipeline/VideoUpload';
import ReferenceImageUpload from '@/components/face-swap-pipeline/ReferenceImageUpload';
import ProcessingOptions from '@/components/face-swap-pipeline/ProcessingOptions';
import FramePreview from '@/components/face-swap-pipeline/FramePreview';
import FrameClassificationDisplay from '@/components/face-swap-pipeline/FrameClassification';
import ProcessingProgress from '@/components/face-swap-pipeline/ProcessingProgress';
import ResultVideo from '@/components/face-swap-pipeline/ResultVideo';
import { ProcessingOptions as ProcessingOptionsType, FrameMetadata, ProcessingStatus } from '@/lib/types/face-swap-pipeline';

export default function FaceSwapPipelinePage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [referenceFace, setReferenceFace] = useState<File | null>(null);
  const [referencePerson, setReferencePerson] = useState<File | null>(null);
  const [referenceCar, setReferenceCar] = useState<File | null>(null);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptionsType>({
    processKeyFramesOnly: true,
    enableFaceSwap: true,
    enableEnhancement: false,
    enableUpscaling: false,
  });

  const [frames, setFrames] = useState<FrameMetadata[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for status updates
  useEffect(() => {
    if (!jobId || !isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/face-swap-pipeline/status/${jobId}`);
        const data = await response.json();

        if (data.success && data.status) {
          setStatus(data.status);

          // Update frames if available in status
          // Note: In a full implementation, we'd fetch frames separately or include them in status
          
          if (data.status.phase === 'completed' || data.status.phase === 'failed') {
            setIsProcessing(false);
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error('Failed to fetch status:', error);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [jobId, isProcessing]);

  const handleStartProcessing = useCallback(async () => {
    if (!videoFile) {
      setError('Please upload a video file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setStatus(null);

    try {
      const formData = new FormData();
      formData.append('video', videoFile);

      if (referenceFace) {
        formData.append('referenceFace', referenceFace);
      }
      if (referencePerson) {
        formData.append('referencePerson', referencePerson);
      }
      if (referenceCar) {
        formData.append('referenceCar', referenceCar);
      }

      // Add processing options
      if (processingOptions.frameExtractionRate) {
        formData.append('frameExtractionRate', processingOptions.frameExtractionRate.toString());
      }
      if (processingOptions.extractByTimeInterval) {
        formData.append('extractByTimeInterval', processingOptions.extractByTimeInterval.toString());
      }
      if (processingOptions.processKeyFramesOnly) {
        formData.append('processKeyFramesOnly', 'true');
      }
      if (processingOptions.enableFaceSwap) {
        formData.append('enableFaceSwap', 'true');
        formData.append('faceSwapModel', processingOptions.faceSwapModel || 'simple');
      }
      if (processingOptions.enablePersonReplacement) {
        formData.append('enablePersonReplacement', 'true');
      }
      if (processingOptions.enableCarReplacement) {
        formData.append('enableCarReplacement', 'true');
      }
      if (processingOptions.enableEnhancement) {
        formData.append('enableEnhancement', 'true');
      }
      if (processingOptions.enableUpscaling) {
        formData.append('enableUpscaling', 'true');
        formData.append('upscalingModel', processingOptions.upscalingModel || 'real-esrgan');
      }

      const response = await fetch('/api/face-swap-pipeline/process', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start processing');
      }

      setJobId(data.jobId);
    } catch (err: any) {
      console.error('Failed to start processing:', err);
      setError(err.message || 'Failed to start processing');
      setIsProcessing(false);
    }
  }, [videoFile, referenceFace, referencePerson, referenceCar, processingOptions]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900/20 via-black to-gray-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-4xl font-light mb-2">Face Swap Video Pipeline</h1>
          <p className="text-white/60">
            Complete video processing pipeline with face/person/car replacement
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Input */}
          <div className="space-y-6">
            {/* Video Upload */}
            <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
              <VideoUpload
                onVideoSelected={setVideoFile}
                selectedVideo={videoFile || undefined}
              />
            </div>

            {/* Reference Images */}
            <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white">Reference Images</h3>
              <ReferenceImageUpload
                label="Reference Face (for face swapping)"
                onImageSelected={setReferenceFace}
                selectedImage={referenceFace || undefined}
              />
              <ReferenceImageUpload
                label="Reference Person (for person replacement)"
                onImageSelected={setReferencePerson}
                selectedImage={referencePerson || undefined}
              />
              <ReferenceImageUpload
                label="Reference Car (for car replacement)"
                onImageSelected={setReferenceCar}
                selectedImage={referenceCar || undefined}
              />
            </div>

            {/* Processing Options */}
            <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
              <ProcessingOptions
                options={processingOptions}
                onOptionsChange={setProcessingOptions}
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartProcessing}
              disabled={!videoFile || isProcessing}
              className="w-full py-4 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Processing
                </>
              )}
            </button>

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                {error}
              </div>
            )}

            {/* Progress */}
            {status && (
              <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
                <ProcessingProgress status={status} />
              </div>
            )}
          </div>

          {/* Right Column - Output */}
          <div className="space-y-6">
            {/* Frame Preview */}
            {frames.length > 0 && (
              <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
                <FramePreview frames={frames} />
              </div>
            )}

            {/* Frame Classification */}
            {frames.length > 0 && (
              <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
                <FrameClassificationDisplay frames={frames} />
              </div>
            )}

            {/* Result Video */}
            {status?.resultVideoUrl && (
              <div className="bg-white/5 border border-purple-500/20 rounded-xl p-6">
                <ResultVideo videoUrl={status.resultVideoUrl} />
              </div>
            )}

            {/* Info */}
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
              <h3 className="text-purple-300 font-semibold mb-2">Tips:</h3>
              <ul className="text-purple-200/80 text-sm space-y-1 list-disc list-inside">
                <li>Start with key frames only for faster testing</li>
                <li>Use high-quality reference images for best results</li>
                <li>Processing time depends on video length and options</li>
                <li>Enable upscaling for higher quality output</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

