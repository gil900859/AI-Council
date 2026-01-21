import { GoogleGenAI } from "@google/genai";
import { AIInstance, DialogueEntry, GroundingChunk } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SYNTHESIS_PROMPT } from "../constants";

export async function promptEngineerTopic(rawTopic: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    You are a professional Prompt Engineer for an AI Governance Council.
    The user provided a raw objective: "${rawTopic}"
    
    Your task is to rewrite this objective into a highly structured, objective, and analytically clear deliberation target for the Council. 
    Make it precise, identify key constraints, and set a clear objective for multi-agent reasoning.
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const historyText = history.length > 0 
    ? history.map(h => `${h.authorName}: ${h.content}`).join('\n')
    : "The deliberation session is just beginning. Provide an opening thesis for the objective.";

  const prompt = `
    Strategic Objective: ${topic}
    Council History:
    ${historyText}
    
    Instruction: Provide your analytical contribution as ${instance.name}. If you believe a logical consensus has been reached, add [TERMINATE_DELIBERATION].
  `;

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
  } catch (error: any) {
    console.error(`Error with node ${instance.name}:`, error);
    if (instance.model !== 'gemini-flash-lite-latest') {
        try {
            const fallbackResponse = await ai.models.generateContent({
                model: 'gemini-flash-lite-latest',
                contents: prompt,
                config: { ...config, tools: [] }
            });
            return { text: fallbackResponse.text || "Fallback error." };
        } catch (e) {
            return { text: "Critical system failure on this node." };
        }
    }
    return { text: "Node offline." };
  }
}

export async function getFinalSynthesis(topic: string, history: DialogueEntry[], modelId: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const historyText = history.map(h => `${h.authorName}: ${h.content}`).join('\n\n');
  const prompt = SYNTHESIS_PROMPT(topic, historyText);

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: { temperature: 0.2 }
    });
    return response.text || "Synthesis failed.";
  } catch (error) {
    console.error("Synthesis error:", error);
    return "The Council has reached a stalemate. Synthesis engine unavailable.";
  }
}

export async function getSuggestions(): Promise<{ category: string; text: string }[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `
    Generate 4 unique, professional "Strategic Objectives" for an AI Research Council. 
    Categories should be: Global Logistics, Renewable Energy, Economic Stability, or Scientific Ethics.
    Output as JSON array of objects with "category" and "text" fields.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    return [
      { category: "Logistics", text: "Design an automated global supply chain for medical essentials." },
      { category: "Energy", text: "Evaluate the feasibility of a thorium-based modular nuclear grid." },
      { category: "Economy", text: "Develop a post-inflationary model for digital decentralized currencies." },
      { category: "Ethics", text: "Establish universal protocols for neural-interface privacy rights." }
    ];
  }
}