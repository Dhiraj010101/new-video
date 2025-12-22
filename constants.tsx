import React from 'react';
import { VoiceName, Mood, MusicPreset } from './types';

export const VOICE_OPTIONS = [
  { id: VoiceName.Puck, label: 'Puck (Neutral, Male)', gender: 'Male' },
  { id: VoiceName.Charon, label: 'Charon (Deep, Male)', gender: 'Male' },
  { id: VoiceName.Kore, label: 'Kore (Calm, Female)', gender: 'Female' },
  { id: VoiceName.Fenrir, label: 'Fenrir (Intense, Male)', gender: 'Male' },
  { id: VoiceName.Zephyr, label: 'Zephyr (Gentle, Female)', gender: 'Female' },
];

export const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English (Default)' },
  { code: 'es', label: 'Spanish (Español)' },
  { code: 'fr', label: 'French (Français)' },
  { code: 'de', label: 'German (Deutsch)' },
  { code: 'it', label: 'Italian (Italiano)' },
  { code: 'pt', label: 'Portuguese (Português)' },
  { code: 'hi', label: 'Hindi (हिन्दी)' },
  { code: 'mr', label: 'Marathi (मराठी)' },
  { code: 'ja', label: 'Japanese (日本語)' },
  { code: 'ko', label: 'Korean (한국어)' },
  { code: 'zh', label: 'Chinese (Mandarin)' },
  { code: 'ru', label: 'Russian (Русский)' },
];

export const MUSIC_PRESET_OPTIONS = [
  { id: MusicPreset.ViralPhonk, label: '🔥 Viral Phonk (Trending)' },
  { id: MusicPreset.LofiChill, label: '☕ Lo-Fi Chill (English)' },
  { id: MusicPreset.EpicCinematic, label: '🎬 Epic Cinematic' },
  { id: MusicPreset.BollywoodRomance, label: '🎻 Bollywood Romance (Hindi)' },
  { id: MusicPreset.DesiBeats, label: '🥁 Desi Beats (Hindi)' },
];

export const MOOD_COLORS: Record<Mood, string> = {
  [Mood.Neutral]: 'bg-gray-500',
  [Mood.Happy]: 'bg-yellow-500',
  [Mood.Sad]: 'bg-blue-400',
  [Mood.Tense]: 'bg-red-500',
  [Mood.Excited]: 'bg-orange-500',
  [Mood.Professional]: 'bg-brand-500',
  [Mood.Mysterious]: 'bg-purple-500',
};

// Icons
export const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
  </svg>
);

export const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
  </svg>
);

export const MagicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM9 15a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 019 15z" clipRule="evenodd" />
  </svg>
);

export const SpeakerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.805l-.006.02-.624 2.08c-.28.937.265 1.935 1.18 2.144l9.103 2.07c.84.19 1.579-.597 1.579-1.385v-4.673a6.002 6.002 0 013.75-5.501z" />
    <path d="M16.5 4.06c0-1.336 1.616-2.005 2.56-1.06l1.372 1.372c.767.767 1.196 1.815 1.196 2.9v5.236c0 1.085-.429 2.133-1.196 2.9l-1.372 1.372c-.944.945-2.56.276-2.56-1.06V4.06z" />
  </svg>
);

export const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
  </svg>
);