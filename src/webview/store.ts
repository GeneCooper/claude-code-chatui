import { create } from "zustand";
import type {
  UsageData,
  MCPServerConfig,
  SkillConfig,
  TodoItem,
  ConversationIndexEntry,
} from "../shared/types";

// Re-export so downstream consumers (hooks.ts, TodoDisplay.tsx) can keep importing from store
export type { TodoItem };

// ============================================================================
// Chat Store
// ============================================================================

export interface ChatMessage {
  id: string;
  type:
    | "userInput"
    | "output"
    | "thinking"
    | "toolUse"
    | "toolResult"
    | "error"
    | "sessionInfo"
    | "loading"
    | "compacting"
    | "compactBoundary"
    | "permissionRequest"
    | "todosUpdate";
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
  currentCost?: number;
  currentDuration?: number;
  currentTurns?: number;
}

interface ChatState {
  messages: ChatMessage[];
  isProcessing: boolean;
  sessionId: string | null;
  tokens: TokenState;
  totals: TotalsState;
  todos: TodoItem[];
  processStatus: { status: string; detail?: string } | null;

  addMessage: (msg: Omit<ChatMessage, "id" | "timestamp">) => void;
  clearMessages: () => void;
  removeLoading: () => void;
  setProcessing: (isProcessing: boolean) => void;
  setSessionId: (id: string | null) => void;
  setProcessStatus: (
    status: { status: string; detail?: string } | null,
  ) => void;
  updateTokens: (tokens: Partial<TokenState>) => void;
  updateTotals: (totals: Partial<TotalsState>) => void;
  updatePermissionStatus: (id: string, status: string) => void;
  updateTodos: (todos: TodoItem[]) => void;
  restoreState: (state: {
    messages?: ChatMessage[];
    sessionId?: string;
    totalCost?: number;
  }) => void;
}

let messageCounter = 0;

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isProcessing: false,
  sessionId: null,
  todos: [],
  processStatus: null,
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

  clearMessages: () => set({ messages: [], processStatus: null }),

  removeLoading: () =>
    set((state) => ({
      messages: state.messages.filter((m) => m.type !== "loading"),
      processStatus: null,
    })),

  setProcessing: (isProcessing) => set({ isProcessing }),
  setSessionId: (sessionId) => set({ sessionId }),
  setProcessStatus: (processStatus) => set({ processStatus }),

  updateTokens: (tokens) =>
    set((state) => ({ tokens: { ...state.tokens, ...tokens } })),

  updateTotals: (totals) =>
    set((state) => ({ totals: { ...state.totals, ...totals } })),

  updatePermissionStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.type === "permissionRequest") {
          const data = m.data as Record<string, unknown>;
          if (data.id === id) return { ...m, data: { ...data, status } };
        }
        return m;
      }),
    })),

  updateTodos: (todos) => set({ todos }),

  restoreState: (restored) =>
    set((state) => ({
      messages:
        restored.messages !== undefined ? restored.messages : state.messages,
      sessionId: restored.sessionId || null,
      totals: {
        totalCost: restored.totalCost || 0,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        requestCount: 0,
      },
    })),
}));

// ============================================================================
// Conversation Store
// ============================================================================

interface ConversationState {
  conversations: ConversationIndexEntry[];
  setConversations: (list: ConversationIndexEntry[]) => void;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  setConversations: (list) => set({ conversations: list }),
}));

// ============================================================================
// MCP Store
// ============================================================================

interface MCPState {
  servers: Record<string, MCPServerConfig>;
  editingServer: string | null;
  setServers: (servers: Record<string, MCPServerConfig>) => void;
  setEditingServer: (name: string | null) => void;
  removeServer: (name: string) => void;
}

export const useMCPStore = create<MCPState>((set) => ({
  servers: {},
  editingServer: null,
  setServers: (servers) => set({ servers }),
  setEditingServer: (name) => set({ editingServer: name }),
  removeServer: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.servers;
      return { servers: rest };
    }),
}));

// ============================================================================
// Skills Store
// ============================================================================

