const API_BASE =
  (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(
    /\/$/,
    '',
  )

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token, headers = {} } = options

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const errorMessage =
      typeof payload === 'object' && payload && 'error' in payload
        ? payload.error
        : `Request failed with status ${response.status}.`

    const error = new Error(errorMessage)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}
