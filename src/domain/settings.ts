import type { SystemSettings } from './types'

/** Valores iniciais. Em produção são lidos de `system_settings` e podem ser alterados pelo administrador. */
export const DEFAULT_SETTINGS: SystemSettings = {
  expirationThresholds: {
    preventiveDays: 60,
    attentionDays: 30,
    highDays: 15,
    criticalDays: 7,
  },
  regularityWeights: {
    regular: 100,
    atencao_preventiva: 80,
    atencao: 55,
    atencao_alta: 40,
    critico: 25,
    em_renovacao: 50,
    vencida: 0,
    pendente: 0,
  },
  notificationScheduleDays: [90, 60, 30, 15, 7, 0],
  monitoringJob: { enabled: false, cron: '0 6 * * *' },
}

export function validateThresholds(t: SystemSettings['expirationThresholds']): string | null {
  const values = [t.preventiveDays, t.attentionDays, t.highDays, t.criticalDays]
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return 'Use apenas números inteiros positivos.'
  if (!(t.preventiveDays > t.attentionDays && t.attentionDays > t.highDays && t.highDays > t.criticalDays)) {
    return 'As faixas devem ser decrescentes: preventiva > atenção > alta > crítico.'
  }
  return null
}
