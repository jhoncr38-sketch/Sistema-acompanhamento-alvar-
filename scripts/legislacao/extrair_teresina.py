"""
Extração da base legal de Teresina – PI a partir dos PDFs OFICIAIS do Diário Oficial do Município (DOM).

    DOCUMENTO ORIGINAL (legislacao/teresina/<ano>/*.pdf, sem alteração)
      → EXTRAÇÃO (este script, pdfplumber: tabelas pelas linhas de grade)
      → DADOS ESTRUTURADOS (legislacao/teresina/dados/*.csv + legislacao_teresina.json)
      → VALIDAÇÃO (relatorio_validacao.md)
      → PRÉVIA E APROVAÇÃO DO ADMINISTRADOR (Configurações › Legislação › Importar legislação)
      → BANCO → SIMULADOR

Nada aqui altera o banco. Cada linha guarda norma, anexo, documento e página de origem.

Uso:  python -m pip install --user pdfplumber
      python scripts/legislacao/extrair_teresina.py
"""
from __future__ import annotations

import csv
import difflib
import hashlib
import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / 'legislacao' / 'teresina'
OUT = LIB / 'dados'
IMPORT_DIR = OUT / 'importacao'
IBGE = ROOT / 'legislacao' / 'referencias' / 'ibge_cnae_2.3_subclasses.csv'
TODAY = date.today().isoformat()

CNAE_RE = re.compile(r'^\d{4}-\d/\d{2}$')
CBO_RE = re.compile(r'^(\d{6}|\d{4}-\d{2})$')

# ---------------------------------------------------------------------------------------------------------
# Documentos da biblioteca (metadados conferidos no próprio PDF oficial)
# ---------------------------------------------------------------------------------------------------------

