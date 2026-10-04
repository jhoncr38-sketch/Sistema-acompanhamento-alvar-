import { z } from 'zod'
import { UFS } from '@/config/ufs'
import type { CompanyInput } from '@/data/types'
import { isCnpjShapeValid, normalizeCnpj } from '@/domain/cnpj'
import { normalizeCnae } from '@/domain/format'
import type { Company } from '@/domain/types'

export { UFS }

const cnae = (v: string) => !v.trim() || normalizeCnae(v).length === 7

export function parseCnaeList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => normalizeCnae(s))
    .filter((s) => s.length > 0)
}

export const companySchema = z.object({
  legalName: z.string().trim().min(2, 'Informe a razão social.'),
  tradeName: z.string().trim(),
  cnpj: z.string().refine(isCnpjShapeValid, 'Informe o CNPJ completo (14 caracteres).'),
  mainCnae: z.string().refine(cnae, 'CNAE com 7 dígitos (ex.: 5611-2/01).'),
  secondaryCnaes: z
    .string()
    .refine((v) => parseCnaeList(v).every((c) => c.length === 7), 'Cada CNAE deve ter 7 dígitos, separados por vírgula.'),
  sectorId: z.string().min(1, 'Selecione o setor.'),
  street: z.string().trim(),
  number: z.string().trim(),
  complement: z.string().trim(),
  district: z.string().trim(),
  city: z.string().trim().min(2, 'Informe o município.'),
  state: z.enum(UFS, { message: 'Selecione a UF.' }),
  zipCode: z.string().trim(),
  phone: z.string().trim(),
  email: z
    .string()
    .trim()
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'E-mail inválido.'),
  responsibleName: z.string().trim(),
  notes: z.string(),
  status: z.enum(['ativa', 'inativa', 'em_implantacao']),
})

export type CompanyFormValues = z.infer<typeof companySchema>

export function emptyCompanyValues(sectorId = ''): CompanyFormValues {
  return {
    legalName: '',
    tradeName: '',
    cnpj: '',
    mainCnae: '',
    secondaryCnaes: '',
    sectorId,
    street: '',
    number: '',
    complement: '',
    district: '',
    city: 'Teresina',
    state: 'PI',
    zipCode: '',
    phone: '',
    email: '',
    responsibleName: '',
    notes: '',
    status: 'ativa',
  }
}

export function companyToValues(c: Company): CompanyFormValues {
  return {
    legalName: c.legalName,
    tradeName: c.tradeName,
    cnpj: c.cnpj,
    mainCnae: c.mainCnae ?? '',
    secondaryCnaes: c.secondaryCnaes.join(', '),
    sectorId: c.sectorId,
    street: c.address.street,
    number: c.address.number,
    complement: c.address.complement,
    district: c.address.district,
    city: c.address.city,
    state: (UFS as readonly string[]).includes(c.address.state) ? (c.address.state as CompanyFormValues['state']) : 'PI',
    zipCode: c.address.zipCode,
    phone: c.phone,
    email: c.email,
    responsibleName: c.responsibleName,
    notes: c.notes,
    status: c.status,
  }
}

export function valuesToInput(v: CompanyFormValues, photoUrl: string | null): CompanyInput {
  return {
    legalName: v.legalName,
    tradeName: v.tradeName,
    cnpj: normalizeCnpj(v.cnpj),
    sectorId: v.sectorId,
    mainCnae: v.mainCnae.trim() ? normalizeCnae(v.mainCnae) : null,
    secondaryCnaes: parseCnaeList(v.secondaryCnaes),
    address: {
      street: v.street,
      number: v.number,
      complement: v.complement,
      district: v.district,
      city: v.city,
      state: v.state,
      zipCode: v.zipCode,
    },
    phone: v.phone,
    email: v.email,
    responsibleName: v.responsibleName,
    notes: v.notes,
    status: v.status,
    photoUrl,
  }
}
