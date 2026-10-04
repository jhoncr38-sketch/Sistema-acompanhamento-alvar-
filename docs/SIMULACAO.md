# Simulação de Licenciamento — plano e funcionamento

Pré-diagnóstico de licenciamento por **motor de regras**: o resultado vem somente da legislação cadastrada no banco. Nenhuma IA decide enquadramento, e o sistema **não traz conteúdo legal inventado** — CNAEs, classificações, condições, artigos e dispensas entram somente a partir dos documentos oficiais, por importação revisada ou cadastro manual do administrador. Quando a informação não existe na base, o resultado é **REGRA NÃO CADASTRADA** ou **NECESSITA ANÁLISE** — nunca dispensa.

## 1. O que já existia e foi reaproveitado

| Necessidade | Estrutura existente reaproveitada |
|---|---|
| Catálogo de CNAEs (autocomplete) | tabela `cnaes` |
| Licenças e órgãos | tabela `license_types` (cada licença já tem órgão e esfera) — por isso **não** foi criada `licensing_authorities` |
| Consulta por CNPJ | `src/integrations/cnpj/cnpj-lookup.ts` (continua "integração pendente" fora da demonstração) + busca nas empresas cadastradas |
| Aplicar resultado à empresa | `company_licenses.applicability` (aplicável / dispensada / em análise) |
| Auditoria, perfis e RLS | funções `is_admin()`, `is_staff()`, `audit_row()`, `forbid_history_mutation()` |
| Telas | `Card`, `Button`, `Badge`, `Field`, `Modal`, `Table`, `Tabs`, estados de carregamento/erro |

## 2. Como o motor decide

```
CNAE(s) → município (UF/cidade) → data de referência
   ↓ normas da localidade, cada uma na versão VIGENTE na data
     (a versão registra o decreto modificador que deu a redação: ex. Decreto nº 25.363/2023)
   ↓ regras do CNAE em ordem — ex.: Anexo II (Baixo Risco A) primeiro, Anexo I depois
   ↓ condições da regra → perguntas cadastradas ou o texto da condição da norma (Sim/Não)
   ↓ classificação geral de cada CNAE + classificações por área (risco sanitário, ambiental…)
   ↓ todos os CNAEs (principal e secundários) → maior risco, quando a norma assim determina
   ↓ efeito de cada classificação em cada licença (definido pela própria norma)
   ↓ resultado geral + por área + por CNAE + justificativa + base legal utilizada
```

- **Versões por vigência.** Uma alteração legislativa cria uma **nova versão** da norma (com o decreto modificador); a versão anterior fica preservada com sua vigência. Duas versões ativas da mesma norma não podem se sobrepor (restrição no banco).
- **Regras em ordem.** Um CNAE pode ter várias regras na mesma versão (ex.: Anexo II com condição e Anexo I como alternativa). Vale a primeira cujas condições são atendidas. Condição não atendida → classificação alternativa, se houver; senão a próxima regra; sem próxima → *Necessita análise*.
- **Condições da norma.** Uma condição pode ser uma pergunta estruturada (`area_m2 <= 200`) ou o **texto da condição como está na norma**. O texto vira uma pergunta Sim/Não no questionário ("Condição prevista na norma").
- **Condição não respondida** → **ENQUADRAMENTO CONDICIONADO**: "Esta atividade pode ser classificada como Baixo Risco A desde que as condições previstas na legislação sejam atendidas." As licenças ficam *Necessita análise* até a resposta.
- **CNAE sem regra** → *Regra não cadastrada*. O resultado geral nunca é concluído quando falta regra para algum CNAE. Norma cadastrada sem conteúdo (ex.: anexos ainda não importados) gera o aviso "Base legal cadastrada, aguardando importação do conteúdo".
- **Vários CNAEs.** Todos são avaliados. O geral só é concluído com classificações diferentes quando a versão da norma tem "a atividade de maior risco define o enquadramento"; o resultado mostra o **CNAE que alterou o enquadramento**.
- **Cada órgão com sua regra.** Uma licença só é dispensada/exigível se alguma norma cadastrada definir esse efeito. Baixo Risco A de um órgão não dispensa outro órgão. Corpo de Bombeiros aparece como *Análise separada* quando assim cadastrado.
- **Classificação por área.** A regra pode ser do enquadramento geral ou de uma licença (ex.: risco sanitário do Anexo I → Vigilância Sanitária). Para cada licença vale o efeito da classificação geral; se a norma não define efeito para ela, vale a classificação específica da área; classificação de área sem efeito cadastrado → *Necessita análise*.
- **CBO (Anexo III).** Regras por CBO ficam cadastradas, mas não entram no enquadramento por CNAE.
- **Histórico auditável.** Cada simulação guarda a cópia completa do resultado: regras, condições, respostas, normas, versões, decreto modificador, justificativa e base legal. Regras nunca são excluídas — são desativadas — e as simulações antigas não mudam.

