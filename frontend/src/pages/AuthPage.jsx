import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

function AuthPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [feedback, setFeedback] = useState({ type: 'idle', message: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const destination = location.state?.from || '/'

  async function handleSubmit(event) {
    event.preventDefault()
    setFeedback({ type: 'idle', message: '' })
    setIsSubmitting(true)

    try {
      if (mode === 'register') {
        await register(email, password)
      }

      await login(email, password)
      navigate(destination, { replace: true })
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Authentication failed.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-8 sm:px-8">
      <div className="grid w-full grid-cols-1 gap-6 rounded-3xl border border-brand-300/30 bg-brand-900/65 p-5 shadow-glow backdrop-blur-md md:grid-cols-[1.15fr_0.95fr] md:p-8">
        <section className="rounded-2xl border border-brand-200/20 bg-brand-800/30 p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.3em] text-brand-100/80">
            Movie Ticket Booking
          </p>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] text-brand-50 md:text-5xl">
            Welcome Back to the Box Office
          </h1>
          <p className="mt-4 max-w-xl text-sm text-brand-100/80 md:text-base">
            Sign in to access theater selection, movie schedules, and real-time
            seat availability by showtime.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3 text-center text-xs text-brand-50 md:text-sm">
            <div className="rounded-xl border border-brand-200/20 bg-brand-950/35 px-3 py-4">
              Authenticated booking
            </div>
            <div className="rounded-xl border border-brand-200/20 bg-brand-950/35 px-3 py-4">
              Live seat locking
            </div>
            <div className="rounded-xl border border-brand-200/20 bg-brand-950/35 px-3 py-4">
              Multi-theater flow
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-brand-200/25 bg-brand-950/55 p-6 md:p-8">
          <div className="inline-flex rounded-xl border border-brand-300/30 bg-brand-900/60 p-1 text-sm">
            <button
              type="button"
              className={`rounded-lg px-4 py-2 transition ${
                mode === 'login'
                  ? 'bg-brand-200 text-brand-900'
                  : 'text-brand-100 hover:bg-brand-800/70'
              }`}
              onClick={() => setMode('login')}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded-lg px-4 py-2 transition ${
                mode === 'register'
                  ? 'bg-brand-200 text-brand-900'
                  : 'text-brand-100 hover:bg-brand-800/70'
              }`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm text-brand-100">Gmail Address</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@gmail.com"
                className="w-full rounded-xl border border-brand-200/20 bg-brand-900/50 px-3 py-2.5 text-brand-50 outline-none transition placeholder:text-brand-100/45 focus:border-brand-200/70"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm text-brand-100">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-xl border border-brand-200/20 bg-brand-900/50 px-3 py-2.5 text-brand-50 outline-none transition placeholder:text-brand-100/45 focus:border-brand-200/70"
              />
            </label>

            {feedback.message && (
              <p className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 animate-rise">
                {feedback.message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-brand-200 px-4 py-2.5 font-semibold text-brand-900 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? 'Please wait...'
                : mode === 'login'
                  ? 'Login'
                  : 'Register and Continue'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export default AuthPage
