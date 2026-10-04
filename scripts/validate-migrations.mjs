/**
 * Valida as migrations do Supabase num PostgreSQL em memória (PGlite), sem Docker.
 * Cria stubs mínimos de `auth` e `storage`, aplica migrations + seed e testa RLS,
 * imutabilidade do histórico, concorrência, deduplicação de alertas, auditoria, busca e as
 * regras, o versionamento, a base legal (anexos, alterações, importação revisada) e o histórico da
 * Simulação de Licenciamento.
 * Uso: npm run db:validate
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'

const root = fileURLToPath(new URL('..', import.meta.url))
const db = await PGlite.create({ extensions: { pg_trgm, btree_gist } })

let failures = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg, err) => {
  failures += 1
  console.log(`  ✗ ${msg}${err ? `\n      ${err.message ?? err}` : ''}`)
}
async function expectOk(msg, fn) {
  try {
    await fn()
    ok(msg)
  } catch (err) {
    fail(msg, err)
  }
}
async function expectError(msg, fn, pattern) {
  try {
    await fn()
    fail(`${msg} (deveria falhar)`)
  } catch (err) {
    if (pattern && !pattern.test(err.message)) fail(`${msg} (erro inesperado)`, err)
    else ok(msg)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

// --- stubs do Supabase -------------------------------------------------
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)

// --- migrations + seed -----------------------------------------------
console.log('Migrations')
const dir = join(root, 'supabase', 'migrations')
for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
  await expectOk(file, () => db.exec(readFileSync(join(dir, file), 'utf8')))
}
await expectOk('seed.sql', () => db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8')))
if (failures) {
  console.log(`\n${failures} falha(s) ao aplicar migrations.`)
  process.exit(1)
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const count = async (sql, params) => Number(Object.values(await one(sql, params))[0])

console.log('\nCatálogo')
await expectOk('5 setores, 11 licenças, 8 fontes pendentes, 17 CNAEs, 4 configurações', async () => {
  assert((await count('select count(*) from public.sectors')) === 5, 'setores')
  assert((await count('select count(*) from public.license_types')) === 11, 'licenças')
  assert((await count("select count(*) from public.integration_providers where status = 'pendente'")) === 8, 'fontes')
  assert((await count('select count(*) from public.cnaes')) === 17, 'cnaes')
  assert((await count('select count(*) from public.system_settings')) === 4, 'configurações')
})

// --- usuários ----------------------------------------------------------
const ADMIN = '00000000-0000-4000-8000-000000000001'
const COLAB = '00000000-0000-4000-8000-000000000002'
const READER = '00000000-0000-4000-8000-000000000003'
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${ADMIN}', 'admin@exemplo.com.br', '{"full_name":"Admin Teste"}'),
    ('${COLAB}', 'colab@exemplo.com.br', '{"full_name":"Colaborador Teste"}'),
    ('${READER}', 'leitor@exemplo.com.br', '{}');
`)

async function as(userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`)
  }
}

console.log('\nPerfis')
await expectOk('novo usuário entra como "consulta"', async () => {
  assert((await one('select role from public.profiles where id = $1', [READER])).role === 'consulta', 'perfil')
})
await expectOk('primeiro administrador definido via SQL (sem usuário logado)', async () => {
  await db.exec(`update public.profiles set role = 'administrador' where id = '${ADMIN}'`)
  await db.exec(`update public.profiles set role = 'colaborador' where id = '${COLAB}'`)
})
await expectError('colaborador não altera o próprio perfil', () => as(COLAB, () => db.exec(`update public.profiles set role = 'administrador' where id = '${COLAB}'`)), /próprio perfil/)
await expectOk('colaborador não altera perfil de outro', async () => {
  await as(COLAB, () => db.exec(`update public.profiles set role = 'administrador' where id = '${READER}'`)).catch(() => undefined)
  assert((await one('select role from public.profiles where id = $1', [READER])).role === 'consulta', 'perfil alterado')
})

const sector = (await one("select id from public.sectors where slug = 'restaurante-padaria'")).id
const alvara = (await one("select id from public.license_types where code = 'alvara'")).id
const bombeiros = (await one("select id from public.license_types where code = 'bombeiros'")).id

console.log('\nRLS')
await expectError('perfil Consulta não cadastra empresa', () =>
  as(READER, () =>
    db.query(`select public.create_company($1::jsonb, '5611201', '{}', '[]'::jsonb)`, [
      JSON.stringify({ legal_name: 'Teste LTDA', cnpj: '11222333000181', sector_id: sector, city: 'Teresina', state: 'PI' }),
    ]),
  ),
  /row-level security/,
)

let companyId
await expectOk('colaborador cadastra empresa com CNAEs e licenças (transação única)', async () => {
  const row = await as(COLAB, () =>
    one(`select * from public.create_company($1::jsonb, '5611201', '{5611203}', $2::jsonb)`, [
      JSON.stringify({ legal_name: 'Padaria Teste LTDA', cnpj: '11222333000181', sector_id: sector, city: 'Teresina', state: 'PI' }),
      JSON.stringify([
        { license_type_id: alvara, applicability: 'aplicavel', provider_code: 'slic' },
        { license_type_id: bombeiros, applicability: 'aplicavel', provider_code: 'cbmepi' },
      ]),
    ]),
  )
  companyId = row.id
  assert((await count('select count(*) from public.company_licenses where company_id = $1', [companyId])) === 2, 'licenças')
  assert((await count('select count(*) from public.company_cnaes where company_id = $1 and is_primary', [companyId])) === 1, 'cnae principal')
})

await expectError('CNPJ duplicado é recusado', () =>
  as(COLAB, () =>
    db.query(`select public.create_company($1::jsonb, null, '{}', '[]'::jsonb)`, [
      JSON.stringify({ legal_name: 'Outra LTDA', cnpj: '11222333000181', sector_id: sector, city: 'Teresina', state: 'PI' }),
    ]),
  ),
  /duplicate key|unique/,
)

await expectOk('colaborador não altera configurações críticas (RLS filtra)', async () => {
  await as(COLAB, () => db.exec(`update public.system_settings set value = '{}' where key = 'expiration_thresholds'`))
  const v = (await one("select value from public.system_settings where key = 'expiration_thresholds'")).value
  assert(v.preventiveDays === 60, 'valor alterado indevidamente')
})
await expectOk('administrador altera configurações', async () => {
  await as(ADMIN, () => db.exec(`update public.system_settings set value = jsonb_set(value, '{criticalDays}', '5') where key = 'expiration_thresholds'`))
  const v = (await one("select value from public.system_settings where key = 'expiration_thresholds'")).value
  assert(v.criticalDays === 5, 'não alterou')
})

console.log('\nHistórico de consultas')
const license = (await one('select id from public.company_licenses where company_id = $1 and license_type_id = $2', [companyId, bombeiros])).id
const consultation = (id, situation, expires, changed = false) =>
  JSON.stringify({
    id,
    company_license_id: license,
    consulted_at: new Date().toISOString(),
    type: 'manual',
    outcome: 'sucesso',
    situation,
    expires_at: expires,
    provider_code: 'cbmepi',
    source_label: 'CBMEPI',
    responsible_name: 'Colaborador Teste',
    change_detected: changed,
  })
const update = (situation, expires) =>
  JSON.stringify({ situation, expires_at: expires, issued_at: null, document_number: 'CBM-1', protocol_number: null, provider_code: 'cbmepi' })
const C1 = '10000000-0000-4000-8000-000000000001'
const C2 = '10000000-0000-4000-8000-000000000002'
const CH = '20000000-0000-4000-8000-000000000001'

await expectOk('primeira consulta grava histórico e atualiza a licença', async () => {
  await as(COLAB, () =>
    db.query('select public.record_consultation($1::jsonb, null, $2::jsonb, $3::jsonb, null, null)', [consultation(C1, 'regular', '2026-11-20'), update('regular', '2026-11-20'), '[]']),
  )
  const l = await one('select situation, expires_at::text, last_consultation_id from public.company_licenses where id = $1', [license])
  assert(l.situation === 'regular' && l.expires_at === '2026-11-20' && l.last_consultation_id === C1, JSON.stringify(l))
})

await expectOk('nova consulta com alteração: registro novo + alteração + alerta', async () => {
  const change = JSON.stringify({ id: CH, changes: [{ field: 'situation', previous: 'regular', current: 'vencida' }] })
  const alerts = JSON.stringify([
    { company_id: companyId, company_license_id: license, category: 'alteracao_detectada', priority: 'alta', title: 'Alteração detectada — Bombeiros', message: 'Regular → Vencida', consultation_id: C2, change_id: CH },
  ])
  await as(COLAB, () =>
    db.query('select public.record_consultation($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, null, $5)', [consultation(C2, 'vencida', '2026-11-20', true), change, update('vencida', '2026-11-20'), alerts, C1]),
  )
  assert((await count('select count(*) from public.license_consultations where company_license_id = $1', [license])) === 2, 'histórico')
  assert((await one('select previous_consultation_id from public.license_consultations where id = $1', [C2])).previous_consultation_id === C1, 'anterior')
  assert((await count('select count(*) from public.license_changes where consultation_id = $1', [C2])) === 1, 'alteração')
  assert((await count("select count(*) from public.alerts where change_id = $1", [CH])) === 1, 'alerta')
  assert((await one('select situation from public.license_consultations where id = $1', [C1])).situation === 'regular', 'anterior preservado')
})

await expectError('gravação concorrente é recusada', () =>
  as(COLAB, () => db.query('select public.record_consultation($1::jsonb, null, null, null, null, $2)', [consultation(crypto.randomUUID(), 'regular', '2027-01-01'), C1])),
  /CONCURRENT_UPDATE/,
)

await expectOk('equipe não consegue editar consulta antiga (RLS)', async () => {
  await as(COLAB, () => db.exec(`update public.license_consultations set situation = 'regular' where id = '${C2}'`))
  assert((await one('select situation from public.license_consultations where id = $1', [C2])).situation === 'vencida', 'alterou')
})
await expectError('nem o dono do banco altera o histórico (trigger)', () => db.exec(`delete from public.license_consultations where id = '${C1}'`), /Histórico imutável/)

console.log('\nAlertas, auditoria e busca')
await expectOk('alerta com mesma dedupe_key não duplica enquanto aberto', async () => {
  const a = JSON.stringify([{ company_id: companyId, company_license_id: license, category: 'licenca_vencida', priority: 'critica', title: 'x', message: 'y', dedupe_key: `vencida:${license}` }])
  await as(COLAB, () => db.query('select * from public.create_alerts($1::jsonb)', [a]))
  await as(COLAB, () => db.query('select * from public.create_alerts($1::jsonb)', [a]))
  assert((await count('select count(*) from public.alerts where dedupe_key = $1', [`vencida:${license}`])) === 1, 'duplicou')
})
await expectOk('auditoria registra usuário, empresa e origem', async () => {
  const row = await one("select user_name, company_id, origin from public.audit_logs where table_name = 'companies' and action = 'insert' and record_id = $1", [companyId])
  assert(row?.user_name === 'Colaborador Teste' && row.company_id === companyId && row.origin === 'app', JSON.stringify(row))
})
await expectOk('auditoria guarda só os campos alterados', async () => {
  await as(COLAB, () => db.exec(`update public.company_licenses set applicability = 'em_analise' where id = '${license}'`))
  const row = await one("select old_values, new_values from public.audit_logs where table_name = 'company_licenses' and action = 'update' order by id desc limit 1")
  assert(JSON.stringify(row.new_values) === '{"applicability":"em_analise"}', JSON.stringify(row))
})
await expectError('perfil Consulta não lê auditoria', async () => {
  const n = await as(READER, () => count('select count(*) from public.audit_logs'))
  if (n === 0) throw new Error('sem acesso')
}, /sem acesso/)
await expectOk('busca global encontra por nome, CNPJ e nº de documento', async () => {
  const byName = await as(READER, () => db.query("select * from public.global_search('padaria teste')"))
  const byCnpj = await as(READER, () => db.query("select * from public.global_search('11.222.333')"))
  const byDoc = await as(READER, () => db.query("select * from public.global_search('CBM-1')"))
  assert(byName.rows.length >= 1 && byCnpj.rows.length >= 1 && byDoc.rows.some((r) => r.kind === 'licenca'), 'sem resultados')
})
await expectError('empresa com histórico não pode ser excluída', () => as(ADMIN, () => db.exec(`delete from public.companies where id = '${companyId}'`)), /foreign key|violates/)

console.log('\nSimulação de Licenciamento')
const classA = (await one("select id from public.risk_classifications where code = 'baixo_risco_a'")).id
const classB = (await one("select id from public.risk_classifications where code = 'baixo_risco_b'")).id
const legislationJson = JSON.stringify({ kind: 'decreto', number: '000', year: 2024, title: 'Norma de teste (fictícia)', level: 'municipal', uf: 'PI', city: 'Cidade Teste' })
const insertLegislation = `insert into public.legislations (kind, number, year, title, level, uf, city)
  select (j->>'kind')::public.legislation_kind, j->>'number', (j->>'year')::int, j->>'title', (j->>'level')::public.jurisdiction_level, j->>'uf', j->>'city'
  from (select $1::jsonb as j) x returning id`

await expectOk('seed traz as classificações, as perguntas das faixas e a base legal de Teresina com os documentos (sem versões nem regras)', async () => {
  assert((await count('select count(*) from public.risk_classifications')) === 9, 'classificações')
  assert((await count("select count(*) from public.rule_questions where code in ('area_ha', 'area_m2', 'volume_m3')")) === 3, 'perguntas')
  assert((await count("select count(*) from public.legislations where city = 'Teresina'")) === 5, 'normas de Teresina')
  assert((await count('select count(*) from public.legislation_annexes')) === 3, 'anexos I, II e III')
  assert((await count("select count(*) from public.legislations where relation = 'altera' and parent_legislation_id is not null")) === 3, 'normas de alteração')
  assert((await count("select count(*) from public.legislation_documents where status = 'oficial_confirmado' and length(sha256) = 64 and file_url like '/legislacao/teresina/%'")) === 7, 'documentos')
  assert((await count('select count(*) from public.legislation_versions')) === 0, 'versões')
  assert((await count('select count(*) from public.cnae_rules')) === 0, 'regras')
})
await expectOk('seed é idempotente (rodar de novo não duplica normas nem anexos)', async () => {
  await db.exec(readFileSync(join(root, 'supabase', 'seed.sql'), 'utf8'))
  assert((await count('select count(*) from public.legislations')) === 5, 'normas')
  assert((await count('select count(*) from public.legislation_annexes')) === 3, 'anexos')
  assert((await count('select count(*) from public.legislation_documents')) === 7, 'documentos')
})
await expectError('colaborador não cadastra legislação (somente administrador)', () => as(COLAB, () => db.query(insertLegislation, [legislationJson])), /row-level security/)

let legislationId, v1, v2, questionId, ruleId
await expectOk('administrador cadastra norma, versão e pergunta', async () => {
  legislationId = (await as(ADMIN, () => db.query(insertLegislation, [legislationJson]))).rows[0].id
  v1 = (
    await as(ADMIN, () =>
      one('select * from public.save_legislation_version($1::jsonb)', [JSON.stringify({ legislation_id: legislationId, label: 'Redação original', valid_from: '2024-01-01', highest_risk_prevails: true })]),
    )
  ).id
  questionId = (await as(ADMIN, () => one("insert into public.rule_questions (code, text, type, unit) values ('area_teste_m2', 'Área utilizada', 'numero', 'm²') returning id"))).id
})
await expectError(
  'norma municipal sem município é recusada',
  () => as(ADMIN, () => db.exec("insert into public.legislations (kind, number, year, title, level, uf) values ('decreto', '1', 2024, 'x', 'municipal', 'PI')")),
  /check constraint/,
)
await expectOk('regra com condição é gravada e o CNAE entra no catálogo', async () => {
  const rule = {
    legislation_version_id: v1,
    cnae_code: '9999999',
    cnae_description: 'CNAE de teste',
    classification_id: classA,
    else_classification_id: classB,
    article: 'Art. 1º',
    annex: 'Anexo I',
    description: 'Regra de teste',
    conditions: [{ question_id: questionId, operator: 'lte', value: 200 }],
  }
  ruleId = (await as(ADMIN, () => one('select public.save_cnae_rule($1::jsonb) as id', [JSON.stringify(rule)]))).id
  assert((await count('select count(*) from public.rule_conditions where rule_id = $1', [ruleId])) === 1, 'condição')
  assert((await one("select description from public.cnaes where code = '9999999'")).description === 'CNAE de teste', 'catálogo')
  await as(ADMIN, () => db.query('select public.save_cnae_rule($1::jsonb)', [JSON.stringify({ ...rule, id: ruleId, conditions: [{ question_id: questionId, operator: 'lte', value: 250 }] })]))
  assert((await count('select count(*) from public.cnae_rules')) === 1, 'duplicou regra ao editar')
  assert((await one('select value from public.rule_conditions where rule_id = $1', [ruleId])).value === 250, 'condição não atualizada')
})
await expectOk('efeito da classificação na licença (por norma)', () =>
  as(ADMIN, () => db.query("insert into public.license_rules (legislation_version_id, classification_id, license_type_id, outcome) values ($1, $2, $3, 'dispensada')", [v1, classA, alvara])),
)
await expectError(
  'versões ativas da mesma norma não podem se sobrepor',
  () => as(ADMIN, () => db.query('select public.save_legislation_version($1::jsonb)', [JSON.stringify({ legislation_id: legislationId, label: 'Sobreposta', valid_from: '2025-06-01' })])),
  /legislation_versions_no_overlap|exclusion/,
)
await expectOk('nova versão encerra a anterior na véspera e copia as regras (nada é apagado)', async () => {
  v2 = (
    await as(ADMIN, () =>
      one('select * from public.save_legislation_version($1::jsonb, $2, $3)', [JSON.stringify({ legislation_id: legislationId, label: 'Redação de 2026', valid_from: '2026-01-01' }), v1, v1]),
    )
  ).id
  assert((await one('select valid_to::text from public.legislation_versions where id = $1', [v1])).valid_to === '2025-12-31', 'vigência anterior')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1', [v2])) === 1, 'regras copiadas')
  assert((await count('select count(*) from public.rule_conditions c join public.cnae_rules r on r.id = c.rule_id where r.legislation_version_id = $1', [v2])) === 1, 'condições copiadas')
  assert((await count('select count(*) from public.license_rules where legislation_version_id = $1', [v2])) === 1, 'efeitos copiados')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1 and active', [v1])) === 1, 'regra antiga preservada')
})
await expectOk('vigência por data: cada data encontra exatamente uma versão', async () => {
  const at = async (d) =>
    (
      await db.query('select label from public.legislation_versions where legislation_id = $1 and active and valid_from <= $2::date and (valid_to is null or valid_to >= $2::date)', [legislationId, d])
    ).rows.map((r) => r.label)
  assert((await at('2025-12-31')).join() === 'Redação original', '2025')
  assert((await at('2026-10-04')).join() === 'Redação de 2026', '2026')
  assert((await at('2023-12-31')).length === 0, 'antes da vigência')
})
await expectOk('importação em lote desativa (não exclui) as regras substituídas', async () => {
  const rules = [
    { cnae_code: '9999999', classification_id: classB, description: 'Importada', conditions: [] },
    { cnae_code: '8888888', cnae_description: 'Outro CNAE de teste', classification_id: classA, conditions: [{ question_id: questionId, operator: 'lte', value: 100 }] },
  ]
  const n = (await as(ADMIN, () => one('select public.import_cnae_rules($1, $2::jsonb, true) as n', [v2, JSON.stringify(rules)]))).n
  assert(n === 2, 'quantidade')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1', [v2])) === 3, 'total')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1 and active', [v2])) === 2, 'ativas')
})
await expectOk('colaborador não altera regras (RLS filtra)', async () => {
  await as(COLAB, () => db.exec(`update public.cnae_rules set active = false where id = '${ruleId}'`))
  assert((await one('select active from public.cnae_rules where id = $1', [ruleId])).active === true, 'alterou')
})

console.log('\nBase legal')
let annexII, areaRuleId
await expectOk('administrador cadastra anexo da norma; colaborador não', async () => {
  annexII = (await as(ADMIN, () => one("insert into public.legislation_annexes (legislation_id, code, title, kind) values ($1, 'II', 'Baixo Risco A', 'baixo_risco_a') returning id", [legislationId]))).id
  let denied = false
  try {
    await as(COLAB, () => db.query("insert into public.legislation_annexes (legislation_id, code, title) values ($1, 'IX', 'x')", [legislationId]))
  } catch (err) {
    denied = /row-level security/.test(err.message)
  }
  assert(denied, 'colaborador cadastrou anexo')
})
await expectError(
  'anexo de outra norma é recusado na regra',
  async () => {
    const other = (await one("select a.id from public.legislation_annexes a join public.legislations l on l.id = a.legislation_id where l.city = 'Teresina' limit 1")).id
    await as(ADMIN, () => db.query('select public.save_cnae_rule($1::jsonb)', [JSON.stringify({ legislation_version_id: v2, cnae_code: '9999999', classification_id: classA, annex_id: other, conditions: [] })]))
  },
  /Anexo não pertence/,
)
await expectOk('regra por área (licença), por CBO e condição transcrita da norma', async () => {
  const vigilancia = (await one("select id from public.license_types where code = 'vigilancia'")).id
  areaRuleId = (
    await as(ADMIN, () =>
      one('select public.save_cnae_rule($1::jsonb) as id', [
        JSON.stringify({
          legislation_version_id: v2,
          cnae_code: '9999999',
          classification_id: classA,
          annex_id: annexII,
          license_type_id: vigilancia,
          notes: 'Observação da norma',
          conditions: [{ question_id: null, operator: 'eq', value: true, description: 'Desde que não haja manipulação (texto de teste)' }],
        }),
      ]),
    )
  ).id
  const row = await one('select annex_id, license_type_id, notes from public.cnae_rules where id = $1', [areaRuleId])
  assert(row.annex_id === annexII && row.license_type_id === vigilancia && row.notes === 'Observação da norma', JSON.stringify(row))
  assert((await one('select question_id from public.rule_conditions where rule_id = $1', [areaRuleId])).question_id === null, 'condição textual')
  await as(ADMIN, () => db.query('select public.save_cnae_rule($1::jsonb)', [JSON.stringify({ legislation_version_id: v2, cnae_code: null, cbo_code: '241005', classification_id: classB, conditions: [] })]))
  assert((await count("select count(*) from public.cnae_rules where cbo_code = '241005'")) === 1, 'regra por CBO')
})
await expectError(
  'condição sem pergunta e sem texto da norma é recusada',
  () => as(ADMIN, () => db.query('select public.save_cnae_rule($1::jsonb)', [JSON.stringify({ legislation_version_id: v2, cnae_code: '9999999', classification_id: classA, conditions: [{ question_id: null, operator: 'eq', value: true, description: ' ' }] })])),
  /rule_conditions_question_or_text|check constraint/,
)
await expectError(
  'regra não pode ser por CNAE e CBO ao mesmo tempo',
  () => as(ADMIN, () => db.query('select public.save_cnae_rule($1::jsonb)', [JSON.stringify({ legislation_version_id: v2, cnae_code: '9999999', cbo_code: '241005', classification_id: classA, conditions: [] })])),
  /cnae_rules_cnae_or_cbo|check constraint/,
)
await expectOk('versão registra a norma modificadora (redação dada por decreto de alteração)', async () => {
  const amendment = (
    await as(ADMIN, () =>
      one("insert into public.legislations (kind, number, year, title, level, uf, city, parent_legislation_id, relation) values ('decreto', '001', 2026, 'Alteração de teste', 'municipal', 'PI', 'Cidade Teste', $1, 'altera') returning id", [legislationId]),
    )
  ).id
  await as(ADMIN, () => db.query('select public.save_legislation_version($1::jsonb)', [JSON.stringify({ id: v2, legislation_id: legislationId, label: 'Redação de 2026', valid_from: '2026-01-01', amended_by_legislation_id: amendment })]))
  assert((await one('select amended_by_legislation_id from public.legislation_versions where id = $1', [v2])).amended_by_legislation_id === amendment, 'modificadora')
})
await expectError(
  'relação entre normas exige a norma relacionada',
  () => as(ADMIN, () => db.exec("insert into public.legislations (kind, number, year, title, level, uf, city, relation) values ('decreto', '2', 2026, 'x', 'municipal', 'PI', 'Cidade Teste', 'altera')")),
  /legislations_relation_check|check constraint/,
)

const publication = (target, extra = {}) =>
  JSON.stringify({
    legislation_id: legislationId,
    target,
    copy_from_version_id: null,
    exclude_rule_ids: [],
    deactivate_rule_ids: [],
    insert_rules: [],
    batch: { file_name: 'anexo-ii.xlsx', source_kind: 'xlsx', mode: 'parcial', rows_total: 1, counts: { encontrados: 1, novos: 1, alterados: 0, removidos: 0, inalterados: 0, condicoesModificadas: 0 } },
    ...extra,
  })
let v3, batchId
await expectError(
  'colaborador não publica importação de legislação',
  () => as(COLAB, () => db.query('select public.publish_rule_import($1::jsonb)', [publication({ kind: 'versao_existente', version_id: v2 }, { insert_rules: [{ cnae_code: '7777777', classification_id: classA, conditions: [] }] })])),
  /Somente administradores/,
)
await expectError(
  'importação sem alterações não é publicada',
  () => as(ADMIN, () => db.query('select public.publish_rule_import($1::jsonb)', [publication({ kind: 'versao_existente', version_id: v2 })])),
  /não tem alterações/,
)
await expectOk('publicação cria NOVA versão: encerra a anterior, copia as inalteradas, troca as alteradas e registra o lote', async () => {
  const activeBefore = await count('select count(*) from public.cnae_rules where legislation_version_id = $1 and active', [v2])
  const result = (
    await as(ADMIN, () =>
      one('select public.publish_rule_import($1::jsonb) as r', [
        publication(
          { kind: 'nova_versao', close_base_version: true, version: { label: 'Redação de 2027 (importada)', valid_from: '2027-01-01', highest_risk_prevails: true } },
          {
            copy_from_version_id: v2,
            exclude_rule_ids: [areaRuleId],
            insert_rules: [{ cnae_code: '9999999', classification_id: classB, annex_id: annexII, description: 'Nova redação', conditions: [{ question_id: null, operator: 'eq', value: true, description: 'Condição importada' }] }],
          },
        ),
      ]),
    )
  ).r
  v3 = result.version_id
  batchId = result.batch_id
  assert(result.inserted === 1, JSON.stringify(result))
  assert((await one('select valid_to::text from public.legislation_versions where id = $1', [v2])).valid_to === '2026-12-31', 'versão anterior encerrada')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1 and active', [v2])) === activeBefore, 'versão anterior intacta')
  assert((await count('select count(*) from public.cnae_rules where legislation_version_id = $1', [v3])) === activeBefore, 'copiadas - excluída + nova')
  assert((await count("select count(*) from public.cnae_rules where legislation_version_id = $1 and description = 'Nova redação'", [v3])) === 1, 'regra nova')
  assert((await count('select count(*) from public.license_rules where legislation_version_id = $1', [v3])) >= 1, 'efeitos copiados')
  const batch = await one('select file_name, mode, published_by_name from public.legislation_import_batches where id = $1', [batchId])
  assert(batch.file_name === 'anexo-ii.xlsx' && batch.published_by_name === 'Admin Teste', JSON.stringify(batch))
})
await expectOk('publicação em versão existente desativa (não exclui) as regras substituídas', async () => {
  const target = (await one("select id from public.cnae_rules where legislation_version_id = $1 and description = 'Nova redação'", [v3])).id
  await as(ADMIN, () => db.query('select public.publish_rule_import($1::jsonb)', [publication({ kind: 'versao_existente', version_id: v3 }, { deactivate_rule_ids: [target], insert_rules: [{ cnae_code: '9999999', classification_id: classA, description: 'Correção', conditions: [] }] })]))
  assert((await one('select active from public.cnae_rules where id = $1', [target])).active === false, 'substituída desativada')
  assert((await count("select count(*) from public.cnae_rules where legislation_version_id = $1 and description = 'Correção' and active", [v3])) === 1, 'nova regra')
})
await expectError(
  'regra de outra versão não pode ser desativada pela publicação',
  () => as(ADMIN, () => db.query('select public.publish_rule_import($1::jsonb)', [publication({ kind: 'versao_existente', version_id: v3 }, { deactivate_rule_ids: [ruleId] })])),
  /não pertence à versão de destino/,
)
await expectError('registro de importação é imutável', () => db.exec(`update public.legislation_import_batches set file_name = 'x' where id = '${batchId}'`), /Histórico imutável/)
await expectError('importação com erro não grava nada (transação única)', async () => {
  const versions = await count('select count(*) from public.legislation_versions')
  try {
    await as(ADMIN, () =>
      db.query('select public.publish_rule_import($1::jsonb)', [
        publication({ kind: 'nova_versao', close_base_version: false, version: { label: 'Falha', valid_from: '2030-01-01' } }, { insert_rules: [{ cnae_code: '9999999', classification_id: '00000000-0000-0000-0000-000000000000', conditions: [] }] }),
      ]),
    )
  } finally {
    assert((await count('select count(*) from public.legislation_versions')) === versions, 'versão criada apesar do erro')
  }
}, /foreign key|violates/)

console.log('\nBiblioteca de legislação')
let documentId
await expectOk('documento oficial vinculado à regra (documento e página) e copiado para a nova versão', async () => {
  documentId = (
    await as(ADMIN, () =>
      one(
        "insert into public.legislation_documents (legislation_id, title, kind, edition, file_name, sha256, status) values ($1, 'Norma de teste — DOM', 'edicao_dom', 'DOM nº 1', 'teste.pdf', repeat('a', 64), 'oficial_confirmado') returning id",
        [legislationId],
      ),
    )
  ).id
  const rid = (
    await as(ADMIN, () =>
      one('select public.save_cnae_rule($1::jsonb) as id', [JSON.stringify({ legislation_version_id: v3, cnae_code: '6666666', classification_id: classA, source_document_id: documentId, source_page: 4, conditions: [] })]),
    )
  ).id
  const row = await one('select source_document_id, source_page from public.cnae_rules where id = $1', [rid])
  assert(row.source_document_id === documentId && row.source_page === 4, JSON.stringify(row))
})
await expectError('colaborador não cadastra documento na biblioteca', () =>
  as(COLAB, () => db.query("insert into public.legislation_documents (legislation_id, title) values ($1, 'x')", [legislationId])), /row-level security/)
await expectError('hash do documento precisa ser SHA-256', () =>
  as(ADMIN, () => db.query("insert into public.legislation_documents (legislation_id, title, sha256) values ($1, 'x', 'abc')", [legislationId])), /check constraint/)
await expectError('documento usado por regra não pode ser excluído', () => db.exec(`delete from public.legislation_documents where id = '${documentId}'`), /foreign key|violates/)
await expectOk('publicação grava os efeitos nas licenças aprovados (com o fundamento) e a fonte das regras', async () => {
  const vigilancia = (await one("select id from public.license_types where code = 'vigilancia'")).id
  const result = (
    await as(ADMIN, () =>
      one('select public.publish_rule_import($1::jsonb) as r', [
        publication(
          { kind: 'nova_versao', close_base_version: true, version: { label: 'Redação de 2028 (importada)', valid_from: '2028-01-01', highest_risk_prevails: true } },
          {
            copy_from_version_id: v3,
            insert_rules: [{ cnae_code: '5555555', classification_id: classA, source_document_id: documentId, source_page: 7, conditions: [] }],
            license_effects: [{ classification_id: classA, license_type_id: vigilancia, outcome: 'dispensada', notes: 'Art. 2º (teste)' }],
          },
        ),
      ]),
    )
  ).r
  const v4 = result.version_id
  const effect = await one('select outcome, notes from public.license_rules where legislation_version_id = $1 and license_type_id = $2 and classification_id = $3', [v4, vigilancia, classA])
  assert(effect.outcome === 'dispensada' && effect.notes === 'Art. 2º (teste)', JSON.stringify(effect))
  assert((await count("select count(*) from public.cnae_rules where legislation_version_id = $1 and cnae_code = '6666666' and source_page = 4", [v4])) === 1, 'fonte copiada')
  assert((await count("select count(*) from public.cnae_rules where legislation_version_id = $1 and cnae_code = '5555555' and source_document_id = $2", [v4, documentId])) === 1, 'fonte da nova regra')
})

let runId
const simulation = () =>
  JSON.stringify({
    company_id: companyId,
    company_name: 'Padaria Teste LTDA',
    cnpj: '11222333000181',
    uf: 'PI',
    city: 'Teresina',
    reference_date: '2025-06-30',
    overall_status: 'classificada',
    classification_id: classA,
    classification_name: 'Baixo Risco A',
    classification_tone: 'green',
    confidence: 'completa',
    engine_version: '1.0.0',
    cnaes: [{ code: '9999999', description: 'CNAE de teste', primary: true }],
    result: { overall: { status: 'classificada' } },
    evaluations: [{ cnae_code: '9999999', description: 'CNAE de teste', is_primary: true, general: true, status: 'classificada', classification_id: classA, cnae_rule_id: ruleId, legislation_version_id: v1 }],
    answers: [{ question_id: questionId, question_code: 'area_teste_m2', question_text: 'Área utilizada', value: 120 }],
    licenses: [{ license_type_id: alvara, outcome: 'dispensada', summary: 'Dispensa prevista.' }],
  })
await expectError('perfil Consulta não grava simulação', () => as(READER, () => db.query('select public.save_simulation($1::jsonb)', [simulation()])), /row-level security/)
await expectOk('colaborador grava simulação com CNAEs, respostas e resultado por licença', async () => {
  const run = await as(COLAB, () => one('select * from public.save_simulation($1::jsonb)', [simulation()]))
  runId = run.id
  assert(Number(run.number) >= 1 && run.user_name === 'Colaborador Teste', JSON.stringify(run))
  assert((await count('select count(*) from public.simulation_cnaes where run_id = $1', [runId])) === 1, 'cnaes')
  assert((await count('select count(*) from public.simulation_answers where run_id = $1', [runId])) === 1, 'respostas')
  assert((await count('select count(*) from public.simulation_results where run_id = $1', [runId])) === 1, 'licenças')
})
await expectOk('simulação com enquadramento condicionado e resposta a condição transcrita da norma', async () => {
  const payload = JSON.parse(simulation())
  payload.overall_status = 'condicionada'
  payload.confidence = 'condicionada'
  payload.evaluations[0].status = 'condicionada'
  payload.answers.push({ question_id: null, question_code: 'texto:abc123', question_text: 'Desde que não haja manipulação (texto de teste)', value: true })
  const run = await as(COLAB, () => one('select * from public.save_simulation($1::jsonb)', [JSON.stringify(payload)]))
  assert(run.overall_status === 'condicionada', run.overall_status)
  assert((await count('select count(*) from public.simulation_answers where run_id = $1 and question_id is null', [run.id])) === 1, 'resposta textual')
})
await expectError('histórico de simulações é imutável', () => db.exec(`update public.simulation_runs set city = 'Outra' where id = '${runId}'`), /Histórico imutável/)
await expectError('regra usada em simulação não pode ser excluída (nem pelo dono do banco)', () => db.exec(`delete from public.cnae_rules where id = '${ruleId}'`), /foreign key|violates/)
await expectError('versão usada em simulação não pode ser excluída', () => db.exec(`delete from public.legislation_versions where id = '${v1}'`), /foreign key|violates/)
await expectOk('aplicar à empresa: atualiza e inclui licenças, registra o fundamento, não exclui nada', async () => {
  const before = await count('select count(*) from public.company_licenses where company_id = $1', [companyId])
  const vigilancia = (await one("select id from public.license_types where code = 'vigilancia'")).id
  const changes = JSON.stringify([
    { license_type_id: alvara, applicability: 'dispensada', note: 'Simulação nº 1: Dispensado.' },
    { license_type_id: vigilancia, applicability: 'em_analise', note: 'Simulação nº 1: Necessita análise.' },
  ])
  await as(COLAB, () => db.query('select public.apply_simulation($1, $2, $3::jsonb)', [runId, companyId, changes]))
  const a = await one('select applicability, notes from public.company_licenses where company_id = $1 and license_type_id = $2', [companyId, alvara])
  assert(a.applicability === 'dispensada' && a.notes.includes('Simulação nº 1'), JSON.stringify(a))
  assert((await count('select count(*) from public.company_licenses where company_id = $1', [companyId])) === before + 1, 'inclusão')
  assert((await count('select count(*) from public.simulation_applications where run_id = $1', [runId])) === 1, 'registro da aplicação')
  assert((await count("select count(*) from public.audit_logs where table_name = 'company_licenses' and new_values ->> 'applicability' = 'dispensada'")) === 1, 'auditoria')
})
await expectError(
  'perfil Consulta não aplica simulação à empresa',
  () => as(READER, () => db.query('select public.apply_simulation($1, $2, $3::jsonb)', [runId, companyId, JSON.stringify([{ license_type_id: bombeiros, applicability: 'dispensada', note: 'x' }])])),
  /row-level security/,
)

console.log(failures ? `\n${failures} falha(s).` : '\nTudo certo.')
process.exit(failures ? 1 : 0)
