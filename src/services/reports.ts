import { describeChanges } from '@/domain/alert-rules'
import { formatCnpj } from '@/domain/cnpj'
import { formatDate, formatDateTime } from '@/domain/format'
import {
  COMPANY_HEALTH_LABEL,
  CONSULTATION_TYPE_LABEL,
  LICENSE_SITUATION_LABEL,
  LICENSE_STATUS_LABEL,
} from '@/domain/labels'
import { countHealth, type CompanyOverview, type EvaluatedLicense } from '@/domain/monitoring'
import type { Company, LicenseChange, LicenseConsultation, LicenseType, Sector } from '@/domain/types'

export type ReportId =
  | 'regularidade-geral'
  | 'licencas-vencidas'
  | 'proximas-vencimento'
  | 'por-setor'
  | 'por-empresa'
  | 'por-orgao'
  | 'por-periodo'
  | 'historico-consultas'
  | 'alteracoes-detectadas'

export interface ReportDefinition {
  id: ReportId
  title: string
  description: string
  usesPeriod: boolean
}

export const REPORTS: ReportDefinition[] = [
  { id: 'regularidade-geral', title: 'Regularidade geral', description: 'Índice médio e situação das empresas monitoradas.', usesPeriod: false },
  { id: 'licencas-vencidas', title: 'Licenças vencidas', description: 'Licenças aplicáveis com validade expirada.', usesPeriod: false },
  { id: 'proximas-vencimento', title: 'Próximas do vencimento', description: 'Licenças que vencem nos próximos 60 dias.', usesPeriod: false },
  { id: 'por-setor', title: 'Por setor', description: 'Empresas regulares, em atenção e com pendência por setor.', usesPeriod: false },
  { id: 'por-empresa', title: 'Por empresa', description: 'Índice de regularidade e situação de cada empresa.', usesPeriod: false },
  { id: 'por-orgao', title: 'Por órgão', description: 'Situação das licenças agrupadas por órgão emissor.', usesPeriod: false },
  { id: 'por-periodo', title: 'Por período', description: 'Licenças com vencimento dentro do período escolhido.', usesPeriod: true },
  { id: 'historico-consultas', title: 'Histórico de consultas', description: 'Consultas registradas no período.', usesPeriod: true },
  { id: 'alteracoes-detectadas', title: 'Alterações detectadas', description: 'Mudanças identificadas entre consultas no período.', usesPeriod: true },
]

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

export interface ReportTable {
  columns: ReportColumn[]
  rows: Record<string, string | number>[]
}

export interface ReportInput {
  overviews: CompanyOverview[]
  companies: Company[]
  sectors: Sector[]
  licenseTypes: LicenseType[]
  consultations: LicenseConsultation[]
  changes: LicenseChange[]
  period: { from: string; to: string }
}

function licenseRows(overviews: CompanyOverview[], filter: (e: EvaluatedLicense) => boolean) {
  return overviews
    .filter((o) => o.monitored)
    .flatMap((o) => o.licenses.filter(filter).map((e) => ({ o, e })))
    .sort((a, b) => (a.e.evaluation.daysRemaining ?? 0) - (b.e.evaluation.daysRemaining ?? 0))
    .map(({ o, e }) => ({
      empresa: o.company.legalName,
      cnpj: formatCnpj(o.company.cnpj),
      setor: o.sector?.name ?? '—',
      licenca: e.type.name,
      orgao: e.type.agency,
      validade: formatDate(e.license.expiresAt),
      dias: e.evaluation.daysRemaining ?? '—',
      status: LICENSE_STATUS_LABEL[e.evaluation.status],
    }))
}

const LICENSE_COLUMNS: ReportColumn[] = [
  { key: 'empresa', label: 'Empresa' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'setor', label: 'Setor' },
  { key: 'licenca', label: 'Licença' },
  { key: 'orgao', label: 'Órgão' },
  { key: 'validade', label: 'Validade' },
  { key: 'dias', label: 'Dias', align: 'right' },
  { key: 'status', label: 'Situação' },
]

function average(values: number[]): string {
  if (values.length === 0) return '—'
  return `${Math.round(values.reduce((a, b) => a + b, 0) / values.length)}%`
}

