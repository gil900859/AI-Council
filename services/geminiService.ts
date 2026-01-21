
import { GoogleGenAI } from "@google/genai";
import { AIInstance, DialogueEntry, GroundingChunk } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SYNTHESIS_PROMPT } from "../constants";

export async function promptEngineerTopic(rawTopic: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: AIzaSyBJxLv2ChMNEsNGMVTC0J-DcvskLOC3LVw });
  const prompt = `
    You are a world-class Prompt Engineer. 
    The user provided a raw problem/topic: "${rawTopic}"
    
    Your task is to rewrite this topic into a highly structured, objective, and analytically clear deliberation target for an AI council. 
    Make it precise, identify key constraints, and set a clear objective.
    Keep the output concise (max 3 sentences).
    Output ONLY the engineered prompt text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text?.trim() || rawTopic;
  } catch (error) {
    console.error("Prompt engineering error:", error);
    return rawTopic;
  }
}

export async function getAIResponse(
  instance: AIInstance,
  topic: string,
  history: DialogueEntry[],
  totalInstances: number
): Promise<{ text: string; grounding?: GroundingChunk[] }> {
  const ai = new GoogleGenAI({ apiKey: AIzaSyBJxLv2ChMNEsNGMVTC0J-DcvskLOC3LVw });
  
  const historyText = history.length > 0 
    ? history.map(h => `${h.authorName}: ${h.content}`).join('\n')
    : "The discussion is just beginning. Provide an opening thesis.";

  const prompt = `
    Topic: ${topic}
    History:
    ${historyText}
    
    Instruction: Provide your contribution as ${instance.name}. If you think consensus is reached, add [TERMINATE_DELIBERATION].
  `;

  // Explicitly enable Google Search tool for all council models as requested
  const config: any = {
    systemInstruction: SYSTEM_PROMPT_TEMPLATE(instance.name, totalInstances),
    temperature: 0.8,
    tools: [{ googleSearch: {} }],
  };

  try {
    const response = await ai.models.generateContent({
      model: instance.model,
      contents: prompt,
      config,
    });

    const text = response.text || "Error: Null response.";
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[];

    return { text, grounding };
  } catch (error) {
    console.error(`Error ${instance.name}:`, error);
    return { text: `[CONNECTION ERROR]` };
  }
}

export async function getFinalSynthesis(topic: string, history: DialogueEntry[], model: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const historyText = history.map(h => `${h.authorName}: ${h.content}`).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: SYNTHESIS_PROMPT(topic, historyText),
      config: {
        temperature: 0.3,
        tools: [{ googleSearch: {} }], // Allow synthesis node to double check facts if needed
      },
    });

    return response.text || "Synthesis failed.";
  } catch (error) {
    console.error("Synthesis error:", error);
    return "Error generating final synthesis.";
  }
}

export async function getSuggestions(): Promise<{ category: string; text: string }[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `Generate 2 diverse, complex, and interesting problem statements for an AI council to deliberate on. 
  One should be scientific/technical, one should be socio-economic or philosophical.
  Each suggestion must have:
  - 'category': a short 1-2 word label (e.g., 'Logistics', 'Philosophy', 'Science').
  - 'text': a 1-sentence complex problem statement.
  Return ONLY a valid JSON array of these 2 objects.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const parsed = JSON.parse(response.text || "[]");
    return parsed.length > 0 ? parsed : [
      { category: "Logistics", text: "Optimize a global renewable energy grid strategy." },
      { category: "Science", text: "Determine the most efficient path to Mars colonization." }
    ];
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    return [
      { category: "Logistics", text: "Optimize a global renewable energy grid strategy." },
      { category: "Science", text: "Determine the most efficient path to Mars colonization." }
    ];
  }
}
