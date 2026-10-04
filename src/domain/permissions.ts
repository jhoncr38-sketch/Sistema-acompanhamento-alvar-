import type { UserRole } from './types'

/** Espelha as políticas RLS do banco (supabase/migrations). A segurança real está no banco. */
export type Permission =
  | 'company:write'
  | 'company:delete'
  | 'license:write'
  | 'consultation:create'
  | 'document:write'
  | 'alert:manage'
  | 'settings:manage'
  | 'users:manage'
  | 'audit:view'
  | 'simulation:save'

const MATRIX: Record<UserRole, readonly Permission[]> = {
  administrador: [
    'company:write',
    'company:delete',
    'license:write',
    'consultation:create',
    'document:write',
    'alert:manage',
    'settings:manage',
    'users:manage',
    'audit:view',
    'simulation:save',
  ],
  contador: ['company:write', 'license:write', 'consultation:create', 'document:write', 'alert:manage', 'audit:view', 'simulation:save'],
  colaborador: ['company:write', 'license:write', 'consultation:create', 'document:write', 'alert:manage', 'simulation:save'],
  consulta: [],
}

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  return role ? MATRIX[role].includes(permission) : false
}
