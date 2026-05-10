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
  background: 'rgba(13,21,37,0.6)',
  border: '1px solid rgba(0,212,255,0.18)',
  borderRadius: 12, padding: '14px 16px',
  color: '#e8f0fe', fontFamily: "'Sora', sans-serif",
  fontSize: 15, outline: 'none', width: '100%',
}

const primaryBtn = {
  background: 'var(--cyan, #00e5ff)', color: '#000', border: 'none',
  borderRadius: 12, padding: '13px 18px',
  fontFamily: "'Sora', sans-serif", fontSize: 14, fontWeight: 600,
  cursor: 'pointer', width: '100%', transition: 'all 0.2s',
}

const ghostBtn = {
  background: 'transparent', color: '#5a7090', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 10, padding: '10px 14px',
  fontFamily: "'Space Mono', monospace", fontSize: 12,
  cursor: 'pointer', transition: 'all 0.2s',
}

const labelStyle = {
  fontSize: 11, color: '#5a7090',
  fontFamily: "'Space Mono', monospace",
  letterSpacing: '0.08em', textTransform: 'uppercase',
  marginBottom: 6, display: 'block',
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
      // eslint-disable-next-line no-console
      console.log('[memoraa] signUp.create result:', {
        status: created.status,
        missingFields: created.missingFields,
        unverifiedFields: created.unverifiedFields,
        requiredFields: created.requiredFields,
      })
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
        // eslint-disable-next-line no-console
        console.log('[memoraa] signUp.attempt result:', result)
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
      {/* Brand */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{
          fontSize: 38, fontWeight: 300, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, #00e5ff 0%, #7b5ea7 50%, #e8f0fe 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text', marginBottom: 8,
        }}>
          Memoraa
        </h1>
        <p style={{ color: '#5a7090', fontSize: 13, fontWeight: 300 }}>
          Your private AI memory layer.
        </p>
      </div>

      <div style={{
        width: '100%',
        background: 'rgba(13,21,37,0.6)',
        border: '1px solid rgba(0,212,255,0.12)',
        borderRadius: 18, padding: 24,
        backdropFilter: 'blur(12px)',
      }}>
        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 22, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 12 }}>
          {['signup', 'signin'].map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1,
              background: mode === m ? 'rgba(0,229,255,0.12)' : 'transparent',
              border: `1px solid ${mode === m ? 'rgba(0,229,255,0.3)' : 'transparent'}`,
              borderRadius: 9, padding: '10px 14px',
              color: mode === m ? '#00e5ff' : '#5a7090',
              fontFamily: "'Sora', sans-serif", fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.2s',
            }}>
              {m === 'signup' ? 'Sign up' : 'Sign in'}
            </button>
          ))}
        </div>

        {/* Step 1: identifier */}
        {step === 'identifier' && (
          <form onSubmit={submitIdentifier} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
              />
            </div>
            {error && <p style={{ color: 'rgba(255,100,100,0.8)', fontSize: 12 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Continue'}
            </button>
            <div id="clerk-captcha" />
          </form>
        )}

        {/* Step 2: username (signup only) */}
        {step === 'username' && (
          <form onSubmit={(e) => { e.preventDefault(); submitUsername() }} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>Pick a username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                placeholder="e.g. nitesh_5"
                autoFocus
                style={fieldStyle}
              />
            </div>

            {error && <p style={{ color: 'rgba(255,180,80,0.85)', fontSize: 12 }}>{error}</p>}

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
                      borderRadius: 10, padding: '8px 12px',
                      color: '#00e5ff',
                      fontFamily: "'Space Mono', monospace", fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Send code'}
            </button>
            <button type="button" onClick={() => { setStep('identifier'); setError('') }} style={ghostBtn}>
              ← back
            </button>
            <div id="clerk-captcha" />
          </form>
        )}

        {/* Step 3: verify */}
        {step === 'verify' && (
          <form onSubmit={submitCode} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={labelStyle}>
                Code sent to {identifier}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                placeholder="6-digit code"
                autoFocus
                autoComplete="one-time-code"
                style={{ ...fieldStyle, fontFamily: "'Space Mono', monospace", letterSpacing: '0.3em', textAlign: 'center' }}
              />
            </div>
            {error && <p style={{ color: 'rgba(255,100,100,0.8)', fontSize: 12 }}>{error}</p>}
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
              {busy ? '...' : 'Verify'}
            </button>
            <button type="button" onClick={() => { setStep('identifier'); setCode(''); setError('') }} style={ghostBtn}>
              ← change {identifierType === 'email' ? 'email' : 'phone'}
            </button>
          </form>
        )}
      </div>

      <p style={{
        marginTop: 20, fontSize: 10, color: '#3a5070',
        fontFamily: "'Space Mono', monospace", letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}>
        🔒 End-to-end private · your memories belong to you
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