export function buildReport(id: ReportId, input: ReportInput): ReportTable {
  const monitored = input.overviews.filter((o) => o.monitored)
  const inPeriod = (iso: string | null) => !!iso && iso.slice(0, 10) >= input.period.from && iso.slice(0, 10) <= input.period.to
  const companyName = new Map(input.companies.map((c) => [c.id, c.legalName]))
  const typeName = new Map(input.licenseTypes.map((t) => [t.id, t.name]))

  switch (id) {
    case 'regularidade-geral': {
      const counts = countHealth(monitored)
      const indices = monitored.map((o) => o.regularityIndex).filter((v): v is number => v !== null)
      return {
        columns: [
          { key: 'indicador', label: 'Indicador' },
          { key: 'valor', label: 'Valor', align: 'right' },
        ],
        rows: [
          { indicador: 'Empresas monitoradas', valor: counts.total },
          { indicador: 'Regulares', valor: counts.regular },
          { indicador: 'Em atenção', valor: counts.atencao },
          { indicador: 'Com pendência', valor: counts.pendencia },
          { indicador: 'Índice médio de regularidade', valor: average(indices) },
        ],
      }
    }
    case 'licencas-vencidas':
      return { columns: LICENSE_COLUMNS, rows: licenseRows(input.overviews, (e) => e.evaluation.status === 'vencida') }
    case 'proximas-vencimento':
      return {
        columns: LICENSE_COLUMNS,
        rows: licenseRows(
          input.overviews,
          (e) =>
            e.license.applicability === 'aplicavel' &&
            e.evaluation.status !== 'vencida' &&
            e.evaluation.daysRemaining !== null &&
            e.evaluation.daysRemaining >= 0 &&
            e.evaluation.daysRemaining <= 60,
        ),
      }
    case 'por-setor':
      return {
        columns: [
          { key: 'setor', label: 'Setor' },
          { key: 'empresas', label: 'Empresas', align: 'right' },
          { key: 'regulares', label: 'Regulares', align: 'right' },
          { key: 'atencao', label: 'Atenção', align: 'right' },
          { key: 'pendencia', label: 'Pendência', align: 'right' },
          { key: 'indice', label: 'Índice médio', align: 'right' },
        ],
        rows: input.sectors.map((s) => {
          const list = monitored.filter((o) => o.company.sectorId === s.id)
          const c = countHealth(list)
          return {
            setor: s.name,
            empresas: c.total,
            regulares: c.regular,
            atencao: c.atencao,
            pendencia: c.pendencia,
            indice: average(list.map((o) => o.regularityIndex).filter((v): v is number => v !== null)),
          }
        }),
      }
    case 'por-empresa':
      return {
        columns: [
          { key: 'empresa', label: 'Empresa' },
          { key: 'cnpj', label: 'CNPJ' },
          { key: 'setor', label: 'Setor' },
          { key: 'situacao', label: 'Situação' },
          { key: 'indice', label: 'Índice', align: 'right' },
          { key: 'verificacao', label: 'Última verificação' },
        ],
        rows: [...monitored]
          .sort((a, b) => (a.regularityIndex ?? 101) - (b.regularityIndex ?? 101))
          .map((o) => ({
            empresa: o.company.legalName,
            cnpj: formatCnpj(o.company.cnpj),
            setor: o.sector?.name ?? '—',
            situacao: COMPANY_HEALTH_LABEL[o.health],
            indice: o.regularityIndex === null ? '—' : `${o.regularityIndex}%`,
            verificacao: formatDateTime(o.lastCheckedAt),
          })),
      }
    case 'por-orgao': {
      const groups = new Map<string, Record<string, number>>()
      for (const o of monitored) {
        for (const e of o.licenses) {
          if (e.license.applicability !== 'aplicavel') continue
          const g = groups.get(e.type.agency) ?? { total: 0, regular: 0, atencao: 0, vencida: 0, outros: 0 }
          g.total = (g.total ?? 0) + 1
          const key = ['regular', 'atencao', 'vencida'].includes(e.evaluation.status) ? e.evaluation.status : 'outros'
          g[key] = (g[key] ?? 0) + 1
          groups.set(e.type.agency, g)
        }
      }
      return {
        columns: [
          { key: 'orgao', label: 'Órgão' },
          { key: 'total', label: 'Licenças', align: 'right' },
          { key: 'regular', label: 'Regulares', align: 'right' },
          { key: 'atencao', label: 'Atenção', align: 'right' },
          { key: 'vencida', label: 'Vencidas', align: 'right' },
          { key: 'outros', label: 'Pendentes/outros', align: 'right' },
        ],
        rows: [...groups.entries()]
          .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
          .map(([orgao, g]) => ({ orgao, ...g }) as Record<string, string | number>),
      }
    }
    case 'por-periodo':
      return { columns: LICENSE_COLUMNS, rows: licenseRows(input.overviews, (e) => inPeriod(e.license.expiresAt)) }
    case 'historico-consultas':
      return {
        columns: [
          { key: 'data', label: 'Data e hora' },
          { key: 'empresa', label: 'Empresa' },
          { key: 'licenca', label: 'Licença' },
          { key: 'resultado', label: 'Resultado' },
          { key: 'validade', label: 'Validade' },
          { key: 'fonte', label: 'Fonte' },
          { key: 'responsavel', label: 'Responsável' },
          { key: 'tipo', label: 'Tipo' },
        ],
        rows: input.consultations
          .filter((c) => inPeriod(c.consultedAt))
          .map((c) => ({
            data: formatDateTime(c.consultedAt),
            empresa: companyName.get(c.companyId) ?? '—',
            licenca: typeName.get(c.licenseTypeId) ?? '—',
            resultado: c.outcome === 'erro' ? 'Erro' : c.situation ? LICENSE_SITUATION_LABEL[c.situation] : '—',
            validade: formatDate(c.expiresAt),
            fonte: c.sourceLabel ?? '—',
            responsavel: c.responsibleName,
            tipo: CONSULTATION_TYPE_LABEL[c.type],
          })),
      }
    case 'alteracoes-detectadas':
      return {
        columns: [
          { key: 'data', label: 'Detectada em' },
          { key: 'empresa', label: 'Empresa' },
          { key: 'licenca', label: 'Licença' },
          { key: 'alteracao', label: 'Alteração' },
        ],
        rows: input.changes
          .filter((c) => inPeriod(c.detectedAt))
          .map((c) => {
            const consultation = input.consultations.find((x) => x.id === c.consultationId)
            return {
              data: formatDateTime(c.detectedAt),
              empresa: companyName.get(c.companyId) ?? '—',
              licenca: consultation ? (typeName.get(consultation.licenseTypeId) ?? '—') : '—',
              alteracao: describeChanges(c.changes),
            }
          }),
      }
  }
}

/** CSV com ";" e BOM, abre direto no Excel em português. */
export function toCsv(table: ReportTable): string {
  const escape = (v: string | number) => {
    const s = String(v)
    return /[";\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
  }
  const lines = [
    table.columns.map((c) => escape(c.label)).join(';'),
    ...table.rows.map((r) => table.columns.map((c) => escape(r[c.key] ?? '')).join(';')),
  ]
  return `﻿${lines.join('\r\n')}`
}