interface SkillState {
  skills: Record<string, SkillConfig>;
  editingSkill: string | null;
  setSkills: (skills: Record<string, SkillConfig>) => void;
  setEditingSkill: (name: string | null) => void;
  removeSkill: (name: string) => void;
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: {},
  editingSkill: null,
  setSkills: (skills) => set({ skills }),
  setEditingSkill: (name) => set({ editingSkill: name }),
  removeSkill: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.skills;
      return { skills: rest };
    }),
}));

// ============================================================================
// Settings Store
// ============================================================================

interface SettingsState {
  thinkingIntensity: string;
  yoloMode: boolean;
  maxTurns: number;
  disallowedTools: string[];
  updateSettings: (
    settings: Partial<{
      thinkingIntensity: string;
      yoloMode: boolean;
      maxTurns: number;
      disallowedTools: string[];
    }>,
  ) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  thinkingIntensity: "deep",
  yoloMode: true,
  maxTurns: 25,
  disallowedTools: [],
  updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
}));

// ============================================================================
// UI Store
// ============================================================================

type ActiveView = "chat" | "history" | "settings";
export type RequestResult = "success" | "error" | null;

interface UIState {
  activeView: ActiveView;
  showMCPModal: boolean;
  showSkillsModal: boolean;
  showInstallModal: boolean;
  showLoginModal: boolean;
  loginErrorMessage: string;
  draftText: string;
  editingContext: { userInputIndex: number; images: string[] } | null;
  requestStartTime: number | null;
  lastRequestResult: RequestResult;
  lastRequestDuration: number | null;
  usageData: UsageData | null;
  accountType: "pro" | "max" | undefined;
  platformInfo: { platform: string; isWindows: boolean } | null;
  showClaudeMdBanner: boolean;

  setActiveView: (view: ActiveView) => void;
  setShowMCPModal: (show: boolean) => void;
  setShowSkillsModal: (show: boolean) => void;
  setShowInstallModal: (show: boolean) => void;
  setShowLoginModal: (show: boolean) => void;
  setLoginErrorMessage: (msg: string) => void;
  setDraftText: (text: string) => void;
  setEditingContext: (
    ctx: { userInputIndex: number; images: string[] } | null,
  ) => void;
  setRequestStartTime: (time: number | null) => void;
  setLastRequestResult: (result: RequestResult, duration: number | null) => void;
  setUsageData: (data: UsageData | null) => void;
  setAccountType: (type: "pro" | "max" | undefined) => void;
  setPlatformInfo: (
    info: { platform: string; isWindows: boolean } | null,
  ) => void;
  setShowClaudeMdBanner: (show: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeView: "chat",
  showMCPModal: false,
  showSkillsModal: false,
  showInstallModal: false,
  showLoginModal: false,
  loginErrorMessage: "",
  draftText: "",
  editingContext: null,
  requestStartTime: null,
  lastRequestResult: null,
  lastRequestDuration: null,
  usageData: null,
  accountType: undefined,
  platformInfo: null,
  showClaudeMdBanner: false,

  setActiveView: (view) => set({ activeView: view }),
  setShowMCPModal: (show) => set({ showMCPModal: show }),
  setShowSkillsModal: (show) => set({ showSkillsModal: show }),
  setShowInstallModal: (show) => set({ showInstallModal: show }),
  setShowLoginModal: (show) => set({ showLoginModal: show }),
  setLoginErrorMessage: (msg) => set({ loginErrorMessage: msg }),
  setDraftText: (text) => set({ draftText: text }),
  setEditingContext: (ctx) => set({ editingContext: ctx }),
  setRequestStartTime: (time) => set({ requestStartTime: time }),
  setLastRequestResult: (result, duration) => set({ lastRequestResult: result, lastRequestDuration: duration }),
  setUsageData: (data) => set({ usageData: data }),
  setAccountType: (type) => set({ accountType: type }),
  setPlatformInfo: (info) => set({ platformInfo: info }),
  setShowClaudeMdBanner: (show) => set({ showClaudeMdBanner: show }),
}));

