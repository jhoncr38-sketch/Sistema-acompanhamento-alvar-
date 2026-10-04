import { normalizeCnae } from '../format'
import type { ConditionOperator, ConditionValue, LegislationAnnex, RiskClassification, RuleCondition, RuleQuestion } from './types'

/** Cabeçalho do modelo de importação. Detalhes em docs/SIMULACAO.md. */
export const RULES_CSV_HEADER =
  'cnae;cbo;descricao;anexo;area;classificacao;condicao_texto;condicao;classificacao_se_nao_atender;ordem;artigo;item;observacoes;resumo;acao;documento;pagina'

export type ImportAction = 'incluir' | 'alterar' | 'remover'

/** Uma linha da planilha, já validada e ligada ao cadastro (classificações, perguntas, anexos, licenças). */
export interface ImportedRule {
  line: number
  /** CNAE (7 dígitos); `null` com `cboCode` nulo = regra padrão da norma (coluna cnae com "*"). */
  cnaeCode: string | null
  /** CBO (6 dígitos), para o Anexo III. */
  cboCode: string | null
  cnaeDescription: string | null
  annexId: string | null
  /** Texto original da coluna anexo (ex.: "Anexo II"). */
  annexText: string | null
  /** `null` = enquadramento geral; preenchido = classificação específica da área/licença (ex.: risco sanitário). */
  licenseTypeId: string | null
  classificationId: string
  elseClassificationId: string | null
  priority: number
  conditions: Omit<RuleCondition, 'id'>[]
  article: string | null
  item: string | null
  notes: string | null
  description: string
  action: ImportAction | null
  /** Documento da biblioteca de onde a linha foi extraída (coluna documento) e a página. */
  sourceDocumentId: string | null
  sourcePage: number | null
}

/** Mantido por compatibilidade com a primeira versão do importador. */
export type CsvRuleRow = ImportedRule

export interface CsvRowError {
  line: number
  message: string
}

export interface CsvParseResult {
  rows: ImportedRule[]
  /** Linhas com `acao = remover` (modo "somente alterações"). */
  removals: ImportedRule[]
  errors: CsvRowError[]
  /** Colunas presentes no arquivo e não utilizadas. */
  ignoredColumns: string[]
  totalLines: number
}

export interface ImportRefs {
  classifications: readonly RiskClassification[]
  questions: readonly RuleQuestion[]
  /** Anexos da norma de destino. */
  annexes?: readonly LegislationAnnex[]
  /** Anexo usado quando a planilha não tem a coluna anexo. */
  defaultAnnexId?: string | null
  licenseTypes?: readonly { id: string; code: string; name: string; shortName: string }[]
  /** Documentos da biblioteca: a coluna documento deve apontar para um deles (nome do arquivo). */
  documents?: readonly { id: string; fileName: string | null }[]
}

const COLUMN_ALIASES = {
  cnae: ['cnae', 'codigo', 'codigo_cnae', 'cnae_codigo', 'subclasse', 'cnae_subclasse'],
  cbo: ['cbo', 'codigo_cbo', 'cbo_codigo', 'ocupacao_cbo'],
  descricao: ['descricao', 'descricao_cnae', 'atividade', 'denominacao', 'descricao_da_atividade'],
  anexo: ['anexo'],
  area: ['area', 'area_de_risco', 'tipo_de_risco', 'risco_por_area'],
  classificacao: ['classificacao', 'classificacao_de_risco', 'risco', 'grau_de_risco'],
  condicaoTexto: ['condicao_texto', 'condicao_para_enquadramento', 'condicao_legal', 'texto_da_condicao', 'condicoes_para_enquadramento'],
  condicao: ['condicao', 'condicoes', 'condicao_estruturada'],
  alternativa: ['classificacao_se_nao_atender', 'classificacao_alternativa', 'se_nao_atender'],
  ordem: ['ordem', 'prioridade'],
  artigo: ['artigo'],
  item: ['item'],
  observacoes: ['observacoes', 'observacao', 'obs'],
  resumo: ['resumo', 'regra', 'descricao_da_regra'],
  acao: ['acao', 'operacao', 'tipo_de_alteracao'],
  documento: ['documento', 'arquivo', 'documento_fonte', 'fonte'],
  pagina: ['pagina', 'pag', 'pagina_do_documento'],
} as const

