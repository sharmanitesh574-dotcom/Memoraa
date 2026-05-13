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

// ── TTS voice per language (OpenAI tts-1 voices are multilingual but timbre differs) ──
const VOICE_BY_LANG = {
  'en-US': 'nova',
  'en-GB': 'fable',
  'en-IN': 'nova',
  'hi-IN': 'shimmer',
  'es-ES': 'nova',
  'fr-FR': 'shimmer',
  'de-DE': 'alloy',
  'it-IT': 'shimmer',
  'pt-BR': 'nova',
  'ja-JP': 'shimmer',
  'ko-KR': 'shimmer',
  'zh-CN': 'alloy',
  'ar-SA': 'onyx',
  'ru-RU': 'onyx',
}
const DEFAULT_VOICE = 'nova'

// Keep conversation context bounded — long-term info lives in `memories`
const MAX_HISTORY_MESSAGES = 16

// ── Aurora background (replaces grain + ambient) ───────────────
function Aurora({ state }) {
  // Subtle state-tinted aurora that drifts behind the orb.
  const tint = state === 'listening' ? '#00e5ff'
    : state === 'thinking' ? '#7b5ea7'
    : state === 'speaking' ? '#00ff9d'
    : '#1a6fff'

  return (
    <>
      {/* Deep base gradient */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(26,111,255,0.12) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 0% 0%, rgba(123,94,167,0.08) 0%, transparent 55%), linear-gradient(180deg, #03050a 0%, #05070d 100%)',
      }} />

      {/* Drifting state-tinted aurora */}
      <div style={{
        position: 'fixed', inset: '-10%', zIndex: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 50% 40% at 50% 80%, ${tint}22 0%, transparent 65%)`,
        filter: 'blur(40px)',
        animation: 'aurora-drift 18s ease-in-out infinite',
        transition: 'background 1.2s var(--ease-out)',
      }} />

      {/* Whisper-thin starfield */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage:
          'radial-gradient(1px 1px at 17% 28%, rgba(255,255,255,0.6) 50%, transparent 100%),' +
          'radial-gradient(1px 1px at 73% 14%, rgba(255,255,255,0.45) 50%, transparent 100%),' +
          'radial-gradient(1px 1px at 41% 67%, rgba(255,255,255,0.35) 50%, transparent 100%),' +
          'radial-gradient(1px 1px at 88% 82%, rgba(255,255,255,0.5) 50%, transparent 100%),' +
          'radial-gradient(1px 1px at 24% 91%, rgba(255,255,255,0.4) 50%, transparent 100%)',
        animation: 'star-twinkle 7s ease-in-out infinite',
      }} />
    </>
  )
}

// ── Speaking waveform bars ─────────────────────────────────────
function WaveBar({ delay }) {
  // Outer scales by --lv (live amplitude from the TTS analyser, set on the
  // wrapper). Inner runs the rhythm keyframe. Composed transforms multiply.
  return (
    <div style={{
      transform: 'scaleY(var(--lv, 0.5))',
      transformOrigin: 'center',
      transition: 'transform 0.06s linear',
    }}>
      <div style={{
        width: 3, height: 26, borderRadius: 999,
        background: 'linear-gradient(180deg, #00e5ff 0%, #1a6fff 100%)',
        boxShadow: '0 0 10px rgba(0,229,255,0.65)',
        animation: `speaking-wave 0.85s var(--ease-in-out) ${delay}s infinite`,
        transformOrigin: 'center',
      }} />
    </div>
  )
}

// ── Orb ────────────────────────────────────────────────────────
function Orb({ state, onClick, levelRef }) {
  const isListening = state === 'listening'
  const isThinking = state === 'thinking'
  const isSpeaking = state === 'speaking'
  const reactive = isListening || isSpeaking

  const bodyRef = useRef(null)
  const haloRef = useRef(null)
  const wavesRef = useRef(null)

  // Live amplitude → scale + glow. Runs only while listening/speaking.
  // Uses refs (no React re-renders) so it stays smooth at 60fps.
  useEffect(() => {
    if (!reactive || !levelRef) return
    let raf = 0
    let displayed = 0
    const loop = () => {
      const target = Math.min(1, Math.max(0, levelRef.current || 0))
      // Critically-damped follow for natural motion.
      displayed += (target - displayed) * 0.28
      const bump = displayed * (isListening ? 0.16 : 0.13)
      const scale = 1 + bump
      const glow = 0.5 + displayed * 0.5
      if (bodyRef.current) {
        bodyRef.current.style.transform = `scale(${scale.toFixed(4)})`
      }
      if (haloRef.current) {
        haloRef.current.style.opacity = glow.toFixed(3)
        haloRef.current.style.transform = `scale(${(1 + bump * 0.6).toFixed(4)})`
      }
      if (wavesRef.current && isSpeaking) {
        wavesRef.current.style.setProperty('--lv', String(0.4 + displayed * 0.6))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (bodyRef.current) bodyRef.current.style.transform = ''
      if (haloRef.current) {
        haloRef.current.style.opacity = ''
        haloRef.current.style.transform = ''
      }
    }
  }, [reactive, isListening, isSpeaking, levelRef])

  const orbGradient = isThinking
    ? 'conic-gradient(from 210deg, #00e5ff 0deg, #7b5ea7 120deg, #1a6fff 240deg, #00e5ff 360deg)'
    : isSpeaking
    ? 'radial-gradient(circle at 38% 34%, #b6ffe6 0%, #00ff9d 22%, #00d4ff 50%, #1a6fff 78%, #1a1238 100%)'
    : isListening
    ? 'radial-gradient(circle at 38% 34%, #b6f3ff 0%, #00e5ff 30%, #1a6fff 65%, #2a1a55 100%)'
    : 'radial-gradient(circle at 36% 32%, #9eeaff 0%, #00bfff 32%, #1a6fff 62%, #4a2d7a 88%, #0d1525 100%)'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={state === 'idle' ? 'Tap to start listening' : state === 'listening' ? 'Tap to stop' : 'Tap to interrupt'}
      style={{
        position: 'relative', width: 220, height: 220,
        background: 'transparent', border: 'none', padding: 0,
        flexShrink: 0, userSelect: 'none', WebkitUserSelect: 'none',
        borderRadius: '50%',
      }}
    >
      {/* Idle pulse rings */}
      {state === 'idle' && [0, 1].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: -22, borderRadius: '50%',
          border: '1px solid rgba(0, 229, 255, 0.16)',
          animation: `pulse-ring 4s var(--ease-out) ${i * 2}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Listening rings */}
      {isListening && [0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          border: `1.5px solid rgba(0, 229, 255, ${0.55 - i * 0.14})`,
          animation: `listen-ring 1.5s var(--ease-out) ${i * 0.5}s infinite`,
          pointerEvents: 'none',
        }} />
      ))}

      {/* Outer halo */}
      <div ref={haloRef} style={{
        position: 'absolute', inset: -40, borderRadius: '50%',
        background: isListening
          ? 'radial-gradient(circle, rgba(0,229,255,0.25) 0%, transparent 60%)'
          : isSpeaking
          ? 'radial-gradient(circle, rgba(0,255,157,0.22) 0%, transparent 60%)'
          : isThinking
          ? 'radial-gradient(circle, rgba(123,94,167,0.25) 0%, transparent 60%)'
          : 'radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 60%)',
        filter: 'blur(20px)',
        transition: 'background 0.8s var(--ease-out), opacity 0.18s linear, transform 0.12s var(--ease-out)',
        pointerEvents: 'none',
      }} />

      {/* Orb body */}
      <div ref={bodyRef} style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: orbGradient,
        // When reactive, we drive scale via rAF, so disable the breathe loop.
        animation: isThinking
          ? 'thinking-orbit 2.2s linear infinite, breathe 2.6s var(--ease-in-out) infinite'
          : reactive
          ? 'none'
          : 'breathe 4.2s var(--ease-in-out) infinite',
        willChange: reactive ? 'transform' : 'auto',
        boxShadow: isListening
          ? '0 0 80px 18px rgba(0,229,255,0.42), 0 0 200px 60px rgba(123,94,167,0.18), inset 0 0 60px rgba(255,255,255,0.08), inset 0 -20px 60px rgba(0,0,0,0.3)'
          : isSpeaking
          ? '0 0 80px 18px rgba(0,255,157,0.32), 0 0 200px 60px rgba(0,212,255,0.18), inset 0 0 60px rgba(255,255,255,0.1), inset 0 -20px 60px rgba(0,0,0,0.3)'
          : isThinking
          ? '0 0 70px 14px rgba(123,94,167,0.32), 0 0 180px 50px rgba(0,212,255,0.12), inset 0 0 60px rgba(255,255,255,0.08), inset 0 -20px 60px rgba(0,0,0,0.3)'
          : '0 0 60px 10px rgba(0,212,255,0.18), 0 0 140px 40px rgba(123,94,167,0.1), inset 0 0 60px rgba(255,255,255,0.06), inset 0 -20px 60px rgba(0,0,0,0.35)',
        transition: reactive
          ? 'box-shadow 0.4s var(--ease-out), background 0.8s var(--ease-out)'
          : 'box-shadow 0.8s var(--ease-out), background 0.8s var(--ease-out), transform 0.4s var(--ease-out)',
      }}>
        {/* Specular highlight (top-left) */}
        <div style={{
          position: 'absolute', top: '12%', left: '18%',
          width: '40%', height: '30%', borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.1) 45%, transparent 75%)',
          filter: 'blur(4px)',
          pointerEvents: 'none',
        }} />
        {/* Secondary specular (smaller, brighter) */}
        <div style={{
          position: 'absolute', top: '18%', left: '26%',
          width: '14%', height: '10%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, transparent 70%)',
          filter: 'blur(2px)',
          pointerEvents: 'none',
        }} />
        {/* Bottom-right glow */}
        <div style={{
          position: 'absolute', bottom: '12%', right: '14%',
          width: '32%', height: '24%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(123,94,167,0.5) 0%, transparent 70%)',
          filter: 'blur(10px)',
          pointerEvents: 'none',
        }} />
        {/* Rim light */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.4)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* Speaking waveform overlay */}
      {isSpeaking && (
        <div ref={wavesRef} style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          animation: 'fadeIn 0.4s var(--ease-out)',
          pointerEvents: 'none',
          // CSS custom property the WaveBar reads to scale its height
          // (set per-frame from levelRef)
          '--lv': 0.5,
        }}>
          {[0, 0.08, 0.18, 0.08, 0].map((d, i) => (
            <WaveBar key={i} delay={d} />
          ))}
        </div>
      )}
    </button>
  )
}