DOM_URL = 'https://dom.pmt.pi.gov.br/admin/upload/{}.pdf'
DOCUMENTS = [
    dict(id='lc-5788-2022-dom3340', norma='lc-5788-2022', arquivo='2022/LC_5788_2022_original_DOM3340.pdf', dom='DOM3340-24082022-ASSINADO',
         edicao='DOM nº 3.340', data_publicacao='2022-08-24', paginas='1–3', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom',
         observacoes='Republicação oficial da LC nº 5.788/2022 "por conter incorreção, apenas na sua numeração, na pág. 4 do DOM nº 3.339, de 23.08.2022" (nota na pág. 1). Esta é a publicação válida.'),
    dict(id='lc-5788-2022-dom3339', norma='lc-5788-2022', arquivo='2022/LC_5788_2022_publicacao_anterior_DOM3339.pdf', dom='DOM3339-23082022-ASSINADO',
         edicao='DOM nº 3.339', data_publicacao='2022-08-23', paginas='4', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom',
         observacoes='Primeira publicação, com erro de numeração (consta "Lei Complementar nº 5.787"). Guardada apenas para histórico; vale a republicação do DOM nº 3.340.'),
    dict(id='decreto-24861-2023-dom3609', norma='decreto-24861-2023', arquivo='2023/Decreto_24861_2023_original_DOM3609.pdf', dom='DOM3609-28092023-ASSINADO',
         edicao='DOM nº 3.609', data_publicacao='2023-09-28', paginas='3–19', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom',
         observacoes='Texto nas págs. 3–4; Anexo I nas págs. 4–15; Anexo II nas págs. 15–18; Anexo III nas págs. 18–19.'),
    dict(id='decreto-24861-2023-extrato', norma='decreto-24861-2023', arquivo='2023/Decreto_24861_2023_extrato_pags_3-19_fornecido.pdf', dom=None,
         edicao='DOM nº 3.609 (extrato)', data_publicacao='2023-09-28', paginas='3–19', status='OFICIAL_CONFIRMADO', tipo_arquivo='extrato',
         observacoes='Extrato fornecido pelo escritório (págs. 3–19 do DOM nº 3.609). Texto conferido página a página com a edição oficial completa; a edição completa (com assinatura digital) é a referência.'),
    dict(id='decreto-25363-2023-dom3665', norma='decreto-25363-2023', arquivo='2023/Decreto_25363_2023_original_DOM3665.pdf', dom='DOM3665-26122023-ASSINADO',
         edicao='DOM nº 3.665', data_publicacao='2023-12-26', paginas='12–13', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom',
         observacoes='Texto na pág. 12 (coluna direita) e Anexo Único na pág. 13.'),
    dict(id='lc-6048-2023-dom3666', norma='lc-6048-2023', arquivo='2023/LC_6048_2023_original_DOM3666.pdf', dom='DOM3666-27122023-ASSINADO',
         edicao='DOM nº 3.666', data_publicacao='2023-12-27', paginas='1', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom', observacoes=''),
    dict(id='decreto-28436-2025-dom4156', norma='decreto-28436-2025', arquivo='2025/Decreto_28436_2025_original_DOM4156.pdf', dom='DOM4156-09122025-ASSINADO',
         edicao='DOM nº 4.156', data_publicacao='2025-12-09', paginas='1', status='OFICIAL_CONFIRMADO', tipo_arquivo='edicao_dom', observacoes=''),
]
DOWNLOAD_DATE = '2026-10-04'

NORMS = [
    dict(id='lc-5788-2022', tipo='lei_complementar', numero='5.788', ano=2022, data_norma='2022-08-19', data_publicacao='2022-08-23',
         vigencia_inicio='2022-08-23', documento='lc-5788-2022-dom3340', relacao=None, altera=None,
         ementa_busca=('LEI COMPLEMENTAR Nº 5.788, DE 19 DE AGOSTO DE 2022.', 'O PREFEITO'),
         vigencia_fonte='Art. 37: "Esta Lei Complementar entra em vigor na data de sua publicação." Publicada no DOM nº 3.339 (23/08/2022) e republicada no DOM nº 3.340 (24/08/2022) somente para corrigir a numeração — conferir qual data adotar como início da vigência.'),
    dict(id='decreto-24861-2023', tipo='decreto', numero='24.861', ano=2023, data_norma='2023-09-26', data_publicacao='2023-09-28',
         vigencia_inicio='2023-09-28', documento='decreto-24861-2023-dom3609', relacao=None, altera=None,
         ementa_busca=('DECRETO Nº 24.861, DE 26 DE SETEMBRO DE 2023.', 'O PREFEITO'), vigencia_fonte='Art. 6º: "Este Decreto entra em vigor na data de sua publicação."'),
    dict(id='decreto-25363-2023', tipo='decreto', numero='25.363', ano=2023, data_norma='2023-12-20', data_publicacao='2023-12-26',
         vigencia_inicio='2023-12-26', documento='decreto-25363-2023-dom3665', relacao='altera', altera='decreto-24861-2023',
         ementa_busca=('DECRETO Nº 25.363, DE 20 DE DEZEMBRO DE 2023.', 'O PREFEITO'), vigencia_fonte='Art. 2º: "Este Decreto entra em vigor na data de sua publicação."'),
    dict(id='lc-6048-2023', tipo='lei_complementar', numero='6.048', ano=2023, data_norma='2023-12-27', data_publicacao='2023-12-27',
         vigencia_inicio='2023-12-27', documento='lc-6048-2023-dom3666', relacao='altera', altera='lc-5788-2022',
         ementa_busca=('LEI COMPLEMENTAR Nº 6.048, DE 27 DE DEZEMBRO DE 2023.', 'O PREFEITO'), vigencia_fonte='Art. 4º: "Esta Lei Complementar entra em vigor na data de sua publicação."'),
    dict(id='decreto-28436-2025', tipo='decreto', numero='28.436', ano=2025, data_norma='2025-11-28', data_publicacao='2025-12-09',
         vigencia_inicio='2025-12-09', documento='decreto-28436-2025-dom4156', relacao='altera', altera='decreto-24861-2023',
         ementa_busca=('DECRETO Nº 28.436, DE 28 DE NOVEMBRO DE 2025.', 'O PREFEITO'), vigencia_fonte='Art. 2º: "Este Decreto entra em vigor na data de sua publicação."'),
]

SEARCH_LOG = [
    dict(norma='Todas', fonte='Portal da Prefeitura de Teresina (teresina.pi.gov.br)', url='https://www.teresina.pi.gov.br/', resultado='Aponta o Diário Oficial do Município (dom.pmt.pi.gov.br) como fonte oficial dos atos.'),
    dict(norma='Todas', fonte='Diário Oficial do Município de Teresina (DOM)', url='https://dom.pmt.pi.gov.br/lista_diario.php', resultado='Pesquisa por data e por texto; edições em PDF assinado digitalmente.'),
    dict(norma='Datas de publicação (apoio à localização)', fonte='LegisWeb (fonte secundária)', url='https://www.legisweb.com.br/legislacao/?id=450184',
         resultado='Usada apenas para localizar as datas de publicação (24.861: DOM 28/09/2023; LC 5.788: DOM 24/08/2022; LC 6.048: DOM 27/12/2023). Nenhum texto foi copiado desta fonte.'),
    dict(norma='Outras alterações do Decreto nº 24.861/2023', fonte='DOM — busca textual "24.861"', url='https://dom.pmt.pi.gov.br/lista_diario.php',
         resultado='Edições 3.631 (01/11/2023), 3.848 (16/09/2024), 4.060 (24/07/2025) e 4.116 (09/10/2025) apenas citam o decreto em atos de licenciamento; não contêm alterações. A busca do DOM não é exaustiva: outras alterações devem ser conferidas periodicamente.'),
]

# ---------------------------------------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------------------------------------


def strip_accents(s: str) -> str:
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def letters(s: str) -> str:
    """Somente letras e dígitos, sem acento e em minúsculas (comparação tolerante a quebra de linha e hífen)."""
    return re.sub(r'[^a-z0-9]', '', strip_accents(s).lower())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def load_ibge() -> dict[str, str]:
    with IBGE.open(encoding='utf-8') as f:
        return {r['cnae']: r['descricao'] for r in csv.DictReader(f, delimiter=';')}


IBGE_CNAE = load_ibge()
# termos hifenizados do vocabulário oficial (ex.: "acácia-negra", "coco-da-baía", "pré-escola")
HYPHEN_TERMS = {letters_part for d in IBGE_CNAE.values() for tok in d.split() if '-' in tok
                for letters_part in [strip_accents(tok).lower().strip('.,;:()')]}


def keeps_hyphen(left: str, right: str) -> bool:
    candidate = f"{strip_accents(left).lower().strip('.,;:(')}-{strip_accents(right).lower().strip('.,;:)')}"
    return any(candidate in term for term in HYPHEN_TERMS)


def clean_cell(raw: str | None) -> tuple[str, bool]:
    """Junta as linhas da célula. Hífen de fim de linha some, exceto em termo hifenizado do vocabulário CNAE."""
    text = (raw or '').replace(' ', ' ')
    changed = False

    def join(m: re.Match) -> str:
        nonlocal changed
        changed = True
        left, right = m.group(1), m.group(2)
        return f'{left}-{right}' if keeps_hyphen(left, right) else f'{left}{right}'

    text = re.sub(r'(\S+)-\n(\S+)', join, text)
    text = re.sub(r'\s+', ' ', text.replace('\n', ' ')).strip()
    return text, changed


def column_of(page, bbox) -> int:
    return 0 if (bbox[0] + bbox[2]) / 2 < page.width / 2 else 1


def gutter(page) -> float:
    """Calha entre as duas colunas do DOM: o meio da área com texto (as margens mudam entre páginas pares e ímpares)."""
    words = page.extract_words()
    if not words:
        return page.width / 2
    # posição, perto do centro, cruzada pelo menor número de palavras (ignora selos e textos na margem)
    candidates = range(int(page.width * 0.35), int(page.width * 0.65))
    return float(min(candidates, key=lambda x: (sum(1 for w in words if w['x0'] < x < w['x1']), abs(x - page.width / 2))))


def page_column_text(pdf, page_no: int, column: int, top: float = 0, bottom: float | None = None) -> str:
    p = pdf.pages[page_no - 1]
    mid = gutter(p)
    box = (0, top, mid, bottom or p.height) if column == 0 else (mid, top, p.width, bottom or p.height)
    return p.crop(box).extract_text() or ''


# ---------------------------------------------------------------------------------------------------------
# Classificações e condições
# ---------------------------------------------------------------------------------------------------------

# Denominações usadas nas tabelas da norma → código da classificação no sistema (com o fundamento).
CLASSIFICATIONS = {
    'baixo_risco_a': dict(nome='Baixo Risco A', fundamento='LC nº 5.788/2022, art. 4º, I; Decreto nº 24.861/2023, art. 1º, II e Anexo II'),
    'nao_baixo_risco_a': dict(nome='Não enquadrada como Baixo Risco A', fundamento='Decreto nº 24.861/2023, art. 1º, I (Anexo I: atividades não incluídas em "baixo risco A") e art. 3º, § 2º'),
    'dispensa_licenca': dict(nome='Dispensa de Licença', fundamento='LC nº 5.788/2022, art. 7º; Decreto nº 24.861/2023, art. 4º e Anexo I'),
    'medio_risco': dict(nome='Médio Risco', fundamento='LC nº 5.788/2022, art. 4º, II (redação da LC nº 6.048/2023) e § 2º'),
    'alto_risco': dict(nome='Alto Risco', fundamento='LC nº 5.788/2022, art. 4º, III e § 3º'),
    'competencia_estadual': dict(nome='Competência Estadual', fundamento='Decreto nº 28.436/2025, art. 1º (competência para o licenciamento sanitário)'),
    'baixo_risco': dict(nome='Baixo Risco (Anexo III)', fundamento='Decreto nº 24.861/2023, Anexo III (denominação usada na tabela de CBO)'),
}


def classify(term: str) -> str | None:
    t = letters(term)
    if t.startswith('dispensadelicenca'):
        return 'dispensa_licenca'
    if t in ('altorisco',):
        return 'alto_risco'
    if t in ('mediorisco',):
        return 'medio_risco'
    if t in ('competenciaestadual',):
        return 'competencia_estadual'
    if t in ('baixorisco',):
        return 'baixo_risco'
    return None


UNIT_QUESTION = {'ha': 'area_ha', 'm²': 'area_m2', 'm2': 'area_m2', 'm³': 'volume_m3', 'm3': 'volume_m3'}
QUESTIONS = {
    'area_ha': dict(texto='Área da atividade (em hectares)', tipo='numero', unidade='ha',
                    ajuda='Usada nas faixas do Anexo I do Decreto nº 24.861/2023 ("menor ou igual a 01 ha"). A norma não detalha a forma de medição: confirme com o órgão ambiental.'),
    'area_m2': dict(texto='Área utilizada pela atividade (m²)', tipo='numero', unidade='m²',
                    ajuda='Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 20m²"). A norma não detalha a forma de medição: confirme com o órgão ambiental.'),
    'volume_m3': dict(texto='Volume referente à atividade (m³)', tipo='numero', unidade='m³',
                      ajuda='Usada nas faixas do Anexo I do Decreto nº 24.861/2023 (ex.: "menor ou igual a 200m³"). A norma não diz a que volume se refere: confirme com o órgão ambiental.'),
}
RANGE_RE = re.compile(
    r'^menor ou igual a\s*([\d.,]+)\s*(ha|m²|m2|m³|m3)\s*:?\s*(.+?)\s*/\s*maior que\s*([\d.,]+)\s*(ha|m²|m2|m³|m3)\s*:?\s*(.+)$', re.I)


def parse_value(raw: str) -> dict:
    """Uma célula de risco: classificação simples ou faixa "menor ou igual a X: A / maior que X: B"."""
    text = raw.strip()
    simple = classify(text)
    if simple:
        return dict(ok=True, classificacao=simple)
    m = RANGE_RE.match(text)
    if m:
        lim1, u1, a, lim2, u2, b = m.groups()
        ca, cb = classify(a), classify(b)
        n1 = float(lim1.replace('.', '').replace(',', '.'))
        n2 = float(lim2.replace('.', '').replace(',', '.'))
        if ca and cb and n1 == n2 and UNIT_QUESTION[u1.lower()] == UNIT_QUESTION[u2.lower()]:
            q = UNIT_QUESTION[u1.lower()]
            limit = int(n1) if n1.is_integer() else n1
            return dict(ok=True, classificacao=ca, condicao=f'{q} <= {limit}', senao=cb, pergunta=q)
    return dict(ok=False, motivo=f'valor não interpretado: "{text}"')


# ---------------------------------------------------------------------------------------------------------
# Registro de problemas (relatório de validação)
# ---------------------------------------------------------------------------------------------------------


@dataclass
class Report:
    problems: list[dict] = field(default_factory=list)

    def add(self, severity: str, kind: str, message: str, **ctx) -> None:
        self.problems.append(dict(gravidade=severity, tipo=kind, mensagem=message, **ctx))

    def count(self, severity: str | None = None, kind: str | None = None) -> int:
        return sum(1 for p in self.problems if (not severity or p['gravidade'] == severity) and (not kind or p['tipo'] == kind))


REPORT = Report()


def check_description(code: str, desc: str, ctx: dict) -> str:
    """Compara a descrição da norma com a descrição oficial do IBGE (CNAE 2.3)."""
    official = IBGE_CNAE.get(code.replace('-', '').replace('/', ''))
    if official is None:
        REPORT.add('erro', 'cnae_invalido', f'CNAE {code} não existe na tabela oficial do IBGE (CNAE 2.3).', **ctx)
        return 'inexistente'
    if not desc:
        REPORT.add('erro', 'descricao_vazia', f'CNAE {code} sem descrição na norma.', **ctx)
        return 'vazia'
    if letters(desc) == letters(official):
        return 'igual'
    ratio = difflib.SequenceMatcher(None, letters(desc), letters(official)).ratio()
    if ratio < 0.85:
        REPORT.add('aviso', 'descricao_diverge_ibge', f'CNAE {code}: descrição da norma difere da oficial do IBGE (semelhança {ratio:.0%}). Norma: "{desc}" · IBGE: "{official}".', **ctx)
        return f'diferente ({ratio:.0%})'
    return f'semelhante ({ratio:.0%})'


# ---------------------------------------------------------------------------------------------------------
# Decreto nº 24.861/2023 — Anexos I, II e III
# ---------------------------------------------------------------------------------------------------------

DEC24861 = LIB / '2023' / 'Decreto_24861_2023_original_DOM3609.pdf'
DOC24861 = 'Decreto_24861_2023_original_DOM3609.pdf'


def extract_24861() -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    annex_i, annex_ii, annex_iii, ignored = [], [], [], []
    with pdfplumber.open(DEC24861) as pdf:
        headings = []
        for pn in range(3, 20):
            page = pdf.pages[pn - 1]
            for w in page.search(r'ANEXO\s+(I{1,3})\b'):
                headings.append(((pn, column_of(page, (w['x0'], 0, w['x1'], 0)), w['top']), w['groups'][0] if w.get('groups') else w['text'].split()[-1]))
        headings.sort()
        labels = [h[1] for h in headings]
        if labels != ['I', 'II', 'III']:
            sys.exit(f'Títulos de anexo inesperados no DOM 3.609: {headings}. Confira o layout antes de extrair.')

        def annex_at(key):
            current = None
            for pos, label in headings:
                if key >= pos:
                    current = label
            return current

        for pn in range(4, 20):
            page = pdf.pages[pn - 1]
            for ti, table in enumerate(page.find_tables()):
                col = column_of(page, table.bbox)
                annex = annex_at((pn, col, table.bbox[1]))
                for ri, raw in enumerate(table.extract()):
                    cells = [clean_cell(c) for c in raw]
                    values = [c[0] for c in cells]
                    ctx = dict(norma='Decreto nº 24.861/2023', anexo=annex, documento=DOC24861, pagina=pn, linha_tabela=ri + 1)
                    first = values[0] if values else ''
                    if first.upper().startswith('CÓDIGO'):
                        continue
                    if annex in ('I', 'III') and len(values) == 4 and (CNAE_RE.match(first) if annex == 'I' else CBO_RE.match(first)):
                        row = dict(codigo=first, descricao=values[1], risco_ambiental=values[2], risco_sanitario=values[3], pagina=pn,
                                   hifen_ajustado=any(c[1] for c in cells[1:2]), **{'coluna_pagina': 'esquerda' if col == 0 else 'direita'})
                        (annex_i if annex == 'I' else annex_iii).append(row)
                    elif annex == 'II' and len(values) == 3 and CNAE_RE.match(first):
                        cond = values[2]
                        annex_ii.append(dict(codigo=first, descricao=values[1], condicao='' if cond.strip() == '***' else cond, pagina=pn,
                                             coluna_pagina='esquerda' if col == 0 else 'direita'))
                    elif annex == 'III' and pn == 19 and len(values) in (2, 5):
                        # tabelas orçamentárias de outros atos publicados na mesma página — fora do decreto
                        ignored.append(dict(pagina=pn, conteudo=' | '.join(values)[:160]))
                    else:
                        REPORT.add('erro', 'linha_nao_interpretada', f'Linha da tabela não interpretada: {values}', **ctx)
    return annex_i, annex_ii, annex_iii, ignored


# ---------------------------------------------------------------------------------------------------------
# Decretos de alteração (Anexo I)
# ---------------------------------------------------------------------------------------------------------

UNCHANGED = re.compile(r'^(\.{3,}|\(\.\.\.\))$')


def extract_amendment(path: Path, doc_name: str, page_no: int, norm_label: str) -> list[dict]:
    rows = []
    with pdfplumber.open(path) as pdf:
        page = pdf.pages[page_no - 1]
        for table in page.find_tables():
            for ri, raw in enumerate(table.extract()):
                cells = [clean_cell(c)[0] for c in raw]
                if len(cells) != 4 or not CNAE_RE.match(cells[0]):
                    if cells and CNAE_RE.match(cells[0] or ''):
                        REPORT.add('erro', 'linha_nao_interpretada', f'{norm_label}: linha fora do padrão {cells}', norma=norm_label, documento=doc_name, pagina=page_no)
                    continue
                rows.append(dict(codigo=cells[0], descricao=cells[1], ambiental=cells[2], sanitario=cells[3], pagina=page_no, documento=doc_name,
                                 col='esquerda' if column_of(page, table.bbox) == 0 else 'direita', y=table.bbox[1], ri=ri))
    rows.sort(key=lambda r: (r['col'] != 'esquerda', r['y'], r['ri']))
    return rows


# ---------------------------------------------------------------------------------------------------------
# Ementas (texto do próprio PDF oficial)
# ---------------------------------------------------------------------------------------------------------


def extract_ementa(path: Path, start: str, end: str, pages: list[int]) -> str | None:
    # texto em ordem de leitura (coluna esquerda, depois direita, página a página): a ementa pode continuar na coluna seguinte
    with pdfplumber.open(path) as pdf:
        flat = ' '.join(re.sub(r'\s+', ' ', page_column_text(pdf, pn, col)) for pn in pages for col in (0, 1))
    i = flat.find(start)
    if i < 0:
        return None
    j = flat.find(end, i + len(start))
    if j < 0:
        return None
    ementa = flat[i + len(start):j].strip()
    # remove o rodapé/ID de publicação e o cabeçalho da página que ficam entre as colunas
    ementa = re.sub(r'\s*ID: \d+\s*', ' ', ementa)
    ementa = re.sub(r'\s*(Segunda|Terça|Quarta|Quinta|Sexta)-feira, \d{1,2} de \w+ de \d{4}\s*\d*\s*', ' ', ementa)
    ementa = re.sub(r'\s*DOM - Teresina - Ano \d{4} - nº [\d.]+\s*', ' ', ementa)
    return re.sub(r'(\w)- (\w)', r'\1\2', ementa).strip()


# ---------------------------------------------------------------------------------------------------------
# Saída
# ---------------------------------------------------------------------------------------------------------


def write_csv(path: Path, header: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=header, delimiter=';', extrasaction='ignore')
        writer.writeheader()
        writer.writerows(rows)


IMPORT_HEADER = ['cnae', 'cbo', 'descricao', 'anexo', 'area', 'classificacao', 'condicao_texto', 'condicao', 'classificacao_se_nao_atender',
                 'ordem', 'artigo', 'item', 'observacoes', 'resumo', 'acao', 'documento', 'pagina']
AREA = {'ambiental': 'Ambiental', 'sanitario': 'Sanitária'}


def import_rows_for_area(code: str, desc: str, annex: str, area: str, raw: str, parsed: dict, doc: str, page: int, article: str, action: str = '', cbo: bool = False) -> list[dict]:
    base = dict(cnae='' if cbo else code, cbo=code if cbo else '', descricao=desc, anexo=annex, area=AREA[area], artigo=article,
                documento=doc, pagina=page, acao=action, resumo=f'Grau de risco {"ambiental" if area == "ambiental" else "sanitário"}: {raw}')
    if not parsed['ok']:
        return []
    name = CLASSIFICATIONS[parsed['classificacao']]['nome']
    row = dict(base, classificacao=name, ordem=1)
    if parsed.get('condicao'):
        row.update(condicao=parsed['condicao'], classificacao_se_nao_atender=CLASSIFICATIONS[parsed['senao']]['nome'])
    return [row]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. documentos: hash e tamanho dos arquivos guardados
    documents = []
    for d in DOCUMENTS:
        path = LIB / d['arquivo']
        if not path.exists():
            REPORT.add('erro', 'documento_ausente', f'Arquivo não encontrado: {d["arquivo"]}')
            continue
        documents.append(dict(d, url_oficial=DOM_URL.format(d['dom']) if d['dom'] else None, sha256=sha256(path), tamanho_bytes=path.stat().st_size,
                              data_download=DOWNLOAD_DATE, municipio='Teresina', uf='PI', fonte='Diário Oficial do Município de Teresina (DOM)'))

    # 2. ementas extraídas do texto oficial
    norms = []
    for n in NORMS:
        doc = next(d for d in DOCUMENTS if d['id'] == n['documento'])
        pages = [int(p) for p in re.findall(r'\d+', doc['paginas'])]
        pages = list(range(pages[0], (pages[-1] if len(pages) > 1 else pages[0]) + 1))
        ementa = extract_ementa(LIB / doc['arquivo'], n['ementa_busca'][0], n['ementa_busca'][1], pages)
        if not ementa:
            REPORT.add('aviso', 'ementa_nao_extraida', f'Ementa de {n["id"]} não extraída automaticamente: conferir no documento.', documento=doc['arquivo'])
        norms.append({k: v for k, v in n.items() if k != 'ementa_busca'} | dict(ementa=ementa))
        if 'conferir' in n['vigencia_fonte']:
            REPORT.add('aviso', 'vigencia_a_conferir', f'{n["id"]}: {n["vigencia_fonte"]}', documento=doc['arquivo'])

    # 3. Decreto nº 24.861/2023
    annex_i, annex_ii, annex_iii, ignored = extract_24861()
    art = {'I': 'Art. 1º, I (Anexo I)', 'II': 'Art. 1º, II e art. 2º (Anexo II)', 'III': 'Art. 1º, III (Anexo III)'}

    seen: dict[str, str] = {}
    conference_i, conference_ii, conference_iii, review = [], [], [], []
    import_original: list[dict] = []
    questions_used: set[str] = set()

    for r in annex_i:
        ctx = dict(norma='Decreto nº 24.861/2023', anexo='I', documento=DOC24861, pagina=r['pagina'], codigo=r['codigo'])
        if r['codigo'] in seen:
            REPORT.add('erro', 'cnae_duplicado', f'CNAE {r["codigo"]} aparece mais de uma vez (Anexo {seen[r["codigo"]]} e Anexo I).', **ctx)
        seen[r['codigo']] = 'I'
        ibge = check_description(r['codigo'], r['descricao'], ctx)
        amb, san = parse_value(r['risco_ambiental']), parse_value(r['risco_sanitario'])
        problems = []
        for label, parsed, raw in (('ambiental', amb, r['risco_ambiental']), ('sanitário', san, r['risco_sanitario'])):
            if not raw:
                REPORT.add('erro', 'classificacao_vazia', f'CNAE {r["codigo"]}: risco {label} vazio.', **ctx)
                problems.append(f'risco {label} vazio')
            elif not parsed['ok']:
                REPORT.add('erro', 'condicao_incompleta', f'CNAE {r["codigo"]}: risco {label} — {parsed["motivo"]}.', **ctx)
                problems.append(parsed['motivo'])
            elif parsed.get('pergunta'):
                questions_used.add(parsed['pergunta'])
        conference_i.append(dict(cnae=r['codigo'], descricao=r['descricao'], risco_ambiental=r['risco_ambiental'], risco_sanitario=r['risco_sanitario'],
                                 competencia='Estadual (sanitário)' if san.get('classificacao') == 'competencia_estadual' else '',
                                 observacoes='; '.join(problems), descricao_ibge=ibge, norma='Decreto nº 24.861/2023', anexo='I',
                                 documento=DOC24861, pagina=r['pagina'], vigencia_inicio='2023-09-28', status_extracao='revisar' if problems else 'ok'))
        if problems:
            review.append(dict(codigo=r['codigo'], anexo='I', pagina=r['pagina'], motivo='; '.join(problems)))
            continue
        import_original.append(dict(cnae=r['codigo'], descricao=r['descricao'], anexo='I', area='geral', classificacao=CLASSIFICATIONS['nao_baixo_risco_a']['nome'],
                                    ordem=1, artigo='Art. 1º, I e art. 3º, § 2º', documento=DOC24861, pagina=r['pagina'],
                                    resumo='Atividade do Anexo I (não incluída em "baixo risco A"): sujeita ao Alvará de Funcionamento e aos licenciamentos (art. 3º, § 2º).'))
        import_original += import_rows_for_area(r['codigo'], r['descricao'], 'I', 'ambiental', r['risco_ambiental'], amb, DOC24861, r['pagina'], art['I'])
        import_original += import_rows_for_area(r['codigo'], r['descricao'], 'I', 'sanitario', r['risco_sanitario'], san, DOC24861, r['pagina'], art['I'])

    for r in annex_ii:
        ctx = dict(norma='Decreto nº 24.861/2023', anexo='II', documento=DOC24861, pagina=r['pagina'], codigo=r['codigo'])
        if r['codigo'] in seen:
            REPORT.add('erro', 'cnae_duplicado', f'CNAE {r["codigo"]} aparece no Anexo {seen[r["codigo"]]} e no Anexo II.', **ctx)
        seen[r['codigo']] = 'II'
        ibge = check_description(r['codigo'], r['descricao'], ctx)
        conference_ii.append(dict(cnae=r['codigo'], descricao=r['descricao'], baixo_risco_a='Sim, condicionado' if r['condicao'] else 'Sim',
                                  condicao_enquadramento=r['condicao'], observacoes='', descricao_ibge=ibge, norma='Decreto nº 24.861/2023', anexo='II',
                                  documento=DOC24861, pagina=r['pagina'], vigencia_inicio='2023-09-28', status_extracao='ok'))
        import_original.append(dict(cnae=r['codigo'], descricao=r['descricao'], anexo='II', area='geral', classificacao=CLASSIFICATIONS['baixo_risco_a']['nome'],
                                    condicao_texto=r['condicao'], ordem=1, artigo=art['II'], documento=DOC24861, pagina=r['pagina'],
                                    resumo='Atividade de "baixo risco A" (Anexo II): dispensa do Alvará de Funcionamento e dos licenciamentos municipais (art. 2º).'
                                    + (' Enquadramento condicionado ao texto da norma.' if r['condicao'] else '')))

    for r in annex_iii:
        ctx = dict(norma='Decreto nº 24.861/2023', anexo='III', documento=DOC24861, pagina=r['pagina'], codigo=r['codigo'])
        code = r['codigo'].replace('-', '')
        if f'cbo:{code}' in seen:
            REPORT.add('erro', 'cbo_duplicado', f'CBO {code} repetido no Anexo III.', **ctx)
        seen[f'cbo:{code}'] = 'III'
        if not r['descricao']:
            REPORT.add('erro', 'descricao_vazia', f'CBO {code} sem título.', **ctx)
        amb, san = parse_value(r['risco_ambiental']), parse_value(r['risco_sanitario'])
        problems = [p['motivo'] for p in (amb, san) if not p['ok']]
        conference_iii.append(dict(cbo=code, descricao=r['descricao'], risco_ambiental=r['risco_ambiental'], risco_sanitario=r['risco_sanitario'],
                                   classificacao=' / '.join(CLASSIFICATIONS[p['classificacao']]['nome'] for p in (amb, san) if p['ok']),
                                   condicoes='', observacoes='; '.join(problems), norma='Decreto nº 24.861/2023', anexo='III', documento=DOC24861,
                                   pagina=r['pagina'], vigencia_inicio='2023-09-28', status_extracao='revisar' if problems else 'ok'))
        if problems:
            review.append(dict(codigo=code, anexo='III', pagina=r['pagina'], motivo='; '.join(problems)))
            continue
        import_original += import_rows_for_area(code, r['descricao'], 'III', 'ambiental', r['risco_ambiental'], amb, DOC24861, r['pagina'], art['III'], cbo=True)
        import_original += import_rows_for_area(code, r['descricao'], 'III', 'sanitario', r['risco_sanitario'], san, DOC24861, r['pagina'], art['III'], cbo=True)

    # cobertura: Anexos I + II devem cobrir a tabela CNAE sem repetição
    covered = {c.replace('-', '').replace('/', '') for c, a in seen.items() if not c.startswith('cbo:')}
    missing = sorted(set(IBGE_CNAE) - covered)
    for code in missing:
        REPORT.add('aviso', 'cnae_sem_classificacao', f'CNAE {code} ({IBGE_CNAE[code]}) não consta nos Anexos I nem II.', norma='Decreto nº 24.861/2023')

    # 4. alterações: Decreto nº 25.363/2023 (risco ambiental) e nº 28.436/2025 (risco sanitário)
    current = {r['cnae']: dict(ambiental=r['risco_ambiental'], sanitario=r['risco_sanitario'], descricao=r['descricao']) for r in conference_i}
    annex_ii_codes = {r['cnae'] for r in conference_ii}
    amendments_out = {}
    import_amendments = {}
    for norm_id, label, file_name, page_no, column, start in (
        ('decreto-25363-2023', 'Decreto nº 25.363/2023', 'Decreto_25363_2023_original_DOM3665.pdf', 13, 'ambiental', '2023-12-26'),
        ('decreto-28436-2025', 'Decreto nº 28.436/2025', 'Decreto_28436_2025_original_DOM4156.pdf', 1, 'sanitario', '2025-12-09'),
    ):
        year = label[-4:]
        rows = extract_amendment(LIB / year / file_name, file_name, page_no, label)
        out, imp = [], []
        for r in rows:
            ctx = dict(norma=label, anexo='I', documento=file_name, pagina=r['pagina'], codigo=r['codigo'])
            check_description(r['codigo'], r['descricao'], ctx)
            other = 'sanitario' if column == 'ambiental' else 'ambiental'
            new_raw = r[column]
            other_raw = r[other]
            if not other_raw or UNCHANGED.match(other_raw):
                if not other_raw:
                    REPORT.add('aviso', 'celula_vazia_sem_alteracao',
                               f'{label}: CNAE {r["codigo"]} com o risco {"sanitário" if other == "sanitario" else "ambiental"} em branco — interpretado como "sem alteração" (as demais linhas usam "....."). Conferir.', **ctx)
            else:
                REPORT.add('erro', 'alteracao_coluna_inesperada', f'{label}: CNAE {r["codigo"]} altera também a coluna {other} ("{other_raw}"). Conferir.', **ctx)
            previous = current.get(r['codigo'])
            if previous is None:
                where = 'Anexo II ("baixo risco A")' if r['codigo'] in annex_ii_codes else 'nenhum anexo'
                REPORT.add('erro', 'alteracao_conflitante', f'{label} altera o Anexo I para o CNAE {r["codigo"]}, que na redação vigente consta em {where}. Revisão jurídica necessária.', **ctx)
            parsed = parse_value(new_raw)
            if not parsed['ok']:
                REPORT.add('erro', 'condicao_incompleta', f'{label}: CNAE {r["codigo"]} — {parsed["motivo"]}.', **ctx)
                review.append(dict(codigo=r['codigo'], anexo=f'I ({label})', pagina=r['pagina'], motivo=parsed['motivo']))
            elif parsed.get('pergunta'):
                questions_used.add(parsed['pergunta'])
            before = previous[column] if previous else ''
            out.append(dict(cnae=r['codigo'], descricao=r['descricao'], area='Risco ambiental' if column == 'ambiental' else 'Risco sanitário',
                            regra_anterior=before or '(não constava no Anexo I)', nova_regra=new_raw, norma_original='Decreto nº 24.861/2023',
                            norma_modificadora=label, inicio_vigencia=start, documento=file_name, pagina=r['pagina'],
                            situacao='alterada' if previous and letters(before) != letters(new_raw) else ('sem mudança efetiva' if previous else 'conflito'),
                            status_extracao='revisar' if (not parsed['ok'] or previous is None) else 'ok'))
            if previous and letters(before) == letters(new_raw):
                REPORT.add('aviso', 'alteracao_sem_efeito', f'{label}: CNAE {r["codigo"]} — nova redação igual à anterior ("{new_raw}").', **ctx)
            if parsed['ok'] and previous is not None:
                imp += import_rows_for_area(r['codigo'], r['descricao'], 'I', column, new_raw, parsed, file_name, r['pagina'],
                                            f'{label}, art. 1º (nova redação do Anexo I do Decreto nº 24.861/2023)', action='alterar')
                current[r['codigo']][column] = new_raw
        amendments_out[norm_id] = out
        import_amendments[norm_id] = imp

    # 5. arquivos de conferência
    write_csv(OUT / 'cnae_anexo_I.csv', ['cnae', 'descricao', 'risco_ambiental', 'risco_sanitario', 'competencia', 'observacoes', 'descricao_ibge',
                                         'norma', 'anexo', 'documento', 'pagina', 'vigencia_inicio', 'status_extracao'], conference_i)
    write_csv(OUT / 'cnae_baixo_risco_A_anexo_II.csv', ['cnae', 'descricao', 'baixo_risco_a', 'condicao_enquadramento', 'observacoes', 'descricao_ibge',
                                                        'norma', 'anexo', 'documento', 'pagina', 'vigencia_inicio', 'status_extracao'], conference_ii)
    write_csv(OUT / 'cbo_anexo_III.csv', ['cbo', 'descricao', 'risco_ambiental', 'risco_sanitario', 'classificacao', 'condicoes', 'observacoes',
                                          'norma', 'anexo', 'documento', 'pagina', 'vigencia_inicio', 'status_extracao'], conference_iii)
    alt_header = ['cnae', 'descricao', 'area', 'regra_anterior', 'nova_regra', 'norma_original', 'norma_modificadora', 'inicio_vigencia',
                  'documento', 'pagina', 'situacao', 'status_extracao']
    write_csv(OUT / 'alteracoes_decreto_25363_2023.csv', alt_header, amendments_out['decreto-25363-2023'])
    write_csv(OUT / 'alteracoes_decreto_28436_2025.csv', alt_header, amendments_out['decreto-28436-2025'])
    for p in REPORT.problems:
        if p['tipo'] in ('celula_vazia_sem_alteracao', 'descricao_diverge_ibge', 'ementa_nao_extraida', 'alteracao_conflitante', 'vigencia_a_conferir'):
            review.append(dict(codigo=p.get('codigo', ''), anexo=p.get('anexo', ''), pagina=p.get('pagina', ''), motivo=p['mensagem']))
    write_csv(OUT / 'revisao_manual.csv', ['codigo', 'anexo', 'pagina', 'motivo'], review)

    # 6. pacotes de importação (passam pela prévia + revisão + aprovação no sistema)
    packages = [
        dict(id='decreto-24861-2023-redacao-original', arquivo='importacao/importacao_decreto_24861_2023_redacao_original.csv', norma='decreto-24861-2023',
             modo='completo', destino='nova_versao', versao=dict(rotulo='Redação original (Decreto nº 24.861/2023)', inicio='2023-09-28', fim=None, alterada_por=None,
                                                                 maior_risco_prevalece=True, fundamento_maior_risco='Decreto nº 24.861/2023, art. 5º',
                                                                 fonte=DOM_URL.format('DOM3609-28092023-ASSINADO')),
             efeitos=True, linhas=len(import_original)),
        dict(id='decreto-25363-2023-alteracoes', arquivo='importacao/importacao_decreto_25363_2023_alteracoes.csv', norma='decreto-24861-2023',
             modo='parcial', destino='nova_versao', versao=dict(rotulo='Redação dada pelo Decreto nº 25.363/2023', inicio='2023-12-26', fim=None, alterada_por='decreto-25363-2023',
                                                               maior_risco_prevalece=True, fundamento_maior_risco='Decreto nº 24.861/2023, art. 5º',
                                                               fonte=DOM_URL.format('DOM3665-26122023-ASSINADO')),
             efeitos=False, linhas=len(import_amendments['decreto-25363-2023'])),
        dict(id='decreto-28436-2025-alteracoes', arquivo='importacao/importacao_decreto_28436_2025_alteracoes.csv', norma='decreto-24861-2023',
             modo='parcial', destino='nova_versao', versao=dict(rotulo='Redação dada pelo Decreto nº 28.436/2025', inicio='2025-12-09', fim=None, alterada_por='decreto-28436-2025',
                                                               maior_risco_prevalece=True, fundamento_maior_risco='Decreto nº 24.861/2023, art. 5º',
                                                               fonte=DOM_URL.format('DOM4156-09122025-ASSINADO')),
             efeitos=False, linhas=len(import_amendments['decreto-28436-2025'])),
    ]
    write_csv(OUT / packages[0]['arquivo'], IMPORT_HEADER, import_original)
    write_csv(OUT / packages[1]['arquivo'], IMPORT_HEADER, import_amendments['decreto-25363-2023'])
    write_csv(OUT / packages[2]['arquivo'], IMPORT_HEADER, import_amendments['decreto-28436-2025'])

    # efeitos de cada classificação nas licenças, com o fundamento legal
    effects = [
        ('baixo_risco_a', 'alvara', 'dispensada', 'Decreto nº 24.861/2023, art. 2º; LC nº 5.788/2022, art. 5º'),
        ('baixo_risco_a', 'vigilancia', 'dispensada', 'Decreto nº 24.861/2023, art. 2º ("demais licenciamentos municipais, tais como Licenças Ambientais e Sanitárias")'),
        ('baixo_risco_a', 'ambiental', 'dispensada', 'Decreto nº 24.861/2023, art. 2º ("demais licenciamentos municipais, tais como Licenças Ambientais e Sanitárias")'),
        ('baixo_risco_a', 'bombeiros', 'analise_separada', 'Decreto nº 24.861/2023, art. 3º: a dispensa não exime das normas de prevenção contra incêndio e pânico, fiscalizadas pelos órgãos competentes'),
        ('nao_baixo_risco_a', 'alvara', 'exigivel', 'Decreto nº 24.861/2023, art. 3º, § 2º; LC nº 5.788/2022, art. 11 (redação da LC nº 6.048/2023)'),
        ('nao_baixo_risco_a', 'bombeiros', 'analise_separada', 'Prevenção contra incêndio e pânico: competência do Corpo de Bombeiros (Decreto nº 24.861/2023, art. 3º)'),
        ('dispensa_licenca', 'vigilancia', 'dispensada', 'Decreto nº 24.861/2023, art. 4º, I: Declaração de Dispensa de Licença Sanitária, após solicitação e pagamento da taxa; não dispensa o Alvará (§ 1º)'),
        ('dispensa_licenca', 'ambiental', 'dispensada', 'Decreto nº 24.861/2023, art. 4º, II: Declaração de Dispensa de Licença Ambiental de Operação (LO), após solicitação e pagamento da taxa; não dispensa o Alvará (§ 1º)'),
        ('medio_risco', 'vigilancia', 'exigivel', 'LC nº 5.788/2022, art. 4º, II (redação da LC nº 6.048/2023): emissão automática após o registro; vistoria posterior (§ 2º)'),
        ('medio_risco', 'ambiental', 'exigivel', 'LC nº 5.788/2022, art. 4º, II e § 5º (redação da LC nº 6.048/2023): não afasta as regras de licenças ambientais'),
        ('alto_risco', 'vigilancia', 'exigivel', 'LC nº 5.788/2022, art. 4º, III e § 3º: vistoria prévia'),
        ('alto_risco', 'ambiental', 'exigivel', 'LC nº 5.788/2022, art. 4º, III e § 3º: vistoria prévia'),
        ('competencia_estadual', 'vigilancia', 'analise_separada', 'Decreto nº 28.436/2025, art. 1º: licenciamento sanitário de competência estadual'),
    ]
    effects_rows = [dict(classificacao=CLASSIFICATIONS[c]['nome'], classificacao_codigo=c, licenca=lic, efeito=e, fundamento=f) for c, lic, e, f in effects]
    write_csv(OUT / 'importacao' / 'efeitos_licencas.csv', ['classificacao', 'classificacao_codigo', 'licenca', 'efeito', 'fundamento'], effects_rows)

    # 7. relatório de validação
    totals = dict(
        cnaes_encontrados=len(annex_i) + len(annex_ii), cnaes_anexo_i=len(annex_i), cnaes_baixo_risco_a=len(annex_ii),
        cnaes_baixo_risco_a_condicionados=sum(1 for r in annex_ii if r['condicao']), cbos_anexo_iii=len(annex_iii),
        condicoes_especiais=sum(1 for r in conference_i if 'menor ou igual' in (r['risco_ambiental'] + r['risco_sanitario']).lower()) + sum(1 for r in annex_ii if r['condicao']),
        cnaes_competencia_estadual=sum(1 for r in conference_i if r['competencia']),
        alteracoes_posteriores=sum(len(v) for v in amendments_out.values()),
        alteracoes_25363=len(amendments_out['decreto-25363-2023']), alteracoes_28436=len(amendments_out['decreto-28436-2025']),
        registros_revisao_manual=len(review),
        erros=REPORT.count('erro'), avisos=REPORT.count('aviso'), cnaes_ibge=len(IBGE_CNAE), cnaes_fora_dos_anexos=len(missing),
        linhas_ignoradas_outros_atos=len(ignored),
        descricoes_iguais_ibge=sum(1 for r in conference_i + conference_ii if r['descricao_ibge'] == 'igual'),
    )
    write_report(totals, documents, ignored, sorted(questions_used))

    # 8. JSON consolidado
    data = dict(
        gerado_em=TODAY, gerador='scripts/legislacao/extrair_teresina.py', municipio='Teresina', uf='PI',
        aviso='Dados extraídos dos PDFs oficiais do DOM de Teresina. Só entram no simulador após prévia, revisão e aprovação do administrador.',
        documentos=documents, normas=norms, pesquisa=SEARCH_LOG,
        classificacoes=[dict(codigo=k, **v) for k, v in CLASSIFICATIONS.items()],
        perguntas=[dict(codigo=k, **QUESTIONS[k]) for k in sorted(questions_used)],
        efeitos=effects_rows, pacotes=packages, totais=totals,
        anexo_i=conference_i, anexo_ii=conference_ii, anexo_iii=conference_iii,
        alteracoes=amendments_out['decreto-25363-2023'] + amendments_out['decreto-28436-2025'],
        revisao_manual=review, problemas=REPORT.problems,
    )
    (OUT / 'legislacao_teresina.json').write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(totals, ensure_ascii=False, indent=1))


