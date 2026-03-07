import React, { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { TavernState, TavernAction } from '../types';

const initialState: TavernState = {
  characters: [],
  sessions: [],
  activeCharacterId: null,
  activeSessionId: null,
  userName: 'User',
  currentEmotion: '',
  isLoading: true,
  showImportModal: false,
  showSettings: false,
};

function tavernReducer(state: TavernState, action: TavernAction): TavernState {
  switch (action.type) {
    case 'SET_CHARACTERS':
      return { ...state, characters: action.payload };
    case 'ADD_CHARACTER':
      return { ...state, characters: [...state.characters, action.payload] };
    case 'UPDATE_CHARACTER':
      return {
        ...state,
        characters: state.characters.map((c) => (c.id === action.payload.id ? action.payload : c)),
      };
    case 'REMOVE_CHARACTER':
      return {
        ...state,
        characters: state.characters.filter((c) => c.id !== action.payload),
        activeCharacterId:
          state.activeCharacterId === action.payload ? null : state.activeCharacterId,
      };
    case 'SET_SESSIONS':
      return { ...state, sessions: action.payload };
    case 'ADD_SESSION':
      return { ...state, sessions: [...state.sessions, action.payload] };
    case 'UPDATE_SESSION':
      return {
        ...state,
        sessions: state.sessions.map((s) => (s.id === action.payload.id ? action.payload : s)),
      };
    case 'REMOVE_SESSION':
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
        activeSessionId: state.activeSessionId === action.payload ? null : state.activeSessionId,
      };
    case 'SET_ACTIVE_CHARACTER':
      return { ...state, activeCharacterId: action.payload };
    case 'SET_ACTIVE_SESSION':
      return { ...state, activeSessionId: action.payload };
    case 'SET_USER_NAME':
      return { ...state, userName: action.payload };
    case 'SET_EMOTION':
      return { ...state, currentEmotion: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SHOW_IMPORT_MODAL':
      return { ...state, showImportModal: action.payload };
    case 'SHOW_SETTINGS':
      return { ...state, showSettings: action.payload };
    case 'ADD_MESSAGE': {
      const { sessionId, message } = action.payload;
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, messages: [...s.messages, message], updatedAt: new Date().toISOString() }
            : s,
        ),
      };
    }
    default:
      return state;
  }
}

const TavernStateContext = createContext<TavernState>(initialState);
const TavernDispatchContext = createContext<Dispatch<TavernAction>>(() => {});

export function TavernProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(tavernReducer, initialState);
  return (
    <TavernStateContext.Provider value={state}>
      <TavernDispatchContext.Provider value={dispatch}>{children}</TavernDispatchContext.Provider>
    </TavernStateContext.Provider>
  );
}

export function useTavernState(): TavernState {
  return useContext(TavernStateContext);
}

export function useTavernDispatch(): Dispatch<TavernAction> {
  return useContext(TavernDispatchContext);
}
