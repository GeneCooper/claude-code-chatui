import { useEffect, useState } from 'react'
import { postMessage } from '../lib/vscode'
import { useMCPStore } from '../stores/mcpStore'
import { useUIStore } from '../stores/uiStore'

const POPULAR_SERVERS = [
  {
    name: 'filesystem',
    description: 'Read/write local files',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
  },
  {
    name: 'github',
    description: 'GitHub API access',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
  },
  {
    name: 'postgres',
    description: 'PostgreSQL database',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
  },
  {
    name: 'brave-search',
    description: 'Brave web search',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
  },
  {
    name: 'puppeteer',
    description: 'Browser automation',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
  },
  {
    name: 'memory',
    description: 'Persistent memory/knowledge',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
  },
]

export function MCPPanel() {
  const { servers, editingServer } = useMCPStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

  const [name, setName] = useState('')
  const [serverType, setServerType] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [args, setArgs] = useState('')

  useEffect(() => {
    postMessage({ type: 'loadMCPServers' })
  }, [])

  // Populate form when editing
  useEffect(() => {
    if (editingServer && servers[editingServer]) {
      const config = servers[editingServer]
      setName(editingServer)
      setServerType(config.type)
      setCommand(config.command || '')
      setUrl(config.url || '')
      setArgs(config.args?.join(' ') || '')
    }
  }, [editingServer, servers])

  const resetForm = () => {
    setName('')
    setServerType('stdio')
    setCommand('')
    setUrl('')
    setArgs('')
    useMCPStore.getState().setEditingServer(null)
  }

  const handleSave = () => {
    if (!name.trim()) return

    const config: Record<string, unknown> = { type: serverType }
    if (serverType === 'stdio') {
      config.command = command
      if (args.trim()) config.args = args.split(/\s+/)
    } else {
      config.url = url
    }

    postMessage({ type: 'saveMCPServer', name: name.trim(), config })
    resetForm()
  }

  const handleDelete = (serverName: string) => {
    postMessage({ type: 'deleteMCPServer', name: serverName })
  }

  const handleQuickAdd = (server: typeof POPULAR_SERVERS[number]) => {
    setName(server.name)
    setServerType(server.type)
    setCommand(server.command)
    setArgs(server.args.join(' '))
    setUrl('')
  }

  const serverEntries = Object.entries(servers)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="font-medium text-sm">MCP Servers</span>
        <button
          onClick={() => setActiveView('chat')}
          className="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit"
        >
          Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Server list */}
        {serverEntries.length > 0 && (
          <div>
            <label className="text-xs font-medium block mb-1.5">Configured Servers</label>
            <div className="space-y-1">
              {serverEntries.map(([sName, config]) => (
                <div
                  key={sName}
                  className="flex items-center justify-between px-2 py-1.5 rounded border border-[var(--vscode-panel-border)] text-xs"
                >
                  <div>
                    <span className="font-medium">{sName}</span>
                    <span className="opacity-40 ml-2">{config.type}</span>
                    <div className="text-[10px] opacity-40 mt-0.5 truncate max-w-[200px]">
                      {config.type === 'stdio' ? config.command : config.url}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => useMCPStore.getState().setEditingServer(sName)}
                      className="px-1.5 py-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(sName)}
                      className="px-1.5 py-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer bg-transparent border-none text-[var(--vscode-errorForeground)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Popular servers */}
        <div className="border-t border-[var(--vscode-panel-border)] pt-3">
          <label className="text-xs font-medium block mb-1.5">Popular Servers</label>
          <div className="grid grid-cols-2 gap-1.5">
            {POPULAR_SERVERS.map((server) => {
              const isInstalled = server.name in servers
              return (
                <button
                  key={server.name}
                  onClick={() => !isInstalled && handleQuickAdd(server)}
                  disabled={isInstalled}
                  className={`text-left px-2 py-1.5 text-[11px] rounded border cursor-pointer transition-colors ${
                    isInstalled
                      ? 'border-green-600/30 bg-green-900/10 opacity-60 cursor-default'
                      : 'border-[var(--vscode-panel-border)] bg-transparent hover:border-[var(--vscode-focusBorder)] text-inherit'
                  }`}
                >
                  <div className="font-medium">{server.name}</div>
                  <div className="opacity-40 text-[10px]">{server.description}</div>
                  {isInstalled && <div className="text-[9px] text-green-500 mt-0.5">Installed</div>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Add/Edit form */}
        <div className="border-t border-[var(--vscode-panel-border)] pt-3">
          <label className="text-xs font-medium block mb-2">
            {editingServer ? `Edit: ${editingServer}` : 'Add Server'}
          </label>

          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server name"
              disabled={!!editingServer}
              className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
            />

            <select
              value={serverType}
              onChange={(e) => setServerType(e.target.value as 'stdio' | 'http' | 'sse')}
              className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>

            {serverType === 'stdio' ? (
              <>
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="Command (e.g. npx -y @modelcontextprotocol/server-filesystem)"
                  className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
                />
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="Arguments (space separated)"
                  className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
                />
              </>
            ) : (
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="URL (e.g. http://localhost:3000/mcp)"
                className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="px-3 py-1.5 text-xs rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none disabled:opacity-50"
              >
                {editingServer ? 'Update' : 'Add Server'}
              </button>
              {editingServer && (
                <button
                  onClick={resetForm}
                  className="px-3 py-1.5 text-xs rounded bg-transparent border border-[var(--vscode-panel-border)] text-inherit hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
