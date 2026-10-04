# Relatório de validação — base legal de Teresina – PI

Gerado em 2026-10-04 por `scripts/legislacao/extrair_teresina.py` a partir dos PDFs oficiais do DOM.

> Os dados abaixo **não** estão no simulador. Entram somente pela importação revisada (prévia → revisão → aprovação do administrador).

## Documentos

| Documento | Edição | Págs. | Status | SHA-256 |
|---|---|---|---|---|
| `LC_5788_2022_original_DOM3340.pdf` | DOM nº 3.340 de 2022-08-24 | 1–3 | OFICIAL_CONFIRMADO | `48891450fc8162b8…` |
| `LC_5788_2022_publicacao_anterior_DOM3339.pdf` | DOM nº 3.339 de 2022-08-23 | 4 | OFICIAL_CONFIRMADO | `4c02af12dd6eb630…` |
| `Decreto_24861_2023_original_DOM3609.pdf` | DOM nº 3.609 de 2023-09-28 | 3–19 | OFICIAL_CONFIRMADO | `cbebfb4d10676213…` |
| `Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf` | DOM nº 3.609 (extrato) de 2023-09-28 | 3–19 | OFICIAL_CONFIRMADO | `ca1b302b12fd9b61…` |
| `Decreto_25363_2023_original_DOM3665.pdf` | DOM nº 3.665 de 2023-12-26 | 12–13 | OFICIAL_CONFIRMADO | `f6d5a3ee71f75fb4…` |
| `LC_6048_2023_original_DOM3666.pdf` | DOM nº 3.666 de 2023-12-27 | 1 | OFICIAL_CONFIRMADO | `96849fcf4dd634ab…` |
| `Decreto_28436_2025_original_DOM4156.pdf` | DOM nº 4.156 de 2025-12-09 | 1 | OFICIAL_CONFIRMADO | `11f120c048a870bb…` |

## Totais

| Item | Quantidade |
|---|---|
| CNAEs encontrados (Anexos I + II) | 1332 |
| CNAEs no Anexo I | 1034 |
| CNAEs "baixo risco A" (Anexo II) | 298 |
| … dos quais com condição para o enquadramento | 3 |
| CBOs no Anexo III | 85 |
| Condições especiais (faixas de área/volume + condições do Anexo II) | 124 |
| CNAEs com risco sanitário "Competência Estadual" | 74 |
| Alterações posteriores (linhas) | 78 |
| … Decreto nº 25.363/2023 (risco ambiental) | 67 |
| … Decreto nº 28.436/2025 (risco sanitário) | 11 |
| Registros que precisam de revisão manual | 5 |
| Erros | 0 |
| Avisos | 5 |
| Subclasses na tabela oficial do IBGE (CNAE 2.3) | 1332 |
| Subclasses do IBGE fora dos Anexos I e II | 0 |
| Descrições idênticas às do IBGE (normalizadas) | 1312 |
| Linhas de outros atos na mesma página (ignoradas) | 15 |

## Verificações

| Verificação | Resultado |
|---|---|
| CNAEs duplicados | ✅ nenhum |
| CNAEs inválidos (fora da tabela IBGE) | ✅ nenhum |
| Descrições vazias | ✅ nenhum |
| Classificações vazias | ✅ nenhum |
| Condições incompletas / valores não interpretados | ✅ nenhum |
| Linhas não interpretadas | ✅ nenhum |
| Alterações conflitantes | ✅ nenhum |
| Alteração em coluna não prevista | ✅ nenhum |
| Alteração sem efeito | ✅ nenhum |
| Célula em branco interpretada como "sem alteração" | ⚠️ 2 |
| Descrição diverge do IBGE | ⚠️ 2 |
| Subclasses sem classificação | ✅ nenhum |
| Registros sem fonte | ✅ nenhum |
| Ementa não extraída | ✅ nenhum |
| Vigência a conferir | ⚠️ 1 |
| Registros sem vigência | ✅ nenhum (vigência = data de publicação, conforme o artigo de vigência de cada norma) |

## Ocorrências

- **AVISO** (vigencia_a_conferir) lc-5788-2022: Art. 37: "Esta Lei Complementar entra em vigor na data de sua publicação." Publicada no DOM nº 3.339 (23/08/2022) e republicada no DOM nº 3.340 (24/08/2022) somente para corrigir a numeração — conferir qual data adotar como início da vigência. — 2022/LC_5788_2022_original_DOM3340.pdf
- **AVISO** (descricao_diverge_ibge) CNAE 6438-7/99: descrição da norma difere da oficial do IBGE (semelhança 76%). Norma: "Outras instituições de intermediação não monetária não especificadas anteriormente" · IBGE: "OUTRAS INSTITUIÇÕES DE INTERMEDIAÇÃO NÃO MONETÁRIA". — Decreto nº 24.861/2023 · I · Decreto_24861_2023_original_DOM3609.pdf · 13
- **AVISO** (descricao_diverge_ibge) CNAE 5310-5/02: descrição da norma difere da oficial do IBGE (semelhança 83%). Norma: "Atividades de franqueadas e permissionárias do Correio Nacional" · IBGE: "ATIVIDADES DE FRANQUEADAS DO CORREIO NACIONAL". — Decreto nº 24.861/2023 · II · Decreto_24861_2023_original_DOM3609.pdf · 16
- **AVISO** (celula_vazia_sem_alteracao) Decreto nº 25.363/2023: CNAE 5099-8/01 com o risco sanitário em branco — interpretado como "sem alteração" (as demais linhas usam "....."). Conferir. — Decreto nº 25.363/2023 · I · Decreto_25363_2023_original_DOM3665.pdf · 13
- **AVISO** (celula_vazia_sem_alteracao) Decreto nº 25.363/2023: CNAE 5120-0/00 com o risco sanitário em branco — interpretado como "sem alteração" (as demais linhas usam "....."). Conferir. — Decreto nº 25.363/2023 · I · Decreto_25363_2023_original_DOM3665.pdf · 13

## Perguntas exigidas pelas faixas do Anexo I

- `area_ha` — Área da atividade (em hectares). Usada nas faixas do Anexo I do Decreto nº 24.861/2023 ("menor ou igual a 01 ha"). A norma não detalha a forma de medição: confirme com o órgão ambiental.
- `area_m2` — Área utilizada pela atividade (m²). Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 20m²"). A norma não detalha a forma de medição: confirme com o órgão ambiental.
- `volume_m3` — Volume referente à atividade (m³). Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 200m³"). A norma não diz a que volume se refere: confirme com o órgão ambiental.

## Pontos de interpretação (revisão jurídica recomendada)

- **Atividades do Anexo I** recebem a classificação geral "Não enquadrada como Baixo Risco A" (o Anexo I lista as atividades "não incluídas" no baixo risco A; art. 3º, § 2º exige Alvará). O decreto não atribui um grau único (médio/alto) a essas atividades.
- **Efeitos nas licenças** (arquivo `importacao/efeitos_licencas.csv`) trazem o artigo que fundamenta cada efeito. Corpo de Bombeiros aparece como "análise separada" (art. 3º: prevenção contra incêndio fica com os órgãos competentes).
- **Faixas de área/volume**: a norma não define como medir a área (construída, ocupada, cultivada) nem a que volume se refere; as perguntas do simulador dizem isso ao usuário.
- **Condições do Anexo II**: quando a condição não é atendida, a norma não indica outra classificação; o simulador mostra "Necessita análise".

## Conteúdo ignorado

15 linhas de tabelas orçamentárias de outros atos publicados na pág. 19 do DOM nº 3.609 (fora do decreto).
