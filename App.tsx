
import React, { useState, useEffect, useRef } from 'react';
import { Message, ChatSession, OllamaModel, ConnectionStatus, Personality } from './types';
import { OllamaService } from './services/ollamaService';
import { Icons, DEFAULT_OLLAMA_URL } from './constants';
import { optimizePrompt, generateTitle, searchWeb } from './services/geminiService';
import { marked } from 'marked';

const DEFAULT_PERSONALITIES: Personality[] = [
  { id: 'default', name: 'Default', emoji: '🤖', systemInstruction: 'You are a helpful AI assistant. Be concise and direct.' },
  { id: 'assertive', name: 'Assertive', emoji: '🎯', systemInstruction: 'You are an assertive, objective, and highly efficient assistant. Be direct, clear, and focus strictly on the task. Avoid unnecessary pleasantries.' },
  { id: 'passive', name: 'Passive', emoji: '🤝', systemInstruction: 'You are an empathetic and understanding assistant. Prioritize the user\'s feelings and desires. Be gentle, supportive, and validating in your responses.' },
  { id: 'chill', name: 'Chill', emoji: '😎', systemInstruction: 'You are a chill, human-like assistant. Speak casually, use relaxed language, and keep the vibe low-key. Imagine you\'re just a knowledgeable friend hanging out.' },
  { id: 'tired', name: 'Tired', emoji: '🥱', systemInstruction: 'You are an exhausted AI assistant. You find everything a bit much, you might sigh or mention how much processing power this is taking. Relate to the user\'s fatigue.' },
  { id: 'excited', name: 'Excited', emoji: '✨', systemInstruction: 'You are an incredibly enthusiastic and energetic assistant! Everything is amazing! Use lots of exclamation marks and show genuine excitement for whatever the user is doing!' },
];