type Column = keyof typeof COLUMN_ALIASES

export function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Leitor de CSV: aspas, aspas duplicadas e quebras de linha dentro de campos. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) pushField()
    else if (ch === '\n') pushRow()
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

function detectDelimiter(headerLine: string): string {
  const count = (d: string) => headerLine.split(d).length - 1
  const candidates = [';', ',', '\t'] as const
  return candidates.reduce((best, d) => (count(d) > count(best) ? d : best), ';' as string)
}

/** Número no padrão brasileiro: "1.500" = 1500, "200,5" = 200.5. */
export function parseBrazilianNumber(raw: string): number | null {
  const value = raw.trim().replace(/\s/g, '')
  if (!/^-?[\d.,]+$/.test(value)) return null
  let normalized = value
  if (value.includes(',')) normalized = value.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(value)) normalized = value.replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const OPERATORS: Record<string, ConditionOperator> = { '<=': 'lte', '<': 'lt', '>=': 'gte', '>': 'gt', '=': 'eq', '!=': 'neq', '<>': 'neq' }
const YES = new Set(['sim', 's', 'true', '1', 'yes'])
const NO = new Set(['nao', 'n', 'false', '0', 'no'])

/** Uma condição no formato `codigo_da_pergunta operador valor`. Ex.: `area_m2 <= 200`. */
export function parseCondition(expression: string, questions: readonly RuleQuestion[]): Omit<RuleCondition, 'id'> | string {
  const match = expression.trim().match(/^([A-Za-z0-9_]+)\s*(<=|>=|!=|<>|<|>|=)\s*(.+)$/)
  if (!match) return `condição "${expression.trim()}" fora do formato "pergunta operador valor"`
  const [, code, symbol, rawValue] = match as unknown as [string, string, string, string]
  const question = questions.find((q) => q.code.toLowerCase() === code.toLowerCase())
  if (!question) return `pergunta "${code}" não cadastrada`
  const operator = OPERATORS[symbol]!
  let value: ConditionValue

  if (question.type === 'numero') {
    const n = parseBrazilianNumber(rawValue)
    if (n === null) return `valor "${rawValue.trim()}" não é um número (pergunta ${question.code})`
    value = n
  } else if (question.type === 'sim_nao') {
    if (operator !== 'eq' && operator !== 'neq') return `pergunta ${question.code} (sim/não) aceita apenas "=" ou "!="`
    const answer = slug(rawValue)
    if (YES.has(answer)) value = true
    else if (NO.has(answer)) value = false
    else return `valor "${rawValue.trim()}" inválido para ${question.code}: use sim ou não`
  } else {
    if (operator !== 'eq' && operator !== 'neq') return `pergunta ${question.code} (opções) aceita apenas "=" ou "!="`
    const values: string[] = []
    for (const part of rawValue.split('|')) {
      const option = question.options.find((o) => slug(o.value) === slug(part) || slug(o.label) === slug(part))
      if (!option) return `opção "${part.trim()}" não existe na pergunta ${question.code}`
      values.push(option.value)
    }
    return { questionId: question.id, operator: operator === 'neq' ? 'neq' : values.length > 1 ? 'in' : 'eq', value: values.length > 1 ? values : values[0]!, description: '' }
  }
  return { questionId: question.id, operator, value, description: '' }
}

/** Valor de célula da planilha (texto, número, data, booleano) como texto. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value)
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' }

/** "Anexo II", "II", "2" → "2". */
export function normalizeAnnexCode(raw: string): string {
  const s = slug(raw).replace(/^anexo_?/, '')
  return ROMAN[s] ?? s
}

