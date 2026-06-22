import React, { useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  selectParticipants, selectRoomName, selectRoomId,
  selectIsOwner, selectUserRole, fetchRoomMembers,
} from '../../store/roomSlice.js';
import { selectUser } from '../../store/authSlice.js';
import { api } from '../../services/api.js';
import toast from 'react-hot-toast';

// ── Role badge ────────────────────────────────────────────────────
const ROLE_STYLES = {
  owner:  { label: 'Owner',  bg: 'bg-yellow-500/20', text: 'text-yellow-400',  icon: '👑' },
  editor: { label: 'Editor', bg: 'bg-blue-500/20',   text: 'text-blue-400',    icon: '✏️' },
  viewer: { label: 'Viewer', bg: 'bg-gray-500/20',   text: 'text-gray-400',    icon: '👁' },
};

function RoleBadge({ role }) {
  const style = ROLE_STYLES[role] || ROLE_STYLES.editor;
  return (
    <span
      className={`text-2xs font-body px-1.5 py-0.5 rounded-full ${style.bg} ${style.text} flex-shrink-0`}
      title={`Role: ${style.label}`}
    >
      {style.icon} {style.label}
    </span>
  );
}

// ── Role change dropdown (owner only) ─────────────────────────────
function RoleDropdown({ participant, roomId, onRoleChange }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const changeRole = useCallback(async (newRole) => {
    if (newRole === participant.role) { setOpen(false); return; }
    setLoading(true);
    try {
      await api.post(`/rooms/${roomId}/members`, {
        username: participant.username,
        role: newRole,
      });
      onRoleChange(participant.userId, newRole);
      toast.success(`${participant.username} is now a ${newRole}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change role');
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }, [participant, roomId, onRoleChange]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="text-2xs text-text-muted hover:text-text-secondary px-1 py-0.5 rounded transition-colors"
        title="Change role"
      >
        {loading ? '…' : '⚙'}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-6 z-20 bg-surface border border-border rounded-lg shadow-lg py-1 min-w-[110px]">
            {['editor', 'viewer'].map((role) => (
              <button
                key={role}
                onClick={() => changeRole(role)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-panel transition-colors ${
                  participant.role === role ? 'text-text-primary font-medium' : 'text-text-secondary'
                }`}
              >
                {ROLE_STYLES[role]?.icon} {ROLE_STYLES[role]?.label}
                {participant.role === role && ' ✓'}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────
function Avatar({ src, username, color, size = 'md' }) {
  const sz = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-8 h-8 text-sm';
  return (
    <div
      className={`${sz} rounded-full overflow-hidden flex-shrink-0 ring-2`}
      style={{ boxShadow: `0 0 0 2px ${color}44` }}
    >
      <img
        src={src || `https://api.dicebear.com/9.x/identicon/svg?seed=${username}`}
        alt={username}
        className="w-full h-full object-cover"
        onError={(e) => {
          e.target.style.display = 'none';
          e.target.parentNode.style.background = `${color}33`;
          e.target.parentNode.textContent = username?.[0]?.toUpperCase() || '?';
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────
export default function ParticipantPanel({ typingUsers = {}, socketHook }) {
  const dispatch     = useDispatch();
  const participants = useSelector(selectParticipants);
  const currentUser  = useSelector(selectUser);
  const roomName     = useSelector(selectRoomName);
  const roomId       = useSelector(selectRoomId);
  const isOwner      = useSelector(selectIsOwner);
  const myRole       = useSelector(selectUserRole);

  const handleRoleChange = useCallback((userId, newRole) => {
    // Broadcast via socket so other clients update instantly
    socketHook?.updateMemberRole(roomId, userId, newRole);
    // Refresh member list from server
    dispatch(fetchRoomMembers(roomId));
  }, [roomId, socketHook, dispatch]);

  // Role summary for the current user
  const myRoleStyle = ROLE_STYLES[myRole] || ROLE_STYLES.editor;

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-display text-text-muted tracking-widest uppercase">
            Participants
          </span>
          <span className="badge badge-info text-2xs">
            {participants.length}
          </span>
        </div>
        {roomName && (
          <p className="text-text-secondary text-xs font-body mt-1 truncate">{roomName}</p>
        )}
        {/* My role indicator */}
        {myRole && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-2xs text-text-muted font-body">Your role:</span>
            <span className={`text-2xs font-body ${myRoleStyle.text}`}>
              {myRoleStyle.icon} {myRoleStyle.label}
            </span>
          </div>
        )}
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto custom-scroll py-2">
        {participants.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <div className="text-text-muted text-xs font-body">No participants yet</div>
          </div>
        ) : (
          participants.map((p) => {
            const isMe     = String(p.userId) === String(currentUser?._id);
            const isTyping = typingUsers[p.userId];
            const pRole    = p.role || 'editor';
            // Owner can manage non-owner participants (but not themselves)
            const canManage = isOwner && !isMe && pRole !== 'owner';

            return (
              <div
                key={p.userId}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface/50 transition-colors duration-100 group"
              >
                {/* Avatar + online dot */}
                <div className="relative flex-shrink-0">
                  <Avatar src={p.avatar} username={p.username} color={p.color || '#00d4ff'} />
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-panel"
                    style={{ background: '#00ff9d', boxShadow: '0 0 6px #00ff9d88' }}
                  />
                </div>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-sm font-body truncate"
                      style={{ color: isMe ? '#e8eaf6' : p.color || '#8891c0' }}
                    >
                      {p.username}
                    </span>
                    {isMe && (
                      <span className="text-2xs text-text-muted font-body">(you)</span>
                    )}
                  </div>

                  {/* Role badge */}
                  <div className="mt-0.5">
                    <RoleBadge role={pRole} />
                  </div>

                  {/* Typing indicator */}
                  {isTyping && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map((i) => (
                          <div
                            key={i}
                            className="w-1 h-1 rounded-full bg-text-muted animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
                          />
                        ))}
                      </div>
                      <span className="text-2xs text-text-muted font-body">typing</span>
                    </div>
                  )}
                </div>

                {/* Owner: role management gear */}
                {canManage && (
                  <RoleDropdown
                    participant={p}
                    roomId={roomId}
                    onRoleChange={handleRoleChange}
                  />
                )}

                {/* Color swatch */}
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                  style={{ background: p.color || '#00d4ff', boxShadow: `0 0 6px ${p.color || '#00d4ff'}88` }}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Room ID display */}
      {roomId && (
        <div className="px-3 py-2.5 border-t border-border flex-shrink-0">
          <div className="text-2xs text-text-muted font-display uppercase tracking-widest mb-1">
            Room ID
          </div>
          <div className="font-code text-2xs text-text-secondary break-all leading-relaxed">
            {roomId.split('-')[0]}…
          </div>
        </div>
      )}
    </div>
  );
}
