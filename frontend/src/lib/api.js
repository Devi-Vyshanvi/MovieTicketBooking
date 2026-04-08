function normalizeBase(base) {
  return String(base || '').replace(/\/$/, '')
}

function getApiBases() {
  if (import.meta.env.VITE_API_BASE_URL !== undefined) {
    return [normalizeBase(import.meta.env.VITE_API_BASE_URL)]
  }

  if (import.meta.env.PROD) {
    return ['', '/_/backend']
  }

  return ['http://localhost:4000']
}

function buildUrl(base, path) {
  return `${normalizeBase(base)}${path}`
}

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, token, headers = {} } = options

  const fetchOptions = {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  }

  const bases = getApiBases()
  let response = null

  for (let index = 0; index < bases.length; index += 1) {
    response = await fetch(buildUrl(bases[index], path), fetchOptions)
    const hasMoreCandidates = index < bases.length - 1
    if (response.status !== 404 || !hasMoreCandidates) {
      break
    }
  }

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
