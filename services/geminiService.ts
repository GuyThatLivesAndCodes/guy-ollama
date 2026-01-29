
import { GoogleGenAI } from "@google/genai";

// Strictly adhering to naming and initialization rules
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const optimizePrompt = async (prompt: string): Promise<string> => {
  // Graceful fallback if API_KEY is missing in a specific environment
  if (!process.env.API_KEY) return prompt;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a prompt engineer. Rewrite the following user prompt to be more descriptive, clear, and effective for a large language model. Keep the original intent but improve the structure. Only return the optimized prompt, no conversation.
      
      User Prompt: "${prompt}"`,
      config: {
        temperature: 0.7,
      }
    });
    return response.text.trim() || prompt;
  } catch (e) {
    console.error('Gemini optimization failed', e);
    return prompt;
  }
};

export const generateTitle = async (messages: { role: string, content: string }[]): Promise<string> => {
  if (!process.env.API_KEY || messages.length === 0) return 'New Chat';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a short, snappy title (max 5 words) for this conversation:
      
      ${messages.slice(0, 3).map(m => `${m.role}: ${m.content}`).join('\n')}`,
      config: {
        temperature: 0.5,
      }
    });
    return response.text.trim() || 'Chat Session';
  } catch (e) {
    return 'Chat Session';
  }
};

export const searchWeb = async (query: string): Promise<string> => {
    if (!process.env.API_KEY) return "Search failed: No API key configured.";

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-pro-preview", // Use Pro for higher quality research
            contents: `Research the following query and provide a factual, concise summary of the results: "${query}"`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        
        const text = response.text || "No results found.";
        const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
            ?.map((chunk: any) => chunk.web?.uri)
            .filter(Boolean) || [];

        return `Search results for "${query}":\n\n${text}\n\nSources:\n${sources.join('\n')}`;
    } catch (e) {
        console.error("Gemini search failed", e);
        return `Search error: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
}
