import React from 'react';

interface VisualizerProps {
  isPlaying: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isPlaying }) => {
  return (
    <div className="flex items-center justify-center gap-1 h-12 w-full">
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className={`w-1 bg-brand-500 rounded-full transition-all duration-300 ease-in-out ${
            isPlaying ? 'animate-pulse' : 'h-1'
          }`}
          style={{
            height: isPlaying ? `${Math.random() * 100}%` : '4px',
            animationDelay: `${i * 0.05}s`,
            opacity: isPlaying ? 0.8 : 0.3
          }}
        />
      ))}
    </div>
  );
};

export default Visualizer;
