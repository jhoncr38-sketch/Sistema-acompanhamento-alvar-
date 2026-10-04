import { changeAlertFor, expirationAlertFor, type AlertDraft } from '@/domain/alert-rules'
import { addDays } from '@/domain/dates'
import { buildCompanyOverviews } from '@/domain/monitoring'
import { DEFAULT_SETTINGS } from '@/domain/settings'
import type {
  Alert,
  AuditLog,
  Company,
  CompanyLicense,
  CompanyStatus,
  ISODate,
  LicenseApplicability,
  LicenseConsultation,
  LicenseSituation,
  UserProfile,
} from '@/domain/types'
import {
  CNAE_LICENSE_RULE_SEEDS,
  CNAE_SEEDS,
  LICENSE_TYPE_SEEDS,
  PROVIDER_SEEDS,
  SECTOR_RULE_SEEDS,
  SECTOR_SEEDS,
} from '../catalog-seed'
import { createDemoSimulationData } from './demo-simulation-seed'
import { MOCK_DB_VERSION, type MockDb, type StoredDocument } from './mock-db'

/**
 * Dados FICTÍCIOS de demonstração (nenhum cliente real). Datas relativas ao dia em que o seed é gerado,
 * para que a demonstração mantenha a mesma situação da referência aprovada.
 */

type LicSeed =
  | number // regular, vence em N dias
  | 'ok' // regular, sem validade
  | 'na'
  | 'disp'
  | 'analise'
  | 'pend' // consulta registrou pendência
  | 'never' // nunca consultada (sem documento)
  | { vencida: number } // venceu há N dias
  | { renov: number } // em renovação; validade atual em N dias

interface CompanySeed {
  name: string
  trade?: string
  cnpj?: string
  cnae: string
  secondary?: string[]
  street?: string
  district?: string
  city?: string
  status?: CompanyStatus
  photo?: string
  lic?: Record<string, LicSeed | 'auto'>
}

const SECTOR_LICENSES: Record<string, Record<string, LicSeed | 'auto'>> = {
  'restaurante-padaria': { alvara: 'auto', vigilancia: 'auto', bombeiros: 'auto', ambiental: 'na', acessibilidade: 'auto' },
  saude: {
    alvara: 'auto',
    vigilancia: 'auto',
    bombeiros: 'auto',
    cnes: 'ok',
    responsavel_tecnico: 'auto',
    conselho_profissional: 'auto',
    ambiental: 'na',
    acessibilidade: 'auto',
  },
  advocacia: { alvara: 'auto', bombeiros: 'auto', oab: 'auto', registro_sociedade: 'ok', acessibilidade: 'auto' },
  industria: { alvara: 'auto', bombeiros: 'auto', ambiental: 'auto', vigilancia: 'na', responsavel_tecnico: 'na', acessibilidade: 'auto' },
  'pet-shop': { alvara: 'auto', vigilancia: 'auto', bombeiros: 'auto', crmv: 'na', ambiental: 'na', responsavel_tecnico: 'na', acessibilidade: 'auto' },
}