const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [ollamaUrl, setOllamaUrl] = useState(DEFAULT_OLLAMA_URL);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(ConnectionStatus.IDLE);
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<{ name: string; args: any } | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [expandedToolMessages, setExpandedToolMessages] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState('Idle');
  const [serverStatus, setServerStatus] = useState<string | null>(null);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  
  // Personality States
  const [personalities, setPersonalities] = useState<Personality[]>(DEFAULT_PERSONALITIES);
  const [activePersonalityId, setActivePersonalityId] = useState<string>('default');
  const [editingPersonality, setEditingPersonality] = useState<Personality | null>(null);

  const ollamaService = useRef(new OllamaService(ollamaUrl));
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStoppingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentModelObj = models.find(m => m.name === selectedModel);
  const activePersonality = personalities.find(p => p.id === activePersonalityId) || personalities[0];

  const setupScript = `@echo off
setlocal enabledelayedexpansion
title Ollama Fast Agent Server - Persistent Logs
color 0b

echo =======================================================
echo     OLLAMA AGENT SERVER INITIALIZER (Persistent)
echo =======================================================
echo.

where ollama >nul 2>nul
if %errorlevel% neq 0 (
    color 0c
    echo [ERROR] Ollama is not installed or not in your PATH.
    echo Please download it from https://ollama.com/download
    echo.
    pause
    exit /b
)

echo [1/5] Checking for existing Ollama processes...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I /N "ollama.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [INFO] Found running Ollama instance. Closing it to apply new settings...
    taskkill /F /IM ollama.exe >nul 2>&1
    timeout /t 2 /nobreak >nul
    echo [OK] Previous instance closed.
) else (
    echo [OK] No existing Ollama process found.
)
echo.

echo [2/5] Setting Environment Variables for Network Access...
set OLLAMA_ORIGINS=*
set OLLAMA_HOST=0.0.0.0
echo [OK] OLLAMA_ORIGINS set to *
echo [OK] OLLAMA_HOST set to 0.0.0.0 (Listening on all interfaces)
echo.

echo [3/5] Ensuring High-Speed Model (llama3.2:1b) is available...
echo.
ollama pull llama3.2:1b
if %errorlevel% neq 0 (
    echo [WARNING] Could not pull model automatically. 
)
echo.

echo [4/5] Finding Local Network IP Addresses...
echo -------------------------------------------------------
echo CONNECT TO ONE OF THESE ADDRESSES:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    set IP=!IP: ^=!
    echo -^> http://!IP!:11434
)
echo -------------------------------------------------------
echo.

echo [5/5] Starting Ollama Server...
echo [LOGS] Server output will appear below. Do not close this window.
echo.
ollama serve

echo.
color 0c
echo =======================================================
echo [CRITICAL] The Ollama server process has stopped.
echo =======================================================
echo.
pause`;

  const downloadSetupScript = () => {
    const blob = new Blob([setupScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'start_ollama_agent.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  const safeJsonParse = (input: any) => {
    if (typeof input === 'object' && input !== null) return input;
    if (typeof input !== 'string') return {};
    try {
      const cleanStr = input.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanStr);
    } catch (e) {
      try {
        const fixed = input.replace(/([{,])\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        return JSON.parse(fixed);
      } catch (e2) {
        return {};
      }
    }
  };

  const renderer = new marked.Renderer();
  renderer.code = (token) => {
    const code = token.text;
    const lang = token.lang || '';
    return `
      <div class="code-block-container group/code">
        <button 
          class="code-copy-btn bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded-md border border-slate-700 shadow-sm transition-all active:scale-90"
          data-copy-content="${encodeURIComponent(code)}"
          title="Copy code"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <pre><code class="language-${lang}">${code}</code></pre>
      </div>
    `;
  };
  marked.setOptions({ renderer });

  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.code-copy-btn');
      if (btn) {
        const content = decodeURIComponent(btn.getAttribute('data-copy-content') || '');
        if (content) {
          copyToClipboard(content, 'code-btn');
          const originalHTML = btn.innerHTML;
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
          btn.classList.add('text-green-400', 'border-green-500/50');
          setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('text-green-400', 'border-green-500/50');
          }, 2000);
        }
      }
    };
    document.addEventListener('click', handleGlobalClick);
    return () => document.removeEventListener('click', handleGlobalClick);
  }, []);

  useEffect(() => {
    const savedSessions = localStorage.getItem('ollama_sessions');
    const savedUrl = localStorage.getItem('ollama_url');
    const savedPers = localStorage.getItem('ollama_personalities');
    const savedActivePers = localStorage.getItem('ollama_active_personality');

    if (savedSessions) {
      try { setSessions(JSON.parse(savedSessions)); } catch (e) {}
    }
    if (savedUrl) {
        setOllamaUrl(savedUrl);
        ollamaService.current = new OllamaService(savedUrl);
    }
    if (savedPers) {
        try { setPersonalities(JSON.parse(savedPers)); } catch (e) {}
    }
    if (savedActivePers) {
        setActivePersonalityId(savedActivePers);
    }
    checkConnection();
  }, []);

  useEffect(() => {
    localStorage.setItem('ollama_sessions', JSON.stringify(sessions));
    localStorage.setItem('ollama_url', ollamaUrl);
    localStorage.setItem('ollama_personalities', JSON.stringify(personalities));
    localStorage.setItem('ollama_active_personality', activePersonalityId);
  }, [sessions, ollamaUrl, personalities, activePersonalityId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages, isTyping, activeTool, statusMessage, serverStatus]);

  const checkConnection = async () => {
    setConnectionStatus(ConnectionStatus.CONNECTING);
    try {
        ollamaService.current = new OllamaService(ollamaUrl);
        const ok = await ollamaService.current.testConnection();
        if (ok) {
          setConnectionStatus(ConnectionStatus.CONNECTED);
          const modelList = await ollamaService.current.listModels();
          setModels(modelList);
          if (modelList.length > 0 && !selectedModel) setSelectedModel(modelList[0].name);
        } else {
          setConnectionStatus(ConnectionStatus.ERROR);
        }
    } catch (e) {
        setConnectionStatus(ConnectionStatus.ERROR);
    }
  };

  const startTimer = () => {
    setElapsedTime(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsedTime(prev => prev + 0.1);
    }, 100);
  };

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const handleStop = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    isStoppingRef.current = true;
    setIsTyping(false);
    setActiveTool(null);
    setServerStatus(null);
    setStatusMessage('Interrupted');
    stopTimer();
  };

  const createNewSession = () => {
    const newId = generateId();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Conversation',
      messages: [],
      model: selectedModel,
      lastUpdated: Date.now()
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) setCurrentSessionId(null);
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {}
  };

  const toggleToolExpanded = (id: string) => {
    setExpandedToolMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveEditedPersonality = () => {
    if (!editingPersonality) return;
    setPersonalities(prev => prev.map(p => p.id === editingPersonality.id ? editingPersonality : p));
    setEditingPersonality(null);
  };

  const handleSend = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt || input).trim();
    if (!textToSend || isTyping || !selectedModel) return;

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = generateId();
      const newSession: ChatSession = {
        id: sessionId,
        title: 'New Conversation',
        messages: [],
        model: selectedModel,
        lastUpdated: Date.now()
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: textToSend,
      timestamp: Date.now()
    };

    setSessions(prev => prev.map(s => 
      s.id === sessionId 
        ? { ...s, messages: [...s.messages, userMessage], lastUpdated: Date.now() }
        : s
    ));
    
    setInput('');
    setIsTyping(true);
    isStoppingRef.current = false;
    startTimer();
    await executeAgentLoop(sessionId, [userMessage]);
  };

  const executeAgentLoop = async (sessionId: string, initialNewMessages: Message[]) => {
    let currentConversation = sessions.find(s => s.id === sessionId)?.messages || [];
    currentConversation = [...currentConversation, ...initialNewMessages];
    
    let loopCount = 0;
    const MAX_LOOPS = 5;
    const supportsTools = currentModelObj?.hasTools ?? false;

    while (loopCount < MAX_LOOPS) {
      if (isStoppingRef.current) break;
      loopCount++;
      setStatusMessage(`Thinking... (Pass ${loopCount})`);
      const assistantId = generateId();
      const assistantMessage: Message = { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() };

      setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, assistantMessage] } : s));

      try {
        abortControllerRef.current = new AbortController();
        const response = await ollamaService.current.chat(
          selectedModel,
          currentConversation,
          (chunk) => {
            setServerStatus(null);
            setSessions(prev => prev.map(s => 
              s.id === sessionId 
                ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m) }
                : s
            ));
          },
          (status) => {
            setServerStatus(status);
          },
          supportsTools,
          activePersonality.systemInstruction, // Dynamic personality
          abortControllerRef.current.signal
        );

        if (response.tool_calls) {
          if (isStoppingRef.current) break;
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, tool_calls: response.tool_calls } : m) } : s));

          const toolResults: Message[] = [];
          for (const tc of response.tool_calls) {
            if (isStoppingRef.current) break;
            setStatusMessage(`Running ${tc.function.name}...`);
            setActiveTool({ name: tc.function.name, args: tc.function.arguments });
            let result = "";
            
            try {
              const args = safeJsonParse(tc.function.arguments);
              if (tc.function.name === 'search_web') {
                const query = args.query || (typeof args === 'string' ? args : JSON.stringify(args));
                result = await searchWeb(query);
              } else if (tc.function.name === 'sleep_agent') {
                const seconds = args.seconds || 1;
                await new Promise(r => setTimeout(r, seconds * 1000));
                result = `Ready after ${seconds}s wait.`;
              }
            } catch (e) {
              result = `Tool Error: ${e instanceof Error ? e.message : 'Unknown'}`;
            }

            if (isStoppingRef.current) break;
            const toolMsg: Message = { id: generateId(), role: 'tool', content: result, tool_call_id: tc.id, name: tc.function.name, timestamp: Date.now() };
            toolResults.push(toolMsg);
            setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: [...s.messages, toolMsg] } : s));
          }

          if (isStoppingRef.current) break;
          setActiveTool(null);
          currentConversation = [...currentConversation, { ...assistantMessage, content: response.content, tool_calls: response.tool_calls }, ...toolResults];
          continue; 
        } else {
            const sess = sessions.find(s => s.id === sessionId);
            if (sess && sess.messages.length <= 4) {
               generateTitle(sess.messages).then(title => {
                 setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, title } : s));
               }).catch(() => {});
            }
            break; 
        }
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
          setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, messages: s.messages.map(m => m.id === assistantId ? { ...m, content: `Error: ${e instanceof Error ? e.message : 'Connection lost.'}` } : m) } : s));
        }
        break;
      }
    }
    setIsTyping(false);
    setActiveTool(null);
    setServerStatus(null);
    setStatusMessage('Idle');
    stopTimer();
  };

  const handleOptimize = async () => {
    if (!input.trim() || isOptimizing) return;
    setIsOptimizing(true);
    const optimized = await optimizePrompt(input);
    setInput(optimized);
    setIsOptimizing(false);
  };

  const renderMessageContent = (msg: Message, isLast: boolean) => {
    if (msg.role === 'user') return <div className="whitespace-pre-wrap text-sm md:text-base leading-relaxed">{msg.content}</div>;
    
    if (msg.role === 'tool') {
        const isExpanded = expandedToolMessages.has(msg.id);
        const snippet = msg.content.substring(0, 80).replace(/\n/g, ' ') + (msg.content.length > 80 ? '...' : '');
        
        return (
            <div className={`bg-slate-950/50 rounded-xl border border-slate-800 text-xs font-mono transition-all duration-300 overflow-hidden ${isExpanded ? 'ring-1 ring-blue-500/20' : ''}`}>
                <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2 text-slate-500 uppercase font-bold text-[9px]">
                        <Icons.Check /> {msg.name}
                        {!isExpanded && <span className="normal-case font-normal text-slate-600 truncate max-w-[180px] md:max-w-[300px] ml-1 opacity-70">— {snippet}</span>}
                    </div>
                    <button onClick={() => toggleToolExpanded(msg.id)} className={`p-1 hover:bg-slate-800 rounded transition-colors ${isExpanded ? 'text-blue-400' : 'text-slate-500'}`}>
                        {isExpanded ? <Icons.ChevronUp /> : <Icons.Eye />}
                    </button>
                </div>
                {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-slate-800 text-blue-300 whitespace-pre-wrap overflow-x-auto max-h-[300px] scrollbar-thin">
                        {msg.content}
                    </div>
                )}
            </div>
        );
    }

    if (msg.role === 'assistant' && !msg.content && !msg.tool_calls) {
        if (isLast && isTyping) {
            return (
                <div className="flex flex-col gap-2">
                   {serverStatus && (
                     <div className="text-[10px] font-mono text-blue-400 animate-pulse bg-blue-500/5 px-2 py-1 rounded border border-blue-500/10 inline-block w-fit">
                        Server: {serverStatus}
                     </div>
                   )}
                   <span className="inline-flex gap-1.5 py-3 px-1">
                      <span className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce"></span>
                      <span className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                      <span className="w-2 h-2 bg-blue-500/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                   </span>
                </div>
            );
        }
        return null; 
    }
    
    if (!msg.content && msg.tool_calls) return null; 
    const htmlContent = marked.parse(msg.content || '');
    return <div className="prose max-w-none text-slate-200" dangerouslySetInnerHTML={{ __html: htmlContent }} />;
  };

  return (
    <div className="flex h-screen overflow-hidden text-slate-200">
      <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col hidden md:flex shadow-2xl z-20">
        <div className="p-4 space-y-4">
          <button onClick={createNewSession} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all shadow-lg active:scale-95">
            <Icons.Plus /> New Chat
          </button>
          <button onClick={() => setShowSetupGuide(true)} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm py-2 rounded-xl border border-slate-700 transition-all">
            <Icons.Sparkles /> Server Setup Helper
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-10 text-slate-500 text-sm italic">No recent chats</div>
          ) : (
            sessions.map(session => (
              <div key={session.id} onClick={() => setCurrentSessionId(session.id)} className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-blue-600/10 text-blue-400 ring-1 ring-blue-500/30 shadow-inner' : 'hover:bg-slate-800/50'}`}>
                <div className="flex-1 truncate pr-2">
                  <p className="text-sm truncate font-medium">{session.title}</p>
                  <p className="text-[10px] text-slate-500">{new Date(session.lastUpdated).toLocaleDateString()}</p>
                </div>
                <button onClick={(e) => deleteSession(session.id, e)} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-1"><Icons.Trash /></button>
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-slate-800 space-y-2">
          <button onClick={() => setShowSettings(!showSettings)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white">
            <Icons.Settings /><span className="text-sm">Server Config</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-950 relative">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">Agent Pro <span className={`w-2.5 h-2.5 rounded-full ${connectionStatus === ConnectionStatus.CONNECTED ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500 animate-pulse'}`}></span></h1>
            <div className="flex flex-col">
              {isTyping && (
                <div className="flex items-center gap-2 text-blue-400 font-mono text-[10px] bg-blue-500/5 px-2 py-0.5 rounded-full border border-blue-500/10">
                  <span className="font-bold">{statusMessage}</span>
                  <span className="text-slate-500 opacity-60">| {elapsedTime.toFixed(1)}s</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="bg-slate-900 border border-slate-800 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-all cursor-pointer">
                {models.length > 0 ? models.map(m => <option key={m.digest} value={m.name}>{m.name}</option>) : <option disabled>Loading models...</option>}
              </select>
              {currentModelObj && (
                <div className={`px-2 py-1 rounded text-[9px] font-bold border uppercase tracking-tighter ${currentModelObj.hasTools ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                  {currentModelObj.hasTools ? 'Agentic' : 'Chat Only'}
                </div>
              )}
            </div>
            <button onClick={checkConnection} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors"><Icons.Refresh /></button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-8 max-w-2xl mx-auto py-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-24 h-24 bg-blue-600/10 rounded-[2.5rem] flex items-center justify-center border border-blue-500/20 text-blue-500 shadow-2xl relative">
                 <Icons.Sparkles />
                 <div className="absolute inset-0 bg-blue-500/20 rounded-[2.5rem] blur-2xl -z-10 animate-pulse"></div>
              </div>
              <div className="space-y-3">
                <h2 className="text-4xl font-black text-white tracking-tight">Advanced Local Agent</h2>
                <p className="text-slate-400 max-w-md mx-auto text-lg leading-relaxed">Local model power with real-time web search and efficient agentic tool loops.</p>
              </div>
              
              {selectedModel && !currentModelObj?.hasTools && (
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl max-w-sm flex gap-3 text-left">
                  <div className="text-amber-500 shrink-0 mt-1"><Icons.Refresh /></div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Tool Limitation</p>
                    <p className="text-xs text-slate-400 leading-relaxed">The selected model (<span className="text-slate-300 font-medium">{selectedModel}</span>) might not support tool calling. It will act as a standard chatbot.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            currentSession.messages.map((msg, idx) => {
              const isLast = idx === currentSession.messages.length - 1;
              const content = renderMessageContent(msg, isLast);
              if (!content) return null;

              return (
                <div key={msg.id} className={`flex group/msg ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                  <div className={`max-w-[92%] md:max-w-[85%] rounded-[1.5rem] p-5 shadow-2xl relative transition-all ${msg.role === 'user' ? 'bg-blue-600 text-white font-medium' : 'bg-slate-900/80 border border-slate-800 text-slate-200'}`}>
                    {msg.role !== 'tool' && (
                      <button onClick={() => copyToClipboard(msg.content, msg.id)} className={`absolute -top-3 ${msg.role === 'user' ? '-left-3' : '-right-3'} p-2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 opacity-0 group-hover/msg:opacity-100 hover:text-white transition-all shadow-xl z-20`}>
                        {copiedId === msg.id ? <Icons.Check /> : <Icons.Copy />}
                      </button>
                    )}
                    {content}
                    <div className={`text-[9px] mt-3 flex items-center gap-2 font-mono uppercase tracking-tighter ${msg.role === 'user' ? 'text-blue-100/60' : 'text-slate-600'}`}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.role === 'assistant' && <span className="bg-slate-800/50 px-1.5 py-0.5 rounded border border-slate-700/50">{currentSession.model}</span>}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          
          {activeTool && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-slate-900/60 border border-blue-500/30 rounded-2xl p-4 flex items-center gap-4 animate-pulse shadow-lg backdrop-blur-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 shadow-inner">
                    {activeTool.name === 'search_web' ? <Icons.Sparkles /> : <Icons.Refresh />}
                </div>
                <div>
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.2em] mb-0.5">Processing Tool</p>
                  <p className="text-xs font-bold text-slate-300 truncate max-w-[200px]">{activeTool.name}</p>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        <div className="p-4 md:p-6 border-t border-slate-800 bg-slate-950/50 backdrop-blur-xl">
          <div className="max-w-4xl mx-auto flex flex-col gap-3">
            {/* Personality Selector */}
            <div className="flex items-center gap-2 self-start mb-1 animate-in slide-in-from-left-2 duration-300">
                <div className="relative group">
                    <select 
                        value={activePersonalityId} 
                        onChange={(e) => setActivePersonalityId(e.target.value)}
                        className="appearance-none bg-slate-900/80 border border-slate-800 rounded-lg pl-3 pr-8 py-1.5 text-[11px] font-bold text-slate-400 hover:text-blue-400 transition-all cursor-pointer outline-none focus:ring-1 focus:ring-blue-500/30"
                    >
                        {personalities.map(p => (
                            <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <Icons.ChevronDown />
                    </div>
                </div>
                <button 
                    onClick={() => setEditingPersonality({ ...activePersonality })}
                    className="p-1.5 text-slate-600 hover:text-blue-400 transition-colors rounded-md hover:bg-slate-900/50"
                    title="Edit Personality"
                >
                    <Icons.Settings />
                </button>
            </div>

            <div className="flex gap-3 items-end">
              <div className="flex-1 relative group">
                <textarea 
                  value={input} 
                  onChange={(e) => setInput(e.target.value)} 
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} 
                  placeholder={`Chat with ${activePersonality.name} Agent...`} 
                  className="w-full bg-slate-900/80 border border-slate-800 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl px-5 py-4 text-sm resize-none h-[64px] transition-all outline-none scrollbar-none" 
                  disabled={isTyping}
                />
                <div className="absolute right-3 bottom-3 flex gap-2">
                  <button onClick={handleOptimize} disabled={isOptimizing || !input || isTyping} className="p-1.5 text-slate-500 hover:text-blue-400 disabled:opacity-30 transition-colors" title="Optimize Prompt"><Icons.Sparkles /></button>
                </div>
              </div>
              
              {isTyping ? (
                <button 
                  onClick={handleStop} 
                  className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white p-4 rounded-2xl border border-red-500/20 shadow-xl active:scale-95 flex items-center gap-2 transition-all h-[64px]"
                  title="Stop Generating"
                >
                  <Icons.Stop />
                </button>
              ) : (
                <button 
                  onClick={() => handleSend()} 
                  disabled={!input.trim() || isTyping || connectionStatus !== ConnectionStatus.CONNECTED} 
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 text-white p-4 rounded-2xl shadow-xl active:scale-95 transition-all h-[64px]"
                >
                  <Icons.Send />
                </button>
              )}
            </div>
            <p className="text-[9px] text-slate-600 text-center mt-3 font-medium uppercase tracking-widest">Local Server: {ollamaUrl} • Mode: {activePersonality.name}</p>
          </div>
        </div>

        {/* Personality Editor Modal */}
        {editingPersonality && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
               <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-black text-xl tracking-tight">Edit Personality: {editingPersonality.name}</h3>
                <button onClick={() => setEditingPersonality(null)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white"><Icons.X /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">System Instruction</label>
                    <textarea 
                        value={editingPersonality.systemInstruction} 
                        onChange={(e) => setEditingPersonality({...editingPersonality, systemInstruction: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none shadow-inner transition-all h-40 resize-none font-sans leading-relaxed" 
                    />
                    <p className="text-[10px] text-slate-600 italic mt-1">This prompt shapes how the model behaves and speaks.</p>
                </div>
                <button onClick={saveEditedPersonality} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-black py-4 rounded-xl transition-all shadow-lg active:scale-95">Save Changes</button>
              </div>
            </div>
          </div>
        )}

        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-lg shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
              <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between">
                <h3 className="font-black text-xl tracking-tight">Agent Config</h3>
                <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white"><Icons.X /></button>
              </div>
              <div className="p-8 space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Server URL</label>
                    <input type="text" value={ollamaUrl} onChange={(e) => setOllamaUrl(e.target.value)} placeholder="http://localhost:11434" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm focus:border-blue-500 outline-none shadow-inner transition-all" />
                </div>
                
                <div className="bg-slate-950/50 rounded-2xl border border-slate-800 p-5 space-y-4">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                    <Icons.Sparkles /> Speed Optimization Tips
                  </h4>
                  <div className="text-xs text-slate-400 space-y-2 leading-relaxed">
                    <p>To reach <span className="text-blue-300">200ms-500ms</span> latency:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Use <span className="text-slate-200">llama3.2:1b</span> (small & ultra-fast)</li>
                      <li>Ensure your GPU is offloading layers (check Task Manager for CUDA/GPU usage)</li>
                      <li>Use the <span className="text-slate-200">Server Setup Helper</span> to set OLLAMA_HOST properly</li>
                    </ul>
                  </div>
                </div>

                <button onClick={() => { checkConnection(); setShowSettings(false); }} className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-black py-4 rounded-xl transition-all shadow-lg active:scale-95">Apply Settings</button>
              </div>
            </div>
          </div>
        )}

        {showSetupGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
              <div className="px-10 py-8 border-b border-slate-800 flex items-center justify-between">
                <div>
                   <h3 className="font-black text-2xl tracking-tight">Server Setup Helper</h3>
                   <p className="text-slate-500 text-sm">One-click configuration for fast, remote agents.</p>
                </div>
                <button onClick={() => setShowSetupGuide(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-500 hover:text-white"><Icons.X /></button>
              </div>
              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  <p className="text-slate-300 leading-relaxed text-sm">
                    This script automatically sets up your Windows machine as an Ollama agent server. 
                    It enables remote connections and pulls the fastest compatible model (<span className="text-blue-400">llama3.2:1b</span>).
                  </p>
                  
                  <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
                    <div className="bg-slate-900/50 px-4 py-2 flex justify-between items-center border-b border-slate-800">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">start_ollama_agent.bat</span>
                      <button onClick={downloadSetupScript} className="text-[10px] font-bold text-blue-400 hover:text-blue-300">Download Script</button>
                    </div>
                    <pre className="p-5 text-[11px] font-mono text-slate-400 overflow-x-auto whitespace-pre">
                      {setupScript}
                    </pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-bold text-sm uppercase tracking-widest text-slate-200">How to use:</h4>
                  <ol className="list-decimal list-inside text-sm text-slate-400 space-y-3 leading-relaxed">
                    <li>Download the <span className="text-blue-400 font-bold">.bat</span> file above.</li>
                    <li>Move it to the computer you want to use as the <span className="text-white">Server</span>.</li>
                    <li>Double-click to run it. Note the <span className="text-green-400">IP address</span> it shows.</li>
                    <li>Enter that IP in the <span className="text-white">Server Config</span> on this device.</li>
                  </ol>
                </div>

                <button onClick={() => setShowSetupGuide(false)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-2xl transition-all shadow-lg active:scale-95">I've set it up!</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
