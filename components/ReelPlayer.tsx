
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { getCaptionChunks, WordTiming } from '../utils/textUtils';

interface ReelPlayerProps {
  images: string[];
  isPlaying: boolean;
  totalDuration: number;
  audioDuration: number;
  wordTimings: WordTiming[];
  playbackSpeed: number;
  aspectRatio: '9:16' | '16:9';
  onSeek: (time: number) => void;
  seekTime?: number | null;
  onFinish: () => void;
  onWordUpdate?: (index: number, newTiming: WordTiming) => void;
  showSubtitles?: boolean;
}

const ReelPlayer: React.FC<ReelPlayerProps> = ({ 
  images, 
  isPlaying, 
  totalDuration, 
  audioDuration,
  wordTimings,
  playbackSpeed,
  aspectRatio,
  onSeek,
  seekTime,
  onFinish,
  onWordUpdate,
  showSubtitles = true
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  
  const [subtitleY, setSubtitleY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const initialY = useRef(0);
  
  const animationFrameRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number | null>(null);

  const captionChunks = useMemo(() => {
    return getCaptionChunks(wordTimings, aspectRatio);
  }, [wordTimings, aspectRatio]);

  useEffect(() => {
    if (seekTime !== undefined && seekTime !== null && seekTime !== lastSeekTimeRef.current) {
        setElapsedTime(seekTime);
        if (totalDuration > 0) {
            setProgress((seekTime / totalDuration) * 100);
        }
        lastSeekTimeRef.current = seekTime;
    }
  }, [seekTime, totalDuration]);

  useEffect(() => {
    if (isPlaying && totalDuration > 0) {
      let lastFrameTime = Date.now();
      let accumulatedTime = elapsedTime; 

      const animate = () => {
        const now = Date.now();
        const deltaSeconds = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        
        accumulatedTime += (deltaSeconds * playbackSpeed);

        if (accumulatedTime >= totalDuration) {
          setElapsedTime(totalDuration);
          setProgress(100);
          onFinish();
          return; 
        }

        setElapsedTime(accumulatedTime);
        setProgress((accumulatedTime / totalDuration) * 100);

        if (images.length > 0) {
          const segmentDuration = totalDuration / images.length;
          const index = Math.min(
            Math.floor(accumulatedTime / segmentDuration), 
            images.length - 1
          );
          setCurrentImageIndex(index);
        }

        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, totalDuration, playbackSpeed, images.length]);

  const handleManualSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      const newTime = (val / 100) * totalDuration;
      setElapsedTime(newTime);
      setProgress(val);
      lastSeekTimeRef.current = newTime;
      onSeek(newTime);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
      if (isEditing || !showSubtitles) return; 
      setIsDragging(true);
      dragStartY.current = e.clientY;
      initialY.current = subtitleY;
      e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging) return;
      const deltaY = e.clientY - dragStartY.current;
      const limit = aspectRatio === '16:9' ? 100 : 250;
      const newY = Math.max(-limit, Math.min(limit, initialY.current + deltaY));
      setSubtitleY(newY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      setIsDragging(false);
      e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const adjustTiming = (index: number, field: 'start' | 'end', delta: number) => {
      if (!onWordUpdate) return;
      const word = wordTimings[index];
      if (!word) return;

      const newTiming = { ...word };
      if (field === 'start') {
          newTiming.start = Math.max(0, parseFloat((newTiming.start + delta).toFixed(2)));
          if (newTiming.start >= newTiming.end) newTiming.end = newTiming.start + 0.1;
      } else {
          newTiming.end = parseFloat((newTiming.end + delta).toFixed(2));
          if (newTiming.end <= newTiming.start) newTiming.start = Math.max(0, newTiming.end - 0.1);
      }
      onWordUpdate(index, newTiming);
  };

  const activeChunk = captionChunks.find(
    chunk => elapsedTime >= chunk.startTime && elapsedTime < chunk.endTime
  ) || (elapsedTime >= audioDuration ? null : captionChunks[0]);

  const containerClasses = aspectRatio === '9:16'
    ? "w-[340px] h-[600px] rounded-[32px] border-8 border-gray-900 shadow-2xl"
    : "w-full max-w-[800px] aspect-video rounded-xl border-4 border-gray-900 shadow-2xl";

  const captionTextClasses = aspectRatio === '9:16'
    ? "text-2xl"
    : "text-3xl md:text-4xl";

  return (
    <div className={`relative bg-black overflow-hidden mx-auto select-none font-sans group ${containerClasses}`}>
      {images.length > 0 ? (
        images.map((img, index) => (
           <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === currentImageIndex ? 'opacity-100' : 'opacity-0'
            }`}
           >
             <img 
               src={`data:image/png;base64,${img}`} 
               alt={`Scene ${index}`}
               className={`w-full h-full object-cover transition-transform duration-[20000ms] ease-linear ${
                   index === currentImageIndex && isPlaying ? 'scale-125' : 'scale-100'
               }`}
             />
             <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/80" />
           </div>
        ))
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-gray-600 p-8 text-center">
            <p>AI Scenes will appear here (10 count)</p>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 z-30 h-6 group/timeline cursor-pointer">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-600/50">
            <div 
                className="h-full bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                style={{ width: `${progress}%` }}
            />
          </div>
          <input 
            type="range" 
            min="0" 
            max="100" 
            step="0.1"
            value={progress}
            onChange={handleManualSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
      </div>

      {showSubtitles && (
          <div className="absolute top-4 right-4 z-40">
              <button 
                 onClick={() => setIsEditing(!isEditing)}
                 className={`p-2 rounded-full transition-all ${isEditing ? 'bg-brand-500 text-white' : 'bg-black/40 text-gray-300 hover:bg-black/60'}`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                   <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                   <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                 </svg>
              </button>
          </div>
      )}

      <div className="absolute inset-0 z-10 flex flex-col justify-between p-6 pointer-events-none">
        <div className="flex flex-col justify-end h-full pb-8">
            
            {showSubtitles && (
                <div 
                    className={`mb-6 min-h-[120px] flex items-center justify-center relative cursor-ns-resize pointer-events-auto touch-none transition-opacity ${isEditing ? 'opacity-50' : 'opacity-100'}`}
                    style={{ transform: `translateY(${subtitleY}px)` }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                >
                    <div className="text-center w-full px-4">
                        <div className="flex flex-wrap justify-center gap-x-3 gap-y-2">
                            {activeChunk?.words.map((w) => {
                                const isRevealed = elapsedTime >= w.start;
                                const isActive = elapsedTime >= w.start && elapsedTime < w.end;
                                return (
                                    <span 
                                        key={w.index}
                                        className={`${captionTextClasses} font-black transition-all duration-100
                                            ${isRevealed ? 'opacity-100' : 'opacity-0'}
                                        `}
                                        style={{ 
                                            textShadow: '3px 3px 0px rgba(0,0,0,0.8)',
                                            color: isActive ? '#fbbf24' : '#ffffff' 
                                        }}
                                    >
                                        {w.word}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
            
            {isEditing && showSubtitles && activeChunk && (
                <div className="pointer-events-auto bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-xl p-3 mb-2 animate-in slide-in-from-bottom-5 max-h-[200px] overflow-y-auto custom-scrollbar">
                    <div className="text-[10px] uppercase font-bold text-gray-500 mb-2 flex justify-between">
                        <span>Timing Editor</span>
                        <span>{elapsedTime.toFixed(1)}s</span>
                    </div>
                    <div className="space-y-2">
                        {activeChunk.words.map((w) => {
                             const isActive = elapsedTime >= w.start && elapsedTime < w.end;
                             return (
                                <div key={w.index} className={`flex items-center gap-2 text-xs ${isActive ? 'bg-gray-800 rounded p-1 -mx-1' : ''}`}>
                                    <button onClick={() => adjustTiming(w.index, 'start', -0.1)} className="p-1 text-gray-400">-</button>
                                    <span className="w-8 text-center font-mono text-blue-300">{w.start.toFixed(1)}</span>
                                    <button onClick={() => adjustTiming(w.index, 'start', 0.1)} className="p-1 text-gray-400">+</button>
                                    <span className={`flex-1 text-center font-bold truncate ${isActive ? 'text-brand-400' : 'text-gray-300'}`}>{w.word}</span>
                                    <button onClick={() => adjustTiming(w.index, 'end', -0.1)} className="p-1 text-gray-400">-</button>
                                    <span className="w-8 text-center font-mono text-purple-300">{w.end.toFixed(1)}</span>
                                    <button onClick={() => adjustTiming(w.index, 'end', 0.1)} className="p-1 text-gray-400">+</button>
                                </div>
                             )
                        })}
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ReelPlayer;