const COMPANIES: Record<string, CompanySeed[]> = {
  'restaurante-padaria': [
    { name: 'Padaria Central LTDA', trade: 'Padaria Central', cnpj: '00000000000100', cnae: '1091102', secondary: ['4721102'], street: 'Av. Exemplo, 123', district: 'Centro', photo: '/demo/padaria-central.webp', lic: { alvara: 88, vigilancia: 162, bombeiros: 24, acessibilidade: 'analise' } },
    { name: 'Restaurante ABC', cnpj: '11111111000111', cnae: '5611201', lic: { vigilancia: { vencida: 14 } } },
    { name: 'Panificadora Pão Bom', cnpj: '22222222000122', cnae: '1091102' },
    { name: 'Delícias da Terra', cnpj: '33333333000133', cnae: '5611201', lic: { bombeiros: 7 } },
    { name: 'Sabor & Cia', cnpj: '44444444000144', cnae: '5611203' },
    { name: 'Padaria Nova Geração', cnpj: '55555555000155', cnae: '4721102', lic: { vigilancia: 'pend' } },
    { name: 'Restaurante Tradição', cnpj: '66666666000166', cnae: '5611201' },
    { name: 'Panificadora Ki-Pão', cnpj: '77777777000177', cnae: '1091102', lic: { alvara: 45 } },
    { name: 'Cantinho do Pão', cnpj: '88888888000188', cnae: '4721102' },
    { name: 'Restaurante Sabor Nordestino', cnpj: '99999999000199', cnae: '5611201', lic: { ambiental: 240 } },
    { name: 'Confeitaria Doce Encanto', cnae: '1091102' },
    { name: 'Pizzaria Forno a Lenha', cnae: '5611201', city: 'Parnaíba' },
    { name: 'Lanchonete Bom Sabor', cnae: '5611203' },
    { name: 'Padaria Estrela do Sul', cnae: '1091102', status: 'em_implantacao' },
    { name: 'Restaurante Recanto Antigo', cnae: '5611201', status: 'inativa' },
  ],
  saude: [
    { name: 'Clínica Saúde Integral LTDA', trade: 'Clínica Saúde', cnae: '8630503', lic: { alvara: 30 } },
    { name: 'Laboratório Vida Diagnósticos', cnae: '8640202', lic: { bombeiros: { renov: 20 }, vigilancia: 52, ambiental: 'analise' } },
    { name: 'Odonto Sorriso Clínica Odontológica', cnae: '8630504' },
    { name: 'Fisio Movimento Reabilitação', cnae: '8650004' },
    { name: 'Clínica Bem Estar', cnae: '8630503' },
    { name: 'Centro Médico Esperança', cnae: '8630503', city: 'Picos' },
    { name: 'Clínica Pediátrica Pequeno Príncipe', cnae: '8630503' },
    { name: 'Instituto Visão Clara', cnae: '8630503' },
    { name: 'Clínica Dermatológica Pele Viva', cnae: '8630503' },
    { name: 'Policlínica Bem Viver', cnae: '8630503' },
    { name: 'Clínica Cardio Vida', cnae: '8630503' },
    { name: 'Espaço Saúde da Mulher', cnae: '8630503' },
  ],
  advocacia: [
    { name: 'Moura & Associados Advocacia', cnae: '6911701', lic: { alvara: 38 } },
    { name: 'Carvalho Lima Sociedade de Advogados', cnae: '6911701', lic: { alvara: { vencida: 9 } } },
    { name: 'Almeida & Costa Advogados', cnae: '6911701', lic: { bombeiros: 'disp' } },
    { name: 'Santos Barros Advocacia Empresarial', cnae: '6911701' },
    { name: 'Freitas Advocacia Tributária', cnae: '6911701', lic: { bombeiros: 'disp' } },
    { name: 'Oliveira & Nunes Advogados Associados', cnae: '6911701' },
    { name: 'Rocha Mendes Advocacia Trabalhista', cnae: '6911701', lic: { bombeiros: 'disp' } },
    { name: 'Paiva Advocacia Previdenciária', cnae: '6911701', city: 'Parnaíba' },
  ],
  industria: [
    { name: 'Indústria ABC Metalúrgica LTDA', trade: 'Indústria ABC', cnae: '2512800', lic: { bombeiros: { vencida: 3 }, alvara: 40, responsavel_tecnico: 'auto' } },
    { name: 'Plásticos Nordeste Embalagens', cnae: '2222600', lic: { ambiental: { vencida: 21 } } },
    { name: 'Cerâmica Piauí Revestimentos', cnae: '2512800', lic: { bombeiros: 'never' } },
    { name: 'Metalúrgica Ferro Forte', cnae: '2512800', lic: { ambiental: 5 } },
    { name: 'Laticínios Vale do Parnaíba', cnae: '1052000', lic: { vigilancia: 58, responsavel_tecnico: 'auto' } },
    { name: 'Móveis Teresina Indústria', cnae: '3101200' },
    { name: 'Gráfica Rápida Print', cnae: '1813001' },
  ],
  'pet-shop': [
    { name: 'Pet Shop Amigo Fiel', cnae: '4789004', lic: { vigilancia: 10, bombeiros: 28 } },
    { name: 'Mundo Pet Teresina', cnae: '4789004' },
    { name: 'Cão & Gato Pet Center', cnae: '4789004' },
    { name: 'Bicho Feliz Pet Shop', cnae: '4789004' },
    { name: 'Patas & Pelos Banho e Tosa', cnae: '9609208', lic: { vigilancia: 'na' } },
    { name: 'Clínica Veterinária Vida Animal', cnae: '7500100', lic: { crmv: 'auto', responsavel_tecnico: 'auto' } },
    { name: 'Pet Point Nordeste', cnae: '4789004', city: 'Picos' },
    { name: 'Aquário & Cia Pet', cnae: '4789004' },
    { name: 'Toca do Bicho Pet Shop', cnae: '4789004' },
    { name: 'Pet Love Piauí', cnae: '4789004', lic: { crmv: 'auto', responsavel_tecnico: 'auto' } },
    { name: 'Planeta Animal Pet Shop', cnae: '4789004' },
  ],
}

