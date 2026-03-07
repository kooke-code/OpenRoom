export const APP_ID = 15;
export const APP_NAME = 'tavern';

export const CHARACTERS_DIR = '/characters';
export const SESSIONS_DIR = '/sessions';
export const STATE_FILE = '/state.json';

export const OperationActions = {
  SEND_MESSAGE: 'SEND_MESSAGE',
  NEW_SESSION: 'NEW_SESSION',
  SWITCH_CHARACTER: 'SWITCH_CHARACTER',
  IMPORT_CHARACTER: 'IMPORT_CHARACTER',
} as const;

export const MutationActions = {
  CREATE_CHARACTER: 'CREATE_CHARACTER',
  UPDATE_CHARACTER: 'UPDATE_CHARACTER',
  DELETE_CHARACTER: 'DELETE_CHARACTER',
  CREATE_SESSION: 'CREATE_SESSION',
  ADD_MESSAGE: 'ADD_MESSAGE',
  DELETE_SESSION: 'DELETE_SESSION',
} as const;

export const RefreshActions = {
  REFRESH_CHARACTERS: 'REFRESH_CHARACTERS',
  REFRESH_SESSIONS: 'REFRESH_SESSIONS',
  REFRESH_MESSAGES: 'REFRESH_MESSAGES',
} as const;

export const SystemActions = {
  SYNC_STATE: 'SYNC_STATE',
} as const;

export const ActionTypes = {
  ...OperationActions,
  ...MutationActions,
  ...RefreshActions,
  ...SystemActions,
} as const;

export const DEFAULT_STATE = {
  activeCharacterId: null as string | null,
  activeSessionId: null as string | null,
  userName: 'User',
};
