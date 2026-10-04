import type {
  AgencyScope,
  IntegrationStatus,
  LicenseApplicability,
  SectorColor,
  SectorIcon,
} from '../domain/types'
import type { AnnexKind, ClassificationTone, DocumentKind, DocumentStatus, JurisdictionLevel, LegislationKind, LegislationRelation } from '../domain/simulation/types'

/**
 * Catálogo inicial (configuração, não dado de cliente). Fonte única para:
 *  - o modo demonstração (src/data/mock)
 *  - o seed do banco (scripts/generate-seed-sql.ts → supabase/seed.sql)
 * Usa apenas imports de tipo para poder rodar direto no Node.
 */

export interface SectorSeed {
  slug: string
  name: string
  color: SectorColor
  icon: SectorIcon
  coverImageUrl: string
  sortOrder: number
}

export const SECTOR_SEEDS: SectorSeed[] = [
  { slug: 'restaurante-padaria', name: 'Restaurante e Padaria', color: 'orange', icon: 'utensils', coverImageUrl: '/sectors/restaurante-padaria.webp', sortOrder: 1 },
  { slug: 'saude', name: 'Saúde', color: 'green', icon: 'stethoscope', coverImageUrl: '/sectors/saude.webp', sortOrder: 2 },
  { slug: 'advocacia', name: 'Advocacia', color: 'purple', icon: 'scale', coverImageUrl: '/sectors/advocacia.webp', sortOrder: 3 },
  { slug: 'industria', name: 'Indústria', color: 'blue', icon: 'factory', coverImageUrl: '/sectors/industria.webp', sortOrder: 4 },
  { slug: 'pet-shop', name: 'Pet Shop', color: 'pink', icon: 'paw', coverImageUrl: '/sectors/pet-shop.webp', sortOrder: 5 },
]

export interface ProviderSeed {
  code: string
  name: string
  shortName: string
  agency: string
  status: IntegrationStatus
}

/** Nenhuma integração existe ainda: todas ficam "pendente" até haver acesso oficial. */
export const PROVIDER_SEEDS: ProviderSeed[] = [
  { code: 'slic', name: 'SLIC', shortName: 'SLIC', agency: 'Prefeitura', status: 'pendente' },
  { code: 'govpi_empresas', name: 'GOV.PI Empresas', shortName: 'GOV.PI', agency: 'Governo do Piauí', status: 'pendente' },
  { code: 'cbmepi', name: 'CBMEPI', shortName: 'CBMEPI', agency: 'Corpo de Bombeiros Militar do Piauí', status: 'pendente' },
  { code: 'divisa', name: 'DIVISA', shortName: 'DIVISA', agency: 'Vigilância Sanitária', status: 'pendente' },
  { code: 'semarh', name: 'SEMARH', shortName: 'SEMARH', agency: 'Secretaria de Meio Ambiente', status: 'pendente' },
  { code: 'cnes', name: 'CNES', shortName: 'CNES', agency: 'Ministério da Saúde', status: 'pendente' },
  { code: 'oab', name: 'OAB', shortName: 'OAB', agency: 'Ordem dos Advogados do Brasil', status: 'pendente' },
  { code: 'crmv', name: 'CRMV', shortName: 'CRMV', agency: 'Conselho Regional de Medicina Veterinária', status: 'pendente' },
]

export interface LicenseTypeSeed {
  code: string
  name: string
  shortName: string
  agency: string
  agencyScope: AgencyScope
  defaultProviderCode: string | null
  hasExpiration: boolean
  sortOrder: number
}

