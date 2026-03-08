/**
 * Degraded mode banner for when database/backend features are unavailable.
 * Shows at the top of the app to inform users of limited functionality.
 */
import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { type ConnectionState, checkHealth, onConnectionStateChange } from '../../lib/api'

export interface OfflineBannerProps {
  /** Override the connection state (useful for testing) */
  forceState?: ConnectionState
  /** Custom message for degraded state */
  degradedMessage?: string
  /** Custom message for disconnected state */
  disconnectedMessage?: string
}

const bannerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  padding: '8px 16px',
  fontSize: '13px',
  fontWeight: 500,
  textAlign: 'center',
  transition: 'opacity 0.3s, transform 0.3s',
}

const degradedBannerStyle: CSSProperties = {
  ...bannerStyle,
  backgroundColor: '#78350f',
  color: '#fef3c7',
  borderBottom: '1px solid #92400e',
}

const disconnectedBannerStyle: CSSProperties = {
  ...bannerStyle,
  backgroundColor: '#7f1d1d',
  color: '#fecaca',
  borderBottom: '1px solid #dc2626',
}

const hiddenStyle: CSSProperties = {
  ...bannerStyle,
  opacity: 0,
  height: 0,
  padding: 0,
  overflow: 'hidden',
}

const iconStyle: CSSProperties = {
  width: '16px',
  height: '16px',
  flexShrink: 0,
}

const retryButtonStyle: CSSProperties = {
  padding: '4px 12px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#fff',
  backgroundColor: 'rgba(255, 255, 255, 0.15)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
}

const retryButtonDisabledStyle: CSSProperties = {
  ...retryButtonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
}

const spinnerStyle: CSSProperties = {
  display: 'inline-block',
  width: '12px',
  height: '12px',
  border: '2px solid rgba(255, 255, 255, 0.3)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  animation: 'offline-banner-spin 0.6s linear infinite',
  verticalAlign: 'middle',
  marginRight: '6px',
}

const AUTO_RETRY_INTERVAL = 30

/**
 * Warning icon for degraded mode
 */
function WarningIcon() {
  return (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Warning"
    >
      <title>Warning</title>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

/**
 * Offline icon for disconnected mode
 */
function OfflineIcon() {
  return (
    <svg
      style={iconStyle}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Offline"
    >
      <title>Offline</title>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <line x1="12" y1="20" x2="12.01" y2="20" />
    </svg>
  )
}

/**
 * Spinner component for retry button loading state
 */
function Spinner() {
  return <span style={spinnerStyle} aria-hidden="true" />
}

/**
 * Banner component that shows connection status.
 * Hidden when connected, shows warning for degraded mode,
 * shows error for disconnected mode.
 */
export function OfflineBanner({
  forceState,
  degradedMessage = 'Database unavailable. Formula editing still works, but bead data is not accessible.',
  disconnectedMessage = 'Backend server disconnected. Some features may not work.',
}: OfflineBannerProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connected')
  const [isRetrying, setIsRetrying] = useState(false)
  const [countdown, setCountdown] = useState(AUTO_RETRY_INTERVAL)
  const [retryQueued, setRetryQueued] = useState(false)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const styleInjectedRef = useRef(false)

  // Inject keyframe animation once
  useEffect(() => {
    if (styleInjectedRef.current) return
    styleInjectedRef.current = true
    const style = document.createElement('style')
    style.textContent = '@keyframes offline-banner-spin { to { transform: rotate(360deg) } }'
    document.head.appendChild(style)
    return () => {
      document.head.removeChild(style)
      styleInjectedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (forceState !== undefined) {
      setConnectionState(forceState)
      return
    }

    return onConnectionStateChange(setConnectionState)
  }, [forceState])

  const performRetry = useCallback(async () => {
    setIsRetrying(true)
    setRetryQueued(false)
    try {
      await checkHealth()
    } finally {
      setIsRetrying(false)
      setCountdown(AUTO_RETRY_INTERVAL)
    }
  }, [])

  // Auto-retry countdown when disconnected/degraded
  useEffect(() => {
    if (connectionState === 'connected' || isRetrying) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
      return
    }

    setCountdown(AUTO_RETRY_INTERVAL)
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current)
        countdownRef.current = null
      }
    }
  }, [connectionState, isRetrying])

  // Trigger retry when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && !isRetrying) {
      performRetry()
    }
  }, [countdown, isRetrying, performRetry])

  // Execute queued retry when current check finishes
  useEffect(() => {
    if (!isRetrying && retryQueued) {
      performRetry()
    }
  }, [isRetrying, retryQueued, performRetry])

  const handleRetry = useCallback(() => {
    if (isRetrying) {
      setRetryQueued(true)
      return
    }
    performRetry()
  }, [isRetrying, performRetry])

  if (connectionState === 'connected') {
    return <div style={hiddenStyle} aria-hidden="true" />
  }

  const isDegraded = connectionState === 'degraded'
  const message = isDegraded ? degradedMessage : disconnectedMessage
  const style = isDegraded ? degradedBannerStyle : disconnectedBannerStyle
  const Icon = isDegraded ? WarningIcon : OfflineIcon

  const buttonLabel = isRetrying
    ? 'Checking...'
    : retryQueued
      ? 'Queued...'
      : `Retry${countdown < AUTO_RETRY_INTERVAL ? ` (${countdown}s)` : ''}`

  return (
    <div style={style} role="alert">
      <Icon />
      <span>{message}</span>
      <button
        type="button"
        style={isRetrying ? retryButtonDisabledStyle : retryButtonStyle}
        onClick={handleRetry}
        aria-label={isRetrying ? 'Checking connection...' : `Retry connection. Auto-retry in ${countdown} seconds`}
        onMouseOver={(e) => {
          if (!isRetrying) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
          }
        }}
        onMouseOut={(e) => {
          if (!isRetrying) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
          }
        }}
        onFocus={(e) => {
          if (!isRetrying) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)'
          }
        }}
        onBlur={(e) => {
          if (!isRetrying) {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
          }
        }}
      >
        {isRetrying && <Spinner />}
        {buttonLabel}
      </button>
    </div>
  )
}
