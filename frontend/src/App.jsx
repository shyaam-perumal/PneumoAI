import { useEffect, useRef, useState } from 'react'
import imagePlus from './assets/figma/image-plus.svg'
import userCircle from './assets/figma/user-circle.svg'
import bell from './assets/figma/bell.svg'
import informationCircle from './assets/figma/information-circle.svg'
import brainSparkle from './assets/figma/brain-sparkle.svg'
import { supabase, supabaseConfigured } from './lib/supabase'
import './App.css'

const disclaimer = 'For educational and demonstration purposes only. PneumoAI is not a medical diagnostic tool and should not be used to make healthcare decisions.'

function Brand({ onClick, className = '' }) {
  return <button className={`brand ${className}`} onClick={onClick} type="button">PneumoAI</button>
}

function App() {
  const [screen, setScreen] = useState('workspace')
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const [authReady, setAuthReady] = useState(!supabaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [notice, setNotice] = useState('')
  const [openMenu, setOpenMenu] = useState('')
  const [busy, setBusy] = useState(false)
  const [analysis, setAnalysis] = useState(null)
  const [analysisError, setAnalysisError] = useState('')
  const [showSplash, setShowSplash] = useState(true)
  const filePicker = useRef(null)
  const analysisRequest = useRef(null)
  const authEventRevision = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1250)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!supabase) return undefined

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authEventRevision.current += 1
      setAuthUser(session?.user ?? null)
      if (event === 'INITIAL_SESSION') {
        if (session?.user) setScreen('dashboard')
        setAuthReady(true)
      }
      if (event === 'SIGNED_IN') {
        setScreen('dashboard')
        setNotice('')
      }
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
        setScreen('forgot')
        setNotice('Enter and confirm your new password.')
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setRecoveryMode(false)
        setScreen('workspace')
      }
    })

    // getSession is a fallback for initialization errors or SDKs that do not
    // deliver INITIAL_SESSION. Ignore it if an auth event has since arrived.
    const revisionAtRequest = authEventRevision.current
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventRevision.current !== revisionAtRequest) return
      const restoredUser = data.session?.user ?? null
      setAuthUser(restoredUser)
      if (restoredUser) setScreen('dashboard')
      if (error) setNotice('Could not restore your sign-in. Please log in again.')
      setAuthReady(true)
    }).catch(() => {
      if (!active) return
      setAuthReady(true)
      setNotice('Could not connect to Supabase authentication.')
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const authUserId = authUser?.id
  useEffect(() => {
    if (!supabase || !authUserId) return undefined

    let active = true
    supabase.from('profiles')
      .select('id, display_name, age')
      .eq('id', authUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setProfile(data ?? null)
      })
      .catch(() => {
        if (active) setProfile(null)
      })

    return () => { active = false }
  }, [authUserId])

  const currentProfile = profile?.id === authUserId ? profile : null

  const go = (next) => {
    if (next !== 'results' && analysisRequest.current) {
      analysisRequest.current.abort()
      analysisRequest.current = null
      setBusy(false)
    }
    setNotice('')
    setOpenMenu('')
    setScreen(next)
  }

  const onFile = (event) => {
    const picked = event.target.files?.[0]
    if (!picked) return
    if (!picked.type.startsWith('image/')) {
      setNotice('Please choose an image file.')
      event.target.value = ''
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    analysisRequest.current?.abort()
    analysisRequest.current = null
    setBusy(false)
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
    setAnalysis(null)
    setAnalysisError('')
    setNotice('')
  }

  const analyse = async () => {
    if (!file) {
      setNotice('Choose a chest X-ray image before analysing.')
      return
    }
    setBusy(true)
    setAnalysis(null)
    setAnalysisError('')
    const controller = new AbortController()
    analysisRequest.current = controller
    go('results')
    try {
      const upload = new FormData()
      upload.append('file', file)
      const response = await fetch('/api/predict', { method: 'POST', body: upload, signal: controller.signal })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = payload?.detail
        const message = typeof detail === 'string' ? detail : detail?.message || `AI service returned ${response.status}.`
        const missing = Array.isArray(detail?.missing_settings) ? ` Required settings: ${detail.missing_settings.join(', ')}.` : ''
        throw new Error(`${message}${missing}`)
      }
      setAnalysis(payload)
    } catch (error) {
      if (error.name === 'AbortError') return
      setAnalysisError(error instanceof TypeError
        ? 'Could not reach the AI service. Check that the backend is running and preprocessing is configured.'
        : error.message || 'The image could not be analysed.')
    } finally {
      if (analysisRequest.current === controller) {
        analysisRequest.current = null
        setBusy(false)
      }
    }
  }

  const scanAgain = () => {
    analysisRequest.current?.abort()
    analysisRequest.current = null
    setBusy(false)
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    setAnalysis(null)
    setAnalysisError('')
    if (filePicker.current) filePicker.current.value = ''
    go('dashboard')
  }

  const submitAuth = async (event, mode) => {
    event.preventDefault()
    if (!authReady) {
      setNotice('Authentication is still loading. Please try again in a moment.')
      return
    }
    if (!supabaseConfigured || !supabase) {
      setNotice('Supabase is not configured. Check the frontend environment settings.')
      return
    }

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    setAuthBusy(true)
    setNotice('')

    try {
      if (mode === 'forgot' && !recoveryMode) {
        if (!email) throw new Error('Enter the email address for your account.')
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setNotice('If an account exists for that address, a password reset email has been sent.')
        return
      }

      if (!password) throw new Error('Enter your password.')
      if (password.length < 6) throw new Error('Use at least 6 characters for your password.')

      if (mode === 'forgot') {
        if (password !== form.get('confirm')) throw new Error('The passwords do not match.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        await supabase.auth.signOut()
        setAuthUser(null)
        setProfile(null)
        setRecoveryMode(false)
        setScreen('login')
        setNotice('Your password has been updated. Log in with your new password.')
        return
      }

      if (!email) throw new Error('Enter your email address.')

      if (mode === 'signup') {
        const name = String(form.get('name') || '').trim()
        const age = Number(form.get('age'))
        if (!name) throw new Error('Enter your name to create an account.')
        if (!Number.isInteger(age) || age < 1 || age > 120) throw new Error('Enter an age between 1 and 120.')

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, age },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error

        if (data.session) {
          setAuthUser(data.session.user)
          setScreen('dashboard')
        } else {
          setNotice('Check your email to confirm your account before logging in.')
        }
        return
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      setAuthUser(data.user)
      setScreen('dashboard')
    } catch (error) {
      setNotice(error.message || 'Authentication failed. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const logout = async () => {
    if (!supabase) return
    setAuthBusy(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setAuthUser(null)
      setProfile(null)
      go('workspace')
    } catch (error) {
      setNotice(error.message || 'Could not log out. Please try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  const saveAccountSettings = async ({ displayName, age, password }) => {
    if (!supabase || !authUser) throw new Error('Log in to update your account settings.')

    const cleanName = displayName.trim()
    const numericAge = Number(age)
    if (!cleanName) throw new Error('Enter a display name.')
    if (!Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) {
      throw new Error('Enter an age between 1 and 120.')
    }

    const { data, error } = await supabase.from('profiles')
      .update({ display_name: cleanName, age: numericAge })
      .eq('id', authUser.id)
      .select('id, display_name, age')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Your profile could not be found. Please reload and try again.')

    setProfile(data)
    if (password) {
      const { error: passwordError } = await supabase.auth.updateUser({ password })
      if (passwordError) {
        throw new Error(`Profile details were saved, but the password was not updated: ${passwordError.message}`)
      }
    }
  }

  const user = authUser ? {
    name: currentProfile?.display_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
    email: authUser.email || '',
    authenticated: true,
  } : { name: 'Guest', email: '', authenticated: false }

  const showProfile = () => setOpenMenu(openMenu === 'profile' ? '' : 'profile')
  const showNotifications = () => setOpenMenu(openMenu === 'notifications' ? '' : 'notifications')

  return (
    <main className="app-shell" onClick={(event) => {
      if (!event.target.closest('.header-actions')) setOpenMenu('')
    }}>
      {authReady && screen === 'workspace' && <Workspace go={go} />}
      {authReady && screen === 'login' && <AuthScreen mode="login" go={go} submit={submitAuth} notice={notice} busy={authBusy} authReady={authReady} />}
      {authReady && screen === 'signup' && <AuthScreen mode="signup" go={go} submit={submitAuth} notice={notice} busy={authBusy} authReady={authReady} />}
      {authReady && screen === 'forgot' && <AuthScreen mode="forgot" go={go} submit={submitAuth} notice={notice} busy={authBusy} authReady={authReady} recoveryMode={recoveryMode} />}
      {authReady && screen === 'dashboard' && <Dashboard
        go={go} user={user} logout={logout} file={file} preview={preview} onFile={onFile}
        filePicker={filePicker} openMenu={openMenu} showProfile={showProfile}
        showNotifications={showNotifications} analyse={analyse} busy={busy} notice={notice}
        profile={currentProfile} accountSettingsOpen={accountSettingsOpen}
        openAccountSettings={() => {
          if (!authUser) {
            setNotice('Log in to change account settings.')
            setOpenMenu('')
            return
          }
          setNotice('')
          setOpenMenu('')
          setAccountSettingsOpen(true)
        }}
        closeAccountSettings={() => setAccountSettingsOpen(false)}
        saveAccountSettings={saveAccountSettings}
      />}
      {authReady && screen === 'results' && <Results preview={preview} file={file} scanAgain={scanAgain} retry={analyse} loading={busy} error={analysisError} analysis={analysis} />}
      {(showSplash || (supabaseConfigured && !authReady)) && <Splash />}
    </main>
  )
}

function Splash() {
  return <div className="splash-overlay" aria-label="Preparing your workspace" role="status">
    <div className="splash-card"><h1>PneumoAI</h1><p>A clearer view. A more considered future.</p><span>RESPIRATORY INTELLIGENCE</span><div className="splash-track"><i /></div><small>Preparing your workspace</small></div>
  </div>
}

function Workspace({ go }) {
  return <div className="workspace-page">
    <header className="workspace-nav">
      <div className="nav-brand"><Brand onClick={() => go('workspace')} /><span>RESPIRATORY INTELLIGENCE</span></div>
      <button className="workspace-link" onClick={() => go('dashboard')}>Workspace</button>
      <div className="nav-auth"><button className="button button-light" onClick={() => go('login')}>Log in</button><button className="button button-dark" onClick={() => go('signup')}>Create account</button></div>
    </header>
    <section className="workspace-content">
      <div className="workspace-top">
        <div>
          <p className="eyebrow">A CLEARER PICTURE STARTS HERE</p>
          <h1>Your next insight,<br />within reach.</h1>
          <p className="workspace-description">PneumoAI brings AI-powered support to respiratory imaging.<br />A considered workspace for a clearer view of what comes next.</p>
        </div>
        <div className="workspace-status"><span className="status-dot" />WORKSPACE READY</div>
      </div>
      <div className="workspace-cards">
        <section className="review-card">
          <p className="eyebrow">01 — START A REVIEW</p>
          <h2>A focused space for each image.</h2>
          <p>Upload a chest X-ray and explore the model’s experimental output.</p>
          <div className="review-action"><button className="button button-dark" onClick={() => go('dashboard')}>Create your workspace <span aria-hidden="true">↗</span></button><small>JPG or PNG image</small></div>
        </section>
        <section className="about-card">
          <p className="eyebrow">ABOUT PNEUMOAI</p>
          <h2>Clarity with care.</h2>
          <p>An educational project exploring AI in respiratory imaging.</p>
        </section>
      </div>
    </section>
    <footer className="workspace-footer"><span>{disclaimer}</span><strong>PNEUMOAI&nbsp; · &nbsp;RESPIRATORY INTELLIGENCE</strong></footer>
  </div>
}

function AuthScreen({ mode, go, submit, notice, busy, authReady, recoveryMode }) {
  const requestRecovery = mode === 'forgot' && !recoveryMode
  const config = {
    login: { title: 'Welcome Back', subtitle: 'Log in to continue', action: 'log in' },
    signup: { title: 'Welcome', subtitle: 'Sign in to continue', action: 'Done' },
    forgot: requestRecovery
      ? { title: 'Forgot password?', subtitle: '', action: 'Send reset link' }
      : { title: 'Make new password', subtitle: '', action: 'Done' },
  }[mode]
  return <section className={`auth-page auth-${mode}`}>
    <form className="auth-card" onSubmit={(event) => submit(event, mode)}>
      <Brand className="auth-brand" onClick={() => go('workspace')} />
      {config.title && <h1>{config.title}</h1>}
      {config.subtitle && <p className="auth-subtitle">{config.subtitle}</p>}
      {mode === 'signup' && <>
        <Field label="Email Address" name="email" type="email" placeholder="Enter your mail" required />
        <Field label="Password" name="password" type="password" placeholder="Enter your password" required minLength={6} />
        <Field label="Enter your age" name="age" type="number" placeholder="Enter age" min="1" max="120" required />
        <Field label="Enter your name" name="name" placeholder="Enter your name" required />
      </>}
      {mode === 'login' && <>
        <Field label="Email Address" name="email" type="email" placeholder="Enter your mail" required />
        <Field label="Password" name="password" type="password" placeholder="Enter your password" required />
      </>}
      {mode === 'forgot' && <>
        {requestRecovery
          ? <Field label="Email Address" name="email" type="email" placeholder="Enter your mail" required />
          : <>
            <Field label="New password" name="password" type="password" placeholder="Enter your new password" required minLength={6} />
            <Field label="Re enter the new password" name="confirm" type="password" placeholder="Re enter your new password" required minLength={6} />
          </>}
      </>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      <button className="auth-submit" type="submit" disabled={busy || !authReady}>{busy ? 'Please wait…' : config.action}</button>
      {mode === 'login' && <div className="auth-links"><button type="button" onClick={() => go('forgot')}>Forgot password?</button><button type="button" onClick={() => go('signup')}>Create account?</button></div>}
      {mode === 'signup' && <button type="button" className="auth-footer-link" onClick={() => go('login')}>Already have an account?</button>}
      {mode === 'forgot' && <button type="button" className="auth-footer-link" onClick={() => go('login')}>Back to log in</button>}
      <p className="auth-disclaimer">Educational prototype · Not a medical diagnostic tool</p>
    </form>
  </section>
}

function Field({ label, ...props }) {
  return <label className="auth-field"><span>{label}</span><input {...props} /></label>
}

function Dashboard({ go, user, logout, file, preview, onFile, filePicker, openMenu, showProfile, showNotifications, analyse, busy, notice, profile, accountSettingsOpen, openAccountSettings, closeAccountSettings, saveAccountSettings }) {
  return <section className="model-page">
    <header className="model-header">
      <Brand onClick={() => go('workspace')} />
      <div className="header-actions">
        <button aria-label="Recent notifications" className="icon-button notification-button" onClick={showNotifications}><img src={bell} alt="" /></button>
        <button aria-label="Account profile" className="icon-button user-button" onClick={showProfile}><img src={userCircle} alt="" /></button>
        {openMenu === 'profile' && <div className="popover profile-popover" role="menu"><strong>Hello {user.name}!</strong><small>{user.email ? `Email address: ${user.email}` : 'Not signed in'}</small><button onClick={openAccountSettings}>Change account settings</button>{user.authenticated ? <button onClick={logout}>Log Out</button> : <button onClick={() => go('login')}>Log In</button>}</div>}
        {openMenu === 'notifications' && <div className="popover notification-popover"><strong>Recent Notifications:</strong><p>No recent notifications</p></div>}
      </div>
    </header>
    <div className="model-intro"><h1>PneumoAI</h1><div><p className="model-welcome">Welcome to PneumoAI</p><p className="model-kicker">AI-powered chest X-ray classification · Educational prototype</p><p className="model-disclaimer">NOTE: {disclaimer}</p></div></div>
    <div className="model-workspace">
      <article className="info-panel model-info"><div className="info-heading"><img src={brainSparkle} alt="" /><h2>AI Model</h2></div><p>The supplied MobileNetV2 model is intended for chest X-ray classification. The training notebook confirms the output mapping: class 0 = Normal and class 1 = Pneumonia. The selected 0.6 threshold remains unvalidated.</p></article>
      <section className="upload-panel" aria-label="Upload a chest X-ray">
        <input ref={filePicker} className="visually-hidden" type="file" accept="image/*" onChange={onFile} />
        <button type="button" className={`image-pick ${preview ? 'has-preview' : ''}`} aria-label="Browse for a chest X-ray image" onClick={() => filePicker.current?.click()}>
          {preview ? <img src={preview} alt="Selected chest X-ray preview" /> : <img src={imagePlus} alt="" />}
        </button>
        {file && <p className="selected-file" title={file.name}>{file.name}</p>}
        <button className="browse-button" type="button" onClick={() => filePicker.current?.click()}>Browse</button>
        <button className="analyse-button" type="button" onClick={analyse} disabled={busy}>{busy ? 'Preparing…' : 'Analyse'}</button>
        {notice && <p className="dashboard-notice" role="status">{notice}</p>}
      </section>
      <article className="info-panel about-panel"><img className="info-icon" src={informationCircle} alt="" /><p>PneumoAI is an educational AI project developed to demonstrate how machine learning can be applied to medical image classification. It explores the potential of artificial intelligence in healthcare through chest X-ray image analysis.</p></article>
    </div>
    {accountSettingsOpen && <AccountSettingsModal
      key={profile?.id || 'profile-loading'}
      profile={profile} user={user} onClose={closeAccountSettings} onSave={saveAccountSettings}
    />}
  </section>
}

function AccountSettingsModal({ profile, user, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(profile?.display_name || user.name || '')
  const [age, setAge] = useState(profile?.age == null ? '' : String(profile.age))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, saving])

  const submit = async (event) => {
    event.preventDefault()
    const cleanName = displayName.trim()
    const numericAge = Number(age)
    if (!profile) {
      setMessage('Your profile is still loading. Please wait and try again.')
      setMessageType('error')
      return
    }
    if (!cleanName) {
      setMessage('Enter a display name.')
      setMessageType('error')
      return
    }
    if (age === '' || !Number.isInteger(numericAge) || numericAge < 1 || numericAge > 120) {
      setMessage('Enter an age between 1 and 120.')
      setMessageType('error')
      return
    }
    if (password || confirmPassword) {
      if (!password || !confirmPassword) {
        setMessage('Enter and confirm your new password.')
        setMessageType('error')
        return
      }
      if (password.length < 6) {
        setMessage('Use at least 6 characters for your new password.')
        setMessageType('error')
        return
      }
      if (password !== confirmPassword) {
        setMessage('The new passwords do not match.')
        setMessageType('error')
        return
      }
    }

    setSaving(true)
    setMessage('')
    try {
      await onSave({ displayName: cleanName, age: numericAge, password })
      setPassword('')
      setConfirmPassword('')
      setMessage('Your account settings have been saved.')
      setMessageType('success')
    } catch (error) {
      setMessage(error.message || 'Could not save your account settings. Please try again.')
      setMessageType('error')
    } finally {
      setSaving(false)
    }
  }

  return <div className="settings-overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !saving) onClose()
  }}>
    <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-modal-header">
        <div><p className="settings-eyebrow">ACCOUNT</p><h2 id="settings-title">Account Settings</h2></div>
        <button className="settings-close" type="button" aria-label="Close account settings" onClick={onClose} disabled={saving}>×</button>
      </header>
      {!profile
        ? <p className="settings-loading" role="status">Loading your profile…</p>
        : <form className="settings-form" onSubmit={submit}>
          <label className="settings-field"><span>Display Name</span><input name="displayName" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required /></label>
          <label className="settings-field"><span>Age</span><input name="age" type="number" min="1" max="120" step="1" value={age} onChange={(event) => setAge(event.target.value)} required /></label>
          <label className="settings-field"><span>Email</span><input name="email" type="email" value={user.email} readOnly aria-readonly="true" /></label>
          <div className="settings-section-title"><h3>Change Password</h3><p>Leave both fields empty to keep your current password.</p></div>
          <label className="settings-field"><span>New Password</span><input name="newPassword" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength="6" /></label>
          <label className="settings-field"><span>Confirm New Password</span><input name="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength="6" /></label>
          {message && <p className={`settings-message ${messageType}`} role="status">{message}</p>}
          <button className="settings-save" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </form>}
    </section>
  </div>
}

function Results({ preview, file, scanAgain, retry, loading, error, analysis }) {
  const value = loading
    ? 'Analysis in progress…'
    : error
      ? 'Analysis unavailable'
      : analysis
        ? analysis.class_label || `Raw sigmoid output: ${Number(analysis.raw_sigmoid_score).toFixed(4)}`
        : 'Waiting for the AI service'
  return <section className="results-page">
    <header className="results-header"><h1>Analysis Results</h1><span className="experimental-pill">EXPERIMENTAL · UNVERIFIED</span></header>
    <div className="results-layout">
      <section className="xray-result"><h2>Uploaded X-ray:</h2><div className="result-image">{preview ? <img src={preview} alt="Uploaded chest X-ray" /> : <p>No image selected</p>}</div><p className="result-filename">{file?.name || ''}</p></section>
      <div className="result-divider" />
      <section className="prediction-result" aria-live="polite">
        <h2>Model prediction:</h2>
        <div className={`prediction-value ${error ? 'prediction-error' : ''}`}>{value}</div>
        {loading && <p className="prediction-note">Sending the selected image to the local experimental model service…</p>}
        {error && <p className="prediction-note prediction-error-copy">{error}</p>}
        {analysis && <>
          <p className="prediction-score">Experimental sigmoid score: {Number(analysis.raw_sigmoid_score).toFixed(4)}</p>
          <p className="prediction-note">Experimental label using a {analysis.threshold} threshold ({analysis.threshold_status}). Class labels follow the training notebook; this result is not a medical conclusion.</p>
        </>}
        {!loading && !error && !analysis && <p className="prediction-note">No verified prediction is available.</p>}
        <p className="results-disclaimer">NOTE: {disclaimer}</p>
        {error && <button className="retry-analysis" onClick={retry}>Retry analysis</button>}
        <button className="scan-again" onClick={scanAgain}>Scan again</button>
      </section>
    </div>
  </section>
}

export default App
