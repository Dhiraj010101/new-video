
import { GoogleGenAI, Modality, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { VoiceName, ScriptAnalysis, Mood, ViralAnalysis, ChatMessage, GroundingSource } from '../types';

/**
 * Helper to wrap API calls with exponential backoff for 429 (Quota) errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let delay = 2000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = error?.message || JSON.stringify(error) || "";
      
      if (errorStr.includes("Requested entity was not found.")) {
        if (typeof window !== 'undefined' && (window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
          return await fn();
        }
      }

      const isQuotaError = 
        error?.status === 'RESOURCE_EXHAUSTED' || 
        errorStr.includes('429') || 
        errorStr.includes('RESOURCE_EXHAUSTED') ||
        error?.message?.includes('429');

      if (isQuotaError && i < maxRetries - 1) {
        console.warn(`Quota exceeded. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
        continue;
      }
      throw error;
    }
  }
  throw new Error("Maximum retries reached for API quota. Please select a paid API key to continue.");
}

const getFreshClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const performAssistantQuery = async (
  prompt: string, 
  mode: 'chat' | 'search',
  history: ChatMessage[] = []
): Promise<{ text: string; sources?: GroundingSource[] }> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const model = mode === 'chat' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    
    // Format history for the API
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const config: any = {
      systemInstruction: mode === 'chat' 
        ? "You are the VoxScript Creative Assistant. Help the user write amazing video scripts and define visual styles. If you provide a script, make it punchy and ready for voice-over."
        : "You are the VoxScript Research Bot. Use Google Search to find up-to-date information, news, and facts for video scripts. Always provide accurate and cited data."
    };

    if (mode === 'search') {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    const sources: GroundingSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          sources.push({
            uri: chunk.web.uri,
            title: chunk.web.title
          });
        }
      });
    }

    return {
      text: response.text || "I'm sorry, I couldn't process that.",
      sources: sources.length > 0 ? sources : undefined
    };
  });
};

export const translateScript = async (text: string, targetLanguageLabel: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const prompt = `Translate the following script to ${targetLanguageLabel}. 
    Ensure the translation is natural, suitable for voice-over, and retains the original mood and meaning.
    Return ONLY the translated text without any introduction or markdown.
    
    Script: "${text}"`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
    });

    return response.text ? response.text.trim() : text;
  });
};

export const analyzeViralFrames = async (frames: string[]): Promise<ViralAnalysis> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    
    const prompt = `You are a social media virality expert. Analyze these video frames from a trending viral video.
    Identify the following elements that contribute to its success:
    1. Visual Style (e.g., lo-fi, cinematic, chaotic, minimalist)
    2. The Hook Strategy (visual or structural)
    3. The Pacing (implied from the visual progression)
    4. Color Palette/Grading
    
    Provide a JSON response.`;

    const parts: any[] = [
      ...frames.map(base64 => ({
        inlineData: { mimeType: 'image/jpeg', data: base64 }
      })),
      { text: prompt }
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            visualStyle: { type: Type.STRING },
            hookType: { type: Type.STRING },
            pacing: { type: Type.STRING },
            colorPalette: { type: Type.STRING },
            summary: { type: Type.STRING, description: "A concise summary of the viral 'DNA' of this video." }
          },
          required: ['visualStyle', 'hookType', 'pacing', 'colorPalette', 'summary']
        }
      }
    });

    if (response.text) {
       return JSON.parse(response.text) as ViralAnalysis;
    }
    throw new Error("Failed to analyze viral frames");
  });
};

export const analyzeScript = async (
    text: string, 
    format: '9:16' | '16:9' = '9:16', 
    stylePrompt?: string,
    viralAnalysis?: ViralAnalysis | null
): Promise<ScriptAnalysis> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    
    const formatInstructions = format === '9:16' 
      ? "short vertical video reel (9:16 format). Focus on tall, high-impact vertical compositions." 
      : "long-form cinematic YouTube video (16:9 format). Focus on wide, panoramic, epic compositions.";

    let styleInstruction = stylePrompt 
      ? `\nCORE ART STYLE: "${stylePrompt}". Apply this aesthetic to every scene.` 
      : "";

    if (viralAnalysis) {
        styleInstruction += `\n\nVIRAL DNA INTEGRATION:
        - Match the visual rhythm: ${viralAnalysis.pacing}
        - Utilize the color science: ${viralAnalysis.colorPalette}
        - Emulate the vibe: ${viralAnalysis.visualStyle}`;
    }

    const prompt = `You are a world-class Film Director and Cinematographer. Analyze the script and create a 10-shot storyboard.
    
    For each of the 10 visual prompts, you MUST follow this Cinematography Protocol:
    1. Shot Type: Vary between Extreme Wide, Medium Close-up, Low-angle Hero, and Top-down Bird's-eye.
    2. Lighting: Specify lighting (e.g., chiaroscuro, volumetric god rays, soft rim lighting, neon teal-and-orange).
    3. Optics: Define lens feel (e.g., shallow depth of field with 50mm bokeh, anamorphic lens flares, sharp macro focus).
    4. Motion/Stills: Describe the frame as if captured by a high-end RED camera on a gimbal.
    
    Script: "${text}"
    Format Context: ${formatInstructions}
    ${styleInstruction}
    
    Return the analysis as a JSON object.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mood: { type: Type.STRING, description: "The overarching emotional tone." },
            summary: { type: Type.STRING, description: "A punchy summary of the video concept." },
            suggestedTempo: { type: Type.NUMBER, description: "Voice pacing from 0.8 to 1.2." },
            visualPrompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "10 cinematic image prompts including shot type, lighting, and camera specs."
            }
          },
          required: ['mood', 'summary', 'suggestedTempo', 'visualPrompts'],
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      },
    });

    if (response.text) {
      const cleanJson = response.text.replace(/```json|```/g, '').trim();
      const json = JSON.parse(cleanJson);
      
      let mood = Mood.Neutral;
      if (json.mood) {
        const normalizedMood = json.mood.charAt(0).toUpperCase() + json.mood.slice(1).toLowerCase();
        if (Object.values(Mood).includes(normalizedMood as Mood)) {
            mood = normalizedMood as Mood;
        }
      }

      return {
          mood,
          summary: json.summary || "A cinematic story.",
          suggestedTempo: json.suggestedTempo || 1.0,
          visualPrompts: json.visualPrompts || []
      };
    }
    
    throw new Error("Failed to analyze script: No response from AI");
  });
};

export const generateSpeech = async (text: string, voice: VoiceName): Promise<string> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    
    if (!text || !text.trim()) {
        throw new Error("Script is empty, cannot generate speech.");
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{
        parts: [{ text: text.trim() }]
      }],
      config: {
        responseModalities: [Modality.AUDIO], 
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      },
    });

    const candidate = response.candidates?.[0];
    if (!candidate) throw new Error("No candidates returned from API.");

    const firstPart = candidate.content?.parts?.[0];
    if (firstPart?.inlineData?.data) {
      return firstPart.inlineData.data;
    }
    
    throw new Error(`No audio data returned. FinishReason: ${candidate.finishReason || 'Unknown'}`);
  });
};

export const generateImage = async (prompt: string, aspectRatio: '9:16' | '16:9' = '9:16'): Promise<string | null> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `Photorealistic cinematic masterwork: ${prompt}. High quality, 8k resolution, professional color grading.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    return null;
  });
};
