import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_URL } from '../config';

export const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleTraditionalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      // Save token and profile info
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      navigate('/profile-setup');
    } catch (err: any) {
      setError(err.message || 'Server error. Failed to sign up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-container">
      {/* Left visual side */}
      <div className="auth-visual-side">
        {/* Overlay thin vector line curves */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.15, zIndex: 1, pointerEvents: 'none' }}>
          <svg width="100%" height="100%" viewBox="0 0 800 800" fill="none">
            <path d="M-100,200 Q300,50 400,600 T900,400" stroke="#ffffff" strokeWidth="2" />
            <path d="M-50,250 Q350,100 450,650 T950,450" stroke="#ffffff" strokeWidth="2" />
            <path d="M0,300 Q400,150 500,700 T1000,500" stroke="#ffffff" strokeWidth="2" />
          </svg>
        </div>

        <div className="auth-visual-inner">
          {/* Geometric 8-pointed White Star Emblem */}
          <svg width="56" height="56" viewBox="0 0 64 64" fill="none" stroke="#ffffff" strokeWidth="5.5" strokeLinecap="round" style={{ marginBottom: '28px' }}>
            <line x1="32" y1="8" x2="32" y2="56" />
            <line x1="8" y1="32" x2="56" y2="32" />
            <line x1="15.04" y1="15.04" x2="48.96" y2="48.96" />
            <line x1="15.04" y1="48.96" x2="48.96" y2="15.04" />
          </svg>

          <h1 className="auth-visual-title">
            Join<br />Dogether! 🚀
          </h1>
          <p className="auth-visual-description">
            Create an account to step onto the real-time collaborative map. Connect with partners, track nearby tasks, and collaborate instantly.
          </p>
        </div>

        <div className="auth-visual-footer">
          © 2026 Dogether. All rights reserved.
        </div>
      </div>

      {/* Right form side */}
      <div className="auth-form-side">
        <div className="auth-form-inner">
          <div className="auth-brand-header">
            Dogether
          </div>

          <h2 className="auth-welcome-title">
            Create Account
          </h2>
          <p className="auth-welcome-subtitle">
            Already have an account? <Link to="/login" className="auth-welcome-link">Sign in to your account</Link>. It's fast and simple.
          </p>

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
              <span>⚠️</span> {error}
            </div>
          )}

          <form onSubmit={handleTraditionalSubmit}>
            <div className="auth-form-group">
              <label className="auth-label" htmlFor="name">Full Name</label>
              <input
                id="name"
                type="text"
                className="auth-input"
                placeholder="Alex Johnson"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="auth-form-group">
              <label className="auth-label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="auth-input"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className="auth-form-group" style={{ marginBottom: '32px' }}>
              <label className="auth-label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="auth-input"
                placeholder="Min. 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button 
              type="submit" 
              className="auth-submit-btn" 
              disabled={loading}
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Register;
