export interface Lecture {
  title: string;
  duration: string;
  goals: string;
  script: string;
  summary: string;
  quiz: string[];
}

export interface Course {
  courseTitle: string;
  totalDuration: string;
  lectures: Lecture[];
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  style: 'Calm' | 'Energetic';
  ttsValue: string;
}

export type InputType = 'topic' | 'text' | 'pdf' | 'youtube' | 'video';
export type AudioState = 'idle' | 'content-loading' | 'loading' | 'loaded' | 'error';

export interface LanguageOption {
  id:string;
  name: string;
}

export interface PlayerState {
    isLoading: boolean;
    isPlaying: boolean;
    progress: number; // 0 to 1
    currentTime: number; // in seconds
    duration: number; // in seconds
    volume: number; // 0 to 1
    error?: string | null;
}

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}


// FIX: Removed the conflicting global declaration for `window.aistudio`.
// It is assumed that the correct type definition is provided by the execution environment,
// and this declaration was causing a conflict.