export const LICENSE_TYPE_SEEDS: LicenseTypeSeed[] = [
  { code: 'alvara', name: 'Alvará de Funcionamento', shortName: 'Alvará', agency: 'Prefeitura', agencyScope: 'municipal', defaultProviderCode: 'slic', hasExpiration: true, sortOrder: 1 },
  { code: 'vigilancia', name: 'Vigilância Sanitária', shortName: 'Vigilância', agency: 'DIVISA', agencyScope: 'estadual', defaultProviderCode: 'govpi_empresas', hasExpiration: true, sortOrder: 2 },
  { code: 'bombeiros', name: 'Bombeiros', shortName: 'Bombeiros', agency: 'CBMEPI', agencyScope: 'estadual', defaultProviderCode: 'cbmepi', hasExpiration: true, sortOrder: 3 },
  { code: 'ambiental', name: 'Licença Ambiental', shortName: 'Ambiental', agency: 'SEMARH', agencyScope: 'estadual', defaultProviderCode: 'semarh', hasExpiration: true, sortOrder: 4 },
  { code: 'acessibilidade', name: 'Licença de Acessibilidade', shortName: 'Acessibilidade', agency: 'Prefeitura', agencyScope: 'municipal', defaultProviderCode: null, hasExpiration: true, sortOrder: 5 },
  { code: 'cnes', name: 'CNES', shortName: 'CNES', agency: 'Ministério da Saúde', agencyScope: 'federal', defaultProviderCode: 'cnes', hasExpiration: false, sortOrder: 6 },
  { code: 'oab', name: 'Registro na OAB', shortName: 'OAB', agency: 'OAB/PI', agencyScope: 'conselho', defaultProviderCode: 'oab', hasExpiration: true, sortOrder: 7 },
  { code: 'registro_sociedade', name: 'Registro da Sociedade', shortName: 'Reg. Sociedade', agency: 'OAB/PI', agencyScope: 'conselho', defaultProviderCode: 'oab', hasExpiration: false, sortOrder: 8 },
  { code: 'crmv', name: 'Registro no CRMV', shortName: 'CRMV', agency: 'CRMV-PI', agencyScope: 'conselho', defaultProviderCode: 'crmv', hasExpiration: true, sortOrder: 9 },
  { code: 'responsavel_tecnico', name: 'Responsável Técnico', shortName: 'Resp. Técnico', agency: 'Conselho de classe', agencyScope: 'conselho', defaultProviderCode: null, hasExpiration: true, sortOrder: 10 },
  { code: 'conselho_profissional', name: 'Conselho Profissional', shortName: 'Conselho', agency: 'Conselho de classe', agencyScope: 'conselho', defaultProviderCode: null, hasExpiration: true, sortOrder: 11 },
]

export interface SectorRuleSeed {
  sector: string
  license: string
  applicability: LicenseApplicability
  showInTable: boolean
  notes?: string
}

const A: LicenseApplicability = 'aplicavel'
const EA: LicenseApplicability = 'em_analise'

/**
 * Perfil de licenciamento sugerido por setor. "em_analise" = depende da atividade/porte;
 * o escritório confirma empresa a empresa. Não representa obrigação legal.
 */
export const SECTOR_RULE_SEEDS: SectorRuleSeed[] = [
  { sector: 'restaurante-padaria', license: 'alvara', applicability: A, showInTable: true },
  { sector: 'restaurante-padaria', license: 'vigilancia', applicability: A, showInTable: true },
  { sector: 'restaurante-padaria', license: 'bombeiros', applicability: A, showInTable: true },
  { sector: 'restaurante-padaria', license: 'ambiental', applicability: EA, showInTable: true, notes: 'Depende da atividade e do porte.' },
  { sector: 'restaurante-padaria', license: 'acessibilidade', applicability: EA, showInTable: true, notes: 'Confirmar a exigência municipal conforme o imóvel e a atividade.' },

  { sector: 'saude', license: 'alvara', applicability: A, showInTable: true },
  { sector: 'saude', license: 'vigilancia', applicability: A, showInTable: true },
  { sector: 'saude', license: 'bombeiros', applicability: A, showInTable: true },
  { sector: 'saude', license: 'cnes', applicability: A, showInTable: true },
  { sector: 'saude', license: 'responsavel_tecnico', applicability: A, showInTable: false },
  { sector: 'saude', license: 'conselho_profissional', applicability: A, showInTable: false },
  { sector: 'saude', license: 'ambiental', applicability: EA, showInTable: false, notes: 'Quando houver geração de resíduos específicos.' },
  { sector: 'saude', license: 'acessibilidade', applicability: EA, showInTable: true, notes: 'Confirmar a exigência municipal conforme o imóvel e a atividade.' },

  { sector: 'advocacia', license: 'alvara', applicability: A, showInTable: true },
  { sector: 'advocacia', license: 'bombeiros', applicability: EA, showInTable: true, notes: 'Quando aplicável ao imóvel.' },
  { sector: 'advocacia', license: 'oab', applicability: A, showInTable: true },
  { sector: 'advocacia', license: 'registro_sociedade', applicability: A, showInTable: true },
  { sector: 'advocacia', license: 'acessibilidade', applicability: EA, showInTable: true, notes: 'Confirmar a exigência municipal conforme o imóvel e a atividade.' },

  { sector: 'industria', license: 'alvara', applicability: A, showInTable: true },
  { sector: 'industria', license: 'bombeiros', applicability: A, showInTable: true },
  { sector: 'industria', license: 'ambiental', applicability: A, showInTable: true },
  { sector: 'industria', license: 'vigilancia', applicability: EA, showInTable: true, notes: 'Quando houver produção de alimentos, cosméticos ou similares.' },
  { sector: 'industria', license: 'responsavel_tecnico', applicability: EA, showInTable: false },
  { sector: 'industria', license: 'acessibilidade', applicability: EA, showInTable: true, notes: 'Confirmar a exigência municipal conforme o imóvel e a atividade.' },

  { sector: 'pet-shop', license: 'alvara', applicability: A, showInTable: true },
  { sector: 'pet-shop', license: 'vigilancia', applicability: EA, showInTable: true },
  { sector: 'pet-shop', license: 'bombeiros', applicability: A, showInTable: true },
  { sector: 'pet-shop', license: 'crmv', applicability: EA, showInTable: true },
  { sector: 'pet-shop', license: 'ambiental', applicability: EA, showInTable: false },
  { sector: 'pet-shop', license: 'responsavel_tecnico', applicability: EA, showInTable: false },
  { sector: 'pet-shop', license: 'acessibilidade', applicability: EA, showInTable: true, notes: 'Confirmar a exigência municipal conforme o imóvel e a atividade.' },
]

