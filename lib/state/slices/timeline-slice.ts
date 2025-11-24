import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, TimelineSlice } from '../types';
import { TimelineClip, GeneratedVideo, AudioTrack, ImageTrack, TextOverlay, NarrationTrack, NarrationVoice, SplashScreen, SplashLogo, SplashText } from '@/lib/types';

export const createTimelineSlice: StateCreator<ProjectStore, [], [], TimelineSlice> = (set, get) => ({
  timelineClips: [],
  timelineHistory: [],
  timelineFuture: [],
  selectedClipId: null,

  // Audio tracks
  audioTracks: [],
  selectedAudioTrackId: null,

  // Image tracks
  imageTracks: [],
  selectedImageTrackId: null,

  setSelectedClipId: (clipId) => {
    set({ selectedClipId: clipId });
  },

  addImageClip: (imageUrl, duration, title = 'Image Clip', insertAtTime) => {
    set((state) => {
      const newHistory = [...state.timelineHistory, state.timelineClips];

      const newClip: TimelineClip = {
        id: uuidv4(),
        type: 'image',
        sceneIndex: -1, // Not from a scene
        sceneId: uuidv4(), // Generate a unique ID
        title,
        imageUrl,
        imageLocalPath: imageUrl,
        animation: 'none',
        startTime: insertAtTime ?? state.timelineClips.reduce((max, c) => Math.max(max, c.endTime), 0),
        duration,
        sourceDuration: duration,
        endTime: 0, // Will be calculated below
      };

      // Calculate end time
      newClip.endTime = newClip.startTime + newClip.duration;

      // Insert clip and adjust subsequent clips
      const insertIndex = insertAtTime !== undefined
        ? state.timelineClips.findIndex(c => c.startTime >= insertAtTime)
        : -1;

      let newClips: TimelineClip[];

      if (insertIndex === -1) {
        // Add to end
        newClips = [...state.timelineClips, newClip];
      } else {
        // Insert at position and shift subsequent clips
        newClips = [
          ...state.timelineClips.slice(0, insertIndex),
          newClip,
          ...state.timelineClips.slice(insertIndex).map(c => ({
            ...c,
            startTime: c.startTime + duration,
            endTime: c.endTime + duration,
          })),
        ];
      }

      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },

  initializeTimelineClips: () => {
    set((state) => {
      if (!state.project) return state;

      const clips: TimelineClip[] = [];
      let currentTime = 0;

      // Sort scenes by scene number (supports decimal numbers like 1, 1.1, 2, 2.1, etc.)
      const sortedScenes = [...state.scenes].sort((a, b) => {
        const aOrder = a.order ?? 0;
        const bOrder = b.order ?? 0;
        return aOrder - bOrder;
      });

      sortedScenes.forEach((scene, sceneIndex) => {
        let video: GeneratedVideo | undefined;
        if (scene.selectedVideoId && scene.generatedVideos) {
          video = scene.generatedVideos.find(v => v.id === scene.selectedVideoId);
        }

        if (!video && scene.videoLocalPath) {
          video = {
            id: uuidv4(),
            url: scene.videoLocalPath.startsWith('http')
              ? scene.videoLocalPath
              : `/api/serve-video?path=${encodeURIComponent(scene.videoLocalPath)}`,
            localPath: scene.videoLocalPath,
            actualDuration: scene.actualDuration,
            timestamp: new Date().toISOString(),
          };
        }

        if (video && video.localPath) {
          const duration = video.actualDuration || scene.suggestedDuration || 3;

          // IMPORTANT: Only add clip if it has a valid videoLocalPath
          // This prevents "Cannot process non-video clip" errors
          clips.push({
            id: uuidv4(),
            type: 'video',
            sceneIndex,
            sceneId: scene.id,
            title: scene.description,
            videoId: video.id,
            videoLocalPath: video.localPath,
            startTime: currentTime,
            duration,
            trimStart: 0,
            trimEnd: duration,
            sourceDuration: duration,
            endTime: currentTime + duration,
          });
          currentTime += duration;
        } else {
          console.warn(`[Timeline] Scene ${sceneIndex} skipped - no video available`, {
            hasSelectedVideoId: !!scene.selectedVideoId,
            hasGeneratedVideos: !!(scene.generatedVideos?.length),
            hasVideoLocalPath: !!scene.videoLocalPath,
          });
        }
      });

      return {
        timelineClips: clips,
        timelineHistory: [clips],
        timelineFuture: [],
      };
    });
  },
  
  splitClip: (clipId, splitTime) => {
    set((state) => {
      const clipIndex = state.timelineClips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return state;
      
      const clip = state.timelineClips[clipIndex];
      const relativeSplitTime = splitTime - clip.startTime;
      
      // Validate split time is within clip bounds
      if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Create first part of the split clip
      const firstClip: TimelineClip = {
        ...clip,
        duration: relativeSplitTime,
        trimEnd: (clip.trimStart || 0) + relativeSplitTime,
        endTime: clip.startTime + relativeSplitTime,
      };
      
      // Create second part of the split clip
      const secondClip: TimelineClip = {
        ...clip,
        id: uuidv4(),
        duration: clip.duration - relativeSplitTime,
        trimStart: (clip.trimStart || 0) + relativeSplitTime,
        isSplit: true,
        originalClipId: clipId,
        // startTime and endTime will be recalculated below
        startTime: 0,
        endTime: 0,
      };
      
      // Replace the original clip with the two new clips
      const newClips = [...state.timelineClips];
      newClips.splice(clipIndex, 1, firstClip, secondClip);
      
      // Recalculate all positions sequentially to ensure no gaps or overlaps
      let currentTime = 0;
      const reorderedClips = newClips.map(c => {
        const updatedClip = {
          ...c,
          startTime: currentTime,
          endTime: currentTime + c.duration,
        };
        currentTime += c.duration;
        return updatedClip;
      });
      
      return {
        timelineClips: reorderedClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },
  
  splitAtPlayhead: (time) => {
    const state = get();
    const clip = state.timelineClips.find(
      c => time >= c.startTime && time < c.endTime
    );
    if (clip) {
      get().splitClip(clip.id, time);
    }
  },
  
  deleteClip: (clipId) => {
    set((state) => {
      const clipIndex = state.timelineClips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Filter out the deleted clip
      const filteredClips = state.timelineClips.filter(c => c.id !== clipId);
      
      // Recalculate all positions sequentially to ensure no gaps
      let currentTime = 0;
      const newClips = filteredClips.map(c => {
        const updatedClip = {
          ...c,
          startTime: currentTime,
          endTime: currentTime + c.duration,
        };
        currentTime += c.duration;
        return updatedClip;
      });
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
        selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
      };
    });
  },
  
  cropClip: (clipId, trimStart, trimEnd) => {
    set((state) => {
      const clipIndex = state.timelineClips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return state;
      
      const clip = state.timelineClips[clipIndex];
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      const sourceDuration = clip.sourceDuration;
      const validTrimStart = Math.max(0, Math.min(trimStart, sourceDuration));
      const validTrimEnd = Math.max(validTrimStart, Math.min(trimEnd, sourceDuration));
      const newDuration = validTrimEnd - validTrimStart;
      
      // Update the clip with new trim values
      const updatedClips = state.timelineClips.map(c => {
        if (c.id === clipId) {
          return {
            ...c,
            trimStart: validTrimStart,
            trimEnd: validTrimEnd,
            duration: newDuration,
          };
        }
        return c;
      });
      
      // Recalculate all positions sequentially to ensure no gaps
      let currentTime = 0;
      const newClips = updatedClips.map(c => {
        const updatedClip = {
          ...c,
          startTime: currentTime,
          endTime: currentTime + c.duration,
        };
        currentTime += c.duration;
        return updatedClip;
      });
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },

  reorderClip: (clipId, newIndex) => {
    set((state) => {
      const currentIndex = state.timelineClips.findIndex(c => c.id === clipId);
      if (currentIndex === -1) return state;
      
      // Clamp newIndex to valid range
      const clampedNewIndex = Math.max(0, Math.min(newIndex, state.timelineClips.length - 1));
      
      // No change if same position
      if (currentIndex === clampedNewIndex) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      // Create a copy of the clips array
      const reorderedClips = [...state.timelineClips];
      
      // Remove the clip from its current position
      const [movedClip] = reorderedClips.splice(currentIndex, 1);
      
      // Insert it at the new position
      reorderedClips.splice(clampedNewIndex, 0, movedClip);
      
      // Recalculate all positions sequentially to ensure no gaps or overlaps
      let currentTime = 0;
      const newClips = reorderedClips.map(c => {
        const updatedClip = {
          ...c,
          startTime: currentTime,
          endTime: currentTime + c.duration,
        };
        currentTime += c.duration;
        return updatedClip;
      });
      
      return {
        timelineClips: newClips,
        timelineHistory: newHistory,
        timelineFuture: [],
      };
    });
  },
  
  undo: () => {
    set((state) => {
      if (state.timelineHistory.length <= 1) return state;
      
      const previousState = state.timelineHistory[state.timelineHistory.length - 1];
      const newHistory = state.timelineHistory.slice(0, -1);
      const newFuture = [state.timelineClips, ...state.timelineFuture];
      
      return {
        timelineClips: previousState,
        timelineHistory: newHistory,
        timelineFuture: newFuture,
      };
    });
  },
  
  redo: () => {
    set((state) => {
      if (state.timelineFuture.length === 0) return state;
      
      const nextState = state.timelineFuture[0];
      const newFuture = state.timelineFuture.slice(1);
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      return {
        timelineClips: nextState,
        timelineHistory: newHistory,
        timelineFuture: newFuture,
      };
    });
  },
  
  canUndo: () => {
    const state = get();
    return state.timelineHistory.length > 1;
  },
  
  canRedo: () => {
    const state = get();
    return state.timelineFuture.length > 0;
  },

  // Audio track management
  addAudioTrack: (audioUrl, title = 'Audio Track', duration) => {
    set((state) => {
      const newTrack: AudioTrack = {
        id: uuidv4(),
        title,
        audioUrl,
        audioLocalPath: audioUrl,
        startTime: 0,
        duration: duration || 10, // Default 10 seconds if not provided
        volume: 100,
        endTime: duration || 10,
        sourceDuration: duration || 10,
      };

      return {
        audioTracks: [...state.audioTracks, newTrack],
      };
    });
  },

  deleteAudioTrack: (trackId) => {
    set((state) => ({
      audioTracks: state.audioTracks.filter(t => t.id !== trackId),
      selectedAudioTrackId: state.selectedAudioTrackId === trackId ? null : state.selectedAudioTrackId,
    }));
  },

  updateAudioTrack: (trackId, updates) => {
    set((state) => ({
      audioTracks: state.audioTracks.map(track => {
        if (track.id === trackId) {
          const updatedTrack = { ...track, ...updates };
          // Recalculate endTime if startTime or duration changed
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            updatedTrack.endTime = updatedTrack.startTime + updatedTrack.duration;
          }
          return updatedTrack;
        }
        return track;
      }),
    }));
  },

  setSelectedAudioTrackId: (trackId) => {
    set({ selectedAudioTrackId: trackId });
  },

  // Image track management
  addImageTrack: (imageUrl, duration, title = 'Image Track') => {
    set((state) => {
      const newTrack: ImageTrack = {
        id: uuidv4(),
        title,
        imageUrl,
        imageLocalPath: imageUrl,
        startTime: 0,
        duration,
        animation: 'none',
        endTime: duration,
      };

      return {
        imageTracks: [...state.imageTracks, newTrack],
      };
    });
  },

  deleteImageTrack: (trackId) => {
    set((state) => ({
      imageTracks: state.imageTracks.filter(t => t.id !== trackId),
      selectedImageTrackId: state.selectedImageTrackId === trackId ? null : state.selectedImageTrackId,
    }));
  },

  updateImageTrack: (trackId, updates) => {
    set((state) => ({
      imageTracks: state.imageTracks.map(track => {
        if (track.id === trackId) {
          const updatedTrack = { ...track, ...updates };
          // Recalculate endTime if startTime or duration changed
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            updatedTrack.endTime = updatedTrack.startTime + updatedTrack.duration;
          }
          return updatedTrack;
        }
        return track;
      }),
    }));
  },

  setSelectedImageTrackId: (trackId) => {
    set({ selectedImageTrackId: trackId });
  },

  // Narration track management
  narrationTracks: [],
  selectedNarrationTrackId: null,

  addNarrationTrack: (audioUrl, text, voice, duration, title = 'Narration', speed = 1.0) => {
    set((state) => {
      const newTrack: NarrationTrack = {
        id: uuidv4(),
        title,
        text,
        audioUrl,
        audioLocalPath: audioUrl,
        startTime: 0,
        duration,
        volume: 100,
        voice,
        speed,
        endTime: duration,
        sourceDuration: duration,
      };

      return {
        narrationTracks: [...state.narrationTracks, newTrack],
      };
    });
  },

  deleteNarrationTrack: (trackId) => {
    set((state) => ({
      narrationTracks: state.narrationTracks.filter(t => t.id !== trackId),
      selectedNarrationTrackId: state.selectedNarrationTrackId === trackId ? null : state.selectedNarrationTrackId,
    }));
  },

  updateNarrationTrack: (trackId, updates) => {
    set((state) => ({
      narrationTracks: state.narrationTracks.map(track => {
        if (track.id === trackId) {
          const updatedTrack = { ...track, ...updates };
          // Recalculate endTime if startTime or duration changed
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            updatedTrack.endTime = updatedTrack.startTime + updatedTrack.duration;
          }
          return updatedTrack;
        }
        return track;
      }),
    }));
  },

  setSelectedNarrationTrackId: (trackId) => {
    set({ selectedNarrationTrackId: trackId });
  },

  // Text overlay management
  textOverlays: [],
  selectedTextOverlayId: null,

  addTextOverlay: (text, startTime, duration = 3) => {
    set((state) => {
      const newOverlay: TextOverlay = {
        id: uuidv4(),
        text,
        startTime,
        duration,
        x: 0.5, // Center horizontally
        y: 0.85, // Bottom third
        fontSize: 48,
        fontFamily: 'Arial',
        fontColor: '#FFFFFF',
        fontWeight: 'normal',
        textAlign: 'center',
        opacity: 1.0,
        rotation: 0.0,
        backgroundOpacity: 0.0,
        borderWidth: 0,
        shadowEnabled: false,
        shadowOffsetX: 2,
        shadowOffsetY: 2,
        shadowBlur: 4,
        shadowColor: '#000000',
        order: state.textOverlays.length,
        endTime: startTime + duration,
      };

      return {
        textOverlays: [...state.textOverlays, newOverlay],
      };
    });
  },

  deleteTextOverlay: (overlayId) => {
    set((state) => ({
      textOverlays: state.textOverlays.filter(o => o.id !== overlayId),
      selectedTextOverlayId: state.selectedTextOverlayId === overlayId ? null : state.selectedTextOverlayId,
    }));
  },

  updateTextOverlay: (overlayId, updates) => {
    set((state) => ({
      textOverlays: state.textOverlays.map(overlay => {
        if (overlay.id === overlayId) {
          const updatedOverlay = { ...overlay, ...updates };
          // Recalculate endTime if startTime or duration changed
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            updatedOverlay.endTime = updatedOverlay.startTime + updatedOverlay.duration;
          }
          return updatedOverlay;
        }
        return overlay;
      }),
    }));
  },

  setSelectedTextOverlayId: (overlayId) => {
    set({ selectedTextOverlayId: overlayId });
  },

  duplicateTextOverlay: (overlayId) => {
    set((state) => {
      const overlay = state.textOverlays.find(o => o.id === overlayId);
      if (!overlay) return state;

      const newOverlay: TextOverlay = {
        ...overlay,
        id: uuidv4(),
        order: state.textOverlays.length,
      };

      return {
        textOverlays: [...state.textOverlays, newOverlay],
      };
    });
  },

  // Splash screen management
  splashScreens: [],
  selectedSplashScreenId: null,

  addSplashScreen: (title = 'End Card', duration = 3) => {
    set((state) => {
      // Calculate start time - add to end of timeline
      const totalDuration = state.timelineClips.reduce((max, c) => Math.max(max, c.endTime), 0);

      const newSplash: SplashScreen = {
        id: uuidv4(),
        title,
        startTime: totalDuration,
        duration,
        backgroundColor: '#000000',
        backgroundImageOpacity: 1.0,
        logos: [],
        textElements: [],
        fadeIn: 0.5,
        fadeOut: 0.5,
        endTime: totalDuration + duration,
      };

      return {
        splashScreens: [...state.splashScreens, newSplash],
        selectedSplashScreenId: newSplash.id,
      };
    });
  },

  deleteSplashScreen: (splashId) => {
    set((state) => ({
      splashScreens: state.splashScreens.filter(s => s.id !== splashId),
      selectedSplashScreenId: state.selectedSplashScreenId === splashId ? null : state.selectedSplashScreenId,
    }));
  },

  updateSplashScreen: (splashId, updates) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          const updatedSplash = { ...splash, ...updates };
          // Recalculate endTime if startTime or duration changed
          if (updates.startTime !== undefined || updates.duration !== undefined) {
            updatedSplash.endTime = updatedSplash.startTime + updatedSplash.duration;
          }
          return updatedSplash;
        }
        return splash;
      }),
    }));
  },

  setSelectedSplashScreenId: (splashId) => {
    set({ selectedSplashScreenId: splashId });
  },

  duplicateSplashScreen: (splashId) => {
    set((state) => {
      const splash = state.splashScreens.find(s => s.id === splashId);
      if (!splash) return state;

      const newSplash: SplashScreen = {
        ...splash,
        id: uuidv4(),
        title: `${splash.title} (Copy)`,
        logos: splash.logos.map(logo => ({ ...logo, id: uuidv4() })),
        textElements: splash.textElements.map(text => ({ ...text, id: uuidv4() })),
      };

      return {
        splashScreens: [...state.splashScreens, newSplash],
      };
    });
  },

  // Splash screen logo management
  addSplashLogo: (splashId, imageUrl) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          const newLogo: SplashLogo = {
            id: uuidv4(),
            imageUrl,
            imageLocalPath: imageUrl,
            x: 0.5,
            y: 0.5,
            width: 200,
            height: 200,
            opacity: 1.0,
            rotation: 0,
            order: splash.logos.length,
          };
          return {
            ...splash,
            logos: [...splash.logos, newLogo],
          };
        }
        return splash;
      }),
    }));
  },

  deleteSplashLogo: (splashId, logoId) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          return {
            ...splash,
            logos: splash.logos.filter(logo => logo.id !== logoId),
          };
        }
        return splash;
      }),
    }));
  },

  updateSplashLogo: (splashId, logoId, updates) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          return {
            ...splash,
            logos: splash.logos.map(logo =>
              logo.id === logoId ? { ...logo, ...updates } : logo
            ),
          };
        }
        return splash;
      }),
    }));
  },

  // Splash screen text management
  addSplashText: (splashId, text) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          const newText: SplashText = {
            id: uuidv4(),
            text,
            x: 0.5,
            y: 0.5,
            fontSize: 48,
            fontFamily: 'Arial',
            fontColor: '#FFFFFF',
            fontWeight: 'normal',
            textAlign: 'center',
            opacity: 1.0,
            rotation: 0,
            backgroundOpacity: 0.0,
            borderWidth: 0,
            shadowEnabled: false,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            shadowBlur: 4,
            shadowColor: '#000000',
            order: splash.textElements.length,
          };
          return {
            ...splash,
            textElements: [...splash.textElements, newText],
          };
        }
        return splash;
      }),
    }));
  },

  deleteSplashText: (splashId, textId) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          return {
            ...splash,
            textElements: splash.textElements.filter(text => text.id !== textId),
          };
        }
        return splash;
      }),
    }));
  },

  updateSplashText: (splashId, textId, updates) => {
    set((state) => ({
      splashScreens: state.splashScreens.map(splash => {
        if (splash.id === splashId) {
          return {
            ...splash,
            textElements: splash.textElements.map(text =>
              text.id === textId ? { ...text, ...updates } : text
            ),
          };
        }
        return splash;
      }),
    }));
  },
});



