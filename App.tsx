
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Settings, Message, ConnectionStatus, OllamaModel } from './types';
import { OllamaService } from './services/ollamaService';
import { getGeminiHelp } from './services/geminiService';
import { 
  Server, 
  Settings as SettingsIcon, 
  MessageSquare, 
  ShieldCheck, 
  Send, 
  RefreshCw, 
  AlertCircle,
  Terminal,
  Cpu,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

const STORAGE_KEY = 'ollama_hub_settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'settings' | 'security' | 'help'>('chat');
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      endpoint: 'http://localhost:11434',
      selectedModel: '',
      systemPrompt: 'You are a helpful AI assistant.'
    };
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [geminiAdvice, setGeminiAdvice] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ollama = useRef<OllamaService | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    ollama.current = new OllamaService(settings.endpoint);
    refreshModels();
  }, [settings.endpoint]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const refreshModels = async () => {
    if (!ollama.current) return;
    setStatus(ConnectionStatus.CONNECTING);
    try {
      const fetchedModels = await ollama.current.listModels();
      setModels(fetchedModels);
      if (fetchedModels.length > 0 && !settings.selectedModel) {
        setSettings(prev => ({ ...prev, selectedModel: fetchedModels[0].name }));
      }
      setStatus(ConnectionStatus.CONNECTED);
    } catch (err) {
      setStatus(ConnectionStatus.ERROR);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isTyping || !ollama.current || !settings.selectedModel) return;

    const userMsg: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    const assistantMsg: Message = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      model: settings.selectedModel
    };

    setMessages(prev => [...prev, assistantMsg]);

    try {
      let currentContent = '';
      await ollama.current.chat(
        settings.selectedModel,
        [
          { role: 'system', content: settings.systemPrompt, timestamp: Date.now() },
          ...messages,
          userMsg
        ],
        (chunk) => {
          currentContent += chunk;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...assistantMsg, content: currentContent };
            return next;
          });
        }
      );
    } catch (error) {
      setMessages(prev => [
        ...prev,
        { role: 'system', content: `Error: ${(error as Error).message}`, timestamp: Date.now() }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const askGeminiForAdvice = async () => {
    setGeminiAdvice("Consulting Gemini Expert...");
    const advice = await getGeminiHelp(`User is trying to connect Ollama to ai.guythatlives.net. Current endpoint: ${settings.endpoint}. Status: ${status}. Current Models: ${models.map(m => m.name).join(', ')}. Provide technical troubleshooting steps or optimization tips.`);
    setGeminiAdvice(advice);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Sidebar */}
      <nav className="w-16 md:w-64 border-r border-slate-800 bg-slate-900/50 flex flex-col p-4 space-y-4">
        <div className="flex items-center space-x-3 mb-8 px-2">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Cpu className="text-white" size={24} />
          </div>
          <span className="hidden md:block font-bold text-lg tracking-tight">Ollama Hub</span>
        </div>

        <button 
          onClick={() => setActiveTab('chat')}
          className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${activeTab === 'chat' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'hover:bg-slate-800 text-slate-400'}`}
        >
          <MessageSquare size={20} />
          <span className="hidden md:block font-medium">Chat Interface</span>
        </button>

        <button 
          onClick={() => setActiveTab('settings')}
          className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'hover:bg-slate-800 text-slate-400'}`}
        >
          <SettingsIcon size={20} />
          <span className="hidden md:block font-medium">Connection</span>
        </button>

        <button 
          onClick={() => setActiveTab('security')}
          className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${activeTab === 'security' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'hover:bg-slate-800 text-slate-400'}`}
        >
          <ShieldCheck size={20} />
          <span className="hidden md:block font-medium">Privacy Guide</span>
        </button>

        <button 
          onClick={() => setActiveTab('help')}
          className={`flex items-center space-x-3 p-3 rounded-lg transition-all ${activeTab === 'help' ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-600/20' : 'hover:bg-slate-800 text-slate-400'}`}
        >
          <HelpCircle size={20} />
          <span className="hidden md:block font-medium">Gemini Expert</span>
        </button>

        <div className="mt-auto pt-4 border-t border-slate-800">
          <div className="flex items-center justify-between px-2 mb-2">
            <span className="hidden md:block text-xs text-slate-500 uppercase font-bold tracking-widest">Status</span>
            <div className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : status === ConnectionStatus.CONNECTING ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
          </div>
          <p className="hidden md:block text-[10px] text-slate-600 truncate px-2 font-mono">{settings.endpoint}</p>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative">
        {activeTab === 'chat' && (
          <>
            {/* Header */}
            <header className="h-16 border-b border-slate-800 bg-slate-900/30 backdrop-blur-md flex items-center justify-between px-6 z-10">
              <div className="flex items-center space-x-4">
                <select 
                  value={settings.selectedModel}
                  onChange={(e) => setSettings(s => ({ ...s, selectedModel: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                >
                  {models.length > 0 ? (
                    models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)
                  ) : (
                    <option value="">No models detected</option>
                  )}
                </select>
                <button 
                  onClick={refreshModels}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                  title="Refresh models"
                >
                  <RefreshCw size={18} className={status === ConnectionStatus.CONNECTING ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="text-sm font-medium text-slate-400 flex items-center">
                <Terminal size={14} className="mr-2" />
                {settings.selectedModel || 'Ready'}
              </div>
            </header>

            {/* Chat Body */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                  <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700">
                    <MessageSquare size={40} className="text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-semibold mb-2 text-white">Start a Conversation</h2>
                  <p className="max-w-md">Connect your local Ollama instance via Cloudflare Tunnel to chat securely from anywhere.</p>
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div 
                    key={i} 
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-xl ${
                      msg.role === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : msg.role === 'system' 
                          ? 'bg-red-900/30 border border-red-500/30 text-red-200 text-xs italic'
                          : 'bg-slate-800 border border-slate-700 text-slate-200'
                    }`}>
                      {msg.model && <div className="text-[10px] font-mono text-slate-400 mb-1 uppercase tracking-wider">{msg.model}</div>}
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 flex items-center space-x-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-900/50 backdrop-blur-md">
              <form 
                onSubmit={handleSendMessage}
                className="max-w-4xl mx-auto flex space-x-4"
              >
                <input 
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={status === ConnectionStatus.CONNECTED ? "Ask anything..." : "Connect to Ollama first..."}
                  disabled={status !== ConnectionStatus.CONNECTED || isTyping}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50"
                />
                <button 
                  type="submit"
                  disabled={status !== ConnectionStatus.CONNECTED || isTyping || !input.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-3 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center transition-all active:scale-95"
                >
                  <Send size={20} />
                </button>
              </form>
              <p className="text-center text-[10px] text-slate-600 mt-2">
                Running locally on your hardware. Protected by Cloudflare.
              </p>
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="p-8 max-w-2xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-bold flex items-center"><Server className="mr-3 text-indigo-400" /> Connection Settings</h2>
            
            <div className="space-y-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Endpoint URL</label>
                <div className="relative">
                  <input 
                    type="text"
                    value={settings.endpoint}
                    onChange={(e) => setSettings(s => ({ ...s, endpoint: e.target.value }))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                    placeholder="https://ollama.yourdomain.com"
                  />
                  <div className={`absolute right-3 top-2.5 w-5 h-5 rounded-full flex items-center justify-center ${status === ConnectionStatus.CONNECTED ? 'text-green-500' : 'text-red-500'}`}>
                    {status === ConnectionStatus.CONNECTED ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Tip: Use your Cloudflare Tunnel URL here (e.g., https://ai-proxy.yourname.net)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">System Instructions</label>
                <textarea 
                  rows={4}
                  value={settings.systemPrompt}
                  onChange={(e) => setSettings(s => ({ ...s, systemPrompt: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                />
              </div>

              <button 
                onClick={refreshModels}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg flex items-center justify-center transition-all"
              >
                <RefreshCw size={20} className={`mr-2 ${status === ConnectionStatus.CONNECTING ? 'animate-spin' : ''}`} />
                Test Connection & Fetch Models
              </button>
            </div>

            {status === ConnectionStatus.ERROR && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 flex items-start space-x-3 text-red-200 text-sm">
                <AlertCircle size={20} className="mt-0.5" />
                <div>
                  <p className="font-bold">Connection Failed</p>
                  <p>Check if your tunnel is active and OLLAMA_ORIGINS is set to allow requests from https://ai.guythatlives.net</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="p-8 max-w-3xl mx-auto w-full space-y-8 overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-bold flex items-center"><ShieldCheck className="mr-3 text-emerald-400" /> Privacy & Security Guide</h2>
            
            <div className="space-y-6">
              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-xl font-semibold mb-4 text-white">How to connect safely?</h3>
                <p className="text-slate-400 leading-relaxed mb-4">
                  To connect your home PC without exposing your public IP or opening risky router ports, use <strong>Cloudflare Tunnels</strong> (formerly Argo Tunnel).
                </p>
                <ol className="list-decimal list-inside space-y-3 text-slate-300 ml-2">
                  <li>Install <code>cloudflared</code> on your local machine.</li>
                  <li>Create a tunnel: <code>cloudflared tunnel create ollama-hub</code></li>
                  <li>Configure it to route <code>https://ai-proxy.yourname.net</code> to <code>http://localhost:11434</code></li>
                  <li>Start the tunnel: <code>cloudflared tunnel run ollama-hub</code></li>
                </ol>
              </section>

              <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h3 className="text-xl font-semibold mb-4 text-white">The CORS Problem</h3>
                <p className="text-slate-400 leading-relaxed mb-4">
                  Ollama blocks web requests by default. You must tell it to allow this website:
                </p>
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 font-mono text-sm text-indigo-300">
                  # For Windows (PowerShell)<br/>
                  $env:OLLAMA_ORIGINS="https://ai.guythatlives.net"; ollama serve<br/><br/>
                  # For Linux/macOS<br/>
                  OLLAMA_ORIGINS="https://ai.guythatlives.net" ollama serve
                </div>
              </section>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3 text-blue-200">
                  <ExternalLink size={20} />
                  <span>Learn more about Cloudflare Zero Trust</span>
                </div>
                <a href="https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started-guide/" target="_blank" className="text-blue-400 font-bold hover:underline">Open Docs</a>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'help' && (
          <div className="p-8 max-w-3xl mx-auto w-full space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="text-3xl font-bold flex items-center"><HelpCircle className="mr-3 text-amber-400" /> Gemini Troubleshooting</h2>
            
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
              <p className="text-slate-400">
                Stuck with your setup? Ask Gemini (Google's latest AI) to analyze your current configuration and provide expert advice on Cloudflare or Ollama.
              </p>
              
              <button 
                onClick={askGeminiForAdvice}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center"
              >
                <RefreshCw size={18} className="mr-2" />
                Analyze Configuration
              </button>

              {geminiAdvice && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-6 mt-4">
                  <div className="flex items-center space-x-2 text-amber-400 mb-4 font-bold text-sm uppercase tracking-widest">
                    <span>Gemini Response</span>
                  </div>
                  <div className="text-slate-300 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                    {geminiAdvice}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
