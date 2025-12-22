
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceName, Mood, ScriptAnalysis, MusicPreset, ViralAnalysis, ChatMessage } from './types';
import { VOICE_OPTIONS, MOOD_COLORS, LANGUAGE_OPTIONS, MUSIC_PRESET_OPTIONS, PlayIcon, PauseIcon, MagicIcon, SpeakerIcon, DownloadIcon } from './constants';
import { analyzeScript, generateSpeech, generateImage, translateScript, analyzeViralFrames, performAssistantQuery } from './services/geminiService';
import { audioService } from './services/audioService';
import { exportVideo } from './services/videoExportService';
import { extractFramesFromVideo } from './services/videoAnalysisService';
import { calculateWordTimings, WordTiming } from './utils/textUtils';
import ReelPlayer from './components/ReelPlayer';

type BackgroundMode = 'Auto' | 'Custom' | Mood | MusicPreset;
type VideoFormat = '9:16' | '16:9';
type ViralInputMode = 'upload' | 'url';

export default function App() {
  const [script, setScript] = useState<string>("Enter your script here. The AI will analyze the sentiment, generate a professional voice-over, and create stunning motion visuals...");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('9:16');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Puck);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('Auto');
  const [visualStyle, setVisualStyle] = useState<string>("");
  
  // Chat States
  const [chatMode, setChatMode] = useState<'chat' | 'search'>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatInput, setCurrentChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Audio & Subtitle Feature Toggles
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [enableMusic, setEnableMusic] = useState(true);

  // Viral Analysis State
  const [viralInputMode, setViralInputMode] = useState<ViralInputMode>('upload');
  const [viralFile, setViralFile] = useState<File | null>(null);
  const [viralUrl, setViralUrl] = useState<string>("");
  const [viralAnalysis, setViralAnalysis] = useState<ViralAnalysis | null>(null);
  const [isAnalyzingViral, setIsAnalyzingViral] = useState(false);
  const [useViralContext, setUseViralContext] = useState(true);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [customMusicBuffer, setCustomMusicBuffer] = useState<AudioBuffer | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]); 
  
  const [voiceVol, setVoiceVol] = useState(1.0);
  const [musicVol, setMusicVol] = useState(0.2);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  
  const [reelDuration, setReelDuration] = useState<number>(0);
  const [startOffset, setStartOffset] = useState(0);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleApiKeyManagement = async () => {
    try {
        const aistudio = (window as any).aistudio;
        if (aistudio && typeof aistudio.openSelectKey === 'function') {
            await aistudio.openSelectKey();
        }
    } catch (err) {
        console.error("Failed to open key selector", err);
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!currentChatInput.trim() || isChatLoading) return;

    const userMsg = currentChatInput;
    setCurrentChatInput("");
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const response = await performAssistantQuery(userMsg, chatMode, chatMessages);
      setChatMessages(prev => [...prev, { role: 'model', text: response.text, sources: response.sources }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Error: Failed to reach assistant. Please check your connection or quota." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const applyToScript = (text: string) => {
      // Basic heuristic to strip conversational filler if applying a suggested script
      const cleaned = text.replace(/^(Certainly|Sure|Here is a|Here's a suggested script:)\s*/i, '').trim();
      setScript(cleaned);
  };

  const ensureKeyAndCall = async (fn: () => Promise<void>) => {
    try {
      const hasKey = await (window as any).aistudio?.hasSelectedApiKey();
      if (!hasKey) {
        if (confirm("This operation requires a higher quota. Would you like to use your own paid API key to ensure stability?")) {
          await handleApiKeyManagement();
        }
      }
      await fn();
    } catch (err: any) {
      const errorStr = err.message || JSON.stringify(err);
      if (errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED") || errorStr.includes("quota")) {
        if (confirm("Public quota exhausted. To continue generating high-quality AI videos, please select your own API key.")) {
           await handleApiKeyManagement();
           await fn();
        }
      } else {
        alert("An error occurred: " + errorStr);
      }
    }
  };

  // Add the missing handleViralUpload function to handle file selection
  const handleViralUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setViralFile(file);
    }
  };

  const handleAnalyzeViralVideo = () => {
    if (viralInputMode === 'upload' && !viralFile) return alert("Select a video file.");
    if (viralInputMode === 'url' && !viralUrl.trim()) return alert("Paste a video URL.");

    ensureKeyAndCall(async () => {
      setIsAnalyzingViral(true);
      try {
        let frames: string[] = [];
        if (viralInputMode === 'upload' && viralFile) frames = await extractFramesFromVideo(viralFile);
        else if (viralInputMode === 'url' && viralUrl) frames = await extractFramesFromVideo(viralUrl);
        
        if (frames.length === 0) throw new Error("Could not extract frames.");
        const result = await analyzeViralFrames(frames);
        setViralAnalysis(result);
      } finally {
        setIsAnalyzingViral(false);
      }
    });
  };

  const handleAnalyzeAndGenerate = () => {
    if (!script.trim()) return;

    ensureKeyAndCall(async () => {
      setAudioBuffer(null);
      setGeneratedImages([]);
      setWordTimings([]);
      setIsPlaying(false);
      setStartOffset(0);
      setReelDuration(0);
      audioService.stopAll();

      try {
        let scriptToProcess = script;
        if (targetLanguage !== 'en') {
          setIsTranslating(true);
          const langLabel = LANGUAGE_OPTIONS.find(l => l.code === targetLanguage)?.label || 'English';
          scriptToProcess = await translateScript(script, langLabel);
          setIsTranslating(false);
        }

        setIsAnalyzing(true);
        const viralContext = useViralContext ? viralAnalysis : null;
        const analysisResult = await analyzeScript(scriptToProcess, videoFormat, visualStyle, viralContext);
        setAnalysis(analysisResult);
        setIsAnalyzing(false);

        setIsGenerating(true);
        const audioPromise = generateSpeech(scriptToProcess, selectedVoice)
          .then(base64 => audioService.decodeAudio(base64));

        const imagePromises = analysisResult.visualPrompts.map(prompt => generateImage(prompt, videoFormat));

        const [buffer, ...images] = await Promise.all([audioPromise, ...imagePromises]);
        
        setAudioBuffer(buffer);
        setReelDuration(buffer.duration); 
        setGeneratedImages(images.filter((img): img is string => img !== null));

        const initialTimings = calculateWordTimings(scriptToProcess, buffer.duration);
        setWordTimings(initialTimings);

      } finally {
        setIsAnalyzing(false);
        setIsGenerating(false);
        setIsTranslating(false);
      }
    });
  };

  const handleWordUpdate = useCallback((index: number, newTiming: WordTiming) => {
      setWordTimings(prev => {
          const updated = [...prev];
          updated[index] = newTiming;
          return updated;
      });
  }, []);

  const getActiveMood = useCallback(() => {
    if (!enableMusic) return null;
    if (backgroundMode === 'Custom') return 'Custom';
    if (backgroundMode !== 'Auto') return backgroundMode;
    return analysis?.mood || Mood.Neutral;
  }, [backgroundMode, analysis, enableMusic]);

  const togglePlay = useCallback(() => {
    if (!audioBuffer) return;

    if (isPlaying) {
      audioService.stopAll();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      const moodToPlay = getActiveMood();
      if (moodToPlay) {
          if (moodToPlay === 'Custom' && customMusicBuffer) {
             audioService.playCustomBackground(customMusicBuffer, musicVol);
          } else if (moodToPlay !== 'Custom') {
             const atmosphereDuration = Math.max(audioBuffer.duration, reelDuration);
             const tempo = analysis?.suggestedTempo || 1.0;
             audioService.playAtmosphere(moodToPlay as Mood | MusicPreset, atmosphereDuration, musicVol, tempo);
          }
      }
      audioService.setVoiceSpeed(voiceSpeed);
      audioService.playVoice(audioBuffer, voiceVol, () => {}, startOffset);
      audioService.setVolumes(voiceVol, enableMusic ? musicVol : 0);
    }
  }, [audioBuffer, getActiveMood, isPlaying, voiceVol, musicVol, customMusicBuffer, startOffset, voiceSpeed, reelDuration, analysis, enableMusic]);

  const handleSeek = useCallback((time: number) => {
      setStartOffset(time);
      if (isPlaying) {
          audioService.seek(time);
      }
  }, [isPlaying]);

  const handleSpeedChange = (speed: number) => {
      setVoiceSpeed(speed);
      audioService.setVoiceSpeed(speed);
  };

  const handleReelFinish = () => {
      setIsPlaying(false);
      setStartOffset(0);
      audioService.stopAll();
  };

  const handleDownloadAudio = async () => {
      if (!audioBuffer) return;
      setIsExporting(true);
      try {
          const mood = getActiveMood();
          const tempo = analysis?.suggestedTempo || 1.0;
          const duration = Math.max(audioBuffer.duration, reelDuration);
          const blob = await audioService.renderAudioMix(
              audioBuffer, mood || Mood.Neutral, duration, voiceVol, enableMusic ? musicVol : 0, tempo, customMusicBuffer, voiceSpeed
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `VoxScript_Audio_${Date.now()}.wav`;
          a.click();
          URL.revokeObjectURL(url);
      } catch (err) {
          alert("Export failed.");
      } finally {
          setIsExporting(false);
      }
  };

  const handleDownloadVideo = async () => {
    if (!audioBuffer || generatedImages.length === 0) return;
    setIsRenderingVideo(true);
    setRenderProgress(0);
    audioService.stopAll();

    try {
        const mood = getActiveMood();
        const tempo = analysis?.suggestedTempo || 1.0;
        const duration = Math.max(audioBuffer.duration, reelDuration);
        const mixedAudioBuffer = await audioService.getMixBuffer(
            audioBuffer, mood || Mood.Neutral, duration, voiceVol, enableMusic ? musicVol : 0, tempo, customMusicBuffer, voiceSpeed
        );
        const blob = await exportVideo(
            generatedImages, mixedAudioBuffer, wordTimings, videoFormat, duration, (p) => setRenderProgress(Math.round(p)), showSubtitles
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `VoxScript_Video_${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e: any) {
        alert("Failed to render video: " + e.message);
    } finally {
        setIsRenderingVideo(false);
    }
  };

  useEffect(() => {
    if (isPlaying) audioService.setVolumes(voiceVol, enableMusic ? musicVol : 0);
  }, [voiceVol, musicVol, isPlaying, enableMusic]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col font-sans overflow-hidden relative">
      
      {isRenderingVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2">Rendering Your Video...</h2>
            <div className="w-full max-w-md bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-700">
                <div className="h-full bg-brand-500 transition-all duration-300 ease-out" style={{ width: `${renderProgress}%` }} />
            </div>
            <span className="mt-2 text-brand-400 font-mono">{renderProgress}% Complete</span>
        </div>
      )}

      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center text-white">
              <SpeakerIcon />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">VoxScript <span className="text-brand-500">{videoFormat === '9:16' ? 'Reels' : 'Studio'}</span></h1>
          </div>
          <div className="flex items-center gap-4">
             <button 
                onClick={handleApiKeyManagement}
                className="text-xs bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 px-3 py-1.5 rounded-lg border border-brand-500/30 transition flex items-center gap-2 font-bold"
             >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path></svg>
                Paid API Key
             </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-64px)] overflow-hidden">
        
        {/* Left Side: Editor & Assistant */}
        <section className="lg:col-span-8 flex flex-col gap-6 h-full overflow-hidden">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            
            {/* Main Editor Section */}
            <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar pb-20">
              <div className="bg-gray-900 p-1 rounded-xl border border-gray-800 flex gap-1">
                  <button onClick={() => setVideoFormat('9:16')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${videoFormat === '9:16' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>📱 9:16</button>
                  <button onClick={() => setVideoFormat('16:9')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${videoFormat === '16:9' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>🎬 16:9</button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl flex flex-col min-h-[300px] flex-1">
                <textarea
                  className="flex-1 bg-transparent p-6 text-lg leading-relaxed resize-none focus:outline-none placeholder-gray-700 font-light"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Write your story here..."
                />
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 shadow-sm">
                 <div className="flex justify-between items-center mb-3">
                     <label className="text-xs font-bold text-brand-400 uppercase tracking-wider">🚀 Viral Matcher</label>
                 </div>
                 {!viralAnalysis ? (
                     <div className="flex gap-2 items-center">
                        <input type="file" onChange={handleViralUpload} className="hidden" id="viral-file" />
                        <label htmlFor="viral-file" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-400 cursor-pointer truncate">
                          {viralFile ? viralFile.name : "Upload reference video..."}
                        </label>
                        <button onClick={handleAnalyzeViralVideo} disabled={isAnalyzingViral} className="px-4 py-2 rounded-lg text-xs font-bold bg-brand-600 text-white">Match</button>
                     </div>
                 ) : (
                     <div className="bg-brand-600/5 p-3 rounded-lg border border-brand-500/20 text-sm">
                        <p className="italic text-gray-300">"{viralAnalysis.summary}"</p>
                        <button onClick={() => setViralAnalysis(null)} className="text-[10px] text-brand-400 mt-2">Clear Sync</button>
                     </div>
                 )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                  <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value as VoiceName)} className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-3 text-sm outline-none">
                      {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                  <button onClick={handleAnalyzeAndGenerate} disabled={isAnalyzing || isGenerating || isTranslating} className="rounded-xl font-bold bg-gradient-to-r from-brand-600 to-purple-600 text-white disabled:opacity-50 flex items-center justify-center gap-2">
                      {isAnalyzing ? 'Analyzing...' : isGenerating ? 'Generating...' : <><MagicIcon /> Generate</>}
                  </button>
              </div>
            </div>

            {/* AI Assistant Section (Chat & Search) */}
            <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse"></div>
                  <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400">AI Assistant</h2>
                </div>
                <div className="flex bg-black/40 p-1 rounded-lg border border-gray-800">
                  <button onClick={() => setChatMode('chat')} className={`px-3 py-1.5 text-[10px] rounded-md transition-all font-bold ${chatMode === 'chat' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-500'}`}>CREATIVE</button>
                  <button onClick={() => setChatMode('search')} className={`px-3 py-1.5 text-[10px] rounded-md transition-all font-bold ${chatMode === 'search' ? 'bg-brand-600 text-white shadow-lg' : 'text-gray-500'}`}>RESEARCH</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 opacity-40">
                    <div className="w-12 h-12 rounded-full border border-gray-700 flex items-center justify-center">
                      {chatMode === 'chat' ? <MagicIcon /> : <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>}
                    </div>
                    <p className="text-sm font-medium">
                      {chatMode === 'chat' 
                        ? "Ask me to improve your script or suggest visual themes." 
                        : "I'll search the web for facts and trending info to boost your script."}
                    </p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'}`}>
                      {msg.text}
                      
                      {msg.sources && (
                        <div className="mt-3 pt-3 border-t border-gray-700 space-y-1">
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Sources:</p>
                          {msg.sources.map((s, si) => (
                            <a key={si} href={s.uri} target="_blank" rel="noopener noreferrer" className="block text-[10px] text-brand-400 hover:underline truncate transition-all">
                               🔗 {s.title}
                            </a>
                          ))}
                        </div>
                      )}
                      
                      {msg.role === 'model' && msg.text.length > 50 && (
                        <button 
                          onClick={() => applyToScript(msg.text)}
                          className="mt-3 w-full py-1.5 rounded-lg bg-brand-500/20 border border-brand-500/30 text-[10px] font-bold text-brand-400 hover:bg-brand-500/30 transition-all uppercase tracking-widest"
                        >
                          Apply to Script
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {isChatLoading && (
                   <div className="flex items-start gap-2 animate-pulse">
                      <div className="bg-gray-800 rounded-2xl px-4 py-3 text-xs text-gray-500 border border-gray-700 italic">
                        {chatMode === 'search' ? "Searching the web..." : "Thinking..."}
                      </div>
                   </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="p-4 bg-gray-900 border-t border-gray-800 flex gap-2">
                <input 
                  type="text" 
                  value={currentChatInput}
                  onChange={(e) => setCurrentChatInput(e.target.value)}
                  placeholder={chatMode === 'chat' ? "Ask creative help..." : "Ask a factual question..."}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm focus:ring-1 focus:ring-brand-500 outline-none"
                />
                <button type="submit" disabled={isChatLoading} className="p-2 rounded-xl bg-brand-600 text-white disabled:opacity-50 hover:bg-brand-500 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Right Side: Preview */}
        <section className="lg:col-span-4 flex flex-col gap-6 h-full justify-start pt-10">
            <div className="flex flex-col items-center gap-6 w-full">
                <ReelPlayer 
                  images={generatedImages} isPlaying={isPlaying} totalDuration={reelDuration}
                  audioDuration={audioBuffer?.duration || 0} wordTimings={wordTimings}
                  playbackSpeed={voiceSpeed} aspectRatio={videoFormat}
                  onSeek={handleSeek} seekTime={startOffset} onFinish={handleReelFinish}
                  onWordUpdate={handleWordUpdate}
                  showSubtitles={showSubtitles}
                />

                <div className="w-full max-w-[340px] flex flex-col gap-2 transition-all">
                    <button onClick={togglePlay} disabled={!audioBuffer} className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold transition-all ${isPlaying ? 'bg-gray-800 text-white' : 'bg-white text-black'} disabled:opacity-50`}>
                        {isPlaying ? <><PauseIcon /> Pause</> : <><PlayIcon /> Play</>}
                    </button>
                    <div className="flex gap-2">
                        <button onClick={handleDownloadVideo} disabled={!audioBuffer} className="flex-1 py-3 rounded-xl bg-brand-900/30 text-brand-400 text-xs font-medium border border-brand-500/30">Download Video</button>
                    </div>
                </div>
            </div>
        </section>
      </main>
    </div>
  );
}
