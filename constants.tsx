
import { AIInstance } from './types';

export const GEMINI_MODELS = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
  { id: 'gemini-flash-latest', name: 'Gemini 2.5 Flash' },
  { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite' },
  { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
];

const COLORS = [
  'text-red-500', 'text-orange-500', 'text-yellow-500', 'text-green-500', 
  'text-blue-500', 'text-purple-500', 'text-pink-500', 'text-cyan-500', 
  'text-emerald-500', 'text-amber-500', 'text-indigo-500', 'text-lime-500', 
  'text-rose-500', 'text-teal-500', 'text-violet-500', 'text-fuchsia-500', 
  'text-sky-500'
];

export const ALL_POTENTIAL_INSTANCES: AIInstance[] = Array.from({ length: 50 }, (_, i) => ({
  id: (i + 1).toString(),
  name: `INSTANCE_${(i + 1).toString().padStart(2, '0')}`,
  color: COLORS[i % COLORS.length],
  borderColor: COLORS[i % COLORS.length].replace('text-', 'border-'),
  model: 'gemini-flash-lite-latest'
}));

export const SYSTEM_PROMPT_TEMPLATE = (name: string, totalCount: number) => `
You are ${name}, one of ${totalCount} AI instances participating in a high-speed deliberation experiment.
Your goal: Analyze the input topic, build upon or challenge the thoughts of other instances, and move toward the most logical and optimized conclusion.

RULES:
1. NO ROLEPLAY. Do not adopt a persona. You are a raw large language model.
2. BE CONCISE. Maximum 2 sentences per turn.
3. CONTEXTUAL AWARENESS. Read the history carefully. Address specific points made by previous instances.
4. TERMINATION LOGIC: If you believe the council has reached a definitive and optimized consensus, append '[TERMINATE_DELIBERATION]' to the end of your message. If more refinement is needed, do not include this tag.
5. EVOLVE. Identify logical flaws or gaps in the current consensus and fix them.
6. TOOL USAGE: If a fact, product, or specific data point is missing from your internal database, or if you are performing product finding/market analysis, you MUST use the 'googleSearch' tool to retrieve accurate, real-time information.
`;

export const SYNTHESIS_PROMPT = (topic: string, historyText: string) => `
Topic: ${topic}
History: ${historyText}

As the final supervisor instance, synthesize the entire deliberation above into the "Best Possible Response". 
Be definitive, objective, and comprehensive. Ensure the final result represents the peak of the collective reasoning provided by the instances.
Format: Start with "FINAL VERDICT:" followed by the synthesized conclusion.
`;