## 3. Base legal de Teresina – PI (biblioteca de legislação)

Os documentos foram obtidos em **04/10/2026** no portal oficial do Diário Oficial do Município de Teresina (`https://dom.pmt.pi.gov.br`) e estão guardados sem alteração em [`legislacao/teresina`](../legislacao/README.md), com hash SHA-256, URL oficial e páginas da norma:

| Norma | Publicação oficial | Págs. | Situação |
|---|---|---|---|
| LC nº 5.788/2022 | DOM nº 3.340, 24/08/2022 (republicação; 1ª publicação no DOM nº 3.339, 23/08/2022, com erro de numeração) | 1–3 | Oficial confirmado |
| Decreto nº 24.861/2023 — texto e Anexos I, II, III | DOM nº 3.609, 28/09/2023 | 3–19 | Oficial confirmado |
| Decreto nº 25.363/2023 — Anexo Único | DOM nº 3.665, 26/12/2023 | 12–13 | Oficial confirmado |
| LC nº 6.048/2023 | DOM nº 3.666, 27/12/2023 | 1 | Oficial confirmado |
| Decreto nº 28.436/2025 | DOM nº 4.156, 09/12/2025 | 1 | Oficial confirmado |

**Extração** (`scripts/legislacao/extrair_teresina.py`, pdfplumber): 1.332 CNAEs (Anexo I: 1.034; Anexo II "baixo risco A": 298, dos quais 3 com condição), 85 CBOs (Anexo III), 124 condições especiais (faixas de área/volume e condições do Anexo II), 78 alterações posteriores (Decreto nº 25.363/2023: 67 no risco ambiental; Decreto nº 28.436/2025: 11 no risco sanitário). 0 erros; os Anexos I e II cobrem exatamente as 1.332 subclasses do IBGE, sem duplicidade; 1.312 descrições idênticas às oficiais. Relatório: `legislacao/teresina/dados/relatorio_validacao.md`.

**Nada foi publicado automaticamente.** O `seed.sql` e a demonstração trazem as normas, os anexos e os documentos; as regras entram pelos três pacotes da aba *Importar legislação* (redação original → Decreto nº 25.363/2023 → Decreto nº 28.436/2025), cada um com prévia, revisão e aprovação. Publicados os três, o Decreto nº 24.861/2023 fica com três versões encadeadas (28/09/2023 a 25/12/2023; 26/12/2023 a 08/12/2025; desde 09/12/2025), e uma simulação com data antiga usa a redação da época.

**Como os riscos viram efeito nas licenças** (arquivo `importacao/efeitos_licencas.csv`, cada linha com o artigo):

| Classificação (tabela da norma) | Alvará | Licença Sanitária | Licença Ambiental | Bombeiros |
|---|---|---|---|---|
| Baixo Risco A (Anexo II) — Decreto, art. 2º | Dispensado | Dispensada | Dispensada | Análise separada (art. 3º) |
| Não enquadrada como Baixo Risco A (Anexo I) — art. 3º, § 2º | Exigível | pela classificação da área | pela classificação da área | Análise separada |
| Dispensa de Licença — art. 4º (declaração de dispensa, com taxa) | — | Dispensada | Dispensada | — |
| Médio Risco — LC nº 5.788, art. 4º, II (LC nº 6.048) | — | Exigível | Exigível | — |
| Alto Risco — LC nº 5.788, art. 4º, III | — | Exigível | Exigível | — |
| Competência Estadual — Decreto nº 28.436/2025 | — | Análise separada | — | — |

Pontos que pedem revisão jurídica estão no relatório de validação (classificação geral das atividades do Anexo I, forma de medir as áreas das faixas, condições do Anexo II, data de vigência da LC nº 5.788/2022, duas células em branco no Decreto nº 25.363/2023).

**Rastreabilidade:** cada regra publicada guarda o documento e a página. No resultado da simulação, cada regra usada mostra a fonte e o botão **VER FONTE**, que abre o PDF oficial na página; regra sem documento-fonte gera o aviso **NECESSITA REVISÃO** (norma + regra + vigência + fonte).

