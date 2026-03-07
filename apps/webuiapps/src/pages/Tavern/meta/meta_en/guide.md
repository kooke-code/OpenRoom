# Tavern Data Guide

## Folder Structure
```
apps/tavern/data/
├── characters/
│   ├── {id}.json          # Character persona text (Agent reads this)
│   └── ...
├── worldbook/
│   ├── {id}.json          # World book entries (Agent reads on demand)
│   └── ...
├── sessions/
│   ├── {id}.json          # Conversation session (Agent reads this)
│   └── ...
├── media/                 # ⚠️ FRONTEND ONLY — DO NOT READ
│   └── {id}.json          # Avatar, sprites, regex scripts, quick replies
└── state.json             # Active character, session, user name
```

> **⚠️ WARNING: The `/media/` directory contains large base64 image data and HTML templates used exclusively by the frontend. NEVER read files from this directory — doing so will exceed token limits.**

## File Definitions

### Characters Directory `/characters/`

Each file is a SillyTavern-compatible character card imported by the user.

This file contains ONLY text persona data. No images, regex scripts, or world book.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| name | string | Yes | Character display name (referenced as {{char}}) |
| description | string | Yes | Character persona/background — use as roleplay context |
| personality | string | No | Personality traits |
| scenario | string | No | Scenario/setting for the roleplay |
| first_mes | string | Yes | First greeting message (may contain {{user}}/{{char}}) |
| mes_example | string | No | Example dialogue showing the character's writing style |
| system_prompt | string | No | System prompt for AI behavior |
| post_history_instructions | string | No | Instructions injected after conversation history |
| creator_notes | string | No | Creator notes |
| tags | string[] | No | Character tags |
| createdAt | string | Yes | ISO timestamp |
| updatedAt | string | Yes | ISO timestamp |

Example:
```json
{
  "id": "abc123",
  "name": "Luna",
  "description": "Luna is a fortune teller at a traveling carnival...",
  "personality": "Mysterious, wise",
  "scenario": "{{user}} enters the fortune teller's tent...",
  "first_mes": "Welcome, {{user}}. The stars told me you would come...",
  "system_prompt": "You are Luna. Stay in character at all times.",
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

### World Book `/worldbook/`

Each file is a JSON array of world book entries for a character. The Agent should read this file when processing SEND_MESSAGE, scan recent conversation text against entry `keys`, and inject matched entry `content` into the prompt.

| Field | Type | Description |
|-------|------|-------------|
| keys | string[] | Keywords to match against recent conversation text |
| secondary_keys | string[] | Additional keywords (for selective entries) |
| content | string | Context text to inject into prompt when keys match |
| enabled | boolean | Whether this entry is active |
| constant | boolean | If true, always inject regardless of key matching |
| selective | boolean | If true, require both primary AND secondary keys to match |
| insertion_order | number | Injection order (lower = earlier in prompt) |

Example (`worldbook/abc123.json`):
```json
[
  {
    "keys": ["crystal ball", "fortune"],
    "content": "The crystal ball glows brighter when powerful emotions are present.",
    "enabled": true,
    "constant": false,
    "insertion_order": 0
  }
]
```

### Sessions Directory `/sessions/`

Each file is a conversation session with a character.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique identifier |
| characterId | string | Yes | Associated character ID |
| messages | Message[] | Yes | Ordered conversation messages |
| createdAt | string | Yes | ISO timestamp |
| updatedAt | string | Yes | ISO timestamp |

**Message structure:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Message unique ID |
| role | string | Yes | "user" or "assistant" |
| content | string | Yes | Message text (may contain {{user}}/{{char}} templates) |
| timestamp | string | Yes | ISO timestamp |

Example session:
```json
{
  "id": "sess-001",
  "characterId": "abc123",
  "messages": [
    { "id": "msg-001", "role": "assistant", "content": "Welcome, {{user}}...", "timestamp": "..." },
    { "id": "msg-002", "role": "user", "content": "Tell me my future.", "timestamp": "..." },
    { "id": "msg-003", "role": "assistant", "content": "*gazes into crystal ball* I see...", "timestamp": "..." }
  ],
  "createdAt": "2026-01-01T00:00:00Z",
  "updatedAt": "2026-01-01T00:00:00Z"
}
```

### State File `/state.json`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| activeCharacterId | string \| null | null | Currently active character ID |
| activeSessionId | string \| null | null | Currently active session ID |
| userName | string | "User" | User's display name (referenced as {{user}}) |

## Roleplay Response Workflow

When you receive a **SEND_MESSAGE** action, you must respond in character:

### Step 1: Read Context
- Read `characters/{characterId}.json` for the character's persona
- Read `sessions/{sessionId}.json` for conversation history
- Read `worldbook/{characterId}.json` for world book entries
- Read `state.json` for `userName`

### Step 2: Build Roleplay Context
- Use `description` + `personality` + `scenario` + `system_prompt` as your persona
- Scan recent conversation text against world book entry `keys`:
  - If `constant: true` → always inject
  - If `selective: true` → require both `keys` AND `secondary_keys` to match
  - Otherwise → inject if any `key` matches
  - Only inject `enabled: true` entries
  - Sort by `insertion_order` (ascending)
- Replace `{{user}}` → userName, `{{char}}` → character name
- Reference `mes_example` for the character's dialogue style

### Step 3: Generate Response
- Write your response in character, following the persona and style
- Keep `{{user}}` and `{{char}}` as template variables (frontend replaces at display time)
- The character's `regex_scripts` may expect specific tags in your output (e.g. `<cm>`, `<note>`, `<screen>`) — follow any patterns you see in `mes_example` or `description`

### Step 4: Persist & Notify
- Generate a unique message ID
- Append `{ id, role: "assistant", content, timestamp }` to the session's messages array
- Write the updated session back to `sessions/{sessionId}.json`
- Send `ADD_MESSAGE` action with `filePath: "/sessions/{sessionId}.json"`

## Data Sync Description

### Agent Creates Data
Agent writes to cloud → sends Action (CREATE_CHARACTER / ADD_MESSAGE) → frontend refreshes UI.

### User Creates Data
User imports card or sends message → frontend writes to cloud → reportAction → Agent receives notification.

### Startup Recovery
Frontend reads state.json → restores active character/session → loads data from cloud.
