import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth, useUser, useClerk } from '@clerk/clerk-react'
import Auth from './Auth.jsx'
import './index.css'

// ── Supported languages ────────────────────────────────────────
const LANGUAGES = [
  { code: 'en-US', label: 'English (US)', native: 'English' },
  { code: 'en-GB', label: 'English (UK)', native: 'English' },
  { code: 'en-IN', label: 'English (India)', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'es-ES', label: 'Spanish', native: 'Español' },
  { code: 'fr-FR', label: 'French', native: 'Français' },
  { code: 'de-DE', label: 'German', native: 'Deutsch' },
  { code: 'it-IT', label: 'Italian', native: 'Italiano' },
  { code: 'pt-BR', label: 'Portuguese (BR)', native: 'Português' },
  { code: 'ja-JP', label: 'Japanese', native: '日本語' },
  { code: 'ko-KR', label: 'Korean', native: '한국어' },
  { code: 'zh-CN', label: 'Chinese', native: '中文' },
  { code: 'ar-SA', label: 'Arabic', native: 'العربية' },
  { code: 'ru-RU', label: 'Russian', native: 'Русский' },
]

const DEFAULT_PROFILE = { name: '', language: 'en-US' }

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
function MemoryChip({ id, text, index, onDelete }) {
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
            onClick={() => onDelete(id)}
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
  const { isLoaded, isSignedIn, getToken } = useAuth()

  if (!isLoaded) {
    return (
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%',
          border: '2px solid rgba(0,229,255,0.2)', borderTopColor: '#00e5ff',
          animation: 'thinking 1s linear infinite' }} />
      </div>
    )
  }

  if (!isSignedIn) return <Auth />

  return <MemoraaApp getToken={getToken} />
}

