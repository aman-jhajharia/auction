import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initDatabase, closeDatabase, db } from './db.js';
import { seedProductionAccounts } from './scripts/initAccounts.js';
import { router as apiRouter } from './routes.js';
import { auctionEngine } from './auctionEngine.js';
import { verifyToken, JwtPayload } from './auth.js';

const app = express();
const server = http.createServer(app);

// CORS configuration supporting single or multiple production origins (e.g. Vercel deployment)
const rawCorsOrigin = process.env.CORS_ORIGIN || process.env.FRONTEND_ORIGIN || '';
const allowedOrigins = rawCorsOrigin
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 0) {
  console.warn('⚠️  WARNING: Neither FRONTEND_ORIGIN nor CORS_ORIGIN is set in production! Client requests from Vercel will be blocked by CORS.');
}

const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return true; // Server-to-server or non-browser request

  // In development, permit localhost/127.0.0.1
  if (process.env.NODE_ENV !== 'production') {
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return true;
    }
  }

  // Exact match against configured allowed origins
  if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
    return true;
  }

  return false;
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Socket CORS blocked for origin: ${origin}`));
      }
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

// Attach Socket server to auction engine
auctionEngine.setSocketServer(io);

// Mount API routes
app.use('/api', apiRouter);

// Serve built frontend if embedded (optional single-host deployment mode)
const clientDistPath = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (_req: Request, res: Response) => {
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

io.on('connection', async (socket: Socket) => {
  const user = (socket as any).user as JwtPayload;

  // Join targeted privacy rooms based strictly on verified JWT claims (no trust in client params)
  if (user.role === 'ADMIN') {
    socket.join('admin');
  } else if (user.role === 'DISPLAY') {
    socket.join('display');
  } else if (user.role === 'CAPTAIN' && user.teamId) {
    socket.join(`captain_${user.teamId}`);
  }

  // Push authoritative state to the client immediately upon connection
  await auctionEngine.broadcastState();

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
  socket.on('admin:start_auction', async () => {
    if (user.role === 'ADMIN') await auctionEngine.startAuction(user.username);
  });

  socket.on('admin:pause_auction', async () => {
    if (user.role === 'ADMIN') await auctionEngine.pauseAuction(user.username);
  });

  socket.on('admin:resume_auction', async () => {
    if (user.role === 'ADMIN') await auctionEngine.resumeAuction(user.username);
  });

  socket.on('admin:reveal_player', async (data: { playerId: string }) => {
    if (user.role === 'ADMIN' && data?.playerId) {
      await auctionEngine.revealPlayer(data.playerId, user.username);
    }
  });

  socket.on('admin:start_bidding', async () => {
    if (user.role === 'ADMIN') await auctionEngine.startBidding(user.username);
  });

  socket.on('admin:extend_timer', async (data: { seconds?: number }) => {
    if (user.role === 'ADMIN') {
      await auctionEngine.extendTimer(Number(data?.seconds) || 5, user.username);
    }
  });

  socket.on('admin:confirm_sold', async () => {
    if (user.role === 'ADMIN') {
      try {
        await auctionEngine.confirmSold(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('admin:mark_unsold', async () => {
    if (user.role === 'ADMIN') {
      try {
        await auctionEngine.markUnsold(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('admin:undo_sale', async () => {
    if (user.role === 'ADMIN') {
      try {
        await auctionEngine.undoLastSale(user.username);
      } catch (err: any) {
        socket.emit('admin:error', { message: err.message });
      }
    }
  });

  socket.on('disconnect', () => {});
});

const PORT = Number(process.env.PORT) || 4000;

async function bootstrap() {
  try {
    // 1. Initialize DB schema
    await initDatabase();

    // 2. Ensure accounts and teams exist
    await seedProductionAccounts();

    // 3. Start HTTP and WebSocket server
    server.listen(PORT, () => {
      console.log(`🏀 Muqabla Auction Server running on port ${PORT}`);
      console.log(`📡 Real-time Socket.IO WebSocket transport active`);
      console.log(`🗄️ Persistence engine: ${db.isPostgres() ? 'Managed PostgreSQL' : 'Local SQLite fallback'}`);
    });
  } catch (err) {
    console.error('❌ Failed to bootstrap Muqabla Auction Server:', err);
    process.exit(1);
  }
}

bootstrap();

// Graceful Shutdown Handler
async function handleGracefulShutdown(signal: string) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  io.close(async () => {
    console.log('🔌 Socket.IO connections closed.');
    server.close(async () => {
      console.log('🌐 HTTP server closed.');
      await closeDatabase();
      console.log('💾 Database connections closed safely.');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('⚠️  Forced termination after timeout.');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
