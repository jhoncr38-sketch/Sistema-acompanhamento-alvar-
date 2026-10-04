import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { useInvalidate } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

export function DemoSection() {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)

  return (
    <div>
      <SectionHeader
        title="Dados de demonstração"
        description="Sem o Supabase configurado, o sistema roda com empresas e CNPJs fictícios salvos apenas neste navegador. Para usar o banco real, preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env."
      />
      <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={() => setConfirm(true)}>
        Restaurar dados de demonstração
      </Button>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Restaurar dados de demonstração?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true)
                await ds.demo?.reset()
                await invalidate.all()
                setBusy(false)
                setConfirm(false)
                toast.success('Dados de demonstração restaurados')
              }}
            >
              Restaurar
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-ink-soft">Tudo o que foi cadastrado nesta demonstração será substituído pelos dados fictícios iniciais, com datas relativas a hoje.</p>
      </Modal>
    </div>
  )
}