export interface CnaeSeed {
  code: string
  description: string
  sector: string
}

export const CNAE_SEEDS: CnaeSeed[] = [
  { code: '1091102', description: 'Fabricação de produtos de padaria e confeitaria com predominância de produção própria', sector: 'restaurante-padaria' },
  { code: '4721102', description: 'Padaria e confeitaria com predominância de revenda', sector: 'restaurante-padaria' },
  { code: '5611201', description: 'Restaurantes e similares', sector: 'restaurante-padaria' },
  { code: '5611203', description: 'Lanchonetes, casas de chá, de sucos e similares', sector: 'restaurante-padaria' },
  { code: '8630503', description: 'Atividade médica ambulatorial restrita a consultas', sector: 'saude' },
  { code: '8630504', description: 'Atividade odontológica', sector: 'saude' },
  { code: '8640202', description: 'Laboratórios clínicos', sector: 'saude' },
  { code: '8650004', description: 'Atividades de fisioterapia', sector: 'saude' },
  { code: '6911701', description: 'Serviços advocatícios', sector: 'advocacia' },
  { code: '1052000', description: 'Fabricação de laticínios', sector: 'industria' },
  { code: '1813001', description: 'Impressão de material para uso publicitário', sector: 'industria' },
  { code: '2222600', description: 'Fabricação de embalagens de material plástico', sector: 'industria' },
  { code: '2512800', description: 'Fabricação de esquadrias de metal', sector: 'industria' },
  { code: '3101200', description: 'Fabricação de móveis com predominância de madeira', sector: 'industria' },
  { code: '4789004', description: 'Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação', sector: 'pet-shop' },
  { code: '7500100', description: 'Atividades veterinárias', sector: 'pet-shop' },
  { code: '9609208', description: 'Higiene e embelezamento de animais domésticos', sector: 'pet-shop' },
]

export interface CnaeLicenseRuleSeed {
  cnae: string
  license: string
  applicability: LicenseApplicability
  notes: string
}

export const CNAE_LICENSE_RULE_SEEDS: CnaeLicenseRuleSeed[] = [
  { cnae: '1052000', license: 'vigilancia', applicability: A, notes: 'Produção de alimentos.' },
  { cnae: '1052000', license: 'responsavel_tecnico', applicability: A, notes: 'Produção de alimentos.' },
  { cnae: '7500100', license: 'crmv', applicability: A, notes: 'Atividade veterinária.' },
  { cnae: '7500100', license: 'responsavel_tecnico', applicability: A, notes: 'Atividade veterinária.' },
  { cnae: '4789004', license: 'vigilancia', applicability: A, notes: 'Comércio de alimentos para animais.' },
]

