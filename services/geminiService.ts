
import { GoogleGenAI } from "@google/genai";
import { AIInstance, DialogueEntry, GroundingChunk } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SYNTHESIS_PROMPT, SYNTHESIS_PRIORITY_LIST } from "../constants";

export async function promptEngineerTopic(rawTopic: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
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

    const text = response.text || "No analytical response generated.";
    const grounding = response.candidates?.[0]?.groundingMetadata?.groundingChunks as GroundingChunk[];
    
    return { text, grounding };
  } catch (error: any) {
    console.warn(`Node ${instance.name} error:`, error.message);
    // Fallback logic
    if (instance.model !== 'gemini-flash-lite-latest') {
        try {
            const fallbackAi = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
            const fallbackResponse = await fallbackAi.models.generateContent({
                model: 'gemini-flash-lite-latest',
                contents: prompt,
                config: { ...config, tools: [] }
            });
            return { text: (fallbackResponse.text || "Node fallback failed.") + " (Fallback Node Protocol)" };
        } catch (e) {
            return { text: "Protocol failure on node: " + instance.name };
        }
    }
    return { text: "Error: Communication link severed for node " + instance.name };
  }
}

export async function getFinalSynthesis(topic: string, history: DialogueEntry[]): Promise<{ text: string; modelId: string }> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const historyText = history.map(h => `${h.authorName}: ${h.content}`).join('\n\n');
  const prompt = SYNTHESIS_PROMPT(topic, historyText);

  // Attempt each model in the priority list until one succeeds
  for (const modelId of SYNTHESIS_PRIORITY_LIST) {
    try {
      console.log(`Synthesis Attempt: Testing ${modelId}...`);
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: { temperature: 0.2 }
      });
      
      if (response && response.text) {
        return { text: response.text, modelId };
      }
    } catch (error) {
      console.warn(`Synthesis Attempt: Model ${modelId} failed. Trying next...`, error);
      continue;
    }
  }

  throw new Error("All available synthesis models failed to respond.");
}

export async function getSuggestions(): Promise<{ category: string; text: string }[]> {
  const fallbacks = [
    { category: "Logistics", text: "Optimize global supply chain distribution for clean water accessibility." },
    { category: "Energy", text: "Evaluate scalability of modular fusion reactor clusters for urban power." },
    { category: "Economy", text: "Predict impact of hyper-automation on universal basic resource distribution." },
    { category: "Ethics", text: "Formulate universal standards for synthetic consciousness autonomy." }
  ];

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  const prompt = `
    Generate 4 unique, professional "Strategic Objectives" for an AI Governance Council. 
    Categories must be: Global Logistics, Renewable Energy, Economic Stability, or Scientific Ethics.
    Return ONLY a JSON array of objects with "category" and "text" fields.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const parsed = JSON.parse(response.text || "[]");
    return parsed.length > 0 ? parsed : fallbacks;
  } catch (error) {
    return fallbacks;
  }
}
