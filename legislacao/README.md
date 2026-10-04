# Biblioteca de legislação

O **PDF oficial é a fonte documental**; os **CSV/JSON e o banco são a fonte operacional** do simulador. Toda regra importada guarda o documento e a página de onde veio.

```
DOCUMENTO ORIGINAL → EXTRAÇÃO → CSV/JSON → VALIDAÇÃO → PRÉVIA → APROVAÇÃO DO ADMINISTRADOR → BANCO → SIMULADOR
```

Nada nesta pasta altera o simulador sozinho: os pacotes extraídos só passam a valer depois de carregados em
*Configurações → Legislação → Importar legislação*, revisados e confirmados pelo administrador.

## Estrutura

```
legislacao/
  referencias/
    ibge_cnae_2.3_subclasses.csv        tabela oficial de subclasses CNAE (IBGE), usada só para validar
    ibge_cnae_2.3_subclasses.meta.json  origem, data de acesso e hash da resposta original
  teresina/
    2022/  LC_5788_2022_original_DOM3340.pdf              republicação oficial (DOM nº 3.340, 24/08/2022)
           LC_5788_2022_publicacao_anterior_DOM3339.pdf   1ª publicação, com erro de numeração (histórico)
    2023/  Decreto_24861_2023_original_DOM3609.pdf        texto + Anexos I, II e III (DOM nº 3.609, 28/09/2023)
           Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf   extrato enviado pelo escritório (conferido)
           Decreto_25363_2023_original_DOM3665.pdf        texto + Anexo Único (DOM nº 3.665, 26/12/2023)
           LC_6048_2023_original_DOM3666.pdf              DOM nº 3.666, 27/12/2023
    2025/  Decreto_28436_2025_original_DOM4156.pdf        DOM nº 4.156, 09/12/2025
    dados/
      cnae_anexo_I.csv                    Anexo I: CNAE, descrição, risco ambiental, risco sanitário, competência, documento, página
      cnae_baixo_risco_A_anexo_II.csv     Anexo II: CNAE, descrição, condição para "baixo risco A", documento, página
      cbo_anexo_III.csv                   Anexo III: CBO, título, riscos, documento, página
      alteracoes_decreto_25363_2023.csv   regra anterior × nova regra, norma modificadora, início da vigência, página
      alteracoes_decreto_28436_2025.csv   idem
      revisao_manual.csv                  itens que exigem conferência humana
      relatorio_validacao.md              relatório de validação
      legislacao_teresina.json            tudo consolidado (documentos, normas, pacotes, efeitos, validação)
      importacao/                          pacotes no formato da importação do sistema
        importacao_decreto_24861_2023_redacao_original.csv
        importacao_decreto_25363_2023_alteracoes.csv
        importacao_decreto_28436_2025_alteracoes.csv
        efeitos_licencas.csv               efeito de cada classificação em cada licença, com o artigo que o fundamenta
```

Os arquivos de cada edição são a **edição completa do Diário Oficial**, exatamente como baixada do portal
`https://dom.pmt.pi.gov.br` (assinada digitalmente). As páginas da norma dentro da edição estão nos metadados.

## Situação dos documentos

| Código | Significado |
|---|---|
| `OFICIAL_CONFIRMADO` | arquivo obtido na fonte oficial e conferido |
| `FONTE_SECUNDÁRIA` | obtido em fonte jurídica secundária (só para localizar; não substitui o oficial) |
| `CÓPIA_HTML` | cópia de consulta gerada a partir de página oficial em HTML (nunca apresentada como original) |
| `PENDENTE_CONFERÊNCIA` | registrado, ainda não conferido |
| `NÃO_LOCALIZADO` | documento oficial não encontrado (registrar fontes pesquisadas, URL, problema e data) |

## Regenerar a extração

```bash
python -m pip install --user pdfplumber
python scripts/legislacao/extrair_teresina.py
```

O extrator lê as tabelas pelas linhas de grade do PDF (duas tabelas por página), confere cada CNAE com a tabela do
IBGE, aponta duplicidades, valores não interpretados, alterações conflitantes e células em branco, e grava o relatório.

## Nova legislação

1. Baixe o PDF da fonte oficial e guarde-o sem alteração na pasta do ano.
2. Registre o documento em *Configurações → Legislação → Documentos* (URL oficial, edição, páginas, SHA-256).
3. Extraia, valide, carregue o pacote na importação, revise e aprove. A versão anterior é encerrada, nunca apagada.

A verificação automática de novas publicações está apenas preparada (`src/integrations/legislation/legislation-watch.ts`):
não há raspagem do Diário Oficial.
