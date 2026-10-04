import type { LicenseOutcome } from './types'

/**
 * Pacote de dados extraídos dos documentos oficiais (gerado por `scripts/legislacao/extrair_*.py`).
 * É material de CONFERÊNCIA e IMPORTAÇÃO: não altera o simulador. As regras só entram pela importação revisada.
 */
export interface PackageDocument {
  id: string
  norma: string
  arquivo: string
  edicao: string
  data_publicacao: string
  paginas: string
  status: string
  tipo_arquivo: string
  observacoes: string
  url_oficial: string | null
  sha256: string
  tamanho_bytes: number
  data_download: string
}

export interface PackageNorm {
  id: string
  tipo: string
  numero: string
  ano: number
  data_norma: string
  data_publicacao: string
  vigencia_inicio: string
  vigencia_fonte: string
  documento: string
  relacao: string | null
  altera: string | null
  ementa: string | null
}

export interface PackageImport {
  id: string
  arquivo: string
  norma: string
  modo: 'completo' | 'parcial'
  destino: 'nova_versao'
  versao: { rotulo: string; inicio: string; fim: string | null; alterada_por: string | null; maior_risco_prevalece: boolean; fundamento_maior_risco: string; fonte: string }
  efeitos: boolean
  linhas: number
}

export interface PackageEffect {
  classificacao: string
  classificacao_codigo: string
  licenca: string
  efeito: LicenseOutcome
  fundamento: string
}

export interface PackageProblem {
  gravidade: 'erro' | 'aviso'
  tipo: string
  mensagem: string
  codigo?: string
  anexo?: string
  documento?: string
  pagina?: number
}

export interface AnnexIRow {
  cnae: string
  descricao: string
  risco_ambiental: string
  risco_sanitario: string
  competencia: string
  observacoes: string
  descricao_ibge: string
  documento: string
  pagina: number
  vigencia_inicio: string
  status_extracao: string
}

export interface AnnexIIRow {
  cnae: string
  descricao: string
  baixo_risco_a: string
  condicao_enquadramento: string
  descricao_ibge: string
  documento: string
  pagina: number
  status_extracao: string
}

export interface AnnexIIIRow {
  cbo: string
  descricao: string
  risco_ambiental: string
  risco_sanitario: string
  documento: string
  pagina: number
  status_extracao: string
}

export interface AmendmentRow {
  cnae: string
  descricao: string
  area: string
  regra_anterior: string
  nova_regra: string
  norma_original: string
  norma_modificadora: string
  inicio_vigencia: string
  documento: string
  pagina: number
  situacao: string
  status_extracao: string
}

export interface LegislationPackage {
  gerado_em: string
  gerador: string
  municipio: string
  uf: string
  aviso: string
  documentos: PackageDocument[]
  normas: PackageNorm[]
  pesquisa: { norma: string; fonte: string; url: string; resultado: string }[]
  efeitos: PackageEffect[]
  pacotes: PackageImport[]
  totais: Record<string, number>
  anexo_i: AnnexIRow[]
  anexo_ii: AnnexIIRow[]
  anexo_iii: AnnexIIIRow[]
  alteracoes: AmendmentRow[]
  revisao_manual: { codigo: string; anexo: string; pagina: number | string; motivo: string }[]
  problemas: PackageProblem[]
}

/** Pacotes disponíveis na biblioteca (por município). */
export const LEGISLATION_PACKAGES: { uf: string; city: string; base: string; file: string }[] = [
  { uf: 'PI', city: 'Teresina', base: '/legislacao/teresina', file: 'dados/legislacao_teresina.json' },
]

export function packageFor(locality: { uf: string | null; city: string | null }): { base: string; url: string } | null {
  const key = (s: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
  const found = LEGISLATION_PACKAGES.find((p) => key(p.uf) === key(locality.uf) && key(p.city) === key(locality.city))
  return found ? { base: found.base, url: `${found.base}/${found.file}` } : null
}

/** Norma do pacote correspondente a uma norma cadastrada (pelo tipo, número e ano). */
export function packageNormId(norm: { kind: string; number: string; year: number }): string {
  const prefix = norm.kind === 'lei_complementar' ? 'lc' : norm.kind
  return `${prefix}-${norm.number.replace(/\D/g, '')}-${norm.year}`
}
