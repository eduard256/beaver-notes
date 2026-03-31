import { useState, useEffect, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { login, checkAuth } from '../utils/api';
import './Login.css';

interface LoginProps {
  onSuccess: () => void;
}

export default function Login({ onSuccess }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Check if already authenticated
    checkAuth()
      .then(() => onSuccess())
      .catch(() => setChecking(false));
  }, [onSuccess]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError(false);

    try {
      await login(password);
      onSuccess();
    } catch {
      setError(true);
      setPassword('');
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="login-page">
        <div className="login-loading" />
      </div>
    );
  }

  return (
    <div className="login-page">
      <motion.div
        className="login-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <motion.img
          src="/beaver.svg"
          alt="Beaver Notes"
          className="login-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        />

        <h1 className="login-title">Beaver Notes</h1>
        <p className="login-subtitle">Введите пароль для входа</p>

        <form onSubmit={handleSubmit} className="login-form">
          <motion.div
            animate={error ? { x: [-12, 12, -8, 8, -4, 4, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <input
              type="password"
              className={`login-input ${error ? 'login-input--error' : ''}`}
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </motion.div>

          {error && <p className="login-error">Неверный пароль</p>}

          <button
            type="submit"
            className="login-button"
            disabled={loading || !password.trim()}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
