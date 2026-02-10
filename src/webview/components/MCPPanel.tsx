import { useEffect, useState } from 'react'
import { postMessage } from '../lib/vscode'
import { useMCPStore } from '../stores/mcpStore'
import { useUIStore } from '../stores/uiStore'

const POPULAR_SERVERS = [
  {
    name: 'context7',
    description: 'Up-to-date library docs',
    type: 'http' as const,
    url: 'https://context7.liam.sh/mcp',
    icon: '📚',
  },
  {
    name: 'sequential-thinking',
    description: 'Step-by-step reasoning',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    icon: '🧠',
  },
  {
    name: 'memory',
    description: 'Persistent memory/knowledge',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    icon: '💾',
  },
  {
    name: 'puppeteer',
    description: 'Browser automation',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    icon: '🎭',
  },
  {
    name: 'fetch',
    description: 'HTTP fetch requests',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-fetch'],
    icon: '🌐',
  },
  {
    name: 'filesystem',
    description: 'Read/write local files',
    type: 'stdio' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
    icon: '📁',
  },
]

export function MCPPanel() {
  const show = useUIStore((s) => s.showMCPModal)
  const setShow = useUIStore((s) => s.setShowMCPModal)
  const { servers, editingServer } = useMCPStore()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [serverType, setServerType] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [url, setUrl] = useState('')
  const [args, setArgs] = useState('')

  useEffect(() => {
    if (show) postMessage({ type: 'loadMCPServers' })
  }, [show])

  useEffect(() => {
    if (editingServer && servers[editingServer]) {
      const config = servers[editingServer]
      setName(editingServer)
      setServerType(config.type)
      setCommand(config.command || '')
      setUrl(config.url || '')
      setArgs(config.args?.join(' ') || '')
      setShowForm(true)
    }
  }, [editingServer, servers])

  const resetForm = () => {
    setName('')
    setServerType('stdio')
    setCommand('')
    setUrl('')
    setArgs('')
    setShowForm(false)
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

  const handleQuickAdd = (server: (typeof POPULAR_SERVERS)[number]) => {
    if (server.name in servers) return
    const config: Record<string, unknown> = { type: server.type }
    if (server.type === 'stdio') {
      config.command = server.command
      config.args = server.args
    } else {
      config.url = (server as { url?: string }).url
    }
    postMessage({ type: 'saveMCPServer', name: server.name, config })
  }

  const handleClose = () => {
    setShow(false)
    resetForm()
  }

  if (!show) return null

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
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '480px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>MCP Servers</span>
          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--vscode-foreground)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              opacity: 0.6,
            }}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {/* Configured servers */}
          {serverEntries.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              {serverEntries.map(([sName, config]) => (
                <div
                  key={sName}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: '8px',
                    backgroundColor: 'rgba(128, 128, 128, 0.04)',
                    transition: 'all 0.2s ease',
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                      {sName}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          display: 'inline-block',
                          backgroundColor: 'var(--vscode-badge-background)',
                          color: 'var(--vscode-badge-foreground)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '10px',
                          fontWeight: 500,
                        }}
                      >
                        {config.type}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--vscode-descriptionForeground)',
                          opacity: 0.7,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {config.type === 'stdio' ? config.command : config.url}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5" style={{ flexShrink: 0, marginLeft: '12px' }}>
                    <button
                      onClick={() => useMCPStore.getState().setEditingServer(sName)}
                      className="cursor-pointer"
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--vscode-foreground)',
                        border: '1px solid var(--vscode-panel-border)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
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
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--vscode-errorForeground)',
                        border: '1px solid var(--vscode-errorForeground)',
                        borderRadius: 'var(--radius-sm)',
                        background: 'transparent',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'
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
          )}

          {/* Add server button */}
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full cursor-pointer"
              style={{
                padding: '10px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--chatui-accent)',
                border: '1px dashed var(--chatui-accent)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                transition: 'all 0.2s ease',
                marginBottom: '20px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(237, 110, 29, 0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              + Add MCP Server
            </button>
          )}

          {/* Add/Edit form */}
          {showForm && (
            <div
              style={{
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                marginBottom: '20px',
                backgroundColor: 'rgba(128, 128, 128, 0.04)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '14px', opacity: 0.8 }}>
                {editingServer ? `Edit: ${editingServer}` : 'New Server'}
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-server"
                  disabled={!!editingServer}
                  style={{ ...inputStyle, opacity: editingServer ? 0.5 : 1 }}
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                  Type
                </label>
                <select
                  value={serverType}
                  onChange={(e) => setServerType(e.target.value as 'stdio' | 'http' | 'sse')}
                  style={inputStyle}
                >
                  <option value="stdio">stdio</option>
                  <option value="http">HTTP</option>
                  <option value="sse">SSE</option>
                </select>
              </div>

              {serverType === 'stdio' ? (
                <>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                      Command
                    </label>
                    <input
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="npx -y @modelcontextprotocol/server-xxx"
                      style={inputStyle}
                    />
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                      Arguments (space separated)
                    </label>
                    <input
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      placeholder="/path/to/dir --flag value"
                      style={inputStyle}
                    />
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontWeight: 500, fontSize: '11px', opacity: 0.7 }}>
                    URL
                  </label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    style={inputStyle}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  onClick={resetForm}
                  className="cursor-pointer"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
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
                <button
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="cursor-pointer"
                  style={{
                    padding: '6px 14px',
                    fontSize: '12px',
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
                  {editingServer ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          )}

          {/* Popular servers - hide installed ones */}
          {POPULAR_SERVERS.filter((s) => !(s.name in servers)).length > 0 && (
            <div
              style={{
                paddingTop: '16px',
                borderTop: '1px solid var(--vscode-panel-border)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px', opacity: 0.7 }}>
                Popular Servers
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {POPULAR_SERVERS.filter((s) => !(s.name in servers)).map((server) => (
                  <button
                    key={server.name}
                    onClick={() => handleQuickAdd(server)}
                    className="text-left cursor-pointer border-none text-inherit"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: '1px solid transparent',
                      borderRadius: 'var(--radius-md)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span style={{ fontSize: '16px', minWidth: '24px', textAlign: 'center' }}>
                      {server.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '12px' }}>{server.name}</div>
                      <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '1px' }}>
                        {server.description}
                      </div>
                    </div>
                    <span style={{ fontSize: '10px', color: 'var(--chatui-accent)', fontWeight: 500, opacity: 0.7 }}>
                      + Add
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
