import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { SocketProvider, useSocket } from './context/SocketContext.js';
import { Navbar } from './components/Navbar.js';
import { SoldModal } from './components/SoldModal.js';
import { LoginPage } from './pages/LoginPage.js';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { CaptainDashboard } from './pages/CaptainDashboard.js';
import { PublicDisplay } from './pages/PublicDisplay.js';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { lastSold, clearLastSold } = useSocket();

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#07090e',
          color: 'var(--text-muted)',
          gap: '16px',
        }}
      >
        <div style={{ fontSize: '40px' }} className="pulse-glow">
          🏀
        </div>
        <div className="font-display" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
          Initializing Muqabla Auction Portal...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // 1. PUBLIC DISPLAY (Dedicated 16:9 Projector Presentation Mode — No Navbar)
  if (user.role === 'DISPLAY') {
    return <PublicDisplay />;
  }

  // 2. ADMIN & CAPTAIN INTERFACES (Full Dashboard with Navbar)
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      <Navbar />

      <main>
        {user.role === 'ADMIN' && <AdminDashboard />}
        {user.role === 'CAPTAIN' && <CaptainDashboard />}
      </main>

      {/* Global Sold Celebration Modal */}
      <SoldModal soldData={lastSold} onClose={clearLastSold} />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <SocketProvider>
        <AppContent />
      </SocketProvider>
    </AuthProvider>
  );
};

export default App;
