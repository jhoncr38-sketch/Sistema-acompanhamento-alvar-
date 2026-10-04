import type {
  AlertCategory,
  AlertPriority,
  AlertStatus,
  CompanyHealth,
  CompanyStatus,
  ComparableField,
  ConsultationType,
  ExpirationLevel,
  IntegrationStatus,
  LicenseApplicability,
  LicenseSituation,
  LicenseStatus,
  UserRole,
} from './types'

export const LICENSE_STATUS_LABEL: Record<LicenseStatus, string> = {
  regular: 'Regular',
  atencao: 'Atenção',
  vencida: 'Vencida',
  pendente: 'Pendente',
  em_renovacao: 'Em renovação',
  nao_aplicavel: 'Não aplicável',
  dispensada: 'Dispensada',
  em_analise: 'Em análise',
}

export const LICENSE_SITUATION_LABEL: Record<LicenseSituation, string> = {
  regular: 'Regular',
  vencida: 'Vencida',
  pendente: 'Pendente',
  em_renovacao: 'Em renovação',
  em_analise: 'Em análise',
}

export const APPLICABILITY_LABEL: Record<LicenseApplicability, string> = {
  aplicavel: 'Aplicável',
  nao_aplicavel: 'Não aplicável',
  dispensada: 'Dispensada',
  em_analise: 'Em análise',
}

export const EXPIRATION_LEVEL_LABEL: Record<ExpirationLevel, string> = {
  sem_validade: 'Sem validade',
  regular: 'Regular',
  atencao_preventiva: 'Atenção preventiva',
  atencao: 'Atenção',
  atencao_alta: 'Atenção alta',
  critico: 'Crítico',
  vencida: 'Vencida',
}

export const COMPANY_HEALTH_LABEL: Record<CompanyHealth, string> = {
  regular: 'Regular',
  atencao: 'Atenção',
  pendencia: 'Pendência',
}

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  ativa: 'Ativa',
  inativa: 'Inativa',
  em_implantacao: 'Em implantação',
}

export const CONSULTATION_TYPE_LABEL: Record<ConsultationType, string> = {
  automatica: 'Automática',
  manual: 'Manual',
}

export const ALERT_CATEGORY_LABEL: Record<AlertCategory, string> = {
  vencimento_proximo: 'Vencimento próximo',
  licenca_vencida: 'Licença vencida',
  alteracao_detectada: 'Alteração detectada',
  consulta_com_erro: 'Consulta com erro',
  documento_pendente: 'Documento pendente',
  renovacao_em_andamento: 'Renovação em andamento',
}

export const ALERT_PRIORITY_LABEL: Record<AlertPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
}

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  aberto: 'Não lido',
  lido: 'Lido',
  resolvido: 'Resolvido',
}

export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  pendente: 'Integração pendente',
  ativa: 'Ativa',
  inativa: 'Inativa',
  erro: 'Com erro',
}

export const ROLE_LABEL: Record<UserRole, string> = {
  administrador: 'Administrador',
  contador: 'Contador',
  colaborador: 'Colaborador',
  consulta: 'Consulta',
}

export const FIELD_LABEL: Record<ComparableField, string> = {
  situation: 'Situação',
  expiresAt: 'Validade',
  issuedAt: 'Emissão',
  documentNumber: 'Nº do documento',
  protocolNumber: 'Nº do protocolo',
}
