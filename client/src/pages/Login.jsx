import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, selectAuthLoading, selectAuthError, clearError } from '../store/authSlice.js';
import toast from 'react-hot-toast';

export default function Login() {
  const dispatch  = useDispatch();
  const navigate  = useNavigate();
  const loading   = useSelector(selectAuthLoading);
  const authError = useSelector(selectAuthError);

  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);

  useEffect(() => { dispatch(clearError()); }, [dispatch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await dispatch(loginUser(form));
    if (loginUser.fulfilled.match(result)) {
      toast.success(`Welcome back, ${result.payload.user.username}!`);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 bg-grid opacity-40" />
      {/* Glow orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-purple/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm group-hover:bg-cyan/30 transition-colors" />
              <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm shadow-neon-cyan" />
            </div>
            <span className="font-display text-xl font-bold text-cyan tracking-[0.15em] text-glow-cyan">CODESYNC</span>
          </Link>
          <p className="text-text-muted text-sm font-body mt-2">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="glass-panel rounded border border-border relative corner-tl corner-br shadow-panel">
          <div className="px-6 py-5 border-b border-border">
            <h2 className="font-display text-sm text-text-primary tracking-wider">AUTHENTICATION</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {authError && (
              <div className="p-3 rounded border border-red/30 bg-red/10 text-red text-xs font-body flex items-center gap-2">
                <span>⚠</span> {authError}
              </div>
            )}

            {/* Email */}
            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">
                Email
              </label>
              <div className="relative">
                <input
                  type="email" required
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="you@example.com"
                  className={`input-cyber w-full rounded ${form.email ? 'pl-3.5' : 'pl-9'}`}
                  autoComplete="email"
                />
                {!form.email && (
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} required
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                  className={`input-cyber w-full rounded pr-10 ${form.password ? 'pl-3.5' : 'pl-9'}`}
                  autoComplete="current-password"
                />
                {!form.password && (
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-cyan transition-colors">
                  {showPass ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-cyber btn-cyber-primary py-3 text-xs font-bold tracking-widest
                         disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <><div className="w-3.5 h-3.5 border border-cyan/40 border-t-cyan rounded-full animate-spin" />Authenticating…</>
              ) : (
                <>Sign In →</>
              )}
            </button>

            <div className="neon-divider my-4" />

            <p className="text-center text-xs font-body text-text-muted">
              Don't have an account?{' '}
              <Link to="/register" className="text-cyan hover:text-cyan/80 transition-colors font-medium">
                Create one
              </Link>
            </p>
          </form>
        </div>

        {/* Demo credentials hint */}
        <div className="mt-4 glass-panel rounded border border-border/50 p-3 text-center">
          <p className="text-text-muted text-xs font-body">
            No account needed to browse public rooms.{' '}
            <Link to="/" className="text-cyan/70 hover:text-cyan transition-colors">Explore →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
