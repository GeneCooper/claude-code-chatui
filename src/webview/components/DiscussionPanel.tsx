import { useState, useMemo, memo } from 'react'
import { useDiscussionStore } from '../store'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { postMessage } from '../hooks'

/**
 * Multi-agent discussion panel — shows parallel role responses and synthesis.
 * Displayed inline in the chat when discussion mode is active.
 */
export const DiscussionPanel = memo(function DiscussionPanel() {
  const { isDiscussing, roles, userMessage, synthesis } = useDiscussionStore()
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())

  const allRolesComplete = useMemo(() =>
    roles.length > 0 && roles.every(r => r.status === 'complete' || r.status === 'error'),
    [roles],
  )

  const toggleRole = (roleId: string) => {
    setExpandedRoles(prev => {
      const next = new Set(prev)
      if (next.has(roleId)) next.delete(roleId)
      else next.add(roleId)
      return next
    })
  }

  if (roles.length === 0) return null

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px 12px',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(99, 102, 241, 0.05))',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <span style={{ fontWeight: 600, fontSize: '12px', color: '#8b5cf6' }}>
          Multi-Agent Discussion
        </span>
        <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: 'auto' }}>
          {roles.filter(r => r.status === 'complete').length}/{roles.length} experts responded
        </span>
        {isDiscussing && (
          <button
            onClick={() => postMessage({ type: 'stopDiscussion' })}
            className="cursor-pointer border-none"
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 600,
            }}
          >
            Stop
          </button>
        )}
      </div>

      {/* User question */}
      <div
        style={{
          padding: '6px 12px',
          fontSize: '11px',
          opacity: 0.6,
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <span style={{ fontWeight: 600 }}>Q: </span>
        {userMessage.length > 100 ? userMessage.slice(0, 100) + '...' : userMessage}
      </div>

      {/* Role responses */}
      <div style={{ padding: '4px' }}>
        {roles.map(role => {
          const isExpanded = expandedRoles.has(role.roleId)
          const statusIcon = role.status === 'complete' ? '✓'
            : role.status === 'error' ? '✗'
            : role.status === 'streaming' ? '...'
            : '○'

          return (
            <div
              key={role.roleId}
              style={{
                margin: '4px 0',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                overflow: 'hidden',
              }}
            >
              {/* Role header */}
              <button
                onClick={() => toggleRole(role.roleId)}
                className="cursor-pointer border-none flex items-center gap-2 w-full"
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  color: 'inherit',
                  textAlign: 'left',
                }}
              >
                {/* Color dot */}
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: role.color,
                  flexShrink: 0,
                }} />
                <span style={{ fontWeight: 600, fontSize: '12px', color: role.color }}>
                  {role.roleName}
                </span>
                <span style={{ fontSize: '10px', opacity: 0.5 }}>
                  {statusIcon}
                </span>
                {role.status === 'streaming' && (
                  <span style={{ fontSize: '10px', opacity: 0.4 }}>analyzing...</span>
                )}
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  style={{
                    marginLeft: 'auto',
                    opacity: 0.3,
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Role content */}
              {(isExpanded || role.status === 'streaming') && role.text && (
                <div
                  className="markdown-content text-xs"
                  style={{
                    padding: '6px 10px 8px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.04)',
                    borderLeft: `3px solid ${role.color}`,
                    marginLeft: '4px',
                    opacity: role.status === 'streaming' ? 0.8 : 1,
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {role.text}
                  </ReactMarkdown>
                </div>
              )}

              {role.status === 'error' && (
                <div style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  color: '#ef4444',
                  opacity: 0.8,
                }}>
                  Error: {role.error}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Synthesis section */}
      {(allRolesComplete || synthesis.status === 'streaming' || synthesis.status === 'complete') && (
        <div style={{
          borderTop: '1px solid rgba(139, 92, 246, 0.15)',
          background: 'rgba(139, 92, 246, 0.03)',
        }}>
          <div
            className="flex items-center gap-2"
            style={{
              padding: '6px 12px',
              borderBottom: synthesis.text ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            <span style={{ fontWeight: 600, fontSize: '12px', color: '#8b5cf6' }}>
              Synthesis
            </span>
            {synthesis.status === 'streaming' && (
              <span style={{ fontSize: '10px', opacity: 0.4 }}>synthesizing...</span>
            )}
            {synthesis.status === 'pending' && allRolesComplete && (
              <span style={{ fontSize: '10px', opacity: 0.4 }}>waiting...</span>
            )}
          </div>
          {synthesis.text && (
            <div
              className="markdown-content text-sm"
              style={{
                padding: '8px 12px',
                lineHeight: 1.6,
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {synthesis.text}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
