import type { RegexScript } from '../types';

interface ParsedRegex {
  pattern: string;
  flags: string;
}

function parseRegexPattern(raw: string): ParsedRegex {
  // SillyTavern supports /pattern/flags syntax
  const wrapped = raw.match(/^\/(.+)\/([gimsuy]*)$/s);
  if (wrapped) {
    return { pattern: wrapped[1], flags: wrapped[2] };
  }
  // Default: no flags (first match only, case-sensitive) per SillyTavern behavior
  return { pattern: raw, flags: '' };
}

function processReplaceString(replaceStr: string, trimStrings?: string[]): string {
  let result = replaceStr;

  // Convert {{match}} macro to JS regex backreference $&
  result = result.replace(/\{\{match\}\}/gi, '$&');

  // Apply trimStrings to replacement template
  if (trimStrings) {
    for (const trim of trimStrings) {
      if (trim) {
        result = result.split(trim).join('');
      }
    }
  }

  return result;
}

const PLACEMENT_MAP: Record<string, number> = {
  md_display: 0,
  user_input: 1,
  ai_output: 2,
  slash_command: 3,
  world_info: 4,
  reasoning: 5,
};

function matchesPlacement(scriptPlacement: (number | string)[], target: string): boolean {
  const targetNum = PLACEMENT_MAP[target];
  return scriptPlacement.some((p) => p === target || p === targetNum);
}

export function applyRegexScripts(
  text: string,
  scripts: RegexScript[],
  placement: 'ai_output' | 'user_input',
  userName?: string,
  charName?: string,
): string {
  let result = text;

  const activeScripts = scripts.filter(
    (s) => !s.disabled && matchesPlacement(s.placement, placement),
  );

  for (const script of activeScripts) {
    try {
      let findPattern = script.findRegex;

      // Resolve macros in find regex if substituteRegex is enabled
      if (script.substituteRegex) {
        if (userName) findPattern = findPattern.replace(/\{\{user\}\}/gi, escapeRegex(userName));
        if (charName) findPattern = findPattern.replace(/\{\{char\}\}/gi, escapeRegex(charName));
      }

      const { pattern, flags } = parseRegexPattern(findPattern);
      const regex = new RegExp(pattern, flags);
      const replacement = processReplaceString(script.replaceString, script.trimStrings);
      result = result.replace(regex, replacement);
    } catch {
      // Skip malformed regex
    }
  }

  return result;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeHtml(html: string): string {
  let cleaned = html;
  cleaned = cleaned.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  cleaned = cleaned.replace(/javascript\s*:/gi, '');
  // Remove <img> pointing to local SillyTavern paths (keep data:, http:, blob:)
  cleaned = cleaned.replace(/<img[^>]+src=["'](?!data:|https?:|blob:)[^"']*["'][^>]*\/?>/gi, '');
  // Remove orphaned image filenames left by broken regex scripts
  cleaned = cleaned.replace(/(?<![/"'\w])\w{2,20}\.(png|jpg|jpeg|gif|webp|svg)(?![/"'\w])/gi, '');
  return cleaned;
}
