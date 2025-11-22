import { StateCreator } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { ProjectStore, TimelineSlice } from '../types';
import { TimelineClip, GeneratedVideo } from '@/lib/types';

export const createTimelineSlice: StateCreator<ProjectStore, [], [], TimelineSlice> = (set, get) => ({
  timelineClips: [],
  timelineHistory: [],
  timelineFuture: [],
  selectedClipId: null,

  setSelectedClipId: (clipId) => {
    set({ selectedClipId: clipId });
  },
  
  initializeTimelineClips: () => {
    set((state) => {
      if (!state.project) return state;

      const clips: TimelineClip[] = [];
      let currentTime = 0;

      state.scenes.forEach((scene, sceneIndex) => {
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
});



