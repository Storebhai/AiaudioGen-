import { Type } from '@google/genai';
import type { VoiceOption, LanguageOption } from './types';

export const LANGUAGES: LanguageOption[] = [
  { id: 'English', name: 'English' },
  { id: 'Hindi', name: 'Hindi' },
  { id: 'Hinglish', name: 'Hinglish (Hindi+English)' },
];

export const VOICES: VoiceOption[] = [
  { id: 'zephyr-calm-m', name: 'Zephyr (Calm Male)', gender: 'Male', style: 'Calm', ttsValue: 'Zephyr' },
  { id: 'puck-energetic-m', name: 'Puck (Energetic Male)', gender: 'Male', style: 'Energetic', ttsValue: 'Puck' },
  { id: 'kore-calm-f', name: 'Kore (Calm Female)', gender: 'Female', style: 'Calm', ttsValue: 'Kore' },
  { id: 'charon-energetic-f', name: 'Charon (Energetic Female)', gender: 'Female', style: 'Energetic', ttsValue: 'Charon' },
];

export const COURSE_OUTLINE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    courseTitle: { 
      type: Type.STRING,
      description: "A clear and simple course title. Example: 'Human Reproduction – Class 12 Audio Course'"
    },
    totalDuration: { 
      type: Type.STRING,
      description: "The total estimated duration of the course. Example: '45 Minutes'"
    },
    lectures: {
      type: Type.ARRAY,
      description: "An array of 4 to 6 lecture objects, containing only the title and goals.",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "The title of the individual lecture." },
          goals: { type: Type.STRING, description: "A 2-3 line summary of the learning goals for this lecture." },
        },
        required: ['title', 'goals']
      }
    }
  },
  required: ['courseTitle', 'totalDuration', 'lectures']
};

export const LECTURE_DETAILS_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        duration: { type: Type.STRING, description: "The estimated duration of this lecture in minutes. Example: '9 min'" },
        script: { type: Type.STRING, description: "The full audio script for the lecture, written in a simple, conversational tone with short sentences and natural pauses. It should be long enough to match the duration." },
        summary: { type: Type.STRING, description: "A quick summary of the lecture's key points." },
        quiz: {
            type: Type.ARRAY,
            description: "A mini-quiz with 3 to 5 simple questions.",
            items: { type: Type.STRING }
        }
    },
    required: ['duration', 'script', 'summary', 'quiz']
};
