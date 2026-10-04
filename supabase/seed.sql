-- GERADO por scripts/generate-seed-sql.ts a partir de src/data/catalog-seed.ts — não edite à mão.
-- Catálogo inicial (configuração). Não contém dados de clientes.

insert into public.integration_providers (code, name, short_name, agency, status) values
  ('slic', 'SLIC', 'SLIC', 'Prefeitura', 'pendente'),
  ('govpi_empresas', 'GOV.PI Empresas', 'GOV.PI', 'Governo do Piauí', 'pendente'),
  ('cbmepi', 'CBMEPI', 'CBMEPI', 'Corpo de Bombeiros Militar do Piauí', 'pendente'),
  ('divisa', 'DIVISA', 'DIVISA', 'Vigilância Sanitária', 'pendente'),
  ('semarh', 'SEMARH', 'SEMARH', 'Secretaria de Meio Ambiente', 'pendente'),
  ('cnes', 'CNES', 'CNES', 'Ministério da Saúde', 'pendente'),
  ('oab', 'OAB', 'OAB', 'Ordem dos Advogados do Brasil', 'pendente'),
  ('crmv', 'CRMV', 'CRMV', 'Conselho Regional de Medicina Veterinária', 'pendente')
on conflict (code) do nothing;

insert into public.sectors (slug, name, color, icon, cover_image_url, sort_order) values
  ('restaurante-padaria', 'Restaurante e Padaria', 'orange', 'utensils', '/sectors/restaurante-padaria.webp', 1),
  ('saude', 'Saúde', 'green', 'stethoscope', '/sectors/saude.webp', 2),
  ('advocacia', 'Advocacia', 'purple', 'scale', '/sectors/advocacia.webp', 3),
  ('industria', 'Indústria', 'blue', 'factory', '/sectors/industria.webp', 4),
  ('pet-shop', 'Pet Shop', 'pink', 'paw', '/sectors/pet-shop.webp', 5)
on conflict (slug) do nothing;

insert into public.license_types (code, name, short_name, agency, agency_scope, default_provider_code, has_expiration, sort_order) values
  ('alvara', 'Alvará de Funcionamento', 'Alvará', 'Prefeitura', 'municipal', 'slic', true, 1),
  ('vigilancia', 'Vigilância Sanitária', 'Vigilância', 'DIVISA', 'estadual', 'govpi_empresas', true, 2),
  ('bombeiros', 'Bombeiros', 'Bombeiros', 'CBMEPI', 'estadual', 'cbmepi', true, 3),
  ('ambiental', 'Licença Ambiental', 'Ambiental', 'SEMARH', 'estadual', 'semarh', true, 4),
  ('acessibilidade', 'Licença de Acessibilidade', 'Acessibilidade', 'Prefeitura', 'municipal', null, true, 5),
  ('cnes', 'CNES', 'CNES', 'Ministério da Saúde', 'federal', 'cnes', false, 6),
  ('oab', 'Registro na OAB', 'OAB', 'OAB/PI', 'conselho', 'oab', true, 7),
  ('registro_sociedade', 'Registro da Sociedade', 'Reg. Sociedade', 'OAB/PI', 'conselho', 'oab', false, 8),
  ('crmv', 'Registro no CRMV', 'CRMV', 'CRMV-PI', 'conselho', 'crmv', true, 9),
  ('responsavel_tecnico', 'Responsável Técnico', 'Resp. Técnico', 'Conselho de classe', 'conselho', null, true, 10),
  ('conselho_profissional', 'Conselho Profissional', 'Conselho', 'Conselho de classe', 'conselho', null, true, 11)
on conflict (code) do nothing;

