
/**
 * Service to handle client-side video processing tasks
 * such as extracting frames for AI analysis.
 */

export const extractFramesFromVideo = async (source: File | string, numFrames: number = 3): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let objectUrl: string | null = null;
    
    // Config
    video.muted = true;
    video.playsInline = true;
    
    // cleanup helper
    const cleanup = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    // Conditional CORS: Only needed for remote URLs
    if (typeof source === 'string') {
      video.crossOrigin = 'anonymous';
    }

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video. Ensure the URL is a direct link to a video file (mp4/webm) and supports CORS."));
    };

    // Helper to capture a frame at specific time
    const captureFrame = async (time: number): Promise<string | null> => {
      return new Promise((res) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          if (!ctx) return res(null);
          
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            // This will throw a SecurityError if the canvas is tainted (CORS failure)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            const base64 = dataUrl.split(',')[1]; 
            res(base64);
          } catch (e) {
            console.warn("Frame capture failed (likely CORS tainted):", e);
            res(null); 
          }
        };
        
        // Timeout safety in case seek never fires
        const timeoutId = setTimeout(() => {
             video.removeEventListener('seeked', onSeeked);
             res(null);
        }, 2000);

        // Attach listener BEFORE setting currentTime
        video.addEventListener('seeked', () => {
            clearTimeout(timeoutId);
            onSeeked();
        });
        
        video.currentTime = time;
      });
    };

    video.onloadedmetadata = async () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const duration = video.duration;
      
      if (!duration || duration === Infinity) {
          cleanup();
          reject(new Error("Could not determine video duration."));
          return;
      }
      
      try {
        const frames: string[] = [];
        // Capture frames at 20%, 50%, and 80%
        const timePoints = [duration * 0.2, duration * 0.5, duration * 0.8];
        
        for (const time of timePoints) {
            const frame = await captureFrame(time);
            if (frame) frames.push(frame);
        }
        
        cleanup();
        
        if (frames.length === 0) {
            reject(new Error("No frames extracted. This likely means the video server blocked access to image data (CORS Policy)."));
        } else {
            resolve(frames);
        }
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    // Set Source & Trigger Load
    if (typeof source === 'string') {
      video.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      video.src = objectUrl;
    }
    video.load();
  });
};