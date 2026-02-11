import { postMessage } from '../hooks'
import { t } from '../i18n'

interface Props {
  data: {
    sha: string
    message: string
    timestamp: string
  }
}

export function RestorePoint({ data }: Props) {
  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs border border-(--vscode-panel-border) rounded-lg bg-(--vscode-sideBar-background)">
      <span className="opacity-40">{formatTime(data.timestamp)}</span>
      <span className="opacity-60 truncate flex-1">{data.message}</span>
      <button
        onClick={() => postMessage({ type: 'restoreBackup', commitSha: data.sha })}
        className="px-2 py-0.5 text-[10px] rounded bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) hover:bg-(--vscode-button-secondaryHoverBackground) cursor-pointer border-none whitespace-nowrap"
      >
        {t('restore.restore')}
      </button>
    </div>
  )
}
