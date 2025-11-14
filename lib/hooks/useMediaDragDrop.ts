/**
 * Custom hook for handling drag-and-drop of media items
 * Supports dragging from media drawer to editor/timeline
 */

import { useState, useCallback, DragEvent } from 'react';
import { useProjectStore } from '@/lib/state/project-store';
import { DragDropState } from '@/lib/types/components';

interface UseMediaDragDropOptions {
  onDrop?: (itemId: string, itemType: 'image' | 'video' | 'frame', targetSceneIndex?: number) => void;
  dropZoneId?: string;
  acceptedTypes?: ('image' | 'video' | 'frame')[];
}

interface UseMediaDragDropReturn {
  isDragging: boolean;
  isOverDropZone: boolean;
  draggedItem: {
    id?: string;
    type?: 'image' | 'video' | 'frame';
  } | null;
  handleDragStart: (e: DragEvent, itemId: string, itemType: 'image' | 'video' | 'frame') => void;
  handleDragEnd: () => void;
  handleDragOver: (e: DragEvent) => void;
  handleDragLeave: () => void;
  handleDrop: (e: DragEvent, targetSceneIndex?: number) => void;
  // Touch handlers for mobile
  handleTouchStart: (e: React.TouchEvent, itemId: string, itemType: 'image' | 'video' | 'frame') => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

export function useMediaDragDrop(
  options: UseMediaDragDropOptions = {}
): UseMediaDragDropReturn {
  const { onDrop, dropZoneId, acceptedTypes } = options;
  const { dragDrop, updateDragDrop } = useProjectStore();
  const [isOverDropZone, setIsOverDropZone] = useState(false);

  const handleDragStart = useCallback(
    (e: DragEvent, itemId: string, itemType: 'image' | 'video' | 'frame') => {
      // Set drag data
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify({ itemId, itemType }));
      
      // Update global drag state
      updateDragDrop({
        isDragging: true,
        draggedItemId: itemId,
        draggedItemType: itemType,
        dropZone: dropZoneId,
      });

      // Add visual feedback
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = '0.5';
        e.currentTarget.style.transform = 'scale(0.95)';
      }
    },
    [dropZoneId, updateDragDrop]
  );
  
  // Touch support for mobile devices
  const handleTouchStart = useCallback(
    (e: React.TouchEvent, itemId: string, itemType: 'image' | 'video' | 'frame') => {
      const touch = e.touches[0];
      const element = e.currentTarget as HTMLElement;
      
      // Store touch data
      element.dataset.touchItemId = itemId;
      element.dataset.touchItemType = itemType;
      element.dataset.touchStartX = touch.clientX.toString();
      element.dataset.touchStartY = touch.clientY.toString();
      
      // Visual feedback
      element.style.opacity = '0.7';
      element.style.transform = 'scale(0.95)';
    },
    []
  );
  
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const element = e.currentTarget as HTMLElement;
    const itemId = element.dataset.touchItemId;
    const itemType = element.dataset.touchItemType as 'image' | 'video' | 'frame';
    
    if (itemId && itemType) {
      updateDragDrop({
        isDragging: true,
        draggedItemId: itemId,
        draggedItemType: itemType,
        dropZone: dropZoneId,
      });
    }
  }, [dropZoneId, updateDragDrop]);
  
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const element = e.currentTarget as HTMLElement;
    const itemId = element.dataset.touchItemId;
    const itemType = element.dataset.touchItemType as 'image' | 'video' | 'frame';
    
    // Reset visual feedback
    element.style.opacity = '1';
    element.style.transform = 'scale(1)';
    
    // Clear touch data
    delete element.dataset.touchItemId;
    delete element.dataset.touchItemType;
    delete element.dataset.touchStartX;
    delete element.dataset.touchStartY;
    
    if (itemId && itemType && onDrop) {
      // Find drop target at touch end position
      const touch = e.changedTouches[0];
      const dropTarget = document.elementFromPoint(touch.clientX, touch.clientY);
      
      if (dropTarget) {
        const targetSceneIndex = dropTarget.getAttribute('data-scene-index');
        onDrop(itemId, itemType, targetSceneIndex ? parseInt(targetSceneIndex) : undefined);
      }
    }
    
    updateDragDrop({
      isDragging: false,
      draggedItemId: undefined,
      draggedItemType: undefined,
      dropZone: undefined,
    });
  }, [onDrop, updateDragDrop]);

  const handleDragEnd = useCallback(() => {
    // Reset drag state
    updateDragDrop({
      isDragging: false,
      draggedItemId: undefined,
      draggedItemType: undefined,
      dropZone: undefined,
    });

    setIsOverDropZone(false);

    // Reset visual feedback
    const draggedElement = document.querySelector('[draggable="true"]');
    if (draggedElement instanceof HTMLElement) {
      draggedElement.style.opacity = '1';
    }
  }, [updateDragDrop]);

  const handleDragOver = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';

      // Check if dragged item type is accepted
      if (acceptedTypes && dragDrop.draggedItemType) {
        if (!acceptedTypes.includes(dragDrop.draggedItemType)) {
          e.dataTransfer.dropEffect = 'none';
          setIsOverDropZone(false);
          return;
        }
      }

      setIsOverDropZone(true);
    },
    [acceptedTypes, dragDrop.draggedItemType]
  );

  const handleDragLeave = useCallback(() => {
    setIsOverDropZone(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent, targetSceneIndex?: number) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOverDropZone(false);

      try {
        const data = e.dataTransfer.getData('application/json');
        if (!data) {
          // Fallback: try to get from dragDrop state
          if (dragDrop.draggedItemId && dragDrop.draggedItemType) {
            if (onDrop) {
              onDrop(dragDrop.draggedItemId, dragDrop.draggedItemType, targetSceneIndex);
            }
          }
          return;
        }

        const { itemId, itemType } = JSON.parse(data);

        // Validate item type
        if (acceptedTypes && !acceptedTypes.includes(itemType)) {
          console.warn(`Item type ${itemType} not accepted in this drop zone`);
          return;
        }

        // Call onDrop callback
        if (onDrop) {
          onDrop(itemId, itemType, targetSceneIndex);
        }
      } catch (error) {
        console.error('Error handling drop:', error);
      } finally {
        handleDragEnd();
      }
    },
    [onDrop, acceptedTypes, dragDrop, handleDragEnd]
  );

  return {
    isDragging: dragDrop.isDragging,
    isOverDropZone,
    draggedItem: dragDrop.draggedItemId
      ? {
          id: dragDrop.draggedItemId,
          type: dragDrop.draggedItemType,
        }
      : null,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    // Touch handlers for mobile
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}

