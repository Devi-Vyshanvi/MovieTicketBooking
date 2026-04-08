import { useContext } from 'react'
import BookingContext from '../context/booking-context'

export function useBooking() {
  const context = useContext(BookingContext)
  if (!context) {
    throw new Error('useBooking must be used inside BookingProvider.')
  }
  return context
}
