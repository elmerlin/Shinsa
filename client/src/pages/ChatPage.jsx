import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { streamChatbotAsk } from '../utils/api';

// Minimal markdown rendering: bold, inline code, code blocks, tables, and line breaks
function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="bg-piu-dark rounded-lg p-3 overflow-x-auto text-xs my-2 border border-piu-border/30">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Table detection
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s-:|]+\|/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={elements.length} className="overflow-x-auto my-2">
          <table className="text-xs border-collapse w-full">
            <thead>
              <tr>
                {tableLines[0].split('|').filter(c => c.trim()).map((cell, ci) => (
                  <th key={ci} className="border border-piu-border/40 px-2 py-1.5 text-left font-display font-bold text-gray-300 bg-piu-dark/60">
                    {formatInline(cell.trim())}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLines.slice(2).map((row, ri) => (
                <tr key={ri} className={ri % 2 ? 'bg-piu-dark/20' : ''}>
                  {row.split('|').filter(c => c.trim()).map((cell, ci) => (
                    <td key={ci} className="border border-piu-border/30 px-2 py-1.5 text-gray-400">
                      {formatInline(cell.trim())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#{1,3})\s/)[1].length;
      const text = line.replace(/^#{1,3}\s/, '');
      const className = level === 1 ? 'text-base font-bold' : level === 2 ? 'text-sm font-bold' : 'text-xs font-bold';
      elements.push(
        <p key={elements.length} className={`${className} font-display text-gray-200 mt-3 mb-1`}>
          {formatInline(text)}
        </p>
      );
      i++;
      continue;
    }

    // List items
    if (/^\s*[-*]\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s/, ''));
        i++;
      }
      elements.push(
        <ul key={elements.length} className="list-disc list-inside my-1 space-y-0.5">
          {listItems.map((item, li) => (
            <li key={li} className="text-gray-400 text-xs">{formatInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s/.test(line)) {
      const listItems = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ol key={elements.length} className="list-decimal list-inside my-1 space-y-0.5">
          {listItems.map((item, li) => (
            <li key={li} className="text-gray-400 text-xs">{formatInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={elements.length} className="text-gray-400 text-xs my-0.5">
        {formatInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

// Format inline markdown: bold, italic, code
function formatInline(text) {
  if (!text) return text;
  const parts = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);

    let firstMatch = null;
    let firstIndex = remaining.length;

    if (boldMatch && boldMatch.index < firstIndex) {
      firstMatch = { type: 'bold', match: boldMatch };
      firstIndex = boldMatch.index;
    }
    if (codeMatch && codeMatch.index < firstIndex) {
      firstMatch = { type: 'code', match: codeMatch };
      firstIndex = codeMatch.index;
    }

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    // Text before match
    if (firstIndex > 0) {
      parts.push(remaining.slice(0, firstIndex));
    }

    if (firstMatch.type === 'bold') {
      parts.push(<strong key={key++} className="font-bold text-gray-200">{firstMatch.match[1]}</strong>);
      remaining = remaining.slice(firstIndex + firstMatch.match[0].length);
    } else if (firstMatch.type === 'code') {
      parts.push(
        <code key={key++} className="bg-piu-dark px-1 py-0.5 rounded text-piu-accent text-[11px]">
          {firstMatch.match[1]}
        </code>
      );
      remaining = remaining.slice(firstIndex + firstMatch.match[0].length);
    }
  }

  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : parts;
}

const SUGGESTED_QUESTIONS = [
  "What are my top 10 Double scores?",
  "How many songs have I cleared?",
  "What Single Level 20+ songs have I passed?",
  "Who are the top 10 players by pumbility?",
];

export default function ChatPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentQuery, setCurrentQuery] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!user) navigate('/login');
  }, [user, navigate]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentQuery]);

  const sendMessage = async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isStreaming) return;

    setInput('');
    setIsStreaming(true);
    setCurrentQuery(null);

    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Build history for the API (only text content, not status/query metadata)
    const history = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    let assistantText = '';

    try {
      await streamChatbotAsk(trimmed, history, (event) => {
        if (event.type === 'text') {
          assistantText += event.content;
          setMessages([
            ...updatedMessages,
            { role: 'assistant', content: assistantText },
          ]);
        } else if (event.type === 'query') {
          setCurrentQuery(event.content);
        } else if (event.type === 'status') {
          // Show status in the current query area
          setCurrentQuery(event.content);
        } else if (event.type === 'error') {
          setMessages([
            ...updatedMessages,
            { role: 'assistant', content: `Something went wrong: ${event.content}` },
          ]);
        } else if (event.type === 'done') {
          setCurrentQuery(null);
        }
      });
    } catch (err) {
      setMessages([
        ...updatedMessages,
        { role: 'assistant', content: `Error: ${err.message}` },
      ]);
    }

    setIsStreaming(false);
    setCurrentQuery(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div className="px-3 sm:px-4 py-3 border-b border-piu-border/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-display font-bold text-gray-200">Shinsa Bot</h1>
            <p className="text-[10px] text-gray-500">Ask me anything about your scores, songs, and stats</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-piu-accent/20 to-purple-700/20 flex items-center justify-center border border-piu-accent/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-piu-accent/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-display font-bold text-gray-300">Welcome to Shinsa Bot</p>
              <p className="text-xs text-gray-500 mt-1">I can answer questions about your Pump It Up scores, songs, and statistics.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="text-left text-[11px] text-gray-400 px-3 py-2.5 rounded-xl border border-piu-border/30 hover:border-piu-accent/30 hover:bg-piu-dark/50 transition-all font-display"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === 'user'
                  ? 'bg-piu-accent/15 border border-piu-accent/20 text-gray-200'
                  : 'bg-piu-card border border-piu-border/30 text-gray-400'
              }`}
            >
              {msg.role === 'user' ? (
                <p className="text-xs">{msg.content}</p>
              ) : (
                <div className="prose-sm">{renderMarkdown(msg.content)}</div>
              )}
            </div>
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex justify-start">
            <div className="bg-piu-card border border-piu-border/30 rounded-2xl px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-piu-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-piu-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-piu-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                {currentQuery && (
                  <span className="text-[10px] text-gray-600 font-mono truncate max-w-[200px]">
                    Querying...
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* SQL query indicator */}
      {currentQuery && (
        <div className="px-3 sm:px-4 py-1.5 border-t border-piu-border/20">
          <div className="flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-piu-accent/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <code className="text-[10px] text-gray-600 font-mono truncate">{currentQuery}</code>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 sm:px-4 py-3 border-t border-piu-border/30">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your scores, songs, stats..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-piu-dark border border-piu-border rounded-xl text-xs py-2.5 px-3 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-piu-accent/50 transition-colors resize-none disabled:opacity-50"
            style={{ minHeight: '38px', maxHeight: '120px' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            className="p-2.5 rounded-xl bg-piu-accent hover:bg-piu-accent/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-gray-700 mt-1.5 text-center">
          Shinsa Bot can make mistakes. Verify important data.
        </p>
      </div>
    </div>
  );
}