export interface RiskClassificationSeed {
  code: string
  name: string
  severity: number
  tone: ClassificationTone
}

/**
 * Classificações de risco usadas pela Simulação. As denominações de Teresina vêm da LC nº 5.788/2022 (art. 4º) e das
 * tabelas do Decreto nº 24.861/2023 e alterações. Nenhuma regra ou vigência é pré-cadastrada.
 */
export const RISK_CLASSIFICATION_SEEDS: RiskClassificationSeed[] = [
  { code: 'baixo_risco_a', name: 'Baixo Risco A', severity: 10, tone: 'green' },
  { code: 'dispensa_licenca', name: 'Dispensa de Licença', severity: 12, tone: 'blue' },
  { code: 'baixo_risco', name: 'Baixo Risco (Anexo III)', severity: 15, tone: 'green' },
  { code: 'baixo_risco_b', name: 'Baixo Risco B', severity: 20, tone: 'blue' },
  { code: 'nao_baixo_risco_a', name: 'Não enquadrada como Baixo Risco A', severity: 25, tone: 'orange' },
  { code: 'necessita_licenciamento', name: 'Necessita Licenciamento', severity: 30, tone: 'orange' },
  { code: 'medio_risco', name: 'Médio Risco', severity: 30, tone: 'orange' },
  { code: 'competencia_estadual', name: 'Competência Estadual', severity: 35, tone: 'yellow' },
  { code: 'alto_risco', name: 'Alto Risco', severity: 40, tone: 'red' },
]

export interface QuestionSeed {
  code: string
  text: string
  unit: string
  helpText: string
}

/** Perguntas exigidas pelas faixas de área/volume do Anexo I do Decreto nº 24.861/2023 (estrutura, não regra). */
export const QUESTION_SEEDS: QuestionSeed[] = [
  {
    code: 'area_ha',
    text: 'Área da atividade (em hectares)',
    unit: 'ha',
    helpText: 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 ("menor ou igual a 01 ha"). A norma não detalha a forma de medição: confirme com o órgão ambiental.',
  },
  {
    code: 'area_m2',
    text: 'Área utilizada pela atividade (m²)',
    unit: 'm²',
    helpText: 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 20m²"). A norma não detalha a forma de medição: confirme com o órgão ambiental.',
  },
  {
    code: 'volume_m3',
    text: 'Volume referente à atividade (m³)',
    unit: 'm³',
    helpText: 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 200m³"). A norma não diz a que volume se refere: confirme com o órgão ambiental.',
  },
]

export interface LegislationSeed {
  key: string
  kind: LegislationKind
  number: string
  year: number
  normDate: string | null
  title: string
  issuingBody: string
  level: JurisdictionLevel
  uf: string | null
  city: string | null
  definesGeneralClassification: boolean
  parentKey: string | null
  relation: LegislationRelation | null
  officialUrl: string | null
  notes: string
}

export interface AnnexSeed {
  legislationKey: string
  code: string
  title: string
  kind: AnnexKind
  description: string
  sortOrder: number
}

export interface DocumentSeed {
  key: string
  legislationKey: string
  title: string
  kind: DocumentKind
  edition: string
  publicationDate: string
  pages: string
  officialUrl: string | null
  fileUrl: string
  fileName: string
  sha256: string
  sizeBytes: number
  downloadedAt: string
  status: DocumentStatus
  notes: string
}

const DOM = (file: string) => `https://dom.pmt.pi.gov.br/admin/upload/${file}.pdf`
const LIBRARY = '/legislacao/teresina'

/**
 * Base legal de Teresina – PI, conferida nos PDFs oficiais do Diário Oficial do Município (biblioteca em
 * `legislacao/teresina`). Somente a identificação das normas, os anexos e os documentos: o CONTEÚDO (regras, vigências,
 * efeitos) entra pela importação revisada e aprovada pelo administrador — nunca automaticamente.
 */
