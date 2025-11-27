import React, { useState, useEffect, useRef } from 'react';
import { InferService, Message, Session } from './services/api';
import { Send, Terminal, Activity, Plus, MessageSquare, User, Bot, Settings, ChevronRight, Sparkles, ThumbsUp, ThumbsDown } from 'lucide-react';

const Sidebar = ({ 
  sessions, 
  onSelect, 
  currentId,
  onNewChat 
}: { 
  sessions: Session[], 
  onSelect: (id: string) => void,
  currentId: string,
  onNewChat: () => void
}) => (
  <div className="w-[280px] bg-slate-950 text-slate-400 flex flex-col h-full border-r border-slate-800/50 flex-shrink-0 transition-all duration-300">
    <div className="h-16 flex items-center px-6 border-b border-slate-800/50">
      <div className="flex items-center gap-2.5 text-slate-100">
        <div className="bg-indigo-600 p-1.5 rounded-md shadow-lg shadow-indigo-900/20">
          <Terminal size={18} strokeWidth={2.5} />
        </div>
        <span className="font-medium tracking-tight text-[15px]">PocketLLM</span>
      </div>
    </div>
    <div className="p-4">
      <button 
        onClick={onNewChat}
        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-200 px-4 py-3 rounded-xl transition-all border border-slate-800 shadow-sm group"
      >
        <Plus size={16} className="group-hover:text-indigo-400 transition-colors" />
        <span className="text-sm font-medium">New Chat</span>
      </button>
    </div>
    <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5">
      <div className="px-3 py-3 text-[11px] font-bold text-slate-600 uppercase tracking-wider">History</div>
      {sessions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all ${
            s.id === currentId 
              ? 'bg-slate-800/60 text-slate-100' 
              : 'hover:bg-slate-900 text-slate-500 hover:text-slate-300'
          }`}
        >
          <MessageSquare size={14} className={s.id === currentId ? 'text-indigo-400' : 'opacity-0 group-hover:opacity-50 transition-opacity'} />
          <span className="truncate flex-1 text-left font-medium">{s.title}</span>
        </button>
      ))}
    </div>
    <div className="p-4 border-t border-slate-800/50 bg-slate-950">
      <div className="flex items-center gap-3 px-2">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">U</div>
        <div className="flex-1 overflow-hidden">
          <div className="text-xs font-medium text-slate-200 truncate">User Account</div>
          <div className="text-[10px] text-slate-600 truncate">Pro Plan</div>
        </div>
      </div>
    </div>
  </div>
);

export default function App() {
  const [sessionId, setSessionId] = useState<string>(`session-${Date.now()}`);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [metricsData, setMetricsData] = useState<any>(null);
  const [maxTokens, setMaxTokens] = useState(100);
  const [temp, setTemp] = useState(0.7);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => { loadHistory(); }, [sessionId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadSessions = async () => {
    const list = await InferService.getSessions();
    setSessions(list);
  };

  const loadHistory = async () => {
    const msgs = await InferService.getHistory(sessionId);
    setMessages(msgs);
  };

  const loadMetrics = async () => {
    const m = await InferService.getMetrics();
    setMetricsData(m);
    setShowMetrics(true);
  };

  const handleNewChat = () => {
    setSessionId(`session-${Date.now()}`);
    setMessages([]);
  };

  const handleVote = async (msgId: number | undefined, vote: 'up' | 'down') => {
    if (!msgId) return;
    // Optimistic UI update
    setMessages(prev => prev.map(m => 
      m.id === msgId ? { ...m, feedback: vote } : m
    ));
    await InferService.submitFeedback(msgId, vote);
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const userMsg = input;
    setInput("");
    
    // Optimistic user message
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsStreaming(true);

    let assistantContent = "";
    const evtSource = InferService.streamResponse(
      userMsg, sessionId, { maxTokens, temp },
      (token) => {
        assistantContent += token;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, content: assistantContent }];
          } else {
            return [...prev, { role: 'assistant', content: assistantContent }];
          }
        });
      },
      () => {
        setIsStreaming(false);
        evtSource.close();
        loadSessions();
        // IMPORTANT: Reload history to get the new message ID from DB so we can vote on it
        loadHistory(); 
      },
      (err) => {
        setIsStreaming(false);
        evtSource.close();
        loadHistory();
      }
    );
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white">
      <Sidebar sessions={sessions} onSelect={setSessionId} currentId={sessionId} onNewChat={handleNewChat} />
      <div className="flex-1 flex flex-col relative h-full min-w-0">
        <header className="h-16 flex items-center justify-between px-6 border-b border-slate-100 bg-white/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-slate-500">Session ID:</span>
            <span className="text-[13px] font-mono bg-slate-50 px-2 py-1 rounded text-slate-700 border border-slate-100">{sessionId.split('-')[1] || 'New'}</span>
          </div>
          <button onClick={loadMetrics} className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-medium text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all">
            <Activity size={14} />
            <span>Metrics</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="max-w-3xl mx-auto py-10 space-y-10">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                  <Sparkles size={32} className="text-indigo-500" />
                </div>
                <h2 className="text-2xl font-semibold text-slate-800 mb-2">Welcome to PocketLLM</h2>
                <p className="text-slate-500 text-center max-w-md text-sm leading-relaxed">Experience our architecture-first language model portal.</p>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={idx} className={`flex gap-6 ${m.role === 'user' ? 'justify-end' : 'justify-start'} group`}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot size={18} className="text-indigo-600" />
                  </div>
                )}
                <div className={`flex flex-col max-w-[75%] ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{m.role === 'user' ? 'You' : 'PocketLLM'}</span>
                  </div>
                  <div className={`px-6 py-4 rounded-2xl text-[15px] leading-7 shadow-sm transition-all ${
                    m.role === 'user' ? 'bg-slate-900 text-white rounded-tr-sm shadow-slate-200' : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm shadow-sm'
                  }`}>
                    {m.content}
                  </div>
                  
                  {/* Feedback Controls (Departure Feature) */}
                  {m.role === 'assistant' && m.id && (
                    <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleVote(m.id, 'up')}
                        className={`p-1.5 rounded-full hover:bg-slate-100 transition-colors ${m.feedback === 'up' ? 'text-green-600 bg-green-50' : 'text-slate-400'}`}
                        title="Good response"
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button 
                        onClick={() => handleVote(m.id, 'down')}
                        className={`p-1.5 rounded-full hover:bg-slate-100 transition-colors ${m.feedback === 'down' ? 'text-red-600 bg-red-50' : 'text-slate-400'}`}
                        title="Bad response"
                      >
                        <ThumbsDown size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {m.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                    <User size={18} className="text-slate-500" />
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} className="h-4" />
          </div>
        </div>

        <div className="p-6 bg-white/80 backdrop-blur-lg border-t border-slate-100">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex justify-end gap-3">
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span>Max Tokens</span>
                  <input type="number" value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))} className="w-8 bg-transparent text-right text-slate-800 focus:outline-none border-b border-transparent focus:border-indigo-300 transition-colors" />
                </div>
                <div className="w-px h-3 bg-slate-200"></div>
                <div className="flex items-center gap-1.5">
                  <span>Temp</span>
                  <input type="number" step="0.1" value={temp} onChange={e => setTemp(Number(e.target.value))} className="w-6 bg-transparent text-right text-slate-800 focus:outline-none border-b border-transparent focus:border-indigo-300 transition-colors" />
                </div>
              </div>
            </div>
            <div className="relative group shadow-xl shadow-slate-200/60 rounded-2xl">
              <input 
                className="w-full bg-white border-0 ring-1 ring-slate-200 rounded-2xl px-5 py-4 pr-16 text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 transition-all text-[15px]"
                placeholder="Message PocketLLM..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isStreaming}
                autoFocus
              />
              <button onClick={handleSend} disabled={isStreaming || !input.trim()} className="absolute right-2 top-2 bottom-2 w-10 bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-all flex items-center justify-center shadow-md">
                {isStreaming ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </div>

        {showMetrics && (
          <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={() => setShowMetrics(false)}>
            <div className="bg-white p-8 rounded-3xl shadow-2xl w-[420px] border border-slate-100 transform scale-100 transition-all" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">System Metrics</h3>
                  <p className="text-xs text-slate-500">Real-time architecture performance</p>
                </div>
                <div className="p-2 bg-indigo-50 rounded-full">
                  <Activity size={20} className="text-indigo-600" />
                </div>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl font-mono text-xs text-slate-600 border border-slate-100 overflow-hidden">
                <pre>{JSON.stringify(metricsData, null, 2)}</pre>
              </div>
              <button onClick={() => setShowMetrics(false)} className="mt-6 w-full bg-slate-900 text-white py-3.5 rounded-xl hover:bg-slate-800 transition-colors font-medium text-sm shadow-lg shadow-slate-200">
                Close Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}