insert into public.sector_license_rules (sector_id, license_type_id, default_applicability, show_in_table, sort_order, notes)
select s.id, t.id, v.applicability::public.license_applicability, v.show_in_table, v.sort_order, v.notes
from (values
  ('restaurante-padaria', 'alvara', 'aplicavel', true, 0, null),
  ('restaurante-padaria', 'vigilancia', 'aplicavel', true, 1, null),
  ('restaurante-padaria', 'bombeiros', 'aplicavel', true, 2, null),
  ('restaurante-padaria', 'ambiental', 'em_analise', true, 3, 'Depende da atividade e do porte.'),
  ('restaurante-padaria', 'acessibilidade', 'em_analise', true, 4, 'Confirmar a exigência municipal conforme o imóvel e a atividade.'),
  ('saude', 'alvara', 'aplicavel', true, 5, null),
  ('saude', 'vigilancia', 'aplicavel', true, 6, null),
  ('saude', 'bombeiros', 'aplicavel', true, 7, null),
  ('saude', 'cnes', 'aplicavel', true, 8, null),
  ('saude', 'responsavel_tecnico', 'aplicavel', false, 9, null),
  ('saude', 'conselho_profissional', 'aplicavel', false, 10, null),
  ('saude', 'ambiental', 'em_analise', false, 11, 'Quando houver geração de resíduos específicos.'),
  ('saude', 'acessibilidade', 'em_analise', true, 12, 'Confirmar a exigência municipal conforme o imóvel e a atividade.'),
  ('advocacia', 'alvara', 'aplicavel', true, 13, null),
  ('advocacia', 'bombeiros', 'em_analise', true, 14, 'Quando aplicável ao imóvel.'),
  ('advocacia', 'oab', 'aplicavel', true, 15, null),
  ('advocacia', 'registro_sociedade', 'aplicavel', true, 16, null),
  ('advocacia', 'acessibilidade', 'em_analise', true, 17, 'Confirmar a exigência municipal conforme o imóvel e a atividade.'),
  ('industria', 'alvara', 'aplicavel', true, 18, null),
  ('industria', 'bombeiros', 'aplicavel', true, 19, null),
  ('industria', 'ambiental', 'aplicavel', true, 20, null),
  ('industria', 'vigilancia', 'em_analise', true, 21, 'Quando houver produção de alimentos, cosméticos ou similares.'),
  ('industria', 'responsavel_tecnico', 'em_analise', false, 22, null),
  ('industria', 'acessibilidade', 'em_analise', true, 23, 'Confirmar a exigência municipal conforme o imóvel e a atividade.'),
  ('pet-shop', 'alvara', 'aplicavel', true, 24, null),
  ('pet-shop', 'vigilancia', 'em_analise', true, 25, null),
  ('pet-shop', 'bombeiros', 'aplicavel', true, 26, null),
  ('pet-shop', 'crmv', 'em_analise', true, 27, null),
  ('pet-shop', 'ambiental', 'em_analise', false, 28, null),
  ('pet-shop', 'responsavel_tecnico', 'em_analise', false, 29, null),
  ('pet-shop', 'acessibilidade', 'em_analise', true, 30, 'Confirmar a exigência municipal conforme o imóvel e a atividade.')
) as v(sector, license, applicability, show_in_table, sort_order, notes)
join public.sectors s on s.slug = v.sector
join public.license_types t on t.code = v.license
on conflict (sector_id, license_type_id) do nothing;

insert into public.cnaes (code, description) values
  ('1091102', 'Fabricação de produtos de padaria e confeitaria com predominância de produção própria'),
  ('4721102', 'Padaria e confeitaria com predominância de revenda'),
  ('5611201', 'Restaurantes e similares'),
  ('5611203', 'Lanchonetes, casas de chá, de sucos e similares'),
  ('8630503', 'Atividade médica ambulatorial restrita a consultas'),
  ('8630504', 'Atividade odontológica'),
  ('8640202', 'Laboratórios clínicos'),
  ('8650004', 'Atividades de fisioterapia'),
  ('6911701', 'Serviços advocatícios'),
  ('1052000', 'Fabricação de laticínios'),
  ('1813001', 'Impressão de material para uso publicitário'),
  ('2222600', 'Fabricação de embalagens de material plástico'),
  ('2512800', 'Fabricação de esquadrias de metal'),
  ('3101200', 'Fabricação de móveis com predominância de madeira'),
  ('4789004', 'Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação'),
  ('7500100', 'Atividades veterinárias'),
  ('9609208', 'Higiene e embelezamento de animais domésticos')
on conflict (code) do nothing;

