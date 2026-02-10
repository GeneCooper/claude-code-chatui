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
    icon: '\uD83D\uDCC1',
  },
  {
    name: 'github',
    description: 'GitHub API access',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    icon: '\uD83D\uDC19',
  },
  {
    name: 'postgres',
    description: 'PostgreSQL database',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    icon: '\uD83D\uDDC4\uFE0F',
  },
  {
    name: 'brave-search',
    description: 'Brave web search',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    icon: '\uD83D\uDD0D',
  },
  {
    name: 'puppeteer',
    description: 'Browser automation',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    icon: '\uD83C\uDFAD',
  },
  {
    name: 'memory',
    description: 'Persistent memory/knowledge',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    icon: '\uD83E\udDE0',
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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid var(--vscode-input-border)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--vscode-input-background)',
    color: 'var(--vscode-input-foreground)',
    fontSize: '13px',
    fontFamily: 'var(--vscode-font-family)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--vscode-panel-border)',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '16px' }}>MCP Servers</span>
        <button
          onClick={() => setActiveView('chat')}
          className="cursor-pointer bg-transparent border-none text-inherit"
          style={{
            fontSize: '13px',
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
        >
          {'\u2190'} Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: '16px' }}>
        {/* Server list */}
        {serverEntries.length > 0 ? (
          <div>
            {serverEntries.map(([sName, config]) => (
              <div
                key={sName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '20px 24px',
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '16px',
                  backgroundColor: 'var(--vscode-editor-background)',
                  transition: 'all 0.2s ease',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '8px' }}>
                    {sName}
                  </div>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: 'var(--vscode-badge-background)',
                      color: 'var(--vscode-badge-foreground)',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      fontWeight: 500,
                      marginBottom: '8px',
                    }}
                  >
                    {config.type}
                  </span>
                  <div style={{ fontSize: '13px', color: 'var(--vscode-descriptionForeground)', opacity: 0.9, lineHeight: 1.4 }}>
                    {config.type === 'stdio' ? config.command : config.url}
                  </div>
                </div>
                <div className="flex gap-2" style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => useMCPStore.getState().setEditingServer(sName)}
                    className="cursor-pointer"
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      color: 'var(--vscode-foreground)',
                      border: '1px solid var(--vscode-panel-border)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      minWidth: '80px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                      e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(sName)}
                    className="cursor-pointer"
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      color: 'var(--vscode-errorForeground)',
                      border: '1px solid var(--vscode-errorForeground)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      minWidth: '80px',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--vscode-inputValidation-errorBackground, rgba(231, 76, 60, 0.1))'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic', padding: '40px 20px' }}>
            No MCP servers configured
          </div>
        )}

        {/* Add/Edit form */}
        <div
          style={{
            backgroundColor: 'var(--vscode-editor-background)',
            border: '1px solid var(--vscode-panel-border)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
              {editingServer ? `Edit: ${editingServer}` : 'Add Server'}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server name"
              disabled={!!editingServer}
              style={{ ...inputStyle, opacity: editingServer ? 0.5 : 1 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border)'; e.currentTarget.style.boxShadow = 'none' }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
              Type
            </label>
            <select
              value={serverType}
              onChange={(e) => setServerType(e.target.value as 'stdio' | 'http' | 'sse')}
              style={inputStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border)' }}
            >
              <option value="stdio">stdio</option>
              <option value="http">http</option>
              <option value="sse">sse</option>
            </select>
          </div>

          {serverType === 'stdio' ? (
            <>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
                  Command
                </label>
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
                  Arguments
                </label>
                <input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="Space separated arguments"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border)'; e.currentTarget.style.boxShadow = 'none' }}
                />
              </div>
            </>
          ) : (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '13px' }}>
                URL
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="e.g. http://localhost:3000/mcp"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'; e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focusBorder)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border)'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
            {editingServer && (
              <button
                onClick={resetForm}
                className="cursor-pointer"
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'transparent',
                  border: '1px solid var(--vscode-panel-border)',
                  color: 'inherit',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="cursor-pointer"
              style={{
                padding: '8px 16px',
                fontSize: '13px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--vscode-button-background)',
                color: 'var(--vscode-button-foreground)',
                border: 'none',
                opacity: name.trim() ? 1 : 0.5,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { if (name.trim()) e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--vscode-button-background)' }}
            >
              {editingServer ? 'Update' : 'Add Server'}
            </button>
          </div>
        </div>

        {/* Popular servers */}
        <div
          style={{
            marginTop: '32px',
            paddingTop: '24px',
            borderTop: '1px solid var(--vscode-panel-border)',
          }}
        >
          <h4 style={{ margin: '0 0 16px 0', fontSize: '14px', fontWeight: 600, opacity: 0.9 }}>
            Popular Servers
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {POPULAR_SERVERS.map((server) => {
              const isInstalled = server.name in servers
              return (
                <button
                  key={server.name}
                  onClick={() => !isInstalled && handleQuickAdd(server)}
                  disabled={isInstalled}
                  className="text-left cursor-pointer border-none text-inherit"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    background: isInstalled ? 'rgba(0, 210, 106, 0.05)' : 'rgba(128, 128, 128, 0.04)',
                    border: isInstalled
                      ? '1px solid rgba(0, 210, 106, 0.3)'
                      : '1px solid var(--vscode-panel-border)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.2s ease',
                    opacity: isInstalled ? 0.6 : 1,
                    cursor: isInstalled ? 'default' : 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (!isInstalled) {
                      e.currentTarget.style.borderColor = 'var(--chatui-accent)'
                      e.currentTarget.style.background = 'rgba(237, 110, 29, 0.06)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isInstalled) {
                      e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
                      e.currentTarget.style.background = 'rgba(128, 128, 128, 0.04)'
                    }
                  }}
                >
                  <span style={{ fontSize: '20px', minWidth: '32px', textAlign: 'center' }}>
                    {server.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{server.name}</div>
                    <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>
                      {server.description}
                    </div>
                  </div>
                  {isInstalled && (
                    <span style={{ fontSize: '11px', color: 'rgba(0, 210, 106, 0.8)', fontWeight: 500 }}>
                      Installed
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