// ── Bottom tab bar ─────────────────────────────────────────────
function TabIcon({ name, active }) {
  const stroke = active ? '#00e5ff' : 'rgba(238,243,251,0.55)'
  if (name === 'home') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3.2" fill={active ? '#00e5ff' : 'none'} />
      </svg>
    )
  }
  if (name === 'memories') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 2.8V14a3 3 0 0 0 3 3 3 3 0 0 0 3 3V4z" />
        <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 2.8V14a3 3 0 0 1-3 3 3 3 0 0 1-3 3V4z" />
      </svg>
    )
  }
  // profile
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" />
    </svg>
  )
}

function BottomNav({ view, setView, memoriesCount, profileInitial }) {
  const tabs = [
    { id: 'home', icon: 'home', label: 'Talk' },
    { id: 'memories', icon: 'memories', label: 'Memory', badge: memoriesCount },
    { id: 'profile', icon: 'profile', label: profileInitial ? profileInitial : 'You' },
  ]
  return (
    <nav
      role="tablist"
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 12px calc(8px + env(safe-area-inset-bottom))',
        background: 'rgba(5,7,13,0.7)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderTop: '1px solid var(--border-1)',
        zIndex: 5,
      }}
    >
      {tabs.map(t => {
        const active = view === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => setView(t.id)}
            style={{
              flex: 1, maxWidth: 96,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '8px 6px',
              background: 'transparent', border: 'none',
              color: active ? 'var(--accent)' : 'var(--text-3)',
              cursor: 'pointer',
              borderRadius: 'var(--r-md)',
              transition: 'color 0.25s var(--ease-out), transform 0.2s var(--ease-out)',
            }}
          >
            <span style={{
              position: 'relative',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 28, borderRadius: 14,
              background: active ? 'rgba(0,229,255,0.12)' : 'transparent',
              transition: 'background 0.25s var(--ease-out)',
            }}>
              <TabIcon name={t.icon} active={active} />
              {t.badge > 0 && t.id === 'memories' && (
                <span style={{
                  position: 'absolute', top: -2, right: -4,
                  minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 999,
                  background: 'var(--accent)', color: '#001018',
                  fontSize: 9, fontWeight: 700,
                  fontFamily: 'var(--font)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 8px rgba(0,229,255,0.5)',
                }}>
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </span>
            <span style={{
              fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
              fontFamily: 'var(--font)',
            }}>
              {t.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

// ── Memory chip ────────────────────────────────────────────────
const CATEGORY_META = {
  person: { icon: '👤', color: 'rgba(255,180,120,0.85)' },
  event: { icon: '📅', color: 'rgba(255,140,200,0.85)' },
  preference: { icon: '⭐', color: 'rgba(255,220,120,0.85)' },
  goal: { icon: '🎯', color: 'rgba(120,220,180,0.85)' },
  feeling: { icon: '💭', color: 'rgba(180,160,255,0.85)' },
  todo: { icon: '✅', color: 'rgba(120,200,255,0.85)' },
  health: { icon: '🩺', color: 'rgba(255,140,140,0.85)' },
  other: { icon: '·', color: 'rgba(200,200,200,0.85)' },
}

function MemoryChip({ id, text, category, dueAt, index, onDelete }) {
  const [hovering, setHovering] = useState(false)
  const meta = (category && CATEGORY_META[category]) || null
  const dueLabel = (() => {
    if (!dueAt) return null
    const d = new Date(dueAt)
    if (isNaN(d)) return null
    const diff = Math.round((d - Date.now()) / 86400000)
    if (diff < -1) return `${Math.abs(diff)}d ago`
    if (diff === -1) return 'yesterday'
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    if (diff < 7) return `in ${diff}d`
    return d.toISOString().slice(0, 10)
  })()
  const isOverdue = dueLabel && /ago|yesterday/.test(dueLabel)

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        background: hovering ? 'var(--surface-2)' : 'var(--surface-1)',
        border: `1px solid ${hovering ? 'var(--border-2)' : 'var(--border-1)'}`,
        borderRadius: 'var(--r-md)', padding: '13px 14px',
        animation: `fadeUp 0.4s var(--ease-spring) ${Math.min(index, 8) * 0.035}s both`,
        position: 'relative',
        transition: 'background 0.2s var(--ease-out), border-color 0.2s, transform 0.2s',
        transform: hovering ? 'translateY(-1px)' : 'translateY(0)',
        boxShadow: hovering ? 'var(--elev-2)' : 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {meta && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: meta.color, letterSpacing: '0.06em', textTransform: 'uppercase',
                fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 11 }}>{meta.icon}</span>{category}
              </span>
            )}
            {dueLabel && (
              <span style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: isOverdue ? 'var(--rose)' : 'var(--amber)',
                letterSpacing: '0.04em', fontWeight: 500,
                background: isOverdue ? 'rgba(255,107,138,0.1)' : 'rgba(255,180,84,0.1)',
                border: `1px solid ${isOverdue ? 'rgba(255,107,138,0.25)' : 'rgba(255,180,84,0.22)'}`,
                padding: '1px 7px', borderRadius: 'var(--r-sm)',
              }}>
                {dueLabel}
              </span>
            )}
            <span style={{
              color: 'var(--text-faint)', fontFamily: 'var(--font-mono)',
              fontSize: 9, letterSpacing: '0.1em', marginLeft: 'auto',
            }}>
              #{String(index + 1).padStart(3, '0')}
            </span>
          </div>
          <p style={{
            fontSize: 14, color: 'var(--text-2)', lineHeight: 1.55,
            wordBreak: 'break-word',
          }}>
            {text}
          </p>
        </div>
        {hovering && (
          <button
            onClick={() => onDelete(id)}
            aria-label="Delete memory"
            style={{
              background: 'rgba(255,107,138,0.08)',
              border: '1px solid rgba(255,107,138,0.2)',
              borderRadius: 'var(--r-sm)', padding: 0,
              width: 26, height: 26,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--rose)', cursor: 'pointer',
              flexShrink: 0, transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.16)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.08)'}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Chat log ───────────────────────────────────────────────────
function ChatLog({ history, streamingUser, streamingReply, streaming }) {
  const scrollRef = useRef(null)

  // Build display: last few stored turns, plus the in-flight pair while
  // streaming (transcript not yet in history, partial reply not yet final).
  const recent = history.slice(-6)
  const display = [...recent]
  if (streaming) {
    if (streamingUser) {
      display.push({ role: 'user', content: streamingUser, ephemeral: true })
    }
    if (streamingReply) {
      display.push({ role: 'assistant', content: streamingReply, ephemeral: true, streaming: true })
    }
  }

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // smooth-scroll to bottom on new content
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [display.length, streamingReply])

  if (display.length === 0) return null

  return (
    <div
      ref={scrollRef}
      style={{
        width: '100%',
        maxHeight: 260,
        overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 8,
        padding: '4px 2px',
        scrollbarWidth: 'thin',
        WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 18px, #000 calc(100% - 8px), transparent 100%)',
        maskImage: 'linear-gradient(180deg, transparent 0%, #000 18px, #000 calc(100% - 8px), transparent 100%)',
      }}
    >
      {display.map((m, i) => {
        const isUser = m.role === 'user'
        const isLatest = i === display.length - 1
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: isUser ? 'flex-end' : 'flex-start',
              animation: m.ephemeral ? 'fadeUp 0.3s var(--ease-spring) both' : undefined,
            }}
          >
            <div style={{
              maxWidth: '86%',
              padding: isUser ? '8px 12px' : '10px 14px',
              borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: isUser
                ? 'var(--surface-2)'
                : 'linear-gradient(180deg, rgba(13,21,37,0.7) 0%, rgba(13,21,37,0.5) 100%)',
              border: isUser
                ? '1px solid var(--border-1)'
                : '1px solid var(--border-accent)',
              backdropFilter: isUser ? 'none' : 'blur(12px) saturate(140%)',
              WebkitBackdropFilter: isUser ? 'none' : 'blur(12px) saturate(140%)',
              boxShadow: isLatest && !isUser ? 'var(--elev-2)' : 'none',
            }}>
              {!isUser && isLatest && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'var(--accent)',
                    boxShadow: '0 0 6px var(--accent-glow)',
                  }} />
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-mono)',
                    color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase',
                    fontWeight: 500,
                  }}>
                    Memoraa
                  </span>
                </div>
              )}
              <p style={{
                fontSize: isUser ? 13.5 : 14,
                lineHeight: 1.5,
                color: isUser ? 'var(--text-2)' : 'var(--text)',
                fontWeight: 400,
                wordBreak: 'break-word',
              }}>
                {m.content}
                {m.streaming && (
                  <span style={{
                    display: 'inline-block', width: 6, height: 13,
                    background: 'var(--accent)', marginLeft: 3,
                    verticalAlign: 'text-bottom',
                    animation: 'caret-blink 1s steps(1) infinite',
                    borderRadius: 1,
                  }} />
                )}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Reply bubble (kept for nudge previews / standalone) ───────
