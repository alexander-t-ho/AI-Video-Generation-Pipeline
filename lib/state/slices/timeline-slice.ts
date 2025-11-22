import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, TimelineSlice } from '../types';
import { TimelineClip, GeneratedVideo, AudioTrack, ImageTrack } from '@/lib/types';

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
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      const relativeSplitTime = splitTime - clip.startTime;
      if (relativeSplitTime <= 0 || relativeSplitTime >= clip.duration) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      const firstClip: TimelineClip = {
        ...clip,
        duration: relativeSplitTime,
        trimEnd: (clip.trimStart || 0) + relativeSplitTime,
        endTime: clip.startTime + relativeSplitTime,
      };
      
      const secondClip: TimelineClip = {
        ...clip,
        id: uuidv4(),
        startTime: clip.startTime + relativeSplitTime,
        duration: clip.duration - relativeSplitTime,
        trimStart: (clip.trimStart || 0) + relativeSplitTime,
        isSplit: true,
        originalClipId: clipId,
        endTime: clip.endTime,
      };
      
      const newClips = state.timelineClips
        .filter(c => c.id !== clipId)
        .map(c => {
          if (c.startTime > clip.startTime) {
            return { ...c, startTime: c.startTime, endTime: c.startTime + c.duration };
          }
          return c;
        });
      
      const insertIndex = newClips.findIndex(c => c.startTime > clip.startTime);
      if (insertIndex === -1) {
        newClips.push(firstClip, secondClip);
      } else {
        newClips.splice(insertIndex, 0, firstClip, secondClip);
      }
      
      return {
        timelineClips: newClips,
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
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      const newClips = state.timelineClips
        .filter(c => c.id !== clipId)
        .map((c, index, arr) => {
          const prevClip = index > 0 ? arr[index - 1] : null;
          const newStartTime = prevClip ? prevClip.endTime : 0;
          return {
            ...c,
            startTime: newStartTime,
            endTime: newStartTime + c.duration,
          };
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
      const clip = state.timelineClips.find(c => c.id === clipId);
      if (!clip) return state;
      
      const newHistory = [...state.timelineHistory, state.timelineClips];
      
      const sourceDuration = clip.sourceDuration;
      const validTrimStart = Math.max(0, Math.min(trimStart, sourceDuration));
      const validTrimEnd = Math.max(validTrimStart, Math.min(trimEnd, sourceDuration));
      const newDuration = validTrimEnd - validTrimStart;
      
      const newClips = state.timelineClips.map(c => {
        if (c.id === clipId) {
          return {
            ...c,
            trimStart: validTrimStart,
            trimEnd: validTrimEnd,
            duration: newDuration,
            endTime: c.startTime + newDuration,
          };
        }
        if (c.startTime > clip.startTime) {
          const offset = clip.duration - newDuration;
          return {
            ...c,
            startTime: c.startTime - offset,
            endTime: c.endTime - offset,
          };
        }
        return c;
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
});



