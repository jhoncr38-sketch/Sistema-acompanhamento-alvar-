import { brand } from '@/config/brand'
import { cn } from '@/lib/cn'

/** Logo do menu lateral. Usa o arquivo oficial quando `brand.logoUrl` estiver definido. */
export function BrandLogo({ className }: { className?: string }) {
  if (brand.logoUrl) {
    return <img src={brand.logoUrl} alt={brand.productName} className={cn('h-14 w-auto', className)} />
  }
  return (
    <div className={cn('flex flex-col items-center leading-none select-none', className)} role="img" aria-label={`${brand.logoMark} ${brand.logoCaption}`}>
      <span
        className="bg-gradient-to-b from-[#3fd0f7] via-[#2a9cf6] to-[#1e63f0] bg-clip-text text-[56px] leading-[0.95] font-black tracking-[-0.07em] text-transparent [-webkit-text-stroke:0.4px_rgb(120_200_255/0.35)]"
        style={{ filter: 'drop-shadow(0 2px 6px rgb(30 120 255 / 0.35))' }}
      >
        {brand.logoMark}
      </span>
      <span className="mt-[1px] text-[17px] font-extrabold tracking-[0.03em] text-white">{brand.logoCaption}</span>
    </div>
  )
}

/** Mascote JR com balão de fala (texto em HTML para ficar nítido e acessível). */
export function Mascot({ className }: { className?: string }) {
  return (
    <div className={cn('relative h-[212px] w-full select-none', className)}>
      <img src={brand.mascotUrl} alt="" aria-hidden className="absolute bottom-0 left-0 h-[209px] w-[114px] object-contain" />
      <p className="absolute right-[13px] bottom-[34px] w-[100px] rounded-xl border border-[#1f4c8a] bg-[#0d2f5c]/90 px-3 py-2.5 text-[12.5px] leading-[1.42] text-white shadow-[0_6px_18px_rgb(0_0_0/0.25)]">
        {brand.mascotMessage}
      </p>
    </div>
  )
}
