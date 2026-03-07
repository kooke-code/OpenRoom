export interface WorldBookEntry {
  keys: string[];
  secondary_keys?: string[];
  content: string;
  comment?: string;
  enabled: boolean;
  insertion_order: number;
  position?: 'before_char' | 'after_char' | 'before_example' | 'after_example';
  constant?: boolean;
  selective?: boolean;
}

export interface RegexScript {
  scriptName: string;
  findRegex: string;
  replaceString: string;
  trimStrings?: string[];
  placement: (number | string)[];
  disabled: boolean;
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: boolean;
}

export interface QuickReply {
  id: string;
  label: string;
  message: string;
  requiresInput: boolean;
  inputPlaceholder?: string;
}

export interface CharacterCardV1 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
}

export interface CharacterCardV2Data {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  tags: string[];
  character_book?: {
    entries: Record<string, WorldBookEntry> | WorldBookEntry[];
  };
  extensions?: {
    regex_scripts?: RegexScript[];
    [key: string]: unknown;
  };
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: string;
  data: CharacterCardV2Data;
}

export interface CharacterCard {
  id: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt: string;
  post_history_instructions: string;
  creator_notes: string;
  tags: string[];
  avatar: string;
  world_book: WorldBookEntry[];
  regex_scripts: RegexScript[];
  quick_replies: QuickReply[];
  sprite_map: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Session {
  id: string;
  characterId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface TavernState {
  characters: CharacterCard[];
  sessions: Session[];
  activeCharacterId: string | null;
  activeSessionId: string | null;
  userName: string;
  currentEmotion: string;
  isLoading: boolean;
  showImportModal: boolean;
  showSettings: boolean;
}

export type TavernAction =
  | { type: 'SET_CHARACTERS'; payload: CharacterCard[] }
  | { type: 'ADD_CHARACTER'; payload: CharacterCard }
  | { type: 'UPDATE_CHARACTER'; payload: CharacterCard }
  | { type: 'REMOVE_CHARACTER'; payload: string }
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'ADD_SESSION'; payload: Session }
  | { type: 'UPDATE_SESSION'; payload: Session }
  | { type: 'REMOVE_SESSION'; payload: string }
  | { type: 'SET_ACTIVE_CHARACTER'; payload: string | null }
  | { type: 'SET_ACTIVE_SESSION'; payload: string | null }
  | { type: 'SET_USER_NAME'; payload: string }
  | { type: 'SET_EMOTION'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SHOW_IMPORT_MODAL'; payload: boolean }
  | { type: 'SHOW_SETTINGS'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: { sessionId: string; message: Message } };
