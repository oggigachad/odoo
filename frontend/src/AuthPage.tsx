import React, { useEffect, useState } from 'react'
import {
  type UserAccount,
  type UserRole,
  registerNewUser,
  loginUser,
  GOOGLE_CLIENT_ID,
  loginWithGoogleCredential,
  requestOtp,
  verifyOtp,
  getSignupRules,
} from './authService'
import { api, errorMessage } from './apiClient'

export type { UserRole, UserAccount }

interface AuthPageProps {
  onLoginSuccess: (user: UserAccount) => void
  onBackToLanding?: () => void
}

// Campus enrollment numbers differ between universities, so allow - / . _ delimiters (ISSUE-005)
const STUDENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9\-/._]{4,31}$/

export default function AuthPage({ onLoginSuccess, onBackToLanding }: AuthPageProps) {
  const [isSignUp, setIsSignUp] = useState(true)

  // Sign In fields
  const [signInEmail, setSignInEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')
  const [signInError, setSignInError] = useState('')
  const [isLoadingAuth, setIsLoadingAuth] = useState(false)

  // OTP Authentication fields (Sign In)
  const [authMethod, setAuthMethod] = useState<'password' | 'otp'>('password')
  const [otpCode, setOtpCode] = useState('')
  const [generatedDevOtp, setGeneratedDevOtp] = useState<string | null>(null)
  const [otpSent, setOtpSent] = useState(false)
  const [isGeneratingOtp, setIsGeneratingOtp] = useState(false)

  // Sign Up fields
  const [fullName, setFullName] = useState('')
  const [signUpEmail, setSignUpEmail] = useState('')
  const [signUpPhone, setSignUpPhone] = useState('')
  const [studentId, setStudentId] = useState('')
  const [signUpPassword, setSignUpPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [signUpErrors, setSignUpErrors] = useState<Record<string, string>>({})

  // Sign Up OTP fields
  const [signUpOtp, setSignUpOtp] = useState('')
  const [signUpOtpSent, setSignUpOtpSent] = useState(false)
  const [isSendingSignUpOtp, setIsSendingSignUpOtp] = useState(false)
  const [signUpDevOtp, setSignUpDevOtp] = useState<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [rules, setRules] = useState<{ student_domains: string[]; admin_domains: string[] } | null>(null)
  useEffect(() => { getSignupRules().then(setRules).catch(() => setRules(null)) }, [])
  const showDevOtp = (import.meta as any).env?.VITE_SHOW_DEV_OTP === 'true'

  // Live club numbers for the side panel (hidden until the server answers)
  const [stats, setStats] = useState<{ members: number; upcoming_events: number } | null>(null)
  useEffect(() => {
    api<{ members: number; upcoming_events: number }>('/stats').then(setStats).catch(() => setStats(null))
  }, [])

  // Google OAuth GSI initializer
  useEffect(() => {
    const initGoogle = () => {
      if (!GOOGLE_CLIENT_ID) return
      if (typeof window !== 'undefined' && (window as any).google?.accounts?.id) {
        try {
          ;(window as any).google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
          })
          const btnParent = document.getElementById('googleSignInBtn')
          if (btnParent) {
            btnParent.innerHTML = ''
            ;(window as any).google.accounts.id.renderButton(btnParent, {
              theme: 'outline',
              size: 'large',
              type: 'standard',
              shape: 'pill',
              text: 'continue_with',
              logo_alignment: 'left',
              width: '100%',
            })
          }
        } catch (e) {
          console.warn('Google GSI initialization notice:', e)
        }
      }
    }

    const timer = setTimeout(initGoogle, 500)
    return () => clearTimeout(timer)
  }, [isSignUp])

  const handleGoogleCredentialResponse = async (response: any) => {
    if (!response || !response.credential) return
    setIsLoadingAuth(true)
    setSignInError('')
    try {
      const user = await loginWithGoogleCredential(response.credential)
      setIsLoadingAuth(false)
      onLoginSuccess(user)
    } catch (err) {
      setIsLoadingAuth(false)
      setSignInError(errorMessage(err, 'Google authentication failed'))
    }
  }

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'bg-zinc-200' }
    let score = 0
    if (pass.length >= 8) score += 1
    if (/[A-Z]/.test(pass)) score += 1
    if (/[0-9]/.test(pass)) score += 1
    if (/[^A-Za-z0-9]/.test(pass)) score += 1

    if (score <= 1) return { score: 25, label: 'Weak', color: 'bg-rose-500' }
    if (score === 2) return { score: 50, label: 'Fair', color: 'bg-amber-500' }
    if (score === 3) return { score: 75, label: 'Good', color: 'bg-sky-400' }
    return { score: 100, label: 'Strong', color: 'bg-emerald-400' }
  }

  const passStrength = getPasswordStrength(signUpPassword)

  // Send OTP for Sign Up
  const handleSendSignUpOtp = async () => {
    if (!signUpEmail.trim() || !signUpEmail.includes('@')) {
      setSignUpErrors({ email: 'Please enter a valid email address first.' })
      return
    }
    setSignUpErrors({})
    setIsSendingSignUpOtp(true)
    try {
      const res = await requestOtp(signUpEmail, 'register')
      setSignUpDevOtp(res.devCode)
      setSignUpOtpSent(true)
      setNotice(`A 6-digit code was sent to ${signUpEmail}.`)
      setTimeout(() => setNotice(null), 6000)
    } catch (err) {
      setSignUpErrors({ email: errorMessage(err, 'Failed to send OTP') })
    } finally {
      setIsSendingSignUpOtp(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    const errors: Record<string, string> = {}
    if (!fullName.trim()) errors.fullName = 'Full name is required'
    if (!signUpEmail.trim() || !signUpEmail.includes('@')) errors.email = 'Valid email is required'
    if (studentId.trim() && !STUDENT_ID_RE.test(studentId.trim())) {
      errors.studentId = 'Use 5-32 letters, digits or - / . _ (e.g. NMIT/CS/2026-01)'
    }
    if (signUpPassword.length < 8) errors.password = 'Password must be at least 8 characters'
    if (signUpPassword !== confirmPassword) errors.confirmPassword = 'Passwords do not match'
    if (!agreedTerms) errors.terms = 'You must accept the club bylaws and privacy policy'

    // The emailed code is mandatory: it proves the address belongs to the person signing up
    if (!signUpOtpSent) errors.otp = 'Press "Send Verification OTP" and enter the code from your email'
    else if (signUpOtp.trim().length !== 6) errors.otp = 'Please enter the 6-digit verification code'

    if (Object.keys(errors).length > 0) {
      setSignUpErrors(errors)
      return
    }

    setSignUpErrors({})
    setIsLoadingAuth(true)
    try {
      const user: UserAccount = await registerNewUser({
        name: fullName,
        email: signUpEmail,
        password: signUpPassword,
        otp: signUpOtp.trim(),
        phone: signUpPhone.trim() || undefined,
        studentId: studentId.trim() || undefined,
      })
      setIsLoadingAuth(false)
      onLoginSuccess(user)
    } catch (err) {
      setIsLoadingAuth(false)
      setSignUpErrors({ email: errorMessage(err, 'Registration failed') })
    }
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setSignInError('')
    if (!signInEmail || !signInPassword) {
      setSignInError('Enter your email and password')
      return
    }
    setIsLoadingAuth(true)
    try {
      const user = await loginUser(signInEmail, signInPassword)
      onLoginSuccess(user)
    } catch (err) {
      setSignInError(errorMessage(err, 'Email or password incorrect'))
    } finally {
      setIsLoadingAuth(false)
    }
  }

  const handleGenerateSignInOtp = async () => {
    if (!signInEmail.trim() || !signInEmail.includes('@')) {
      setSignInError('Please enter a valid email address first.')
      return
    }
    setSignInError('')
    setIsGeneratingOtp(true)
    try {
      const res = await requestOtp(signInEmail)
      setGeneratedDevOtp(res.devCode)
      setOtpSent(true)
      setNotice(`A 6-digit code was sent to ${signInEmail}.`)
      setTimeout(() => setNotice(null), 5000)
    } catch (err) {
      setSignInError(errorMessage(err, 'Failed to send code'))
    } finally {
      setIsGeneratingOtp(false)
    }
  }

  const handleVerifySignInOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signInEmail.trim()) {
      setSignInError('Email address is required.')
      return
    }
    if (otpCode.trim().length !== 6) {
      setSignInError('Please enter the 6-digit code.')
      return
    }
    setSignInError('')
    setIsLoadingAuth(true)
    try {
      const user = await verifyOtp(signInEmail, otpCode)
      onLoginSuccess(user)
    } catch (err) {
      setSignInError(errorMessage(err, 'Verification failed'))
    } finally {
      setIsLoadingAuth(false)
    }
  }

  // One-click fill for the built-in role accounts
  return (
    <div
      className="fixed inset-0 w-screen h-screen overflow-hidden flex flex-col justify-center items-center p-3 sm:p-6 select-none bg-[#714B67] text-white"
      style={{ fontFamily: 'var(--font-display, "TT Firs Neue", sans-serif)' }}
    >
      {/* Background Ambience Video / Canvas Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-45">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          src="/signup.mp4"
        />
        <div className="absolute inset-0 bg-[#714B67]/75 backdrop-blur-[4px]" />
      </div>

      {/* Main Split-Screen Card */}
      <div className="w-full max-w-5xl h-[94vh] max-h-[820px] rounded-[32px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.55)] border border-white/20 bg-[#48223f]/95 backdrop-blur-2xl transition-all duration-300 relative flex flex-col z-10">
        {/* Top Bar with Back Button */}
        <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-black/15 flex-shrink-0">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="Skyline"
              className="h-6 w-auto"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-white/80">Skyline Portal</span>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="md:hidden flex p-2 border-b border-white/15 gap-1 bg-black/25 flex-shrink-0">
          <button
            onClick={() => setIsSignUp(true)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border-none ${
              isSignUp ? 'bg-white text-[#714B67] shadow-sm' : 'text-white/60 bg-transparent'
            }`}
          >
            Create Account
          </button>
          <button
            onClick={() => setIsSignUp(false)}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border-none ${
              !isSignUp ? 'bg-white text-[#714B67] shadow-sm' : 'text-white/60 bg-transparent'
            }`}
          >
            Sign In
          </button>
        </div>

        {notice && (
          <div className="px-6 py-2 bg-[#2f152a]/90 border-b border-white/15 text-white/90 text-xs flex items-center gap-2 z-30">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{notice}</span>
          </div>
        )}

        {/* Desktop Split-Screen Container */}
        <div className="relative w-full flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* SIGN UP FORM PANEL (Left side) */}
          <div
            className={`w-full md:w-1/2 p-5 sm:p-7 md:p-8 flex flex-col justify-start overflow-y-auto custom-scrollbar transition-all duration-700 ease-in-out ${
              !isSignUp ? 'hidden md:flex opacity-0 pointer-events-none' : 'flex opacity-100'
            }`}
          >
            <div className="max-w-md mx-auto w-full pb-4">
              <div className="text-center mb-4">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Create Account</h2>
                <p className="text-xs text-white/70 mt-1">
                  Start as a Member or Guest. Buy memberships & event passes in ₹.
                </p>
              </div>

              <form onSubmit={handleSignUp} className="space-y-2.5">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold mb-1 text-white/90">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Chen"
                    className={`w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
                      signUpErrors.fullName
                        ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
                        : 'bg-white/10 border-white/20 text-white placeholder-white/40'
                    }`}
                  />
                  {signUpErrors.fullName && (
                    <span className="text-[10px] text-rose-300 mt-0.5 block">{signUpErrors.fullName}</span>
                  )}
                </div>

                {/* Email Address */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-white/90">Email Address *</label>
                  </div>
                  <input
                    type="email"
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    placeholder="you@gmail.com or you@student.edu.in"
                    className={`w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
                      signUpErrors.email
                        ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
                        : 'bg-white/10 border-white/20 text-white placeholder-white/40'
                    }`}
                  />
                  {rules && !signUpErrors.email && (
                    <span className="text-[10px] text-white/50 mt-0.5 block">
                      Students: {rules.student_domains.map(d => '@' + d).join(', ')} · Organisation staff: {rules.admin_domains.map(d => '@' + d).join(', ')}
                    </span>
                  )}
                  {signUpErrors.email && (
                    <span className="text-[10px] text-rose-300 mt-0.5 block">{signUpErrors.email}</span>
                  )}
                </div>

                {/* Phone & Student ID Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/90">Phone Number</label>
                    <input
                      type="tel"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/90">
                      Student ID <span className="text-white/50 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="1NT23CS001"
                      className={`w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
                        signUpErrors.studentId
                          ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
                          : 'bg-white/10 border-white/20 text-white placeholder-white/40'
                      }`}
                    />
                    {signUpErrors.studentId && (
                      <span className="text-[10px] text-rose-300 mt-0.5 block">{signUpErrors.studentId}</span>
                    )}
                  </div>
                </div>

                {/* Passwords */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-white/90">Password</label>
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="text-white/60 text-[10px] bg-transparent border-none cursor-pointer"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
                        signUpErrors.password
                          ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
                          : 'bg-white/10 border-white/20 text-white placeholder-white/40'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/90">Confirm Password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40 ${
                        signUpErrors.confirmPassword
                          ? 'border-rose-400 bg-rose-500/20 text-white placeholder-white/40'
                          : 'bg-white/10 border-white/20 text-white placeholder-white/40'
                      }`}
                    />
                  </div>
                </div>

                {/* Password Strength Meter */}
                {signUpPassword && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-white/60">Strength</span>
                      <span className="font-semibold text-white">{passStrength.label}</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passStrength.color} transition-all duration-300`}
                        style={{ width: `${passStrength.score}%` }}
                      />
                    </div>
                  </div>
                )}

                {signUpErrors.password && (
                  <span className="text-[10px] text-rose-300 block">{signUpErrors.password}</span>
                )}
                {signUpErrors.confirmPassword && (
                  <span className="text-[10px] text-rose-300 block">{signUpErrors.confirmPassword}</span>
                )}

                {/* OTP Verification Box for Sign Up  */}
                <div className="p-2.5 rounded-xl bg-black/25 border border-white/15 space-y-2 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-300 uppercase tracking-wide">
                      Email OTP Verification
                    </span>
                  </div>

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleSendSignUpOtp}
                      disabled={isSendingSignUpOtp || !signUpEmail.trim()}
                      className="flex-1 py-1 px-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold transition-all disabled:opacity-40 border-none cursor-pointer"
                    >
                      {isSendingSignUpOtp ? 'Sending code...' : (signUpOtpSent ? 'Resend OTP' : 'Send Verification OTP')}
                    </button>

                  </div>

                  {showDevOtp && signUpDevOtp && (
                    <div className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 text-[10px] flex items-center justify-between">
                      <span>Dev code: <strong className="font-mono text-white text-xs">{signUpDevOtp}</strong></span>
                      <button
                        type="button"
                        onClick={() => setSignUpOtp(signUpDevOtp)}
                        className="px-1.5 py-0.5 rounded bg-white text-[#714B67] text-[9px] font-bold border-none cursor-pointer"
                      >
                        Auto-Fill
                      </button>
                    </div>
                  )}

                  {signUpOtpSent && (
                    <div>
                      <input
                        type="text"
                        maxLength={6}
                        value={signUpOtp}
                        onChange={(e) => setSignUpOtp(e.target.value.replace(/\D/g, ''))}
                        placeholder="6-digit code from your email"
                        className="w-full px-3 py-1.5 rounded-lg text-center font-mono tracking-widest text-xs border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                      />
                      {signUpErrors.otp && (
                        <span className="text-[10px] text-rose-300 mt-0.5 block">{signUpErrors.otp}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Terms checkbox */}
                <div className="flex items-start gap-2 pt-0.5">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={agreedTerms}
                    onChange={(e) => setAgreedTerms(e.target.checked)}
                    className="mt-0.5 rounded accent-[#38bdf8] cursor-pointer"
                  />
                  <label htmlFor="terms" className="text-[11px] text-white/70 cursor-pointer leading-tight">
                    I agree to the Skyline Association bylaws, honor code, and club policies.
                  </label>
                </div>
                {signUpErrors.terms && (
                  <span className="text-[10px] text-rose-300 block">{signUpErrors.terms}</span>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoadingAuth}
                  className="w-full mt-1.5 py-2.5 rounded-xl bg-white hover:bg-white/90 text-[#714B67] text-xs sm:text-sm font-bold uppercase tracking-wider shadow-md active:scale-[0.99] transition-all cursor-pointer border-none"
                >
                  {isLoadingAuth ? 'Creating account...' : 'Create Account'}
                </button>

                <p className="text-center text-xs text-white/70 pt-1">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(false)}
                    className="font-bold text-[#38bdf8] hover:underline cursor-pointer bg-transparent border-none p-0"
                  >
                    Sign in
                  </button>
                </p>
              </form>
            </div>
          </div>

          {/* SIGN IN FORM PANEL (Right side) */}
          <div
            className={`w-full md:w-1/2 p-5 sm:p-7 md:p-8 flex flex-col justify-start overflow-y-auto custom-scrollbar transition-all duration-700 ease-in-out md:absolute md:right-0 md:top-0 md:bottom-0 ${
              isSignUp ? 'hidden md:flex opacity-0 pointer-events-none' : 'flex opacity-100 z-10'
            }`}
          >
            <div className="max-w-md mx-auto w-full pb-4">
              <div className="text-center mb-3">
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">Sign In</h2>
                <p className="text-xs text-white/70 mt-0.5">
                  Sign in with your email and password, or a one-time code.
                </p>
              </div>

              {GOOGLE_CLIENT_ID && (
              <div className="space-y-2 mb-3 bg-white/5 p-3 rounded-2xl border border-white/15">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-emerald-300">Existing members: sign in with Google</span>
                </div>
                <div id="googleSignInBtn" className="flex justify-center min-h-[44px] w-full" />
              </div>
              )}

              {/* Auth Method Switcher: Password vs OTP */}
              <div className="flex p-1 rounded-xl bg-black/25 border border-white/15 mb-3 gap-1">
                <button
                  type="button"
                  onClick={() => { setAuthMethod('password'); setSignInError('') }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer border-none ${
                    authMethod === 'password' ? 'bg-white text-[#714B67] shadow-sm' : 'bg-transparent text-white/60 hover:text-white'
                  }`}
                >
                  Password Sign In
                </button>
                <button
                  type="button"
                  onClick={() => { setAuthMethod('otp'); setSignInError('') }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer border-none ${
                    authMethod === 'otp' ? 'bg-white text-[#714B67] shadow-sm' : 'bg-transparent text-white/60 hover:text-white'
                  }`}
                >
                  Sign In with OTP
                </button>
              </div>

              {signInError && (
                <div className="p-2 mb-3 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-200 text-xs font-medium">
                  {signInError}
                </div>
              )}

              {authMethod === 'password' ? (
                <form onSubmit={handleSignIn} className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/90">Email Address</label>
                    <input
                      type="email"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-white/90">Password</label>
                      <button
                        type="button"
                        onClick={() => { setAuthMethod('otp'); setSignInError('') }}
                        className="text-[11px] text-[#38bdf8] hover:underline cursor-pointer bg-transparent border-none p-0"
                      >
                        Forgot password? Use OTP
                      </button>
                    </div>
                    <input
                      type="password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-1.5 rounded-xl text-xs sm:text-sm border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoadingAuth}
                    className="w-full mt-2 py-2.5 rounded-full bg-white hover:bg-white/90 text-[#714B67] text-xs sm:text-sm font-bold uppercase tracking-wider shadow-md active:scale-[0.99] transition-all cursor-pointer border-none"
                  >
                    {isLoadingAuth ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifySignInOtp} className="space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-white/90">Email Address for OTP</label>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={signInEmail}
                        onChange={(e) => setSignInEmail(e.target.value)}
                        placeholder="you@gmail.com"
                        className="flex-1 px-3 py-1.5 rounded-xl text-xs sm:text-sm border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                      />
                      <button
                        type="button"
                        onClick={handleGenerateSignInOtp}
                        disabled={isGeneratingOtp || !signInEmail.trim()}
                        className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-all disabled:opacity-40 border-none cursor-pointer"
                      >
                        {isGeneratingOtp ? 'Sending...' : (otpSent ? 'Resend' : 'Send OTP')}
                      </button>
                    </div>
                  </div>

                  {otpSent && (
                    <div className="space-y-2.5 animate-fadeIn">
                      {showDevOtp && generatedDevOtp && (
                        <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-bold">Dev code:</span>{' '}
                            <span className="font-mono tracking-widest text-sm text-white font-black">{generatedDevOtp}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOtpCode(generatedDevOtp)}
                            className="px-2 py-0.5 rounded bg-white text-[#714B67] text-[10px] font-bold border-none cursor-pointer"
                          >
                            Auto-Fill
                          </button>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-white/90">6-Digit Verification Code</label>
                          <span className="text-[10px] text-white/50">Expires in 5 minutes</span>
                        </div>
                        <input
                          type="text"
                          maxLength={6}
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="••••••"
                          className="w-full px-3 py-2 rounded-xl text-center text-sm font-mono tracking-widest border bg-white/10 border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/40"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isLoadingAuth || otpCode.length !== 6}
                        className="w-full py-2.5 rounded-full bg-white hover:bg-white/90 text-[#714B67] text-xs sm:text-sm font-bold uppercase tracking-wider shadow-md active:scale-[0.99] transition-all cursor-pointer border-none disabled:opacity-50"
                      >
                        {isLoadingAuth ? 'Verifying...' : 'Verify OTP & Sign In'}
                      </button>
                    </div>
                  )}
                </form>
              )}

              <p className="text-center text-xs text-white/70 pt-2">
                New here?{' '}
                <button
                  type="button"
                  onClick={() => setIsSignUp(true)}
                  className="font-bold text-[#38bdf8] hover:underline cursor-pointer bg-transparent border-none p-0"
                >
                  Create account
                </button>
              </p>
            </div>
          </div>

          {/* SLIDING MEDIA PANEL (Smooth 600ms ease-in-out transition) */}
          <div
            className={`hidden md:flex absolute top-0 bottom-0 w-1/2 p-6 z-20 transition-all duration-700 ease-in-out ${
              isSignUp ? 'left-1/2' : 'left-0'
            }`}
          >
            <div className="w-full h-full rounded-[24px] overflow-hidden relative shadow-2xl flex flex-col justify-end p-8 text-white border border-white/20">
              <video
                autoPlay
                loop
                muted
                playsInline
                key={isSignUp ? 'signup-video' : 'signin-video'}
                className="absolute inset-0 w-full h-full object-cover"
                src={isSignUp ? '/signup.mp4' : '/signin.mp4'}
              />

              {/* Skyline Sunset & Plum Cinematic Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#45203b]/95 via-[#714B67]/75 to-transparent backdrop-blur-[1px]" />

              <div className="relative z-10 space-y-3">
                <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-widest uppercase bg-white/20 backdrop-blur-md border border-white/30 text-white inline-block">
                  Skyline Student Association
                </span>
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight leading-snug">
                  {isSignUp ? 'Join the club that runs your campus.' : 'Welcome back to your campus leadership center.'}
                </h3>
                <p className="text-xs sm:text-sm text-white/85 font-normal leading-relaxed">
                  {isSignUp
                    ? 'Discover campus events, order exclusive gear, and unlock member savings in ₹ with verified semester fee status.'
                    : 'Review live treasury records in ₹, coordinate upcoming announcements, or view your event passes.'}
                </p>

                {stats && (
                  <div className="pt-1 flex items-center gap-3 text-xs font-semibold text-white/90">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>{stats.members.toLocaleString()} {stats.members === 1 ? 'member' : 'members'}</span>
                    </div>
                    <div>·</div>
                    <div>{stats.upcoming_events} upcoming {stats.upcoming_events === 1 ? 'event' : 'events'}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