const AREA_SYNONYMS: Record<string, string> = {
  sanitaria: 'vigilancia',
  sanitario: 'vigilancia',
  risco_sanitario: 'vigilancia',
  vigilancia_sanitaria: 'vigilancia',
  licenciamento_sanitario: 'vigilancia',
  risco_ambiental: 'ambiental',
  licenciamento_ambiental: 'ambiental',
  corpo_de_bombeiros: 'bombeiros',
}
const GENERAL_AREA = new Set(['', 'geral', 'enquadramento_geral', 'classificacao_geral', 'municipal'])

/** CNAE vindo do Excel como número perde o zero à esquerda (0111-3/01 → 111301). */
function cnaeDigits(raw: string): string {
  const digits = normalizeCnae(raw)
  return /^\d{5,6}$/.test(raw.trim()) ? digits.padStart(7, '0') : digits
}

/**
 * Converte a tabela (CSV ou XLSX) em regras prontas para importar. Linhas com erro não são importadas;
 * cada erro informa a linha do arquivo. Classificações, perguntas, anexos e licenças precisam existir no
 * cadastro — o importador não cria nenhum. Condições textuais (`condicao_texto`) são guardadas com o texto
 * da norma e perguntadas como Sim/Não na simulação.
 */
export function parseRuleTable(table: readonly (readonly unknown[])[], refs: ImportRefs): CsvParseResult {
  const header = (table[0] ?? []).map((c) => slug(cellText(c)))
  const result: CsvParseResult = { rows: [], removals: [], errors: [], ignoredColumns: [], totalLines: 0 }

  const index = {} as Record<Column, number>
  const used = new Set<number>()
  for (const column of Object.keys(COLUMN_ALIASES) as Column[]) {
    index[column] = header.findIndex((h, i) => !used.has(i) && (COLUMN_ALIASES[column] as readonly string[]).includes(h))
    if (index[column] >= 0) used.add(index[column])
  }
  result.ignoredColumns = (table[0] ?? []).map(cellText).filter((name, i) => !used.has(i) && name.trim() !== '').map((name) => name.trim())

  if ((index.cnae < 0 && index.cbo < 0) || index.classificacao < 0) {
    result.errors.push({ line: 1, message: 'Cabeçalho precisa ter as colunas "cnae" (ou "cbo") e "classificacao".' })
    return result
  }

  const findClassification = (raw: string) => refs.classifications.find((c) => c.active && (slug(c.code) === slug(raw) || slug(c.name) === slug(raw)))
  const findAnnex = (raw: string) => (refs.annexes ?? []).find((a) => a.active && normalizeAnnexCode(a.code) === normalizeAnnexCode(raw))
  const findLicense = (raw: string) => {
    const key = AREA_SYNONYMS[slug(raw)] ?? slug(raw)
    return (refs.licenseTypes ?? []).find((t) => slug(t.code) === key || slug(t.name) === key || slug(t.shortName) === key)
  }

  table.slice(1).forEach((cells, i) => {
    const line = i + 2
    const get = (column: Column) => (index[column] >= 0 ? cellText(cells[index[column]]).trim() : '')
    if (cells.every((c) => cellText(c).trim() === '')) return
    result.totalLines += 1
    const problems: string[] = []

    const rawAction = slug(get('acao'))
    const action: ImportAction | null = rawAction === '' ? null : rawAction.startsWith('remov') || rawAction.startsWith('exclu') || rawAction.startsWith('revog') ? 'remover' : rawAction.startsWith('alter') ? 'alterar' : rawAction.startsWith('inclu') || rawAction.startsWith('nov') ? 'incluir' : null
    if (rawAction && !action) problems.push(`ação "${get('acao')}" inválida (use incluir, alterar ou remover)`)

    const rawCnae = get('cnae')
    const rawCbo = get('cbo')
    const isDefault = rawCnae === '*'
    const cnaeCode = rawCnae && !isDefault ? cnaeDigits(rawCnae) : null
    const cboCode = rawCbo ? rawCbo.replace(/\D/g, '') : null
    if (rawCnae && !isDefault && (cnaeCode?.length !== 7 || /[A-Za-z]/.test(rawCnae))) problems.push(`CNAE "${rawCnae}" inválido (use 7 dígitos, ex.: 5611-2/01)`)
    if (rawCbo && cboCode?.length !== 6) problems.push(`CBO "${rawCbo}" inválido (use 6 dígitos, ex.: 2410-05)`)
    if (!rawCnae && !rawCbo) problems.push('informe o CNAE ou o CBO')
    if (rawCnae && rawCbo) problems.push('informe CNAE ou CBO, não os dois')

    const rawAnnex = get('anexo')
    const annex = rawAnnex ? findAnnex(rawAnnex) : undefined
    if (rawAnnex && refs.annexes && !annex) problems.push(`anexo "${rawAnnex}" não cadastrado na norma`)

    const rawArea = get('area')
    const license = rawArea && !GENERAL_AREA.has(slug(rawArea)) ? findLicense(rawArea) : undefined
    if (rawArea && !GENERAL_AREA.has(slug(rawArea)) && !license) problems.push(`área "${rawArea}" não corresponde a nenhuma licença cadastrada`)

    const classification = findClassification(get('classificacao'))
    if (action !== 'remover') {
      if (!get('classificacao')) problems.push('classificação não informada')
      else if (!classification) problems.push(`classificação "${get('classificacao')}" não cadastrada`)
    }

    const rawAlternative = get('alternativa')
    const alternative = rawAlternative ? findClassification(rawAlternative) : undefined
    if (rawAlternative && !alternative) problems.push(`classificação alternativa "${rawAlternative}" não cadastrada`)

    const conditions: Omit<RuleCondition, 'id'>[] = []
    for (const text of get('condicaoTexto').split(/\r?\n/)) {
      if (text.trim()) conditions.push({ questionId: null, operator: 'eq', value: true, description: text.replace(/\s+/g, ' ').trim() })
    }
    for (const expression of get('condicao').split('&')) {
      if (!expression.trim()) continue
      const parsed = parseCondition(expression, refs.questions)
      if (typeof parsed === 'string') problems.push(parsed)
      else conditions.push(parsed)
    }
    if (rawAlternative && conditions.length === 0 && problems.length === 0) problems.push('classificação alternativa informada sem condição')

    const rawDocument = get('documento')
    const document = rawDocument
      ? (refs.documents ?? []).find((d) => d.id === rawDocument || (d.fileName ?? '').toLowerCase() === rawDocument.toLowerCase())
      : undefined
    if (rawDocument && !document) problems.push(`documento "${rawDocument}" não está na biblioteca de legislação`)
    const rawPage = get('pagina')
    const page = rawPage ? Number(rawPage) : null
    if (rawPage && (!Number.isInteger(page) || (page ?? 0) < 1)) problems.push(`página "${rawPage}" inválida`)

    const rawPriority = get('ordem')
    const priority = rawPriority ? Number(rawPriority) : 1
    if (!Number.isInteger(priority) || priority < 1) problems.push(`ordem "${rawPriority}" inválida`)

    if (problems.length > 0) {
      result.errors.push({ line, message: problems.join('; ') })
      return
    }
    const row: ImportedRule = {
      line,
      cnaeCode: cboCode ? null : cnaeCode,
      cboCode,
      cnaeDescription: get('descricao') || null,
      annexId: annex?.id ?? (rawAnnex ? null : (refs.defaultAnnexId ?? null)),
      annexText: rawAnnex || null,
      licenseTypeId: license?.id ?? null,
      classificationId: classification?.id ?? '',
      elseClassificationId: alternative?.id ?? null,
      priority,
      conditions,
      article: get('artigo') || null,
      item: get('item') || null,
      notes: get('observacoes') || null,
      description: get('resumo'),
      action,
      sourceDocumentId: document?.id ?? null,
      sourcePage: document ? page : null,
    }
    if (action === 'remover') result.removals.push(row)
    else result.rows.push(row)
  })
  return result
}

/** Tabela (linhas × colunas) a partir do texto do CSV, detectando o separador. */
export function csvToTable(text: string): string[][] {
  const clean = text.replace(/^﻿/, '')
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  return parseCsv(clean, detectDelimiter(firstLine))
}

export function parseRulesCsv(text: string, refs: ImportRefs): CsvParseResult {
  return parseRuleTable(csvToTable(text), refs)
}
