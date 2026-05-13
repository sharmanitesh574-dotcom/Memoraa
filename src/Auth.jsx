import { useState, useCallback } from 'react'
import { useSignUp, useSignIn } from '@clerk/clerk-react'

// ── Username suggester (Instagram-style) ──────────────────────
function suggestUsernames(base) {
  const clean = (base || 'user').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'user'
  const year = new Date().getFullYear()
  const rand = (n) => Math.floor(Math.random() * n)
  const out = new Set([
    `${clean}${rand(100)}`,
    `${clean}_${rand(1000)}`,
    `${clean}.${rand(10000)}`,
    `${clean}${year}`,
    `the.${clean}`,
    `real_${clean}`,
    `${clean}_official`,
  ])
  return [...out].slice(0, 5)
}

function classifyIdentifier(raw) {
  const s = (raw || '').trim()
  if (!s) return { type: null, value: '' }
  if (s.includes('@')) return { type: 'email', value: s }
  const digits = s.replace(/[^\d+]/g, '')
  if (digits.length >= 8) {
    return { type: 'phone', value: digits.startsWith('+') ? digits : `+${digits}` }
  }
  return { type: null, value: s }
}

// ── Styled atoms ──────────────────────────────────────────────
const fieldStyle = {
  background: 'var(--surface-glass, rgba(13,21,37,0.55))',
  border: '1px solid var(--border-2, rgba(255,255,255,0.1))',
  borderRadius: 'var(--r-md, 12px)', padding: '14px 16px',
  color: 'var(--text, #eef3fb)', fontFamily: "'Sora', sans-serif",
  fontSize: 15, outline: 'none', width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
}

const fieldFocus = (e) => {
  e.currentTarget.style.borderColor = 'var(--border-accent-strong, rgba(0,229,255,0.32))'
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,229,255,0.08)'
}
const fieldBlur = (e) => {
  e.currentTarget.style.borderColor = 'var(--border-2, rgba(255,255,255,0.1))'
  e.currentTarget.style.boxShadow = 'none'
}

const primaryBtn = {
  background: 'linear-gradient(135deg, #00e5ff 0%, #1a6fff 100%)',
  color: '#001018', border: 'none',
  borderRadius: 'var(--r-md, 12px)', padding: '14px 18px',
  fontFamily: "'Sora', sans-serif", fontSize: 14.5, fontWeight: 600,
  letterSpacing: '0.01em',
  cursor: 'pointer', width: '100%',
  transition: 'transform 0.15s var(--ease-out, cubic-bezier(0.22,1,0.36,1)), box-shadow 0.2s',
  boxShadow: '0 6px 24px rgba(0,229,255,0.28), inset 0 1px 0 rgba(255,255,255,0.25)',
}

const ghostBtn = {
  background: 'transparent', color: 'var(--text-3, rgba(238,243,251,0.55))',
  border: '1px solid var(--border-1, rgba(255,255,255,0.06))',
  borderRadius: 'var(--r-md, 12px)', padding: '11px 14px',
  fontFamily: "'Sora', sans-serif", fontSize: 12.5,
  cursor: 'pointer', transition: 'background 0.2s, color 0.2s',
}

const labelStyle = {
  fontSize: 11, color: 'var(--text-3, rgba(238,243,251,0.55))',
  fontFamily: "'JetBrains Mono', monospace",
  letterSpacing: '0.1em', textTransform: 'uppercase',
  marginBottom: 8, display: 'block',
  fontWeight: 500,
}

