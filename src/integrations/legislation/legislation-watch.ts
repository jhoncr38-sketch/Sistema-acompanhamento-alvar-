import type { ISODate } from '@/domain/types'

/**
 * Verificação de nova legislação — SOMENTE ARQUITETURA.
 *
 * Um provedor por fonte oficial (Diário Oficial do município, portal de legislação…). A implementação futura deverá
 * usar canal oficial autorizado (API, RSS, aviso por e-mail do órgão) — sem raspagem automática indiscriminada.
 * Um documento encontrado nunca vira regra automaticamente: entra na biblioteca como PENDENTE_CONFERÊNCIA e segue
 * DOCUMENTO → EXTRAÇÃO → COMPARAÇÃO → REVISÃO → APROVAÇÃO DO ADMINISTRADOR → PUBLICAÇÃO.
 */
export interface LegislationCandidate {
  title: string
  publicationDate: ISODate | null
  officialUrl: string
  /** Norma cadastrada que o documento parece alterar, quando identificável. */
  relatedNorm: string | null
}

export type LegislationWatchResult =
  | { status: 'integracao_pendente'; message: string }
  | { status: 'ok'; checkedAt: string; candidates: LegislationCandidate[] }

export interface LegislationWatchProvider {
  readonly id: string
  readonly label: string
  readonly uf: string
  readonly city: string
  /** Página oficial para conferência manual enquanto a verificação automática não existe. */
  readonly officialSourceUrl: string
  readonly available: boolean
  check(since: ISODate | null): Promise<LegislationWatchResult>
}

export const teresinaDomWatch: LegislationWatchProvider = {
  id: 'teresina-dom',
  label: 'Diário Oficial do Município de Teresina (DOM)',
  uf: 'PI',
  city: 'Teresina',
  officialSourceUrl: 'https://dom.pmt.pi.gov.br/lista_diario.php',
  available: false,
  async check() {
    return {
      status: 'integracao_pendente',
      message:
        'INTEGRAÇÃO PENDENTE — a verificação automática de novas publicações não está ativa (sem raspagem do Diário Oficial). Confira manualmente no DOM e registre o documento na biblioteca.',
    }
  },
}

export const LEGISLATION_WATCH_PROVIDERS: LegislationWatchProvider[] = [teresinaDomWatch]
