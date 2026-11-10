import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Download, Send, Settings, ChevronDown, ChevronUp, Shield,
  Trash2, Maximize2, Minimize2, QrCode, LogOut
} from 'lucide-react';
import { supabase } from './supabaseClient';

const colorSchemes = {
  blues: ['#0B4F6C', '#1E6F96', '#3E92C1', '#66B5E5', '#8DCFF0'],
  reds: ['#9B1C26', '#C92B36', '#E64B57', '#F07383', '#F8A3B0'],
  greens: ['#1B5E20', '#2E7D32', '#43A047', '#66BB6A', '#81C784'],
  purples: ['#4A148C', '#6A1B9A', '#7B1FA2', '#8E24AA', '#9C27B0'],
  rainbow: ['#E91E63', '#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#F44336']
};

const getUserId = () => {
  let id = localStorage.getItem('wordcloud_userId');
  if (!id) {
    id = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('wordcloud_userId', id);
  }
  return id;
};

const isPreviewMode = import.meta.env.VITE_PREVIEW_MODE === 'true';

const SEED_WORDS = [
  'freckles', 'fat', 'wrinkles', 'love handles', 'fat', 'ugly', 'pimples',
  'thin hair', 'too short', 'short legs', 'big hips', 'fat', 'pimples',
  'large pores', 'ugly'
];

const SEED_SUBMISSIONS = SEED_WORDS.map((text, i) => ({
  id: `seed-${i}`,
  text,
  user_id: 'seed-user',
  is_admin: false,
  created_at: new Date(Date.now() - i * 1000).toISOString()
}));

