import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { selectIsAuthenticated, selectUser, logout } from '../store/authSlice.js';
import { fetchPublicRooms, createRoom, selectPublicRooms } from '../store/roomSlice.js';

/* ── Particle canvas ─────────────────────────────────────────────── */
function ParticleCanvas() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['#00d4ff', '#c77dff', '#00ff9d', '#ff3db4', '#ffd600'];
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: Math.random() * 0.5 + 0.1,
    }));

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0, 212, 255, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      // Draw particles
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.floor(p.alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}

/* ── Typing animation ────────────────────────────────────────────── */
function TypewriterText({ phrases }) {
  const [idx, setIdx] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const phrase = phrases[idx];
    const speed = deleting ? 40 : 80;
    const timer = setTimeout(() => {
      if (!deleting) {
        setText(phrase.slice(0, text.length + 1));
        if (text.length === phrase.length - 1) setTimeout(() => setDeleting(true), 1800);
      } else {
        setText(phrase.slice(0, text.length - 1));
        if (text.length === 0) { setDeleting(false); setIdx((i) => (i + 1) % phrases.length); }
      }
    }, speed);
    return () => clearTimeout(timer);
  }, [text, deleting, idx, phrases]);
  return (
    <span className="text-cyan text-glow-cyan">
      {text}<span className="animate-typing-cursor border-r-2 border-cyan ml-0.5">&nbsp;</span>
    </span>
  );
}

