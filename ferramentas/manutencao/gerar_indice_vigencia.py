#!/usr/bin/env python3
"""Extrai a dimensão temporal da legislação das anotações do próprio Planalto.

O texto compilado que a base publica traz, entre parênteses, a marca de cada
mudança que o dispositivo sofreu — `(Redação dada pela Lei nº 14.181, de 2021)`,
`(Revogado pela Lei nº 13.105, de 2015)`. O dado já está coletado; ele só não é
legível, porque vive como prosa dentro do campo `texto`.

Este gerador o torna legível, sem inventar nada: cada evento do índice é
rastreável a uma string literal da fonte, preservada em `literal`.

Duas regras governam o resultado, e as duas existem para não afirmar mais do que
a fonte afirma:

- **Âncora obrigatória.** A anotação se prende à unidade alterada, não ao artigo.
  No art. 6º do CDC, quatro das cinco anotações fecham incisos distintos: a Lei
  14.181/2021 incluiu os incisos XI e XII, não deu nova redação ao artigo. Por
  isso todo evento carrega a `unidade` a que pertence, e `situacao` só se propaga
  ao artigo quando a anotação está no caput.
- **Silêncio quando a fonte silencia.** `situacao` nunca vale "vigente". Ausência
  de anotação significa que o Planalto não anotou mudança — não que o dispositivo
  esteja em vigor hoje, o que só a fonte oficial responde na data da consulta.

Fora de escopo: o texto das redações anteriores. O índice diz **que** mudou, por
**qual** diploma e **quando**; não guarda o texto antigo.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
MANIFESTO_PADRAO = ROOT / "base-juridica" / "indices-derivados.json"
ALGORITMO = "anotacoes-planalto-v1"

# Espécies normativas como o Planalto as escreve nas anotações. A ordem importa:
# a alternativa mais longa vem primeiro, senão "Lei" casaria antes de
# "Lei Complementar" e "Decreto" antes de "Decreto-Lei".
ESPECIES: tuple[tuple[str, str], ...] = (
    (
        r"Emendas?\s+Constituciona(?:l|is)\s+de\s+Revis[ãa]o",
        "Emenda Constitucional de Revisão",
    ),
    # "Emenda Constituição Constitucional" é erro de digitação do próprio
    # Planalto, em 6 anotações. Tolerar a forma torta é fidelidade à fonte:
    # a alternativa seria descartar alteração constitucional que existe.
    (r"Emendas?\s+(?:Constitui[çc][ãa]o\s+)?Constituciona(?:l|is)", "Emenda Constitucional"),
    (r"Leis?\s+Complementar(?:es)?", "Lei Complementar"),
    (r"Lcp|LCP|LC\b", "Lei Complementar"),
    (r"Leis?\s+Delegadas?", "Lei Delegada"),
    (r"Medidas?\s+Provis[óo]rias?", "Medida Provisória"),
    (r"Decretos?-Leis?", "Decreto-Lei"),
    (r"Del\b\.?", "Decreto-Lei"),
    (r"Decretos?\s+Legislativos?", "Decreto Legislativo"),
    (r"Decretos?", "Decreto"),
    (r"Atos?\s+Complementar(?:es)?", "Ato Complementar"),
    (r"Leis?", "Lei"),
)

# "nº", "n º", "n.º", "no", "n" — e a ausência de qualquer marcador. O sufixo
# com hífen faz parte da identidade da medida provisória reeditada: a MP
# 2.177-44 é uma norma distinta da MP 2.177-43, e truncar no hífen além de
# perder a reedição fazia o ano seguinte deixar de casar.
_NUMERO = r"(?:[\s,]*n?\s*[ºª°o]\s*\.?\s*|[\s,]*n\.\s*|[\s,]+)(?P<numero>\d[\d.]*(?:-\d+)?)"
# "de 2021", "de 16.12.2002", "de 11.7.2000", "de 1º de janeiro de 1994" e a
# forma sem preposição que aparece nos decretos-leis antigos (", 11.10.1945").
_ANO = (
    r"(?:[\s,]*(?:de\s+)?"
    r"(?:\d{1,2}[º°o]?\s*[./]\s*\d{1,2}\s*[./]\s*)?"
    r"(?:\d{1,2}[º°o]?\s+de\s+[a-zç]+\s+de\s+)?"
    r"(?P<ano>\d{4}))?"
)

DIPLOMA_RE = re.compile(
    r"(?P<especie>" + "|".join(padrao for padrao, _ in ESPECIES) + r")" + _NUMERO + _ANO,
    re.IGNORECASE,
)

# Cada tipo de evento pelo verbo com que a anotação começa. "Vide" fica de fora
# de propósito: é remissão a outro texto, não registro de mudança sofrida.
TIPOS: tuple[tuple[str, str], ...] = (
    (r"Reda[çc][ãa]o\s+dada", "redacao"),
    (r"Reda[çc][ãa]o\s+pela", "redacao"),
    (r"Inclu[íi]d[oa]s?", "inclusao"),
    (r"Revogad[oa]s?", "revogacao"),
    (r"Renumerad[oa]s?", "renumeracao"),
    (r"Vig[êe]ncia", "vigencia"),
    (r"Vetad[oa]s?", "veto"),
    (r"Suprimid[oa]s?", "supressao"),
)

ANOTACAO_RE = re.compile(
    r"\(\s*(?P<tipo>" + "|".join(padrao for padrao, _ in TIPOS) + r")\b[^()]*\)",
    re.IGNORECASE,
)

TIPO_POR_PADRAO = tuple((re.compile(padrao, re.IGNORECASE), nome) for padrao, nome in TIPOS)
ESPECIE_POR_PADRAO = tuple(
    (re.compile(padrao, re.IGNORECASE), nome) for padrao, nome in ESPECIES
)

# Marcadores de unidade no começo da linha, na formatação do Planalto.
UNIDADES: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^\s*Art\.\s*\d"), "caput"),
    (re.compile(r"^\s*Par[áa]grafo\s+[úu]nico"), "parágrafo único"),
    (re.compile(r"^\s*§\s*(\d+)\s*[º°o]?"), "§ {}º"),
    (re.compile(r"^\s*([IVXLCDM]+)\s*[-–—.)]"), "inciso {}"),
    (re.compile(r"^\s*([a-z])\s*\)"), "alínea {}"),
)

MAX_TRECHO = 120

# Palavra de conteúdo, para distinguir o marcador seco de situação da prosa.
PALAVRA_RE = re.compile(r"[a-záàâãéêíóôõúüç]{3,}", re.IGNORECASE)


def carregar_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as arquivo:
        return json.load(arquivo)


def carregar_manifesto(path: Path = MANIFESTO_PADRAO) -> dict[str, Any]:
    dados = carregar_json(path)
    if dados.get("schema_version") != 2:
        raise ValueError("versão desconhecida do manifesto de índices")
    config = dados.get("vigencia")
    if not config:
        raise ValueError("o manifesto não declara a seção de vigência")
    gerador = config.get("gerador", {})
    if gerador.get("algoritmo") != ALGORITMO:
        raise ValueError("algoritmo de índice de vigência não suportado")
    if gerador.get("modelo") is not None or gerador.get("prompt") is not None:
        raise ValueError("o gerador local não aceita modelo ou prompt externos")
    return dados


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as arquivo:
        for bloco in iter(lambda: arquivo.read(1024 * 1024), b""):
            digest.update(bloco)
    return digest.hexdigest()


def classificar_tipo(literal: str) -> str:
    for padrao, nome in TIPO_POR_PADRAO:
        if padrao.match(literal.lstrip("( ")):
            return nome
    raise ValueError(f"anotação sem tipo reconhecido: {literal}")


def normalizar_numero(numero: str) -> str:
    return numero.rstrip(".")


def extrair_diploma(literal: str) -> dict[str, Any] | None:
    """Espécie, número e ano do diploma alterador, quando a anotação os traz.

    Devolve `None` para a anotação que só registra a situação — `(Revogado)`,
    `(Vigência encerrada)` —, que é informação legítima e não uma falha de
    extração: a fonte de fato não nomeia o diploma ali.
    """
    encontrado = DIPLOMA_RE.search(literal)
    if not encontrado:
        return None
    bruto = encontrado.group("especie")
    especie = next(
        (nome for padrao, nome in ESPECIE_POR_PADRAO if padrao.fullmatch(bruto)),
        bruto,
    )
    ano = encontrado.group("ano")
    return {
        "especie": especie,
        "numero": normalizar_numero(encontrado.group("numero")),
        "ano": int(ano) if ano else None,
    }


def unidade_da_anotacao(texto: str, inicio: int) -> str:
    """A unidade a que a anotação se prende, procurando o marcador anterior.

    Sem isso, `(Incluído pela Lei nº 14.181, de 2021)` no fim do inciso XII
    viraria "o art. 6º foi alterado pela Lei 14.181/2021" — afirmação que a
    fonte não faz e que o próprio caput desmente.
    """
    anteriores = texto[:inicio].split("\n")
    for linha in reversed(anteriores):
        if not linha.strip():
            continue
        for padrao, rotulo in UNIDADES:
            encontrado = padrao.match(linha)
            if encontrado:
                if "{}" not in rotulo:
                    return rotulo
                return rotulo.format(encontrado.group(1))
    return "caput"


def trecho_anterior(texto: str, inicio: int) -> str:
    bruto = texto[:inicio].split("\n")[-1].strip()
    if not bruto:
        bruto = " ".join(texto[:inicio].split())
    if len(bruto) > MAX_TRECHO:
        bruto = "…" + bruto[-MAX_TRECHO:]
    return bruto


def e_anotacao(literal: str, diploma: dict[str, Any] | None) -> bool:
    """Separa a anotação verdadeira do parêntese que só começa igual.

    A lei usa parênteses para prosa comum, e parte dela abre com o mesmo verbo:
    a TIPI traz "(incluídos os fios absorvíveis esterilizados para cirurgia ou
    odontologia)", que não registra alteração nenhuma. A anotação verdadeira ou
    nomeia o diploma que alterou, ou é o marcador seco de situação —
    "(Revogado)", "(Vigência encerrada)". Nenhuma delas carrega uma frase.
    """
    if diploma is not None:
        return True
    resto = literal.lstrip("( ")
    for padrao, _ in TIPO_POR_PADRAO:
        encontrado = padrao.match(resto)
        if encontrado:
            resto = resto[encontrado.end() :]
            break
    return len(PALAVRA_RE.findall(resto.rstrip(") "))) <= 1


def eventos_do_artigo(texto: str) -> list[dict[str, Any]]:
    eventos: list[dict[str, Any]] = []
    for encontrado in ANOTACAO_RE.finditer(texto):
        literal = encontrado.group(0)
        diploma = extrair_diploma(literal)
        if not e_anotacao(literal, diploma):
            continue
        eventos.append(
            {
                "tipo": classificar_tipo(literal),
                "unidade": unidade_da_anotacao(texto, encontrado.start()),
                "diploma": diploma,
                "trecho": trecho_anterior(texto, encontrado.start()),
                "literal": " ".join(literal.split()),
            }
        )
    return eventos


def situacao_do_artigo(eventos: list[dict[str, Any]]) -> str | None:
    """Situação do artigo inteiro — e só quando a anotação está no caput.

    Revogação de inciso não revoga o artigo. Fora do caput, o evento continua
    listado, mas não vira rótulo do dispositivo.
    """
    for evento in eventos:
        if evento["unidade"] != "caput":
            continue
        if evento["tipo"] == "revogacao":
            return "revogado"
        if evento["tipo"] == "veto":
            return "vetado"
        if evento["tipo"] == "vigencia" and "encerrada" in evento["literal"].lower():
            return "vigencia_encerrada"
    return None


def gerar_diploma(
    manifesto: dict[str, Any],
    fonte_path: Path,
) -> tuple[Path, dict[str, Any]]:
    config = manifesto["vigencia"]
    fonte = carregar_json(fonte_path)
    artigos = fonte["artigos"]

    indice: dict[str, Any] = {}
    total_eventos = 0
    sem_diploma = 0
    for numero, artigo in artigos.items():
        eventos = eventos_do_artigo(str(artigo["texto"]))
        if not eventos:
            continue
        total_eventos += len(eventos)
        sem_diploma += sum(1 for evento in eventos if evento["diploma"] is None)
        indice[numero] = {
            "situacao": situacao_do_artigo(eventos),
            "eventos": eventos,
        }

    meta_fonte = fonte.get("_meta", {})
    destino = fonte_path.parent / config["subdiretorio_destino"] / (
        fonte_path.stem + config["sufixo_destino"]
    )
    saida = {
        "_meta": {
            "schema_version": 2,
            "tipo": "indice_derivado",
            "codigo": meta_fonte.get("codigo"),
            "gerado_em": config["gerado_em"],
            "gerador": config["gerador"],
            "fonte": {
                "arquivo": fonte_path.name,
                "colecao": "artigos",
                "sha256": sha256(fonte_path),
                "total_registros": len(artigos),
                "gerado_em": meta_fonte.get("gerado_em"),
            },
            "relacao": {
                "chave": "numero",
                "cobertura": (
                    "parcial por desenho: só entram os artigos cuja fonte traz "
                    "anotação de alteração; a ausência significa que o Planalto "
                    "não anotou mudança, nunca que o dispositivo está vigente"
                ),
                "artigos_com_anotacao": len(indice),
                "anotacoes": total_eventos,
                "anotacoes_sem_diploma_nomeado": sem_diploma,
            },
        },
        "vigencia": indice,
    }
    return destino, saida


def gerar_todos(
    manifesto_path: Path = MANIFESTO_PADRAO,
) -> list[tuple[Path, dict[str, Any]]]:
    manifesto = carregar_manifesto(manifesto_path)
    config = manifesto["vigencia"]
    diretorio = ROOT / manifesto["diretorio_dados"]
    fontes = sorted(diretorio.glob(config["padrao_fonte"]))
    if not fontes:
        raise ValueError("nenhum diploma encontrado para indexar")
    return [gerar_diploma(manifesto, fonte_path) for fonte_path in fontes]


def serializar(objeto: dict[str, Any]) -> str:
    return json.dumps(objeto, ensure_ascii=False, indent=2) + "\n"


def escrever(manifesto_path: Path) -> int:
    for destino, objeto in gerar_todos(manifesto_path):
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(serializar(objeto), encoding="utf-8")
        print(f"Gerado: {destino.relative_to(ROOT)}")
    return 0


def verificar(manifesto_path: Path) -> int:
    divergentes: list[Path] = []
    for destino, objeto in gerar_todos(manifesto_path):
        esperado = serializar(objeto)
        atual = destino.read_text(encoding="utf-8") if destino.exists() else ""
        if atual != esperado:
            divergentes.append(destino)
    if divergentes:
        for path in divergentes:
            print(f"Divergente: {path.relative_to(ROOT)}", file=sys.stderr)
        return 1
    print(f"Reproduzível: {len(gerar_todos(manifesto_path))} índices de vigência")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    grupo = parser.add_mutually_exclusive_group(required=True)
    grupo.add_argument("--escrever", action="store_true")
    grupo.add_argument("--verificar", action="store_true")
    parser.add_argument("--manifesto", type=Path, default=MANIFESTO_PADRAO)
    args = parser.parse_args()
    return escrever(args.manifesto) if args.escrever else verificar(args.manifesto)


if __name__ == "__main__":
    raise SystemExit(main())