export default function App() {
  const [submissions, setSubmissions] = useState([]);
  const [wordData, setWordData] = useState([]);
  const [previousWordData, setPreviousWordData] = useState([]);
  const [inputText, setInputText] = useState('');
  const [maxWords, setMaxWords] = useState(100);
  const [minFrequency, setMinFrequency] = useState(1);
  const [colorScheme, setColorScheme] = useState('blues');
  const [animateWords, setAnimateWords] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showCloudOnly, setShowCloudOnly] = useState(false);
  const [session, setSession] = useState(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [submitFeedback, setSubmitFeedback] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const svgRef = useRef(null);

  const isAdmin = !!session;

  // Auth session tracking
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // Initial load + realtime subscription (no polling needed)
  useEffect(() => {
    if (isPreviewMode) {
      setSubmissions(SEED_SUBMISSIONS);
      return;
    }

    let mounted = true;

    const load = async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (!mounted) return;
      if (error) setErrorMsg(error.message);
      else setSubmissions(data || []);
    };
    load();

    const channel = supabase
      .channel('submissions-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, (payload) => {
        setSubmissions((prev) => [payload.new, ...prev]);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'submissions' }, (payload) => {
        setSubmissions((prev) => prev.filter((s) => s.id !== payload.old.id));
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  // Word frequency processing
  useEffect(() => {
    if (submissions.length === 0) {
      setWordData([]);
      return;
    }
    const freq = {};
    submissions.forEach((s) => {
      const w = s.text.toLowerCase().trim();
      if (w) freq[w] = (freq[w] || 0) + 1;
    });
    const sorted = Object.entries(freq)
      .filter(([, f]) => f >= minFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxWords);
    const maxFreq = sorted[0]?.[1] || 1;
    const minSize = 16, maxSize = 72;
    setWordData(
      sorted.map(([text, frequency]) => ({
        text,
        frequency,
        size: minSize + (frequency / maxFreq) * (maxSize - minSize),
        color: colorSchemes[colorScheme][Math.floor(Math.random() * colorSchemes[colorScheme].length)]
      }))
    );
  }, [submissions, minFrequency, maxWords, colorScheme]);

  useEffect(() => {
    if (wordData.length > 0) setPreviousWordData(wordData);
  }, [wordData]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    const { error } = await supabase.from('submissions').insert({
      text: inputText.trim(),
      user_id: getUserId(),
      is_admin: isAdmin
    });
    if (error) {
      setErrorMsg(error.message);
    } else {
      setInputText('');
      setSubmitFeedback(true);
      setTimeout(() => setSubmitFeedback(false), 2000);
      setErrorMsg(null);
    }
  };

  const handleDelete = async (id) => {
    const { error } = await supabase.from('submissions').delete().eq('id', id);
    if (error) setErrorMsg(error.message);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });
    if (error) setLoginError(error.message);
    else {
      setLoginEmail('');
      setLoginPassword('');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const generateLayout = useCallback(() => {
    if (!wordData.length) return [];
    const width = 800, height = 500, cx = width / 2, cy = height / 2, padding = 50;
    const positions = [];
    wordData.forEach((word) => {
      let angle = 0, radius = 0, positioned = false, attempts = 0;
      while (!positioned && attempts < 1000) {
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const textWidth = word.text.length * word.size * 0.5;
        const textHeight = word.size * 0.8;
        if (x - textWidth / 2 < padding || x + textWidth / 2 > width - padding ||
            y - textHeight / 2 < padding || y + textHeight / 2 > height - padding) {
          angle += 0.3; radius += 0.3; attempts++; continue;
        }
        let collision = false;
        for (const p of positions) {
          const dx = Math.abs(x - p.x), dy = Math.abs(y - p.y);
          if (dx < (textWidth + p.width) / 2 + 8 && dy < (textHeight + p.height) / 2 + 4) {
            collision = true; break;
          }
        }
        if (!collision) {
          positions.push({ ...word, x, y, width: textWidth, height: textHeight,
            rotation: Math.random() > 0.8 ? Math.random() * 30 - 15 : 0 });
          positioned = true;
        } else { angle += 0.3; radius += 0.3; }
        attempts++;
      }
    });
    return positions;
  }, [wordData]);

  const layoutData = generateLayout();

  const downloadSVG = () => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgString = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wordcloud-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const WordCloudSVG = ({ reference }) => {
    const isNew = (text) => !previousWordData.some((w) => w.text === text);
    return (
      <svg ref={reference} width="800" height="500" className="w-full bg-white"
           viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <style>{`
            @keyframes fadeIn { from { opacity:0; transform:scale(0.5);} to { opacity:1; transform:scale(1);} }
            @keyframes pulse { 0%,100% { opacity:1;} 50% { opacity:0.7;} }
            .word-new { animation: fadeIn 0.6s ease-out; filter:url(#glow); }
            .word-static { animation: pulse 2s ease-in-out infinite; }
          `}</style>
        </defs>
        <rect width="800" height="500" fill="white" />
        {layoutData.map((word, i) => {
          const fresh = animateWords && isNew(word.text);
          return (
            <g key={`${word.text}-${i}`} className={fresh ? 'word-new' : 'word-static'}>
              <text x={word.x} y={word.y} fontSize={word.size} fill={word.color}
                    textAnchor="middle" dominantBaseline="middle"
                    transform={`rotate(${word.rotation}, ${word.x}, ${word.y})`}
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    fontWeight="600" style={{ transformOrigin: `${word.x}px ${word.y}px` }}>
                {word.text}
              </text>
              <title>{word.frequency} submission{word.frequency > 1 ? 's' : ''}</title>
            </g>
          );
        })}
      </svg>
    );
  };

  if (showCloudOnly) {
    return (
      <div className="min-h-screen w-full bg-white flex items-center justify-center p-8">
        <button onClick={() => setShowCloudOnly(false)}
                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm text-gray-600 rounded-full hover:bg-white hover:text-gray-800 shadow-lg z-10 transition-all">
          <Minimize2 size={20} strokeWidth={1.5} />
        </button>
        <div className="w-full max-w-7xl">
          {wordData.length === 0 ? (
            <div className="text-center text-gray-400 py-24">
              <Send size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="text-xl">Submit words to create the cloud</p>
            </div>
          ) : <WordCloudSVG reference={svgRef} />}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-medium text-gray-800 mb-1">Live Word Cloud</h1>
            <p className="text-gray-500 text-xs sm:text-sm">Collaborative real-time visualization</p>
          </div>
          <button onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 self-start sm:self-auto">
            <Shield size={16} />
            {isAdmin ? 'Admin Panel' : 'Admin'}
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {showAdminPanel && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <Shield size={16} /> Admin Panel
              </h3>
              {isAdmin && (
                <button onClick={handleLogout} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                  <LogOut size={14} /> Log out
                </button>
              )}
            </div>

            {!isAdmin ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-2 max-w-sm">
                <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                       placeholder="Admin email" className="px-3 py-2 border border-gray-200 rounded text-sm" />
                <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
                       placeholder="Password" className="px-3 py-2 border border-gray-200 rounded text-sm" />
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                  Log in
                </button>
                {loginError && <p className="text-xs text-red-600">{loginError}</p>}
              </form>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row gap-2 mb-6">
                  <button onClick={downloadSVG} disabled={!wordData.length}
                          className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-100 disabled:text-gray-400">
                    <Download size={16} /> Download SVG
                  </button>
                  <button onClick={() => setShowQRCode(!showQRCode)}
                          className="flex-1 flex items-center justify-center gap-2 bg-gray-600 text-white py-2 px-4 rounded text-sm font-medium hover:bg-gray-700">
                    <QrCode size={16} /> {showQRCode ? 'Hide QR Code' : 'Show QR Code'}
                  </button>
                </div>

                {showQRCode && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                    <p className="text-xs text-gray-600 mb-3 font-medium">Scan to submit words</p>
                    <div className="inline-block bg-white p-3 rounded">
                      <QRCodeSVG value={window.location.href} size={192} />
                    </div>
                    <p className="text-xs text-gray-500 mt-2 font-mono break-all">{window.location.href}</p>
                  </div>
                )}

                <h4 className="text-sm font-medium text-gray-600 mb-3">Submissions ({submissions.length})</h4>
                <div className="max-h-64 sm:max-h-96 overflow-y-auto space-y-2">
                  {submissions.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">No submissions yet</p>
                  ) : submissions.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between p-3 bg-gray-50 rounded border border-gray-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{sub.text}</p>
                        <p className="text-xs text-gray-400 mt-1 truncate">
                          User: {sub.user_id?.substr(0, 12)}... • {new Date(sub.created_at).toLocaleString()}
                          {sub.is_admin && <span className="ml-2 text-blue-500">• Admin</span>}
                        </p>
                      </div>
                      <button onClick={() => handleDelete(sub.id)} className="ml-4 p-2 text-red-500 hover:bg-red-50 rounded flex-shrink-0">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          <div className="w-full lg:w-80 flex-shrink-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-600 mb-2">Your word/phrase</label>
                <div className="flex gap-2">
                  <input type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
                         placeholder="Type your word or phrase..." maxLength={100}
                         onKeyPress={(e) => e.key === 'Enter' && handleSubmit(e)}
                         className="flex-1 px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <button onClick={handleSubmit}
                          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2 flex-shrink-0">
                    <Send size={16} />
                  </button>
                </div>
                {submitFeedback && <p className="text-xs text-green-600 mt-2">Submitted!</p>}
              </div>

              <div>
                <button onClick={() => setShowSettings(!showSettings)}
                        className="flex items-center justify-between w-full text-sm font-medium text-gray-600 hover:text-gray-800">
                  <div className="flex items-center gap-2"><Settings size={16} /><span>Display Settings</span></div>
                  {showSettings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showSettings && (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Max words: {maxWords}</label>
                      <input type="range" min="20" max="200" value={maxWords}
                             onChange={(e) => setMaxWords(Number(e.target.value))} className="w-full accent-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Min frequency: {minFrequency}</label>
                      <input type="range" min="1" max="10" value={minFrequency}
                             onChange={(e) => setMinFrequency(Number(e.target.value))} className="w-full accent-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-2">Color scheme</label>
                      <select value={colorScheme} onChange={(e) => setColorScheme(e.target.value)}
                              className="w-full p-2 border border-gray-200 rounded text-sm">
                        {Object.keys(colorSchemes).map((k) => (
                          <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <label className="text-xs text-gray-500">Animate new words</label>
                      <button onClick={() => setAnimateWords(!animateWords)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${animateWords ? 'bg-blue-600' : 'bg-gray-200'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${animateWords ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <h2 className="text-sm font-medium text-gray-600">Word Cloud</h2>
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-400">{submissions.length} submissions • live</div>
                  <button onClick={() => setShowCloudOnly(true)} className="p-2 hover:bg-gray-100 rounded transition-colors"
                          title="Open clean fullscreen view">
                    <Maximize2 size={18} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
              <div className="border border-gray-100 rounded-lg overflow-hidden bg-gray-50">
                {wordData.length === 0 ? (
                  <div className="text-center text-gray-400 py-16 sm:py-24">
                    <Send size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Submit words to create the cloud</p>
                  </div>
                ) : <WordCloudSVG reference={svgRef} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
