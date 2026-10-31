import { project } from '@project'
import { api } from './api'

document.title = project.name
document.querySelector('#title')!.textContent = project.name

const health = document.querySelector('#health')!

try {
  const res = await api.health.$get()
  const { ok } = await res.json()
  health.textContent = ok ? 'ok' : 'not ok'
} catch {
  health.textContent = 'unreachable'
}
