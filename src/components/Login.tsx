import React, { useState } from 'react';
import { t } from '../ui/theme';
import { Card } from '../ui/primitives';
import { useAuth } from '../data/authStore';

/**
 * Minimal login gate (inc7). POSTs to `${VITE_AUTH_URL}/auth/login` and stores
 * the returned session token. No keys, nothing beyond the token (TP/SL posture).
 */
export const Login: React.FC = () => {
  const login = useAuth((s) => s.login);
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'authing') return;
    void login(username, password).catch(() => {}); // error surfaced via store
  };

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '10px 12px',
    background: t.panel2, border: `1px solid ${t.border}`, borderRadius: 9,
    color: t.text, fontFamily: t.sans, fontSize: 14, outline: 'none',
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: t.bg }}>
      <Card style={{ width: 'min(340px, calc(100vw - 32px))', padding: 28 }}>
        <div style={{ fontFamily: t.sans, fontSize: 20, fontWeight: 700, color: t.text }}>zif</div>
        <div style={{ fontSize: 13, color: t.mut, marginTop: 4 }}>Sign in to continue</div>

        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <label style={{ fontSize: 12, color: t.mut }}>
            Username
            <input
              style={input}
              value={username}
              autoFocus
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label style={{ fontSize: 12, color: t.mut, display: 'block', marginTop: 14 }}>
            Password
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          {error && (
            <div style={{ color: t.red, fontSize: 12.5, marginTop: 12 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={status === 'authing'}
            style={{
              width: '100%', marginTop: 20, padding: '11px 12px', borderRadius: 9, border: 'none',
              background: t.acc, color: '#0e1114', fontFamily: t.sans, fontSize: 14, fontWeight: 700,
              cursor: status === 'authing' ? 'default' : 'pointer', opacity: status === 'authing' ? 0.6 : 1,
            }}
          >
            {status === 'authing' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </Card>
    </div>
  );
};
