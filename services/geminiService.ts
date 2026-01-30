
import { GoogleGenAI } from "@google/genai";

export const getGeminiHelp = async (prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are an expert systems administrator and AI engineer. Help the user set up and troubleshoot their Ollama + Cloudflare Tunnel configuration. Keep responses concise and technical.",
      }
    });
    return response.text || "I'm sorry, I couldn't process that.";
  } catch (error) {
    return "Error connecting to Gemini for assistance: " + (error as Error).message;
  }
};