const USERS: UserProfile[] = [
  { id: 'demo-user-joao', fullName: 'João Ribeiro', email: 'joao.ribeiro@exemplo.com.br', role: 'administrador', active: true },
  { id: 'demo-user-maria', fullName: 'Maria Souza', email: 'maria.souza@exemplo.com.br', role: 'contador', active: true },
  { id: 'demo-user-carlos', fullName: 'Carlos Lima', email: 'carlos.lima@exemplo.com.br', role: 'colaborador', active: true },
  { id: 'demo-user-ana', fullName: 'Ana Paula Reis', email: 'ana.reis@exemplo.com.br', role: 'consulta', active: true },
]

const STREETS = ['Rua das Palmeiras', 'Av. Central', 'Rua São José', 'Rua do Comércio', 'Av. Brasil', 'Rua Sete de Setembro', 'Rua da Paz', 'Av. das Nações']
const DISTRICTS = ['Centro', 'Jóquei', 'Fátima', 'Ilhotas', 'Dirceu', 'Morada do Sol', 'Cabral', 'São Cristóvão']
const DOC_PREFIX: Record<string, string> = {
  alvara: 'ALV',
  vigilancia: 'VISA',
  bombeiros: 'CBM',
  ambiental: 'LA',
  acessibilidade: 'ACS',
  cnes: 'CNES',
  oab: 'OAB',
  registro_sociedade: 'RS',
  crmv: 'CRMV',
  responsavel_tecnico: 'CRT',
  conselho_profissional: 'CP',
}

const uid = () => crypto.randomUUID()

/** Deterministic pseudo-random in [0, 1). */
function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.floor(rand(seed) * list.length)] as T
}

/** CNPJ fictício com dígito verificador propositalmente inválido (nunca coincide com empresa real). */
export function fictitiousCnpj(n: number): string {
  const base = String(10_000_000 + ((n * 7_919_123) % 89_999_999)).slice(0, 8) + '0001'
  const dv = (digits: string, weights: number[]) => {
    const s = [...digits].reduce((acc, ch, i) => acc + Number(ch) * (weights[i] ?? 0), 0) % 11
    return s < 2 ? 0 : 11 - s
  }
  const d1 = dv(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = dv(base + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return `${base}${d1}${(d2 + 1) % 10}`
}

function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 20)
}

/** Data/hora local relativa a `today`. */
function at(today: ISODate, dayOffset: number, hour: number, minute: number): string {
  const [y, m, d] = addDays(today, dayOffset).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, minute).toISOString()
}

