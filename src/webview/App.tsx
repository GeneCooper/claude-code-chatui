import { useVSCode } from './hooks'
import { useUIStore } from './store'
import { Header } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
import { TodoDisplay } from './components/TodoDisplay'
import { HistoryView } from './components/HistoryView'
import { SettingsPanel } from './components/SettingsPanel'
import { MCPPanel } from './components/MCPPanel'
import { SkillsPanel } from './components/SkillsPanel'
import { InstallModal } from './components/InstallModal'
import { LoginModal } from './components/LoginModal'
import { TaskChainDrawer } from './components/TaskChainDrawer'

export default function App() {
  // Connect to VS Code extension host
  useVSCode()

  const activeView = useUIStore((s) => s.activeView)
  const showMCPModal = useUIStore((s) => s.showMCPModal)
  const showSkillsModal = useUIStore((s) => s.showSkillsModal)
  const showTaskChainDrawer = useUIStore((s) => s.showTaskChainDrawer)
  const setShowTaskChainDrawer = useUIStore((s) => s.setShowTaskChainDrawer)
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
      {showSkillsModal && <SkillsPanel />}
      <InstallModal />
      <LoginModal />
      <TaskChainDrawer isOpen={showTaskChainDrawer} onClose={() => setShowTaskChainDrawer(false)} />
    </div>
  )
}