insert into public.cnae_sector_rules (cnae_id, sector_id, priority)
select c.id, s.id, 1
from (values
  ('1091102', 'restaurante-padaria'),
  ('4721102', 'restaurante-padaria'),
  ('5611201', 'restaurante-padaria'),
  ('5611203', 'restaurante-padaria'),
  ('8630503', 'saude'),
  ('8630504', 'saude'),
  ('8640202', 'saude'),
  ('8650004', 'saude'),
  ('6911701', 'advocacia'),
  ('1052000', 'industria'),
  ('1813001', 'industria'),
  ('2222600', 'industria'),
  ('2512800', 'industria'),
  ('3101200', 'industria'),
  ('4789004', 'pet-shop'),
  ('7500100', 'pet-shop'),
  ('9609208', 'pet-shop')
) as v(cnae, sector)
join public.cnaes c on c.code = v.cnae
join public.sectors s on s.slug = v.sector
on conflict (cnae_id, sector_id) do nothing;

insert into public.cnae_license_rules (cnae_id, license_type_id, applicability, notes)
select c.id, t.id, v.applicability::public.license_applicability, v.notes
from (values
  ('1052000', 'vigilancia', 'aplicavel', 'Produção de alimentos.'),
  ('1052000', 'responsavel_tecnico', 'aplicavel', 'Produção de alimentos.'),
  ('7500100', 'crmv', 'aplicavel', 'Atividade veterinária.'),
  ('7500100', 'responsavel_tecnico', 'aplicavel', 'Atividade veterinária.'),
  ('4789004', 'vigilancia', 'aplicavel', 'Comércio de alimentos para animais.')
) as v(cnae, license, applicability, notes)
join public.cnaes c on c.code = v.cnae
join public.license_types t on t.code = v.license
on conflict (cnae_id, license_type_id) do nothing;

insert into public.notification_templates (code, days_before, subject) values
  ('d90', 90, '{{licenca}} de {{empresa}} vence em 90 dias'),
  ('d60', 60, '{{licenca}} de {{empresa}} vence em 60 dias'),
  ('d30', 30, '{{licenca}} de {{empresa}} vence em 30 dias'),
  ('d15', 15, '{{licenca}} de {{empresa}} vence em 15 dias'),
  ('d7', 7, 'Urgente: {{licenca}} de {{empresa}} vence em 7 dias'),
  ('vencida', 0, '{{licenca}} de {{empresa}} está vencida')
on conflict (code) do nothing;

-- Classificações de risco da Simulação. Normas e regras NÃO são pré-cadastradas: entram pelo painel ou por CSV.
insert into public.risk_classifications (code, name, severity, tone) values
  ('baixo_risco_a', 'Baixo Risco A', 10, 'green'),
  ('dispensa_licenca', 'Dispensa de Licença', 12, 'blue'),
  ('baixo_risco', 'Baixo Risco (Anexo III)', 15, 'green'),
  ('baixo_risco_b', 'Baixo Risco B', 20, 'blue'),
  ('nao_baixo_risco_a', 'Não enquadrada como Baixo Risco A', 25, 'orange'),
  ('necessita_licenciamento', 'Necessita Licenciamento', 30, 'orange'),
  ('medio_risco', 'Médio Risco', 30, 'orange'),
  ('competencia_estadual', 'Competência Estadual', 35, 'yellow'),
  ('alto_risco', 'Alto Risco', 40, 'red')
on conflict (code) do nothing;