/* ── Live "someone is typing code" demo ──────────────────────────── */
// Types out the demo source character-by-character, then pauses and
// restarts — simulating a collaborator writing code in real time.
function TypewriterCode({ code, className = '' }) {
  const [shown, setShown] = useState('');
  const idxRef = useRef(0);

  useEffect(() => {
    let timer;
    const tick = () => {
      const i = idxRef.current;
      if (i <= code.length) {
        setShown(code.slice(0, i));
        idxRef.current = i + 1;
        // Vary cadence a touch so it feels human; pause on newlines.
        const justTyped = code[i - 1];
        const delay = justTyped === '\n' ? 120 : 18 + Math.random() * 28;
        timer = setTimeout(tick, delay);
      } else {
        // Hold the finished snippet, then restart the animation
        timer = setTimeout(() => { idxRef.current = 0; setShown(''); tick(); }, 2600);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [code]);

  return (
    <pre className={`font-code text-xs leading-relaxed overflow-hidden ${className}`} style={{ maxHeight: '220px' }}>
      <span
        style={{
          background: 'linear-gradient(120deg, #00ff9d, #00d4ff 55%, #c77dff)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}
      >
        {shown}
      </span>
      <span className="inline-block w-[7px] h-[13px] -mb-0.5 bg-cyan animate-typing-cursor" style={{ boxShadow: '0 0 6px #00d4ff' }} />
    </pre>
  );
}

/* ── Feature card ────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, color = '#00d4ff' }) {
  return (
    <div className="glass-panel glass-panel-hover rounded p-5 relative corner-tl corner-br transition-all duration-300 hover:-translate-y-1 group">
      <div className="text-3xl mb-3" style={{ filter: `drop-shadow(0 0 8px ${color}88)` }}>{icon}</div>
      <h3 className="font-display text-sm font-bold mb-2" style={{ color }}>{title}</h3>
      <p className="text-text-secondary text-xs font-body leading-relaxed">{desc}</p>
      <div className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
           style={{ background: `linear-gradient(90deg, transparent, ${color}66, transparent)` }} />
    </div>
  );
}

/* ── Room card ───────────────────────────────────────────────────── */
const LANG_COLORS = { javascript: '#ffd600', typescript: '#00d4ff', python: '#00ff9d', cpp: '#ff6b35', java: '#ff3d6a', go: '#00d4ff', rust: '#ff6b35' };
const LANG_ICONS  = { javascript: 'JS', typescript: 'TS', python: 'PY', cpp: 'C+', java: 'JV', go: 'GO', rust: 'RS' };

function RoomCard({ room, onJoin }) {
  const c = LANG_COLORS[room.language] || '#00d4ff';
  return (
    <div className="glass-panel glass-panel-hover rounded p-4 cursor-pointer group" onClick={() => onJoin(room.roomId)}>
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-body text-sm text-text-primary font-medium truncate flex-1 pr-2 group-hover:text-cyan transition-colors">
          {room.name}
        </h4>
        <span className="font-display text-xs font-bold flex-shrink-0 px-1.5 py-0.5 rounded border"
              style={{ color: c, borderColor: c + '44', background: c + '11' }}>
          {LANG_ICONS[room.language] || room.language.slice(0, 2).toUpperCase()}
        </span>
      </div>
      {room.description && (
        <p className="text-text-muted text-xs font-body mb-2 line-clamp-2 leading-relaxed">{room.description}</p>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={room.owner?.avatar} alt="" className="w-4 h-4 rounded-full" />
          <span className="text-text-muted text-xs font-body">{room.owner?.username}</span>
        </div>
        <div className="flex gap-1">
          {(room.tags || []).slice(0, 2).map((t) => (
            <span key={t} className="text-2xs bg-surface border border-border rounded px-1.5 py-0.5 text-text-muted">{t}</span>
          ))}
          {room.isPrivate && <span className="text-2xs text-amber">🔒</span>}
        </div>
      </div>
    </div>
  );
}

/* ── Create Room Modal ───────────────────────────────────────────── */
function CreateRoomModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: '', language: 'javascript', isPrivate: false,
    description: '', tags: '', password: '', confirmPassword: '',
  });
  const [loading, setLoading]   = useState(false);
  const [pwError, setPwError]   = useState('');
  const [showPw, setShowPw]     = useState(false);
  const LANGS = ['javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

  const handlePrivateToggle = () => {
    setForm(f => ({ ...f, isPrivate: !f.isPrivate, password: '', confirmPassword: '' }));
    setPwError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate password when private
    if (form.isPrivate) {
      if (!form.password || form.password.length < 4) {
        setPwError('Password must be at least 4 characters'); return;
      }
      if (form.password !== form.confirmPassword) {
        setPwError('Passwords do not match'); return;
      }
    }
    setPwError('');
    setLoading(true);
    try {
      await onCreate({
        name:        form.name,
        language:    form.language,
        isPrivate:   form.isPrivate,
        password:    form.isPrivate ? form.password : undefined,
        description: form.description,
        tags:        form.tags.split(',').map(t => t.trim()).filter(Boolean),
      });
      onClose();
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-void/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass-panel rounded border border-border w-full max-w-md relative corner-tl corner-br animate-slide-up shadow-panel">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-sm text-cyan tracking-wider">CREATE ROOM</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto custom-scroll">
          {/* Room Name */}
          <div>
            <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Room Name *</label>
            <input className="input-cyber w-full rounded" placeholder="My Coding Session"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required minLength={2} />
          </div>

          {/* Language */}
          <div>
            <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Language</label>
            <select className="input-cyber w-full rounded appearance-none"
              value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
              {LANGS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Description</label>
            <textarea className="input-cyber w-full rounded resize-none" rows={2} placeholder="What are you working on?"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-display text-text-muted tracking-wider uppercase block mb-1.5">Tags (comma-separated)</label>
            <input className="input-cyber w-full rounded" placeholder="algorithms, interview, practice"
              value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
          </div>

          {/* Private toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div className={`w-10 h-5 rounded-full border transition-all duration-200 relative flex-shrink-0
              ${form.isPrivate ? 'bg-amber/20 border-amber' : 'bg-surface border-border'}`}
              onClick={handlePrivateToggle}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200
                ${form.isPrivate ? 'left-5 bg-amber' : 'left-0.5 bg-text-muted'}`} />
            </div>
            <div>
              <span className="text-sm font-body text-text-secondary">Private room</span>
              {form.isPrivate && (
                <span className="text-2xs text-amber ml-2 font-body">🔒 Password required to join</span>
              )}
            </div>
          </label>

          {/* Password fields — only shown when isPrivate is on */}
          {form.isPrivate && (
            <div className="space-y-3 p-3 rounded border border-amber/20 bg-amber/5 animate-slide-up">
              <div>
                <label className="text-xs font-display text-amber/80 tracking-wider uppercase block mb-1.5">
                  Room Password *
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="input-cyber w-full rounded pr-9 border-amber/40 focus:border-amber"
                    placeholder="Min 4 characters"
                    value={form.password}
                    onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setPwError(''); }}
                    minLength={4}
                    required={form.isPrivate}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-amber transition-colors text-xs">
                    {showPw ? '👁' : '🔒'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-display text-amber/80 tracking-wider uppercase block mb-1.5">
                  Confirm Password *
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    className={`input-cyber w-full rounded border-amber/40 focus:border-amber
                      ${form.confirmPassword && form.confirmPassword !== form.password ? 'border-red/50' : ''}`}
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={e => { setForm(f => ({ ...f, confirmPassword: e.target.value })); setPwError(''); }}
                    required={form.isPrivate}
                  />
                  {form.confirmPassword && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm">
                      {form.confirmPassword === form.password ? '✅' : '❌'}
                    </span>
                  )}
                </div>
              </div>
              {pwError && (
                <p className="text-red text-2xs font-body">{pwError}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 btn-cyber text-xs py-2">Cancel</button>
            <button type="submit"
              disabled={loading || !form.name.trim() || (form.isPrivate && (!form.password || form.password !== form.confirmPassword))}
              className="flex-1 btn-cyber btn-cyber-green text-xs py-2 disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main Home component ─────────────────────────────────────────── */
const FEATURES = [
  { icon: '⚡', title: 'Real-Time Sync',     color: '#00d4ff', desc: 'Yjs CRDT algorithm ensures every keystroke syncs instantly across all collaborators with zero conflicts.' },
  { icon: '🚀', title: 'Live Code Execution', color: '#00ff9d', desc: 'Run code in Docker sandboxes supporting JavaScript, Python, C++, Java, Go and Rust securely in the cloud.' },
  { icon: '👁️', title: 'Live Cursors',        color: '#c77dff', desc: 'See exactly where each collaborator is editing in real time with color-coded cursors and username labels.' },
  { icon: '💬', title: 'Built-In Chat',        color: '#ff3db4', desc: 'Discuss code inline without switching apps. Chat messages are scoped to each room session.' },
  { icon: '🎯', title: 'Interview Mode',       color: '#ffd600', desc: 'Set a problem statement and start a timed interview session. Perfect for technical interviews and assessments.' },
  { icon: '📸', title: 'Auto Snapshots',       color: '#ff6b35', desc: 'Yjs document state is automatically snapshotted to MongoDB every 60 seconds so you never lose your work.' },
];

const TYPEWRITER_PHRASES = ['collaborate in real time.', 'run code instantly.', 'ace technical interviews.', 'ship faster together.', 'code without borders.'];

// ── Author's social links ────────────────────────────────────────
const SOCIAL_LINKS = [
  {
    label: 'LinkedIn', color: '#0a66c2',
    href: 'https://www.linkedin.com/in/mohit-sharma-27a6532b6',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-1 1.84-2.05 3.78-2.05 4.04 0 4.78 2.66 4.78 6.12V21H18v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H10z"/></svg>',
  },
  {
    label: 'GitHub', color: '#e8eaf6',
    href: 'https://github.com/MsParadox',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58l-.01-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.92 1.23 3.23 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22l-.01 3.29c0 .32.21.7.82.58A12 12 0 0024 12.5C24 5.87 18.63.5 12 .5z"/></svg>',
  },
  {
    label: 'LeetCode', color: '#ffa116',
    href: 'https://leetcode.com/u/ms_paradox78/',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M13.48 0a1.37 1.37 0 00-.96.4L7.2 5.8a5.4 5.4 0 00-1.6 3.85 5.4 5.4 0 001.6 3.84l5.3 5.32a1.37 1.37 0 001.95-1.92l-5.3-5.32a2.67 2.67 0 01-.79-1.92c0-.74.28-1.43.79-1.92l5.32-5.4A1.37 1.37 0 0013.48 0zm2.6 6.45a1.37 1.37 0 100 2.74h6.54a1.37 1.37 0 000-2.74zM9.9 13.9a1.37 1.37 0 00-.96 2.34l1.83 1.82a1.37 1.37 0 001.94-1.93l-1.83-1.83a1.37 1.37 0 00-.98-.4z"/></svg>',
  },
  {
    label: 'Codeforces', color: '#1f8acb',
    href: 'https://codeforces.com/profile/Msparadox',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M4.5 7.5A1.5 1.5 0 016 9v9a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 010 18V9a1.5 1.5 0 011.5-1.5zm9-4.5A1.5 1.5 0 0115 4.5V18a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 18V4.5A1.5 1.5 0 0110.5 3zm9 7.5A1.5 1.5 0 0124 12v6a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 0118 18v-6a1.5 1.5 0 011.5-1.5z"/></svg>',
  },
  {
    label: 'Email', color: '#ea4335',
    href: 'mailto:mohitsharma782828372@gmail.com',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M2 5a2 2 0 012-2h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2zm2 .4v.3l8 5 8-5V5.4l-8 5z"/></svg>',
  },
];

const CODE_DEMO = `// Real-time collaboration demo
// Multiple users editing simultaneously

function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  
  const mid   = Math.floor(arr.length / 2);
  const left  = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  
  return merge(left, right);
}

function merge(left, right) {
  const result = [];
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    result.push(left[i] <= right[j]
      ? left[i++] : right[j++]);
  }
  return [...result, ...left.slice(i), ...right.slice(j)];
}

console.log(mergeSort([5, 2, 8, 1, 9, 3]));
// → [1, 2, 3, 5, 8, 9]`;

export default function Home() {
  const navigate   = useNavigate();
  const dispatch   = useDispatch();
  const isAuth     = useSelector(selectIsAuthenticated);
  const user       = useSelector(selectUser);
  const rooms      = useSelector(selectPublicRooms);

  const [showCreate, setShowCreate] = useState(false);
  const [joinInput, setJoinInput]   = useState('');
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const LANGS = ['', 'javascript', 'typescript', 'python', 'cpp', 'java', 'go', 'rust'];

  useEffect(() => {
    setRoomsLoading(true);
    dispatch(fetchPublicRooms({ limit: 12 })).finally(() => setRoomsLoading(false));
  }, [dispatch]);

  const handleJoinRoom = useCallback((roomId) => {
    if (!isAuth) { toast.error('Please log in to join a room'); navigate('/login'); return; }
    navigate(`/room/${roomId}`);
  }, [isAuth, navigate]);

  const handleJoinInput = useCallback((e) => {
    e.preventDefault();
    const id = joinInput.trim();
    if (!id) return;
    const match = id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (match) handleJoinRoom(match[1]);
    else toast.error('Invalid room ID or URL');
  }, [joinInput, handleJoinRoom]);

  const handleCreateRoom = useCallback(async (formData) => {
    if (!isAuth) { navigate('/login'); return; }
    const result = await dispatch(createRoom(formData)).unwrap();
    toast.success('Room created!');
    navigate(`/room/${result.roomId}`);
  }, [isAuth, dispatch, navigate]);

  const filteredRooms = rooms.filter(r => {
    if (searchTerm && !r.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (langFilter && r.language !== langFilter) return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-void text-text-primary relative overflow-x-hidden">
      <ParticleCanvas />

      {/* ── Navbar ─────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 glass-panel">
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7">
            <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
            <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm shadow-neon-cyan" />
          </div>
          <span className="font-display text-base font-bold text-cyan tracking-[0.15em] text-glow-cyan">
            CODESYNC
          </span>
          <span className="hidden sm:inline text-cyan/80 text-xs font-display tracking-wider border border-cyan/30 rounded px-1.5 py-0.5 ml-1 bg-cyan/5">
            CRDT-POWERED
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/problems" className="hidden sm:inline text-sm font-body text-text-secondary hover:text-cyan transition-colors px-1">
            Problems
          </Link>
          <Link to="/learn" className="hidden sm:inline text-sm font-body text-text-secondary hover:text-cyan transition-colors px-1">
            Learn
          </Link>
          <Link to="/leaderboard" className="hidden sm:inline text-sm font-body text-text-secondary hover:text-cyan transition-colors px-1">
            Leaderboard
          </Link>
          {isAuth ? (
            <>
              <Link to="/profile" className="flex items-center gap-2 hover:text-cyan transition-colors group">
                <img src={user?.avatar} alt="" className="w-7 h-7 rounded-full ring-1 ring-border group-hover:ring-cyan/50 transition-all" />
                <span className="hidden sm:inline text-sm font-body text-text-secondary group-hover:text-cyan">{user?.username}</span>
              </Link>
              <button onClick={() => dispatch(logout())}
                className="btn-cyber text-xs py-1.5">Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/login"
                className="text-sm font-body text-text-secondary hover:text-cyan transition-colors px-2">
                Sign In
              </Link>
              <Link to="/register" className="btn-cyber btn-cyber-primary text-xs py-1.5">
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero Section ───────────────────────────────────────── */}
      <section className="relative z-10 px-6 pt-20 pb-16 text-center max-w-5xl mx-auto">
        {/* Glow orbs */}
        <div className="absolute top-10 left-1/4 w-64 h-64 bg-cyan/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-20 right-1/4 w-48 h-48 bg-purple/5 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 glass-panel rounded-full border border-cyan/20 animate-fade-in">
          <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
          <span className="text-xs font-body text-text-secondary">Conflict-free editing, powered by CRDTs</span>
        </div>

        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black mb-6 leading-tight animate-fade-in">
          <span className="block text-text-primary">Code Together,</span>
          <span className="block mt-2">
            <TypewriterText phrases={TYPEWRITER_PHRASES} />
          </span>
        </h1>

        <p className="text-text-secondary font-body text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in">
          A real-time collaborative code editor with live execution, remote cursors,
          built-in chat and interview mode. Pair, teach, and interview — together.
        </p>

        {/* ── Join / Create CTA ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center mb-6 animate-slide-up">
          <form onSubmit={handleJoinInput} className="flex gap-2 w-full sm:w-auto">
            <input
              value={joinInput}
              onChange={e => setJoinInput(e.target.value)}
              placeholder="Paste room ID or URL…"
              className="input-cyber rounded flex-1 sm:w-72 text-sm"
            />
            <button type="submit" className="btn-cyber btn-cyber-primary text-xs py-2 px-4 whitespace-nowrap flex-shrink-0">
              Join Room
            </button>
          </form>
          <div className="text-text-muted text-sm font-body">or</div>
          <button
            onClick={() => isAuth ? setShowCreate(true) : navigate('/register')}
            className="btn-cyber btn-cyber-green text-xs py-2.5 px-5 whitespace-nowrap"
          >
            + Create Room
          </button>
        </div>

        {/* ── Code demo preview ─────────────────────────────────── */}
        <div className="relative max-w-2xl mx-auto mt-12 animate-fade-in">
          <div className="glass-panel rounded border border-border/80 overflow-hidden shadow-panel">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-abyss">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-green/70" />
              </div>
              <span className="text-xs font-code text-text-muted ml-2">main.js — CodeSync</span>
              <div className="ml-auto flex items-center gap-3">
                {/* Fake remote cursors */}
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-cyan animate-pulse" style={{ boxShadow: '0 0 6px #00d4ff' }} />
                  <span className="text-2xs font-body" style={{ color: '#00d4ff' }}>alice</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-magenta animate-pulse" style={{ boxShadow: '0 0 6px #ff3db4', animationDelay: '0.3s' }} />
                  <span className="text-2xs font-body" style={{ color: '#ff3db4' }}>bob</span>
                </div>
              </div>
            </div>
            {/* Code content — live typing animation with gradient */}
            <div className="p-4 text-left overflow-hidden" style={{ minHeight: '220px' }}>
              <TypewriterCode code={CODE_DEMO} />
            </div>
          </div>
          {/* Glow under card */}
          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 bg-cyan/10 blur-xl rounded-full" />
        </div>
      </section>

      {/* ── Feature grid ───────────────────────────────────────── */}
      <section className="relative z-10 px-6 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <div className="neon-divider mb-6" />
          <h2 className="font-display text-2xl font-bold text-text-primary mb-2">
            Everything You Need to{' '}
            <span className="text-cyan text-glow-cyan">Collaborate</span>
          </h2>
          <p className="text-text-muted text-sm font-body">Production-grade features, engineered to scale.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => <FeatureCard key={f.title} {...f} />)}
        </div>
      </section>

      {/* ── Public Room Browser ────────────────────────────────── */}
      <section className="relative z-10 px-6 py-12 max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="font-display text-lg font-bold text-text-primary">
              Public <span className="text-cyan">Rooms</span>
            </h2>
            <p className="text-text-muted text-xs font-body mt-1">Join an active coding session</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search rooms…"
              className="input-cyber rounded text-sm py-1.5 w-40"
            />
            <select
              value={langFilter}
              onChange={e => setLangFilter(e.target.value)}
              className="input-cyber rounded text-sm py-1.5 appearance-none"
            >
              {LANGS.map(l => <option key={l} value={l}>{l || 'All Languages'}</option>)}
            </select>
            <button
              onClick={() => dispatch(fetchPublicRooms({ search: searchTerm, language: langFilter || undefined }))}
              className="btn-cyber text-xs py-1.5"
            >
              Refresh
            </button>
          </div>
        </div>

        {roomsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="glass-panel rounded p-4 animate-pulse">
                <div className="h-3 bg-border rounded mb-3 w-2/3" />
                <div className="h-2 bg-border rounded mb-2 w-full" />
                <div className="h-2 bg-border rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="glass-panel rounded p-10 text-center">
            <div className="text-4xl mb-3 opacity-30">🏠</div>
            <p className="text-text-muted text-sm font-body mb-4">No public rooms found.</p>
            <button onClick={() => isAuth ? setShowCreate(true) : navigate('/register')}
              className="btn-cyber btn-cyber-green text-xs py-2">
              Create the First Room
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((r) => <RoomCard key={r.roomId} room={r} onJoin={handleJoinRoom} />)}
          </div>
        )}
      </section>

      {/* ── Stack Banner ───────────────────────────────────────── */}
      <section className="relative z-10 px-6 py-12 bg-abyss border-y border-border/40">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-text-muted text-xs font-display tracking-widest uppercase mb-6">
            Engineered with a modern, battle-tested stack
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { name: 'React + Vite',   tier: 'Reactive UI',        color: '#00d4ff' },
              { name: 'Yjs CRDT',       tier: 'Conflict-free sync', color: '#c77dff' },
              { name: 'Socket.IO',      tier: 'Realtime transport', color: '#46e3b7' },
              { name: 'Node + Express', tier: 'API & WebSockets',   color: '#00ff9d' },
              { name: 'MongoDB',        tier: 'Persistence',        color: '#00ed64' },
              { name: 'Redis',          tier: 'Presence & Pub/Sub', color: '#ff3d6a' },
              { name: 'Docker',         tier: 'Sandboxed execution',color: '#00d4ff' },
              { name: 'Monaco',         tier: 'VS Code engine',     color: '#ffd600' },
            ].map((s) => (
              <div key={s.name} className="glass-panel rounded px-4 py-2.5 flex items-center gap-2.5 border border-border">
                <div className="w-2 h-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 6px ${s.color}88` }} />
                <div>
                  <div className="text-xs font-body text-text-secondary">{s.name}</div>
                  <div className="text-2xs font-body" style={{ color: s.color }}>{s.tier}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="relative z-10 px-6 py-8 border-t border-border/40 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="relative w-5 h-5">
            <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
            <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm" />
          </div>
          <span className="font-display text-xs text-cyan tracking-widest">CODESYNC</span>
        </div>
        <p className="text-text-muted text-xs font-body">
          Crafted with React, Node.js, Socket.IO, Yjs, Monaco &amp; Docker.
        </p>
        <p className="text-text-muted text-xs font-body mt-1.5">
          Designed &amp; built by{' '}
          <span className="text-cyan/80 font-medium">Mohit Sharma</span>
        </p>

        {/* ── Social links ─────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {SOCIAL_LINKS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target={s.href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noopener noreferrer"
              title={s.label}
              aria-label={s.label}
              className="w-9 h-9 rounded-full border border-border flex items-center justify-center
                         text-text-muted hover:text-cyan hover:border-cyan/50 hover:bg-cyan/10
                         transition-all duration-150"
              style={{ '--c': s.color }}
            >
              <span className="w-4 h-4 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: s.icon }} />
            </a>
          ))}
        </div>
      </footer>

      {showCreate && <CreateRoomModal onClose={() => setShowCreate(false)} onCreate={handleCreateRoom} />}
    </div>
  );
}
