import { useEffect, useRef } from 'react'
import { useVSCode, postMessage } from './hooks'
import { useUIStore, useChatStore, useQueueStore } from './store'
import { markOptimisticUserInput } from './mutations'
import { Header } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
import { TodoDisplay } from './components/TodoDisplay'
import { TaskQueue } from './components/TaskQueue'
import { HistoryView } from './components/HistoryView'
import { SettingsPanel } from './components/SettingsPanel'
import { MCPPanel } from './components/MCPPanel'
import { InstallModal } from './components/InstallModal'
import { LoginModal } from './components/LoginModal'

export default function App() {
  // Connect to VS Code extension host
  useVSCode()

  const activeView = useUIStore((s) => s.activeView)
  const setDraftText = useUIStore((s) => s.setDraftText)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const autoRun = useQueueStore((s) => s.autoRun)
  const prevProcessingRef = useRef(isProcessing)
  const prevAutoRunRef = useRef(autoRun)

  const runNextQueued = () => {
    const { nextPending, markRunning } = useQueueStore.getState()
    const next = nextPending()
    if (!next) return

    markRunning(next.id)

    const store = useChatStore.getState()
    markOptimisticUserInput()
    store.addMessage({ type: 'userInput', data: { text: next.prompt } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    postMessage({
      type: 'sendMessage',
      text: next.prompt,
      planMode: next.planMode,
      thinkingMode: next.thinkingMode,
      model: next.model,
    })
  }

  // Auto-execute next queued task when Claude finishes
  useEffect(() => {
    const wasProcessing = prevProcessingRef.current
    prevProcessingRef.current = isProcessing

    if (!wasProcessing || isProcessing) return

    const { autoRun: currentAutoRun, items, markDone } = useQueueStore.getState()

    // Mark the currently running item as done
    const running = items.find((i) => i.status === 'running')
    if (running) markDone(running.id)

    if (!currentAutoRun) return

    runNextQueued()
  }, [isProcessing])

  // Resume queue when autoRun is re-enabled and Claude is idle
  useEffect(() => {
    const wasAutoRun = prevAutoRunRef.current
    prevAutoRunRef.current = autoRun

    // Only trigger when autoRun switches from false → true
    if (!autoRun || wasAutoRun) return

    // Only act if Claude is not currently processing
    if (useChatStore.getState().isProcessing) return

    runNextQueued()
  }, [autoRun])

  const handleHintClick = (text: string) => {
    setDraftText(text)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      {activeView === 'chat' && (
        <>
          <ChatView onHintClick={handleHintClick} />
          <TodoDisplay />
          <TaskQueue />
          <InputArea />
        </>
      )}
      {activeView === 'history' && <HistoryView />}
      {activeView === 'settings' && <SettingsPanel />}
      <MCPPanel />
      <InstallModal />
      <LoginModal />
    </div>
  )
}
