
import { GoogleGenAI, Modality, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { VoiceName, ScriptAnalysis, Mood, ViralAnalysis, ChatMessage, GroundingSource, WordTiming } from '../types';

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let delay = 2000;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const errorStr = error?.message || JSON.stringify(error) || "";
      
      // Handle key selection requirement
      if (errorStr.includes("Requested entity was not found.")) {
        if (typeof window !== 'undefined' && (window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
          return await fn();
        }
      }

      const isQuotaError = error?.status === 'RESOURCE_EXHAUSTED' || errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED');
      
      if (isQuotaError && i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
        continue;
      }
      throw error;
    }
  }
  throw new Error("API operation failed after retries.");
}

const getFreshClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Transcribes audio. If this fails, we catch it in the service to return null 
 * so the UI can use a fallback without showing an error to the user.
 */
export const transcribeGeneratedAudio = async (base64Audio: string): Promise<WordTiming[] | null> => {
  try {
    return await withRetry(async () => {
      const ai = getFreshClient();
      const prompt = `Transcribe this audio. Return ONLY a JSON array of word objects with "word", "start", and "end" timestamps in seconds. Be accurate.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/pcm;rate=24000', data: base64Audio } },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                start: { type: Type.NUMBER },
                end: { type: Type.NUMBER }
              },
              required: ['word', 'start', 'end']
            }
          }
        }
      });

      if (response.text) {
        const timings = JSON.parse(response.text) as WordTiming[];
        return timings.map((t, i) => ({ ...t, index: i }));
      }
      return null;
    });
  } catch (err) {
    console.warn("Transcription failed, using fallback timing calculation.", err);
    return null;
  }
};

export const performAssistantQuery = async (
  prompt: string, 
  mode: 'chat' | 'search',
  history: ChatMessage[] = []
): Promise<ChatMessage> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const model = mode === 'chat' ? 'gemini-3-pro-preview' : 'gemini-3-flash-preview';
    
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const config: any = {
      systemInstruction: mode === 'chat' 
        ? "You are VoxScript AI. Assist with scripts and styles. Provide helpful, creative responses."
        : "You are VoxScript Search AI. Use Google Search to find facts and trends.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          suggestedActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                value: { type: Type.STRING },
                label: { type: Type.STRING }
              }
            }
          }
        },
        required: ['text']
      }
    };

    if (mode === 'search') {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    const data = JSON.parse(response.text || "{}");
    const sources: GroundingSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
      response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
        if (chunk.web) sources.push({ uri: chunk.web.uri, title: chunk.web.title });
      });
    }

    return {
      role: 'model',
      text: data.text || "I'm ready to help.",
      sources: sources.length > 0 ? sources : undefined,
      suggestedActions: data.suggestedActions
    };
  });
};

export const translateScript = async (text: string, targetLanguageLabel: string): Promise<string> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const prompt = `Translate to ${targetLanguageLabel}: "${text}"`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: { parts: [{ text: prompt }] },
    });
    return response.text?.trim() || text;
  });
};

export const analyzeScript = async (text: string, format: '9:16' | '16:9' = '9:16', stylePrompt?: string, viralAnalysis?: ViralAnalysis | null): Promise<ScriptAnalysis> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const prompt = `Script: "${text}". Format: ${format}. Style: ${stylePrompt || 'Cinematic'}. Analyze mood and create 10 visual prompts.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mood: { type: Type.STRING },
            summary: { type: Type.STRING },
            suggestedTempo: { type: Type.NUMBER },
            visualPrompts: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['mood', 'summary', 'suggestedTempo', 'visualPrompts'],
        }
      },
    });
    const json = JSON.parse(response.text || "{}");
    return {
      mood: Mood.Neutral,
      summary: json.summary || "Project Summary",
      suggestedTempo: json.suggestedTempo || 1.0,
      visualPrompts: json.visualPrompts || []
    };
  });
};

export const generateSpeech = async (text: string, voice: VoiceName): Promise<string> => {
  return withRetry(async () => {
    const ai = getFreshClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: text.trim() }] }],
      config: {
        responseModalities: [Modality.AUDIO], 
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!part?.inlineData?.data) throw new Error("TTS failed");
    return part.inlineData.data;
  });
};

export const generateImage = async (prompt: string, aspectRatio: '9:16' | '16:9' = '9:16'): Promise<string | null> => {
  try {
    return await withRetry(async () => {
      const ai = getFreshClient();
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio } }
      });
      return response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data || null;
    });
  } catch (e) {
    console.error("Image generation failed for prompt:", prompt, e);
    return null;
  }
};
