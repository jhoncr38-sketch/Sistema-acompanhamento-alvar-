import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useDataSource } from '@/app/data-context'
import type { LegislationPackage } from '@/domain/simulation/legislation-package'

export function useRuleBase() {
  const ds = useDataSource()
  return useQuery({ queryKey: ['rule-base'], queryFn: () => ds.simulation.getRuleBase(), staleTime: 60_000 })
}

export function useSimulationRuns(filter: { companyId?: string; limit?: number } = {}) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['simulation-runs', filter], queryFn: () => ds.simulation.listRuns(filter) })
}

export function useSimulationRun(id: string | undefined) {
  const ds = useDataSource()
  return useQuery({ queryKey: ['simulation-run', id], queryFn: () => ds.simulation.getRun(id!), enabled: !!id })
}

export function useImportBatches() {
  const ds = useDataSource()
  return useQuery({ queryKey: ['import-batches'], queryFn: () => ds.simulation.listImportBatches() })
}

/** Pacote de dados extraídos dos documentos oficiais (arquivo estático da biblioteca de legislação). */
export function useLegislationPackage(url: string | null) {
  return useQuery({
    queryKey: ['legislation-package', url],
    enabled: !!url,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<LegislationPackage> => {
      const response = await fetch(url!)
      if (!response.ok) throw new Error(`Pacote de dados não encontrado (${response.status}).`)
      return (await response.json()) as LegislationPackage
    },
  })
}

export function useInvalidateSimulation() {
  const client = useQueryClient()
  return useMemo(() => {
    const invalidate = (...keys: string[]) => Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })))
    return {
      /** Normas, regras, perguntas e classificações (regras novas podem incluir CNAEs no catálogo). */
      rules: () => invalidate('rule-base', 'import-batches', 'catalog', 'audit'),
      runs: () => invalidate('simulation-runs', 'simulation-run'),
      afterApply: () => invalidate('simulation-runs', 'simulation-run', 'licenses', 'audit'),
    }
  }, [client])
}