export const LEGISLATION_SEEDS: LegislationSeed[] = [
  {
    key: 'teresina-lc-5788-2022',
    kind: 'lei_complementar',
    number: '5.788',
    year: 2022,
    normDate: '2022-08-19',
    title:
      'Dispõe sobre o licenciamento para funcionamento e exercício de atividades econômicas, no Município de Teresina, estabelece procedimentos para classificação de risco das atividades econômicas, inclusive as de baixo risco, para os fins da Lei Federal nº 13.874, de 20 de setembro de 2019, e dá outras providências.',
    issuingBody: 'Município de Teresina',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: false,
    parentKey: null,
    relation: null,
    officialUrl: DOM('DOM3340-24082022-ASSINADO'),
    notes:
      'Publicada no DOM nº 3.339 (23/08/2022, pág. 4) com erro de numeração e republicada no DOM nº 3.340 (24/08/2022). Art. 37: vigência na data da publicação. Define as denominações de risco (art. 4º).',
  },
  {
    key: 'teresina-decreto-24861-2023',
    kind: 'decreto',
    number: '24.861',
    year: 2023,
    normDate: '2023-09-26',
    title:
      'Define as classificações de grau de risco das atividades econômicas no Município de Teresina – conforme previsto na Lei Complementar Municipal nº 5.788, de 19 de agosto de 2022 –, inclusive a classificação de atividades de “baixo risco A” para fins de dispensa da exigência do Alvará de Funcionamento e demais licenciamentos municipais, tais como Licenças Ambientais e Sanitárias – conforme a Lei Federal nº 13.874, de 20 de setembro 2019 –, que instituiu a Declaração de Direitos de Liberdade Econômica.',
    issuingBody: 'Município de Teresina',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: true,
    parentKey: null,
    relation: null,
    officialUrl: DOM('DOM3609-28092023-ASSINADO'),
    notes: 'Publicado no DOM nº 3.609, de 28/09/2023 (págs. 3–19). Art. 6º: vigência na data da publicação. Art. 5º: estabelecimento com mais de uma atividade é classificado pela de maior grau de risco.',
  },
  {
    key: 'teresina-decreto-25363-2023',
    kind: 'decreto',
    number: '25.363',
    year: 2023,
    normDate: '2023-12-20',
    title:
      'Altera o ANEXO I, do Decreto nº 24.861, de 26 de setembro de 2023 (reclassificação do grau de risco ambiental de atividades econômicas).',
    issuingBody: 'Município de Teresina',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: false,
    parentKey: 'teresina-decreto-24861-2023',
    relation: 'altera',
    officialUrl: DOM('DOM3665-26122023-ASSINADO'),
    notes: 'Publicado no DOM nº 3.665, de 26/12/2023 (págs. 12–13). Art. 2º: vigência na data da publicação. Altera o risco ambiental de 67 CNAEs do Anexo I.',
  },
  {
    key: 'teresina-lc-6048-2023',
    kind: 'lei_complementar',
    number: '6.048',
    year: 2023,
    normDate: '2023-12-27',
    title:
      'Altera o inciso II, do art. 4º; o art. 11; o caput do art. 34; revoga o art. 10; e inclui o §5º, do art. 4º, todos da Lei Complementar nº 5.788, de 19 de agosto de 2022.',
    issuingBody: 'Município de Teresina',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: false,
    parentKey: 'teresina-lc-5788-2022',
    relation: 'altera',
    officialUrl: DOM('DOM3666-27122023-ASSINADO'),
    notes: 'Publicada no DOM nº 3.666, de 27/12/2023 (pág. 1). Art. 4º: vigência na data da publicação. Nova redação do conceito de médio risco (art. 4º, II) e do art. 11 (Alvará após as licenças).',
  },
  {
    key: 'teresina-decreto-28436-2025',
    kind: 'decreto',
    number: '28.436',
    year: 2025,
    normDate: '2025-11-28',
    title:
      'Altera o Anexo I, do Decreto nº 24.861, de 26 de setembro de 2023, que fixa as classificações de risco das atividades econômicas no Município de Teresina, e dá outras providências.',
    issuingBody: 'Município de Teresina',
    level: 'municipal',
    uf: 'PI',
    city: 'Teresina',
    definesGeneralClassification: false,
    parentKey: 'teresina-decreto-24861-2023',
    relation: 'altera',
    officialUrl: DOM('DOM4156-09122025-ASSINADO'),
    notes: 'Publicado no DOM nº 4.156, de 09/12/2025 (pág. 1). Art. 2º: vigência na data da publicação. Altera o risco sanitário (competência para o licenciamento) de 11 CNAEs do Anexo I.',
  },
]

