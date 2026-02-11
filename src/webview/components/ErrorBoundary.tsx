import React, { Component, type ReactNode, type ErrorInfo } from 'react'
import { createModuleLogger } from '../../shared/logger'

const log = createModuleLogger('ErrorBoundary')

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode | ((error: Error, retry: () => void) => ReactNode)
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  onReset?: () => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    log.error('Caught rendering error', error)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.props.onReset?.()
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback(this.state.error, this.handleRetry)
        }
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div className="text-[color:var(--vscode-errorForeground)] text-sm font-medium mb-2">
            Something went wrong
          </div>
          <div className="text-[color:var(--vscode-descriptionForeground)] text-xs mb-4 max-w-md">
            {this.state.error.message}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1 text-xs rounded bg-[color:var(--vscode-button-background)] text-[color:var(--vscode-button-foreground)] hover:bg-[color:var(--vscode-button-hoverBackground)]"
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