-- Perguntas usadas pelas faixas de área/volume do Anexo I do Decreto nº 24.861/2023 (estrutura, não regra).
insert into public.rule_questions (code, text, type, unit, help_text) values
  ('area_ha', 'Área da atividade (em hectares)', 'numero', 'ha', 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 ("menor ou igual a 01 ha"). A norma não detalha a forma de medição: confirme com o órgão ambiental.'),
  ('area_m2', 'Área utilizada pela atividade (m²)', 'numero', 'm²', 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 20m²"). A norma não detalha a forma de medição: confirme com o órgão ambiental.'),
  ('volume_m3', 'Volume referente à atividade (m³)', 'numero', 'm³', 'Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 200m³"). A norma não diz a que volume se refere: confirme com o órgão ambiental.')
on conflict (code) do nothing;

-- Base legal de Teresina – PI conferida nos PDFs oficiais do DOM (biblioteca em legislacao/teresina): identificação das
-- normas, anexos e documentos. Nenhuma regra, CNAE, condição ou vigência: o conteúdo entra pela importação revisada.
insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)
select 'lei_complementar', '5.788', 2022, '2022-08-19', 'Dispõe sobre o licenciamento para funcionamento e exercício de atividades econômicas, no Município de Teresina, estabelece procedimentos para classificação de risco das atividades econômicas, inclusive as de baixo risco, para os fins da Lei Federal nº 13.874, de 20 de setembro de 2019, e dá outras providências.', 'Município de Teresina', 'municipal', 'PI', 'Teresina', false, null, null, 'https://dom.pmt.pi.gov.br/admin/upload/DOM3340-24082022-ASSINADO.pdf', 'Publicada no DOM nº 3.339 (23/08/2022, pág. 4) com erro de numeração e republicada no DOM nº 3.340 (24/08/2022). Art. 37: vigência na data da publicação. Define as denominações de risco (art. 4º).'
where not exists (select 1 from public.legislations where kind = 'lei_complementar' and number = '5.788' and year = 2022 and city = 'Teresina');
insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)
select 'decreto', '24.861', 2023, '2023-09-26', 'Define as classificações de grau de risco das atividades econômicas no Município de Teresina – conforme previsto na Lei Complementar Municipal nº 5.788, de 19 de agosto de 2022 –, inclusive a classificação de atividades de “baixo risco A” para fins de dispensa da exigência do Alvará de Funcionamento e demais licenciamentos municipais, tais como Licenças Ambientais e Sanitárias – conforme a Lei Federal nº 13.874, de 20 de setembro 2019 –, que instituiu a Declaração de Direitos de Liberdade Econômica.', 'Município de Teresina', 'municipal', 'PI', 'Teresina', true, null, null, 'https://dom.pmt.pi.gov.br/admin/upload/DOM3609-28092023-ASSINADO.pdf', 'Publicado no DOM nº 3.609, de 28/09/2023 (págs. 3–19). Art. 6º: vigência na data da publicação. Art. 5º: estabelecimento com mais de uma atividade é classificado pela de maior grau de risco.'
where not exists (select 1 from public.legislations where kind = 'decreto' and number = '24.861' and year = 2023 and city = 'Teresina');
insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)
select 'decreto', '25.363', 2023, '2023-12-20', 'Altera o ANEXO I, do Decreto nº 24.861, de 26 de setembro de 2023 (reclassificação do grau de risco ambiental de atividades econômicas).', 'Município de Teresina', 'municipal', 'PI', 'Teresina', false, (select id from public.legislations where kind = 'decreto' and number = '24.861' and year = 2023 and city = 'Teresina'), 'altera', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3665-26122023-ASSINADO.pdf', 'Publicado no DOM nº 3.665, de 26/12/2023 (págs. 12–13). Art. 2º: vigência na data da publicação. Altera o risco ambiental de 67 CNAEs do Anexo I.'
where not exists (select 1 from public.legislations where kind = 'decreto' and number = '25.363' and year = 2023 and city = 'Teresina');
insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)
select 'lei_complementar', '6.048', 2023, '2023-12-27', 'Altera o inciso II, do art. 4º; o art. 11; o caput do art. 34; revoga o art. 10; e inclui o §5º, do art. 4º, todos da Lei Complementar nº 5.788, de 19 de agosto de 2022.', 'Município de Teresina', 'municipal', 'PI', 'Teresina', false, (select id from public.legislations where kind = 'lei_complementar' and number = '5.788' and year = 2022 and city = 'Teresina'), 'altera', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3666-27122023-ASSINADO.pdf', 'Publicada no DOM nº 3.666, de 27/12/2023 (pág. 1). Art. 4º: vigência na data da publicação. Nova redação do conceito de médio risco (art. 4º, II) e do art. 11 (Alvará após as licenças).'
where not exists (select 1 from public.legislations where kind = 'lei_complementar' and number = '6.048' and year = 2023 and city = 'Teresina');
insert into public.legislations (kind, number, year, norm_date, title, issuing_body, level, uf, city, defines_general_classification, parent_legislation_id, relation, official_url, notes)
select 'decreto', '28.436', 2025, '2025-11-28', 'Altera o Anexo I, do Decreto nº 24.861, de 26 de setembro de 2023, que fixa as classificações de risco das atividades econômicas no Município de Teresina, e dá outras providências.', 'Município de Teresina', 'municipal', 'PI', 'Teresina', false, (select id from public.legislations where kind = 'decreto' and number = '24.861' and year = 2023 and city = 'Teresina'), 'altera', 'https://dom.pmt.pi.gov.br/admin/upload/DOM4156-09122025-ASSINADO.pdf', 'Publicado no DOM nº 4.156, de 09/12/2025 (pág. 1). Art. 2º: vigência na data da publicação. Altera o risco sanitário (competência para o licenciamento) de 11 CNAEs do Anexo I.'
where not exists (select 1 from public.legislations where kind = 'decreto' and number = '28.436' and year = 2025 and city = 'Teresina');

