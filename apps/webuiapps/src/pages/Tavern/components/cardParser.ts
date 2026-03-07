import type {
  CharacterCard,
  CharacterCardV1,
  CharacterCardV2,
  CharacterCardV2Data,
  WorldBookEntry,
  RegexScript,
} from '../types';
import { generateId } from '@/lib';

function readPngChunks(buffer: ArrayBuffer): Map<string, string> {
  const view = new DataView(buffer);
  const textChunks = new Map<string, string>();
  let offset = 8; // Skip PNG signature

  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const typeBytes = new Uint8Array(buffer, offset + 4, 4);
    const chunkType = String.fromCharCode(...typeBytes);

    if (chunkType === 'tEXt') {
      const data = new Uint8Array(buffer, offset + 8, length);
      const nullIndex = data.indexOf(0);
      if (nullIndex !== -1) {
        const keyword = new TextDecoder().decode(data.slice(0, nullIndex));
        const value = new TextDecoder().decode(data.slice(nullIndex + 1));
        textChunks.set(keyword, value);
      }
    }

    // length(4) + type(4) + data(length) + crc(4)
    offset += 12 + length;

    if (chunkType === 'IEND') break;
  }

  return textChunks;
}

function normalizeWorldBook(book?: {
  entries: Record<string, WorldBookEntry> | WorldBookEntry[];
}): WorldBookEntry[] {
  if (!book?.entries) return [];
  if (Array.isArray(book.entries)) return book.entries;
  return Object.values(book.entries);
}

function normalizeRegexScripts(extensions?: {
  regex_scripts?: RegexScript[];
  [key: string]: unknown;
}): RegexScript[] {
  if (!extensions?.regex_scripts) return [];
  return extensions.regex_scripts;
}

function v1ToCharacterCard(v1: CharacterCardV1, avatar: string): CharacterCard {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: v1.name || 'Unknown',
    description: v1.description || '',
    personality: v1.personality || '',
    scenario: v1.scenario || '',
    first_mes: v1.first_mes || '',
    mes_example: v1.mes_example || '',
    system_prompt: '',
    post_history_instructions: '',
    creator_notes: '',
    tags: [],
    avatar,
    world_book: [],
    regex_scripts: [],
    quick_replies: [],
    sprite_map: {},
    createdAt: now,
    updatedAt: now,
  };
}

function v2ToCharacterCard(v2data: CharacterCardV2Data, avatar: string): CharacterCard {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    name: v2data.name || 'Unknown',
    description: v2data.description || '',
    personality: v2data.personality || '',
    scenario: v2data.scenario || '',
    first_mes: v2data.first_mes || '',
    mes_example: v2data.mes_example || '',
    system_prompt: v2data.system_prompt || '',
    post_history_instructions: v2data.post_history_instructions || '',
    creator_notes: v2data.creator_notes || '',
    tags: v2data.tags || [],
    avatar,
    world_book: normalizeWorldBook(v2data.character_book),
    regex_scripts: normalizeRegexScripts(v2data.extensions),
    quick_replies: [],
    sprite_map: {},
    createdAt: now,
    updatedAt: now,
  };
}

export async function parseCharacterCardPng(file: File): Promise<CharacterCard> {
  const buffer = await file.arrayBuffer();
  const textChunks = readPngChunks(buffer);

  const charaData = textChunks.get('chara');
  if (!charaData) {
    throw new Error('No character data found in PNG tEXt chunk');
  }

  const binaryString = atob(charaData);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  const decoded = new TextDecoder('utf-8').decode(bytes);
  const json = JSON.parse(decoded);

  const avatarDataUrl = await fileToDataUrl(file);

  // Detect V2 format
  if (json.spec === 'chara_card_v2' && json.data) {
    const v2 = json as CharacterCardV2;
    return v2ToCharacterCard(v2.data, avatarDataUrl);
  }

  // Fall back to V1 format
  if (json.name !== undefined) {
    return v1ToCharacterCard(json as CharacterCardV1, avatarDataUrl);
  }

  throw new Error('Unrecognized character card format');
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
