import React, { useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { initVibeApp, AppLifecycle } from '@gui/vibe-container';
import {
  useAgentActionListener,
  reportAction,
  reportLifecycle,
  fetchVibeInfo,
  createAppFileApi,
  batchConcurrent,
  generateId,
  type CharacterAppAction,
} from '@/lib';
import './i18n';
import { TavernProvider, useTavernState, useTavernDispatch } from './store/TavernContext';
import SpritePanel from './components/SpritePanel';
import TopBar from './components/TopBar';
import MessageList from './components/MessageList';
import QuickReplyBar from './components/QuickReplyBar';
import InputBar from './components/InputBar';
import ImportModal from './components/ImportModal';
import SettingsDrawer from './components/SettingsDrawer';
import { extractEmotion } from './components/promptBuilder';
import type { CharacterCard, Session, Message } from './types';
import {
  APP_ID,
  APP_NAME,
  CHARACTERS_DIR,
  SESSIONS_DIR,
  STATE_FILE,
  ActionTypes,
  DEFAULT_STATE,
} from './actions/constants';
import styles from './index.module.scss';

const tavernFileApi = createAppFileApi(APP_NAME);

const TavernApp: React.FC = () => {
  useTranslation('tavern');
  const state = useTavernState();
  const dispatch = useTavernDispatch();
  const {
    characters,
    sessions,
    activeCharacterId,
    activeSessionId,
    userName,
    showImportModal,
    showSettings,
    isLoading,
  } = state;

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) || null;
  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;
  const messages = activeSession?.messages || [];
  const regexScripts = activeCharacter?.regex_scripts || [];
  const quickReplies = activeCharacter?.quick_replies || [];
  const stateRef = useRef(state);
  stateRef.current = state;

  // === Data Refresh Methods ===

  const refreshCharacters = useCallback(async (): Promise<CharacterCard[]> => {
    try {
      const files = await tavernFileApi.listFiles(CHARACTERS_DIR);
      const jsonFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
      const loaded: CharacterCard[] = [];

      await batchConcurrent(jsonFiles, (file) => tavernFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const data =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loaded.push(data as CharacterCard);
              } catch {
                console.warn('[Tavern] Failed to parse character:', jsonFiles[startIndex + i].path);
              }
            }
          });
          if (loaded.length > 0) {
            dispatch({ type: 'SET_CHARACTERS', payload: [...loaded] });
          }
        },
      });

      for (const char of loaded) {
        // Merge frontend-only data from /media/
        try {
          const r = await tavernFileApi.readFile(`/media/${char.id}.json`);
          if (r.content) {
            const m = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
            if (m.avatar) char.avatar = m.avatar as string;
            if (m.sprite_map) char.sprite_map = m.sprite_map as Record<string, string>;
            if (m.regex_scripts) char.regex_scripts = m.regex_scripts;
            if (m.quick_replies) char.quick_replies = m.quick_replies;
          }
        } catch {
          /* no media */
        }
        // Merge world book from /worldbook/
        try {
          const r = await tavernFileApi.readFile(`/worldbook/${char.id}.json`);
          if (r.content) {
            const wb = typeof r.content === 'string' ? JSON.parse(r.content) : r.content;
            if (Array.isArray(wb)) char.world_book = wb;
          }
        } catch {
          /* no worldbook */
        }
      }
      if (loaded.length > 0) dispatch({ type: 'SET_CHARACTERS', payload: [...loaded] });

      return loaded;
    } catch (error) {
      console.error('[Tavern] Failed to refresh characters:', error);
      return stateRef.current.characters;
    }
  }, [dispatch]);

  const refreshSessions = useCallback(async (): Promise<Session[]> => {
    try {
      const files = await tavernFileApi.listFiles(SESSIONS_DIR);
      const jsonFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
      const loaded: Session[] = [];

      await batchConcurrent(jsonFiles, (file) => tavernFileApi.readFile(file.path), {
        onBatch: (batchResults, startIndex) => {
          batchResults.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value.content) {
              try {
                const data =
                  typeof result.value.content === 'string'
                    ? JSON.parse(result.value.content)
                    : result.value.content;
                loaded.push(data as Session);
              } catch {
                console.warn('[Tavern] Failed to parse session:', jsonFiles[startIndex + i].path);
              }
            }
          });
          if (loaded.length > 0) {
            dispatch({ type: 'SET_SESSIONS', payload: [...loaded] });
          }
        },
      });

      return loaded;
    } catch (error) {
      console.error('[Tavern] Failed to refresh sessions:', error);
      return stateRef.current.sessions;
    }
  }, [dispatch]);

  // === Load Data ===

  const loadData = useCallback(async () => {
    try {
      const [chars, sessions] = await Promise.all([refreshCharacters(), refreshSessions()]);
      dispatch({ type: 'SET_LOADING', payload: false });

      // Use chars/sessions length just to avoid unused warnings
      if (chars.length === 0 && sessions.length === 0) {
        // No data yet, that's fine
      }

      // Load state
      const rootFiles = await tavernFileApi.listFiles('/');
      const stateExists = rootFiles.some((f) => f.name === 'state.json');
      if (stateExists) {
        try {
          const stateResult = await tavernFileApi.readFile(STATE_FILE);
          if (stateResult.content) {
            const saved =
              typeof stateResult.content === 'string'
                ? JSON.parse(stateResult.content)
                : stateResult.content;
            if (saved.activeCharacterId) {
              dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: saved.activeCharacterId });
            }
            if (saved.activeSessionId) {
              dispatch({ type: 'SET_ACTIVE_SESSION', payload: saved.activeSessionId });
            }
            if (saved.userName) {
              dispatch({ type: 'SET_USER_NAME', payload: saved.userName });
            }
          }
        } catch {
          // Ignore state read errors
        }
      } else {
        await tavernFileApi.writeFile(STATE_FILE, DEFAULT_STATE).catch(() => {});
      }
    } catch (error) {
      console.error('[Tavern] Failed to load data:', error);
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [dispatch]);

  // === Save State ===

  const saveState = useCallback(async (overrides?: Record<string, unknown>) => {
    try {
      const s = stateRef.current;
      const stateData = {
        activeCharacterId: s.activeCharacterId,
        activeSessionId: s.activeSessionId,
        userName: s.userName,
        ...overrides,
      };
      await tavernFileApi.writeFile(STATE_FILE, stateData);
    } catch (error) {
      console.error('[Tavern] Failed to save state:', error);
    }
  }, []);

  // === Business Operations ===

  const handleImport = useCallback(
    async (card: CharacterCard) => {
      dispatch({ type: 'ADD_CHARACTER', payload: card });

      // Agent-facing: persona text only (no world_book, no images)
      await tavernFileApi.writeFile(`${CHARACTERS_DIR}/${card.id}.json`, {
        id: card.id,
        name: card.name,
        description: card.description,
        personality: card.personality,
        scenario: card.scenario,
        first_mes: card.first_mes,
        mes_example: card.mes_example,
        system_prompt: card.system_prompt,
        post_history_instructions: card.post_history_instructions,
        creator_notes: card.creator_notes,
        tags: card.tags,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      });
      // World book → separate file, Agent reads on demand
      if (card.world_book && card.world_book.length > 0) {
        await tavernFileApi.writeFile(`/worldbook/${card.id}.json`, card.world_book);
      }
      // Frontend-only → media/ (images, regex scripts, quick replies)
      await tavernFileApi.writeFile(`/media/${card.id}.json`, {
        avatar: card.avatar || '',
        sprite_map: card.sprite_map || {},
        regex_scripts: card.regex_scripts || [],
        quick_replies: card.quick_replies || [],
      });

      // Create first session with greeting
      const greetingMessages: Message[] = [];
      if (card.first_mes) {
        const emotion = extractEmotion(card.first_mes);
        if (emotion) {
          dispatch({ type: 'SET_EMOTION', payload: emotion });
        }
        greetingMessages.push({
          id: generateId(),
          role: 'assistant',
          content: card.first_mes,
          timestamp: new Date().toISOString(),
        });
      }

      const session: Session = {
        id: generateId(),
        characterId: card.id,
        messages: greetingMessages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      dispatch({ type: 'ADD_SESSION', payload: session });
      dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: card.id });
      dispatch({ type: 'SET_ACTIVE_SESSION', payload: session.id });
      dispatch({ type: 'SHOW_IMPORT_MODAL', payload: false });

      await tavernFileApi.writeFile(`${SESSIONS_DIR}/${session.id}.json`, session);
      await saveState({ activeCharacterId: card.id, activeSessionId: session.id });

      reportAction(APP_ID, 'IMPORT_CHARACTER', { characterId: card.id });
    },
    [dispatch, saveState],
  );

  const handleNewSession = useCallback(async () => {
    if (!activeCharacterId) return;
    const character = stateRef.current.characters.find((c) => c.id === activeCharacterId);
    if (!character) return;

    const greetingMessages: Message[] = [];
    if (character.first_mes) {
      const emotion = extractEmotion(character.first_mes);
      if (emotion) dispatch({ type: 'SET_EMOTION', payload: emotion });
      greetingMessages.push({
        id: generateId(),
        role: 'assistant',
        content: character.first_mes,
        timestamp: new Date().toISOString(),
      });
    }

    const session: Session = {
      id: generateId(),
      characterId: activeCharacterId,
      messages: greetingMessages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    dispatch({ type: 'ADD_SESSION', payload: session });
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: session.id });

    await tavernFileApi.writeFile(`${SESSIONS_DIR}/${session.id}.json`, session);
    await saveState({ activeSessionId: session.id });

    reportAction(APP_ID, 'NEW_SESSION', { characterId: activeCharacterId, sessionId: session.id });
  }, [activeCharacterId, dispatch, saveState]);

  const handleSendMessage = useCallback(
    async (content: string, fromAgent = false) => {
      if (!activeSessionId) return;
      const msg: Message = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      };

      dispatch({ type: 'ADD_MESSAGE', payload: { sessionId: activeSessionId, message: msg } });

      const currentSession = stateRef.current.sessions.find((s) => s.id === activeSessionId);
      if (currentSession) {
        const updated = {
          ...currentSession,
          messages: [...currentSession.messages, msg],
          updatedAt: new Date().toISOString(),
        };
        await tavernFileApi.writeFile(`${SESSIONS_DIR}/${activeSessionId}.json`, updated);
      }

      if (!fromAgent) {
        reportAction(APP_ID, 'SEND_MESSAGE', {
          sessionId: activeSessionId,
          content,
          characterId: stateRef.current.activeCharacterId || '',
        });
      }
    },
    [activeSessionId, dispatch],
  );

  const handleSaveSettings = useCallback(
    async (newUserName: string) => {
      dispatch({ type: 'SET_USER_NAME', payload: newUserName });
      await saveState({ userName: newUserName });
    },
    [dispatch, saveState],
  );

  // === Agent Action Listener ===

  const handleAgentAction = useCallback(
    async (action: CharacterAppAction): Promise<string> => {
      switch (action.action_type) {
        // Operation Actions
        case ActionTypes.SEND_MESSAGE: {
          const content = action.params?.content;
          const sessionId = action.params?.sessionId;
          if (!content) return 'error: missing content';
          if (sessionId && sessionId !== stateRef.current.activeSessionId) {
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: sessionId });
          }
          await handleSendMessage(content, true);
          return 'success';
        }
        case ActionTypes.NEW_SESSION: {
          const charId = action.params?.characterId;
          if (charId && charId !== stateRef.current.activeCharacterId) {
            dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: charId });
          }
          await handleNewSession();
          return 'success';
        }
        case ActionTypes.SWITCH_CHARACTER: {
          const charId = action.params?.characterId;
          if (!charId) return 'error: missing characterId';
          let char = stateRef.current.characters.find((c) => c.id === charId);
          if (!char) {
            const refreshed = await refreshCharacters();
            char = refreshed.find((c) => c.id === charId);
            if (!char) return 'error: character not found';
          }
          dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: charId });
          const charSessions = stateRef.current.sessions.filter((s) => s.characterId === charId);
          if (charSessions.length > 0) {
            const latest = charSessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: latest.id });
          }
          await saveState({ activeCharacterId: charId });
          return 'success';
        }
        case ActionTypes.IMPORT_CHARACTER: {
          dispatch({ type: 'SHOW_IMPORT_MODAL', payload: true });
          return 'success';
        }

        // Mutation Actions
        case ActionTypes.CREATE_CHARACTER:
        case ActionTypes.UPDATE_CHARACTER:
        case ActionTypes.DELETE_CHARACTER: {
          await refreshCharacters();
          return 'success';
        }
        case ActionTypes.CREATE_SESSION:
        case ActionTypes.DELETE_SESSION: {
          await refreshSessions();
          return 'success';
        }
        case ActionTypes.ADD_MESSAGE: {
          const filePath = action.params?.filePath;
          if (filePath) {
            try {
              const result = await tavernFileApi.readFile(filePath);
              if (result.content) {
                const session =
                  typeof result.content === 'string' ? JSON.parse(result.content) : result.content;
                dispatch({ type: 'UPDATE_SESSION', payload: session as Session });
                // Extract emotion from last assistant message
                const msgs = (session as Session).messages;
                const lastAssistant = [...msgs]
                  .reverse()
                  .find((m: Message) => m.role === 'assistant');
                if (lastAssistant) {
                  const emotion = extractEmotion(lastAssistant.content);
                  if (emotion) dispatch({ type: 'SET_EMOTION', payload: emotion });
                }
              }
            } catch (error) {
              console.error('[Tavern] Failed to read session after ADD_MESSAGE:', error);
            }
          } else {
            await refreshSessions();
          }
          return 'success';
        }

        // Refresh Actions
        case ActionTypes.REFRESH_CHARACTERS: {
          await refreshCharacters();
          if (action.params?.focusId) {
            dispatch({ type: 'SET_ACTIVE_CHARACTER', payload: action.params.focusId });
          }
          return 'success';
        }
        case ActionTypes.REFRESH_SESSIONS: {
          await refreshSessions();
          if (action.params?.focusId) {
            dispatch({ type: 'SET_ACTIVE_SESSION', payload: action.params.focusId });
          }
          return 'success';
        }
        case ActionTypes.REFRESH_MESSAGES: {
          await refreshSessions();
          return 'success';
        }

        // System Action
        case ActionTypes.SYNC_STATE: {
          try {
            const stateResult = await tavernFileApi.readFile(STATE_FILE);
            if (stateResult.content) {
              const saved =
                typeof stateResult.content === 'string'
                  ? JSON.parse(stateResult.content)
                  : (stateResult.content as Record<string, unknown>);
              if (saved.activeCharacterId !== undefined) {
                dispatch({
                  type: 'SET_ACTIVE_CHARACTER',
                  payload: saved.activeCharacterId as string,
                });
              }
              if (saved.activeSessionId !== undefined) {
                dispatch({ type: 'SET_ACTIVE_SESSION', payload: saved.activeSessionId as string });
              }
              if (saved.userName !== undefined) {
                dispatch({ type: 'SET_USER_NAME', payload: saved.userName as string });
              }
            }
            return 'success';
          } catch (error) {
            return `error: ${String(error)}`;
          }
        }

        default:
          return `error: unknown action_type ${action.action_type}`;
      }
    },
    [dispatch, handleSendMessage, handleNewSession, refreshCharacters, refreshSessions, saveState],
  );

  useAgentActionListener(APP_ID, handleAgentAction);

  // === Initialization ===

  useEffect(() => {
    const init = async () => {
      try {
        reportLifecycle(AppLifecycle.LOADING);

        const manager = await initVibeApp({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Tavern',
          windowStyle: { width: 960, height: 680 },
        });

        manager.handshake({
          id: APP_ID,
          url: window.location.href,
          type: 'page',
          name: 'Tavern',
          windowStyle: { width: 960, height: 680 },
        });

        reportLifecycle(AppLifecycle.DOM_READY);
        await fetchVibeInfo();
        await loadData();
        reportLifecycle(AppLifecycle.LOADED);
        manager.ready();
      } catch (error) {
        console.error('[Tavern] Init error:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
        reportLifecycle(AppLifecycle.ERROR, String(error));
      }
    };

    init();

    return () => {
      reportLifecycle(AppLifecycle.UNLOADING);
      reportLifecycle(AppLifecycle.DESTROYED);
    };
  }, []);

  if (isLoading) {
    return (
      <div className={styles.tavern}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.tavern}>
      <SpritePanel />
      <div className={styles.chatPanel}>
        <TopBar onNewSession={handleNewSession} />
        <MessageList
          messages={messages}
          characterName={activeCharacter?.name || ''}
          characterAvatar={activeCharacter?.avatar || ''}
          userName={userName}
          regexScripts={regexScripts}
          hasCharacter={!!activeCharacter}
          onImport={() => dispatch({ type: 'SHOW_IMPORT_MODAL', payload: true })}
        />
        {quickReplies.length > 0 && activeCharacter && (
          <QuickReplyBar
            quickReplies={quickReplies}
            onSend={handleSendMessage}
            userName={userName}
            characterName={activeCharacter.name}
          />
        )}
        <InputBar onSend={handleSendMessage} disabled={!activeSessionId} />
      </div>

      <ImportModal
        visible={showImportModal}
        onClose={() => dispatch({ type: 'SHOW_IMPORT_MODAL', payload: false })}
        onImport={handleImport}
      />
      <SettingsDrawer
        visible={showSettings}
        onClose={() => dispatch({ type: 'SHOW_SETTINGS', payload: false })}
        userName={userName}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

const Tavern: React.FC = () => (
  <TavernProvider>
    <TavernApp />
  </TavernProvider>
);

export default Tavern;
