import { useState, useEffect, useRef, useCallback } from 'react'
import './index.css'

// ── Grain overlay ──────────────────────────────────────────────
function GrainOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E")`,
      backgroundSize: '180px', opacity: 0.35,
      animation: 'grain 10s steps(1) infinite',
    }} />
  )
}

// ── Ambient bg ─────────────────────────────────────────────────
function AmbientBg({ state }) {
  const color = state === 'listening' ? 'rgba(0,229,255,0.09)' :
    state === 'thinking' ? 'rgba(123,94,167,0.09)' :
    state === 'speaking' ? 'rgba(0,255,136,0.06)' :
    'rgba(0,212,255,0.05)'

  return (
    <div style={{
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      background: `radial-gradient(ellipse 70% 55% at 50% 85%, ${color} 0%, transparent 70%)`,
      transition: 'background 1s ease',
    }} />
  )
}

// ── Speaking waveform bars ─────────────────────────────────────
function WaveBar({ delay }) {
  return (
    <div style={{
      width: 3, height: 20, borderRadius: 2,
      background: 'rgba(0,229,255,0.7)',
      animation: `speaking-wave 0.8s ease-in-out ${delay}s infinite`,
      transformOrigin: 'center',
    }} />
  )
}

// ── Orb ────────────────────────────────────────────────────────
function Orb({ state, onClick }) {
  const isListening = state === 'listening'
  const isThinking = state === 'thinking'
  const isSpeaking = state === 'speaking'

  const orbGradient = isThinking
    ? 'conic-gradient(from 0deg, #00d4ff, #7b5ea7, #1a6fff, #00d4ff)'
    : isSpeaking
    ? 'radial-gradient(circle at 40% 38%, #00ff88 0%, #00d4ff 30%, #1a6fff 60%, #7b5ea7 85%, #0d1525 100%)'
    : 'radial-gradient(circle at 38% 36%, #00d4ff 0%, #1a6fff 35%, #7b5ea7 65%, #0d1525 100%)'

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative', width: 210, height: 210,
        cursor: 'pointer', flexShrink: 0,
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Idle pulse rings */}
      {state === 'idle' && [0, 1].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: -18, borderRadius: '50%',
          border: '1px solid rgba(0,212,255,0.18)',
          animation: `pulse-ring 3.5s ease-out ${i * 1.75}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Listening rings */}
      {isListening && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: -12, borderRadius: '50%',
          border: `1px solid rgba(0,229,255,${0.6 - i * 0.15})`,
          animation: `listen-ring 1.4s ease-out ${i * 0.45}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Orb body */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: orbGradient,
        animation: isThinking
          ? 'thinking 2s linear infinite, breathe 2.5s ease-in-out infinite'
          : 'breathe 4s ease-in-out infinite',
        boxShadow: isListening
          ? '0 0 90px 25px rgba(0,229,255,0.35), 0 0 180px 55px rgba(123,94,167,0.2), inset 0 0 40px rgba(0,229,255,0.1)'
          : isSpeaking
          ? '0 0 90px 25px rgba(0,255,136,0.25), 0 0 180px 55px rgba(0,212,255,0.15)'
          : '0 0 60px 12px rgba(0,212,255,0.12), 0 0 120px 35px rgba(123,94,167,0.08)',
        transition: 'box-shadow 0.6s ease, background 0.6s ease',
      }}>
        {/* Specular highlight */}
        <div style={{
          position: 'absolute', top: '16%', left: '20%',
          width: '36%', height: '28%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.32) 0%, transparent 70%)',
          filter: 'blur(5px)',
          pointerEvents: 'none',
        }} />
        {/* Secondary glow */}
        <div style={{
          position: 'absolute', bottom: '18%', right: '20%',
          width: '22%', height: '18%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,94,167,0.4) 0%, transparent 70%)',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Speaking waveform overlay */}
      {isSpeaking && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          animation: 'fadeIn 0.3s ease',
        }}>
          {[0, 0.1, 0.2, 0.1, 0].map((d, i) => (
            <WaveBar key={i} delay={d} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Memory chip ────────────────────────────────────────────────
function MemoryChip({ text, index, onDelete }) {
  const [hovering, setHovering] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        background: 'rgba(0,212,255,0.04)',
        border: '1px solid rgba(0,212,255,0.12)',
        borderRadius: 12, padding: '12px 14px',
        animation: `fadeUp 0.35s ease ${Math.min(index, 8) * 0.04}s both`,
        position: 'relative', transition: 'border-color 0.2s',
        borderColor: hovering ? 'rgba(0,212,255,0.25)' : 'rgba(0,212,255,0.12)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={{
            color: 'rgba(0,229,255,0.45)', fontFamily: "'Space Mono', monospace",
            fontSize: 9, display: 'block', marginBottom: 5, letterSpacing: '0.08em',
          }}>
            MEM·{String(index + 1).padStart(3, '0')}
          </span>
          <p style={{ fontSize: 13, color: 'rgba(232,240,254,0.82)', lineHeight: 1.55 }}>
            {text}
          </p>
        </div>
        {hovering && (
          <button
            onClick={() => onDelete(index)}
            style={{
              background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)',
              borderRadius: 6, padding: '3px 7px', color: 'rgba(255,100,100,0.7)',
              fontSize: 10, cursor: 'pointer', fontFamily: "'Space Mono', monospace",
              flexShrink: 0,
            }}
          >
            del
          </button>
        )}
      </div>
    </div>
  )
}

