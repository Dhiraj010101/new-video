
import { Mood, MusicPreset } from '../types';

class AudioService {
  private audioContext: AudioContext | null = null;
  private voiceNode: AudioBufferSourceNode | null = null;
  private musicNodes: OscillatorNode[] = [];
  private customMusicNode: AudioBufferSourceNode | null = null;
  private musicGainNode: GainNode | null = null;
  private voiceGainNode: GainNode | null = null;
  private pulseGainNode: GainNode | null = null;

  // Track state for seeking/resuming
  private activeVoiceBuffer: AudioBuffer | null = null;
  private activeVoiceVolume: number = 1.0;
  private activeOnEnded: (() => void) | null = null;
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

  public async decodeFile(file: File): Promise<AudioBuffer> {
    const ctx = this.getContext();
    const arrayBuffer = await file.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  }

  public stopMusic() {
    this.musicNodes.forEach(n => {
      try { n.stop(); n.disconnect(); } catch (e) {}
    });
    this.musicNodes = [];

    if (this.customMusicNode) {
        try {
            this.customMusicNode.stop();
            this.customMusicNode.disconnect();
        } catch(e) {}
        this.customMusicNode = null;
    }

    if (this.musicGainNode) {
      try { this.musicGainNode.disconnect(); } catch (e) {}
      this.musicGainNode = null;
    }

    if (this.pulseGainNode) {
      try { this.pulseGainNode.disconnect(); } catch (e) {}
      this.pulseGainNode = null;
    }
  }

  public playCustomBackground(buffer: AudioBuffer, volume: number) {
    this.stopMusic();
    const ctx = this.getContext();

    this.musicGainNode = ctx.createGain();
    this.musicGainNode.gain.value = volume;
    this.musicGainNode.connect(ctx.destination);

    this.customMusicNode = ctx.createBufferSource();
    this.customMusicNode.buffer = buffer;
    this.customMusicNode.loop = true;
    this.customMusicNode.connect(this.musicGainNode);
    this.customMusicNode.start();
  }

  // Helper to get frequencies for mood/preset
  private getFrequenciesAndType(mood: Mood | MusicPreset) {
      let frequencies: number[] = [];
      let type: OscillatorType = 'sine';
      let detuneAmount = 5;
      let lfoFreq = 0.2;
      let lfoDepth = 0.05;

      switch (mood) {
          case Mood.Neutral: 
              frequencies = [110, 164.81, 196, 220]; type = 'sine'; lfoFreq = 0.3; lfoDepth = 0.1; break;
          case Mood.Happy: 
              frequencies = [261.63, 329.63, 392.00, 523.25]; type = 'triangle'; detuneAmount = 8; lfoFreq = 2.0; lfoDepth = 0.15; break;
          case Mood.Sad: 
              frequencies = [146.83, 174.61, 220.00, 293.66]; type = 'sine'; lfoFreq = 0.15; lfoDepth = 0.1; break;
          case Mood.Tense: 
              frequencies = [110, 116.54, 155.56, 164.81]; type = 'sawtooth'; detuneAmount = 4; lfoFreq = 0.5; lfoDepth = 0.2; break;
          case Mood.Excited: 
              frequencies = [293.66, 369.99, 440.00, 587.33]; type = 'triangle'; detuneAmount = 10; lfoFreq = 3.0; lfoDepth = 0.1; break;
          case Mood.Mysterious: 
              frequencies = [138.59, 196.00, 246.94, 277.18]; type = 'sine'; detuneAmount = 15; lfoFreq = 0.25; lfoDepth = 0.15; break;
          case Mood.Professional: 
              frequencies = [196, 246.94, 293.66, 392]; type = 'sine'; lfoFreq = 0.5; lfoDepth = 0.05; break;
          case MusicPreset.ViralPhonk:
              frequencies = [55, 110, 164.81, 220]; type = 'sawtooth'; detuneAmount = 15; lfoFreq = 4.0; lfoDepth = 0.35; break;
          case MusicPreset.LofiChill:
              frequencies = [130.81, 155.56, 196.00, 246.94]; type = 'sine'; detuneAmount = 2; lfoFreq = 0.5; lfoDepth = 0.1; break;
          case MusicPreset.BollywoodRomance:
              frequencies = [261.63, 329.63, 392.00, 493.88]; type = 'triangle'; detuneAmount = 12; lfoFreq = 0.2; lfoDepth = 0.15; break;
          case MusicPreset.DesiBeats:
              frequencies = [146.83, 220.00, 293.66, 440.00]; type = 'square'; detuneAmount = 5; lfoFreq = 2.0; lfoDepth = 0.25; break;
          case MusicPreset.EpicCinematic:
              frequencies = [65.41, 98.00, 130.81, 196.00]; type = 'sawtooth'; detuneAmount = 8; lfoFreq = 0.1; lfoDepth = 0.3; break;
          default: 
              frequencies = [220, 277, 330];
      }
      return { frequencies, type, detuneAmount, lfoFreq, lfoDepth };
  }

