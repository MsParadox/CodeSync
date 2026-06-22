import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { selectUser, selectIsAuthenticated, logout, updateUser } from '../store/authSlice.js';
import { api } from '../services/api.js';
import toast from 'react-hot-toast';

// Resize + compress an image File to a small square JPEG data URL so we
// can store avatars directly in MongoDB at zero infra cost (no S3/CDN).
function fileToAvatarDataURL(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => { img.src = reader.result; };
    img.onerror = () => reject(new Error('Invalid image'));
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Cover-crop to a centered square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    reader.readAsDataURL(file);
  });
}

const LANG_COLORS = { javascript:'#ffd600', typescript:'#00d4ff', python:'#00ff9d', cpp:'#ff6b35', java:'#ff3d6a', go:'#00d4ff', rust:'#ff6b35' };

function StatCard({ label, value, color = '#00d4ff', icon }) {
  return (
    <div className="glass-panel rounded p-4 border border-border hover:border-opacity-60 transition-all"
         style={{ '--hover-color': color }}>
      <div className="text-xl mb-1" style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}>{icon}</div>
      <div className="font-display text-xl font-bold" style={{ color, textShadow: `0 0 10px ${color}66` }}>
        {value}
      </div>
      <div className="text-text-muted text-xs font-body mt-0.5">{label}</div>
    </div>
  );
}

