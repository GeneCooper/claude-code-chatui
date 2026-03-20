import { useVSCode } from './hooks'
import { useUIStore } from './store'
import { Header } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
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
  const showMCPModal = useUIStore((s) => s.showMCPModal)
  const setDraftText = useUIStore((s) => s.setDraftText)

  const handleHintClick = (text: string) => {
    setDraftText(text)
  }

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className={`flex flex-col flex-1 min-h-0 ${activeView !== 'chat' ? 'hidden' : ''}`}>
          <ChatView onHintClick={handleHintClick} />
          <TodoDisplay />
          <InputArea />
      </div>
      {activeView === 'history' && <HistoryView />}
      {activeView === 'settings' && <SettingsPanel />}
{showMCPModal && <MCPPanel />}
      <InstallModal />
      <LoginModal />
    </div>
  )
}
