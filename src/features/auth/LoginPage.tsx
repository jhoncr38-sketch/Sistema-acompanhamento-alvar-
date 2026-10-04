import { useState, type FormEvent } from 'react'
import { useSession } from '@/app/session'
import { BrandLogo } from '@/components/brand/Brand'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { brand } from '@/config/brand'
import { errorMessage } from '@/data/errors'

export function LoginPage() {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 min-h-screen lg:grid-cols-[420px_minmax(0,1fr)]">
      <div className="hidden flex-col items-center justify-center gap-6 bg-navy-900 p-10 text-center lg:flex">
        <BrandLogo />
        <p className="max-w-xs text-[14px] leading-relaxed text-white/80">{brand.mascotMessage}</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-7 shadow-card" noValidate>
          <h1 className="text-[22px] font-bold text-ink">{brand.moduleName}</h1>
          <p className="mb-6 text-[13px] text-muted">Entre com seu e-mail e senha do escritório.</p>
          <div className="flex flex-col gap-3">
            <Field label="E-mail" required>
              {(p) => <Input {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}
            </Field>
            <Field label="Senha" required>
              {(p) => <Input {...p} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            {error && (
              <p role="alert" className="text-[12.5px] text-danger-ink">
                {error}
              </p>
            )}
            <Button type="submit" loading={loading} disabled={!email || !password} className="mt-2 w-full">
              Entrar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
