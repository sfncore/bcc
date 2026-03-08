import { useEffect, useState } from 'react'
import { type ConnectionState, onConnectionStateChange } from '../lib/api'

/**
 * Hook to subscribe to backend connection state changes.
 * Returns current connection state and convenience booleans.
 */
export function useConnectionState() {
  const [state, setState] = useState<ConnectionState>('connected')

  useEffect(() => {
    return onConnectionStateChange(setState)
  }, [])

  return {
    connectionState: state,
    isConnected: state === 'connected',
    isDisconnected: state === 'disconnected' || state === 'degraded',
  }
}
