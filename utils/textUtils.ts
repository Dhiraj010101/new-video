
export interface WordTiming {
  word: string;
  start: number;
  end: number;
  index: number;
}

export interface CaptionChunk {
  words: WordTiming[];
  startTime: number;
  endTime: number;
}

export const calculateWordTimings = (caption: string, audioDuration: number): WordTiming[] => {
    if (!caption || audioDuration <= 0) return [];
    
    const rawWords = caption.trim().split(/\s+/);
    
    // Calculate total weighted units based on content length
    const weightedWords = rawWords.map(word => {
        let weight = word.length;
        if (word.length < 3) weight += 1;
        if (word.includes(',')) weight += 4;
        if (word.match(/[.!?]$/)) weight += 8;
        return { word, weight };
    });

    const totalWeight = weightedWords.reduce((acc, w) => acc + w.weight, 0);
    const unitDuration = audioDuration / totalWeight;
    
    let currentTime = 0;
    
    return weightedWords.map((w, i) => {
      const wordDuration = w.weight * unitDuration;
      const timing = {
        word: w.word,
        start: currentTime,
        end: currentTime + wordDuration,
        index: i
      };
      currentTime += wordDuration;
      return timing;
    });
};

export const getCaptionChunks = (wordTimings: WordTiming[], aspectRatio: '9:16' | '16:9'): CaptionChunk[] => {
    const chunks: CaptionChunk[] = [];
    const WORDS_PER_CHUNK = aspectRatio === '16:9' ? 7 : 4; // More words for wide screen
    
    for (let i = 0; i < wordTimings.length; i += WORDS_PER_CHUNK) {
      const chunkWords = wordTimings.slice(i, i + WORDS_PER_CHUNK);
      if (chunkWords.length > 0) {
        chunks.push({
          words: chunkWords,
          startTime: chunkWords[0].start,
          endTime: chunkWords[chunkWords.length - 1].end
        });
      }
    }
    return chunks;
};
