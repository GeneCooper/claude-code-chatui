import { useVSCode } from './hooks/useVSCode'
import { useUIStore } from './stores/uiStore'
import { Header } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
import { StatusBar } from './components/StatusBar'
import { HistoryView } from './components/HistoryView'
import { SettingsPanel } from './components/SettingsPanel'
import { MCPPanel } from './components/MCPPanel'

export default function App() {
  // Connect to VS Code extension host
  useVSCode()

  const activeView = useUIStore((s) => s.activeView)

  return (
    <div className="flex flex-col h-screen">
      <Header />
      {activeView === 'chat' && (
        <>
          <ChatView />
          <StatusBar />
          <InputArea />
        </>
      )}
      {activeView === 'history' && <HistoryView />}
      {activeView === 'settings' && <SettingsPanel />}
      {activeView === 'mcp' && <MCPPanel />}
    </div>
  )
}
