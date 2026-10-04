import { PawPrint, Scale, Stethoscope, Store, Utensils } from 'lucide-react'
import type { ComponentType } from 'react'
import { SolidFactoryIcon } from '@/components/ui/SolidIcons'
import type { SectorColor, SectorIcon } from '@/domain/types'

/** Classes estáticas por cor de setor (o Tailwind precisa enxergar os nomes completos). */
export interface SectorTheme {
  button: string
  text: string
  soft: string
  ring: string
  banner: string
  circle: string
}

export const SECTOR_THEMES: Record<SectorColor, SectorTheme> = {
  orange: {
    button: 'bg-sector-orange hover:bg-[#dc5c12]',
    text: 'text-sector-orange',
    soft: 'bg-[#fdebdc]',
    ring: 'ring-[#f0a477]',
    banner: 'bg-[#e8620f]',
    circle: 'bg-[#ea5a0b]/95',
  },
  green: {
    button: 'bg-sector-green hover:bg-[#0f8a4f]',
    text: 'text-sector-green',
    soft: 'bg-[#dcf3e8]',
    ring: 'ring-[#7fcca6]',
    banner: 'bg-[#16a083]',
    circle: 'bg-[#1cb48b]/90',
  },
  purple: {
    button: 'bg-sector-purple hover:bg-[#634596]',
    text: 'text-sector-purple',
    soft: 'bg-[#ece5f7]',
    ring: 'ring-[#b39ddb]',
    banner: 'bg-[#563996]',
    circle: 'bg-[#5d3ea0]/95',
  },
  blue: {
    button: 'bg-sector-blue hover:bg-[#0f5ec0]',
    text: 'text-sector-blue',
    soft: 'bg-[#dfeafc]',
    ring: 'ring-[#8db6ef]',
    banner: 'bg-[#1c5fc6]',
    circle: 'bg-[#1a6ae0]/95',
  },
  pink: {
    button: 'bg-sector-pink hover:bg-[#d81b6e]',
    text: 'text-sector-pink',
    soft: 'bg-[#fde2ee]',
    ring: 'ring-[#f490bd]',
    banner: 'bg-[#f04a95]',
    circle: 'bg-[#ec2a85]/95',
  },
  slate: {
    button: 'bg-slate-600 hover:bg-slate-700',
    text: 'text-slate-600',
    soft: 'bg-slate-100',
    ring: 'ring-slate-300',
    banner: 'bg-slate-600',
    circle: 'bg-slate-700/95',
  },
}

export type SectorIconComponent = ComponentType<{ className?: string; strokeWidth?: number }>

export const SECTOR_ICONS: Record<SectorIcon, SectorIconComponent> = {
  utensils: Utensils,
  stethoscope: Stethoscope,
  scale: Scale,
  factory: SolidFactoryIcon,
  paw: PawPrint,
  store: Store,
}

export function sectorTheme(color: SectorColor | undefined): SectorTheme {
  return SECTOR_THEMES[color ?? 'slate']
}
