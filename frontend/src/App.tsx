import { useState, useCallback, useEffect } from 'react';
import Login from './components/Login';
import Wall from './components/Wall';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);

  const handleLoginSuccess = useCallback(() => {
    setAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setAuthenticated(false);
  }, []);

  // Listen for 401 errors globally to auto-logout
  useEffect(() => {
    const handler = () => setAuthenticated(false);
    window.addEventListener('beaver-logout', handler);
    return () => window.removeEventListener('beaver-logout', handler);
  }, []);

  if (!authenticated) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  return <Wall onUnauthorized={handleLogout} />;
}
