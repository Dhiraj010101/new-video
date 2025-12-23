
export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export enum Mood {
  Neutral = 'Neutral',
  Happy = 'Happy',
  Sad = 'Sad',
  Tense = 'Tense',
  Excited = 'Excited',
  Professional = 'Professional',
  Mysterious = 'Mysterious'
}

export enum MusicPreset {
  ViralPhonk = 'Viral Phonk (Trending)',
  LofiChill = 'Lo-Fi Chill (English)',
  BollywoodRomance = 'Bollywood Romance (Hindi)',
  DesiBeats = 'Desi Beats (Hindi)',
  EpicCinematic = 'Epic Cinematic (Viral)'
}

export interface ScriptAnalysis {
  mood: Mood;
  summary: string;
  suggestedTempo: number; // 0.8 to 1.2
  visualPrompts: string[];
}

export interface ViralAnalysis {
  visualStyle: string;
  hookType: string;
  pacing: string;
  colorPalette: string;
  summary: string;
}

export interface GeneratedAudio {
  audioBuffer: AudioBuffer | null;
  duration: number;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
  index: number;
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  sources?: GroundingSource[];
  suggestedActions?: {
    type: 'script' | 'style';
    value: string;
    label: string;
  }[];
}

export interface AudioMixerState {
  voiceVolume: number;
  musicVolume: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}
