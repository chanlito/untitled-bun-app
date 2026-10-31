import type { Auth } from './auth'

export type EnsureAdminResult = 'created' | 'promoted' | 'unchanged'

// Makes `email` an admin through Better Auth's admin plugin: creates the user if it
// doesn't exist (no password: sign-in is by email code, magic link or GitHub), or adds
// the admin role to an existing one. Never removes a role, so it is safe to repeat.
export async function ensureAdmin(auth: Auth, email: string): Promise<EnsureAdminResult> {
  const { internalAdapter } = await auth.$context
  // Better Auth stores emails lowercased
  email = email.toLowerCase()
  const existing = await internalAdapter.findUserByEmail(email)
  if (!existing) {
    // Called without headers, so the plugin treats it as trusted server code
    await auth.api.createUser({ body: { email, name: email.split('@')[0]!, role: 'admin' } })
    return 'created'
  }
  // The internal adapter types the core user; `role` is the admin plugin's field
  const user = existing.user as typeof existing.user & { role?: string | null }
  const roles = (user.role ?? '').split(',').filter(Boolean)
  if (roles.includes('admin')) return 'unchanged'
  await internalAdapter.updateUser(user.id, { role: [...roles, 'admin'].join(',') })
  return 'promoted'
}