export const ANNEX_SEEDS: AnnexSeed[] = [
  {
    legislationKey: 'teresina-decreto-24861-2023',
    code: 'I',
    title: 'Classificação de risco das atividades econômicas (não incluídas as atividades de “baixo risco A”)',
    kind: 'classificacao',
    description: 'Art. 1º, I. Por CNAE: grau de risco ambiental e grau de risco sanitário. 1.034 subclasses (págs. 4–15 do DOM nº 3.609).',
    sortOrder: 1,
  },
  {
    legislationKey: 'teresina-decreto-24861-2023',
    code: 'II',
    title: 'Classificação das atividades de “baixo risco A”',
    kind: 'baixo_risco_a',
    description: 'Art. 1º, II e art. 2º. Por CNAE, com a condição para classificação em “baixo risco A” quando houver. 298 subclasses (págs. 15–18).',
    sortOrder: 2,
  },
  {
    legislationKey: 'teresina-decreto-24861-2023',
    code: 'III',
    title: 'Classificação de risco por meio da Classificação Brasileira de Ocupações (CBO)',
    kind: 'cbo',
    description: 'Art. 1º, III. Para atividades de pessoas cujos dados cadastrais não utilizem a CNAE. 85 ocupações (págs. 18–19).',
    sortOrder: 3,
  },
]