function ReplyBubble({ text, streaming }) {
  if (!text) return null
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(180deg, rgba(13,21,37,0.85) 0%, rgba(13,21,37,0.65) 100%)',
      border: '1px solid var(--border-accent)',
      borderRadius: 'var(--r-lg)', padding: '14px 16px 16px',
      animation: 'slideUp 0.45s var(--ease-spring)',
      backdropFilter: 'blur(16px) saturate(140%)',
      WebkitBackdropFilter: 'blur(16px) saturate(140%)',
      boxShadow: 'var(--elev-2)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--accent)',
          boxShadow: '0 0 8px var(--accent-glow)',
        }} />
        <span style={{
          fontSize: 10, fontFamily: 'var(--font-mono)',
          color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
          Memoraa
        </span>
      </div>
      <p style={{
        fontSize: 15, lineHeight: 1.55,
        color: 'var(--text)',
        fontWeight: 400,
      }}>
        {text}
        {streaming && (
          <span style={{
            display: 'inline-block', width: 7, height: 14,
            background: 'var(--accent)', marginLeft: 3,
            verticalAlign: 'text-bottom',
            animation: 'caret-blink 1s steps(1) infinite',
            borderRadius: 1,
          }} />
        )}
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
          border: '2px solid rgba(0,229,255,0.18)', borderTopColor: '#00e5ff',
          animation: 'spin 1s linear infinite' }} />
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
  const [memorySearch, setMemorySearch] = useState('')
  const [memorySearchResults, setMemorySearchResults] = useState(null)
  const [memoryCategory, setMemoryCategory] = useState('all')
  const [prefs, setPrefs] = useState({ nudge_enabled: false, nudge_local_hour: 9, timezone: 'UTC' })
  const [pendingNudge, setPendingNudge] = useState(null)
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

  // Whisper / OpenAI-TTS plumbing
  const recorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  const audioPlayerRef = useRef(null)

  // Streaming-TTS sequenced queue (preserves sentence order even if fetches race)
  const ttsSeqRef = useRef(0)          // next sequence to assign
  const ttsNextPlayRef = useRef(0)     // next sequence to play
  const ttsSlotsRef = useRef(new Map()) // seq -> null (pending) | { url } | { skip: true }
  const ttsAbortsRef = useRef(new Set()) // in-flight AbortControllers (for interrupts)
  const audioPlayingRef = useRef(false)
  const streamDoneRef = useRef(false)
  const streamAbortRef = useRef(null)

  // Voice-activity detection (auto-stop listening on silence)
  const vadCleanupRef = useRef(null)

  // Live amplitude (0..1) — driven by VAD while listening, by AnalyserNode while speaking.
  // The Orb reads this via rAF and applies real-time transforms (no React re-render).
  const levelRef = useRef(0)

  // Shared AudioContext + Analyser for TTS playback reactivity
  const audioCtxRef = useRef(null)
  const analyserRef = useRef(null)
  const analyserBufRef = useRef(null)
  const ttsRafRef = useRef(0)

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

  // Debounced semantic search over memories
  useEffect(() => {
    const q = memorySearch.trim()
    if (!q) { setMemorySearchResults(null); return }
    const t = setTimeout(async () => {
      try {
        const r = await authedFetch(`/api/memories?q=${encodeURIComponent(q)}`)
        if (!r.ok) return
        const { memories: rows } = await r.json()
        setMemorySearchResults(Array.isArray(rows) ? rows : [])
      } catch {}
    }, 250)
    return () => clearTimeout(t)
  }, [memorySearch, authedFetch])

  // Load prefs + pending nudge once signed in
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [pr, nr] = await Promise.all([
          authedFetch('/api/prefs').then(r => r.ok ? r.json() : null).catch(() => null),
          authedFetch('/api/nudges').then(r => r.ok ? r.json() : null).catch(() => null),
        ])
        if (cancelled) return
        if (pr?.prefs) setPrefs(pr.prefs)
        if (nr?.nudge) setPendingNudge(nr.nudge)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [authedFetch])

  // Persist profile
  useEffect(() => {
    localStorage.setItem('memoraa_profile_v1', JSON.stringify(profile))
  }, [profile])

  // Save a pref patch — auto-fills timezone from the browser
  const savePrefs = useCallback(async (patch) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    const next = { ...prefs, timezone: tz, ...patch }
    setPrefs(next)
    try {
      await authedFetch('/api/prefs', {
        method: 'POST',
        body: JSON.stringify(next),
      })
    } catch {}
  }, [authedFetch, prefs])

  const dismissNudge = useCallback(async (nudge) => {
    if (!nudge) return
    setPendingNudge(null)
    try {
      await authedFetch('/api/nudges', {
        method: 'POST',
        body: JSON.stringify({ id: nudge.id, action: 'dismissed' }),
      })
    } catch {}
  }, [authedFetch])

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

  // Stop any running audio capture/playback on unmount
  useEffect(() => () => {
    try { recognitionRef.current?.abort?.() } catch {}
    try { recorderRef.current?.stop?.() } catch {}
    try { vadCleanupRef.current?.() } catch {}
    try { mediaStreamRef.current?.getTracks?.().forEach(t => t.stop()) } catch {}
    try { audioPlayerRef.current?.pause?.() } catch {}
    try { synthRef.current?.cancel?.() } catch {}
    try { cancelAnimationFrame(ttsRafRef.current) } catch {}
    try { audioCtxRef.current?.close?.() } catch {}
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

  // System prompt — memory block is injected server-side in /api/chat
  const buildSystemPrompt = useCallback(() => {
    const lang = LANGUAGES.find(l => l.code === profile.language) || LANGUAGES[0]
    const today = new Date().toISOString().slice(0, 10)
    const nameLine = profile.name ? ` The user's name is ${profile.name}; use it sparingly, not every reply.` : ''

    return `You are Memoraa. Talk like a real friend in their late twenties who has known this person for a while, not an AI assistant. The person is speaking to you out loud and hears your reply spoken back — write for the ear, not the page.${nameLine}

Today is ${today}. Use this to resolve relative dates ("Thursday", "next week", "tomorrow").
Match the user's language and register: ${lang.label} (${lang.native}) by default; switch when they switch. Hinglish is fine if they mix.

Personality:
- Curious like a journalist — sharper follow-ups, not generic "tell me more".
- Warm like an older sibling — caring but not coddling.
- Direct like a coach — you have opinions, you push back gently when they're being hard on themselves, you name what they keep avoiding.
- Quietly observant — you notice patterns across what they've said before.

Voice mechanics:
- Use contractions ("you're", "i'm", "that's").
- Short sentences. Vary the length. Sometimes one word ("yeah", "huh", "ouch") is the right reply.
- Get to the substance in the first sentence — no preambles, no "great question", no "let me think".
- No em-dashes mid-sentence (they sound stilted spoken). Use commas or full stops.
- Lowercase casual register is fine; this is conversation, not an essay.
- 1 to 3 sentences. Never more than 3 unless they ask for detail.

Reference what you remember. When a memory fits the moment, weave it in concretely: don't say "i remember you mentioned that", just use the detail. Example: instead of "i recall you have a sister", say "is this the same week your sister is visiting?".

NEVER say:
- "That's wonderful!" / "How exciting!" / "Amazing!" / "I love that!"
- "I'm here for you" / "I'm so glad you shared that" / "Thank you for trusting me"
- "Tell me more" / "How does that make you feel?" / "Can you elaborate?"
- "That sounds tough" as the whole reply.
- "What about you?" as a reflexive deflection.
- "As an AI…" or "I'm just an assistant…" unless they directly ask if you're AI.
- "I understand" / "That makes sense" without then showing why.
- Multiple exclamation points. Be excited at most once, with a single mark.

DO say things like:
- "okay so you've mentioned the Monday meeting three times this week, is it the meeting or one specific person in it?"
- "honestly that doesn't sound like a phase to me, that sounds like the thing."
- "yeah, that's a lot."
- "wait, weren't you supposed to hear back from David by yesterday? did you?"
- "i think you're being harder on yourself than this needs you to be."

When they ask what you remember ("what did i tell you about…", "do you remember…", "tell me about my…"), answer directly from the memories you have. Pull 2 or 3 of the most relevant facts and weave them into a single short sentence or two. If you have nothing useful, say so plainly.

When something hard lands, sit with it for a beat before redirecting. Sometimes "yeah, that's hard" with no follow-up question is the right reply. Don't reflexively ask a question at the end of every turn.

Never say "I'm an AI" unless directly asked.

After your reply, on a NEW LINE, output this whenever the user shares any personal detail (name, work, location, family, friends, mood, goal, plan, opinion, preference, hobby, frustration, win, fear, hope, routine, health, time-bound thing):
MEMORY_JSON: {"remember": "concise third-person fact about the user", "category": "one of: person | event | preference | goal | feeling | todo | health | other", "due_at": "ISO date YYYY-MM-DD if the fact references a future or recent time, otherwise omit"}

due_at examples:
- "I have a doctor appointment Thursday" → category: "event", due_at: next Thursday's date.
- "I need to call mom tomorrow" → category: "todo", due_at: tomorrow's date.
- "My birthday is March 12" → category: "event", due_at: next March 12.
Omit due_at for timeless facts (preferences, traits, ongoing goals, feelings).

Be generous with memories — small details are valuable. Do NOT output MEMORY_JSON if the message is a pure question with no personal content. Never fabricate memories.`
  }, [profile.name, profile.language])

  // ── Audio queue (sentence-by-sentence TTS, order-preserving) ──
  const resetAudioQueue = useCallback(() => {
    streamDoneRef.current = false
    if (streamAbortRef.current) {
      try { streamAbortRef.current.abort() } catch {}
      streamAbortRef.current = null
    }
    for (const ac of ttsAbortsRef.current) {
      try { ac.abort() } catch {}
    }
    ttsAbortsRef.current.clear()
    if (audioPlayerRef.current) {
      try { audioPlayerRef.current.pause(); audioPlayerRef.current.src = '' } catch {}
      audioPlayerRef.current = null
    }
    for (const slot of ttsSlotsRef.current.values()) {
      if (slot && slot.url) { try { URL.revokeObjectURL(slot.url) } catch {} }
    }
    ttsSlotsRef.current.clear()
    ttsSeqRef.current = 0
    ttsNextPlayRef.current = 0
    audioPlayingRef.current = false
  }, [])

  // Wire a TTS <audio> element through a shared AudioContext + AnalyserNode
  // so we can drive the orb pulse from the real playback amplitude. Returns a
  // stop fn that detaches the rAF loop and the per-source MediaElementNode.
  const attachAnalyser = useCallback((audio) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return () => {}
      if (!audioCtxRef.current) {
        audioCtxRef.current = new Ctx()
        const an = audioCtxRef.current.createAnalyser()
        an.fftSize = 256
        an.smoothingTimeConstant = 0.65
        analyserRef.current = an
        analyserBufRef.current = new Uint8Array(an.fftSize)
      }
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') { try { ctx.resume() } catch {} }
      const an = analyserRef.current
      const buf = analyserBufRef.current
      const src = ctx.createMediaElementSource(audio)
      src.connect(an)
      src.connect(ctx.destination)
      let raf = 0
      const tick = () => {
        an.getByteTimeDomainData(buf)
        let s = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          s += v * v
        }
        const rms = Math.sqrt(s / buf.length)
        // Map TTS RMS (~0.04..0.2 typical) onto 0..1 with a soft knee.
        levelRef.current = Math.min(1, Math.pow(rms * 7, 0.6))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      ttsRafRef.current = raf
      return () => {
        try { cancelAnimationFrame(raf) } catch {}
        try { src.disconnect() } catch {}
        levelRef.current = 0
      }
    } catch {
      return () => {}
    }
  }, [])

  // Drain slots strictly in sequence: only play `next` once its blob is ready.
  // Pending fetches (slot === null) block the queue; skipped (failed) slots
  // are stepped over without playing.
  const drainQueue = useCallback(() => {
    if (audioPlayingRef.current) return
    while (true) {
      const next = ttsNextPlayRef.current
      if (!ttsSlotsRef.current.has(next)) {
        // No slot enqueued for this seq yet. If stream finished and nothing
        // pending, we're done.
        if (streamDoneRef.current && ttsSlotsRef.current.size === 0) {
          setOrbState('idle')
          setStatusText('Tap the orb to speak')
        }
        return
      }
      const slot = ttsSlotsRef.current.get(next)
      if (slot === null) return // still fetching — wait
      ttsSlotsRef.current.delete(next)
      ttsNextPlayRef.current = next + 1
      if (slot.skip) continue
      audioPlayingRef.current = true
      setOrbState('speaking')
      setStatusText('Speaking…')
      const url = slot.url
      const audio = new Audio(url)
      audioPlayerRef.current = audio
      const detachAnalyser = attachAnalyser(audio)
      const cleanup = () => {
        try { detachAnalyser() } catch {}
        try { URL.revokeObjectURL(url) } catch {}
        audioPlayingRef.current = false
        if (audioPlayerRef.current === audio) audioPlayerRef.current = null
        drainQueue()
      }
      audio.onended = cleanup
      audio.onerror = cleanup
      audio.play().catch(cleanup)
      return
    }
  }, [attachAnalyser])

  const enqueueTTS = useCallback(async (text) => {
    const t = (text || '').trim()
    if (!t) return
    const seq = ttsSeqRef.current++
    ttsSlotsRef.current.set(seq, null) // reserve slot now to preserve order
    const ac = new AbortController()
    ttsAbortsRef.current.add(ac)
    try {
      const token = await getToken()
      const voice = VOICE_BY_LANG[langRef.current] || DEFAULT_VOICE
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: t, voice, model: 'tts-1' }),
        signal: ac.signal,
      })
      ttsAbortsRef.current.delete(ac)
      // Slot may have been cleared by resetAudioQueue mid-flight
      if (!ttsSlotsRef.current.has(seq)) return
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn('[memoraa] /api/tts chunk failed', res.status)
        ttsSlotsRef.current.set(seq, { skip: true })
        drainQueue()
        return
      }
      const blob = await res.blob()
      if (!ttsSlotsRef.current.has(seq)) return
      const url = URL.createObjectURL(blob)
      ttsSlotsRef.current.set(seq, { url, text: t })
      drainQueue()
    } catch (err) {
      ttsAbortsRef.current.delete(ac)
      if (err?.name === 'AbortError') return
      // eslint-disable-next-line no-console
      console.warn('[memoraa] tts chunk error:', err)
      if (ttsSlotsRef.current.has(seq)) {
        ttsSlotsRef.current.set(seq, { skip: true })
        drainQueue()
      }
    }
  }, [getToken, drainQueue])

  // Find the index just past the LAST sentence terminator in `text`.
  // Returns -1 if no full sentence is available yet.
  const lastSentenceEnd = (text) => {
    let last = -1
    const re = /[.!?]+(?:\s|$)/g
    let m
    while ((m = re.exec(text)) !== null) {
      last = m.index + m[0].length
    }
    return last
  }

  // Call Claude (streaming SSE) — sentences are sent to TTS as they appear
  const callClaude = useCallback(async (userText) => {
    setOrbState('thinking')
    setStatusText('Thinking…')
    setError('')
    resetAudioQueue()

    const newHistory = [...history, { role: 'user', content: userText }]
    // Keep prompt bounded — long-term info lives in `memories` (loaded via system prompt)
    const sentHistory = newHistory.slice(-MAX_HISTORY_MESSAGES)
    const abort = new AbortController()
    streamAbortRef.current = abort

    try {
      const res = await authedFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: buildSystemPrompt(),
          messages: sentHistory,
          stream: true,
        }),
        signal: abort.signal,
      })

      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        throw new Error(`chat ${res.status}: ${detail.slice(0, 200)}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let sseBuffer = ''
      let fullText = ''
      let speechIdx = 0      // start of unspoken speech in fullText
      let memorySeenAt = -1  // index where MEMORY_JSON appears (or -1)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        sseBuffer += decoder.decode(value, { stream: true })

        let eventEnd
        while ((eventEnd = sseBuffer.indexOf('\n\n')) >= 0) {
          const block = sseBuffer.slice(0, eventEnd)
          sseBuffer = sseBuffer.slice(eventEnd + 2)
          const dataMatch = block.match(/^data: (.+)$/m)
          if (!dataMatch) continue
          let event
          try { event = JSON.parse(dataMatch[1]) } catch { continue }

          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text || ''

            // Update visible reply (strip the MEMORY tail when present)
            const visible = fullText.replace(/MEMORY[_\s]*JSON[\s\S]*$/i, '').trim()
            setReply(visible)

            // Lock in memory marker position once seen
            if (memorySeenAt < 0) {
              const idx = fullText.search(/MEMORY[_\s]*JSON/i)
              if (idx >= 0) memorySeenAt = idx
            }

            // How far we're allowed to speak
            const speechEnd = memorySeenAt >= 0 ? memorySeenAt : fullText.length
            if (speechIdx >= speechEnd) continue

            const slice = fullText.slice(speechIdx, speechEnd)
            const cut = lastSentenceEnd(slice)
            if (cut > 0) {
              const chunk = slice.slice(0, cut).trim()
              if (chunk) enqueueTTS(chunk)
              speechIdx += cut
            } else if (memorySeenAt >= 0 && speechIdx < memorySeenAt) {
              // Memory marker arrived without a final sentence terminator —
              // speak whatever's left up to the marker so we don't truncate
              const tail = fullText.slice(speechIdx, memorySeenAt).trim()
              if (tail) enqueueTTS(tail)
              speechIdx = memorySeenAt
            }
          }
        }
      }

      // Speak any remaining trailing text (no terminator at end)
      const speechEnd = memorySeenAt >= 0 ? memorySeenAt : fullText.length
      if (speechIdx < speechEnd) {
        const tail = fullText.slice(speechIdx, speechEnd).trim()
        if (tail) enqueueTTS(tail)
      }

      // Persist the clean reply to history + UI (capped to recent window)
      const cleanReply = fullText.replace(/```[\s\S]*?```|MEMORY[_\s]*JSON[\s\S]*$/gi, '').trim()
      setHistory([...newHistory, { role: 'assistant', content: cleanReply }].slice(-MAX_HISTORY_MESSAGES))
      setReply(cleanReply)

      // Memory extraction
      const memMatch = fullText.match(/MEMORY[_\s]*JSON\s*:?\s*`{0,3}\s*(\{[\s\S]*?"remember"[\s\S]*?\})/i)
      if (memMatch) {
        try {
          const parsed = JSON.parse(memMatch[1])
          const fact = (parsed.remember || '').toString().trim()
          const category = typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : null
          const dueAt = typeof parsed.due_at === 'string' && parsed.due_at.trim() ? parsed.due_at.trim() : null
          if (fact.length > 4) {
            const dup = memories.some(m => m.fact?.toLowerCase() === fact.toLowerCase())
            if (!dup) {
              authedFetch('/api/memories', {
                method: 'POST',
                body: JSON.stringify({ fact, category, due_at: dueAt }),
              }).then(async r => {
                if (!r.ok) return
                const { memory } = await r.json()
                if (memory) setMemories(prev => [memory, ...prev].slice(0, 200))
              }).catch(() => {})
            }
          }
        } catch {}
      }

      streamDoneRef.current = true
      // If audio queue already drained, go idle now; otherwise drainQueue handles it
      if (!audioPlayingRef.current && ttsSlotsRef.current.size === 0) {
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[memoraa] chat stream error:', err)
      if (err?.name !== 'AbortError') {
        setError('Could not reach Memoraa. Check your connection.')
      }
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    } finally {
      streamAbortRef.current = null
    }
  }, [history, buildSystemPrompt, authedFetch, memories, enqueueTTS, resetAudioQueue])

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

  // Browser-TTS fallback (used when /api/tts is unreachable)
  const browserSpeak = useCallback((text) => {
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
    setTimeout(() => { try { synth.resume?.() } catch {} }, 50)
  }, [profile.language, pickVoice])

  // High-quality TTS via /api/tts (OpenAI tts-1 through Vercel AI Gateway)
  const speak = useCallback(async (text) => {
    if (!text) return
    setOrbState('speaking')
    setStatusText('Speaking...')

    // Cancel any in-flight playback
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause()
        audioPlayerRef.current.src = ''
      } catch {}
      audioPlayerRef.current = null
    }
    synthRef.current.cancel()

    try {
      const token = await getToken()
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text, voice: 'nova' }),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        // eslint-disable-next-line no-console
        console.warn('[memoraa] /api/tts failed, falling back to browser TTS', res.status, detail.slice(0, 200))
        browserSpeak(text)
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioPlayerRef.current = audio

      const cleanup = () => {
        URL.revokeObjectURL(url)
        if (audioPlayerRef.current === audio) audioPlayerRef.current = null
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
      }
      audio.onended = cleanup
      audio.onerror = () => {
        cleanup()
        // Last-resort fallback
        browserSpeak(text)
      }

      await audio.play()
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[memoraa] TTS error, falling back to browser TTS:', err)
      browserSpeak(text)
    }
  }, [getToken, browserSpeak])

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

  // Whisper-based recording — primary path. Captures audio with MediaRecorder,
  // posts to /api/transcribe, then runs the transcript through callClaude.
  const startListening = useCallback(async () => {
    if (isListeningRef.current) return

    const hasMediaRecorder =
      typeof window !== 'undefined' &&
      typeof window.MediaRecorder !== 'undefined' &&
      navigator.mediaDevices?.getUserMedia

    if (!hasMediaRecorder) {
      // Fallback: browser SpeechRecognition (legacy path)
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) {
        setVoiceSupported(false)
        setError('Voice input not supported here. Use the text box below or open in Chrome.')
        return
      }
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
        setOrbState('listening'); setStatusText('Listening...')
        setReply(''); setTranscript(''); setError('')
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
        if (said) callClaude(said)
        else { setOrbState('idle'); setStatusText('Tap the orb to speak') }
      }
      rec.onerror = (e) => {
        isListeningRef.current = false
        if (recognitionRef.current === rec) recognitionRef.current = null
        if (e.error === 'not-allowed') setError('Microphone blocked.')
        else if (e.error !== 'no-speech' && e.error !== 'aborted') setError("Couldn't hear you. Try again.")
        setOrbState('idle'); setStatusText('Tap the orb to speak')
      }
      try { rec.start() } catch { setError('Voice is busy. Tap again.'); setOrbState('idle') }
      return
    }

    // Cancel any in-flight TTS so the mic isn't competing with audio
    if (audioPlayerRef.current) {
      try { audioPlayerRef.current.pause(); audioPlayerRef.current.src = '' } catch {}
      audioPlayerRef.current = null
    }
    synthRef.current.cancel()

    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (err) {
      setError('Microphone access denied. Allow mic in browser settings.')
      return
    }

    const mimeCandidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ]
    const mimeType = mimeCandidates.find(m => MediaRecorder.isTypeSupported?.(m)) || ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder
    mediaStreamRef.current = stream
    recordedChunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data)
    }

    recorder.onstop = async () => {
      isListeningRef.current = false
      try { vadCleanupRef.current?.() } catch {}
      if (recorderRef.current === recorder) recorderRef.current = null
      try { stream.getTracks().forEach(t => t.stop()) } catch {}
      mediaStreamRef.current = null

      const chunks = recordedChunksRef.current
      const totalBytes = chunks.reduce((n, c) => n + c.size, 0)
      if (totalBytes < 1500) {
        // Probably a tap-cancel or no speech captured
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
        return
      }

      setOrbState('thinking')
      setStatusText('Transcribing...')

      try {
        const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
        const lang = encodeURIComponent(langRef.current || 'en')
        const token = await getToken()
        const res = await fetch(`/api/transcribe?language=${lang}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': blob.type || 'audio/webm',
          },
          body: blob,
        })
        if (!res.ok) {
          const detail = await res.text().catch(() => '')
          throw new Error(`transcribe ${res.status}: ${detail.slice(0, 200)}`)
        }
        const { text } = await res.json()
        const said = (text || '').trim()
        if (said) {
          setTranscript(said)
          callClaude(said)
        } else {
          setOrbState('idle')
          setStatusText('Tap the orb to speak')
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[memoraa] transcribe failed:', err)
        setError("Couldn't transcribe that. Try again.")
        setOrbState('idle')
        setStatusText('Tap the orb to speak')
      }
    }

    recorder.onerror = () => {
      isListeningRef.current = false
      try { vadCleanupRef.current?.() } catch {}
      try { stream.getTracks().forEach(t => t.stop()) } catch {}
      setError('Recording error. Try again.')
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    }

    try {
      recorder.start()
      isListeningRef.current = true
      setOrbState('listening')
      setStatusText('Listening…')
      setReply(''); setTranscript(''); setError('')
    } catch (err) {
      try { stream.getTracks().forEach(t => t.stop()) } catch {}
      setError('Could not start recording.')
      setOrbState('idle')
      return
    }

    // Voice-activity auto-stop: watches mic RMS and stops recording after a
    // short silence following actual speech. Falls back to a hard cap so a
    // forgotten-open mic doesn't run forever.
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (!AudioCtx) return // VAD optional — tap-to-stop still works
      const audioCtx = new AudioCtx()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      const buf = new Uint8Array(analyser.fftSize)

      const SILENCE_RMS = 0.012   // ~ambient room floor
      const SILENCE_MS = 800      // pause length that ends a turn
      const MIN_SPEECH_MS = 400   // require some real speech first
      const MAX_RECORDING_MS = 30000

      const startedAt = performance.now()
      let speechStartedAt = 0
      let silenceStartedAt = 0
      let raf = 0
      let stopped = false

      const stopOnce = () => {
        if (stopped) return
        stopped = true
        try { recorder.stop() } catch {}
      }

      const tick = () => {
        if (!isListeningRef.current || stopped) return
        analyser.getByteTimeDomainData(buf)
        let s = 0
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128
          s += v * v
        }
        const rms = Math.sqrt(s / buf.length)
        const now = performance.now()

        // Drive the orb's live reactivity: map RMS through a soft curve so a
        // whisper still moves the orb a bit and shouts don't blow it out.
        levelRef.current = Math.min(1, Math.pow(rms * 4.5, 0.65))

        if (now - startedAt > MAX_RECORDING_MS) { stopOnce(); return }

        if (rms > SILENCE_RMS) {
          if (!speechStartedAt) speechStartedAt = now
          silenceStartedAt = 0
        } else if (speechStartedAt && now - speechStartedAt > MIN_SPEECH_MS) {
          if (!silenceStartedAt) silenceStartedAt = now
          else if (now - silenceStartedAt > SILENCE_MS) { stopOnce(); return }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      vadCleanupRef.current = () => {
        stopped = true
        cancelAnimationFrame(raf)
        levelRef.current = 0
        try { source.disconnect() } catch {}
        try { audioCtx.close() } catch {}
        vadCleanupRef.current = null
      }
    } catch {
      // VAD setup failed — non-fatal, user can still tap to stop
    }
  }, [callClaude, getToken])

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
      try { recorderRef.current?.stop() } catch {}
      try { recognitionRef.current?.stop() } catch {}
    } else if (orbState === 'speaking' || orbState === 'thinking') {
      // Cancel any in-flight stream + audio queue + browser TTS
      resetAudioQueue()
      synthRef.current.cancel()
      setOrbState('idle')
      setStatusText('Tap the orb to speak')
    } else if (orbState === 'idle') {
      resetAudioQueue()
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
      <Aurora state={orbState} />

      {/* PWA install banner */}
      {showInstallBanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: 'rgba(5,7,13,0.85)',
          borderBottom: '1px solid var(--border-accent)',
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          backdropFilter: 'blur(20px) saturate(140%)',
          WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 400 }}>
            Add Memoraa to your home screen
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleInstall} style={{
              background: 'linear-gradient(135deg, #00e5ff 0%, #1a6fff 100%)',
              color: '#001018', border: 'none',
              borderRadius: 'var(--r-sm)', padding: '7px 14px', fontSize: 12,
              fontFamily: 'var(--font)', fontWeight: 600, cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(0,229,255,0.3)',
            }}>Install</button>
            <button onClick={() => setShowInstallBanner(false)}
              aria-label="Dismiss install banner"
              style={{
                background: 'transparent', border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-sm)', padding: '7px 10px', color: 'var(--text-3)',
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
        paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 24px 6px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: orbState === 'idle' ? '#00e5ff'
                : orbState === 'listening' ? '#00ff9d'
                : orbState === 'thinking' ? '#ffb454'
                : '#00ff9d',
              boxShadow: '0 0 12px currentColor',
              transition: 'background 0.4s var(--ease-out)',
              flexShrink: 0,
            }} />
            <span style={{
              fontWeight: 600, fontSize: 17, letterSpacing: '-0.3px',
              fontFamily: 'var(--font)',
            }}>
              Memoraa
            </span>
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)', letterSpacing: '0.08em',
              textTransform: 'uppercase', marginLeft: 4,
            }}>
              {orbState === 'listening' ? 'listening'
                : orbState === 'thinking' ? 'thinking'
                : orbState === 'speaking' ? 'speaking'
                : 'ready'}
            </span>
          </div>
        </div>

        {/* ── HOME VIEW ── */}
        {view === 'home' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 22px 18px', overflow: 'hidden',
          }}>
            {/* Title */}
            <div style={{ textAlign: 'center', paddingTop: 6, width: '100%' }}>
              <h1 style={{
                fontSize: 32, fontWeight: 300, letterSpacing: '-1px',
                background: 'linear-gradient(120deg, #b6f3ff 0%, #00e5ff 30%, #7b5ea7 65%, #eef3fb 100%)',
                backgroundSize: '220% auto',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: 'shimmer 7s linear infinite',
                marginBottom: 8, lineHeight: 1.15,
              }}>
                {profile.name ? `Hey ${profile.name}.` : 'Hey there.'}
              </h1>
              <p style={{
                color: 'var(--text-3)', fontSize: 13, fontWeight: 400, letterSpacing: '0.01em',
                lineHeight: 1.45,
              }}>
                Speak freely. I listen, remember, and never share.
              </p>

              {pendingNudge && (() => {
                const isDigest = pendingNudge.kind === 'digest'
                const isFollowup = pendingNudge.kind === 'followup'
                const icon = isDigest ? '📝' : isFollowup ? '🔔' : '💭'
                const tint = isDigest
                  ? { bg: 'rgba(123,94,167,0.1)', border: 'rgba(123,94,167,0.28)', accent: '#b59cd6' }
                  : { bg: 'rgba(0,229,255,0.07)', border: 'rgba(0,229,255,0.22)', accent: '#00e5ff' }
                const label = isDigest ? 'Your week' : isFollowup ? 'Following up' : 'Checking in'
                return (
                <div style={{
                  marginTop: 16, padding: '14px 16px',
                  background: tint.bg,
                  border: `1px solid ${tint.border}`,
                  borderRadius: 'var(--r-lg)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                  textAlign: 'left',
                  animation: 'fadeUp 0.4s var(--ease-spring)',
                  boxShadow: 'var(--elev-2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <span style={{
                      fontSize: 18, lineHeight: 1, flexShrink: 0,
                      width: 32, height: 32, borderRadius: 10,
                      background: 'rgba(255,255,255,0.04)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>{icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 10, color: tint.accent,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.1em', textTransform: 'uppercase',
                        marginBottom: 4, fontWeight: 500,
                      }}>
                        {label}
                      </p>
                      <p style={{
                        fontSize: 14, lineHeight: 1.5, color: 'var(--text)',
                      }}>
                        {pendingNudge.prompt}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={async () => {
                        const n = pendingNudge
                        setHistory(h => [...h, { role: 'assistant', content: n.prompt }])
                        setReply(n.prompt)
                        setPendingNudge(null)
                        authedFetch('/api/nudges', {
                          method: 'POST',
                          body: JSON.stringify({ id: n.id, action: 'delivered' }),
                        }).catch(() => {})
                        await speak(n.prompt)
                      }}
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #00e5ff 0%, #1a6fff 100%)',
                        color: '#001018', border: 'none',
                        borderRadius: 'var(--r-md)', padding: '10px 12px',
                        fontFamily: 'var(--font)', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(0,229,255,0.25)',
                        transition: 'transform 0.15s var(--ease-out), box-shadow 0.2s',
                      }}
                      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
                      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                      Hear it
                    </button>
                    <button
                      onClick={() => dismissNudge(pendingNudge)}
                      style={{
                        background: 'var(--surface-1)',
                        color: 'var(--text-2)',
                        border: '1px solid var(--border-2)',
                        borderRadius: 'var(--r-md)', padding: '10px 14px',
                        fontFamily: 'var(--font)', fontSize: 12, fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
                )
              })()}
            </div>

            {/* Orb + status */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>
              <Orb state={orbState} onClick={handleOrbTap} levelRef={levelRef} />

              <div style={{ textAlign: 'center', minHeight: 24, padding: '0 12px' }}>
                {error ? (
                  <p style={{
                    color: 'var(--rose)', fontSize: 13,
                    animation: 'fadeUp 0.3s var(--ease-out)',
                  }}>
                    {error}
                  </p>
                ) : (
                  <p style={{
                    color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.18em',
                    fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                    fontWeight: 500,
                  }}>
                    {statusText}
                  </p>
                )}
              </div>
            </div>

            {/* Conversation */}
            <div style={{ width: '100%', minHeight: 80, display: 'flex' }}>
              <ChatLog
                history={history}
                streamingUser={transcript}
                streamingReply={reply}
                streaming={orbState === 'thinking' || orbState === 'speaking'}
              />
            </div>

            {/* Text input fallback (always available) */}
            <form
              onSubmit={(e) => { e.preventDefault(); sendText() }}
              style={{
                width: '100%', display: 'flex', gap: 6, alignItems: 'center',
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-lg)', padding: '5px 5px 5px 16px',
                backdropFilter: 'blur(14px)',
                WebkitBackdropFilter: 'blur(14px)',
                transition: 'border-color 0.25s var(--ease-out), box-shadow 0.25s',
              }}
              onFocusCapture={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-accent-strong)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)'
              }}
              onBlurCapture={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-2)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={voiceSupported ? 'Or type a message…' : 'Voice not supported — type here'}
                disabled={orbState === 'thinking'}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text)', fontFamily: 'var(--font)', fontSize: 14.5,
                  padding: '10px 0', minWidth: 0,
                }}
              />
              <button
                type="submit"
                aria-label="Send"
                disabled={!textInput.trim() || orbState === 'thinking'}
                style={{
                  background: textInput.trim()
                    ? 'linear-gradient(135deg, #00e5ff 0%, #1a6fff 100%)'
                    : 'var(--surface-2)',
                  color: textInput.trim() ? '#001018' : 'var(--text-muted)',
                  border: 'none', borderRadius: 'var(--r-md)',
                  width: 38, height: 38, padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: textInput.trim() ? 'pointer' : 'default',
                  transition: 'all 0.2s var(--ease-out)',
                  boxShadow: textInput.trim() ? '0 2px 10px rgba(0,229,255,0.3)' : 'none',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>

            {/* Footer */}
            <p style={{
              fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.16em',
              fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Private · end-to-end
            </p>
          </div>
        )}

        {/* ── MEMORIES VIEW ── */}
        {view === 'memories' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '4px 22px 18px', overflow: 'hidden',
            animation: 'fadeIn 0.35s var(--ease-out)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              marginBottom: 18,
            }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                  Memory
                </h2>
                <p style={{
                  fontSize: 11, color: 'var(--text-muted)', marginTop: 5,
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}>
                  {memories.length} {memories.length === 1 ? 'fact' : 'facts'} · synced
                </p>
              </div>
              {memories.length > 0 && (
                <button onClick={clearAll} style={{
                  background: 'rgba(255,107,138,0.06)',
                  border: '1px solid rgba(255,107,138,0.2)',
                  borderRadius: 'var(--r-md)', padding: '6px 12px',
                  color: 'var(--rose)', fontSize: 12,
                  fontFamily: 'var(--font)', fontWeight: 500,
                  cursor: 'pointer', transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.12)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.06)'}>
                  Clear all
                </button>
              )}
            </div>

            {/* Search */}
            {memories.length > 3 && (
              <div style={{
                position: 'relative', marginBottom: 12,
              }}>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--text-muted)', pointerEvents: 'none',
                  }}
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
                <input
                  type="text"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  placeholder="Search memories…"
                  style={{
                    width: '100%',
                    background: 'var(--surface-glass)',
                    border: '1px solid var(--border-2)',
                    borderRadius: 'var(--r-md)',
                    padding: '10px 12px 10px 38px',
                    color: 'var(--text)', fontFamily: 'var(--font)',
                    fontSize: 14, outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-accent-strong)'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-2)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>
            )}

            {/* Category filter pills */}
            {memories.length > 5 && !memorySearch && (
              <div style={{
                display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto',
                paddingBottom: 4, margin: '0 -22px 12px', padding: '0 22px 4px',
                scrollbarWidth: 'none',
              }}>
                {['all', 'person', 'event', 'preference', 'goal', 'feeling', 'todo', 'health'].map(cat => {
                  const active = memoryCategory === cat
                  const meta = CATEGORY_META[cat]
                  return (
                    <button
                      key={cat}
                      onClick={() => setMemoryCategory(cat)}
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--surface-1)',
                        border: `1px solid ${active ? 'var(--border-accent-strong)' : 'var(--border-1)'}`,
                        borderRadius: 'var(--r-pill)', padding: '5px 12px',
                        color: active ? 'var(--accent)' : 'var(--text-3)',
                        fontFamily: 'var(--font)', fontSize: 11.5, fontWeight: 500,
                        letterSpacing: '0.01em', textTransform: 'capitalize',
                        cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                        transition: 'all 0.2s var(--ease-out)',
                      }}
                    >
                      {meta && cat !== 'all' ? `${meta.icon} ${cat}` : cat}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{
              flex: 1, overflowY: 'auto', display: 'flex',
              flexDirection: 'column', gap: 8,
              margin: '0 -22px', padding: '2px 22px',
            }}>
              {(() => {
                const source = memorySearchResults !== null ? memorySearchResults : memories
                const filtered = (memoryCategory === 'all' || memorySearch)
                  ? source
                  : source.filter(m => m.category === memoryCategory)

                if (memories.length === 0) {
                  return (
                    <div style={{
                      textAlign: 'center', paddingTop: 56,
                      animation: 'fadeIn 0.4s var(--ease-out)',
                    }}>
                      <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: 'radial-gradient(circle at 35% 30%, rgba(0,229,255,0.18) 0%, rgba(0,229,255,0.04) 60%, transparent 80%)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 28, marginBottom: 18,
                        border: '1px solid var(--border-accent)',
                      }}>🌙</div>
                      <p style={{
                        color: 'var(--text-2)', fontSize: 14, lineHeight: 1.7,
                        maxWidth: 280, margin: '0 auto', fontWeight: 400,
                      }}>
                        Nothing remembered yet.
                      </p>
                      <p style={{
                        color: 'var(--text-muted)', fontSize: 12.5, lineHeight: 1.65,
                        maxWidth: 280, margin: '6px auto 0',
                      }}>
                        Speak to Memoraa — she'll quietly note things that matter.
                      </p>
                    </div>
                  )
                }
                if (filtered.length === 0) {
                  return (
                    <p style={{
                      color: 'var(--text-muted)', fontSize: 13, textAlign: 'center',
                      paddingTop: 36, fontFamily: 'var(--font-mono)',
                    }}>
                      {memorySearch ? 'No matches.' : 'No memories in this category yet.'}
                    </p>
                  )
                }
                return filtered.map((m, i) => (
                  <MemoryChip
                    key={m.id}
                    id={m.id}
                    text={m.fact}
                    category={m.category}
                    dueAt={m.due_at}
                    index={i}
                    onDelete={deleteMemory}
                  />
                ))
              })()}
            </div>
          </div>
        )}

        {/* ── PROFILE VIEW ── */}
        {view === 'profile' && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            padding: '4px 22px 18px', overflowY: 'auto',
            animation: 'fadeIn 0.35s var(--ease-out)', gap: 20,
          }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.6px', lineHeight: 1.1 }}>
                Profile
              </h2>
              <p style={{
                fontSize: 12, color: 'var(--text-muted)', marginTop: 5,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
              }}>
                Personalize how Memoraa speaks to you
              </p>
            </div>

            {/* Account card */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.07) 0%, rgba(123,94,167,0.05) 100%)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--r-lg)', padding: '16px 18px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
              boxShadow: 'var(--elev-2)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                <div style={{
                  width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, #00e5ff 0%, #1a6fff 60%, #4a2d7a 100%)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 17, fontWeight: 600, color: '#001018',
                  boxShadow: '0 4px 16px rgba(0,229,255,0.3), inset 0 1px 0 rgba(255,255,255,0.4)',
                }}>
                  {(user?.username || profile.name || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 15, fontWeight: 600, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    @{user?.username || 'user'}
                  </p>
                  <p style={{
                    fontSize: 11.5, color: 'var(--text-3)', marginTop: 2,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    {user?.primaryEmailAddress?.emailAddress || user?.primaryPhoneNumber?.phoneNumber || 'Signed in'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                style={{
                  background: 'rgba(255,107,138,0.08)',
                  border: '1px solid rgba(255,107,138,0.22)',
                  borderRadius: 'var(--r-md)', padding: '8px 14px',
                  color: 'var(--rose)',
                  fontFamily: 'var(--font)', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.14)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,107,138,0.08)'}
              >
                Sign out
              </button>
            </div>

            {/* Name field */}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                fontSize: 11, color: 'var(--text-3)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                fontWeight: 500,
              }}>
                Your name
              </span>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile(p => ({ ...p, name: e.target.value.slice(0, 40) }))}
                placeholder="What should I call you?"
                style={{
                  background: 'var(--surface-glass)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 'var(--r-md)', padding: '12px 14px',
                  color: 'var(--text)', fontFamily: 'var(--font)',
                  fontSize: 14.5, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-accent-strong)'
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)'
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-2)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </label>

            {/* Language picker */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                fontSize: 11, color: 'var(--text-3)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                fontWeight: 500,
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
                        position: 'relative',
                        background: selected ? 'var(--accent-soft)' : 'var(--surface-1)',
                        border: `1px solid ${selected ? 'var(--border-accent-strong)' : 'var(--border-1)'}`,
                        borderRadius: 'var(--r-md)', padding: '11px 12px',
                        color: selected ? 'var(--accent)' : 'var(--text)',
                        fontFamily: 'var(--font)', fontSize: 13,
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.2s var(--ease-out)',
                        display: 'flex', flexDirection: 'column', gap: 3,
                      }}
                    >
                      <span style={{ fontWeight: 600, lineHeight: 1.1 }}>{l.native}</span>
                      <span style={{
                        fontSize: 10, color: selected ? 'rgba(0,229,255,0.7)' : 'var(--text-muted)',
                        fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                      }}>
                        {l.code}
                      </span>
                      {selected && (
                        <span style={{
                          position: 'absolute', top: 8, right: 8,
                          width: 6, height: 6, borderRadius: '50%',
                          background: 'var(--accent)', boxShadow: '0 0 6px var(--accent-glow)',
                        }} />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Daily check-in */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{
                fontSize: 11, color: 'var(--text-3)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.1em', textTransform: 'uppercase',
                fontWeight: 500,
              }}>
                Daily check-in
              </span>
              <div style={{
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-2)',
                borderRadius: 'var(--r-md)', padding: '14px 16px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <label style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 8, cursor: 'pointer',
                }}>
                  <span style={{ fontSize: 14 }}>Send me a check-in</span>
                  {/* Custom toggle */}
                  <span style={{
                    position: 'relative', width: 38, height: 22, flexShrink: 0,
                    background: prefs.nudge_enabled ? 'linear-gradient(135deg, #00e5ff, #1a6fff)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 999,
                    transition: 'background 0.25s var(--ease-out)',
                    boxShadow: prefs.nudge_enabled ? '0 0 12px rgba(0,229,255,0.4)' : 'none',
                  }}>
                    <input
                      type="checkbox"
                      checked={prefs.nudge_enabled}
                      onChange={(e) => savePrefs({ nudge_enabled: e.target.checked })}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0,
                        width: '100%', height: '100%', cursor: 'pointer', margin: 0,
                      }}
                    />
                    <span style={{
                      position: 'absolute', top: 3,
                      left: prefs.nudge_enabled ? 19 : 3,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#fff',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                      transition: 'left 0.25s var(--ease-spring)',
                    }} />
                  </span>
                </label>
                {prefs.nudge_enabled && (
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, animation: 'fadeUp 0.3s var(--ease-out)',
                  }}>
                    <span style={{ fontSize: 13.5, color: 'var(--text-2)' }}>At</span>
                    <select
                      value={prefs.nudge_local_hour}
                      onChange={(e) => savePrefs({ nudge_local_hour: parseInt(e.target.value, 10) })}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-accent)',
                        borderRadius: 'var(--r-sm)', padding: '6px 10px',
                        color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p style={{
                  fontSize: 10.5, color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
                }}>
                  {prefs.timezone}
                </p>
              </div>
            </div>

            {/* Voice status */}
            <div style={{
              background: voiceSupported ? 'rgba(0,255,157,0.05)' : 'rgba(255,180,84,0.06)',
              border: `1px solid ${voiceSupported ? 'rgba(0,255,157,0.18)' : 'rgba(255,180,84,0.22)'}`,
              borderRadius: 'var(--r-md)', padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                width: 36, height: 36, flexShrink: 0, borderRadius: 10,
                background: voiceSupported ? 'rgba(0,255,157,0.1)' : 'rgba(255,180,84,0.1)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: voiceSupported ? 'var(--green)' : 'var(--amber)',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
                  {voiceSupported ? 'Voice input ready' : 'Voice input unavailable'}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.5 }}>
                  {voiceSupported
                    ? 'Tap the orb to speak. Tap again to stop.'
                    : 'This browser doesn\'t support speech recognition. Use the text box, or open in Chrome.'}
                </p>
              </div>
            </div>

            <p style={{
              fontSize: 10, color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.16em', textAlign: 'center',
              marginTop: 'auto', paddingTop: 18,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Stays in your account
            </p>
          </div>
        )}

        <BottomNav
          view={view}
          setView={setView}
          memoriesCount={memories.length}
          profileInitial={profile.name ? profile.name.slice(0, 1).toUpperCase() : ''}
        />
      </div>
    </div>
  )
}
