import { useState } from 'react'

interface Props {
  text: string
}

export function UserMessage({ text }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex justify-end">
      <div className="group relative max-w-[85%] px-3 py-2 rounded-lg bg-[#ed6e1d] text-white text-sm whitespace-pre-wrap break-words">
        <button
          onClick={handleCopy}
          className="absolute right-1 top-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer bg-transparent border-none text-white text-[10px] px-1 py-0.5 transition-opacity"
          title="Copy message"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        {text}
      </div>
    </div>
  )
}
