import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useBooking } from '../hooks/useBooking'
import { apiRequest } from '../lib/api'

function SeatBookingPage() {
  const { showtimeId } = useParams()
  const navigate = useNavigate()
  const { token } = useAuth()
  const { selectedShowtime, chooseShowtime } = useBooking()

  const numericShowtimeId = Number(showtimeId)

  const [showtimeDetails, setShowtimeDetails] = useState(selectedShowtime)
  const [seats, setSeats] = useState([])
  const [selectedSeatIds, setSelectedSeatIds] = useState([])
  const [bookingIdInput, setBookingIdInput] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [feedback, setFeedback] = useState({ type: 'idle', message: '' })

  const seatGrid = useMemo(() => {
    const byId = new Map(seats.map((seat) => [seat.id, seat.status]))
    return Array.from({ length: 20 }, (_, index) => {
      const id = index + 1
      return {
        id,
        status: byId.get(id) || 'available',
      }
    })
  }, [seats])

  const fetchSeatMap = useCallback(
    async (showLoader = true) => {
      if (showLoader) {
        setIsLoading(true)
      }

      try {
        const [seatPayload, showtimePayload] = await Promise.all([
          apiRequest(`/api/seats?showtimeId=${numericShowtimeId}`),
          apiRequest(`/api/showtimes/${numericShowtimeId}`),
        ])

        setSeats(seatPayload)
        setShowtimeDetails(showtimePayload)
        chooseShowtime({
          id: showtimePayload.id,
          date: showtimePayload.date,
          startTime: showtimePayload.startTime,
          theaterName: showtimePayload.theaterName,
          movieTitle: showtimePayload.movieTitle,
        })
      } catch (error) {
        setFeedback({
          type: 'error',
          message: error.message || 'Failed to load seat map.',
        })
      } finally {
        if (showLoader) {
          setIsLoading(false)
        }
      }
    },
    [chooseShowtime, numericShowtimeId],
  )

  useEffect(() => {
    if (!Number.isInteger(numericShowtimeId) || numericShowtimeId < 1) {
      navigate('/', { replace: true })
      return
    }

    fetchSeatMap()
  }, [fetchSeatMap, numericShowtimeId, navigate])

  function toggleSeat(seat) {
    if (seat.status === 'booked') {
      return
    }

    setSelectedSeatIds((current) =>
      current.includes(seat.id)
        ? current.filter((id) => id !== seat.id)
        : [...current, seat.id],
    )
  }

  async function handleBookSelected() {
    if (selectedSeatIds.length === 0) {
      setFeedback({
        type: 'error',
        message: 'Select one or more seats before booking.',
      })
      return
    }

    try {
      const payload = await apiRequest('/api/book', {
        method: 'POST',
        token,
        body: {
          showtimeId: numericShowtimeId,
          seatIds: selectedSeatIds,
        },
      })

      setFeedback({
        type: 'success',
        message: `Booking confirmed. Booking ID: ${payload.booking.id}.`,
      })
      setSelectedSeatIds([])
      await fetchSeatMap(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Booking failed.',
      })
      await fetchSeatMap(false)
    }
  }

  async function handleCancelBooking(event) {
    event.preventDefault()
    const bookingId = Number(bookingIdInput)

    if (!Number.isInteger(bookingId) || bookingId < 1) {
      setFeedback({ type: 'error', message: 'Enter a valid booking ID.' })
      return
    }

    try {
      await apiRequest('/api/cancel', {
        method: 'POST',
        token,
        body: { bookingId },
      })

      setBookingIdInput('')
      setSelectedSeatIds([])
      setFeedback({
        type: 'success',
        message: `Booking ${bookingId} canceled and seats released.`,
      })
      await fetchSeatMap(false)
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error.message || 'Cancellation failed.',
      })
    }
  }

  const availableCount = seatGrid.filter((seat) => seat.status === 'available').length

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-5 rounded-3xl border border-brand-300/25 bg-brand-900/70 p-5 shadow-glow backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-lg border border-brand-200/25 bg-brand-950/40 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-brand-100/80 transition hover:bg-brand-900"
        >
          Back to Selection
        </button>

        <h1 className="mt-4 font-display text-4xl text-brand-50 md:text-5xl">
          Seat Booking
        </h1>

        <p className="mt-2 text-sm text-brand-100/80">
          {showtimeDetails
            ? `${showtimeDetails.movieTitle} at ${showtimeDetails.theaterName} • ${new Date(showtimeDetails.startTime).toLocaleString()}`
            : 'Loading showtime details...'}
        </p>
      </header>

      <main className="grid gap-5 md:grid-cols-[1.3fr_0.9fr]">
        <section className="rounded-3xl border border-brand-300/25 bg-brand-900/60 p-5">
          <div className="mx-auto mb-6 w-full max-w-xl rounded-full bg-brand-200 px-3 py-2 text-center text-xs font-semibold tracking-[0.2em] text-brand-900">
            SCREEN
          </div>

          <div className="grid grid-cols-5 gap-2.5">
            {seatGrid.map((seat) => {
              const isSelected = selectedSeatIds.includes(seat.id)

              const styleClass =
                seat.status === 'booked'
                  ? 'bg-red-500/85 text-red-50 cursor-not-allowed'
                  : isSelected
                    ? 'bg-blue-500 text-blue-50'
                    : 'bg-green-500 text-green-50 hover:brightness-110'

              return (
                <button
                  key={seat.id}
                  type="button"
                  disabled={isLoading || seat.status === 'booked'}
                  onClick={() => toggleSeat(seat)}
                  className={`h-12 rounded-xl text-sm font-semibold transition ${styleClass}`}
                >
                  {String(seat.id).padStart(2, '0')}
                </button>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap gap-4 text-xs text-brand-100/85">
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-3 rounded bg-green-500" /> Available
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-3 rounded bg-blue-500" /> Selected
            </span>
            <span className="inline-flex items-center gap-2">
              <i className="h-3 w-3 rounded bg-red-500" /> Booked
            </span>
          </div>
        </section>

        <aside className="space-y-4 rounded-3xl border border-brand-300/25 bg-brand-900/60 p-5">
          <div className="rounded-2xl border border-brand-200/25 bg-brand-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-100/65">
              Available
            </p>
            <p className="mt-1 text-3xl font-semibold text-brand-50">{availableCount}</p>
          </div>

          <div className="rounded-2xl border border-brand-200/25 bg-brand-950/35 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-100/65">
              Selected
            </p>
            <p className="mt-1 text-3xl font-semibold text-brand-50">
              {selectedSeatIds.length}
            </p>
          </div>

          <button
            type="button"
            onClick={handleBookSelected}
            disabled={selectedSeatIds.length === 0 || isLoading}
            className="w-full rounded-xl bg-brand-200 px-4 py-2.5 font-semibold text-brand-900 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Book Selected
          </button>

          <form onSubmit={handleCancelBooking} className="space-y-2 rounded-2xl border border-brand-200/20 p-4">
            <label htmlFor="bookingId" className="block text-sm text-brand-100">
              Cancel Booking ID
            </label>
            <input
              id="bookingId"
              type="number"
              min="1"
              value={bookingIdInput}
              onChange={(event) => setBookingIdInput(event.target.value)}
              placeholder="Enter booking ID"
              className="w-full rounded-xl border border-brand-200/25 bg-brand-950/45 px-3 py-2 text-brand-50 outline-none transition placeholder:text-brand-100/40 focus:border-brand-100/70"
            />
            <button
              type="submit"
              className="w-full rounded-xl border border-brand-200/35 bg-brand-800/50 px-4 py-2.5 text-brand-100 transition hover:bg-brand-700"
            >
              Release Seats
            </button>
          </form>

          {feedback.message && (
            <p
              className={`rounded-xl border px-3 py-2 text-sm animate-rise ${
                feedback.type === 'success'
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-400/40 bg-red-500/10 text-red-200'
              }`}
            >
              {feedback.message}
            </p>
          )}
        </aside>
      </main>
    </div>
  )
}

export default SeatBookingPage