function LanguageBar({ language, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const color = LANG_COLORS[language] || '#00d4ff';
  return (
    <div className="flex items-center gap-3">
      <span className="font-code text-xs text-text-secondary w-20 flex-shrink-0 capitalize">{language}</span>
      <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out"
             style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}88` }} />
      </div>
      <span className="text-text-muted text-xs font-code w-8 text-right">{count}</span>
    </div>
  );
}

function RoomRow({ room }) {
  const navigate = useNavigate();
  const color = LANG_COLORS[room.language] || '#00d4ff';
  const timeAgo = (date) => {
    const diff = Date.now() - new Date(date);
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'just now';
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 hover:bg-surface/50 transition-colors group cursor-pointer"
         onClick={() => navigate(`/room/${room.roomId}`)}>
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}88` }} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-body text-text-primary group-hover:text-cyan transition-colors truncate">{room.name}</div>
        <div className="text-2xs text-text-muted font-body">{timeAgo(room.lastActiveAt)}</div>
      </div>
      <span className="text-xs font-code text-text-muted capitalize flex-shrink-0">{room.language}</span>
      <svg className="w-3 h-3 text-text-muted group-hover:text-cyan transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const currentUser  = useSelector(selectUser);
  const isAuth       = useSelector(selectIsAuthenticated);
  const dispatch     = useDispatch();
  const navigate     = useNavigate();

  const isOwnProfile = !username || username === currentUser?.username;
  const [profile, setProfile]       = useState(null);
  const [dashboard, setDashboard]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [editBio, setEditBio]       = useState(false);
  const [bioInput, setBioInput]     = useState('');
  const [activeTab, setActiveTab]   = useState('stats');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        if (isOwnProfile && isAuth) {
          const [{ data: dash }, { data: prof }] = await Promise.all([
            api.get('/users/me/dashboard'),
            api.get('/auth/me'),
          ]);
          setDashboard(dash);
          setProfile(prof.user);
          setBioInput(prof.user.bio || '');
        } else if (username) {
          const { data } = await api.get(`/users/${username}`);
          setProfile(data.user);
        } else if (currentUser) {
          setProfile(currentUser);
          setBioInput(currentUser.bio || '');
        }
      } catch {
        toast.error('Failed to load profile');
      } finally { setLoading(false); }
    };
    fetchData();
  }, [username, isAuth, isOwnProfile]);

  const handleAvatarPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';                 // allow re-selecting the same file
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 8 * 1024 * 1024)     { toast.error('Image must be under 8 MB'); return; }

    setUploadingAvatar(true);
    try {
      const dataUrl = await fileToAvatarDataURL(file);
      const { data } = await api.put('/users/me', { avatar: dataUrl });
      const newAvatar = data.user?.avatar || dataUrl;
      setProfile((p) => ({ ...p, avatar: newAvatar }));
      dispatch(updateUser({ avatar: newAvatar }));   // navbar + presence reflect it
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveBio = async () => {
    try {
      await api.put('/users/me', { bio: bioInput });
      setProfile(p => ({ ...p, bio: bioInput }));
      setEditBio(false);
      toast.success('Bio updated');
    } catch { toast.error('Failed to update bio'); }
  };

  if (loading) return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-cyan/20 border-t-cyan rounded-full animate-spin" />
        <span className="text-text-muted font-body text-sm">Loading profile…</span>
      </div>
    </div>
  );

  if (!profile) return (
    <div className="min-h-screen bg-void flex items-center justify-center">
      <div className="glass-panel rounded p-8 text-center">
        <div className="text-4xl mb-3 opacity-40">👤</div>
        <p className="text-text-muted font-body">User not found</p>
        <Link to="/" className="btn-cyber text-xs py-1.5 mt-4 inline-block">← Home</Link>
      </div>
    </div>
  );

  const langCounts = profile.stats?.languageCounts || {};
  const totalLangRuns = Object.values(langCounts).reduce((a, b) => a + b, 0);
  const myRooms  = dashboard?.myRooms || [];
  const recentEx = dashboard?.recentExecutions || [];
  const byDay    = dashboard?.executionsByDay || [];

  return (
    <div className="min-h-screen bg-void relative">
      <div className="absolute inset-0 bg-grid opacity-20 pointer-events-none" />

      {/* ── Navbar strip ──────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-border/40 glass-panel">
        <Link to="/" className="flex items-center gap-2">
          <div className="relative w-6 h-6">
            <div className="absolute inset-0 bg-cyan/20 rotate-45 rounded-sm" />
            <div className="absolute inset-1 bg-cyan rotate-45 rounded-sm" />
          </div>
          <span className="font-display text-sm font-bold text-cyan tracking-widest">CODESYNC</span>
        </Link>
        <div className="flex gap-3">
          {isAuth && isOwnProfile && (
            <button onClick={() => { dispatch(logout()); navigate('/'); }}
              className="btn-cyber text-xs py-1.5">Sign Out</button>
          )}
        </div>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">

        {/* ── Profile header ──────────────────────────────────── */}
        <div className="glass-panel rounded border border-border p-6 mb-6 flex flex-col sm:flex-row items-center sm:items-start gap-5 relative corner-tl corner-br">
          {/* Avatar */}
          <div className="relative flex-shrink-0 group">
            <img src={profile.avatar} alt={profile.username}
                 className="w-20 h-20 rounded-full ring-2 ring-cyan/30 shadow-neon-cyan object-cover" />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green border-2 border-panel"
                 style={{ boxShadow: '0 0 8px #00ff9d' }} />

            {isOwnProfile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarPick}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  title="Change profile picture"
                  className="absolute inset-0 rounded-full flex items-center justify-center
                             bg-void/60 opacity-0 group-hover:opacity-100 transition-opacity
                             text-cyan disabled:opacity-100"
                >
                  {uploadingAvatar ? (
                    <div className="w-5 h-5 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
                  ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
              <h1 className="font-display text-xl font-bold text-text-primary">{profile.username}</h1>
              {profile.stats?.favouriteLanguage && (
                <span className="badge text-2xs" style={{
                  color: LANG_COLORS[profile.stats.favouriteLanguage] || '#00d4ff',
                  borderColor: (LANG_COLORS[profile.stats.favouriteLanguage] || '#00d4ff') + '44',
                  background:  (LANG_COLORS[profile.stats.favouriteLanguage] || '#00d4ff') + '11',
                }}>
                  ★ {profile.stats.favouriteLanguage}
                </span>
              )}
            </div>
            <p className="text-text-muted text-xs font-body mt-0.5">
              Member since {new Date(profile.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
            </p>

            {/* Bio */}
            {editBio ? (
              <div className="mt-2 flex gap-2">
                <input value={bioInput} onChange={e => setBioInput(e.target.value)}
                  maxLength={200} className="input-cyber rounded text-xs flex-1 py-1" placeholder="Tell the world about yourself…" />
                <button onClick={saveBio} className="btn-cyber btn-cyber-green text-xs py-1">Save</button>
                <button onClick={() => setEditBio(false)} className="btn-cyber text-xs py-1">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-2 justify-center sm:justify-start">
                <p className="text-text-secondary text-sm font-body">{profile.bio || 'No bio yet.'}</p>
                {isOwnProfile && (
                  <button onClick={() => setEditBio(true)}
                    className="text-text-muted hover:text-cyan text-xs transition-colors flex-shrink-0">✏</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats row ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard icon="✅" label="Problems Solved" value={(profile.solvedProblems || []).length} color="#00ff9d" />
          <StatCard icon="🏠" label="Rooms Created"   value={profile.stats?.roomsCreated || 0}     color="#00d4ff" />
          <StatCard icon="▶"  label="Total Runs"      value={profile.stats?.totalExecutions || 0}  color="#c77dff" />
          <StatCard icon="⏱"  label="Avg Runtime"     value={profile.stats?.totalExecutions > 0 ? `${Math.round((profile.stats.totalRuntime || 0) / profile.stats.totalExecutions)}ms` : '—'} color="#ffd600" />
        </div>

        {/* ── Problems solved by difficulty + streak ──────────── */}
        {(profile.solvedProblems || []).length > 0 && (
          <div className="glass-panel rounded border border-border p-4 mb-6 flex items-center justify-around flex-wrap gap-4">
            {[
              { k: 'easy',   label: 'Easy',   color: '#00ff9d' },
              { k: 'medium', label: 'Medium', color: '#ffd600' },
              { k: 'hard',   label: 'Hard',   color: '#ff3d6a' },
            ].map((d) => (
              <div key={d.k} className="text-center">
                <div className="font-display text-xl font-bold" style={{ color: d.color }}>
                  {profile.stats?.solvedByDifficulty?.[d.k] || 0}
                </div>
                <div className="text-2xs text-text-muted font-body uppercase tracking-widest">{d.label}</div>
              </div>
            ))}
            <div className="text-center">
              <div className="font-display text-xl font-bold text-amber">🔥 {profile.streak?.current || 0}</div>
              <div className="text-2xs text-text-muted font-body uppercase tracking-widest">Day Streak</div>
            </div>
            <div className="text-center">
              <div className="font-display text-xl font-bold text-cyan">{profile.streak?.max || 0}</div>
              <div className="text-2xs text-text-muted font-body uppercase tracking-widest">Best Streak</div>
            </div>
          </div>
        )}

        {/* ── Solved problems chips ───────────────────────────── */}
        {(profile.solvedProblems || []).length > 0 && (
          <div className="glass-panel rounded border border-border p-4 mb-6">
            <h3 className="font-display text-xs text-text-muted tracking-widest uppercase mb-3">
              Solved Problems ({profile.solvedProblems.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {profile.solvedProblems.map((slug) => (
                <Link key={slug} to={`/problems/${slug}`}
                  className="text-2xs font-code px-2 py-1 rounded border border-green/30 bg-green/5 text-green/90 hover:bg-green/15 transition-colors">
                  ✓ {slug}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs ───────────────────────────────────────────── */}
        <div className="flex border-b border-border mb-6 gap-1">
          {[
            { id: 'stats',   label: 'Language Stats' },
            { id: 'rooms',   label: `My Rooms (${myRooms.length})` },
            { id: 'history', label: 'Run History' },
          ].filter(t => isOwnProfile || t.id === 'stats').map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 text-xs font-display tracking-wider uppercase border-b-2 -mb-px transition-colors
                ${activeTab === t.id ? 'border-cyan text-cyan' : 'border-transparent text-text-muted hover:text-text-secondary'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Stats tab ──────────────────────────────────────── */}
        {activeTab === 'stats' && (
          <div className="glass-panel rounded border border-border p-5">
            <h3 className="font-display text-xs text-text-muted tracking-widest uppercase mb-4">Language Distribution</h3>
            {totalLangRuns === 0 ? (
              <p className="text-text-muted text-sm font-body text-center py-8">No executions yet. Run some code!</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(langCounts)
                  .filter(([, count]) => count > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([lang, count]) => (
                    <LanguageBar key={lang} language={lang} count={count} total={totalLangRuns} />
                  ))}
              </div>
            )}
            {byDay.length > 0 && (
              <div className="mt-6">
                <h3 className="font-display text-xs text-text-muted tracking-widest uppercase mb-3">Last 7 Days</h3>
                <div className="flex items-end gap-2 h-20">
                  {byDay.map((day) => {
                    const maxCount = Math.max(...byDay.map(d => d.count), 1);
                    const height = (day.count / maxCount) * 100;
                    return (
                      <div key={day._id} className="flex-1 flex flex-col items-center gap-1" title={`${day._id}: ${day.count} runs`}>
                        <div className="w-full rounded-t relative group" style={{
                          height: `${Math.max(height, 4)}%`,
                          background: 'linear-gradient(180deg, #00d4ff, #00d4ff44)',
                          boxShadow: '0 0 6px #00d4ff44',
                        }}>
                          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xs text-cyan opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                            {day.count}
                          </div>
                        </div>
                        <span className="text-2xs text-text-muted font-code">{day._id?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Rooms tab ──────────────────────────────────────── */}
        {activeTab === 'rooms' && isOwnProfile && (
          <div className="glass-panel rounded border border-border">
            {myRooms.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl mb-3 opacity-30">🏠</div>
                <p className="text-text-muted text-sm font-body mb-4">You haven't created any rooms yet.</p>
                <Link to="/" className="btn-cyber btn-cyber-green text-xs py-2">Create Room</Link>
              </div>
            ) : myRooms.map(r => <RoomRow key={r.roomId} room={r} />)}
          </div>
        )}

        {/* ── History tab ────────────────────────────────────── */}
        {activeTab === 'history' && isOwnProfile && (
          <div className="glass-panel rounded border border-border">
            {recentEx.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-3xl mb-3 opacity-30">▶</div>
                <p className="text-text-muted text-sm font-body">No executions yet.</p>
              </div>
            ) : recentEx.map((ex, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ex.status === 'success' ? 'bg-green' : 'bg-red'}`}
                     style={{ boxShadow: `0 0 6px ${ex.status === 'success' ? '#00ff9d' : '#ff3d6a'}88` }} />
                <span className="badge text-2xs capitalize" style={{ minWidth: 24 }}>{ex.language}</span>
                <span className="text-xs font-code text-text-muted flex-1 truncate">
                  {new Date(ex.ranAt).toLocaleString()}
                </span>
                <span className={`text-xs font-code ${ex.status === 'success' ? 'text-green' : 'text-red'}`}>
                  {ex.executionTimeMs}ms
                </span>
                <span className={`badge ${ex.status === 'success' ? 'badge-success' : 'badge-error'} text-2xs`}>
                  {ex.exitCode === 0 ? 'OK' : `exit ${ex.exitCode}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
