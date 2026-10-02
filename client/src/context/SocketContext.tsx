import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext.js';
import { sounds } from '../utils/soundEffects.js';
import { getSocketUrl } from '../utils/api.js';
import confetti from 'canvas-confetti';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  state: any;
  timer: number;
  lastSold: any;
  clearLastSold: () => void;
  bidError: string | null;
  clearBidError: () => void;
  placeBid: (amount: number) => void;
  adminAction: (event: string, data?: any) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<any>(null);
  const [timer, setTimer] = useState<number>(10);
  const [lastSold, setLastSold] = useState<any>(null);
  const [bidError, setBidError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const s = io(getSocketUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => {
      setConnected(true);
    });

    s.on('disconnect', () => {
      setConnected(false);
    });

    s.on('auction:state_sync', (syncedState: any) => {
      setState((prev: any) => {
        // Play bid sound if bid increased
        if (prev && syncedState.currentHighestBid > (prev.currentHighestBid || 0)) {
          sounds.playBid();
        }
        return syncedState;
      });
      if (typeof syncedState.timerRemaining === 'number') {
        setTimer(syncedState.timerRemaining);
      }
    });

    s.on('auction:timer_tick', (data: { remaining: number }) => {
      setTimer(data.remaining);
      if (data.remaining <= 3 && data.remaining > 0) {
        sounds.playTick();
      }
    });

    s.on('auction:sold', (soldData: any) => {
      setLastSold(soldData);
      sounds.playSold();

      // Trigger championship confetti celebration
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#00f2fe', '#ffd700', '#ffffff', '#4facfe', '#ffaa00'],
        });
      } catch {}
    });

    s.on('auction:unsold', (_data: any) => {
      sounds.playOutbid();
    });

    s.on('captain:bid_rejected', (data: { reason?: string }) => {
      setBidError(data.reason || 'Bid was rejected.');
      sounds.playOutbid();
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [token]);

  const placeBid = (amount: number) => {
    if (!socket || !connected) return;
    setBidError(null);
    socket.emit('captain:place_bid', { amount });
  };

  const adminAction = (event: string, data?: any) => {
    if (!socket || !connected) return;
    socket.emit(event, data);
  };

  const clearLastSold = () => setLastSold(null);
  const clearBidError = () => setBidError(null);

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        state,
        timer,
        lastSold,
        clearLastSold,
        bidError,
        clearBidError,
        placeBid,
        adminAction,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
