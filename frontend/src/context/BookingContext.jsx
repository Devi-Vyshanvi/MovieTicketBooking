import { useCallback, useMemo, useState } from 'react'
import BookingContext from './booking-context'

const BOOKING_STORAGE_KEY = 'movie_booking_selection'

function getStoredSelection() {
  const raw = sessionStorage.getItem(BOOKING_STORAGE_KEY)
  if (!raw) {
    return {
      selectedTheater: null,
      selectedMovie: null,
      selectedShowtime: null,
    }
  }

  try {
    return JSON.parse(raw)
  } catch {
    sessionStorage.removeItem(BOOKING_STORAGE_KEY)
    return {
      selectedTheater: null,
      selectedMovie: null,
      selectedShowtime: null,
    }
  }
}

export function BookingProvider({ children }) {
  const [selection, setSelection] = useState(() => getStoredSelection())

  const syncSelection = useCallback((nextSelectionOrUpdater) => {
    setSelection((current) => {
      const nextSelection =
        typeof nextSelectionOrUpdater === 'function'
          ? nextSelectionOrUpdater(current)
          : nextSelectionOrUpdater

      sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(nextSelection))
      return nextSelection
    })
  }, [])

  const chooseTheater = useCallback((theater) => {
    syncSelection({
      selectedTheater: theater,
      selectedMovie: null,
      selectedShowtime: null,
    })
  }, [syncSelection])

  const chooseMovie = useCallback((movie) => {
    syncSelection((current) => {
      // Avoid unnecessary state updates
      if (current.selectedMovie?.id === movie?.id && !current.selectedShowtime) {
        return current
      }
      return {
        ...current,
        selectedMovie: movie,
        selectedShowtime: null,
      }
    })
  }, [syncSelection])

  const chooseShowtime = useCallback((showtime) => {
    syncSelection((current) => {
      if (current.selectedShowtime?.id === showtime?.id) {
        return current
      }
      return {
        ...current,
        selectedShowtime: showtime,
      }
    })
  }, [syncSelection])

  const clearSelection = useCallback(() => {
    const cleared = {
      selectedTheater: null,
      selectedMovie: null,
      selectedShowtime: null,
    }
    syncSelection(cleared)
  }, [syncSelection])

  const value = useMemo(() => ({
    selectedTheater: selection.selectedTheater,
    selectedMovie: selection.selectedMovie,
    selectedShowtime: selection.selectedShowtime,
    chooseTheater,
    chooseMovie,
    chooseShowtime,
    clearSelection,
  }), [
    selection.selectedTheater,
    selection.selectedMovie,
    selection.selectedShowtime,
    chooseTheater,
    chooseMovie,
    chooseShowtime,
    clearSelection,
  ])

  return (
    <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
  )
}
