/**
 * Component-specific TypeScript types
 */

// ============================================================================
// Chat & Messaging Types
// ============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
  type?: 'message' | 'status' | 'error' | 'suggestion';
}

// ============================================================================
// UI State Types
// ============================================================================

export type ViewMode = 'storyboard' | 'timeline' | 'images' | 'video';

export interface MediaDrawerState {
  selectedItems: string[];
  seedImageId?: string | null; // Added for seed image selection
  filters: {
    scene?: number;
    type?: 'image' | 'video' | 'frame';
  };
  searchQuery: string;
}

export interface DragDropState {
  isDragging: boolean;
  draggedItemId?: string;
  draggedItemType?: 'image' | 'video' | 'frame';
  dropZone?: string;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface ChatInputProps {
  onSubmit: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export interface ImageDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  acceptedTypes?: string[];
}

export interface StartingScreenProps {
  onCreateProject: (prompt: string, images?: File[], targetDuration?: number) => Promise<void>;
  isLoading?: boolean;
}

