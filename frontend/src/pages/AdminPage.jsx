import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { apiRequest } from '../lib/api'

const emptyMovieForm = { title: '', genre: '', posterUrl: '' }
const emptyTheaterForm = {
  name: '',
  location: '',
  address: '',
  latitude: '',
  longitude: '',
}
const emptyShowtimeForm = { theaterId: '', movieId: '', startTime: '' }

function toDateTimeLocal(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseSeatIds(text) {
  const values = text
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isInteger(part) && part >= 1 && part <= 20)

  return [...new Set(values)].sort((left, right) => left - right)
}

export default function AdminPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const isAdmin = useMemo(
    () => Boolean(user?.isAdmin || user?.email === 'admin@gmail.com'),
    [user],
  )

  const [movies, setMovies] = useState([])
  const [theaters, setTheaters] = useState([])
  const [showtimes, setShowtimes] = useState([])
  const [bookings, setBookings] = useState([])
  const [seatMap, setSeatMap] = useState([])

  const [movieForm, setMovieForm] = useState(emptyMovieForm)
  const [theaterForm, setTheaterForm] = useState(emptyTheaterForm)
  const [showtimeForm, setShowtimeForm] = useState(emptyShowtimeForm)

  const [editingMovieId, setEditingMovieId] = useState(null)
  const [editingTheaterId, setEditingTheaterId] = useState(null)
  const [editingShowtimeId, setEditingShowtimeId] = useState(null)

  const [seatShowtimeId, setSeatShowtimeId] = useState('')
  const [seatIdsInput, setSeatIdsInput] = useState('')
  const [seatStatus, setSeatStatus] = useState('available')

  const [nearbyLat, setNearbyLat] = useState('')
  const [nearbyLng, setNearbyLng] = useState('')
  const [nearbyRadius, setNearbyRadius] = useState('25')
  const [nearbyTheaters, setNearbyTheaters] = useState([])

  const [feedback, setFeedback] = useState({ type: 'idle', message: '' })
  const [isLoading, setIsLoading] = useState(true)

  const loadAdminData = useCallback(async () => {
    if (!token) {
      return
    }

    setIsLoading(true)
    setFeedback({ type: 'idle', message: '' })

    try {
      const [moviesPayload, theatersPayload, showtimesPayload, bookingsPayload] =
        await Promise.all([
          apiRequest('/api/admin/movies', { token }),
          apiRequest('/api/admin/theaters', { token }),
          apiRequest('/api/admin/showtimes', { token }),
          apiRequest('/api/admin/bookings', { token }),
        ])

      setMovies(moviesPayload)
      setTheaters(theatersPayload)
      setShowtimes(showtimesPayload)
      setBookings(bookingsPayload)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to load admin data.' })
    } finally {
      setIsLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!user) {
      return
    }

    if (!isAdmin) {
      navigate('/')
      return
    }

    loadAdminData()
  }, [user, isAdmin, navigate, loadAdminData])

  async function handleMovieSubmit(event) {
    event.preventDefault()

    if (!movieForm.title.trim() || !movieForm.genre.trim()) {
      setFeedback({ type: 'error', message: 'Movie title and genre are required.' })
      return
    }

    const payload = {
      title: movieForm.title.trim(),
      genre: movieForm.genre.trim(),
      posterUrl: movieForm.posterUrl.trim(),
    }

    try {
      if (editingMovieId) {
        await apiRequest(`/api/admin/movies/${editingMovieId}`, {
          method: 'PUT',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Movie updated.' })
      } else {
        await apiRequest('/api/admin/movies', {
          method: 'POST',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Movie created.' })
      }

      setMovieForm(emptyMovieForm)
      setEditingMovieId(null)
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Movie save failed.' })
    }
  }

  function startMovieEdit(movie) {
    setEditingMovieId(movie.id)
    setMovieForm({
      title: movie.title || '',
      genre: movie.genre || '',
      posterUrl: movie.posterUrl || '',
    })
  }

  async function deleteMovie(movieId) {
    if (!window.confirm('Delete this movie?')) {
      return
    }

    try {
      await apiRequest(`/api/admin/movies/${movieId}`, { method: 'DELETE', token })
      setFeedback({ type: 'success', message: 'Movie deleted.' })
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Movie delete failed.' })
    }
  }

  async function handleTheaterSubmit(event) {
    event.preventDefault()

    const payload = {
      name: theaterForm.name.trim(),
      location: theaterForm.location.trim(),
      address: theaterForm.address.trim(),
      latitude: Number(theaterForm.latitude),
      longitude: Number(theaterForm.longitude),
    }

    if (
      !payload.name ||
      !payload.location ||
      !payload.address ||
      Number.isNaN(payload.latitude) ||
      Number.isNaN(payload.longitude)
    ) {
      setFeedback({
        type: 'error',
        message: 'Theater name, location, address, latitude and longitude are required.',
      })
      return
    }

    try {
      if (editingTheaterId) {
        await apiRequest(`/api/admin/theaters/${editingTheaterId}`, {
          method: 'PUT',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Theater updated.' })
      } else {
        await apiRequest('/api/admin/theaters', {
          method: 'POST',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Theater created.' })
      }

      setTheaterForm(emptyTheaterForm)
      setEditingTheaterId(null)
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Theater save failed.' })
    }
  }

  function startTheaterEdit(theater) {
    setEditingTheaterId(theater.id)
    setTheaterForm({
      name: theater.name || '',
      location: theater.location || '',
      address: theater.address || '',
      latitude: String(theater.latitude ?? ''),
      longitude: String(theater.longitude ?? ''),
    })
  }

  async function deleteTheater(theaterId) {
    if (!window.confirm('Delete this theater? Showtimes under it will also be removed.')) {
      return
    }

    try {
      await apiRequest(`/api/admin/theaters/${theaterId}`, { method: 'DELETE', token })
      setFeedback({ type: 'success', message: 'Theater deleted.' })
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Theater delete failed.' })
    }
  }

  async function handleShowtimeSubmit(event) {
    event.preventDefault()

    const theaterId = Number(showtimeForm.theaterId)
    const movieId = Number(showtimeForm.movieId)

    if (!Number.isInteger(theaterId) || !Number.isInteger(movieId) || !showtimeForm.startTime) {
      setFeedback({
        type: 'error',
        message: 'Select theater, movie, and start time for showtime.',
      })
      return
    }

    const payload = {
      theaterId,
      movieId,
      startTime: new Date(showtimeForm.startTime).toISOString(),
    }

    try {
      if (editingShowtimeId) {
        await apiRequest(`/api/admin/showtimes/${editingShowtimeId}`, {
          method: 'PUT',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Showtime updated.' })
      } else {
        await apiRequest('/api/admin/showtimes', {
          method: 'POST',
          token,
          body: payload,
        })
        setFeedback({ type: 'success', message: 'Showtime created.' })
      }

      setShowtimeForm(emptyShowtimeForm)
      setEditingShowtimeId(null)
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Showtime save failed.' })
    }
  }

  function startShowtimeEdit(showtime) {
    setEditingShowtimeId(showtime.id)
    setShowtimeForm({
      theaterId: String(showtime.theaterId),
      movieId: String(showtime.movieId),
      startTime: toDateTimeLocal(showtime.startTime),
    })
  }

  async function deleteShowtime(showtimeId) {
    if (!window.confirm('Delete this showtime?')) {
      return
    }

    try {
      await apiRequest(`/api/admin/showtimes/${showtimeId}`, { method: 'DELETE', token })
      setFeedback({ type: 'success', message: 'Showtime deleted.' })

      if (String(showtimeId) === seatShowtimeId) {
        setSeatMap([])
        setSeatShowtimeId('')
      }

      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Showtime delete failed.' })
    }
  }

  async function loadSeatMap(showtimeId) {
    if (!showtimeId) {
      setFeedback({ type: 'error', message: 'Select a showtime ID to view seats.' })
      return
    }

    try {
      const payload = await apiRequest(`/api/admin/seats?showtimeId=${showtimeId}`, { token })
      setSeatShowtimeId(String(showtimeId))
      setSeatMap(payload)
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to load seat map.' })
    }
  }

  async function updateSeatStatus(event) {
    event.preventDefault()

    const showtimeId = Number(seatShowtimeId)
    const seatIds = parseSeatIds(seatIdsInput)

    if (!Number.isInteger(showtimeId) || seatIds.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Provide showtime ID and comma-separated seat IDs (1-20).',
      })
      return
    }

    try {
      await apiRequest('/api/admin/seats/status', {
        method: 'PUT',
        token,
        body: { showtimeId, seatIds, status: seatStatus },
      })

      setFeedback({ type: 'success', message: 'Seat status updated.' })
      setSeatIdsInput('')
      await loadSeatMap(showtimeId)
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Seat status update failed.' })
    }
  }

  async function releaseSeatBatch() {
    const showtimeId = Number(seatShowtimeId)
    const seatIds = parseSeatIds(seatIdsInput)

    if (!Number.isInteger(showtimeId) || seatIds.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Provide showtime ID and comma-separated seat IDs to release.',
      })
      return
    }

    try {
      await apiRequest('/api/admin/seats/release', {
        method: 'POST',
        token,
        body: { showtimeId, seatIds },
      })

      setFeedback({ type: 'success', message: 'Seats released.' })
      setSeatIdsInput('')
      await loadSeatMap(showtimeId)
      await loadAdminData()
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Seat release failed.' })
    }
  }

  async function deleteBooking(bookingId) {
    if (!window.confirm('Delete this booking and release seats?')) {
      return
    }

    try {
      await apiRequest(`/api/admin/bookings/${bookingId}`, { method: 'DELETE', token })
      setFeedback({ type: 'success', message: 'Booking deleted and seats released.' })
      await loadAdminData()

      if (seatShowtimeId) {
        await loadSeatMap(Number(seatShowtimeId))
      }
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Booking deletion failed.' })
    }
  }

  function detectCurrentLocation() {
    if (!navigator.geolocation) {
      setFeedback({ type: 'error', message: 'Geolocation is not supported in this browser.' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNearbyLat(String(position.coords.latitude))
        setNearbyLng(String(position.coords.longitude))
      },
      () => {
        setFeedback({
          type: 'error',
          message: 'Could not detect your location. Allow location permission and try again.',
        })
      },
    )
  }

  async function fetchNearbyTheaters(event) {
    event.preventDefault()

    if (!nearbyLat || !nearbyLng) {
      setFeedback({ type: 'error', message: 'Latitude and longitude are required.' })
      return
    }

    try {
      const payload = await apiRequest(
        `/api/admin/theaters/nearby?lat=${encodeURIComponent(nearbyLat)}&lng=${encodeURIComponent(nearbyLng)}&radiusKm=${encodeURIComponent(nearbyRadius || '25')}`,
        { token },
      )
      setNearbyTheaters(payload)
      setFeedback({ type: 'success', message: `Found ${payload.length} nearby theaters.` })
    } catch (error) {
      setFeedback({ type: 'error', message: error.message || 'Nearby lookup failed.' })
    }
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 text-brand-50 sm:px-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-100/70">Administration</p>
          <h1 className="font-display text-4xl">Control Panel</h1>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          className="rounded-xl border border-brand-200/35 bg-brand-800/50 px-4 py-2 text-sm font-semibold text-brand-100 transition hover:bg-brand-700"
        >
          Refresh Data
        </button>
      </header>

      {feedback.message && (
        <p
          className={`mb-5 rounded-xl border px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
              : 'border-red-400/40 bg-red-500/10 text-red-200'
          }`}
        >
          {feedback.message}
        </p>
      )}

      {isLoading ? (
        <p className="text-brand-100/75">Loading admin dashboard...</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4">
            <h2 className="text-xl font-semibold">Movies CRUD</h2>

            <form className="space-y-2" onSubmit={handleMovieSubmit}>
              <input
                type="text"
                placeholder="Title"
                value={movieForm.title}
                onChange={(event) => setMovieForm((current) => ({ ...current, title: event.target.value }))}
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="text"
                placeholder="Genre"
                value={movieForm.genre}
                onChange={(event) => setMovieForm((current) => ({ ...current, genre: event.target.value }))}
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="url"
                placeholder="Poster URL (optional)"
                value={movieForm.posterUrl}
                onChange={(event) =>
                  setMovieForm((current) => ({ ...current, posterUrl: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-200 px-3 py-2 text-sm font-semibold text-brand-900"
                >
                  {editingMovieId ? 'Update Movie' : 'Add Movie'}
                </button>
                {editingMovieId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMovieId(null)
                      setMovieForm(emptyMovieForm)
                    }}
                    className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-brand-200/15 p-2">
              {movies.map((movie) => (
                <div key={movie.id} className="rounded-lg bg-brand-950/30 p-3">
                  <p className="font-semibold">{movie.title}</p>
                  <p className="text-sm text-brand-100/80">{movie.genre}</p>
                  <div className="mt-2 flex gap-2 text-sm">
                    <button type="button" className="text-brand-200" onClick={() => startMovieEdit(movie)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-300"
                      onClick={() => deleteMovie(movie.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4">
            <h2 className="text-xl font-semibold">Theaters and Places CRUD</h2>

            <form className="space-y-2" onSubmit={handleTheaterSubmit}>
              <input
                type="text"
                placeholder="Theater Name"
                value={theaterForm.name}
                onChange={(event) => setTheaterForm((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="text"
                placeholder="Location (Area/City)"
                value={theaterForm.location}
                onChange={(event) =>
                  setTheaterForm((current) => ({ ...current, location: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="text"
                placeholder="Address"
                value={theaterForm.address}
                onChange={(event) =>
                  setTheaterForm((current) => ({ ...current, address: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Latitude"
                  value={theaterForm.latitude}
                  onChange={(event) =>
                    setTheaterForm((current) => ({ ...current, latitude: event.target.value }))
                  }
                  className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Longitude"
                  value={theaterForm.longitude}
                  onChange={(event) =>
                    setTheaterForm((current) => ({ ...current, longitude: event.target.value }))
                  }
                  className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-200 px-3 py-2 text-sm font-semibold text-brand-900"
                >
                  {editingTheaterId ? 'Update Theater' : 'Add Theater'}
                </button>
                {editingTheaterId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTheaterId(null)
                      setTheaterForm(emptyTheaterForm)
                    }}
                    className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-brand-200/15 p-2">
              {theaters.map((theater) => (
                <div key={theater.id} className="rounded-lg bg-brand-950/30 p-3">
                  <p className="font-semibold">{theater.name}</p>
                  <p className="text-sm text-brand-100/80">{theater.location}</p>
                  <p className="text-xs text-brand-100/70">{theater.address}</p>
                  <p className="text-xs text-brand-100/60">
                    {theater.latitude}, {theater.longitude}
                  </p>
                  <div className="mt-2 flex gap-2 text-sm">
                    <button
                      type="button"
                      className="text-brand-200"
                      onClick={() => startTheaterEdit(theater)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-300"
                      onClick={() => deleteTheater(theater.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4">
            <h2 className="text-xl font-semibold">Showtimes CRUD (Dates and Time)</h2>

            <form className="space-y-2" onSubmit={handleShowtimeSubmit}>
              <select
                value={showtimeForm.theaterId}
                onChange={(event) =>
                  setShowtimeForm((current) => ({ ...current, theaterId: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              >
                <option value="">Select theater</option>
                {theaters.map((theater) => (
                  <option key={theater.id} value={theater.id}>
                    {theater.name} ({theater.location})
                  </option>
                ))}
              </select>

              <select
                value={showtimeForm.movieId}
                onChange={(event) =>
                  setShowtimeForm((current) => ({ ...current, movieId: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              >
                <option value="">Select movie</option>
                {movies.map((movie) => (
                  <option key={movie.id} value={movie.id}>
                    {movie.title}
                  </option>
                ))}
              </select>

              <input
                type="datetime-local"
                value={showtimeForm.startTime}
                onChange={(event) =>
                  setShowtimeForm((current) => ({ ...current, startTime: event.target.value }))
                }
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-200 px-3 py-2 text-sm font-semibold text-brand-900"
                >
                  {editingShowtimeId ? 'Update Showtime' : 'Add Showtime'}
                </button>
                {editingShowtimeId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingShowtimeId(null)
                      setShowtimeForm(emptyShowtimeForm)
                    }}
                    className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-brand-200/15 p-2">
              {showtimes.map((showtime) => (
                <div key={showtime.id} className="rounded-lg bg-brand-950/30 p-3">
                  <p className="font-semibold">
                    {showtime.movieTitle} at {showtime.theaterName}
                  </p>
                  <p className="text-sm text-brand-100/80">
                    {new Date(showtime.startTime).toLocaleString()}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-sm">
                    <button
                      type="button"
                      className="text-brand-200"
                      onClick={() => startShowtimeEdit(showtime)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-300"
                      onClick={() => deleteShowtime(showtime.id)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="text-emerald-300"
                      onClick={() => loadSeatMap(showtime.id)}
                    >
                      Manage Seats
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4">
            <h2 className="text-xl font-semibold">Seats and Booking Control</h2>

            <div className="space-y-2 rounded-xl border border-brand-200/20 bg-brand-950/30 p-3">
              <label className="block text-xs uppercase tracking-[0.12em] text-brand-100/70">
                Showtime ID
              </label>
              <input
                type="number"
                min="1"
                value={seatShowtimeId}
                onChange={(event) => setSeatShowtimeId(event.target.value)}
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <button
                type="button"
                onClick={() => loadSeatMap(Number(seatShowtimeId))}
                className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
              >
                Load Seat Map
              </button>
            </div>

            <form className="space-y-2" onSubmit={updateSeatStatus}>
              <input
                type="text"
                value={seatIdsInput}
                onChange={(event) => setSeatIdsInput(event.target.value)}
                placeholder="Seat IDs e.g. 1,2,3"
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />

              <select
                value={seatStatus}
                onChange={(event) => setSeatStatus(event.target.value)}
                className="w-full rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              >
                <option value="available">Mark Available</option>
                <option value="booked">Mark Booked</option>
              </select>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-200 px-3 py-2 text-sm font-semibold text-brand-900"
                >
                  Update Seats
                </button>
                <button
                  type="button"
                  onClick={releaseSeatBatch}
                  className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
                >
                  Release Seats
                </button>
              </div>
            </form>

            <div className="grid grid-cols-5 gap-2 rounded-xl border border-brand-200/15 p-2">
              {Array.from({ length: 20 }, (_, index) => {
                const seatId = index + 1
                const seat = seatMap.find((entry) => entry.id === seatId)
                const status = seat?.status || 'available'
                const classes =
                  status === 'booked'
                    ? 'bg-red-500/85 text-red-50'
                    : 'bg-emerald-500/85 text-emerald-50'

                return (
                  <div
                    key={seatId}
                    className={`rounded-lg px-2 py-2 text-center text-xs font-semibold ${classes}`}
                  >
                    {String(seatId).padStart(2, '0')}
                  </div>
                )
              })}
            </div>

            <div className="max-h-52 space-y-2 overflow-auto rounded-xl border border-brand-200/15 p-2">
              {bookings.map((booking) => (
                <div key={booking.id} className="rounded-lg bg-brand-950/30 p-3">
                  <p className="font-semibold">Booking #{booking.id}</p>
                  <p className="text-sm text-brand-100/80">{booking.userEmail}</p>
                  <p className="text-sm text-brand-100/80">
                    {booking.movieTitle} at {booking.theaterName}
                  </p>
                  <p className="text-xs text-brand-100/70">
                    Seats: {booking.seatIds.join(', ')} | {new Date(booking.startTime).toLocaleString()}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-sm text-red-300"
                    onClick={() => deleteBooking(booking.id)}
                  >
                    Delete Booking
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4 rounded-2xl border border-brand-300/25 bg-brand-900/60 p-4 lg:col-span-2">
            <h2 className="text-xl font-semibold">Nearby Theaters (Real-time by Current Location)</h2>

            <form className="grid gap-2 md:grid-cols-4" onSubmit={fetchNearbyTheaters}>
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={nearbyLat}
                onChange={(event) => setNearbyLat(event.target.value)}
                className="rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={nearbyLng}
                onChange={(event) => setNearbyLng(event.target.value)}
                className="rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <input
                type="number"
                step="1"
                min="1"
                max="200"
                placeholder="Radius (km)"
                value={nearbyRadius}
                onChange={(event) => setNearbyRadius(event.target.value)}
                className="rounded-lg border border-brand-200/25 bg-brand-950/50 px-3 py-2"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-brand-200 px-3 py-2 text-sm font-semibold text-brand-900"
                >
                  Find Nearby
                </button>
                <button
                  type="button"
                  onClick={detectCurrentLocation}
                  className="rounded-lg border border-brand-200/35 px-3 py-2 text-sm"
                >
                  Use My Location
                </button>
              </div>
            </form>

            <div className="grid gap-2 md:grid-cols-2">
              {nearbyTheaters.map((theater) => (
                <div key={theater.id} className="rounded-lg bg-brand-950/30 p-3">
                  <p className="font-semibold">{theater.name}</p>
                  <p className="text-sm text-brand-100/80">{theater.location}</p>
                  <p className="text-xs text-brand-100/70">{theater.address}</p>
                  <p className="mt-1 text-xs font-semibold text-brand-200">
                    {theater.distanceKm} km away
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
