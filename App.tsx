import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceName, Mood, ScriptAnalysis, MusicPreset, ViralAnalysis, ChatMessage } from './types';
import { VOICE_OPTIONS, MOOD_COLORS, LANGUAGE_OPTIONS, MUSIC_PRESET_OPTIONS, PlayIcon, PauseIcon, MagicIcon, SpeakerIcon, DownloadIcon } from './constants';
import { analyzeScript, generateSpeech, generateImage, translateScript, performAssistantQuery, transcribeGeneratedAudio } from './services/geminiService';
import { audioService } from './services/audioService';
import { exportVideo } from './services/videoExportService';
import { calculateWordTimings, WordTiming } from './utils/textUtils';
import ReelPlayer from './components/ReelPlayer';

type BackgroundMode = 'Auto' | 'Custom' | Mood | MusicPreset;
type VideoFormat = '9:16' | '16:9';

export default function App() {
  const [script, setScript] = useState<string>("In a world where artificial intelligence meets human creativity, VoxScript Studio emerges as the ultimate tool for visual storytellers. Whether you're crafting a viral reel or a cinematic short, the power of professional voice-over and stunning AI visuals is now at your fingertips.");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('9:16');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Puck);
  const [targetLanguage, setTargetLanguage] = useState<string>('en');
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('Auto');
  const [visualStyle, setVisualStyle] = useState<string>("");
  
  const [chatMode, setChatMode] = useState<'chat' | 'search'>('chat');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [currentChatInput, setCurrentChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [showSubtitles, setShowSubtitles] = useState(true);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
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
    const aistudio = (window as any).aistudio;
    if (aistudio) await aistudio.openSelectKey();
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
      setChatMessages(prev => [...prev, response]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'model', text: "Service temporarily busy. Please try again." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleApplyAction = (type: 'script' | 'style', value: string) => {
    if (type === 'script') setScript(value);
    if (type === 'style') setVisualStyle(value);
  };

  const handleAnalyzeAndGenerate = () => {
    if (!script.trim()) return;

    (async () => {
      setAudioBuffer(null);
      setGeneratedImages([]);
      setWordTimings([]);
      setIsPlaying(false);
      setStartOffset(0);
      audioService.stopAll();

      try {
        let scriptToProcess = script;
        if (targetLanguage !== 'en') {
          setIsTranslating(true);
          scriptToProcess = await translateScript(script, targetLanguage);
          setIsTranslating(false);
        }

        setIsAnalyzing(true);
        const analysisResult = await analyzeScript(scriptToProcess, videoFormat, visualStyle);
        setAnalysis(analysisResult);
        setIsAnalyzing(false);

        setIsGenerating(true);
        // Step 1: Voice Generation with EMOTIONAL INSTRUCTIONS from analysis
        const audioBase64 = await generateSpeech(
          scriptToProcess, 
          selectedVoice, 
          analysisResult.voiceInstruction 
        );
        const buffer = await audioService.decodeAudio(audioBase64);
        
        // Step 2: Voice Analysis (Subtitles)
        setIsTranscribing(true);
        const preciseTimings = await transcribeGeneratedAudio(audioBase64);
        setIsTranscribing(false);

        const finalTimings = preciseTimings || calculateWordTimings(scriptToProcess, buffer.duration);

        // Step 3: Visuals
        const imagePromises = analysisResult.visualPrompts.map(p => generateImage(p, videoFormat));
        const images = await Promise.all(imagePromises);
        
        setAudioBuffer(buffer);
        setReelDuration(buffer.duration); 
        setGeneratedImages(images.filter((img): img is string => img !== null));
        setWordTimings(finalTimings);

      } catch (err: any) {
         console.warn("Generation encountered a non-critical error, continuing with fallback resources.");
      } finally {
        setIsAnalyzing(false);
        setIsGenerating(false);
        setIsTranslating(false);
        setIsTranscribing(false);
      }
    })();
  };

  const getActiveMood = useCallback(() => {
    if (backgroundMode === 'Custom') return 'Custom';
    if (backgroundMode !== 'Auto') return backgroundMode;
    return analysis?.mood || Mood.Neutral;
  }, [backgroundMode, analysis]);

  const togglePlay = useCallback(() => {
    if (!audioBuffer) return;
    if (isPlaying) {
      audioService.stopAll();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      const mood = getActiveMood();
      if (mood !== 'Custom') {
        audioService.playAtmosphere(mood as Mood | MusicPreset, reelDuration, musicVol, analysis?.suggestedTempo);
      }
      audioService.setVoiceSpeed(voiceSpeed);
      audioService.playVoice(audioBuffer, voiceVol, () => setIsPlaying(false), startOffset);
    }
  }, [audioBuffer, isPlaying, getActiveMood, reelDuration, musicVol, analysis, voiceVol, voiceSpeed, startOffset]);

  const handleDownloadVideo = async () => {
    if (!audioBuffer || generatedImages.length === 0) return;
    setIsRenderingVideo(true);
    setRenderProgress(0);
    try {
        const mood = getActiveMood();
        const mixedAudio = await audioService.getMixBuffer(audioBuffer, mood as any, reelDuration, voiceVol, musicVol, 1.0, null, voiceSpeed);
        const blob = await exportVideo(generatedImages, mixedAudio, wordTimings, videoFormat, reelDuration, p => setRenderProgress(Math.round(p)), showSubtitles);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `VoxScript_Studio_Export.webm`; a.click();
    } catch (e) {
        console.error("Video export failed", e);
    } finally {
        setIsRenderingVideo(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 flex flex-col font-sans overflow-hidden">
      {isRenderingVideo && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-white mb-2">Finalizing Cinematic Export...</h2>
            <div className="w-full max-w-md bg-gray-800 rounded-full h-4 overflow-hidden"><div className="h-full bg-brand-500 transition-all" style={{ width: `${renderProgress}%` }} /></div>
            <span className="mt-2 text-brand-400">{renderProgress}% Complete</span>
        </div>
      )}

      <header className="border-b border-gray-800 bg-gray-900/50 h-16 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white"><SpeakerIcon /></div>
          <h1 className="text-lg font-bold">VoxScript <span className="text-brand-500">RESILIENT</span></h1>
        </div>
        <button onClick={handleApiKeyManagement} className="text-[10px] bg-brand-600/20 hover:bg-brand-600/30 text-brand-400 px-3 py-1.5 rounded-lg border border-brand-500/30 font-bold uppercase tracking-wider transition-all">Setup Key</button>
      </header>

      <main className="flex-1 max-w-[1400px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-64px)] overflow-hidden">
        
        <section className="lg:col-span-8 flex flex-col gap-6 h-full overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            
            <div className="flex flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar">
              <div className="flex bg-gray-900 p-1 rounded-xl border border-gray-800">
                  <button onClick={() => setVideoFormat('9:16')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${videoFormat === '9:16' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>9:16 REEL</button>
                  <button onClick={() => setVideoFormat('16:9')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${videoFormat === '16:9' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}>16:9 CINEMA</button>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-2xl flex-1 flex flex-col">
                <textarea className="flex-1 bg-transparent p-6 text-base leading-relaxed resize-none focus:outline-none placeholder-gray-700" value={script} onChange={(e) => setScript(e.target.value)} placeholder="Type your narrative here..." />
              </div>

              {analysis && (
                <div className="bg-brand-900/10 border border-brand-500/30 rounded-xl p-3 flex flex-col gap-2">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold uppercase text-brand-400">Emotion Detected</span>
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${MOOD_COLORS[analysis.mood]}`}>{analysis.mood}</span>
                   </div>
                   <div className="text-[11px] text-brand-200 italic line-clamp-2">
                     "{analysis.voiceInstruction}"
                   </div>
                </div>
              )}

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                 <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Visual Theme</label>
                    <input className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-brand-500" value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder="Cinematic, Magical Anime, Divine..." />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value as VoiceName)} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-3 text-sm outline-none">
                      {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <button onClick={handleAnalyzeAndGenerate} disabled={isAnalyzing || isGenerating || isTranscribing} className="rounded-xl font-bold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                        {isAnalyzing ? 'Analyzing...' : isGenerating ? (isTranscribing ? 'Syncing...' : 'Creating...') : <><MagicIcon /> Generate Video</>}
                    </button>
                 </div>
              </div>
            </div>

            <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-gray-800 bg-black/20 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-brand-400">Creative Assistant</h2>
                <div className="flex bg-black/40 p-1 rounded-lg border border-gray-700">
                  <button onClick={() => setChatMode('chat')} className={`px-2 py-1 text-[9px] rounded-md font-bold transition-all ${chatMode === 'chat' ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>CHAT</button>
                  <button onClick={() => setChatMode('search')} className={`px-2 py-1 text-[9px] rounded-md font-bold transition-all ${chatMode === 'search' ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>SEARCH</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-6">
                    <p className="text-sm">Improve your script or search for facts.</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'}`}>
                      {msg.text}
                      {msg.suggestedActions && msg.suggestedActions.map((action, ai) => (
                        <button key={ai} onClick={() => handleApplyAction(action.type as any, action.value)} className="mt-2 w-full py-1.5 rounded-lg bg-brand-500/10 border border-brand-500/30 text-[10px] font-bold text-brand-400 hover:bg-brand-500/20 transition-all uppercase tracking-widest">Apply {action.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {isChatLoading && <div className="text-[10px] text-gray-500 animate-pulse px-2">Processing...</div>}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="p-4 bg-black/20 border-t border-gray-800 flex gap-2">
                <input type="text" value={currentChatInput} onChange={(e) => setCurrentChatInput(e.target.value)} placeholder="Ask anything..." className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm outline-none" />
                <button type="submit" className="p-2 rounded-xl bg-brand-600 text-white hover:bg-brand-500 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg></button>
              </form>
            </div>
          </div>
        </section>

        <section className="lg:col-span-4 flex flex-col gap-4 h-full pt-10">
            <div className="flex flex-col items-center gap-6 w-full">
                <ReelPlayer 
                  images={generatedImages} isPlaying={isPlaying} totalDuration={reelDuration}
                  audioDuration={audioBuffer?.duration || 0} wordTimings={wordTimings}
                  playbackSpeed={voiceSpeed} aspectRatio={videoFormat}
                  onSeek={(t) => setStartOffset(t)} onFinish={() => setIsPlaying(false)}
                  showSubtitles={showSubtitles}
                />

                <div className="w-full max-w-[340px] flex flex-col gap-3">
                    <button onClick={togglePlay} disabled={!audioBuffer} className={`w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-bold transition-all ${isPlaying ? 'bg-gray-800 text-white border border-gray-700' : 'bg-white text-black'}`}>
                        {isPlaying ? <><PauseIcon /> Pause</> : <><PlayIcon /> Preview</>}
                    </button>
                    
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase text-gray-500 tracking-wider">Subtitles</span>
                        <button onClick={() => setShowSubtitles(!showSubtitles)} className={`w-10 h-6 rounded-full transition-all relative ${showSubtitles ? 'bg-brand-600' : 'bg-gray-700'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${showSubtitles ? 'left-5' : 'left-1'}`} /></button>
                    </div>

                    <button onClick={handleDownloadVideo} disabled={!audioBuffer || isRenderingVideo} className="w-full py-3 rounded-xl bg-brand-900/30 text-brand-400 text-xs font-bold border border-brand-500/30 hover:bg-brand-900/50 transition-all uppercase tracking-widest">Download Video</button>
                </div>
            </div>
        </section>
      </main>
    </div>
  );
}