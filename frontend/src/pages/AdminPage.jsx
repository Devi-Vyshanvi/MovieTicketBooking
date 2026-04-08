import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { apiRequest } from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function AdminPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const [movies, setMovies] = useState([])
  const [newTitle, setNewTitle] = useState('')

  useEffect(() => {
    if (!user || user.email !== 'admin@gmail.com') {
      navigate('/')
      return
    }

    apiRequest('/api/admin/movies', { token }).then(setMovies).catch(console.error)
  }, [user, navigate, token])

  async function handleAddMovie(e) {
    e.preventDefault()
    if (!newTitle) return
    const movie = await apiRequest('/api/admin/movies', {
      method: 'POST',
      token,
      body: { title: newTitle, genre: 'Action', poster_url: '' }
    })
    setMovies((prev) => [...prev, movie])
    setNewTitle('')
  }

  async function handleDelete(id) {
    await apiRequest(`/api/admin/movies/${id}`, { method: 'DELETE', token })
    setMovies((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="p-8 text-brand-50 max-w-4xl mx-auto">
      <h1 className="text-4xl font-display mb-6">Admin Panel</h1>
      
      <section className="bg-brand-900/60 p-6 rounded-2xl border border-brand-300/25">
        <h2 className="text-2xl font-bold mb-4">Movies (CRUD Demo)</h2>
        
        <form onSubmit={handleAddMovie} className="flex gap-4 mb-6">
          <input 
            type="text" 
            placeholder="New Movie Title" 
            value={newTitle} 
            onChange={e => setNewTitle(e.target.value)}
            className="flex-1 bg-brand-950/50 border border-brand-200/25 rounded-md px-4 py-2"
          />
          <button type="submit" className="bg-brand-200 text-brand-900 px-6 py-2 rounded-md font-bold">Add Movie</button>
        </form>

        <ul className="space-y-3">
          {movies.map(movie => (
            <li key={movie.id} className="flex justify-between items-center bg-brand-950/30 p-3 rounded-lg">
              <span>{movie.title}</span>
              <button 
                onClick={() => handleDelete(movie.id)}
                className="text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
