import { useState } from 'react'
import { useDataSource } from '@/app/data-context'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { useToast } from '@/components/ui/Toast'
import type { CatalogSnapshot } from '@/data/types'
import { errorMessage } from '@/data/errors'
import { DEFAULT_SETTINGS, validateThresholds } from '@/domain/settings'
import type { ExpirationThresholds, RegularityWeights, SystemSettings } from '@/domain/types'
import { useInvalidate } from '@/hooks/queries'
import { SectionHeader } from './SectionHeader'

function useSaveSettings() {
  const ds = useDataSource()
  const toast = useToast()
  const invalidate = useInvalidate()
  const [saving, setSaving] = useState(false)
  async function save(settings: SystemSettings) {
    setSaving(true)
    try {
      await ds.catalog.saveSettings(settings)
      await invalidate.catalog()
      toast.success('Configurações salvas', 'Todos os indicadores foram recalculados.')
    } catch (error) {
      toast.error('Não foi possível salvar', errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return { save, saving }
}

const THRESHOLD_FIELDS: { key: keyof ExpirationThresholds; label: string; hint: string }[] = [
  { key: 'preventiveDays', label: 'Atenção preventiva — até (dias)', hint: 'Acima deste valor a licença é Regular.' },
  { key: 'attentionDays', label: 'Atenção — até (dias)', hint: '' },
  { key: 'highDays', label: 'Atenção alta — até (dias)', hint: '' },
  { key: 'criticalDays', label: 'Crítico — até (dias)', hint: 'Abaixo de zero: Vencida.' },
]

export function ExpirationSection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const [values, setValues] = useState(catalog.settings.expirationThresholds)
  const { save, saving } = useSaveSettings()
  const error = validateThresholds(values)
  const t = values

  return (
    <div>
      <SectionHeader title="Faixas de vencimento" description="Definem automaticamente o status de cada licença conforme os dias que faltam para vencer." />
      <div className="grid grid-cols-1 max-w-2xl gap-3 sm:grid-cols-2">
        {THRESHOLD_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint || undefined}>
            {(p) => (
              <Input {...p} type="number" min={0} value={values[f.key]} disabled={readOnly} onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))} />
            )}
          </Field>
        ))}
      </div>
      <ul className="mt-4 max-w-2xl space-y-1 rounded-lg bg-[#f6f9fc] p-3 text-[12.5px] text-ink-soft">
        <li>Mais de {t.preventiveDays} dias → <strong className="text-ok-ink">Regular</strong></li>
        <li>Entre {t.attentionDays + 1} e {t.preventiveDays} dias → <strong className="text-warn-ink">Atenção preventiva</strong></li>
        <li>Entre {t.highDays + 1} e {t.attentionDays} dias → <strong className="text-warn-ink">Atenção</strong></li>
        <li>Entre {t.criticalDays + 1} e {t.highDays} dias → <strong className="text-warn-ink">Atenção alta</strong></li>
        <li>Até {t.criticalDays} dias → <strong className="text-danger-ink">Crítico</strong></li>
        <li>Data passada → <strong className="text-danger-ink">Vencida</strong></li>
      </ul>
      {error && <p className="mt-2 text-[12.5px] text-danger-ink" role="alert">{error}</p>}
      {!readOnly && (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => save({ ...catalog.settings, expirationThresholds: values })} loading={saving} disabled={!!error}>
            Salvar faixas
          </Button>
          <Button variant="ghost" onClick={() => setValues(DEFAULT_SETTINGS.expirationThresholds)}>
            Restaurar padrão
          </Button>
        </div>
      )}
    </div>
  )
}

const WEIGHT_FIELDS: { key: keyof RegularityWeights; label: string }[] = [
  { key: 'regular', label: 'Regular' },
  { key: 'atencao_preventiva', label: 'Atenção preventiva' },
  { key: 'atencao', label: 'Atenção' },
  { key: 'atencao_alta', label: 'Atenção alta' },
  { key: 'critico', label: 'Crítico' },
  { key: 'em_renovacao', label: 'Em renovação' },
  { key: 'pendente', label: 'Pendente' },
  { key: 'vencida', label: 'Vencida' },
]

export function RegularitySection({ catalog, readOnly }: { catalog: CatalogSnapshot; readOnly: boolean }) {
  const [values, setValues] = useState(catalog.settings.regularityWeights)
  const { save, saving } = useSaveSettings()
  const invalid = Object.values(values).some((v) => !Number.isFinite(v) || v < 0 || v > 100)

  return (
    <div>
      <SectionHeader
        title="Índice de regularidade"
        description="Média dos pontos das licenças APLICÁVEIS da empresa. Não aplicáveis, dispensadas e em análise não entram no cálculo e não reduzem o índice."
      />
      <div className="grid grid-cols-1 max-w-2xl gap-3 sm:grid-cols-4">
        {WEIGHT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label}>
            {(p) => (
              <Input {...p} type="number" min={0} max={100} value={values[f.key]} disabled={readOnly} onChange={(e) => setValues((v) => ({ ...v, [f.key]: Number(e.target.value) }))} />
            )}
          </Field>
        ))}
      </div>
      <p className="mt-3 max-w-2xl text-[12px] text-muted">
        Exemplo: 2 licenças regulares ({values.regular}) e 1 em atenção ({values.atencao}) →{' '}
        <strong className="text-ink">{Math.round((values.regular * 2 + values.atencao) / 3)}%</strong>.
      </p>
      {invalid && <p className="mt-2 text-[12.5px] text-danger-ink" role="alert">Use valores entre 0 e 100.</p>}
      {!readOnly && (
        <div className="mt-4 flex gap-2">
          <Button onClick={() => save({ ...catalog.settings, regularityWeights: values })} loading={saving} disabled={invalid}>
            Salvar pesos
          </Button>
          <Button variant="ghost" onClick={() => setValues(DEFAULT_SETTINGS.regularityWeights)}>
            Restaurar padrão
          </Button>
        </div>
      )}
    </div>
  )
}