function MemoraaApp({ getToken }) {
  const { user } = useUser()
  const { signOut } = useClerk()

  const [orbState, setOrbState] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [view, setView] = useState('home')
  const [statusText, setStatusText] = useState('Tap the orb to speak')
  const [memories, setMemories] = useState([]) // [{ id, fact, created_at }]
  const [memoriesLoaded, setMemoriesLoaded] = useState(false)
  const [profile, setProfile] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('memoraa_profile_v1') || 'null')
      return raw ? { ...DEFAULT_PROFILE, ...raw } : DEFAULT_PROFILE
    } catch { return DEFAULT_PROFILE }
  })
  const [history, setHistory] = useState([])
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [error, setError] = useState('')
  const [textInput, setTextInput] = useState('')
  const [voiceSupported, setVoiceSupported] = useState(true)

  const recognitionRef = useRef(null)
  const synthRef = useRef(window.speechSynthesis)
  const isListeningRef = useRef(false)
  const finalTranscriptRef = useRef('')
  const voicesRef = useRef([])
  const langRef = useRef(profile.language)
  langRef.current = profile.language

  // Auth-aware fetch helper
  const authedFetch = useCallback(async (input, init = {}) => {
    const token = await getToken()
    const headers = new Headers(init.headers || {})
    headers.set('Content-Type', 'application/json')
    if (token) headers.set('Authorization', `Bearer ${token}`)
    return fetch(input, { ...init, headers })
  }, [getToken])

  // Load memories from server, with one-time migration of any local cache
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await authedFetch('/api/memories')
        if (!res.ok) throw new Error(`status ${res.status}`)
        const { memories: rows } = await res.json()
        let list = Array.isArray(rows) ? rows : []

        const migrated = localStorage.getItem('memoraa_migrated_v1') === '1'
        if (!migrated) {
          let local = []
          try { local = JSON.parse(localStorage.getItem('memoraa_v1') || '[]') } catch {}
          if (list.length === 0 && Array.isArray(local) && local.length > 0) {
            const facts = local.filter(x => typeof x === 'string')
            const r2 = await authedFetch('/api/memories', {
              method: 'POST',
              body: JSON.stringify({ facts }),
            })
            if (r2.ok) {
              const { memories: rows2 } = await r2.json()
              list = Array.isArray(rows2) ? rows2 : list
            }
          }
          localStorage.setItem('memoraa_migrated_v1', '1')
          localStorage.removeItem('memoraa_v1')
        }

        if (!cancelled) {
          setMemories(list)
          setMemoriesLoaded(true)
        }
      } catch {
        if (!cancelled) setMemoriesLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [authedFetch])

  // Persist profile
  useEffect(() => {
    localStorage.setItem('memoraa_profile_v1', JSON.stringify(profile))
  }, [profile])

  // Detect SpeechRecognition support once
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  // Preload TTS voices (Chrome returns [] on first call until voiceschanged fires)
  useEffect(() => {
    const synth = synthRef.current
    if (!synth) return
    const load = () => { voicesRef.current = synth.getVoices() || [] }
    load()
    synth.addEventListener?.('voiceschanged', load)
    return () => synth.removeEventListener?.('voiceschanged', load)
  }, [])

  // Stop any running recognition on unmount
  useEffect(() => () => {
    try { recognitionRef.current?.abort?.() } catch {}
    try { synthRef.current?.cancel?.() } catch {}
  }, [])

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
      ? `\n\nWhat you remember about this person:\n${memories.slice(0, 40).map((m, i) => `${i + 1}. ${m.fact}`).join('\n')}`
      : ''

    const lang = LANGUAGES.find(l => l.code === profile.language) || LANGUAGES[0]
    const nameLine = profile.name ? `\nThe user's name is ${profile.name}. Address them naturally by name when it feels right.` : ''
    const langLine = `\nPreferred language: ${lang.label} (${lang.native}). Reply in this language by default, but match the user's language if they switch.`

    return `You are Memoraa — a warm, perceptive personal AI companion. You speak like a trusted friend who truly listens.${nameLine}${langLine}

Your rules:
- Reply naturally, warmly, conversationally. Keep voice replies to 2-4 sentences max.
- Match the user's language and style exactly (Hindi, English, Hinglish, Spanish, etc.)
- Extract meaningful personal facts: goals, preferences, life events, feelings, relationships
- Never be generic. Reference what you know about them when relevant.
- Never say "I'm an AI" unless directly asked${memBlock}

After your reply, on a NEW LINE, output this whenever the user shares ANY personal detail (name, age, work, location, family, friends, mood, goal, plan, opinion, preference, hobby, frustration, win, fear, hope, routine):
MEMORY_JSON: {"remember": "concise third-person fact about the user"}

Be generous — small details are valuable. Do not output MEMORY_JSON only if the message is purely a question with no personal content. Never fabricate memories.`
  }, [memories, profile.name, profile.language])

  // Call Claude via Vercel edge function
  const callClaude = useCallback(async (userText) => {
    setOrbState('thinking')
    setStatusText('Thinking...')
    setError('')

    const newHistory = [...history, { role: 'user', content: userText }]

    try {
      const res = await authedFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: buildSystemPrompt(),
          messages: newHistory,
        }),
      })

      if (!res.ok) throw new Error(`API error ${res.status}`)

      const data = await res.json()
      if (data.error) throw new Error(data.error.message || 'Unknown error')

      const fullText = (data.content || []).map(b => b.text || '').join('')

      // Extract memory — tolerate code fences, lowercase, and stray whitespace
      const memMatch = fullText.match(/MEMORY[_\s]*JSON\s*:?\s*`{0,3}\s*(\{[\s\S]*?"remember"[\s\S]*?\})/i)
      if (memMatch) {
        try {
          const { remember } = JSON.parse(memMatch[1])
          const fact = (remember || '').toString().trim()
          if (fact.length > 4) {
            const dup = memories.some(m => m.fact?.toLowerCase() === fact.toLowerCase())
            if (!dup) {
              authedFetch('/api/memories', {
                method: 'POST',
                body: JSON.stringify({ fact }),
              }).then(async r => {
                if (!r.ok) return
                const { memory } = await r.json()
                if (memory) setMemories(prev => [memory, ...prev].slice(0, 200))
              }).catch(() => {})
            }
          }
        } catch {}
      }

      const cleanReply = fullText.replace(/```[\s\S]*?```|MEMORY[_\s]*JSON[\s\S]*$/gi, '').trim()
      setHistory([...newHistory, { role: 'assistant', content: cleanReply }])
      setReply(cleanReply)
      speak(cleanReply)

    } catch (err) {
      console.error(err)
      setError('Could not reach Memoraa. Check your connection.')
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
  }, [history, buildSystemPrompt, authedFetch, memories])

  // Pick the highest-quality voice we can find for the chosen language.
  // Prefers neural / "Google" / "Microsoft" / "Premium" voices over basic ones.
  const pickVoice = useCallback((lang) => {
    const voices = voicesRef.current.length ? voicesRef.current : (synthRef.current.getVoices?.() || [])
    if (!voices.length) return null
    const base = lang.split('-')[0]
    const score = (v) => {
      let s = 0
      if (v.lang === lang) s += 50
      else if (v.lang?.startsWith(base + '-')) s += 30
      else if (v.lang === base) s += 20
      const name = (v.name || '').toLowerCase()
      if (name.includes('neural')) s += 20
      if (name.includes('natural')) s += 15
      if (name.includes('premium') || name.includes('enhanced')) s += 12
      if (name.includes('google')) s += 10
      if (name.includes('microsoft')) s += 8
      if (v.localService === false) s += 5 // remote voices are usually higher quality
      return s
    }
    return [...voices].sort((a, b) => score(b) - score(a))[0] || null
  }, [])

  // TTS
  const speak = useCallback((text) => {
    if (!text) return
    setOrbState('speaking')
    setStatusText('Speaking...')
    const synth = synthRef.current
    synth.cancel()

    const u = new SpeechSynthesisUtterance(text)
    u.lang = profile.language
    const voice = pickVoice(profile.language)
    if (voice) u.voice = voice
    u.rate = 0.97
    u.pitch = 1.05
    u.onend = () => {
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
    u.onerror = () => {
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }
    synth.speak(u)
    // iOS / Chrome quirk: after speak(), some engines pause unless explicitly resumed
    setTimeout(() => { try { synth.resume?.() } catch {} }, 50)
  }, [profile.language, pickVoice])

  // Prime the TTS engine on the first user gesture so iOS/Safari unlocks audio.
  // Without this, the first reply often plays silently because speak() is no
  // longer in the user-gesture chain by the time Claude responds.
  const ttsPrimedRef = useRef(false)
  const primeTTS = useCallback(() => {
    if (ttsPrimedRef.current) return
    ttsPrimedRef.current = true
    try {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      u.rate = 1
      synthRef.current.speak(u)
    } catch {}
  }, [])

  // Start listening
  const startListening = useCallback(() => {
    if (isListeningRef.current) return

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setVoiceSupported(false)
      setError('Voice input not supported here. Use the text box below or open in Chrome.')
      return
    }

    // Tear down any prior session before starting a new one
    try { recognitionRef.current?.abort?.() } catch {}
    synthRef.current.cancel()
    finalTranscriptRef.current = ''

    const rec = new SR()
    recognitionRef.current = rec
    rec.continuous = false
    rec.interimResults = true
    rec.lang = langRef.current

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
      if (recognitionRef.current === rec) recognitionRef.current = null
      const said = finalTranscriptRef.current.trim()
      if (said) {
        callClaude(said)
      } else {
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
      }
    }

    rec.onerror = (e) => {
      isListeningRef.current = false
      if (recognitionRef.current === rec) recognitionRef.current = null
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError('Microphone blocked. Allow mic access in browser settings.')
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError("Couldn't hear you. Try again.")
      }
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }

    try {
      rec.start()
    } catch {
      isListeningRef.current = false
      setError('Voice is busy. Tap again.')
      setOrbState('idle')
    }
  }, [callClaude])

  const sendText = useCallback(() => {
    const said = textInput.trim()
    if (!said) return
    primeTTS()
    setTranscript(said)
    setTextInput('')
    setReply('')
    setError('')
    callClaude(said)
  }, [textInput, callClaude, primeTTS])

  const handleOrbTap = () => {
    primeTTS()
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

  const deleteMemory = useCallback(async (id) => {
    const prev = memories
    setMemories(prev.filter(m => m.id !== id))
    try {
      const r = await authedFetch(`/api/memories?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!r.ok) setMemories(prev) // rollback on failure
    } catch { setMemories(prev) }
  }, [memories, authedFetch])

  const clearAll = useCallback(async () => {
    if (!confirm('Clear all memories? This cannot be undone.')) return
    const prev = memories
    setMemories([])
    setHistory([])
    try {
      const r = await authedFetch('/api/memories?all=1', { method: 'DELETE' })
      if (!r.ok) setMemories(prev)
    } catch { setMemories(prev) }
  }, [memories, authedFetch])

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

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => setView('home')}
              aria-label="Home"
              style={{
                background: view === 'home' ? 'rgba(0,229,255,0.1)' : 'var(--pill)',
                border: `1px solid ${view === 'home' ? 'rgba(0,229,255,0.25)' : 'var(--pill-border)'}`,
                borderRadius: 20, padding: '6px 12px',
                color: view === 'home' ? '#00e5ff' : 'var(--muted-light)',
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                cursor: 'pointer', transition: 'all 0.25s',
              }}
            >
              ⌂
            </button>
            <button
              onClick={() => setView('memories')}
              aria-label="Memories"
              style={{
                background: view === 'memories' ? 'rgba(0,229,255,0.1)' : 'var(--pill)',
                border: `1px solid ${view === 'memories' ? 'rgba(0,229,255,0.25)' : 'var(--pill-border)'}`,
                borderRadius: 20, padding: '6px 12px',
                color: view === 'memories' ? '#00e5ff' : 'var(--muted-light)',
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                cursor: 'pointer', transition: 'all 0.25s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              🧠 {memories.length}
            </button>
            <button
              onClick={() => setView('profile')}
              aria-label="Profile and settings"
              style={{
                background: view === 'profile' ? 'rgba(0,229,255,0.1)' : 'var(--pill)',
                border: `1px solid ${view === 'profile' ? 'rgba(0,229,255,0.25)' : 'var(--pill-border)'}`,
                borderRadius: 20, padding: '6px 12px',
                color: view === 'profile' ? '#00e5ff' : 'var(--muted-light)',
                fontSize: 12, fontFamily: "'Space Mono', monospace",
                cursor: 'pointer', transition: 'all 0.25s',
              }}
            >
              {profile.name ? profile.name.slice(0, 1).toUpperCase() : '👤'}
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
                {profile.name ? `Hey ${profile.name}.` : 'Hey Memoraa.'}
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

            {/* Text input fallback (always available) */}
            <form
              onSubmit={(e) => { e.preventDefault(); sendText() }}
              style={{
                width: '100%', display: 'flex', gap: 8, alignItems: 'center',
                background: 'rgba(13,21,37,0.6)',
                border: '1px solid rgba(0,212,255,0.12)',
                borderRadius: 14, padding: '6px 6px 6px 14px',
                backdropFilter: 'blur(8px)',
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={voiceSupported ? 'Or type a message...' : 'Voice not supported — type here'}
                disabled={orbState === 'thinking'}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text)', fontFamily: "'Sora', sans-serif", fontSize: 14,
                  padding: '8px 0',
                }}
              />
              <button
                type="submit"
                disabled={!textInput.trim() || orbState === 'thinking'}
                style={{
                  background: textInput.trim() ? 'var(--cyan)' : 'rgba(255,255,255,0.06)',
                  color: textInput.trim() ? '#000' : 'var(--muted-light)',
                  border: 'none', borderRadius: 10, padding: '8px 14px',
                  fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: textInput.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s',
                }}
              >
                Send
              </button>
            </form>

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
                  {memories.length} {memories.length === 1 ? 'memory' : 'memories'} · synced to your account
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
                  <MemoryChip key={m.id} id={m.id} text={m.fact} index={i} onDelete={deleteMemory} />
                ))
              )}
            </div>
          </div>
        )}

        {/* ── PROFILE VIEW ── */}
        {view === 'profile' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '4px 24px 32px', overflowY: 'auto',
            animation: 'fadeIn 0.3s ease', gap: 18,
          }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.4px' }}>
                Profile
              </h2>
              <p style={{
                fontSize: 11, color: 'var(--muted)', marginTop: 3,
                fontFamily: "'Space Mono', monospace",
              }}>
                Personalize how Memoraa speaks to you
              </p>
            </div>

            {/* Account card */}
            <div style={{
              background: 'rgba(0,229,255,0.04)',
              border: '1px solid rgba(0,229,255,0.15)',
              borderRadius: 14, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'Space Mono', monospace", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Signed in as
                </p>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#00e5ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  @{user?.username || 'user'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted-light)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.primaryEmailAddress?.emailAddress || user?.primaryPhoneNumber?.phoneNumber || ''}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                style={{
                  background: 'rgba(255,60,60,0.07)',
                  border: '1px solid rgba(255,60,60,0.22)',
                  borderRadius: 10, padding: '8px 14px',
                  color: 'rgba(255,120,120,0.85)',
                  fontFamily: "'Space Mono', monospace", fontSize: 11,
                  cursor: 'pointer', flexShrink: 0,
                }}
              >
                Sign out
              </button>
            </div>

            {/* Name field */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                fontSize: 11, color: 'var(--muted-light)',
                fontFamily: "'Space Mono', monospace",
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Your name
              </span>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile(p => ({ ...p, name: e.target.value.slice(0, 40) }))}
                placeholder="What should I call you?"
                style={{
                  background: 'rgba(13,21,37,0.6)',
                  border: '1px solid rgba(0,212,255,0.15)',
                  borderRadius: 12, padding: '12px 14px',
                  color: 'var(--text)', fontFamily: "'Sora', sans-serif",
                  fontSize: 14, outline: 'none',
                }}
              />
            </label>

            {/* Language picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                fontSize: 11, color: 'var(--muted-light)',
                fontFamily: "'Space Mono', monospace",
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                Language
              </span>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
              }}>
                {LANGUAGES.map(l => {
                  const selected = profile.language === l.code
                  return (
                    <button
                      key={l.code}
                      onClick={() => setProfile(p => ({ ...p, language: l.code }))}
                      style={{
                        background: selected ? 'rgba(0,229,255,0.1)' : 'rgba(13,21,37,0.6)',
                        border: `1px solid ${selected ? 'rgba(0,229,255,0.35)' : 'rgba(255,255,255,0.07)'}`,
                        borderRadius: 12, padding: '10px 12px',
                        color: selected ? '#00e5ff' : 'var(--text)',
                        fontFamily: "'Sora', sans-serif", fontSize: 12,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.2s',
                        display: 'flex', flexDirection: 'column', gap: 2,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{l.native}</span>
                      <span style={{
                        fontSize: 10, color: 'var(--muted-light)',
                        fontFamily: "'Space Mono', monospace",
                      }}>
                        {l.code}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Voice status */}
            <div style={{
              background: voiceSupported ? 'rgba(0,229,255,0.05)' : 'rgba(255,170,0,0.05)',
              border: `1px solid ${voiceSupported ? 'rgba(0,229,255,0.15)' : 'rgba(255,170,0,0.2)'}`,
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>{voiceSupported ? '🎙️' : '⚠️'}</span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                  {voiceSupported ? 'Voice input ready' : 'Voice input unavailable'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--muted-light)', lineHeight: 1.5 }}>
                  {voiceSupported
                    ? 'Tap the orb to speak. Browser speech recognition is supported.'
                    : 'This browser doesn\'t support speech recognition. Use the text box on the home screen, or open in Chrome.'}
                </p>
              </div>
            </div>

            <p style={{
              fontSize: 10, color: 'var(--muted)',
              fontFamily: "'Space Mono', monospace",
              letterSpacing: '0.1em', textAlign: 'center', marginTop: 'auto', paddingTop: 18,
            }}>
              🔒 Profile stays in your account
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