insert into public.legislation_annexes (legislation_id, code, title, kind, description, sort_order)
select l.id, v.code, v.title, v.kind_annex::public.annex_kind, v.description, v.sort_order
from (values
  ('decreto', '24.861', 2023, 'Teresina', 'I', 'Classificação de risco das atividades econômicas (não incluídas as atividades de “baixo risco A”)', 'classificacao', 'Art. 1º, I. Por CNAE: grau de risco ambiental e grau de risco sanitário. 1.034 subclasses (págs. 4–15 do DOM nº 3.609).', 1),
  ('decreto', '24.861', 2023, 'Teresina', 'II', 'Classificação das atividades de “baixo risco A”', 'baixo_risco_a', 'Art. 1º, II e art. 2º. Por CNAE, com a condição para classificação em “baixo risco A” quando houver. 298 subclasses (págs. 15–18).', 2),
  ('decreto', '24.861', 2023, 'Teresina', 'III', 'Classificação de risco por meio da Classificação Brasileira de Ocupações (CBO)', 'cbo', 'Art. 1º, III. Para atividades de pessoas cujos dados cadastrais não utilizem a CNAE. 85 ocupações (págs. 18–19).', 3)
) as v(kind, number, year, city, code, title, kind_annex, description, sort_order)
join public.legislations l on l.kind::text = v.kind and l.number = v.number and l.year = v.year and l.city = v.city
on conflict (legislation_id, code) do nothing;