Outras cidades usam a mesma estrutura: documentos na biblioteca, regras no banco, nada fixo no código.

## 4. Configurações → Legislação

| Aba | O que faz |
|---|---|
| **Documentos** | biblioteca: cards por norma com situação, publicação, anexos, dados extraídos, **[VER DOCUMENTO]**, **[VER DADOS EXTRAÍDOS]** (com a página de cada linha), **[VER ALTERAÇÕES]**, **VERIFICAR NOVA LEGISLAÇÃO** (arquitetura, sem raspagem) e registro de documento |
| **Base Legal** | normas por localidade; anexos com **[Visualizar]** (conteúdo vigente na data escolhida); versões com situação VIGENTE / SUBSTITUÍDA / FUTURA / ENCERRADA; normas que alteram com **[Visualizar alterações]** (incluídas, alteradas, revogadas); **Pesquisar CNAE** (descrição, anexo, classificação, risco sanitário, risco ambiental, Baixo Risco A, condições, norma vigente, última atualização e histórico legal ALTERADA / REVOGADA / VIGENTE) |
| Normas e versões | cadastro da norma (data, norma relacionada e relação "altera/revoga…"), anexos, versões (decreto modificador) e efeitos nas licenças |
| Regras por CNAE | regra por CNAE, CBO ou regra padrão; anexo; área (enquadramento geral ou licença); condições estruturadas ou texto da norma; observações |
| Perguntas, Classificações | catálogos usados pelas regras |
| **Importar legislação** | pacotes extraídos dos documentos oficiais (carregados no assistente) ou CSV/Excel (.xlsx), com o fluxo abaixo |

### Fluxo de importação (nada vai para produção sem aprovação)

**DOCUMENTO → EXTRAÇÃO → COMPARAÇÃO → REVISÃO → APROVAÇÃO DO ADMINISTRADOR → PUBLICAÇÃO DA NOVA VERSÃO**

1. Escolha a norma, o tipo (*Somente alterações* ou *Anexo completo*) e o destino (**nova versão**, recomendado, ou complemento de versão existente para correção de cadastro).
2. Envie o arquivo. Linhas com erro são listadas por número e **bloqueiam** a publicação (legislação não é publicada pela metade). O importador não cria classificações, perguntas, anexos nem licenças.
3. **PRÉVIA DA IMPORTAÇÃO**: encontrados, novos, alterados, removidos, condições modificadas e inalterados, comparando com a versão vigente na véspera do início.
4. **[REVISAR ALTERAÇÕES]** abre o antes × depois de cada item. Só depois de concluir a revisão o botão **[CONFIRMAR IMPORTAÇÃO]** é liberado.
5. A publicação é atômica (`publish_rule_import`): encerra a versão anterior na véspera, copia as regras inalteradas, inclui as novas e registra o lote (arquivo, contagens, quem publicou). Nada é excluído.

### Colunas do arquivo

| Coluna | Obrigatória | Exemplo |
|---|---|---|
| `cnae` (ou `cbo`) | sim | `5611-2/01` (CBO: `2410-05`); `*` = regra padrão da norma |
| `descricao` | não | descrição do CNAE (usada se ainda não estiver no catálogo) |
| `anexo` | não | `II`, `Anexo II` — precisa estar cadastrado na norma |
| `area` | não | vazio/`geral` = enquadramento geral; `sanitária`, `ambiental`, `bombeiros` ou o nome da licença |
| `classificacao` | sim (exceto `acao = remover`) | `Baixo Risco A` |
| `condicao_texto` | não | texto da condição como está na norma (uma por linha da célula) |
| `condicao` | não | `area_m2 <= 200 & exercida_em_residencia = nao` (perguntas cadastradas) |
| `classificacao_se_nao_atender` | não | `Baixo Risco B` |
| `ordem` | não (padrão 1) | `2` — ex.: regra do Anexo I depois da do Anexo II |
| `artigo`, `item`, `observacoes`, `resumo` | não | `Art. 3º` |
| `acao` | não | `incluir`, `alterar`, `remover` (modo *Somente alterações*) |
| `documento`, `pagina` | não (obrigatórios para dados oficiais) | nome do arquivo na biblioteca e página: `Decreto_24861_2023_original_DOM3609.pdf`, `15` |

## 5. Banco de dados

Migration `20261004000600_simulation.sql` (etapa anterior) e `20261004000700_legal_base.sql` (esta etapa) — **somente inclusões**:

