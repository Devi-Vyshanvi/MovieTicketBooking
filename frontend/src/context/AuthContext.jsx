import { useState } from 'react'
import { apiRequest } from '../lib/api'
import AuthContext from './auth-context'

const TOKEN_STORAGE_KEY = 'movie_booking_token'
const USER_STORAGE_KEY = 'movie_booking_user'

function getStoredUser() {
  const raw = localStorage.getItem(USER_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY)
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) || '')
  const [user, setUser] = useState(() => getStoredUser())

  async function requestAuth(paths, body) {
    let lastError = null

    for (const path of paths) {
      try {
        return await apiRequest(path, {
          method: 'POST',
          body,
        })
      } catch (error) {
        lastError = error
        if (error.status !== 404) {
          throw error
        }
      }
    }

    throw lastError || new Error('Authentication request failed.')
  }

  function persistSession(nextToken, nextUser) {
    setToken(nextToken)
    setUser(nextUser)
    localStorage.setItem(TOKEN_STORAGE_KEY, nextToken)
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser))
  }

  async function register(email, password) {
    return requestAuth(['/api/auth/register', '/auth/register', '/api/register'], {
      email,
      password,
    })
  }

  async function login(email, password) {
    const payload = await requestAuth(['/api/auth/login', '/auth/login', '/api/login'], {
      email,
      password,
    })

    persistSession(payload.token, payload.user)
    return payload
  }

  function logout() {
    setToken('')
    setUser(null)
    localStorage.removeItem(TOKEN_STORAGE_KEY)
    localStorage.removeItem(USER_STORAGE_KEY)
  }

  const value = {
    token,
    user,
    isAuthenticated: Boolean(token),
    register,
    login,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