def write_report(totals: dict, documents: list[dict], ignored: list[dict], questions: list[str]) -> None:
    lines = [
        '# Relatório de validação — base legal de Teresina – PI', '',
        f'Gerado em {TODAY} por `scripts/legislacao/extrair_teresina.py` a partir dos PDFs oficiais do DOM.', '',
        '> Os dados abaixo **não** estão no simulador. Entram somente pela importação revisada (prévia → revisão → aprovação do administrador).', '',
        '## Documentos', '', '| Documento | Edição | Págs. | Status | SHA-256 |', '|---|---|---|---|---|',
    ]
    for d in documents:
        lines.append(f'| `{Path(d["arquivo"]).name}` | {d["edicao"]} de {d["data_publicacao"]} | {d["paginas"]} | {d["status"]} | `{d["sha256"][:16]}…` |')
    lines += ['', '## Totais', '', '| Item | Quantidade |', '|---|---|']
    labels = dict(cnaes_encontrados='CNAEs encontrados (Anexos I + II)', cnaes_anexo_i='CNAEs no Anexo I', cnaes_baixo_risco_a='CNAEs "baixo risco A" (Anexo II)',
                  cnaes_baixo_risco_a_condicionados='… dos quais com condição para o enquadramento', cbos_anexo_iii='CBOs no Anexo III',
                  condicoes_especiais='Condições especiais (faixas de área/volume + condições do Anexo II)', cnaes_competencia_estadual='CNAEs com risco sanitário "Competência Estadual"',
                  alteracoes_posteriores='Alterações posteriores (linhas)', alteracoes_25363='… Decreto nº 25.363/2023 (risco ambiental)',
                  alteracoes_28436='… Decreto nº 28.436/2025 (risco sanitário)', registros_revisao_manual='Registros que precisam de revisão manual',
                  erros='Erros', avisos='Avisos', cnaes_ibge='Subclasses na tabela oficial do IBGE (CNAE 2.3)', cnaes_fora_dos_anexos='Subclasses do IBGE fora dos Anexos I e II',
                  descricoes_iguais_ibge='Descrições idênticas às do IBGE (normalizadas)', linhas_ignoradas_outros_atos='Linhas de outros atos na mesma página (ignoradas)')
    for k, label in labels.items():
        lines.append(f'| {label} | {totals[k]} |')
    lines += ['', '## Verificações', '', '| Verificação | Resultado |', '|---|---|']
    checks = [('CNAEs duplicados', 'cnae_duplicado'), ('CNAEs inválidos (fora da tabela IBGE)', 'cnae_invalido'), ('Descrições vazias', 'descricao_vazia'),
              ('Classificações vazias', 'classificacao_vazia'), ('Condições incompletas / valores não interpretados', 'condicao_incompleta'),
              ('Linhas não interpretadas', 'linha_nao_interpretada'), ('Alterações conflitantes', 'alteracao_conflitante'),
              ('Alteração em coluna não prevista', 'alteracao_coluna_inesperada'), ('Alteração sem efeito', 'alteracao_sem_efeito'),
              ('Célula em branco interpretada como "sem alteração"', 'celula_vazia_sem_alteracao'), ('Descrição diverge do IBGE', 'descricao_diverge_ibge'),
              ('Subclasses sem classificação', 'cnae_sem_classificacao'), ('Registros sem fonte', 'documento_ausente'), ('Ementa não extraída', 'ementa_nao_extraida'), ('Vigência a conferir', 'vigencia_a_conferir')]
    for label, kind in checks:
        n = REPORT.count(kind=kind)
        lines.append(f'| {label} | {"✅ nenhum" if n == 0 else f"⚠️ {n}"} |')
    lines += ['| Registros sem vigência | ✅ nenhum (vigência = data de publicação, conforme o artigo de vigência de cada norma) |', '']
    if REPORT.problems:
        lines += ['## Ocorrências', '']
        for p in REPORT.problems:
            where = ' · '.join(str(p[k]) for k in ('norma', 'anexo', 'documento', 'pagina') if p.get(k))
            lines.append(f'- **{p["gravidade"].upper()}** ({p["tipo"]}) {p["mensagem"]}' + (f' — {where}' if where else ''))
        lines.append('')
    lines += ['## Perguntas exigidas pelas faixas do Anexo I', '']
    for q in questions:
        lines.append(f'- `{q}` — {QUESTIONS[q]["texto"]}. {QUESTIONS[q]["ajuda"]}')
    lines += ['', '## Pontos de interpretação (revisão jurídica recomendada)', '',
              '- **Atividades do Anexo I** recebem a classificação geral "Não enquadrada como Baixo Risco A" (o Anexo I lista as atividades "não incluídas" no baixo risco A; art. 3º, § 2º exige Alvará). O decreto não atribui um grau único (médio/alto) a essas atividades.',
              '- **Efeitos nas licenças** (arquivo `importacao/efeitos_licencas.csv`) trazem o artigo que fundamenta cada efeito. Corpo de Bombeiros aparece como "análise separada" (art. 3º: prevenção contra incêndio fica com os órgãos competentes).',
              '- **Faixas de área/volume**: a norma não define como medir a área (construída, ocupada, cultivada) nem a que volume se refere; as perguntas do simulador dizem isso ao usuário.',
              '- **Condições do Anexo II**: quando a condição não é atendida, a norma não indica outra classificação; o simulador mostra "Necessita análise".', '']
    if ignored:
        lines += ['## Conteúdo ignorado', '', f'{len(ignored)} linhas de tabelas orçamentárias de outros atos publicados na pág. 19 do DOM nº 3.609 (fora do decreto).', '']
    (OUT / 'relatorio_validacao.md').write_text('\n'.join(lines), encoding='utf-8')


if __name__ == '__main__':
    main()
