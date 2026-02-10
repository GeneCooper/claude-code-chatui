import { useVSCode } from './hooks/useVSCode'
import { Header } from './components/Header'
import { ChatView } from './components/ChatView'
import { InputArea } from './components/InputArea'
import { StatusBar } from './components/StatusBar'

export default function App() {
  // Connect to VS Code extension host
  useVSCode()

  return (
    <div className="flex flex-col h-screen">
      <Header />
      <ChatView />
      <StatusBar />
      <InputArea />
    </div>
  )
}
