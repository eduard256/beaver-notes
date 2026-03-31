import { useState, useCallback } from 'react';
import Login from './components/Login';
import Wall from './components/Wall';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);

  const handleLoginSuccess = useCallback(() => {
    setAuthenticated(true);
  }, []);

  if (!authenticated) {
    return <Login onSuccess={handleLoginSuccess} />;
  }

  return <Wall />;
}
