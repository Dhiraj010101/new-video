
import { getCaptionChunks, WordTiming } from '../utils/textUtils';

export const exportVideo = async (
  images: string[],
  audioBuffer: AudioBuffer,
  wordTimings: WordTiming[],
  aspectRatio: '9:16' | '16:9',
  totalDuration: number,
  onProgress: (pct: number) => void,
  showSubtitles: boolean = true
): Promise<Blob> => {
  return new Promise(async (resolve, reject) => {
    try {
      const width = aspectRatio === '16:9' ? 1920 : 1080;
      const height = aspectRatio === '16:9' ? 1080 : 1920;
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // Set high-quality scaling settings
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const loadedImages: HTMLImageElement[] = [];
      for (const b64 of images) {
        await new Promise<void>((resolveImg) => {
          const img = new Image();
          img.onload = () => {
            loadedImages.push(img);
            resolveImg();
          };
          img.src = `data:image/png;base64,${b64}`;
        });
      }

      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);

      // Capture at 30fps for standard video smoothness
      const canvasStream = canvas.captureStream(30); 
      
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks()
      ]);

      /**
       * To achieve ~100MB for a 1-minute video:
       * 100MB = 800Mb. 800Mb / 60s = ~13.3 Mbps.
       * We set it to 15Mbps (15,000,000 bps) to ensure ultra-high quality.
       */
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 15000000 // 15 Mbps for high-fidelity output
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        audioCtx.close();
        resolve(blob);
      };

      const captionChunks = getCaptionChunks(wordTimings, aspectRatio);

      recorder.start();
      source.start();
      const startTime = performance.now();
      
      let animationFrameId: number;

      const renderLoop = () => {
        const now = performance.now();
        const elapsedTime = (now - startTime) / 1000;

        if (elapsedTime >= totalDuration) {
          recorder.stop();
          source.stop();
          cancelAnimationFrame(animationFrameId);
          onProgress(100);
          return;
        }

        onProgress((elapsedTime / totalDuration) * 100);

        const segmentDuration = totalDuration / loadedImages.length;
        const imgIndex = Math.min(
            Math.floor(elapsedTime / segmentDuration), 
            loadedImages.length - 1
        );
        
        if (loadedImages[imgIndex]) {
            const img = loadedImages[imgIndex];
            // High-quality cover-style drawing
            const scale = Math.max(width / img.width, height / img.height) * 1.05; 
            const x = (width / 2) - (img.width / 2) * scale;
            const y = (height / 2) - (img.height / 2) * scale;
            
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            
            // Subtle cinematic overlay for depth
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, width, height);
        }

        if (showSubtitles) {
            const activeChunk = captionChunks.find(
              chunk => elapsedTime >= chunk.startTime && elapsedTime < chunk.endTime
            ) || (elapsedTime < audioBuffer.duration ? captionChunks[0] : null);

            if (activeChunk) {
               const fontSize = aspectRatio === '9:16' ? 70 : 90;
               ctx.font = `900 ${fontSize}px Inter, sans-serif`;
               ctx.textAlign = 'left';
               ctx.textBaseline = 'top';
               
               const maxWidth = width * 0.85; 
               
               interface RenderLine {
                   words: { text: string; width: number; start: number; end: number }[];
                   totalWidth: number;
               }

               const lines: RenderLine[] = [];
               let currentLine: RenderLine['words'] = [];
               let currentLineWidth = 0;

               activeChunk.words.forEach(w => {
                   const wordText = w.word + ' ';
                   const wordWidth = ctx.measureText(wordText).width;

                   if (currentLineWidth + wordWidth < maxWidth) {
                       currentLine.push({ text: w.word, width: wordWidth, start: w.start, end: w.end });
                       currentLineWidth += wordWidth;
                   } else {
                       lines.push({ words: currentLine, totalWidth: currentLineWidth });
                       currentLine = [{ text: w.word, width: wordWidth, start: w.start, end: w.end }];
                       currentLineWidth = wordWidth;
                   }
               });
               if (currentLine.length > 0) {
                   lines.push({ words: currentLine, totalWidth: currentLineWidth });
               }

               const lineHeight = fontSize * 1.35;
               const blockHeight = lines.length * lineHeight;
               let currentY = (height * 0.78) - (blockHeight / 2);

               lines.forEach(line => {
                   let currentX = (width - line.totalWidth) / 2;
                   line.words.forEach(w => {
                       const isActive = elapsedTime >= w.start && elapsedTime < w.end;
                       
                       // Cinematic Shadow/Stroke
                       ctx.fillStyle = 'rgba(0,0,0,0.9)';
                       ctx.fillText(w.text, currentX + 4, currentY + 4);
                       
                       // Main Text with active word highlighting
                       ctx.fillStyle = isActive ? '#fbbf24' : '#ffffff';
                       ctx.fillText(w.text, currentX, currentY);
                       currentX += w.width;
                   });
                   currentY += lineHeight;
               });
            }
        }

        animationFrameId = requestAnimationFrame(renderLoop);
      };

      renderLoop();

    } catch (e) {
      reject(e);
    }
  });
};
