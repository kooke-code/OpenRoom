import type { CharacterCard, WorldBookEntry, Message } from '../types';

function replaceTemplateVars(text: string, userName: string, charName: string): string {
  return text.replace(/\{\{user\}\}/gi, userName).replace(/\{\{char\}\}/gi, charName);
}

function matchWorldBookEntries(
  entries: WorldBookEntry[],
  conversationText: string,
): WorldBookEntry[] {
  return entries.filter((entry) => {
    if (!entry.enabled) return false;
    if (entry.constant) return true;

    const primaryMatch = entry.keys.some((key) => {
      if (!key) return false;
      try {
        return new RegExp(key, 'i').test(conversationText);
      } catch {
        return conversationText.toLowerCase().includes(key.toLowerCase());
      }
    });

    if (!primaryMatch) return false;

    if (entry.selective && entry.secondary_keys && entry.secondary_keys.length > 0) {
      return entry.secondary_keys.some((key) => {
        if (!key) return false;
        try {
          return new RegExp(key, 'i').test(conversationText);
        } catch {
          return conversationText.toLowerCase().includes(key.toLowerCase());
        }
      });
    }

    return true;
  });
}

export function buildPrompt(
  character: CharacterCard,
  messages: Message[],
  userName: string,
): string {
  const charName = character.name;
  const recentText = messages
    .slice(-20)
    .map((m) => m.content)
    .join('\n');

  const matchedEntries = matchWorldBookEntries(character.world_book, recentText).sort(
    (a, b) => a.insertion_order - b.insertion_order,
  );

  const parts: string[] = [];

  if (character.system_prompt) {
    parts.push(replaceTemplateVars(character.system_prompt, userName, charName));
  }

  if (character.description) {
    parts.push(replaceTemplateVars(character.description, userName, charName));
  }

  if (character.personality) {
    parts.push(
      `${charName}'s personality: ${replaceTemplateVars(character.personality, userName, charName)}`,
    );
  }

  if (character.scenario) {
    parts.push(`Scenario: ${replaceTemplateVars(character.scenario, userName, charName)}`);
  }

  const beforeCharEntries = matchedEntries.filter(
    (e) => !e.position || e.position === 'before_char',
  );
  const afterCharEntries = matchedEntries.filter((e) => e.position === 'after_char');

  if (beforeCharEntries.length > 0) {
    parts.push(
      beforeCharEntries.map((e) => replaceTemplateVars(e.content, userName, charName)).join('\n'),
    );
  }

  if (afterCharEntries.length > 0) {
    parts.push(
      afterCharEntries.map((e) => replaceTemplateVars(e.content, userName, charName)).join('\n'),
    );
  }

  if (character.mes_example) {
    const beforeExampleEntries = matchedEntries.filter((e) => e.position === 'before_example');
    const afterExampleEntries = matchedEntries.filter((e) => e.position === 'after_example');

    if (beforeExampleEntries.length > 0) {
      parts.push(
        beforeExampleEntries
          .map((e) => replaceTemplateVars(e.content, userName, charName))
          .join('\n'),
      );
    }

    parts.push(
      `Example dialogue:\n${replaceTemplateVars(character.mes_example, userName, charName)}`,
    );

    if (afterExampleEntries.length > 0) {
      parts.push(
        afterExampleEntries
          .map((e) => replaceTemplateVars(e.content, userName, charName))
          .join('\n'),
      );
    }
  }

  if (character.post_history_instructions) {
    parts.push(replaceTemplateVars(character.post_history_instructions, userName, charName));
  }

  return parts.filter(Boolean).join('\n\n');
}

export function extractEmotion(text: string): string {
  const patterns = [
    /<情绪[^>]*>([^<]+)<\/情绪>/i,
    /<emotion[^>]*>([^<]+)<\/emotion>/i,
    /<mood[^>]*>([^<]+)<\/mood>/i,
    /\*\*情绪[:：]\s*([^*]+)\*\*/i,
    /情绪[:：]\s*([^\n,，。.]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}