export const DOCUMENT_SEEDS: DocumentSeed[] = [
  {
    key: 'lc-5788-2022-dom3340',
    legislationKey: 'teresina-lc-5788-2022',
    title: 'Lei Complementar nº 5.788/2022 (republicação)',
    kind: 'edicao_dom',
    edition: 'DOM nº 3.340',
    publicationDate: '2022-08-24',
    pages: '1–3',
    officialUrl: DOM('DOM3340-24082022-ASSINADO'),
    fileUrl: `${LIBRARY}/2022/LC_5788_2022_original_DOM3340.pdf`,
    fileName: 'LC_5788_2022_original_DOM3340.pdf',
    sha256: '48891450fc8162b85fbda3ecd98c8ee07ea80aeea95c6114f8dadf3665aa463e',
    sizeBytes: 2018319,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Republicação oficial por incorreção apenas na numeração (nota na pág. 1). Edição completa, sem alteração.',
  },
  {
    key: 'lc-5788-2022-dom3339',
    legislationKey: 'teresina-lc-5788-2022',
    title: 'Lei Complementar nº 5.788/2022 (primeira publicação, com erro de numeração)',
    kind: 'edicao_dom',
    edition: 'DOM nº 3.339',
    publicationDate: '2022-08-23',
    pages: '4',
    officialUrl: DOM('DOM3339-23082022-ASSINADO'),
    fileUrl: `${LIBRARY}/2022/LC_5788_2022_publicacao_anterior_DOM3339.pdf`,
    fileName: 'LC_5788_2022_publicacao_anterior_DOM3339.pdf',
    sha256: '4c02af12dd6eb63076570b386fd145f1550705cabe999329eb1d97802a8abfee',
    sizeBytes: 5143710,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Consta como "Lei Complementar nº 5.787". Guardada para histórico; vale a republicação do DOM nº 3.340.',
  },
  {
    key: 'decreto-24861-2023-dom3609',
    legislationKey: 'teresina-decreto-24861-2023',
    title: 'Decreto nº 24.861/2023 — texto e Anexos I, II e III',
    kind: 'edicao_dom',
    edition: 'DOM nº 3.609',
    publicationDate: '2023-09-28',
    pages: '3–19',
    officialUrl: DOM('DOM3609-28092023-ASSINADO'),
    fileUrl: `${LIBRARY}/2023/Decreto_24861_2023_original_DOM3609.pdf`,
    fileName: 'Decreto_24861_2023_original_DOM3609.pdf',
    sha256: 'cbebfb4d10676213b55ab247edf9ad9c88cf9cbaef10d02cb06136fea9290628',
    sizeBytes: 5393739,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Texto nas págs. 3–4; Anexo I nas págs. 4–15; Anexo II nas págs. 15–18; Anexo III nas págs. 18–19. Edição completa, assinada digitalmente.',
  },
  {
    key: 'decreto-24861-2023-extrato',
    legislationKey: 'teresina-decreto-24861-2023',
    title: 'Decreto nº 24.861/2023 — extrato fornecido pelo escritório',
    kind: 'extrato',
    edition: 'DOM nº 3.609 (págs. 3–19)',
    publicationDate: '2023-09-28',
    pages: '1–17 do extrato (= 3–19 do DOM)',
    officialUrl: DOM('DOM3609-28092023-ASSINADO'),
    fileUrl: `${LIBRARY}/2023/Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf`,
    fileName: 'Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf',
    sha256: 'ca1b302b12fd9b6109e80f6425e5fa50fee8f5c5756c2cb3498d282d49ff4be7',
    sizeBytes: 554945,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Conferido página a página com a edição oficial completa. A referência das regras é a edição completa.',
  },
  {
    key: 'decreto-25363-2023-dom3665',
    legislationKey: 'teresina-decreto-25363-2023',
    title: 'Decreto nº 25.363/2023 — texto e Anexo Único',
    kind: 'edicao_dom',
    edition: 'DOM nº 3.665',
    publicationDate: '2023-12-26',
    pages: '12–13',
    officialUrl: DOM('DOM3665-26122023-ASSINADO'),
    fileUrl: `${LIBRARY}/2023/Decreto_25363_2023_original_DOM3665.pdf`,
    fileName: 'Decreto_25363_2023_original_DOM3665.pdf',
    sha256: 'f6d5a3ee71f75fb44d364290a493d4c4dd503ce6a85a97c3f849bca73bb15861',
    sizeBytes: 5424210,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Texto na pág. 12 (coluna direita); Anexo Único na pág. 13.',
  },
  {
    key: 'lc-6048-2023-dom3666',
    legislationKey: 'teresina-lc-6048-2023',
    title: 'Lei Complementar nº 6.048/2023',
    kind: 'edicao_dom',
    edition: 'DOM nº 3.666',
    publicationDate: '2023-12-27',
    pages: '1',
    officialUrl: DOM('DOM3666-27122023-ASSINADO'),
    fileUrl: `${LIBRARY}/2023/LC_6048_2023_original_DOM3666.pdf`,
    fileName: 'LC_6048_2023_original_DOM3666.pdf',
    sha256: '96849fcf4dd634ab69de903b14a0448099dfd465c7c48fd955bde95803da700a',
    sizeBytes: 4151734,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Edição completa, sem alteração.',
  },
  {
    key: 'decreto-28436-2025-dom4156',
    legislationKey: 'teresina-decreto-28436-2025',
    title: 'Decreto nº 28.436/2025',
    kind: 'edicao_dom',
    edition: 'DOM nº 4.156',
    publicationDate: '2025-12-09',
    pages: '1',
    officialUrl: DOM('DOM4156-09122025-ASSINADO'),
    fileUrl: `${LIBRARY}/2025/Decreto_28436_2025_original_DOM4156.pdf`,
    fileName: 'Decreto_28436_2025_original_DOM4156.pdf',
    sha256: '11f120c048a870bbb28e1159c53aed1aa5e5094bbd8f3d7923210f16f9710325',
    sizeBytes: 4255152,
    downloadedAt: '2026-10-04',
    status: 'oficial_confirmado',
    notes: 'Edição completa, sem alteração.',
  },
]

export interface NotificationTemplateSeed {
  code: 'd90' | 'd60' | 'd30' | 'd15' | 'd7' | 'vencida'
  daysBefore: number
  subject: string
}

export const NOTIFICATION_TEMPLATE_SEEDS: NotificationTemplateSeed[] = [
  { code: 'd90', daysBefore: 90, subject: '{{licenca}} de {{empresa}} vence em 90 dias' },
  { code: 'd60', daysBefore: 60, subject: '{{licenca}} de {{empresa}} vence em 60 dias' },
  { code: 'd30', daysBefore: 30, subject: '{{licenca}} de {{empresa}} vence em 30 dias' },
  { code: 'd15', daysBefore: 15, subject: '{{licenca}} de {{empresa}} vence em 15 dias' },
  { code: 'd7', daysBefore: 7, subject: 'Urgente: {{licenca}} de {{empresa}} vence em 7 dias' },
  { code: 'vencida', daysBefore: 0, subject: '{{licenca}} de {{empresa}} está vencida' },
]
