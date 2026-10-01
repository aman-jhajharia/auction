import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase } from './db.js';
import { seedProductionAccounts } from './scripts/initAccounts.js';
import { router as apiRouter } from './routes.js';
import { auctionEngine } from './auctionEngine.js';
import { verifyToken, JwtPayload } from './auth.js';

const app = express();
const server = http.createServer(app);

// CORS configuration supporting single or multiple production origins
const rawCorsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '';
const allowedOrigins = rawCorsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests or same-origin requests where origin header is absent
    if (!origin) return callback(null, true);

    // In development mode, allow localhost origins
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (process.env.NODE_ENV !== 'production') {
        if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
          return callback(null, true);
        }
      }
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`Socket CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Basic security headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Initialize DB and ensure accounts/teams exist
initDatabase();
seedProductionAccounts();

// Attach Socket server to auction engine
auctionEngine.setSocketServer(io);

// Mount API routes
app.use('/api', apiRouter);

// Serve built frontend in production/single-origin mode
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Socket.IO Authentication & Room Management
io.use((socket: Socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token || typeof token !== 'string') {
    return next(new Error('Authentication token required'));
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next(new Error('Invalid or expired authentication token'));
  }

  (socket as any).user = payload;
  next();
});

io.on('connection', (socket: Socket) => {
  const user = (socket as any).user as JwtPayload;

  // Join targeted privacy rooms
  if (user.role === 'ADMIN') {
    socket.join('admin');
  } else if (user.role === 'DISPLAY') {
    socket.join('display');
  } else if (user.role === 'CAPTAIN' && user.teamId) {
    socket.join(`captain_${user.teamId}`);
  }

  // Push authoritative state to the client immediately upon connection
  auctionEngine.broadcastState();

  // Captain Actions
  socket.on('captain:place_bid', async (data: { amount: number }) => {
    if (user.role !== 'CAPTAIN' || !user.teamId) {
      socket.emit('captain:bid_rejected', { reason: 'Unauthorized to place bids.' });
      return;
    }

    const amount = Number(data.amount);
    if (isNaN(amount) || amount <= 0) {
      socket.emit('captain:bid_rejected', { reason: 'Invalid bid amount.' });
      return;
    }

    const result = await auctionEngine.placeBid(user.teamId, amount, user.username);
    if (!result.accepted) {
      socket.emit('captain:bid_rejected', { reason: result.reason });
    }
  });

  // Admin Actions via WebSockets
  socket.on('admin:start_auction', () => {
    if (user.role === 'ADMIN') auctionEngine.startAuction(user.username);
  });

  socket.on('admin:pause_auction', () => {
    if (user.role === 'ADMIN') auctionEngine.pauseAuction(user.username);
  });

  socket.on('admin:resume_auction', () => {
    if (user.role === 'ADMIN') auctionEngine.resumeAuction(user.username);
  });

  socket.on('admin:reveal_player', (data: { playerId: string }) => {
    if (user.role === 'ADMIN' && data?.playerId) {
      auctionEngine.revealPlayer(data.playerId, user.username);
    }
  });

  socket.on('admin:start_bidding', () => {
    if (user.role === 'ADMIN') auctionEngine.startBidding(user.username);
  });

  socket.on('admin:extend_timer', (data: { seconds?: number }) => {
    if (user.role === 'ADMIN') {
      auctionEngine.extendTimer(Number(data?.seconds) || 5, user.username);
    }
  });

  socket.on('admin:confirm_sold', () => {
    if (user.role === 'ADMIN') {
      try {
        auctionEngine.confirmSold(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('admin:mark_unsold', () => {
    if (user.role === 'ADMIN') {
      try {
        auctionEngine.markUnsold(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('admin:undo_sale', () => {
    if (user.role === 'ADMIN') {
      try {
        auctionEngine.undoLastSale(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('disconnect', () => {});
});

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`🏀 Muqabla Auction Server running on port ${PORT}`);
  console.log(`📡 Real-time Socket.IO WebSocket transport active`);
});

// Graceful Shutdown Handler
function handleGracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  io.close(() => {
    console.log('🔌 Socket.IO connections closed.');
    server.close(() => {
      console.log('🌐 HTTP server closed.');
      closeDatabase();
      console.log('💾 SQLite database closed safely.');
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if connections fail to close
  setTimeout(() => {
    console.error('⚠️  Forced termination after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
