/**
 * Gera supabase/seed.sql a partir de src/data/catalog-seed.ts (fonte única do catálogo inicial).
 * Uso: node scripts/generate-seed-sql.ts
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  CNAE_LICENSE_RULE_SEEDS,
  ANNEX_SEEDS,
  CNAE_SEEDS,
  DOCUMENT_SEEDS,
  LEGISLATION_SEEDS,
  LICENSE_TYPE_SEEDS,
  QUESTION_SEEDS,
  NOTIFICATION_TEMPLATE_SEEDS,
  PROVIDER_SEEDS,
  RISK_CLASSIFICATION_SEEDS,
  SECTOR_RULE_SEEDS,
  SECTOR_SEEDS,
} from '../src/data/catalog-seed.ts'
import { DEFAULT_SETTINGS } from '../src/domain/settings.ts'

const q = (v: string | number | boolean | null | undefined): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${v.replaceAll("'", "''")}'`
}

const lines: string[] = [
  '-- GERADO por scripts/generate-seed-sql.ts a partir de src/data/catalog-seed.ts — não edite à mão.',
  '-- Catálogo inicial (configuração). Não contém dados de clientes.',
  '',
  'insert into public.integration_providers (code, name, short_name, agency, status) values',
  PROVIDER_SEEDS.map((p) => `  (${q(p.code)}, ${q(p.name)}, ${q(p.shortName)}, ${q(p.agency)}, ${q(p.status)})`).join(',\n') +
    '\non conflict (code) do nothing;',
  '',
  'insert into public.sectors (slug, name, color, icon, cover_image_url, sort_order) values',
  SECTOR_SEEDS.map((s) => `  (${q(s.slug)}, ${q(s.name)}, ${q(s.color)}, ${q(s.icon)}, ${q(s.coverImageUrl)}, ${s.sortOrder})`).join(',\n') +
    '\non conflict (slug) do nothing;',
  '',
  'insert into public.license_types (code, name, short_name, agency, agency_scope, default_provider_code, has_expiration, sort_order) values',
  LICENSE_TYPE_SEEDS.map(
    (t) =>
      `  (${q(t.code)}, ${q(t.name)}, ${q(t.shortName)}, ${q(t.agency)}, ${q(t.agencyScope)}, ${q(t.defaultProviderCode)}, ${t.hasExpiration}, ${t.sortOrder})`,
  ).join(',\n') + '\non conflict (code) do nothing;',
  '',
  'insert into public.sector_license_rules (sector_id, license_type_id, default_applicability, show_in_table, sort_order, notes)',
  'select s.id, t.id, v.applicability::public.license_applicability, v.show_in_table, v.sort_order, v.notes',
  'from (values',
  SECTOR_RULE_SEEDS.map((r, i) => `  (${q(r.sector)}, ${q(r.license)}, ${q(r.applicability)}, ${r.showInTable}, ${i}, ${q(r.notes ?? null)})`).join(',\n'),
  ') as v(sector, license, applicability, show_in_table, sort_order, notes)',
  'join public.sectors s on s.slug = v.sector',
  'join public.license_types t on t.code = v.license',
  'on conflict (sector_id, license_type_id) do nothing;',
  '',
  'insert into public.cnaes (code, description) values',
  CNAE_SEEDS.map((c) => `  (${q(c.code)}, ${q(c.description)})`).join(',\n') + '\non conflict (code) do nothing;',
  '',
  'insert into public.cnae_sector_rules (cnae_id, sector_id, priority)',
  'select c.id, s.id, 1',
  'from (values',
  CNAE_SEEDS.map((c) => `  (${q(c.code)}, ${q(c.sector)})`).join(',\n'),
  ') as v(cnae, sector)',
  'join public.cnaes c on c.code = v.cnae',
  'join public.sectors s on s.slug = v.sector',
  'on conflict (cnae_id, sector_id) do nothing;',
  '',
  'insert into public.cnae_license_rules (cnae_id, license_type_id, applicability, notes)',
  'select c.id, t.id, v.applicability::public.license_applicability, v.notes',
  'from (values',
  CNAE_LICENSE_RULE_SEEDS.map((r) => `  (${q(r.cnae)}, ${q(r.license)}, ${q(r.applicability)}, ${q(r.notes)})`).join(',\n'),
  ') as v(cnae, license, applicability, notes)',
  'join public.cnaes c on c.code = v.cnae',
  'join public.license_types t on t.code = v.license',
  'on conflict (cnae_id, license_type_id) do nothing;',
  '',
  'insert into public.notification_templates (code, days_before, subject) values',
  NOTIFICATION_TEMPLATE_SEEDS.map((t) => `  (${q(t.code)}, ${t.daysBefore}, ${q(t.subject)})`).join(',\n') + '\non conflict (code) do nothing;',
  '',
  '-- Classificações de risco da Simulação. Normas e regras NÃO são pré-cadastradas: entram pelo painel ou por CSV.',
  'insert into public.risk_classifications (code, name, severity, tone) values',
  RISK_CLASSIFICATION_SEEDS.map((c) => `  (${q(c.code)}, ${q(c.name)}, ${c.severity}, ${q(c.tone)})`).join(',' + String.fromCharCode(10)) + String.fromCharCode(10) + 'on conflict (code) do nothing;',
  '',
  '',
  '-- Perguntas usadas pelas faixas de área/volume do Anexo I do Decreto nº 24.861/2023 (estrutura, não regra).',
  'insert into public.rule_questions (code, text, type, unit, help_text) values',
  QUESTION_SEEDS.map((x) => `  (${q(x.code)}, ${q(x.text)}, 'numero', ${q(x.unit)}, ${q(x.helpText)})`).join(',' + String.fromCharCode(10)) + String.fromCharCode(10) + 'on conflict (code) do nothing;',
  '',
  '-- Base legal de Teresina – PI conferida nos PDFs oficiais do DOM (biblioteca em legislacao/teresina): identificação das',
  '-- normas, anexos e documentos. Nenhuma regra, CNAE, condição ou vigência: o conteúdo entra pela importação revisada.',
  ...LEGISLATION_SEEDS.map((l) => {
    const parent = LEGISLATION_SEEDS.find((p) => p.key === l.parentKey)
    const parentId = parent
      ? `(select id from public.legislations where kind = ${q(parent.kind)} and number = ${q(parent.number)} and year = ${parent.year} and city = ${q(parent.city)})`
      : 'null'
    return [
      'insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)',
      `select ${q(l.kind)}, ${q(l.number)}, ${l.year}, ${q(l.normDate)}, ${q(l.title)}, ${q(l.issuingBody)}, ${q(l.level)}, ${q(l.uf)}, ${q(l.city)}, ${l.definesGeneralClassification}, ${parentId}, ${q(l.relation)}, ${q(l.officialUrl)}, ${q(l.notes)}`,
      `where not exists (select 1 from public.legislations where kind = ${q(l.kind)} and number = ${q(l.number)} and year = ${l.year} and city = ${q(l.city)});`,
    ].join(String.fromCharCode(10))
  }),
  '',
  'insert into public.legislation_annexes (legislation_id, code, title, kind, description, sort_order)',
  'select l.id, v.code, v.title, v.kind_annex::public.annex_kind, v.description, v.sort_order',
  'from (values',
  ANNEX_SEEDS.map((a) => {
    const l = LEGISLATION_SEEDS.find((x) => x.key === a.legislationKey)!
    return `  (${q(l.kind)}, ${q(l.number)}, ${l.year}, ${q(l.city)}, ${q(a.code)}, ${q(a.title)}, ${q(a.kind)}, ${q(a.description)}, ${a.sortOrder})`
  }).join(',' + String.fromCharCode(10)),
  ') as v(kind, number, year, city, code, title, kind_annex, description, sort_order)',
  'join public.legislations l on l.kind::text = v.kind and l.number = v.number and l.year = v.year and l.city = v.city',
  'on conflict (legislation_id, code) do nothing;',
  '',
  'insert into public.legislation_documents (legislation_id, title, kind, edition, publication_date, pages, official_url, file_url, file_name, sha256, size_bytes, downloaded_at, status, notes)',
  'select l.id, v.title, v.doc_kind::public.legislation_document_kind, v.edition, v.publication_date::date, v.pages, v.official_url, v.file_url, v.file_name, v.sha256, v.size_bytes, v.downloaded_at::date, v.status::public.legislation_document_status, v.notes',
  'from (values',
  DOCUMENT_SEEDS.map((d) => {
    const l = LEGISLATION_SEEDS.find((x) => x.key === d.legislationKey)!
    return `  (${q(l.kind)}, ${q(l.number)}, ${l.year}, ${q(l.city)}, ${q(d.title)}, ${q(d.kind)}, ${q(d.edition)}, ${q(d.publicationDate)}, ${q(d.pages)}, ${q(d.officialUrl)}, ${q(d.fileUrl)}, ${q(d.fileName)}, ${q(d.sha256)}, ${d.sizeBytes}, ${q(d.downloadedAt)}, ${q(d.status)}, ${q(d.notes)})`
  }).join(',' + String.fromCharCode(10)),
  ') as v(kind, number, year, city, title, doc_kind, edition, publication_date, pages, official_url, file_url, file_name, sha256, size_bytes, downloaded_at, status, notes)',
  'join public.legislations l on l.kind::text = v.kind and l.number = v.number and l.year = v.year and l.city = v.city',
  'on conflict (legislation_id, file_name) do nothing;',
  '',
  'insert into public.system_settings (key, value, description) values',
  [
    `  ('expiration_thresholds', ${q(JSON.stringify(DEFAULT_SETTINGS.expirationThresholds))}::jsonb, 'Faixas de vencimento em dias')`,
    `  ('regularity_weights', ${q(JSON.stringify(DEFAULT_SETTINGS.regularityWeights))}::jsonb, 'Pontos por situação no Índice de Regularidade')`,
    `  ('notification_schedule_days', ${q(JSON.stringify(DEFAULT_SETTINGS.notificationScheduleDays))}::jsonb, 'Dias antes do vencimento para avisar')`,
    `  ('monitoring_job', ${q(JSON.stringify(DEFAULT_SETTINGS.monitoringJob))}::jsonb, 'Rotina automática de monitoramento')`,
  ].join(',\n') + '\non conflict (key) do nothing;',
  '',
]

const out = fileURLToPath(new URL('../supabase/seed.sql', import.meta.url))
writeFileSync(out, lines.join('\n'), 'utf8')
console.log(`seed gerado em ${out}`)
