import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useBooking } from '../hooks/useBooking'
import { apiRequest } from '../lib/api'

function formatDateLabel(dateText) {
  return new Date(dateText).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function formatTimeLabel(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function SelectionPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const {
    selectedTheater,
    selectedMovie,
    selectedShowtime,
    chooseTheater,
    chooseMovie,
    chooseShowtime,
  } = useBooking()

  const [theaters, setTheaters] = useState([])
  const [movies, setMovies] = useState([])
  const [showtimes, setShowtimes] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [loading, setLoading] = useState({
    theaters: true,
    movies: false,
    showtimes: false,
  })
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    let active = true

    async function fetchTheaters() {
      setLoading((current) => ({ ...current, theaters: true }))
      try {
        const data = await apiRequest('/api/theaters')
        if (active) {
          setTheaters(data)
        }
      } catch (error) {
        if (active) {
          setFeedback(error.message || 'Failed to fetch theaters.')
        }
      } finally {
        if (active) {
          setLoading((current) => ({ ...current, theaters: false }))
        }
      }
    }

    fetchTheaters()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedTheater) {
      setMovies([])
      setShowtimes([])
      return
    }

    let active = true

    async function fetchMovies() {
      setLoading((current) => ({ ...current, movies: true }))
      try {
        const data = await apiRequest(`/api/movies?theaterId=${selectedTheater.id}`)
        if (active) {
          setMovies(data)
        }
      } catch (error) {
        if (active) {
          setFeedback(error.message || 'Failed to fetch movies.')
        }
      } finally {
        if (active) {
          setLoading((current) => ({ ...current, movies: false }))
        }
      }
    }

    fetchMovies()

    return () => {
      active = false
    }
  }, [selectedTheater])

  useEffect(() => {
    if (!selectedTheater || !selectedMovie) {
      setShowtimes([])
      return
    }

    let active = true

    async function fetchShowtimes() {
      setLoading((current) => ({ ...current, showtimes: true }))
      try {
        const data = await apiRequest(
          `/api/showtimes?theaterId=${selectedTheater.id}&movieId=${selectedMovie.id}`,
        )
        if (active) {
          setShowtimes(data)
        }
      } catch (error) {
        if (active) {
          setFeedback(error.message || 'Failed to fetch showtimes.')
        }
      } finally {
        if (active) {
          setLoading((current) => ({ ...current, showtimes: false }))
        }
      }
    }

    fetchShowtimes()

    return () => {
      active = false
    }
  }, [selectedTheater, selectedMovie])

  const upcomingShowtimes = useMemo(() => {
    const now = new Date().getTime()
    return showtimes
      .filter((slot) => new Date(slot.startTime).getTime() > now)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
  }, [showtimes])

  const showtimesByDate = useMemo(() => {
    return upcomingShowtimes.reduce((map, slot) => {
      if (!map[slot.date]) {
        map[slot.date] = []
      }
      map[slot.date].push(slot)
      return map
    }, {})
  }, [upcomingShowtimes])

  const availableDates = useMemo(
    () => Object.keys(showtimesByDate).sort(),
    [showtimesByDate],
  )

  useEffect(() => {
    if (availableDates.length === 0) {
      setSelectedDate('')
      return
    }

    if (!availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates[0])
    }
  }, [availableDates, selectedDate])

  function handleContinueToSeats() {
    if (!selectedShowtime) {
      return
    }
    navigate(`/booking/${selectedShowtime.id}`)
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-brand-300/25 bg-brand-900/70 p-5 shadow-glow backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-brand-100/75">
            Logged in as {user?.email}
          </p>
          <h1 className="mt-2 font-display text-4xl text-brand-50 md:text-5xl">
            Plan Your Showtime
          </h1>
        </div>

        <button
          type="button"
          onClick={logout}
          className="rounded-xl border border-brand-200/30 bg-brand-800/60 px-4 py-2 text-sm text-brand-100 transition hover:bg-brand-700"
        >
          Logout
        </button>
      </header>

      {feedback && (
        <p className="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
          {feedback}
        </p>
      )}

      <div className="grid gap-5">
        <section className="rounded-3xl border border-brand-300/25 bg-brand-900/55 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-100/70">Step 1</p>
          <h2 className="mt-2 font-display text-3xl text-brand-50">Select Theater</h2>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {loading.theaters && (
              <p className="text-sm text-brand-100/80">Loading theaters...</p>
            )}

            {!loading.theaters &&
              theaters.map((theater) => (
                <button
                  key={theater.id}
                  type="button"
                  onClick={() => chooseTheater(theater)}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    selectedTheater?.id === theater.id
                      ? 'border-brand-100 bg-brand-100 text-brand-900'
                      : 'border-brand-200/20 bg-brand-950/40 text-brand-50 hover:border-brand-200/45'
                  }`}
                >
                  <p className="text-lg font-semibold">{theater.name}</p>
                  <p className="text-sm opacity-85">{theater.location}</p>
                </button>
              ))}
          </div>
        </section>

        <section className="rounded-3xl border border-brand-300/25 bg-brand-900/55 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-100/70">Step 2</p>
          <h2 className="mt-2 font-display text-3xl text-brand-50">Select Movie</h2>

          {!selectedTheater ? (
            <p className="mt-4 text-sm text-brand-100/80">
              Pick a theater first to load movies.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {loading.movies && (
                <p className="text-sm text-brand-100/80">Loading movies...</p>
              )}

              {!loading.movies &&
                movies.map((movie) => (
                  <button
                    key={movie.id}
                    type="button"
                    onClick={() => chooseMovie(movie)}
                    className={`grid grid-cols-[72px_1fr] items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      selectedMovie?.id === movie.id
                        ? 'border-brand-100 bg-brand-100 text-brand-900'
                        : 'border-brand-200/20 bg-brand-950/35 text-brand-50 hover:border-brand-200/45'
                    }`}
                  >
                    <div
                      className="h-20 rounded-xl bg-cover bg-center"
                      style={{
                        backgroundImage: movie.posterUrl
                          ? `url(${movie.posterUrl})`
                          : 'linear-gradient(140deg, #8a5a2f, #3f2617)',
                      }}
                    />
                    <div>
                      <p className="font-semibold">{movie.title}</p>
                      <p className="text-sm opacity-80">{movie.genre}</p>
                    </div>
                  </button>
                ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-brand-300/25 bg-brand-900/55 p-5">
          <p className="text-xs uppercase tracking-[0.25em] text-brand-100/70">Step 3</p>
          <h2 className="mt-2 font-display text-3xl text-brand-50">Select Date & Time</h2>

          {!selectedMovie ? (
            <p className="mt-4 text-sm text-brand-100/80">
              Pick a movie first to load showtimes.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {loading.showtimes && (
                <p className="text-sm text-brand-100/80">Loading showtimes...</p>
              )}

              {!loading.showtimes && availableDates.length === 0 && (
                <p className="text-sm text-brand-100/80">
                  No future showtimes available for this theater and movie.
                </p>
              )}

              {availableDates.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {availableDates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`rounded-xl border px-4 py-2 text-sm transition ${
                          selectedDate === date
                            ? 'border-brand-100 bg-brand-100 text-brand-900'
                            : 'border-brand-200/25 bg-brand-950/35 text-brand-50 hover:border-brand-200/45'
                        }`}
                      >
                        {formatDateLabel(date)}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(showtimesByDate[selectedDate] || []).map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => chooseShowtime(slot)}
                        className={`rounded-xl border px-4 py-2 text-sm transition ${
                          selectedShowtime?.id === slot.id
                            ? 'border-brand-100 bg-brand-100 text-brand-900'
                            : 'border-brand-200/25 bg-brand-950/35 text-brand-50 hover:border-brand-200/45'
                        }`}
                      >
                        {formatTimeLabel(slot.startTime)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      <footer className="mt-5 rounded-3xl border border-brand-300/25 bg-brand-900/70 p-5">
        <p className="text-sm text-brand-100/85">
          Selection: {selectedTheater?.name || 'No theater'} /{' '}
          {selectedMovie?.title || 'No movie'} /{' '}
          {selectedShowtime
            ? `${formatDateLabel(selectedShowtime.date)} ${formatTimeLabel(selectedShowtime.startTime)}`
            : 'No showtime'}
        </p>

        <button
          type="button"
          onClick={handleContinueToSeats}
          disabled={!selectedShowtime}
          className="mt-4 rounded-xl bg-brand-200 px-5 py-2.5 font-semibold text-brand-900 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue to Seat Booking
        </button>
      </footer>
    </div>
  )
}

export default SelectionPage
