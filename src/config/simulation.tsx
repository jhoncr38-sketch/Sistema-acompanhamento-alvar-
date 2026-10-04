import { Building, FireExtinguisher, FlaskConical, ShieldCheck, Trees, type LucideIcon } from 'lucide-react'
import type { ClassificationTone, LicenseResultOutcome, SimulationStatus } from '@/domain/simulation/types'

/** Classes estáticas por tom (o Tailwind precisa enxergar os nomes completos). Mesma paleta do sistema. */
export interface ToneClasses {
  solid: string
  soft: string
  text: string
  border: string
  bar: string
}

export const TONE: Record<ClassificationTone, ToneClasses> = {
  green: { solid: 'bg-ok text-white', soft: 'bg-ok-soft', text: 'text-ok-ink', border: 'border-[#a6dfc4]', bar: 'bg-ok' },
  blue: { solid: 'bg-primary text-white', soft: 'bg-primary-soft', text: 'text-primary', border: 'border-primary-line', bar: 'bg-primary' },
  orange: { solid: 'bg-[#f5710f] text-white', soft: 'bg-[#fdebdc]', text: 'text-[#d95f0a]', border: 'border-[#f5c29b]', bar: 'bg-[#f5710f]' },
  red: { solid: 'bg-danger-ink text-white', soft: 'bg-danger-soft', text: 'text-danger-ink', border: 'border-[#f5a3b1]', bar: 'bg-danger-ink' },
  yellow: { solid: 'bg-[#f6c000] text-ink', soft: 'bg-warn-soft', text: 'text-warn-ink', border: 'border-[#efd27a]', bar: 'bg-[#f6c000]' },
  gray: { solid: 'bg-neutral text-white', soft: 'bg-neutral-soft', text: 'text-ink-soft', border: 'border-[#d5dbe4]', bar: 'bg-neutral' },
}

export const STATUS_TONE: Record<Exclude<SimulationStatus, 'classificada'>, ClassificationTone> = {
  condicionada: 'yellow',
  necessita_analise: 'yellow',
  regra_nao_cadastrada: 'gray',
}

/** Mesmas cores do exemplo aprovado: dispensado em azul, análise separada em amarelo. */
export const LICENSE_OUTCOME_TONE: Record<LicenseResultOutcome, ClassificationTone> = {
  dispensada: 'blue',
  exigivel: 'orange',
  necessita_analise: 'yellow',
  analise_separada: 'yellow',
  sem_regra: 'gray',
}

const LICENSE_ICONS: Record<string, LucideIcon> = {
  alvara: Building,
  vigilancia: FlaskConical,
  ambiental: Trees,
  bombeiros: FireExtinguisher,
}

export function licenseIcon(code: string): LucideIcon {
  return LICENSE_ICONS[code] ?? ShieldCheck
}

/** Localidade fictícia usada pela norma de exemplo do modo demonstração (não é legislação real). */
export const DEMO_CITY = 'Cidade Exemplo'

export const SIMULATION_DISCLAIMER =
  'Esta ferramenta realiza uma simulação com base nas regras e legislações cadastradas no sistema. O resultado deve ser validado quando houver situações específicas, alterações legislativas ou exigências particulares do órgão competente.'