// ── Reply bubble ───────────────────────────────────────────────
function ReplyBubble({ text }) {
  if (!text) return null
  return (
    <div style={{
      background: 'rgba(13,21,37,0.8)',
      border: '1px solid rgba(0,212,255,0.1)',
      borderRadius: 16, padding: '14px 18px',
      animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
      backdropFilter: 'blur(12px)',
    }}>
      <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(232,240,254,0.88)' }}>
        {text}
      </p>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────
export default function App() {
  const [orbState, setOrbState] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [view, setView] = useState('home')
  const [statusText, setStatusText] = useState('Tap the orb to speak')
  const [memories, setMemories] = useState(() => {
    try { return JSON.parse(localStorage.getItem('memoraa_v1') || '[]') } catch { return [] }
  })
  const [history, setHistory] = useState([])
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [error, setError] = useState('')

  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const isListeningRef = useRef(false)
  const finalTranscriptRef = useRef('')

  // Persist memories
  useEffect(() => {
    localStorage.setItem('memoraa_v1', JSON.stringify(memories))
  }, [memories])

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShowInstallBanner(false)
    setDeferredPrompt(null)
  }

  // System prompt
  const buildSystemPrompt = useCallback(() => {
    const memBlock = memories.length > 0
      ? `\n\nWhat you remember about this person:\n${memories.slice(0, 40).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : ''

    return `You are Memoraa — a warm, perceptive personal AI companion. You speak like a trusted friend who truly listens.

Your rules:
- Reply naturally, warmly, conversationally. Keep voice replies to 2-4 sentences max.
- Detect and reply in the user's language (Hindi, English, Hinglish — match their style exactly)
- Extract meaningful personal facts: goals, preferences, life events, feelings, relationships
- Never be generic. Reference what you know about them when relevant.
- Never say "I'm an AI" unless directly asked${memBlock}

After your reply, on a NEW LINE, output this ONLY if something is genuinely worth remembering:
MEMORY_JSON: {"remember": "concise third-person fact about the user"}

Do not output MEMORY_JSON if nothing meaningful was shared. Never fabricate memories.`
  }, [memories])

  // Call Claude via Vercel edge function
  const callClaude = useCallback(async (userText) => {
    setOrbState('thinking')
    setStatusText('Thinking...')
    setError('')

    const newHistory = [...history, { role: 'user', content: userText }]

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: buildSystemPrompt(),
          messages: newHistory,
        }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const data = await res.json()
      if (data.error) throw new Error(data.error.message || 'Unknown error')

      const fullText = (data.content || []).map(b => b.text || '').join('')

      // Extract memory
      const memMatch = fullText.match(/MEMORY_JSON:\s*(\{[^}]+\})/s)
      if (memMatch) {
        try {
          const { remember } = JSON.parse(memMatch[1])
          if (remember && remember.length > 5) {
            setMemories(prev => [remember, ...prev].slice(0, 150))
          }
        } catch {}
      }

      const cleanReply = fullText.replace(/MEMORY_JSON:.*$/s, '').trim()
      setHistory([...newHistory, { role: 'assistant', content: cleanReply }])
      setReply(cleanReply)
      speak(cleanReply)

    } catch (err) {
      console.error(err)
      setError('Could not reach Memoraa. Check your connection.')
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
  }, [history, buildSystemPrompt])

  // TTS
  const speak = useCallback((text) => {
    setOrbState('speaking')
    setStatusText('Speaking...')
    synthRef.current.cancel()

    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.93
    u.pitch = 1.08
    u.onend = () => {
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
    u.onerror = () => {
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
    synthRef.current.speak(u)
  }, [])

  // Start listening
  const startListening = useCallback(() => {
    if (isListeningRef.current) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setError('Voice input not supported on this browser. Try Chrome.')
      return
    }

    synthRef.current.cancel()
    finalTranscriptRef.current = ''

    const rec = new SR()
    recognitionRef.current = rec
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'hi-IN'

    rec.onstart = () => {
      isListeningRef.current = true
      setOrbState('listening')
      setStatusText('Listening...')
      setReply('')
      setTranscript('')
      setError('')
    }

    rec.onresult = (e) => {
      let final = '', interim = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      finalTranscriptRef.current = final
      setTranscript(final || interim)
    }

    rec.onend = () => {
      isListeningRef.current = false
      const said = finalTranscriptRef.current.trim() || transcript.trim()
      if (said) {
        callClaude(said)
      } else {
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
      }
    }

    rec.onerror = (e) => {
      isListeningRef.current = false
      if (e.error !== 'no-speech') setError("Couldn't hear you. Try again.")
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }

    rec.start()
  }, [transcript, callClaude])

  const handleOrbTap = () => {
    if (orbState === 'listening') {
      recognitionRef.current?.stop()
    } else if (orbState === 'speaking') {
      synthRef.current.cancel()
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    } else if (orbState === 'idle') {
      startListening()
    }
  }

  const deleteMemory = (index) => {
    setMemories(prev => prev.filter((_, i) => i !== index))
  }

  const clearAll = () => {
    if (confirm('Clear all memories? This cannot be undone.')) {
      setMemories([])
      setHistory([])
    }
  }

  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden' }}>
      <GrainOverlay />
      <AmbientBg state={orbState} />

      {/* PWA install banner */}
      {showInstallBanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(13,21,37,0.95)', borderBottom: '1px solid rgba(0,212,255,0.15)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backdropFilter: 'blur(12px)',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(232,240,254,0.8)' }}>
            Add Memoraa to your home screen
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleInstall} style={{
              background: 'var(--cyan)', color: '#000', border: 'none',
              borderRadius: 8, padding: '6px 14px', fontSize: 12,
              fontFamily: "'Sora', sans-serif", fontWeight: 600, cursor: 'pointer',
            }}>Install</button>
            <button onClick={() => setShowInstallBanner(false)} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '6px 10px', color: 'var(--muted-light)',
              fontSize: 12, cursor: 'pointer',
            }}>✕</button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div style={{
        position: 'relative', zIndex: 1, height: '100dvh',
        display: 'flex', flexDirection: 'column',
        maxWidth: 500, margin: '0 auto',
        paddingTop: showInstallBanner ? 54 : 0,
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: orbState === 'idle' ? '#00e5ff'
                : orbState === 'listening' ? '#00ff88'
                : orbState === 'thinking' ? '#ffaa00'
                : '#00ff88',
              boxShadow: `0 0 10px currentColor`,
              transition: 'background 0.4s ease',
              flexShrink: 0,
            }} />
            <span style={{
              fontWeight: 600, fontSize: 18, letterSpacing: '-0.4px',
              fontFamily: "'Sora', sans-serif",
            }}>
              Memoraa
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setView(v => v === 'home' ? 'memories' : 'home')}
              style={{
                background: view === 'memories' ? 'rgba(0,229,255,0.1)' : 'var(--pill)',
                border: `1px solid ${view === 'memories' ? 'rgba(0,229,255,0.25)' : 'var(--pill-border)'}`,
                borderRadius: 20, padding: '6px 14px',
                color: view === 'memories' ? '#00e5ff' : 'var(--muted-light)',
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                cursor: 'pointer', transition: 'all 0.25s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              🧠 {memories.length}
            </button>
          </div>
        </div>

        {/* ── HOME VIEW ── */}
        {view === 'home' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 24px 36px', overflow: 'hidden',
          }}>
            {/* Title */}
            <div style={{ textAlign: 'center', paddingTop: 4 }}>
              <h1 style={{
                fontSize: 30, fontWeight: 300, letterSpacing: '-0.8px',
                background: 'linear-gradient(135deg, #00e5ff 0%, #7b5ea7 50%, #e8f0fe 100%)',
                backgroundSize: '200% auto',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'shimmer 5s linear infinite',
                marginBottom: 7, lineHeight: 1.2,
              }}>
                Hey Memoraa.
              </h1>
              <p style={{
                color: 'var(--muted-light)', fontSize: 12.5, fontWeight: 300, letterSpacing: '0.01em',
              }}>
                Speak freely. I listen, remember, and never share.
              </p>
            </div>

            {/* Orb + status */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
              <Orb state={orbState} onClick={handleOrbTap} />

              <div style={{ textAlign: 'center', minHeight: 44, padding: '0 12px' }}>
                {transcript ? (
                  <p style={{
                    color: 'rgba(232,240,254,0.72)', fontSize: 14, lineHeight: 1.6,
                    animation: 'fadeUp 0.25s ease', fontStyle: 'italic',
                  }}>
                    "{transcript}"
                  </p>
                ) : error ? (
                  <p style={{ color: 'rgba(255,100,100,0.75)', fontSize: 12, animation: 'fadeUp 0.25s ease' }}>
                    {error}
                  </p>
                ) : (
                  <p style={{
                    color: 'var(--muted)', fontSize: 11, letterSpacing: '0.1em',
                    fontFamily: "'Space Mono', monospace", textTransform: 'uppercase',
                  }}>
                    {statusText}
                  </p>
                )}
              </div>
            </div>

            {/* Reply */}
            <div style={{ width: '100%', minHeight: 72 }}>
              <ReplyBubble text={reply} />
            </div>

            {/* Footer */}
            <p style={{
              fontSize: 10, color: 'var(--muted)', letterSpacing: '0.12em',
              fontFamily: "'Space Mono', monospace", textTransform: 'uppercase',
            }}>
              🔒 Private · on-device memory
            </p>
          </div>
        )}

        {/* ── MEMORIES VIEW ── */}
        {view === 'memories' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '4px 24px 32px', overflow: 'hidden',
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              marginBottom: 16,
            }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.4px' }}>
                  Memory
                </h2>
                <p style={{
                  fontSize: 11, color: 'var(--muted)', marginTop: 3,
                  fontFamily: "'Space Mono', monospace",
                }}>
                  {memories.length} {memories.length === 1 ? 'memory' : 'memories'} · local to this device
                </p>
              </div>
              {memories.length > 0 && (
                <button onClick={clearAll} style={{
                  background: 'rgba(255,60,60,0.07)',
                  border: '1px solid rgba(255,60,60,0.18)',
                  borderRadius: 8, padding: '5px 12px',
                  color: 'rgba(255,100,100,0.75)', fontSize: 11,
                  fontFamily: "'Space Mono', monospace", cursor: 'pointer',
                  transition: 'all 0.2s',
                }}>
                  Clear all
                </button>
              )}
            </div>

            {/* Auto Dream banner */}
            {memories.length > 5 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(123,94,167,0.12), rgba(0,212,255,0.08))',
                border: '1px solid rgba(123,94,167,0.2)',
                borderRadius: 12, padding: '10px 14px', marginBottom: 12,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <span style={{ fontSize: 18 }}>✨</span>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Auto Dream</p>
                  <p style={{ fontSize: 11, color: 'var(--muted-light)' }}>
                    Memoraa is consolidating your memories quietly.
                  </p>
                </div>
              </div>
            )}

            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex',
              flexDirection: 'column', gap: 8,
            }}>
              {memories.length === 0 ? (
                <div style={{ textAlign: 'center', paddingTop: 56 }}>
                  <p style={{ fontSize: 34, marginBottom: 14 }}>🌙</p>
                  <p style={{ color: 'var(--muted-light)', fontSize: 13, lineHeight: 1.7 }}>
                    Nothing remembered yet.<br />
                    Speak to Memoraa — she'll quietly<br />note things that matter.
                  </p>
                </div>
              ) : (
                memories.map((m, i) => (
                  <MemoryChip key={`${i}-${m.slice(0,10)}`} text={m} index={i} onDelete={deleteMemory} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
