
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { VoiceName, Mood, ScriptAnalysis, MusicPreset, ViralAnalysis, ChatMessage } from './types';
import { VOICE_OPTIONS, MOOD_COLORS, PlayIcon, PauseIcon, MagicIcon, SpeakerIcon, DownloadIcon } from './constants';
import { analyzeScript, generateSpeech, generateImage, translateScript, performAssistantQuery, transcribeGeneratedAudio } from './services/geminiService';
import { audioService } from './services/audioService';
import { exportVideo } from './services/videoExportService';
import { calculateWordTimings, WordTiming } from './utils/textUtils';
import ReelPlayer from './components/ReelPlayer';

type BackgroundMode = 'Auto' | 'Custom' | Mood | MusicPreset;
type VideoFormat = '9:16' | '16:9';

const CUSTOM_CINEMATIC_TONE = "Narrate with a breathless, cinematic grandeur, infusing every word with awe and a sense of magical discovery, as if unveiling a legendary artifact.";

export default function App() {
  const [script, setScript] = useState<string>("In a world where artificial intelligence meets human creativity, VoxScript Studio emerges as the ultimate tool for visual storytellers. Whether you're crafting a viral reel or a cinematic short, the power of professional voice-over and stunning AI visuals is now at your fingertips.");
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('9:16');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Puck);
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
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);

  // Tone Confirmation State
  const [showTonePrompt, setShowTonePrompt] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<ScriptAnalysis | null>(null);

  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]); 
  
  const [voiceVol, setVoiceVol] = useState(1.0);
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

  const startGenerationFlow = (analysisResult: ScriptAnalysis, useGlobalTone: boolean) => {
    setShowTonePrompt(false);
    setAnalysis(analysisResult);
    
    const finalVoiceInstruction = useGlobalTone ? CUSTOM_CINEMATIC_TONE : analysisResult.voiceInstruction;

    (async () => {
      setIsGenerating(true);
      try {
        const audioBase64 = await generateSpeech(
          script, 
          selectedVoice, 
          finalVoiceInstruction 
        );
        const buffer = await audioService.decodeAudio(audioBase64);
        
        setIsTranscribing(true);
        const preciseTimings = await transcribeGeneratedAudio(audioBase64);
        setIsTranscribing(false);

        const finalTimings = preciseTimings || calculateWordTimings(script, buffer.duration);

        const imagePromises = analysisResult.visualPrompts.map(p => generateImage(p, videoFormat));
        const images = await Promise.all(imagePromises);
        
        setAudioBuffer(buffer);
        setReelDuration(buffer.duration); 
        setGeneratedImages(images.filter((img): img is string => img !== null));
        setWordTimings(finalTimings);

      } catch (err: any) {
         console.warn("Generation encountered an error.", err);
      } finally {
        setIsGenerating(false);
        setIsTranscribing(false);
      }
    })();
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
        setIsAnalyzing(true);
        const analysisResult = await analyzeScript(script, videoFormat, visualStyle);
        setPendingAnalysis(analysisResult);
        setIsAnalyzing(false);
        
        // INTERRUPT: Ask user if they want to use the cinematic tone
        setShowTonePrompt(true);

      } catch (err: any) {
         console.warn("Analysis failed.", err);
         setIsAnalyzing(false);
      }
    })();
  };

  const togglePlay = useCallback(() => {
    if (!audioBuffer) return;
    if (isPlaying) {
      audioService.stopAll();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      audioService.setVoiceSpeed(voiceSpeed);
      audioService.playVoice(audioBuffer, voiceVol, () => setIsPlaying(false), startOffset);
    }
  }, [audioBuffer, isPlaying, reelDuration, voiceVol, voiceSpeed, startOffset]);

  const handleDownloadVideo = async () => {
    if (!audioBuffer || generatedImages.length === 0 || !analysis) return;
    setIsRenderingVideo(true);
    setRenderProgress(0);
    try {
        const mixedAudio = await audioService.getMixBuffer(audioBuffer, analysis.mood, reelDuration, voiceVol, 0, 1.0, null, voiceSpeed);
        const blob = await exportVideo(generatedImages, mixedAudio, wordTimings, videoFormat, reelDuration, p => setRenderProgress(Math.round(p)), showSubtitles);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `VoxScript_Clean_Export.webm`; a.click();
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
            <h2 className="text-2xl font-bold text-white mb-2">Exporting Clean Video...</h2>
            <div className="w-full max-w-md bg-gray-800 rounded-full h-4 overflow-hidden"><div className="h-full bg-brand-500 transition-all" style={{ width: `${renderProgress}%` }} /></div>
            <span className="mt-2 text-brand-400">{renderProgress}% Complete</span>
        </div>
      )}

      {/* Tone Confirmation Dialog */}
      {showTonePrompt && pendingAnalysis && (
          <div className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-sm flex items-center justify-center p-6">
              <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 rounded-2xl bg-brand-600/20 border border-brand-600/40 flex items-center justify-center text-brand-400 mb-6">
                      <SpeakerIcon />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Confirm Voice Tone</h3>
                  <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                      Would you like to use your <span className="text-brand-400 font-semibold">Cinematic Grandeur</span> tone for this voice-over, or should I use the tone generated by AI for this specific script?
                  </p>
                  
                  <div className="space-y-3">
                      <button 
                        onClick={() => startGenerationFlow(pendingAnalysis, true)}
                        className="w-full py-4 rounded-2xl bg-brand-600 text-white font-bold hover:bg-brand-500 transition-all flex flex-col items-center gap-0.5"
                      >
                          <span>Apply Cinematic Grandeur</span>
                          <span className="text-[10px] opacity-70 font-normal">"Breathless, magical discovery..."</span>
                      </button>
                      <button 
                        onClick={() => startGenerationFlow(pendingAnalysis, false)}
                        className="w-full py-3 rounded-2xl bg-gray-800 text-gray-300 font-bold hover:bg-gray-700 transition-all flex flex-col items-center gap-0.5"
                      >
                          <span>Use AI Generated Tone</span>
                          <span className="text-[10px] opacity-70 font-normal">"{pendingAnalysis.voiceInstruction}"</span>
                      </button>
                      <button 
                        onClick={() => setShowTonePrompt(false)}
                        className="w-full py-2 text-xs text-gray-500 font-medium hover:text-gray-400 transition-colors"
                      >
                          Cancel Generation
                      </button>
                  </div>
              </div>
          </div>
      )}

      <header className="border-b border-gray-800 bg-gray-900/50 h-16 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white"><SpeakerIcon /></div>
          <h1 className="text-lg font-bold">VoxScript <span className="text-brand-500">CLEAN</span></h1>
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
                     <span className="text-[10px] font-bold uppercase text-brand-400">Project Analysis</span>
                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white ${MOOD_COLORS[analysis.mood]}`}>{analysis.mood}</span>
                   </div>
                   <div className="text-[11px] text-brand-200 italic line-clamp-2">
                     Applied Instruction: "{analysis.voiceInstruction === CUSTOM_CINEMATIC_TONE ? "Global Cinematic Grandeur" : analysis.voiceInstruction}"
                   </div>
                </div>
              )}

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
                 <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Visual Theme</label>
                    <input className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-brand-500" value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder="e.g. Minimalist, Realistic, High Fidelity..." />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value as VoiceName)} className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-3 text-sm outline-none">
                      {VOICE_OPTIONS.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </select>
                    <button onClick={handleAnalyzeAndGenerate} disabled={isAnalyzing || isGenerating || isTranscribing} className="rounded-xl font-bold bg-brand-600 text-white hover:bg-brand-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                        {isAnalyzing ? 'Analyzing...' : isGenerating ? 'Creating...' : <><MagicIcon /> Generate Video</>}
                    </button>
                 </div>
              </div>
            </div>

            <div className="flex flex-col h-full bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-gray-800 bg-black/20 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-brand-400">Assistant</h2>
                <div className="flex bg-black/40 p-1 rounded-lg border border-gray-700">
                  <button onClick={() => setChatMode('chat')} className={`px-2 py-1 text-[9px] rounded-md font-bold transition-all ${chatMode === 'chat' ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>CHAT</button>
                  <button onClick={() => setChatMode('search')} className={`px-2 py-1 text-[9px] rounded-md font-bold transition-all ${chatMode === 'search' ? 'bg-brand-600 text-white' : 'text-gray-500'}`}>SEARCH</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {chatMessages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-6">
                    <p className="text-sm">Refine your script or get facts via search.</p>
                  </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700'}`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isChatLoading && <div className="text-[10px] text-gray-500 animate-pulse px-2">Processing...</div>}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleChatSubmit} className="p-4 bg-black/20 border-t border-gray-800 flex gap-2">
                <input type="text" value={currentChatInput} onChange={(e) => setCurrentChatInput(e.target.value)} placeholder="Ask assistant..." className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm outline-none" />
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
                        {isPlaying ? <><PauseIcon /> Stop</> : <><PlayIcon /> Preview Voice</>}
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