// ── Auth screen ───────────────────────────────────────────────
export default function Auth() {
  const [mode, setMode] = useState('signup') // 'signup' | 'signin'
  const [step, setStep] = useState('identifier') // 'identifier' | 'username' | 'verify'
  const [identifier, setIdentifier] = useState('')
  const [identifierType, setIdentifierType] = useState(null) // 'email' | 'phone'
  const [username, setUsername] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const { isLoaded: signUpLoaded, signUp, setActive: setActiveSignUp } = useSignUp()
  const { isLoaded: signInLoaded, signIn, setActive: setActiveSignIn } = useSignIn()

  const reset = () => {
    setStep('identifier'); setIdentifier(''); setIdentifierType(null)
    setUsername(''); setSuggestions([]); setCode(''); setError('')
  }

  const switchMode = (next) => {
    reset()
    setMode(next)
  }

  // Step 1 — submit identifier
  const submitIdentifier = useCallback(async (e) => {
    e?.preventDefault?.()
    if (busy) return
    const { type, value } = classifyIdentifier(identifier)
    if (!type) {
      setError('Enter a valid email or phone number (with country code)')
      return
    }
    setError('')
    setIdentifierType(type)
    setIdentifier(value)

    if (mode === 'signup') {
      // For signup, collect username next
      setStep('username')
      return
    }

    // Sign in: send OTP immediately
    if (!signInLoaded) return
    setBusy(true)
    try {
      const factor = type === 'email' ? 'email_code' : 'phone_code'
      await signIn.create({ identifier: value })
      const supportedFactors = signIn.supportedFirstFactors || []
      const target = supportedFactors.find(f => f.strategy === factor)
      if (!target) throw new Error('No verification method available for this account')
      await signIn.prepareFirstFactor(
        type === 'email'
          ? { strategy: 'email_code', emailAddressId: target.emailAddressId }
          : { strategy: 'phone_code', phoneNumberId: target.phoneNumberId }
      )
      setStep('verify')
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }, [busy, identifier, mode, signIn, signInLoaded])

  // Step 2 (signup only) — submit username + identifier, send OTP
  const submitUsername = useCallback(async (chosen) => {
    if (busy || !signUpLoaded) return
    const uname = (chosen ?? username).trim()
    if (uname.length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    setBusy(true); setError('')
    try {
      const created = await signUp.create({
        username: uname,
        ...(identifierType === 'email'
          ? { emailAddress: identifier }
          : { phoneNumber: identifier }),
      })
      const summary = `status=${created.status} missing=[${(created.missingFields || []).join(',')}] unverified=[${(created.unverifiedFields || []).join(',')}] required=[${(created.requiredFields || []).join(',')}]`
      // eslint-disable-next-line no-console
      console.log('[memoraa] signUp.create →', summary)
      const missing = (created.missingFields || []).filter(f => f !== 'email_address' && f !== 'phone_number')
      if (missing.length > 0) {
        setError(`Clerk requires more fields: ${missing.join(', ')}. Disable these in Clerk dashboard → User & authentication.`)
        setBusy(false)
        return
      }
      if (identifierType === 'email') {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      } else {
        await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
      }
      setUsername(uname)
      setSuggestions([])
      setStep('verify')
    } catch (err) {
      const e = err?.errors?.[0]
      const param = e?.meta?.paramName
      if (e?.code === 'form_identifier_exists' && param === 'username') {
        setError('That username is taken. Try one of these:')
        setSuggestions(suggestUsernames(uname))
      } else if (e?.code === 'form_identifier_exists') {
        setError('An account already exists for this email/phone. Try signing in.')
      } else if (e?.code === 'form_username_invalid_character' || e?.code === 'form_param_format_invalid') {
        setError('Use only letters, numbers, dots, or underscores')
      } else {
        setError(humanError(err))
      }
    } finally {
      setBusy(false)
    }
  }, [busy, identifier, identifierType, signUp, signUpLoaded, username])

  // Step 3 — verify OTP
  const submitCode = useCallback(async (e) => {
    e?.preventDefault?.()
    if (busy) return
    const c = code.trim()
    if (c.length < 4) { setError('Enter the code we sent you'); return }
    setBusy(true); setError('')
    try {
      if (mode === 'signup') {
        const result = identifierType === 'email'
          ? await signUp.attemptEmailAddressVerification({ code: c })
          : await signUp.attemptPhoneNumberVerification({ code: c })
        const summary = `status=${result.status} missing=[${(result.missingFields || []).join(',')}] unverified=[${(result.unverifiedFields || []).join(',')}] sessionId=${result.createdSessionId || 'none'}`
        // eslint-disable-next-line no-console
        console.log('[memoraa] signUp.attempt →', summary)
        if (result.status === 'complete') {
          await setActiveSignUp({ session: result.createdSessionId })
        } else {
          const missing = [
            ...(result.missingFields || []),
            ...(result.unverifiedFields || []).map(f => `verify_${f}`),
          ].join(', ') || result.status
          setError(`Sign-up not complete. Clerk is asking for: ${missing}. Disable that requirement in the Clerk dashboard or contact support.`)
        }
      } else {
        const strategy = identifierType === 'email' ? 'email_code' : 'phone_code'
        const result = await signIn.attemptFirstFactor({ strategy, code: c })
        // eslint-disable-next-line no-console
        console.log('[memoraa] signIn.attempt result:', result)
        if (result.status === 'complete') {
          await setActiveSignIn({ session: result.createdSessionId })
        } else {
          setError(`Sign-in stuck at status: ${result.status}. Check console for details.`)
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[memoraa] auth error:', err)
      setError(humanError(err) || 'Wrong code')
    } finally {
      setBusy(false)
    }
  }, [busy, code, identifierType, mode, setActiveSignIn, setActiveSignUp, signIn, signUp])

  return (
    <div style={{
      position: 'relative', height: '100dvh', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '24px', maxWidth: 440, margin: '0 auto',
    }}>
      {/* Ambient glow behind card */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,255,0.18) 0%, transparent 60%)',
        filter: 'blur(60px)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 36, position: 'relative', zIndex: 1 }}>
        {/* Mini orb */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          margin: '0 auto 18px',
          background: 'radial-gradient(circle at 36% 32%, #b6f3ff 0%, #00e5ff 30%, #1a6fff 62%, #4a2d7a 90%)',
          boxShadow: '0 0 36px rgba(0,229,255,0.4), inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -8px 16px rgba(0,0,0,0.3)',
          animation: 'breathe 4s var(--ease-in-out) infinite',
        }} />
        <h1 style={{
          fontSize: 40, fontWeight: 300, letterSpacing: '-1.2px',
          background: 'linear-gradient(120deg, #b6f3ff 0%, #00e5ff 30%, #7b5ea7 65%, #eef3fb 100%)',
          backgroundSize: '220% auto',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text', marginBottom: 8, lineHeight: 1.1,
          animation: 'shimmer 7s linear infinite',
        }}>
          Memoraa
        </h1>
        <p style={{
          color: 'var(--text-3, rgba(238,243,251,0.55))',
          fontSize: 14, fontWeight: 400, letterSpacing: '0.01em',
          lineHeight: 1.5, maxWidth: 320, margin: '0 auto',
        }}>
          Your private voice journal.<br />
          Two minutes a day. I remember what matters.
        </p>
      </div>

      <div style={{
        width: '100%', position: 'relative', zIndex: 1,
        background: 'var(--surface-glass, rgba(13,21,37,0.55))',
        border: '1px solid var(--border-2, rgba(255,255,255,0.1))',
        borderRadius: 22, padding: 24,
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
      }}>
        {/* Mode toggle */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 22,
          background: 'rgba(255,255,255,0.04)',
          padding: 4, borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {['signup', 'signin'].map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1,
              background: mode === m
                ? 'linear-gradient(135deg, rgba(0,229,255,0.18) 0%, rgba(26,111,255,0.12) 100%)'
                : 'transparent',
              border: `1px solid ${mode === m ? 'rgba(0,229,255,0.3)' : 'transparent'}`,
              borderRadius: 9, padding: '10px 14px',
              color: mode === m ? '#00e5ff' : 'var(--text-3, rgba(238,243,251,0.55))',
              fontFamily: "'Sora', sans-serif", fontSize: 13.5, fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
              boxShadow: mode === m ? '0 2px 12px rgba(0,229,255,0.15)' : 'none',
            }}>
              {m === 'signup' ? 'Sign up' : 'Sign in'}
            </button>
          ))}
        </div>

        {/* Step 1: identifier */}
        {step === 'identifier' && (
          <form onSubmit={submitIdentifier} style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp 0.35s var(--ease-spring, cubic-bezier(0.16,1,0.3,1))' }}>
            <div>
              <label style={labelStyle}>Email or mobile number</label>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@example.com  or  +91 98765 43210"
                autoFocus
                autoComplete={mode === 'signup' ? 'email' : 'username'}
                style={fieldStyle}
                onFocus={fieldFocus}
                onBlur={fieldBlur}
              />
            </div>
            {error && <p style={{ color: '#ff6b8a', fontSize: 12.5, lineHeight: 1.4 }}>{error}</p>}
            <button
              type="submit" disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}
              onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.985)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {busy ? 'Sending…' : 'Continue'}
            </button>
            <div id="clerk-captcha" />
          </form>
        )}

        {/* Step 2: username (signup only) */}
        {step === 'username' && (
          <form onSubmit={(e) => { e.preventDefault(); submitUsername() }} style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp 0.35s var(--ease-spring, cubic-bezier(0.16,1,0.3,1))' }}>
            <div>
              <label style={labelStyle}>Pick a username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                placeholder="e.g. nitesh_5"
                autoFocus
                style={fieldStyle}
                onFocus={fieldFocus}
                onBlur={fieldBlur}
              />
            </div>

            {error && <p style={{ color: 'var(--amber, #ffb454)', fontSize: 12.5, lineHeight: 1.4 }}>{error}</p>}

            {suggestions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => { setUsername(s); submitUsername(s) }}
                    style={{
                      background: 'rgba(0,229,255,0.08)',
                      border: '1px solid rgba(0,229,255,0.25)',
                      borderRadius: 999, padding: '6px 12px',
                      color: '#00e5ff',
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
                      cursor: 'pointer', transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,229,255,0.16)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,229,255,0.08)'}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <button
              type="submit" disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}
              onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.985)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
            <button type="button" onClick={() => { setStep('identifier'); setError('') }} style={ghostBtn}>
              ← back
            </button>
            <div id="clerk-captcha" />
          </form>
        )}

        {/* Step 3: verify */}
        {step === 'verify' && (
          <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeUp 0.35s var(--ease-spring, cubic-bezier(0.16,1,0.3,1))' }}>
            <div>
              <label style={labelStyle}>
                Code sent to <span style={{ color: 'var(--text-2, rgba(238,243,251,0.78))', textTransform: 'none', letterSpacing: 0 }}>{identifier}</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="••••••"
                autoFocus
                autoComplete="one-time-code"
                style={{
                  ...fieldStyle,
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: '0.5em',
                  textAlign: 'center',
                  fontSize: 22, fontWeight: 500,
                  paddingLeft: 24,
                }}
                onFocus={fieldFocus}
                onBlur={fieldBlur}
              />
            </div>
            {error && <p style={{ color: '#ff6b8a', fontSize: 12.5, lineHeight: 1.4 }}>{error}</p>}
            <button
              type="submit" disabled={busy}
              style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}
              onMouseDown={(e) => !busy && (e.currentTarget.style.transform = 'scale(0.985)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setStep('identifier'); setCode(''); setError('') }} style={ghostBtn}>
              ← change {identifierType === 'email' ? 'email' : 'phone'}
            </button>
          </form>
        )}
      </div>

      <p style={{
        marginTop: 22, fontSize: 10, color: 'var(--text-muted, rgba(238,243,251,0.38))',
        fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.14em',
        textTransform: 'uppercase', position: 'relative', zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        End-to-end private
      </p>
    </div>
  )
}

function humanError(err) {
  const e = err?.errors?.[0]
  if (!e) return err?.message || 'Something went wrong'
  if (e.longMessage) return e.longMessage
  return e.message || 'Something went wrong'
}
