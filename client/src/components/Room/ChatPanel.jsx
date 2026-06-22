import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { selectChatMessages } from '../../store/roomSlice.js';
import { selectUser } from '../../store/authSlice.js';
import DOMPurify from 'dompurify';

const QUICK_EMOJIS = ['👍', '🔥', '✅', '❌', '🤔', '💡', '🚀', '😅'];

function ChatMessage({ msg, isMe }) {
  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <img
        src={msg.avatar || `https://api.dicebear.com/9.x/identicon/svg?seed=${msg.username}`}
        alt={msg.username}
        className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5"
        style={{ boxShadow: `0 0 0 1.5px ${msg.color || '#00d4ff'}66` }}
      />

      <div className={`flex flex-col gap-0.5 max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
        {/* Username + time */}
        <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
          <span className="text-2xs font-body" style={{ color: msg.color || '#8891c0' }}>
            {msg.username}
          </span>
          <span className="text-2xs text-text-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {time}
          </span>
        </div>

        {/* Message bubble */}
        <div
          className={`px-2.5 py-1.5 rounded text-sm font-body leading-relaxed break-words
            ${isMe
              ? 'bg-cyan/15 border border-cyan/25 text-text-primary rounded-tr-none'
              : 'bg-surface border border-subtle text-text-primary rounded-tl-none'}`}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(msg.text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
              .replace(/\n/g, '<br/>'),
          }}
        />
      </div>
    </div>
  );
}

export default function ChatPanel({ onSendMessage }) {
  const messages   = useSelector(selectChatMessages);
  const currentUser = useSelector(selectUser);
  const [input, setInput] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const endRef     = useRef(null);
  const listRef    = useRef(null);

  // Auto-scroll when new messages arrive (only if already at bottom)
  useEffect(() => {
    if (atBottom) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, atBottom]);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distFromBottom < 60);
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSendMessage(text);
    setInput('');
  }, [input, onSendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji) => {
    setInput((prev) => prev + emoji);
  };

  return (
    <div className="flex flex-col h-full bg-panel">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-display text-text-muted tracking-widest uppercase">
            Chat
          </span>
          <span className="badge badge-info text-2xs">{messages.length}</span>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto custom-scroll p-3 space-y-3"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-8">
            <div className="text-3xl opacity-30">💬</div>
            <p className="text-text-muted text-xs font-body text-center">
              No messages yet.<br />Say hello!
            </p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <ChatMessage
              key={`${msg.timestamp}-${i}`}
              msg={msg}
              isMe={String(msg.userId) === String(currentUser?._id)}
            />
          ))
        )}
        <div ref={endRef} />
      </div>

      {/* Scroll to bottom button */}
      {!atBottom && (
        <div className="flex justify-center py-1 border-t border-border/50">
          <button
            onClick={() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); setAtBottom(true); }}
            className="text-xs text-cyan hover:text-cyan/80 font-body flex items-center gap-1 px-2 py-0.5
                       bg-cyan/10 rounded border border-cyan/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            New messages
          </button>
        </div>
      )}

      {/* Quick emojis */}
      <div className="px-3 py-1.5 border-t border-border/50 flex gap-1 flex-shrink-0">
        {QUICK_EMOJIS.map((e) => (
          <button
            key={e}
            onClick={() => insertEmoji(e)}
            className="text-sm hover:scale-125 transition-transform duration-100"
            title={e}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Enter to send)"
            rows={1}
            maxLength={500}
            className="flex-1 input-cyber rounded text-sm resize-none min-h-[36px] max-h-[80px]
                       leading-relaxed py-2 custom-scroll"
            style={{ height: 'auto' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`p-2 rounded border transition-all duration-150 flex-shrink-0
              ${input.trim()
                ? 'border-cyan bg-cyan/15 text-cyan hover:bg-cyan/25 hover:shadow-neon-cyan'
                : 'border-border text-text-muted cursor-not-allowed opacity-50'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
        {input.length > 400 && (
          <div className={`text-2xs mt-1 text-right ${input.length > 490 ? 'text-red' : 'text-text-muted'}`}>
            {500 - input.length} chars remaining
          </div>
        )}
      </div>
    </div>
  );
}
