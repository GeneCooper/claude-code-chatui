import { create } from 'zustand';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

export interface ChatMessage {
  id: string;
  type: 'userInput' | 'output' | 'thinking' | 'toolUse' | 'toolResult' | 'error' | 'sessionInfo' | 'loading' | 'compacting' | 'compactBoundary' | 'permissionRequest' | 'restorePoint' | 'todosUpdate';
  data: unknown;
  timestamp: string;
}

interface TokenState {
  totalTokensInput: number;
  totalTokensOutput: number;
  currentInputTokens: number;
  currentOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

interface TotalsState {
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  requestCount: number;
}

interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;
  sessionId: string | null;
  tokens: TokenState;
  totals: TotalsState;
  todos: TodoItem[];

  // Actions
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  removeLoading: () => void;
  setProcessing: (isProcessing: boolean) => void;
  setSessionId: (id: string | null) => void;
  updateTokens: (tokens: Partial<TokenState>) => void;
  updateTotals: (totals: Partial<TotalsState>) => void;
  updatePermissionStatus: (id: string, status: string) => void;
  updateTodos: (todos: TodoItem[]) => void;
  restoreState: (state: { messages?: ChatMessage[]; sessionId?: string; totalCost?: number }) => void;
}

let messageCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isProcessing: false,
  sessionId: null,
  todos: [],
  tokens: {
    totalTokensInput: 0,
    totalTokensOutput: 0,
    currentInputTokens: 0,
    currentOutputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
  },
  totals: {
    totalCost: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    requestCount: 0,
  },

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: `msg-${++messageCounter}-${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  clearMessages: () => set({ messages: [] }),

  removeLoading: () =>
    set((state) => ({
      messages: state.messages.filter((m) => m.type !== 'loading'),
    })),

  setProcessing: (isProcessing) => set({ isProcessing }),

  setSessionId: (sessionId) => set({ sessionId }),

  updateTokens: (tokens) =>
    set((state) => ({
      tokens: { ...state.tokens, ...tokens },
    })),

  updateTotals: (totals) =>
    set((state) => ({
      totals: { ...state.totals, ...totals },
    })),

  updatePermissionStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.type === 'permissionRequest') {
          const data = m.data as Record<string, unknown>;
          if (data.id === id) {
            return { ...m, data: { ...data, status } };
          }
        }
        return m;
      }),
    })),

  updateTodos: (todos) => set({ todos }),

  restoreState: (restored) =>
    set({
      messages: restored.messages || [],
      sessionId: restored.sessionId || null,
      todos: [],
      totals: {
        totalCost: restored.totalCost || 0,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        requestCount: 0,
      },
    }),
}));
