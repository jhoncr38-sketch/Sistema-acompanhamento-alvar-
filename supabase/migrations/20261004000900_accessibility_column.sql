-- =====================================================================
-- Licença de Acessibilidade na tabela de empresas de cada setor (5ª coluna de licença).
-- Atualização de dados, não destrutiva: só liga a exibição onde ainda há espaço (até 5 colunas).
-- =====================================================================

update public.sector_license_rules r
set show_in_table = true
from public.license_types t
where t.id = r.license_type_id
  and t.code = 'acessibilidade'
  and not r.show_in_table
  and (select count(*) from public.sector_license_rules s where s.sector_id = r.sector_id and s.show_in_table) < 5;
