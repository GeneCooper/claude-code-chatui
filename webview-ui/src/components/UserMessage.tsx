interface Props {
  text: string
}

export function UserMessage({ text }: Props) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] px-3 py-2 rounded-lg bg-[#ed6e1d] text-white text-sm whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  )
}
