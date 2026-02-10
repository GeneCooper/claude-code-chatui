import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ComponentPropsWithoutRef } from 'react'

interface Props {
  text: string
}

export function AssistantMessage({ text }: Props) {
  return (
    <div className="max-w-[95%] text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          code: CodeComponent,
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function CodeComponent({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const code = String(children).replace(/\n$/, '')

  if (match) {
    return (
      <div className="my-2 rounded-md overflow-hidden border border-[var(--vscode-panel-border)]">
        <div className="flex items-center justify-between px-3 py-1 bg-[var(--vscode-sideBar-background)] text-[10px] opacity-60">
          <span>{match[1]}</span>
          <button
            onClick={() => navigator.clipboard.writeText(code)}
            className="hover:opacity-100 opacity-60 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '12px',
            fontSize: '12px',
            background: 'var(--vscode-editor-background)',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <code
      className="px-1 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[0.9em] font-mono"
      {...props}
    >
      {children}
    </code>
  )
}