insert into public.legislation_documents (legislation_id, title, kind, edition, publication_date, pages, official_url, file_url, file_name, sha256, size_bytes, downloaded_at, status, notes)
select l.id, v.title, v.doc_kind::public.legislation_document_kind, v.edition, v.publication_date::date, v.pages, v.official_url, v.file_url, v.file_name, v.sha256, v.size_bytes, v.downloaded_at::date, v.status::public.legislation_document_status, v.notes
from (values
  ('lei_complementar', '5.788', 2022, 'Teresina', 'Lei Complementar nº 5.788/2022 (republicação)', 'edicao_dom', 'DOM nº 3.340', '2022-08-24', '1–3', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3340-24082022-ASSINADO.pdf', '/legislacao/teresina/2022/LC_5788_2022_original_DOM3340.pdf', 'LC_5788_2022_original_DOM3340.pdf', '48891450fc8162b85fbda3ecd98c8ee07ea80aeea95c6114f8dadf3665aa463e', 2018319, '2026-10-04', 'oficial_confirmado', 'Republicação oficial por incorreção apenas na numeração (nota na pág. 1). Edição completa, sem alteração.'),
  ('lei_complementar', '5.788', 2022, 'Teresina', 'Lei Complementar nº 5.788/2022 (primeira publicação, com erro de numeração)', 'edicao_dom', 'DOM nº 3.339', '2022-08-23', '4', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3339-23082022-ASSINADO.pdf', '/legislacao/teresina/2022/LC_5788_2022_publicacao_anterior_DOM3339.pdf', 'LC_5788_2022_publicacao_anterior_DOM3339.pdf', '4c02af12dd6eb63076570b386fd145f1550705cabe999329eb1d97802a8abfee', 5143710, '2026-10-04', 'oficial_confirmado', 'Consta como "Lei Complementar nº 5.787". Guardada para histórico; vale a republicação do DOM nº 3.340.'),
  ('decreto', '24.861', 2023, 'Teresina', 'Decreto nº 24.861/2023 — texto e Anexos I, II e III', 'edicao_dom', 'DOM nº 3.609', '2023-09-28', '3–19', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3609-28092023-ASSINADO.pdf', '/legislacao/teresina/2023/Decreto_24861_2023_original_DOM3609.pdf', 'Decreto_24861_2023_original_DOM3609.pdf', 'cbebfb4d10676213b55ab247edf9ad9c88cf9cbaef10d02cb06136fea9290628', 5393739, '2026-10-04', 'oficial_confirmado', 'Texto nas págs. 3–4; Anexo I nas págs. 4–15; Anexo II nas págs. 15–18; Anexo III nas págs. 18–19. Edição completa, assinada digitalmente.'),
  ('decreto', '24.861', 2023, 'Teresina', 'Decreto nº 24.861/2023 — extrato fornecido pelo escritório', 'extrato', 'DOM nº 3.609 (págs. 3–19)', '2023-09-28', '1–17 do extrato (= 3–19 do DOM)', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3609-28092023-ASSINADO.pdf', '/legislacao/teresina/2023/Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf', 'Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf', 'ca1b302b12fd9b6109e80f6425e5fa50fee8f5c5756c2cb3498d282d49ff4be7', 554945, '2026-10-04', 'oficial_confirmado', 'Conferido página a página com a edição oficial completa. A referência das regras é a edição completa.'),
  ('decreto', '25.363', 2023, 'Teresina', 'Decreto nº 25.363/2023 — texto e Anexo Único', 'edicao_dom', 'DOM nº 3.665', '2023-12-26', '12–13', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3665-26122023-ASSINADO.pdf', '/legislacao/teresina/2023/Decreto_25363_2023_original_DOM3665.pdf', 'Decreto_25363_2023_original_DOM3665.pdf', 'f6d5a3ee71f75fb44d364290a493d4c4dd503ce6a85a97c3f849bca73bb15861', 5424210, '2026-10-04', 'oficial_confirmado', 'Texto na pág. 12 (coluna direita); Anexo Único na pág. 13.'),
  ('lei_complementar', '6.048', 2023, 'Teresina', 'Lei Complementar nº 6.048/2023', 'edicao_dom', 'DOM nº 3.666', '2023-12-27', '1', 'https://dom.pmt.pi.gov.br/admin/upload/DOM3666-27122023-ASSINADO.pdf', '/legislacao/teresina/2023/LC_6048_2023_original_DOM3666.pdf', 'LC_6048_2023_original_DOM3666.pdf', '96849fcf4dd634ab69de903b14a0448099dfd465c7c48fd955bde95803da700a', 4151734, '2026-10-04', 'oficial_confirmado', 'Edição completa, sem alteração.'),
  ('decreto', '28.436', 2025, 'Teresina', 'Decreto nº 28.436/2025', 'edicao_dom', 'DOM nº 4.156', '2025-12-09', '1', 'https://dom.pmt.pi.gov.br/admin/upload/DOM4156-09122025-ASSINADO.pdf', '/legislacao/teresina/2025/Decreto_28436_2025_original_DOM4156.pdf', 'Decreto_28436_2025_original_DOM4156.pdf', '11f120c048a870bbb28e1159c53aed1aa5e5094bbd8f3d7923210f16f9710325', 4255152, '2026-10-04', 'oficial_confirmado', 'Edição completa, sem alteração.')
) as v(kind, number, year, city, title, doc_kind, edition, publication_date, pages, official_url, file_url, file_name, sha256, size_bytes, downloaded_at, status, notes)
join public.legislations l on l.kind::text = v.kind and l.number = v.number and l.year = v.year and l.city = v.city
on conflict (legislation_id, file_name) do nothing;

insert into public.system_settings (key, value, description) values
  ('expiration_thresholds', '{"preventiveDays":60,"attentionDays":30,"highDays":15,"criticalDays":7}'::jsonb, 'Faixas de vencimento em dias'),
  ('regularity_weights', '{"regular":100,"atencao_preventiva":80,"atencao":55,"atencao_alta":40,"critico":25,"em_renovacao":50,"vencida":0,"pendente":0}'::jsonb, 'Pontos por situação no Índice de Regularidade'),
  ('notification_schedule_days', '[90,60,30,15,7,0]'::jsonb, 'Dias antes do vencimento para avisar'),
  ('monitoring_job', '{"enabled":false,"cron":"0 6 * * *"}'::jsonb, 'Rotina automática de monitoramento')
on conflict (key) do nothing;
