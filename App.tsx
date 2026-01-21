
import React, { useState, useEffect, useRef } from 'react';
import { ALL_POTENTIAL_INSTANCES, GEMINI_MODELS } from './constants';
import { DialogueEntry, DeliberationStatus, AIInstance } from './types';
import { getAIResponse, getFinalSynthesis, promptEngineerTopic, getSuggestions } from './services/geminiService';
import { GoogleGenAI } from "@google/genai";

const App: React.FC = () => {
  const [topicInput, setTopicInput] = useState('');
  const [topic, setTopic] = useState('');
  const [history, setHistory] = useState<DialogueEntry[]>([]);
  const [status, setStatus] = useState<DeliberationStatus>('idle');
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const [instanceCount, setInstanceCount] = useState(6);
  const [instances, setInstances] = useState<AIInstance[]>(ALL_POTENTIAL_INSTANCES);
  const [synthesisModel, setSynthesisModel] = useState('gemini-3-pro-preview');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevMenuOpen, setIsDevMenuOpen] = useState(false);
  const [isInfoCardOpen, setIsInfoCardOpen] = useState(false);
  const [isEngineering, setIsEngineering] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<{ category: string; text: string }[]>([]);
  const [showProWarning, setShowProWarning] = useState(false);
  
  const [modelTestResults, setModelTestResults] = useState<Record<string, 'testing' | 'online' | 'offline' | null>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const isRunningRef = useRef(false);
  const currentHistoryRef = useRef<DialogueEntry[]>([]);
  const turnCountRef = useRef(0);
  const optimizedTopicRef = useRef('');

  const activeInstances = instances.slice(0, instanceCount);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const data = await getSuggestions();
        if (data && data.length > 0) setSuggestions(data);
      } catch (e) {
        console.warn("Using fallback suggestions due to error:", e);
      }
    };
    fetchSuggestions();
    
    const pingModels = async () => {
      // Test all models in the constant list to diagnose connectivity
      for (const model of GEMINI_MODELS) {
        await testModelAvailability(model.id);
      }
      
      // If the primary models are offline, show the warning
      const crucialModels = GEMINI_MODELS.filter(m => m.id.includes('pro') || m.id.includes('flash'));
      const cruclalOffline = crucialModels.some(m => modelTestResults[m.id] === 'offline');
      if (cruclalOffline) setShowProWarning(true);
    };
    
    // Add a slight delay to ensure process.env is ready if injected late
    setTimeout(pingModels, 1000);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, verdict, status, isEngineering]);

  const handleInstanceModelChange = (id: string, modelId: string) => {
    setInstances(prev => prev.map(inst => inst.id === id ? { ...inst, model: modelId } : inst));
  };

  const testModelAvailability = async (modelId: string): Promise<'online' | 'offline'> => {
    setModelTestResults(prev => ({ ...prev, [modelId]: 'testing' }));
    
    if (!process.env.API_KEY) {
      console.error("API_KEY is missing from process.env. Connectivity will fail.");
      setModelTestResults(prev => ({ ...prev, [modelId]: 'offline' }));
      return 'offline';
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: modelId,
        contents: "Hello",
        config: { maxOutputTokens: 5 }
      });
      
      if (response && response.text) {
        setModelTestResults(prev => ({ ...prev, [modelId]: 'online' }));
        return 'online';
      } else {
        throw new Error("Empty response received");
      }
    } catch (e: any) {
      console.error(`Availability check failed for ${modelId}:`, e.message || e);
      setModelTestResults(prev => ({ ...prev, [modelId]: 'offline' }));
      return 'offline';
    }
  };

  const runExperiment = async () => {
    if (isRunningRef.current || !topicInput.trim()) return;
    
    if (topicInput.trim().toLowerCase() === "5090 giveaway") {
        setTopicInput('');
        setIsDevMenuOpen(true);
        return; 
    }

    isRunningRef.current = true;
    setVerdict(null);
    setHistory([]);
    currentHistoryRef.current = [];
    turnCountRef.current = 0;
    setStatus('running');
    setTopic(topicInput);
    const capturedTopic = topicInput;
    setTopicInput('');

    setIsEngineering(true);
    const optimized = await promptEngineerTopic(capturedTopic);
    optimizedTopicRef.current = optimized;
    setIsEngineering(false);
    
    loop();
  };

  const loop = async () => {
    const MAX_TURNS = Math.max(instanceCount * 2, 20); 

    try {
      while (turnCountRef.current < MAX_TURNS) {
        const instance = activeInstances[turnCountRef.current % instanceCount];
        setActiveInstanceId(instance.id);
        
        const { text, grounding } = await getAIResponse(instance, optimizedTopicRef.current, currentHistoryRef.current, instanceCount);
        
        const terminateSignal = "[TERMINATE_DELIBERATION]";
        const cleanResponse = text.replace(terminateSignal, "").trim();
        
        const newEntry: DialogueEntry = {
          authorId: instance.id,
          authorName: instance.name,
          content: cleanResponse,
          timestamp: Date.now(),
          grounding: grounding,
        };
        
        currentHistoryRef.current = [...currentHistoryRef.current, newEntry];
        setHistory([...currentHistoryRef.current]);
        turnCountRef.current++;

        if (text.includes(terminateSignal)) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      finalizeSynthesis();
    } catch (err) {
      console.error("Deliberation loop error:", err);
      setStatus('idle');
      isRunningRef.current = false;
    }
  };

  const finalizeSynthesis = async () => {
    setStatus('running');
    setActiveInstanceId('SYNT');
    try {
      const finalResult = await getFinalSynthesis(optimizedTopicRef.current, currentHistoryRef.current, synthesisModel);
      setVerdict(finalResult);
      setStatus('concluded');
    } catch (e) {
      setVerdict("Critical error during synthesis phase.");
      setStatus('concluded');
    } finally {
      setActiveInstanceId(null);
      isRunningRef.current = false;
    }
  };

  const resetExperiment = () => {
    setHistory([]);
    currentHistoryRef.current = [];
    turnCountRef.current = 0;
    setVerdict(null);
    setStatus('idle');
    setTopic('');
    setActiveInstanceId(null);
    isRunningRef.current = false;
  };

  return (
    <div className="flex h-screen bg-[#000000] text-[#e3e3e3] font-sans selection:bg-[#c2e7ff] selection:text-[#001d35]">
      
      {/* SIDEBAR */}
      <aside className={`transition-all duration-300 bg-[#0a0a0a] flex flex-col h-full border-r border-[#1a1a1a] ${isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-4 mb-4">
          <button 
            onClick={resetExperiment}
            className="flex items-center gap-3 bg-transparent hover:bg-[#1a1a1a] text-[#e3e3e3] p-3 rounded-full transition-colors border border-[#222222] w-full"
          >
            <i className="fas fa-plus text-sm"></i>
            <span className="text-sm font-medium">New chat</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <p className="px-6 py-2 text-[11px] font-bold text-[#666] uppercase tracking-wider">Recent</p>
          <div className="mt-1">
             <div className={`sidebar-item mx-2 px-4 py-2.5 text-sm flex items-center gap-3 cursor-pointer ${topic ? 'active' : ''}`}>
                <i className="far fa-message text-[14px]"></i>
                <span className="truncate">{topic || "New deliberation"}</span>
             </div>
          </div>
        </div>

        <div className="p-2 space-y-1 mt-auto">
          <div onClick={() => setIsSettingsOpen(true)} className="sidebar-item mx-2 px-4 py-2 text-sm flex items-center gap-3 cursor-pointer">
            <i className="fas fa-sliders-h text-[14px]"></i>
            <span>Council Settings</span>
          </div>
          <div className="sidebar-item mx-2 px-4 py-2 text-sm flex items-center gap-3 cursor-pointer opacity-50">
            <i className="far fa-circle-question text-[14px]"></i>
            <span>Help</span>
          </div>
        </div>
      </aside>

      {/* MAIN VIEW */}
      <main className="flex-1 flex flex-col relative h-full bg-[#000000]">
        
        {/* WARNING BANNER */}
        {showProWarning && (
          <div className="bg-red-950/40 border-b border-red-500/20 px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-300 z-10">
            <div className="flex items-center gap-3">
              <i className="fas fa-circle-info text-red-500 text-xs"></i>
              <span className="text-[11px] font-medium text-red-200">
                Network limitations detected. 
                <button 
                  onClick={() => setIsInfoCardOpen(true)}
                  className="ml-2 underline hover:text-white transition-colors"
                >
                  Diagnostics
                </button>
              </span>
            </div>
            <button onClick={() => setShowProWarning(false)} className="text-red-500/50 hover:text-red-500">
              <i className="fas fa-times text-[10px]"></i>
            </button>
          </div>
        )}

        {/* TOP BAR */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-[#0a0a0a]">
          <div className="flex items-center gap-2">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2.5 hover:bg-[#1a1a1a] rounded-full transition-colors">
              <i className="fas fa-bars text-[#666]"></i>
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-[#1a1a1a] rounded-lg transition-colors cursor-pointer text-sm font-medium">
              <span>Council v5090 ({instanceCount} Nodes)</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="w-8 h-8 rounded-full bg-[#333] flex items-center justify-center text-xs font-bold text-white">OP</div>
          </div>
        </header>

        {/* MESSAGES THREAD */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar flex justify-center">
          <div className="w-full max-w-3xl py-10 px-4 md:px-0 space-y-10">
            
            {!topic && (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center animate-in fade-in duration-1000 px-6">
                <h1 className="text-4xl md:text-5xl font-medium gemini-gradient-text mb-12">Hello, Operator</h1>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-xl">
                   {suggestions.length > 0 ? suggestions.map((s, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setTopicInput(s.text)} 
                        className="bg-[#0a0a0a] hover:bg-[#111] border border-[#222] p-4 rounded-xl text-left cursor-pointer transition-colors text-sm"
                      >
                         <p className="text-[#e3e3e3] mb-1 line-clamp-2">{s.text}</p>
                         <span className="text-[10px] text-[#666] uppercase font-bold tracking-widest">{s.category}</span>
                      </div>
                   )) : (
                     <div className="col-span-2 py-4 animate-pulse text-[#666] text-xs font-medium">Initializing professional protocols...</div>
                   )}
                </div>
              </div>
            )}

            {topic && (
              <div className="flex gap-4 md:gap-6 group">
                <div className="user-avatar flex-shrink-0">U</div>
                <div className="flex-1">
                  <div className="text-[#e3e3e3] whitespace-pre-wrap leading-relaxed pt-1.5 text-[15px]">{topic}</div>
                </div>
              </div>
            )}

            {isEngineering && (
              <div className="flex gap-4 md:gap-6">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0"><i className="fas fa-sparkles sparkle-icon"></i></div>
                <div className="flex-1 pt-2 space-y-3">
                  <div className="h-4 bg-[#0a0a0a] rounded w-1/4 animate-pulse"></div>
                  <div className="h-4 bg-[#0a0a0a] rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-[#0a0a0a] rounded w-3/4 animate-pulse"></div>
                </div>
              </div>
            )}

            {history.map((entry, idx) => {
              const instance = instances.find(i => i.id === entry.authorId);
              return (
                <div key={idx} className="flex gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-sparkles sparkle-icon"></i>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2.5">
                       <span className={`text-sm font-medium ${instance?.color || 'text-[#e3e3e3]'}`}>{entry.authorName}</span>
                       <span className="model-chip">{GEMINI_MODELS.find(m => m.id === instance?.model)?.name || "Node"}</span>
                    </div>
                    <div className="text-[#e3e3e3] leading-relaxed whitespace-pre-wrap text-[15px]">
                      {entry.content}
                    </div>
                    {entry.grounding && entry.grounding.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {entry.grounding.map((chunk, cIdx) => chunk.web && (
                          <a key={cIdx} href={chunk.web.uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[11px] bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2 hover:bg-[#111] transition-colors max-w-full">
                            <i className="fas fa-link text-[10px] text-[#666]"></i>
                            <span className="truncate">{chunk.web.title}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {status === 'running' && !verdict && (
              <div className="flex gap-4 md:gap-6">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0"><i className="fas fa-sparkles sparkle-icon animate-pulse"></i></div>
                <div className="flex-1 pt-5">
                   <div className="flex gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#666] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#666] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 rounded-full bg-[#666] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                   </div>
                </div>
              </div>
            )}

            {verdict && (
              <div className="mt-12 pt-12 border-t border-[#1a1a1a] flex gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 bg-[#4285f4] rounded-lg">
                  <i className="fas fa-check text-white text-sm"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-[#e3e3e3] mb-5 text-xl">Synthesis Result</h3>
                  <div className="text-lg leading-relaxed text-[#e3e3e3] whitespace-pre-wrap font-light">
                    {verdict}
                  </div>
                  <div className="mt-10 flex gap-3">
                     <button onClick={resetExperiment} className="text-xs bg-transparent border border-[#222] hover:bg-[#111] px-5 py-2.5 rounded-full transition-colors font-medium text-[#666] hover:text-[#e3e3e3]">New Deliberation</button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Scroll buffer */}
            <div className="h-10"></div>
          </div>
        </div>

        {/* INPUT BAR - INCREASED PADDING FOR MOBILE VISIBILITY */}
        <div className="px-4 pb-28 md:pb-16 flex justify-center w-full z-20">
          <div className="w-full max-w-3xl">
            <div className="prompt-container">
                <div className="gemini-input-pill flex flex-col p-2 px-4 shadow-2xl">
                <textarea 
                    rows={1}
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        runExperiment();
                    }
                    }}
                    placeholder="Enter objective protocol..."
                    className="w-full bg-transparent border-none outline-none py-3 px-2 text-[#e3e3e3] placeholder-[#666] resize-none overflow-hidden max-h-60"
                    style={{ height: 'auto' }}
                    onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${target.scrollHeight}px`;
                    }}
                />
                <div className="flex items-center justify-between mt-1 mb-1">
                    <div className="flex gap-1">
                        <button className="p-2.5 hover:bg-[#1a1a1a] rounded-full transition-colors text-[#666]"><i className="far fa-image"></i></button>
                        <button className="p-2.5 hover:bg-[#1a1a1a] rounded-full transition-colors text-[#666]"><i className="fas fa-microphone"></i></button>
                        <button onClick={() => setIsSettingsOpen(true)} className="p-2.5 hover:bg-[#1a1a1a] rounded-full transition-colors text-[#666]"><i className="fas fa-sliders-h"></i></button>
                    </div>
                    <button 
                    onClick={runExperiment}
                    disabled={isRunningRef.current || !topicInput.trim()}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${isRunningRef.current || !topicInput.trim() ? 'text-[#333]' : 'text-[#4285f4] hover:bg-[#1a1a1a]'}`}
                    >
                    <i className={`fas ${isRunningRef.current ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                    </button>
                </div>
                </div>
            </div>
            <p className="text-[10px] text-[#666] text-center mt-4 font-medium tracking-tight uppercase">
              Artificial Intelligence Council • Model v5090
            </p>
          </div>
        </div>
      </main>

      {/* DIAGNOSTICS CARD */}
      {isInfoCardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#222] p-8 rounded-[32px] max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <i className="fas fa-terminal text-blue-500 text-lg"></i>
              </div>
              <h3 className="text-xl font-medium text-[#e3e3e3]">Connectivity Report</h3>
            </div>
            <div className="space-y-3 mb-8">
              <p className="text-xs text-[#666] uppercase font-bold tracking-widest">Model Status</p>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                {GEMINI_MODELS.map(m => (
                  <div key={m.id} className="flex justify-between items-center text-sm p-2 bg-[#0a0a0a] rounded-lg border border-[#222]">
                    <span className="truncate pr-2">{m.name}</span>
                    <span className={`text-[10px] font-bold ${modelTestResults[m.id] === 'online' ? 'text-green-500' : modelTestResults[m.id] === 'testing' ? 'text-blue-500' : 'text-red-500'}`}>
                      {modelTestResults[m.id]?.toUpperCase() || 'IDLE'}
                    </span>
                  </div>
                ))}
              </div>
              {!process.env.API_KEY && (
                <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-xl text-[11px] text-red-300 mt-4">
                  <i className="fas fa-exclamation-triangle mr-2"></i>
                  Critical: process.env.API_KEY is undefined in this environment.
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3">
               <button 
                onClick={() => {
                  GEMINI_MODELS.forEach(m => testModelAvailability(m.id));
                }}
                className="text-xs text-[#666] hover:text-white px-4 py-2"
              >
                Re-scan
              </button>
              <button 
                onClick={() => setIsInfoCardOpen(false)}
                className="bg-[#e3e3e3] hover:bg-white text-black px-8 py-2.5 rounded-full text-sm font-bold transition-all transform active:scale-95"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center settings-overlay p-4">
          <div className="bg-[#0a0a0a] w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-[#222] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#222] flex justify-between items-center bg-[#0a0a0a] sticky top-0 z-10">
              <h2 className="text-xl font-medium tracking-tight">Council Protocol</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="w-10 h-10 hover:bg-[#111] rounded-full flex items-center justify-center transition-colors">
                <i className="fas fa-times text-[#666]"></i>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-4 bg-blue-500 rounded-full"></div>
                  <h3 className="text-xs font-bold text-[#666] uppercase tracking-widest">Global Parameters</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <div className="flex justify-between items-center mb-4">
                      <label className="text-sm text-[#e3e3e3]">Core Council Size</label>
                      <span className="text-blue-500 font-bold">{instanceCount}</span>
                    </div>
                    <input 
                      type="range" min="2" max="20" step="1"
                      value={instanceCount}
                      onChange={(e) => setInstanceCount(parseInt(e.target.value))}
                      className="w-full h-1 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#4285f4]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm text-[#e3e3e3]">Master Synthesis Engine</label>
                    <select 
                      value={synthesisModel}
                      onChange={(e) => setSynthesisModel(e.target.value)}
                      className="w-full bg-[#000] border border-[#222] text-sm p-3 rounded-xl text-[#e3e3e3] outline-none hover:bg-[#111] transition-colors"
                    >
                      {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-1 h-4 bg-purple-500 rounded-full"></div>
                  <h3 className="text-xs font-bold text-[#666] uppercase tracking-widest">Node Specific Models</h3>
                </div>
                <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                  {activeInstances.map(inst => (
                    <div key={inst.id} className="flex items-center justify-between p-4 bg-[#000] border border-[#111] rounded-2xl">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${inst.color.replace('text-', 'bg-')}`}></div>
                        <span className="text-sm font-medium">{inst.name}</span>
                      </div>
                      <select 
                        value={inst.model}
                        onChange={(e) => handleInstanceModelChange(inst.id, e.target.value)}
                        className="bg-transparent text-sm text-[#666] outline-none border-none cursor-pointer hover:text-white"
                      >
                        {GEMINI_MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0a0a]">{m.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <div className="p-6 bg-[#0a0a0a] border-t border-[#222] flex justify-end">
               <button onClick={() => setIsSettingsOpen(false)} className="bg-[#4285f4] hover:bg-blue-600 text-white font-medium px-8 py-2.5 rounded-full transition-colors">Apply Config</button>
            </div>
          </div>
        </div>
      )}

      {isDevMenuOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center settings-overlay p-4">
          <div className="bg-[#000] w-full max-w-2xl max-h-[85vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-[#222] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#222] flex justify-between items-center bg-[#0a0a0a]">
              <h2 className="text-xl font-medium tracking-tight">Diagnostics Console</h2>
              <button onClick={() => setIsDevMenuOpen(false)} className="w-10 h-10 hover:bg-[#111] rounded-full flex items-center justify-center transition-colors">
                <i className="fas fa-times text-[#666]"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {GEMINI_MODELS.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-[#0a0a0a] rounded-2xl border border-[#222]">
                    <span className="text-xs font-medium truncate pr-2">{m.name}</span>
                    <div className="flex items-center gap-4">
                      {modelTestResults[m.id] === 'testing' && <i className="fas fa-circle-notch fa-spin text-xs text-blue-400"></i>}
                      {modelTestResults[m.id] === 'online' && <span className="text-[9px] font-bold text-green-500">ONLINE</span>}
                      {modelTestResults[m.id] === 'offline' && <span className="text-[9px] font-bold text-red-500">OFFLINE</span>}
                      <button 
                        onClick={() => testModelAvailability(m.id)}
                        className="text-[10px] bg-[#111] px-3 py-1.5 rounded-full border border-[#333]"
                      >
                        Ping
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
