/**
 * @package @autocrm/utils
 * Shared utility functions — formatting, validation, helpers.
 */

// ─── Formatting ─────────────────────────────────────────────────────────────

export const fmt = {
  currency: (n: number, locale = 'fr-FR', currency = 'EUR'): string =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n),

  date: (d: string | Date): string =>
    new Date(d).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),

  dateTime: (d: string | Date): string =>
    new Date(d).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }),

  dateRelative: (d: string | Date): string => {
    const diff = Date.now() - new Date(d).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days === 0) return "Aujourd'hui"
    if (days === 1) return 'Hier'
    if (days < 7) return `Il y a ${days}j`
    if (days < 30) return `Il y a ${Math.floor(days / 7)}sem`
    return `Il y a ${Math.floor(days / 30)}mois`
  },

  mileage: (n: number): string =>
    new Intl.NumberFormat('fr-FR').format(n) + ' km',

  initials: (name: string): string =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2),

  phone: (p: string): string => p.replace(/(\d{2})(?=\d)/g, '$1 ').trim(),
}

// ─── Color utilities ─────────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

export const getAvatarColor = (str: string): string =>
  AVATAR_COLORS[(str || '').charCodeAt(0) % AVATAR_COLORS.length]

export const STAGE_COLORS: Record<string, string> = {
  Nouveau: '#6366F1',
  Contacté: '#3B82F6',
  Qualifié: '#F59E0B',
  Essai: '#F97316',
  Négociation: '#EF4444',
  Gagné: '#10B981',
  Perdu: '#6B7280',
}

export const STATUS_COLORS: Record<string, string> = {
  Disponible: '#10B981',
  Réservé: '#F59E0B',
  Vendu: '#EF4444',
  Archivé: '#6B7280',
}

export const FUEL_COLORS: Record<string, string> = {
  Diesel: '#3B82F6',
  Essence: '#F59E0B',
  Hybride: '#10B981',
  Électrique: '#8B5CF6',
  GPL: '#EC4899',
}

export const ROLE_COLORS: Record<string, string> = {
  admin: '#EF4444',
  manager: '#F59E0B',
  salesperson: '#10B981',
}

// ─── String helpers ──────────────────────────────────────────────────────────

export const slugify = (str: string): string =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const truncate = (str: string, n: number): string =>
  str.length > n ? str.slice(0, n - 1) + '…' : str

// ─── Validation ──────────────────────────────────────────────────────────────

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export const isValidPhone = (phone: string): boolean =>
  /^(\+33|0)[1-9](\d{2}){4}$/.test(phone.replace(/\s/g, ''))

export const isValidVIN = (vin: string): boolean =>
  /^[A-HJ-NPR-Z0-9]{17}$/.test(vin.toUpperCase())

// ─── Object helpers ──────────────────────────────────────────────────────────

export const omit = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> => {
  const result = { ...obj }
  keys.forEach((k) => delete result[k])
  return result
}

export const pick = <T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> => {
  const result = {} as Pick<T, K>
  keys.forEach((k) => { result[k] = obj[k] })
  return result
}

// ─── Array helpers ───────────────────────────────────────────────────────────

export const groupBy = <T>(arr: T[], key: keyof T): Record<string, T[]> =>
  arr.reduce((acc, item) => {
    const k = String(item[key])
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)

export const sortBy = <T>(arr: T[], key: keyof T, dir: 'asc' | 'desc' = 'asc'): T[] =>
  [...arr].sort((a, b) => {
    const va = a[key], vb = b[key]
    if (va < vb) return dir === 'asc' ? -1 : 1
    if (va > vb) return dir === 'asc' ? 1 : -1
    return 0
  })

// ─── ID generation ───────────────────────────────────────────────────────────

export const generateId = (prefix = ''): string =>
  `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