export function createDemoDatabase(today: ISODate): MockDb {
  const now = new Date().toISOString()
  const admin = USERS[0]!
  const team = USERS.slice(0, 3)

  const sectors = SECTOR_SEEDS.map((s) => ({ ...s, id: uid(), active: true }))
  const sectorBySlug = new Map(sectors.map((s) => [s.slug, s]))
  const providers = PROVIDER_SEEDS.map((p) => ({ ...p, id: uid(), notes: null }))
  const providerByCode = new Map(providers.map((p) => [p.code, p]))
  const licenseTypes = LICENSE_TYPE_SEEDS.map((t) => ({ ...t, id: uid(), active: true }))
  const typeByCode = new Map(licenseTypes.map((t) => [t.code, t]))

  const sectorLicenseRules = SECTOR_RULE_SEEDS.map((r, i) => ({
    id: uid(),
    sectorId: sectorBySlug.get(r.sector)!.id,
    licenseTypeId: typeByCode.get(r.license)!.id,
    defaultApplicability: r.applicability,
    showInTable: r.showInTable,
    sortOrder: i,
    notes: r.notes ?? null,
  }))
  const cnaes = CNAE_SEEDS.map((c) => ({ id: uid(), code: c.code, description: c.description }))
  const cnaeByCode = new Map(cnaes.map((c) => [c.code, c]))
  const cnaeSectorRules = CNAE_SEEDS.map((c) => ({
    id: uid(),
    cnaeId: cnaeByCode.get(c.code)!.id,
    sectorId: sectorBySlug.get(c.sector)!.id,
    priority: 1,
  }))
  const cnaeLicenseRules = CNAE_LICENSE_RULE_SEEDS.map((r) => ({
    id: uid(),
    cnaeId: cnaeByCode.get(r.cnae)!.id,
    licenseTypeId: typeByCode.get(r.license)!.id,
    applicability: r.applicability,
    notes: r.notes,
  }))

  const companies: Company[] = []
  const licenses: CompanyLicense[] = []
  const consultations: LicenseConsultation[] = []
  let seq = 0

  for (const [sectorSlug, seeds] of Object.entries(COMPANIES)) {
    const sector = sectorBySlug.get(sectorSlug)!
    seeds.forEach((seed) => {
      seq += 1
      const companyId = uid()
      const createdAt = at(today, -400 + seq * 3, 9, 0)
      companies.push({
        id: companyId,
        legalName: seed.name,
        tradeName: seed.trade ?? seed.name.replace(/ LTDA$/, ''),
        cnpj: seed.cnpj ?? fictitiousCnpj(seq),
        sectorId: sector.id,
        mainCnae: seed.cnae,
        secondaryCnaes: seed.secondary ?? [],
        address: {
          street: seed.street ?? `${pick(STREETS, seq)}, ${100 + Math.floor(rand(seq + 7) * 1800)}`,
          number: '',
          complement: '',
          district: seed.district ?? pick(DISTRICTS, seq + 3),
          city: seed.city ?? 'Teresina',
          state: 'PI',
          zipCode: '',
        },
        phone: `(86) 3${String(200 + seq).padStart(3, '0')}-${String(1000 + seq * 37).slice(-4)}`,
        email: `contato@${slugify(seed.trade ?? seed.name)}.exemplo.com.br`,
        responsibleName: pick(['Francisca Alves', 'José Pereira', 'Antônia Sousa', 'Raimundo Costa', 'Luiza Martins'], seq),
        notes: '',
        status: seed.status ?? 'ativa',
        photoUrl: seed.photo ?? null,
        createdAt,
        updatedAt: createdAt,
        createdBy: admin.id,
      })

      const plan = { ...SECTOR_LICENSES[sectorSlug], ...seed.lic }
      Object.entries(plan).forEach(([code, rawPlan], li) => {
        const type = typeByCode.get(code)!
        const p: LicSeed = rawPlan === 'auto' ? 75 + Math.floor(rand(seq * 31 + li * 7) * 320) : rawPlan
        const applicability: LicenseApplicability =
          p === 'na' ? 'nao_aplicavel' : p === 'disp' ? 'dispensada' : p === 'analise' ? 'em_analise' : 'aplicavel'
        let situation: LicenseSituation | null = null
        let expiresAt: ISODate | null = null
        let protocolNumber: string | null = null
        if (typeof p === 'number') {
          situation = 'regular'
          expiresAt = addDays(today, p)
        } else if (p === 'ok') {
          situation = 'regular'
        } else if (p === 'pend') {
          situation = 'pendente'
        } else if (typeof p === 'object' && 'vencida' in p) {
          situation = 'vencida'
          expiresAt = addDays(today, -p.vencida)
        } else if (typeof p === 'object' && 'renov' in p) {
          situation = 'em_renovacao'
          expiresAt = addDays(today, p.renov)
          protocolNumber = `${DOC_PREFIX[code]}-PRT-${today.slice(0, 4)}/${String(4000 + seq).padStart(6, '0')}`
        }

        const license: CompanyLicense = {
          id: uid(),
          companyId,
          licenseTypeId: type.id,
          applicability,
          situation,
          issuedAt: expiresAt && situation === 'regular' ? addDays(expiresAt, -365) : null,
          expiresAt,
          documentNumber:
            situation === 'regular' || situation === 'vencida' || situation === 'em_renovacao'
              ? `${DOC_PREFIX[code]}-${today.slice(0, 4)}/${String(seq * 100 + li).padStart(5, '0')}`
              : null,
          protocolNumber,
          providerCode: type.defaultProviderCode,
          lastConsultationId: null,
          lastCheckedAt: null,
          notes: null,
          createdAt,
          updatedAt: createdAt,
        }
        licenses.push(license)

        if (applicability !== 'aplicavel' || situation === null) return
        const daysAgo = 1 + Math.floor(rand(seq * 13 + li) * 40)
        const responsible = pick(team, seq + li)
        const consultation: LicenseConsultation = {
          id: uid(),
          companyLicenseId: license.id,
          companyId,
          licenseTypeId: type.id,
          consultedAt: at(today, -daysAgo, 8 + Math.floor(rand(seq + li) * 9), Math.floor(rand(seq * 3 + li) * 59)),
          type: 'manual',
          outcome: 'sucesso',
          errorMessage: null,
          situation,
          issuedAt: license.issuedAt,
          expiresAt,
          providerCode: license.providerCode,
          sourceLabel: license.providerCode ? providerByCode.get(license.providerCode)?.name ?? null : null,
          documentNumber: license.documentNumber,
          protocolNumber,
          notes: situation === 'pendente' ? 'Documento não localizado na fonte.' : null,
          responsibleId: responsible.id,
          responsibleName: responsible.fullName,
          previousConsultationId: null,
          changeDetected: false,
          createdAt: now,
        }
        consultations.push(consultation)
        license.lastConsultationId = consultation.id
        license.lastCheckedAt = consultation.consultedAt
      })
    })
  }

  const companyByName = (name: string) => companies.find((c) => c.legalName === name)!
  const licenseOf = (company: Company, code: string) =>
    licenses.find((l) => l.companyId === company.id && l.licenseTypeId === typeByCode.get(code)!.id)!
  const latestOf = (license: CompanyLicense) => consultations.find((c) => c.id === license.lastConsultationId)!

  // Padaria Central: consultas de hoje às 09:40/09:41/09:42 (como na referência) + rodada anterior sem alteração.
  const padaria = companyByName('Padaria Central LTDA')
  ;(['alvara', 'vigilancia', 'bombeiros'] as const).forEach((code, i) => {
    const license = licenseOf(padaria, code)
    const latest = latestOf(license)
    const previous: LicenseConsultation = { ...latest, id: uid(), consultedAt: at(today, -92, 10, 15 + i) }
    latest.consultedAt = at(today, 0, 9, 40 + i)
    latest.responsibleId = admin.id
    latest.responsibleName = admin.fullName
    latest.previousConsultationId = previous.id
    license.lastCheckedAt = latest.consultedAt
    consultations.push(previous)
  })

  // Restaurante ABC: estava Regular, a consulta de hoje retornou Vencida → alteração detectada.
  const abc = companyByName('Restaurante ABC')
  const abcVisa = licenseOf(abc, 'vigilancia')
  const abcLatest = latestOf(abcVisa)
  const abcPrevious: LicenseConsultation = { ...abcLatest, id: uid(), situation: 'regular', consultedAt: at(today, -40, 14, 5) }
  abcLatest.consultedAt = at(today, 0, 8, 15)
  abcLatest.previousConsultationId = abcPrevious.id
  abcLatest.changeDetected = true
  abcVisa.lastCheckedAt = abcLatest.consultedAt
  consultations.push(abcPrevious)
  const abcChange = {
    id: uid(),
    companyLicenseId: abcVisa.id,
    companyId: abc.id,
    consultationId: abcLatest.id,
    previousConsultationId: abcPrevious.id,
    changes: [{ field: 'situation' as const, previous: 'regular', current: 'vencida' }],
    detectedAt: abcLatest.consultedAt,
  }

  // Alertas como se a rotina diária já tivesse rodado hoje.
  const overviews = buildCompanyOverviews({ companies, licenses, licenseTypes, sectors }, today, DEFAULT_SETTINGS)
  const drafts: AlertDraft[] = [
    changeAlertFor({
      companyId: abc.id,
      companyName: abc.legalName,
      companyLicenseId: abcVisa.id,
      licenseName: typeByCode.get('vigilancia')!.name,
      changes: abcChange.changes,
      consultationId: abcLatest.id,
      changeId: abcChange.id,
    }),
  ]
  for (const o of overviews) {
    if (!o.monitored) continue
    for (const e of o.licenses) {
      const draft = expirationAlertFor(o.company.id, o.company.legalName, e)
      if (draft) drafts.push(draft)
    }
  }
  const unread = new Set([
    abcChange.id,
    licenseOf(companyByName('Indústria ABC Metalúrgica LTDA'), 'bombeiros').id,
    licenseOf(companyByName('Delícias da Terra'), 'bombeiros').id,
  ])
  const alerts: Alert[] = drafts.map((d, i) => {
    const isUnread = (d.changeId && unread.has(d.changeId)) || (d.category !== 'alteracao_detectada' && d.companyLicenseId && unread.has(d.companyLicenseId))
    return {
      id: uid(),
      companyId: d.companyId,
      companyLicenseId: d.companyLicenseId,
      category: d.category,
      priority: d.priority,
      title: d.title,
      message: d.message,
      status: isUnread ? 'aberto' : 'lido',
      dedupeKey: d.dedupeKey,
      consultationId: d.consultationId ?? null,
      changeId: d.changeId ?? null,
      readAt: isUnread ? null : at(today, 0, 7, 30),
      resolvedAt: null,
      resolutionNote: null,
      notes: [],
      createdAt: at(today, 0, 6, i % 60),
    }
  })

  const documents: StoredDocument[] = (['alvara', 'vigilancia'] as const).map((code, i) => {
    const license = licenseOf(padaria, code)
    const type = typeByCode.get(code)!
    return {
      id: uid(),
      companyLicenseId: license.id,
      companyId: padaria.id,
      consultationId: license.lastConsultationId,
      documentType: code === 'alvara' ? 'Alvará' : 'Licença sanitária',
      name: `${type.name} ${today.slice(0, 4)}`,
      number: license.documentNumber,
      issuingAgency: code === 'alvara' ? 'Prefeitura de Teresina' : 'DIVISA',
      issuedAt: license.issuedAt,
      expiresAt: license.expiresAt,
      fileName: `${code}-${today.slice(0, 4)}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 182_000 + i * 41_000,
      storagePath: null,
      uploadedAt: at(today, -20 + i, 11, 10),
      uploadedBy: admin.id,
      uploadedByName: admin.fullName,
      archivedAt: null,
      dataUrl: null,
    }
  })

  const audit: AuditLog[] = [
    {
      id: uid(),
      occurredAt: at(today, 0, 8, 15),
      userId: team[2]!.id,
      userName: team[2]!.fullName,
      action: 'consulta_registrada',
      tableName: 'license_consultations',
      recordId: abcLatest.id,
      companyId: abc.id,
      oldValues: { situacao: 'regular' },
      newValues: { situacao: 'vencida' },
      origin: 'app',
    },
    {
      id: uid(),
      occurredAt: at(today, -3, 15, 2),
      userId: admin.id,
      userName: admin.fullName,
      action: 'aplicabilidade_alterada',
      tableName: 'company_licenses',
      recordId: licenseOf(padaria, 'ambiental').id,
      companyId: padaria.id,
      oldValues: { aplicabilidade: 'em_analise' },
      newValues: { aplicabilidade: 'nao_aplicavel' },
      origin: 'app',
    },
  ]

  return {
    version: MOCK_DB_VERSION,
    seededFor: today,
    currentUserId: admin.id,
    users: USERS.map((u) => ({ ...u })),
    sectors,
    licenseTypes,
    sectorLicenseRules,
    cnaes,
    cnaeSectorRules,
    cnaeLicenseRules,
    providers,
    settings: structuredClone(DEFAULT_SETTINGS),
    companies,
    licenses,
    consultations,
    changes: [abcChange],
    documents,
    alerts,
    notificationLogs: [],
    audit,
    ...createDemoSimulationData(licenseTypes),
  }
}