| Objeto | Conteúdo |
|---|---|
| `legislations` + `norm_date`, `parent_legislation_id`, `relation` | norma e relação com a norma que altera/revoga/regulamenta |
| `legislation_versions` + `amended_by_legislation_id` | versão com vigência e decreto modificador |
| `legislation_annexes` (nova) | anexos da norma (código, título, tipo: classificações, Baixo Risco A, CBO) |
| `cnae_rules` + `annex_id`, `license_type_id`, `cbo_code`, `notes` | anexo de origem, classificação por área, CBO, observações; gatilho garante que o anexo é da mesma norma |
| `rule_conditions.question_id` opcional | condição com o texto da norma (exige o texto) |
| `simulation_answers.question_id` opcional | resposta a condição textual (a chave fica em `question_code`) |
| `simulation_status` + `condicionada` | enquadramento condicionado no histórico |
| `legislation_import_batches` (nova, imutável) | registro de cada importação publicada |
| `publish_rule_import(p jsonb)` | publicação atômica da importação revisada (somente administrador) |
| `copy_version_rules_except`, `save_cnae_rule`, `save_legislation_version` | atualizadas com os novos campos (mesmas assinaturas) |

Segurança: leitura para a equipe; **somente administrador** altera normas, anexos, regras e publica importações; histórico de simulações e de importações é imutável; tudo auditado. Nenhuma tabela, coluna ou política existente foi removida.

## 6. Arquivos desta etapa

**Criados:** `src/domain/simulation/rule-signature.ts`, `legal-base.ts`, `rule-import.ts`, `legal-base.test.ts`; `src/features/settings/sections/rules/LegalBaseTab.tsx`, `RulesSection.test.tsx`; `supabase/migrations/20261004000700_legal_base.sql`.

**Alterados:** `src/domain/simulation/types.ts`, `engine.ts` (v1.1.0), `labels.ts`, `csv-import.ts` (CSV e XLSX, anexo, área, CBO, condição textual, ação); `src/config/simulation.tsx`; `src/data/types.ts`, `catalog-seed.ts` (normas de Teresina), `mock/*` (dados da demonstração v4, com migração que preserva o histórico), `supabase/supabase-simulation-repository.ts`; `src/features/simulation/ResultView.tsx`, `Questionnaire.tsx`, `SimulationPage.tsx`; `src/features/settings/sections/rules/*` e `SettingsPage.tsx` (seção renomeada para **Legislação**); `src/hooks/simulation-queries.ts`; `scripts/generate-seed-sql.ts`, `supabase/seed.sql`, `scripts/validate-migrations.mjs`; testes.

Dashboard, cards, cores e demais páginas não foram modificados.

## 7. Verificações executadas

- TypeScript (`tsc -b`) e `npm run lint` sem erros; `npm run build` e `npm run build:edge` concluídos (a biblioteca é copiada para `dist/legislacao`; os PDFs não entram no cache do PWA).
- 159 testes automatizados (`npm test`), incluindo o pipeline com os dados reais de Teresina: publicação dos três pacotes, versões encadeadas, Baixo Risco A com fonte na pág. 15 do DOM, faixa de 10 m² do Decreto nº 25.363/2023, simulação histórica antes/depois do Decreto nº 28.436/2025, condição do Anexo II e maior risco entre vários CNAEs; telas da aba Documentos e do pacote carregado no assistente (revisão obrigatória antes da confirmação).
- 69 verificações do banco (`npm run db:validate`): seed com as normas, os anexos e os 7 documentos de Teresina (SHA-256), documento vinculado à regra e copiado para a nova versão, somente administrador registra documento, documento usado por regra não pode ser excluído, publicação com os efeitos nas licenças.

## 8. Modo demonstração

- **Teresina – PI:** normas, anexos e documentos oficiais (mesmo conteúdo do `seed.sql`); os três pacotes extraídos aguardam a aprovação em *Importar legislação*. O banco da demonstração é gravado em formato compacto para caber no navegador depois da importação.
- **"Cidade Exemplo" – PI:** uma norma **fictícia** ("EXEMPLO FICTÍCIO"), com anexos I, II e III, condição textual, classificação por área, regra por CBO e uma versão "alterada por decreto fictício", apenas para testar as telas. Não vai para o banco do Supabase.
- Dados salvos por versões anteriores da demonstração são atualizados preservando empresas, licenças, consultas e o histórico de simulações.