/**
 * Hook for handling file uploads via drag-and-drop
 */
export function useFileUpload(
  onFilesUploaded: (files: File[]) => void | Promise<void>,
  options: {
    maxFiles?: number;
    maxSizeMB?: number;
    acceptedTypes?: string[];
  } = {}
) {
  const { maxFiles = 10, maxSizeMB = 10, acceptedTypes = ['image/*'] } = options;
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (acceptedTypes.length > 0) {
        const isAccepted = acceptedTypes.some((type) => {
          if (type.endsWith('/*')) {
            return file.type.startsWith(type.slice(0, -2));
          }
          return file.type === type;
        });

        if (!isAccepted) {
          return `File type ${file.type} is not accepted`;
        }
      }

      // Check file size
      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        return `File size exceeds ${maxSizeMB}MB limit`;
      }

      return null;
    },
    [acceptedTypes, maxSizeMB]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setError(null);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Validate file count
      if (files.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Validate each file
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setError(errors.join(', '));
      }

      if (validFiles.length > 0) {
        try {
          await onFilesUploaded(validFiles);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Failed to upload files');
        }
      }
    },
    [maxFiles, validateFile, onFilesUploaded]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      // Validate file count
      if (files.length > maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Validate each file
      const errors: string[] = [];
      const validFiles: File[] = [];

      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          errors.push(`${file.name}: ${error}`);
        } else {
          validFiles.push(file);
        }
      }

      if (errors.length > 0) {
        setError(errors.join(', '));
      }

      if (validFiles.length > 0) {
        try {
          await onFilesUploaded(validFiles);
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Failed to upload files');
        }
      }

      // Reset input
      e.target.value = '';
    },
    [maxFiles, validateFile, onFilesUploaded]
  );

  return {
    isDragging,
    error,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
  };
}

