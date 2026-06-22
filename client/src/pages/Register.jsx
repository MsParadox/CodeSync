import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { registerUser, selectAuthLoading, selectAuthError, clearError } from '../store/authSlice.js';
import toast from 'react-hot-toast';

function PasswordStrength({ password }) {
  const checks = [
    { label: '8+ chars',  ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number',    ok: /[0-9]/.test(password) },
    { label: 'Symbol',    ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const colors = ['#ff3d6a', '#ff6b35', '#ffd600', '#00ff9d'];
  const labels = ['Weak', 'Fair', 'Good', 'Strong'];

  if (!password) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{ background: i < score ? colors[score - 1] : '#1e2548' }} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {checks.map(c => (
            <span key={c.label} className={`text-2xs font-body transition-colors ${c.ok ? 'text-green' : 'text-text-muted'}`}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        <span className="text-2xs font-body" style={{ color: score > 0 ? colors[score - 1] : '#444d7a' }}>
          {score > 0 ? labels[score - 1] : ''}
        </span>
      </div>
    </div>
  );
}

export default function Register() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const loading   = useSelector(selectAuthLoading);
  const authError = useSelector(selectAuthError);

  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);

  useEffect(() => { dispatch(clearError()); }, [dispatch]);

  const validate = () => {
    const e = {};
    if (!form.username.match(/^[a-zA-Z0-9_-]{3,24}$/))
      e.username = 'Must be 3–24 characters: letters, numbers, _ or -';
    if (!form.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))
      e.email = 'Enter a valid email address';
    if (form.password.length < 8)
      e.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirm)
      e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const result = await dispatch(registerUser({
      username: form.username, email: form.email, password: form.password,
    }));
    if (registerUser.fulfilled.match(result)) {
      toast.success(`Welcome to CodeSync, ${result.payload.user.username}!`);
      navigate('/');
    }
  };

  const Field = ({ name, label, type = 'text', placeholder, icon, extra }) => (
    <div>
      <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={name === 'password' || name === 'confirm' ? (showPass ? 'text' : 'password') : type}
          value={form[name]}
          onChange={e => { setForm(f => ({ ...f, [name]: e.target.value })); setErrors(er => ({ ...er, [name]: '' })); }}
          placeholder={placeholder}
          className={`input-cyber w-full rounded pl-9 ${errors[name] ? 'border-red/50' : ''}`}
          autoComplete={name === 'confirm' ? 'new-password' : name === 'password' ? 'new-password' : name}
        />
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm">{icon}</span>
        {extra}
      </div>
      {errors[name] && <p className="text-red text-2xs font-body mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-64 h-64 bg-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
              <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm shadow-neon-cyan" />
            </div>
            <span className="font-display text-xl font-bold text-cyan tracking-[0.15em] text-glow-cyan">CODESYNC</span>
          </Link>
          <p className="text-text-muted text-sm font-body mt-2">Create your account</p>
        </div>

        <div className="glass-panel rounded border border-border relative corner-tl corner-br shadow-panel">
          <div className="px-6 py-5 border-b border-border">
            <h2 className="font-display text-sm text-text-primary tracking-wider">NEW ACCOUNT</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {authError && (
              <div className="p-3 rounded border border-red/30 bg-red/10 text-red text-xs font-body flex items-center gap-2">
                <span>⚠</span> {authError}
              </div>
            )}

            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Username</label>
              <div className="relative">
                <input type="text" value={form.username}
                  onChange={e => { setForm(f => ({...f, username: e.target.value})); setErrors(er => ({...er, username: ''})); }}
                  placeholder="coolcoder42" minLength={3} maxLength={24}
                  className={`input-cyber w-full rounded ${form.username ? 'pl-3.5' : 'pl-9'} ${errors.username ? 'border-red/50' : ''}`}
                  autoComplete="username" />
                {!form.username && (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">@</span>
                )}
              </div>
              {errors.username && <p className="text-red text-2xs font-body mt-1">{errors.username}</p>}
            </div>

            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Email</label>
              <div className="relative">
                <input type="email" value={form.email}
                  onChange={e => { setForm(f => ({...f, email: e.target.value})); setErrors(er => ({...er, email: ''})); }}
                  placeholder="you@example.com"
                  className={`input-cyber w-full rounded ${form.email ? 'pl-3.5' : 'pl-9'} ${errors.email ? 'border-red/50' : ''}`}
                  autoComplete="email" />
                {!form.email && (
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                )}
              </div>
              {errors.email && <p className="text-red text-2xs font-body mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.password}
                  onChange={e => { setForm(f => ({...f, password: e.target.value})); setErrors(er => ({...er, password: ''})); }}
                  placeholder="Min 8 characters"
                  className={`input-cyber w-full rounded pr-10 ${form.password ? 'pl-3.5' : 'pl-9'} ${errors.password ? 'border-red/50' : ''}`}
                  autoComplete="new-password" />
                {!form.password && (
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                )}
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-cyan transition-colors text-xs">
                  {showPass ? '👁' : '🔒'}
                </button>
              </div>
              {errors.password && <p className="text-red text-2xs font-body mt-1">{errors.password}</p>}
              <PasswordStrength password={form.password} />
            </div>

            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Confirm Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.confirm}
                  onChange={e => { setForm(f => ({...f, confirm: e.target.value})); setErrors(er => ({...er, confirm: ''})); }}
                  placeholder="Repeat password"
                  className={`input-cyber w-full rounded ${form.confirm ? 'pl-3.5 pr-9' : 'pl-9'} ${errors.confirm ? 'border-red/50' : ''}`}
                  autoComplete="new-password" />
                {!form.confirm ? (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm pointer-events-none">🔒</span>
                ) : (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none">
                    {form.confirm === form.password ? '✅' : '❌'}
                  </span>
                )}
              </div>
              {errors.confirm && <p className="text-red text-2xs font-body mt-1">{errors.confirm}</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full btn-cyber btn-cyber-green py-3 text-xs font-bold tracking-widest
                         disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <><div className="w-3.5 h-3.5 border border-green/40 border-t-green rounded-full animate-spin" />Creating account…</>
              ) : 'Create Account →'}
            </button>

            <div className="neon-divider my-3" />

            <p className="text-center text-xs font-body text-text-muted">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan hover:text-cyan/80 transition-colors font-medium">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
