
import { Mood, MusicPreset, WordTiming } from '../types';

class AudioService {
  private audioContext: AudioContext | null = null;
  private voiceNode: AudioBufferSourceNode | null = null;
  private voiceGainNode: GainNode | null = null;
  private activeRate: number = 1.0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  public getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  public async decodeAudio(base64Data: string): Promise<AudioBuffer> {
    const ctx = this.getContext();
    const binaryString = window.atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const sampleRate = 24000;
    const numChannels = 1;
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    const channelData = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }

    return buffer;
  }

  public stopAll() {
    if (this.voiceNode) {
      try { 
        this.voiceNode.onended = null;
        this.voiceNode.stop();
        this.voiceNode.disconnect();
      } catch (e) {}
      this.voiceNode = null;
    }
  }

  public playAtmosphere(mood: Mood | MusicPreset, duration: number, volume: number, tempo: number = 1.0) {
    // Background music is disabled as per request
    console.log("Atmospheric music disabled.");
  }

  public playVoice(buffer: AudioBuffer, volume: number, onEnded: () => void, startTimeOffset: number = 0) {
    const ctx = this.getContext();
    this.stopAll();

    this.voiceGainNode = ctx.createGain();
    this.voiceGainNode.gain.value = volume;
    this.voiceGainNode.connect(ctx.destination);

    this.voiceNode = ctx.createBufferSource();
    this.voiceNode.buffer = buffer;
    this.voiceNode.playbackRate.value = this.activeRate;
    this.voiceNode.connect(this.voiceGainNode);
    
    this.voiceNode.onended = onEnded;
    this.voiceNode.start(0, startTimeOffset);
  }

  public setVoiceSpeed(rate: number) {
    this.activeRate = rate;
    if (this.voiceNode) {
      this.voiceNode.playbackRate.setValueAtTime(rate, this.getContext().currentTime);
    }
  }

  public async getMixBuffer(
    voiceBuffer: AudioBuffer,
    mood: Mood | MusicPreset | 'Custom',
    totalDuration: number,
    voiceVol: number,
    musicVol: number, // Ignored
    tempo: number,
    customMusicBuffer: AudioBuffer | null, // Ignored
    playbackSpeed: number
  ): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const length = totalDuration * sampleRate;
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    
    const voiceSrc = offlineCtx.createBufferSource();
    voiceSrc.buffer = voiceBuffer;
    voiceSrc.playbackRate.value = playbackSpeed;
    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = voiceVol;
    voiceSrc.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);
    voiceSrc.start(0);

    return await offlineCtx.startRendering();
  }
}

export const audioService = new AudioService();
