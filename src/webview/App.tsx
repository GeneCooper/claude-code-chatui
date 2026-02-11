import { useVSCode } from './hooks'
import { useUIStore } from './store'
import { Header, TabBar } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
import { StatusBar } from './components/StatusBar'
import { TodoDisplay } from './components/TodoDisplay'
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

  const handleHintClick = (text: string) => {
    setDraftText(text)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <TabBar />
      {activeView === 'chat' && (
        <>
          <ChatView onHintClick={handleHintClick} />
          <TodoDisplay />
          <StatusBar />
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
