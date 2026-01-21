
export interface AIInstance {
  id: string;
  name: string;
  color: string;
  borderColor: string;
  model: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface DialogueEntry {
  authorId: string;
  authorName: string;
  content: string;
  timestamp: number;
  isHuman?: boolean;
  grounding?: GroundingChunk[];
}

export type DeliberationStatus = 'idle' | 'running' | 'paused' | 'concluded' | 'awaiting_approval';
