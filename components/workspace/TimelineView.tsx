'use client';

import { useProjectStore } from '@/lib/state/project-store';
import VideoPlayer from './VideoPlayer';
import TimelineClip from './TimelineClip';
import TimelineToolbar from './TimelineToolbar';
import AudioTrackItem from './AudioTrackItem';
import ImageTrackItem from './ImageTrackItem';
import { Clock, Play, Download, Loader2, AlertCircle, RefreshCw, Film, ZoomIn, ZoomOut, X, Music, Image as ImageIcon, Plus } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { stitchVideos, applyClipEdits, generatePreview } from '@/lib/api-client';

export default function TimelineView() {
  const {
    project,
    scenes,
    timelineClips,
    initializeTimelineClips,
    splitClip,
    deleteClip,
    cropClip,
    setFinalVideo,
    addChatMessage,
    selectedClipId,
    setSelectedClipId,
    // Audio tracks
    audioTracks,
    selectedAudioTrackId,
    addAudioTrack,
    deleteAudioTrack,
    updateAudioTrack,
    setSelectedAudioTrackId,
    // Image clips
    addImageClip,
    // Image tracks
    imageTracks,
    selectedImageTrackId,
    addImageTrack,
    deleteImageTrack,
    updateImageTrack,
    setSelectedImageTrackId,
  } = useProjectStore();

  const [isStitching, setIsStitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, >1 = zoomed in, <1 = zoomed out
  const [currentTimelineTime, setCurrentTimelineTime] = useState(0); // Overall timeline playback time
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [actualVideoDuration, setActualVideoDuration] = useState<number | null>(null);
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [showAddAudioDialog, setShowAddAudioDialog] = useState(false);
  const [showAddImageDialog, setShowAddImageDialog] = useState(false);
  const [newAudioUrl, setNewAudioUrl] = useState('');
  const [newAudioTitle, setNewAudioTitle] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [newImageTitle, setNewImageTitle] = useState('');
  const [newImageDuration, setNewImageDuration] = useState(5);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const preservedTimeRef = useRef<number | null>(null); // Track position to preserve after preview regeneration
  const isRestoringPositionRef = useRef(false); // Prevent seeking event from overriding restored position

  // Get selected clip for crop dialog
  const selectedClip = selectedClipId ? timelineClips.find(c => c.id === selectedClipId) : null;
  const [cropStart, setCropStart] = useState(0);
  const [cropEnd, setCropEnd] = useState(0);

  // Update crop values when selected clip changes
  useEffect(() => {
    if (selectedClip) {
      setCropStart(selectedClip.trimStart || 0);
      setCropEnd(selectedClip.trimEnd || selectedClip.sourceDuration);
    }
  }, [selectedClip]);

  // Initialize timeline clips when scenes change
  useEffect(() => {
    if (project && scenes.length > 0 && !isInitialized) {
      const hasVideos = scenes.some(s => {
        if (s.selectedVideoId && s.generatedVideos) {
          return s.generatedVideos.some(v => v.id === s.selectedVideoId);
        }
        return !!s.videoLocalPath;
      });

      if (hasVideos) {
        initializeTimelineClips();
        setIsInitialized(true);
      }
    }
  }, [project, scenes, isInitialized, initializeTimelineClips]);

  // Generate preview video when clips are ready or edited
  useEffect(() => {
    if (!project || timelineClips.length === 0) return;

    let cancelled = false;

    const generatePreviewVideo = async () => {
      // Preserve current position before regenerating
      preservedTimeRef.current = mappedTimelineTime;

      setIsGeneratingPreview(true);
      setError(null);
      setActualVideoDuration(null); // Reset duration for new preview

      try {
        addChatMessage({
          role: 'agent',
          content: 'Generating preview video...',
          type: 'status',
        });

        // Only include video clips for preview generation (not image clips)
        const videoClips = timelineClips.filter(clip => clip.type === 'video' && clip.videoLocalPath);

        const previewPath = await generatePreview(
          videoClips.map(clip => ({
            id: clip.id,
            videoLocalPath: clip.videoLocalPath!,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
            sourceDuration: clip.sourceDuration,
          })),
          project.id
        );

        if (cancelled) return;

        const previewUrl = previewPath.startsWith('http://') || previewPath.startsWith('https://')
          ? previewPath
          : `/api/serve-video?path=${encodeURIComponent(previewPath)}`;

        setPreviewVideoUrl(previewUrl);

        addChatMessage({
          role: 'agent',
          content: 'Preview video ready',
          type: 'status',
        });
      } catch (err) {
        if (cancelled) return;
        const errorMessage = err instanceof Error ? err.message : 'Failed to generate preview';
        setError(errorMessage);
        console.error('[TimelineView] Preview generation error:', err);
      } finally {
        if (!cancelled) {
          setIsGeneratingPreview(false);
        }
      }
    };

    // Debounce preview generation to avoid too many requests
    const timeoutId = setTimeout(() => {
      generatePreviewVideo();
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  // Note: mappedTimelineTime is intentionally not in dependencies - we only read it when starting preview generation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, timelineClips, addChatMessage]);

  if (!project || !project.storyboard || project.storyboard.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/60">
        <p className="text-sm">No storyboard available. Generate a storyboard first.</p>
      </div>
    );
  }

  // Calculate total duration from clips or fallback to storyboard
  const totalDuration = timelineClips.length > 0
    ? timelineClips.reduce((sum, clip) => sum + clip.duration, 0)
    : project.storyboard.reduce((sum, scene) => sum + scene.suggestedDuration, 0);
  
  // Zoom controls
  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 10)); // Max 10x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 0.25)); // Min 0.25x zoom (4x zoom out)
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  // Check if all scenes have videos
  const allScenesHaveVideos = scenes.every(s => {
    if (s.selectedVideoId && s.generatedVideos) {
      return s.generatedVideos.some(v => v.id === s.selectedVideoId);
    }
    return !!s.videoLocalPath;
  });

  // Smooth playhead updates - use timeupdate as source of truth, interpolate smoothly
  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  
  useEffect(() => {
    if (!videoRef.current || !previewVideoUrl) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const video = videoRef.current;

    // Use timeupdate event as the authoritative source of truth
    // This fires when the video actually updates (not just when we poll)
    const handleTimeUpdate = () => {
      if (video && !video.paused) {
        const videoTime = Math.max(0, video.currentTime || 0);
        lastVideoTimeRef.current = videoTime;
        lastUpdateTimeRef.current = performance.now();
        setCurrentTimelineTime(videoTime);
      }
    };

    // Smooth interpolation between timeupdate events
    const updatePlayhead = () => {
      if (!video || video.paused || !isPlaying) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      const now = performance.now();
      const timeSinceLastUpdate = (now - lastUpdateTimeRef.current) / 1000; // Convert to seconds
      
      // Get actual video time as the absolute maximum
      const actualVideoTime = Math.max(0, video.currentTime || 0);
      
      // Only interpolate if we have a recent timeupdate (within 0.05 seconds)
      // Use a shorter window to prevent getting ahead
      if (timeSinceLastUpdate < 0.05 && lastVideoTimeRef.current <= actualVideoTime) {
        // Interpolate smoothly based on playback rate
        const playbackRate = video.playbackRate || 1;
        const interpolatedTime = lastVideoTimeRef.current + (timeSinceLastUpdate * playbackRate);
        
        // CRITICAL: Never let interpolation exceed actual video time
        // Use actualVideoTime as the hard limit
        const clampedTime = Math.min(interpolatedTime, actualVideoTime);
        
        setCurrentTimelineTime(clampedTime);
      } else {
        // Always use actual video time - never interpolate ahead
        setCurrentTimelineTime(actualVideoTime);
        lastVideoTimeRef.current = actualVideoTime;
        lastUpdateTimeRef.current = now;
      }

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    const handlePlay = () => {
      // Reset timing references
      if (video) {
        lastVideoTimeRef.current = Math.max(0, video.currentTime || 0);
        lastUpdateTimeRef.current = performance.now();
      }
      // Start animation loop
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    const handlePause = () => {
      // Stop animation loop when paused
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Update one final time with current video time
      if (video) {
        const videoTime = Math.max(0, video.currentTime || 0);
        setCurrentTimelineTime(videoTime);
        lastVideoTimeRef.current = videoTime;
        lastUpdateTimeRef.current = performance.now();
      }
    };

    const handleEnded = () => {
      // Video ended, stop playback and animation loop
      setIsPlaying(false);
      // Use actual video duration for accurate end position
      const endTime = video?.duration || totalDuration;
      setCurrentTimelineTime(endTime);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };

    const handleSeeking = () => {
      // When user seeks, immediately update timeline time
      if (video) {
        const videoTime = Math.max(0, video.currentTime || 0);
        setCurrentTimelineTime(videoTime);
        lastVideoTimeRef.current = videoTime;
        lastUpdateTimeRef.current = performance.now();
      }
    };

    // Start animation loop if already playing
    if (isPlaying && !video.paused) {
      lastVideoTimeRef.current = Math.max(0, video.currentTime || 0);
      lastUpdateTimeRef.current = performance.now();
      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    }

    // Use timeupdate as the authoritative source
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('seeking', handleSeeking);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('seeking', handleSeeking);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [previewVideoUrl, isPlaying, totalDuration]);

  // Calculate playhead position on timeline (smooth, no jumps)
  // Map video time to timeline time for accurate positioning
  const playheadPosition = useMemo(() => {
    if (totalDuration === 0) return 0;

    // If actual video duration differs from timeline duration, scale the position
    let mappedTime = currentTimelineTime;
    if (actualVideoDuration && actualVideoDuration !== totalDuration) {
      // Map video time to timeline time
      const ratio = totalDuration / actualVideoDuration;
      mappedTime = currentTimelineTime * ratio;
    }

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(mappedTime, totalDuration));
    return (clampedTime / totalDuration) * 100;
  }, [currentTimelineTime, totalDuration, actualVideoDuration]);

  // Get the mapped timeline time for split operations
  const mappedTimelineTime = useMemo(() => {
    if (!actualVideoDuration || actualVideoDuration === totalDuration) {
      return currentTimelineTime;
    }
    // Map video time to timeline time
    const ratio = totalDuration / actualVideoDuration;
    return currentTimelineTime * ratio;
  }, [currentTimelineTime, totalDuration, actualVideoDuration]);

  // Handle play/pause
  const handlePlayPause = () => {
    if (!videoRef.current || !previewVideoUrl) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      // Start from beginning if at end - use actual video duration
      const effectiveDuration = actualVideoDuration || totalDuration;
      if (currentTimelineTime >= effectiveDuration - 0.1) {
        setCurrentTimelineTime(0);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
        }
      }
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  // Get video paths for stitching
  const getVideoPathsForStitching = () => {
    if (timelineClips.length > 0) {
      // Only include video clips, not image clips
      return timelineClips
        .filter(clip => clip.type === 'video' && clip.videoLocalPath)
        .map(clip => clip.videoLocalPath!);
    }
    return scenes
      .map(s => {
        if (s.selectedVideoId && s.generatedVideos) {
          const selectedVideo = s.generatedVideos.find(v => v.id === s.selectedVideoId);
          return selectedVideo?.localPath;
        }
        return s.videoLocalPath;
      })
      .filter((path): path is string => !!path);
  };

  const handleSplit = (clipId: string, time: number) => {
    splitClip(clipId, time);
    // Preview will be regenerated automatically via useEffect
    addChatMessage({
      role: 'agent',
      content: 'Clip split successfully. Regenerating preview...',
      type: 'status',
    });
  };

  const handleDelete = (clipId: string) => {
    deleteClip(clipId);
    if (selectedClipId === clipId) {
      setSelectedClipId(null);
    }
    // Preview will be regenerated automatically via useEffect
    addChatMessage({
      role: 'agent',
      content: 'Clip deleted. Regenerating preview...',
      type: 'status',
    });
  };

  const handleCrop = (clipId: string, trimStart: number, trimEnd: number) => {
    cropClip(clipId, trimStart, trimEnd);
    // Preview will be regenerated automatically via useEffect
    addChatMessage({
      role: 'agent',
      content: 'Clip cropped successfully. Regenerating preview...',
      type: 'status',
    });
  };

  const handleStitchVideos = async () => {
    const videoPaths = getVideoPathsForStitching();
    
    if (!project || videoPaths.length === 0) {
      setError('No videos available to stitch');
      return;
    }

    setIsStitching(true);
    setError(null);

    try {
      addChatMessage({
        role: 'agent',
        content: `Stitching ${videoPaths.length} video${videoPaths.length > 1 ? 's' : ''} together...`,
        type: 'status',
      });

      // If clips have been edited, apply edits first (only for video clips)
      let pathsToStitch = videoPaths;
      const videoClips = timelineClips.filter(c => c.type === 'video' && c.videoLocalPath);
      if (videoClips.length > 0 && videoClips.some(c => c.trimStart || c.trimEnd)) {
        addChatMessage({
          role: 'agent',
          content: 'Applying clip edits...',
          type: 'status',
        });
        pathsToStitch = await applyClipEdits(
          videoClips.map(c => ({
            id: c.id,
            videoLocalPath: c.videoLocalPath!,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
            sourceDuration: c.sourceDuration,
          })),
          project.id
        );
      }

      const response = await stitchVideos(pathsToStitch, project.id);

      if (response.finalVideoPath) {
        const finalVideoUrl = response.finalVideoPath.startsWith('http')
          ? response.finalVideoPath
          : `/api/serve-video?path=${encodeURIComponent(response.finalVideoPath)}`;

        setFinalVideo(finalVideoUrl, response.s3Url);

        addChatMessage({
          role: 'agent',
          content: `✓ Final video stitched successfully! Ready for download.`,
          type: 'status',
        });
      } else {
        throw new Error('Failed to stitch videos');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to stitch videos';
      setError(errorMessage);
      addChatMessage({
        role: 'agent',
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
      });
    } finally {
      setIsStitching(false);
    }
  };

  const handleDownload = () => {
    if (!project.finalVideoUrl) return;

    const link = document.createElement('a');
    link.href = project.finalVideoUrl;
    link.download = `video-${project.id}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleRefreshClips = () => {
    setIsInitialized(false);
    initializeTimelineClips();
    setIsInitialized(true);
  };

  const handleClipSelect = (clipId: string) => {
    setSelectedClipId(clipId);
  };

  const handleCropFromToolbar = () => {
    if (selectedClip) {
      setShowCropDialog(true);
    }
  };

  const handleCropApply = () => {
    if (selectedClipId) {
      cropClip(selectedClipId, cropStart, cropEnd);
      setShowCropDialog(false);
      addChatMessage({
        role: 'agent',
        content: 'Clip cropped successfully. Regenerating preview...',
        type: 'status',
      });
    }
  };

  // Audio track handlers
  const handleAddAudio = () => {
    if (!newAudioUrl) return;
    addAudioTrack(newAudioUrl, newAudioTitle || 'Audio Track');
    setNewAudioUrl('');
    setNewAudioTitle('');
    setShowAddAudioDialog(false);
    addChatMessage({
      role: 'agent',
      content: 'Audio track added to timeline',
      type: 'status',
    });
  };

  const handleDeleteAudio = (trackId: string) => {
    deleteAudioTrack(trackId);
    addChatMessage({
      role: 'agent',
      content: 'Audio track deleted',
      type: 'status',
    });
  };

  // Image clip handlers
  const handleAddImageClip = () => {
    if (!newImageUrl || newImageDuration <= 0) return;
    addImageClip(newImageUrl, newImageDuration, newImageTitle || 'Image Clip');
    setNewImageUrl('');
    setNewImageTitle('');
    setNewImageDuration(5);
    setShowAddImageDialog(false);
    addChatMessage({
      role: 'agent',
      content: 'Image clip added to timeline',
      type: 'status',
    });
  };

  // Handle click on timeline to seek
  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (totalDuration <= 0) return;

    // Get the clicked element and find the timeline track container
    const clickedElement = e.currentTarget;

    // Use the timelineTrackRef if available, otherwise use the clicked element's parent structure
    let trackElement = timelineTrackRef.current;

    // If clicking on time markers div, find the sibling track element
    if (!trackElement || !clickedElement.contains(trackElement)) {
      // Find the parent container that holds both time markers and track
      const parentContainer = clickedElement.parentElement;
      if (parentContainer) {
        trackElement = parentContainer.querySelector('[data-timeline-track="true"]') as HTMLDivElement;
      }
    }

    if (!trackElement) {
      console.log('[Timeline] Could not find track element');
      return;
    }

    const rect = trackElement.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    // Get the scrollable parent container
    const scrollContainer = trackElement.parentElement?.parentElement;
    const scrollLeft = scrollContainer?.scrollLeft || 0;

    // Calculate the total width
    const trackWidth = trackElement.offsetWidth;

    // Adjust for scroll position
    const adjustedClickX = clickX + scrollLeft;

    // Calculate percentage based on the track width
    const percentage = Math.max(0, Math.min(1, adjustedClickX / trackWidth));
    const seekTime = percentage * totalDuration;

    // Clamp to valid range (this is timeline time)
    const clampedTimelineTime = Math.max(0, Math.min(seekTime, totalDuration));

    // Map timeline time back to video time if durations differ
    let videoSeekTime = clampedTimelineTime;
    if (actualVideoDuration && actualVideoDuration !== totalDuration) {
      const ratio = actualVideoDuration / totalDuration;
      videoSeekTime = clampedTimelineTime * ratio;
    }

    console.log('[Timeline] Click to seek:', {
      clickX, scrollLeft, trackWidth, percentage,
      timelineTime: clampedTimelineTime,
      videoSeekTime,
      actualVideoDuration,
      totalDuration
    });

    // Update video position with mapped time
    if (videoRef.current) {
      videoRef.current.currentTime = videoSeekTime;
    }

    // Update timeline state with video time (will be mapped back for display)
    setCurrentTimelineTime(videoSeekTime);
  };

  // Keyboard shortcuts for play/pause and other controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Spacebar for play/pause
      if (e.code === 'Space') {
        e.preventDefault();
        // Inline the play/pause logic to avoid stale closure
        if (!videoRef.current || !previewVideoUrl) return;

        if (videoRef.current.paused) {
          // Start from beginning if at end
          const effectiveDuration = actualVideoDuration || totalDuration;
          if (currentTimelineTime >= effectiveDuration - 0.1) {
            setCurrentTimelineTime(0);
            videoRef.current.currentTime = 0;
          }
          videoRef.current.play();
          setIsPlaying(true);
        } else {
          videoRef.current.pause();
          setIsPlaying(false);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewVideoUrl, currentTimelineTime, totalDuration, actualVideoDuration]);

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header - Compact */}
      <div className="px-6 py-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-white/50">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              <span>{totalDuration.toFixed(1)}s</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Film className="w-4 h-4" />
              <span>{timelineClips.length || project.storyboard.length} clip{timelineClips.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          {timelineClips.length > 0 && (
            <button
              onClick={handleRefreshClips}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-white/5 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-all border border-white/10"
              title="Refresh timeline from scenes"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Video Preview Player */}
        {getVideoPathsForStitching().length > 0 && (
          <div className="px-6 py-4 border-b border-white/10 bg-black/50">
            {isGeneratingPreview ? (
              <div className="h-96 flex items-center justify-center bg-white/5 rounded-lg border border-white/10">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                  <p className="text-sm text-white/60">Generating preview video...</p>
                </div>
              </div>
            ) : previewVideoUrl ? (
              <div className="rounded-lg overflow-hidden border border-white/10 bg-black relative group">
                <video
                  key={previewVideoUrl}
                  ref={videoRef}
                  src={previewVideoUrl}
                  className="w-full h-96 cursor-pointer"
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      // Store the actual video duration for accurate playhead sync
                      const videoDuration = videoRef.current.duration;
                      if (videoDuration && isFinite(videoDuration)) {
                        setActualVideoDuration(videoDuration);
                        console.log(`[Timeline] Video duration: ${videoDuration.toFixed(2)}s (timeline: ${totalDuration.toFixed(2)}s)`);
                      }

                      // Restore preserved position or reset to start
                      if (preservedTimeRef.current !== null && preservedTimeRef.current > 0) {
                        // Set flag to prevent onSeeking from overriding
                        isRestoringPositionRef.current = true;

                        // Map the preserved timeline position back to video time
                        let videoTime = preservedTimeRef.current;
                        if (videoDuration && videoDuration !== totalDuration) {
                          const ratio = videoDuration / totalDuration;
                          videoTime = preservedTimeRef.current * ratio;
                        }
                        // Clamp to valid range
                        videoTime = Math.max(0, Math.min(videoTime, videoDuration || totalDuration));
                        videoRef.current.currentTime = videoTime;
                        setCurrentTimelineTime(videoTime);
                        console.log(`[Timeline] Restored position: ${preservedTimeRef.current.toFixed(2)}s → video time: ${videoTime.toFixed(2)}s`);
                        preservedTimeRef.current = null;

                        // Reset flag after a short delay to allow the seek to complete
                        setTimeout(() => {
                          isRestoringPositionRef.current = false;
                        }, 100);
                      } else {
                        // Reset to start for initial load
                        videoRef.current.currentTime = 0;
                        setCurrentTimelineTime(0);
                      }
                    }
                  }}
                  onPlay={() => {
                    setIsPlaying(true);
                  }}
                  onPause={() => {
                    setIsPlaying(false);
                  }}
                  onSeeking={() => {
                    // Immediately sync timeline when user seeks
                    // But skip if we're in the middle of restoring position
                    if (videoRef.current && !isRestoringPositionRef.current) {
                      setCurrentTimelineTime(Math.max(0, videoRef.current.currentTime || 0));
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlayPause();
                  }}
                  preload="auto"
                />
                {/* Custom Play/Pause Overlay - Only show play button when paused */}
                {!isPlaying && (
                  <div
                    className="absolute inset-0 flex items-center justify-center cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPause();
                    }}
                  >
                    <div className="p-4 bg-black/60 hover:bg-black/80 rounded-full transition-colors">
                      <Play className="w-8 h-8 text-white" />
                    </div>
                  </div>
                )}
                {/* Timeline Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${playheadPosition}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center bg-white/5 rounded-lg border border-white/10">
                <p className="text-sm text-white/40">Generating preview...</p>
              </div>
            )}
          </div>
        )}

        {/* Timeline Track Section */}
        <div className="flex-1 flex flex-col overflow-hidden px-6 py-4">
          {/* Toolbar */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TimelineToolbar
                currentTime={mappedTimelineTime}
                onCropClick={handleCropFromToolbar}
              />
              <button
                onClick={() => setShowAddImageDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded border border-purple-500/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Image Clip
              </button>
            </div>
            <div className="flex items-center gap-4">
              {/* Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                disabled={!previewVideoUrl}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  previewVideoUrl
                    ? 'bg-white/10 hover:bg-white/20 text-white'
                    : 'bg-white/5 text-white/30 cursor-not-allowed'
                }`}
              >
                {isPlaying ? (
                  <>
                    <span className="w-3 h-3 flex items-center justify-center">⏸</span>
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3" />
                    Play
                  </>
                )}
              </button>
              <div className="text-xs text-white/40">
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Space</kbd> Play/Pause
                <span className="mx-2">|</span>
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">S</kbd> Split
                <span className="mx-2">|</span>
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px]">Del</kbd> Delete
              </div>
            </div>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-white/80">Timeline Track</h3>
              
              {/* Zoom Controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4 text-white/80" />
                </button>
                <span className="text-xs text-white/50 font-mono min-w-[3rem] text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4 text-white/80" />
                </button>
                {zoomLevel !== 1 && (
                  <button
                    onClick={handleZoomReset}
                    className="px-2 py-1 text-xs bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors text-white/60 hover:text-white"
                    title="Reset Zoom"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            
            {/* Timeline Container */}
            <div className="relative bg-white/5 rounded-lg border border-white/10 overflow-hidden">
              {/* Scrollable Timeline Wrapper */}
              <div className="overflow-x-auto overflow-y-hidden custom-scrollbar">
                <div 
                  className="relative"
                  style={{ 
                    width: `${Math.max(100, zoomLevel * 100)}%`,
                    minWidth: '100%'
                  }}
                >
                  {/* Time markers - Top - Also clickable for seeking */}
                  <div
                    className="absolute top-0 left-0 right-0 h-8 border-b border-white/10 bg-black/30 backdrop-blur-sm z-10 cursor-pointer"
                    onClick={handleTimelineClick}
                  >
                    <div className="relative h-full pointer-events-none">
                      {Array.from({ length: Math.ceil(totalDuration * zoomLevel) + 1 }).map((_, i) => {
                        const time = i / zoomLevel;
                        if (time > totalDuration) return null;
                        return (
                          <div
                            key={i}
                            className="absolute h-full border-l border-white/10"
                            style={{ left: `${(time / totalDuration) * 100}%` }}
                          >
                            <span className="absolute left-1 top-1 text-[10px] text-white/40 font-mono">
                              {time.toFixed(1)}s
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Timeline Track */}
                  <div
                    ref={timelineTrackRef}
                    className="relative h-28 bg-gradient-to-b from-white/5 to-white/[0.02] pt-8 cursor-pointer"
                    onClick={(e) => {
                      // Always handle click to seek
                      handleTimelineClick(e);
                      // Deselect when clicking directly on track background (not on a clip)
                      if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-timeline-track="true"]')) {
                        // Check if we clicked on the track itself, not on a clip
                        const clickedElement = e.target as HTMLElement;
                        const isClip = clickedElement.closest('[data-clip="true"]');
                        if (!isClip) {
                          setSelectedClipId(null);
                        }
                      }
                    }}
                    data-timeline-track="true"
                  >
                    {timelineClips.length > 0 ? (
                      timelineClips.map((clip) => (
                        <TimelineClip
                          key={clip.id}
                          clip={clip}
                          totalDuration={totalDuration}
                          zoomLevel={zoomLevel}
                          onSplit={handleSplit}
                          onDelete={handleDelete}
                          onCrop={handleCrop}
                          onSelect={() => handleClipSelect(clip.id)}
                          isSelected={selectedClipId === clip.id}
                        />
                      ))
                    ) : (
                      <div className="flex items-center justify-center h-full text-white/30 text-sm">
                        {allScenesHaveVideos
                          ? 'Click "Refresh" to load clips into timeline'
                          : 'Generate videos for scenes to see them in the timeline'}
                      </div>
                    )}
                    
                    {/* Playhead Indicator - Direct positioning for frame-perfect updates */}
                    {totalDuration > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{
                          left: `${playheadPosition}%`,
                          boxShadow: '0 0 4px rgba(239, 68, 68, 0.8)',
                          willChange: 'left', // Optimize for frequent updates
                        }}
                      >
                        <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-lg" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Audio Track Section */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-white/80 flex items-center gap-2">
                  <Music className="w-4 h-4 text-green-400" />
                  Audio Tracks
                </h3>
                <button
                  onClick={() => setShowAddAudioDialog(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded border border-green-500/30 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Audio
                </button>
              </div>
              <div className="relative bg-white/5 rounded-lg border border-white/10 overflow-hidden">
                <div className="overflow-x-auto overflow-y-hidden custom-scrollbar">
                  <div
                    className="relative"
                    style={{
                      width: `${Math.max(100, zoomLevel * 100)}%`,
                      minWidth: '100%'
                    }}
                  >
                    <div className="relative h-20 bg-gradient-to-b from-green-900/10 to-green-950/5">
                      {audioTracks.length > 0 ? (
                        audioTracks.map((track) => (
                          <AudioTrackItem
                            key={track.id}
                            track={track}
                            totalDuration={totalDuration}
                            zoomLevel={zoomLevel}
                            onDelete={handleDeleteAudio}
                            onUpdate={updateAudioTrack}
                            onSelect={() => setSelectedAudioTrackId(track.id)}
                            isSelected={selectedAudioTrackId === track.id}
                          />
                        ))
                      ) : (
                        <div className="flex items-center justify-center h-full text-white/30 text-sm">
                          No audio tracks. Click "Add Audio" to add music or sound effects.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Selected Clip Info */}
          {selectedClip && (
            <div className="mb-4 p-4 bg-white/5 rounded-lg border border-white/10">
              <h4 className="text-sm font-semibold text-white mb-3">{selectedClip.title}</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col">
                  <span className="text-white/40 mb-1">Duration</span>
                  <span className="text-white/80 font-mono">{selectedClip.duration.toFixed(1)}s</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-white/40 mb-1">Timeline Position</span>
                  <span className="text-white/80 font-mono">{selectedClip.startTime.toFixed(1)}s - {selectedClip.endTime.toFixed(1)}s</span>
                </div>
                {selectedClip.trimStart !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 mb-1">Trim Start</span>
                    <span className="text-white/80 font-mono">{selectedClip.trimStart.toFixed(1)}s</span>
                  </div>
                )}
                {selectedClip.trimEnd !== undefined && (
                  <div className="flex flex-col">
                    <span className="text-white/40 mb-1">Trim End</span>
                    <span className="text-white/80 font-mono">{selectedClip.trimEnd.toFixed(1)}s</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {/* Stitch Videos Button */}
            {getVideoPathsForStitching().length > 0 && !project.finalVideoUrl && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-white mb-1">
                      {allScenesHaveVideos ? 'All Clips Ready' : 'Stitch Available Clips'}
                    </h4>
                    <p className="text-xs text-white/50">
                      {getVideoPathsForStitching().length} clip{getVideoPathsForStitching().length !== 1 ? 's' : ''} ready to stitch
                    </p>
                  </div>
                  <button
                    onClick={handleStitchVideos}
                    disabled={isStitching}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {isStitching ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Stitching...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Stitch Final Video
                      </>
                    )}
                  </button>
                </div>
                {error && (
                  <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Final Stitched Video Preview */}
            {project.finalVideoUrl && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-semibold text-white">Final Video</h4>
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors border border-white/10"
                  >
                    <Download className="w-4 h-4" />
                    Download MP4
                  </button>
                </div>
                <VideoPlayer
                  src={project.finalVideoUrl}
                  className="w-full"
                  showDownload={false}
                />
              </div>
            )}

            {/* Empty State */}
            {!allScenesHaveVideos && !project.finalVideoUrl && timelineClips.length === 0 && (
              <div className="flex items-center justify-center h-32 bg-white/5 rounded-lg border-2 border-dashed border-white/10">
                <div className="text-center text-white/40">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">
                    {getVideoPathsForStitching().length} of {project.storyboard.length} scenes have videos
                  </p>
                  <p className="text-xs mt-1">Complete all scenes to see them in the timeline</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Crop Dialog */}
      {showCropDialog && selectedClip && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowCropDialog(false);
            }
          }}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-lg p-6 w-96 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Crop Clip</h3>
              <button
                onClick={() => setShowCropDialog(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Start Time (seconds)
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedClip.sourceDuration}
                  step="0.1"
                  value={cropStart}
                  onChange={(e) => setCropStart(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-2">
                  End Time (seconds)
                </label>
                <input
                  type="number"
                  min={cropStart}
                  max={selectedClip.sourceDuration}
                  step="0.1"
                  value={cropEnd}
                  onChange={(e) => setCropEnd(parseFloat(e.target.value) || selectedClip.sourceDuration)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="text-xs text-white/60 bg-white/5 p-2 rounded">
                Duration: <span className="font-mono">{(cropEnd - cropStart).toFixed(1)}s</span>
                <span className="ml-2 text-white/40">
                  (Source: {selectedClip.sourceDuration.toFixed(1)}s)
                </span>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowCropDialog(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCropApply}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Audio Dialog */}
      {showAddAudioDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddAudioDialog(false);
            }
          }}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-lg p-6 w-96 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Music className="w-5 h-5 text-green-400" />
                Add Audio Track
              </h3>
              <button
                onClick={() => setShowAddAudioDialog(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Audio URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/audio.mp3"
                  value={newAudioUrl}
                  onChange={(e) => setNewAudioUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Track Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="Background Music"
                  value={newAudioTitle}
                  onChange={(e) => setNewAudioTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowAddAudioDialog(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddAudio}
                  disabled={!newAudioUrl}
                  className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Audio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Image Dialog */}
      {showAddImageDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowAddImageDialog(false);
            }
          }}
        >
          <div
            className="bg-gray-900 border border-white/20 rounded-lg p-6 w-96 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-purple-400" />
                Add Image Clip
              </h3>
              <button
                onClick={() => setShowAddImageDialog(false)}
                className="text-white/60 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Image URL
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/image.jpg"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Duration (seconds)
                </label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  placeholder="5.0"
                  value={newImageDuration}
                  onChange={(e) => setNewImageDuration(parseFloat(e.target.value) || 5)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm text-white/80 mb-2">
                  Clip Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="Still Image"
                  value={newImageTitle}
                  onChange={(e) => setNewImageTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="text-xs text-white/60 bg-purple-500/10 p-3 rounded border border-purple-500/20">
                <p className="mb-1 font-semibold">Note:</p>
                <p>The image clip will be added to the end of your timeline. You can reorder clips by adjusting their positions.</p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setShowAddImageDialog(false)}
                  className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddImageClip}
                  disabled={!newImageUrl || newImageDuration <= 0}
                  className="px-4 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Image Clip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