  public playAtmosphere(mood: Mood | MusicPreset, duration: number, volume: number, tempo: number = 1.0) {
    const ctx = this.getContext();
    this.stopMusic();

    const { frequencies, type, detuneAmount, lfoFreq, lfoDepth } = this.getFrequenciesAndType(mood);

    this.pulseGainNode = ctx.createGain();
    this.pulseGainNode.gain.value = 1.0; 
    this.pulseGainNode.connect(ctx.destination);

    this.musicGainNode = ctx.createGain();
    this.musicGainNode.gain.setValueAtTime(0, ctx.currentTime);
    this.musicGainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 2);
    this.musicGainNode.connect(this.pulseGainNode);

    const now = ctx.currentTime;
    const musicDuration = duration + 3; 

    // LFO (Tempo synced)
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = lfoFreq * tempo; 
    
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = lfoDepth;
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.pulseGainNode.gain);
    lfo.start(now);
    lfo.stop(now + musicDuration + 1);
    this.musicNodes.push(lfo);

    // Oscillators
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      
      const oscDetuneLFO = ctx.createOscillator();
      oscDetuneLFO.frequency.value = (0.2 * (i + 1)) * tempo;
      const oscDetuneGain = ctx.createGain();
      oscDetuneGain.gain.value = detuneAmount * 2;
      
      oscDetuneLFO.connect(oscDetuneGain);
      oscDetuneGain.connect(osc.detune);
      
      oscDetuneLFO.start(now);
      oscDetuneLFO.stop(now + musicDuration + 1);
      this.musicNodes.push(oscDetuneLFO);

      osc.detune.setValueAtTime((Math.random() * detuneAmount * 2) - detuneAmount, now);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0, now);
      const entryDelay = i * 0.1;
      oscGain.gain.linearRampToValueAtTime(0.15 / frequencies.length, now + 1 + entryDelay); 
      oscGain.gain.setValueAtTime(0.15 / frequencies.length, now + musicDuration - 2);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + musicDuration);

      osc.connect(oscGain);
      oscGain.connect(this.musicGainNode!);
      osc.start(now);
      osc.stop(now + musicDuration + 1);
      this.musicNodes.push(osc);
    });
  }

  public setVoiceSpeed(rate: number) {
    this.activeRate = rate;
    if (this.voiceNode) {
      this.voiceNode.playbackRate.setValueAtTime(rate, this.getContext().currentTime);
    }
  }

  public playVoice(buffer: AudioBuffer, volume: number, onEnded: () => void, startTimeOffset: number = 0) {
    const ctx = this.getContext();
    this.stopVoiceNode(); 

    this.activeVoiceBuffer = buffer;
    this.activeVoiceVolume = volume;
    this.activeOnEnded = onEnded;

    this.voiceGainNode = ctx.createGain();
    this.voiceGainNode.gain.value = volume;
    this.voiceGainNode.connect(ctx.destination);

    this.voiceNode = ctx.createBufferSource();
    this.voiceNode.buffer = buffer;
    this.voiceNode.playbackRate.value = this.activeRate;
    this.voiceNode.connect(this.voiceGainNode);
    
    this.voiceNode.onended = () => {
       if (this.voiceNode) { 
           onEnded(); 
       }
    };

    this.voiceNode.start(0, startTimeOffset);
  }

  private stopVoiceNode() {
    if (this.voiceNode) {
      try { 
        this.voiceNode.onended = null;
        this.voiceNode.stop();
        this.voiceNode.disconnect();
      } catch (e) {}
      this.voiceNode = null;
    }
  }

  public stopAll() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    this.stopVoiceNode();
    
    if (this.musicGainNode) {
        this.musicGainNode.gain.cancelScheduledValues(now);
        this.musicGainNode.gain.setTargetAtTime(0, now, 0.2);
        setTimeout(() => {
            this.stopMusic();
        }, 500);
    } else {
        this.stopMusic();
    }
  }

  public seek(time: number) {
    if (!this.activeVoiceBuffer || !this.activeOnEnded) return;
    this.stopVoiceNode();
    this.playVoice(this.activeVoiceBuffer, this.activeVoiceVolume, this.activeOnEnded, time);
  }

  public setVolumes(voiceVol: number, musicVol: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    this.activeVoiceVolume = voiceVol; 

    if (this.voiceGainNode) {
      this.voiceGainNode.gain.setTargetAtTime(voiceVol, now, 0.1);
    }
    if (this.musicGainNode) {
      this.musicGainNode.gain.setTargetAtTime(musicVol, now, 0.1);
    }
  }

  // --- EXPORT FUNCTIONALITY ---

  public async getMixBuffer(
    voiceBuffer: AudioBuffer,
    mood: Mood | MusicPreset | 'Custom',
    totalDuration: number,
    voiceVol: number,
    musicVol: number,
    tempo: number,
    customMusicBuffer: AudioBuffer | null,
    playbackSpeed: number
  ): Promise<AudioBuffer> {
    const sampleRate = 44100;
    const length = totalDuration * sampleRate;
    const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
    
    // 2. Render Voice
    const voiceSrc = offlineCtx.createBufferSource();
    voiceSrc.buffer = voiceBuffer;
    voiceSrc.playbackRate.value = playbackSpeed;
    const voiceGain = offlineCtx.createGain();
    voiceGain.gain.value = voiceVol;
    voiceSrc.connect(voiceGain);
    voiceGain.connect(offlineCtx.destination);
    voiceSrc.start(0);

    // 3. Render Background
    const bgGain = offlineCtx.createGain();
    bgGain.gain.value = musicVol;
    bgGain.connect(offlineCtx.destination);

    if (mood === 'Custom' && customMusicBuffer) {
        const customSrc = offlineCtx.createBufferSource();
        customSrc.buffer = customMusicBuffer;
        customSrc.loop = true;
        customSrc.connect(bgGain);
        customSrc.start(0);
    } else if (mood !== 'Custom') {
        const { frequencies, type, detuneAmount, lfoFreq, lfoDepth } = this.getFrequenciesAndType(mood as Mood | MusicPreset);
        
        // Pulse Effect
        const pulseGain = offlineCtx.createGain();
        pulseGain.gain.value = 1.0;
        pulseGain.connect(bgGain);

        // LFO
        const lfo = offlineCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = lfoFreq * tempo;
        const lfoAmp = offlineCtx.createGain();
        lfoAmp.gain.value = lfoDepth;
        lfo.connect(lfoAmp);
        lfoAmp.connect(pulseGain.gain);
        lfo.start(0);

        // Oscillators
        frequencies.forEach((freq, i) => {
            const osc = offlineCtx.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            
            // Detune LFO
            const oscDetuneLFO = offlineCtx.createOscillator();
            oscDetuneLFO.frequency.value = (0.2 * (i + 1)) * tempo;
            const detuneAmp = offlineCtx.createGain();
            detuneAmp.gain.value = detuneAmount * 2;
            oscDetuneLFO.connect(detuneAmp);
            detuneAmp.connect(osc.detune);
            oscDetuneLFO.start(0);

            // Individual Osc Volume
            const oscVol = offlineCtx.createGain();
            oscVol.gain.value = 0.15 / frequencies.length;
            
            osc.connect(oscVol);
            oscVol.connect(pulseGain);
            osc.start(0);
        });
    }

    return await offlineCtx.startRendering();
  }

  public async renderAudioMix(
    voiceBuffer: AudioBuffer,
    mood: Mood | MusicPreset | 'Custom',
    totalDuration: number,
    voiceVol: number,
    musicVol: number,
    tempo: number,
    customMusicBuffer: AudioBuffer | null,
    playbackSpeed: number
  ): Promise<Blob> {
    const renderedBuffer = await this.getMixBuffer(voiceBuffer, mood, totalDuration, voiceVol, musicVol, tempo, customMusicBuffer, playbackSpeed);
    return this.bufferToWav(renderedBuffer);
  }

  private bufferToWav(ab: AudioBuffer): Blob {
    const numOfChan = ab.numberOfChannels;
    const length = ab.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    let pos = 0;

    // Helper to write
    const setUint16 = (data: number) => { view.setUint16(pos, data, true); pos += 2; };
    const setUint32 = (data: number) => { view.setUint32(pos, data, true); pos += 4; };

    // WAV Header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); 
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt "
    setUint32(16); // length
    setUint16(1); // PCM
    setUint16(numOfChan);
    setUint32(ab.sampleRate);
    setUint32(ab.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16); // 16-bit

    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    // Interleave channels
    const channels = [];
    for(let i=0; i < numOfChan; i++) channels.push(ab.getChannelData(i));

    let offset = 44;
    for(let i=0; i < ab.length; i++) {
        for(let ch=0; ch < numOfChan; ch++) {
            let sample = Math.max(-1, Math.min(1, channels[ch][i]));
            sample = (sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }

    return new Blob([buffer], {type: "audio/wav"});
  }
}

export const audioService = new AudioService();
