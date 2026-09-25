#!/usr/bin/env python3
"""
Ferramenta de apoio para revisao de contrato bancario.

Nao substitui pericia contabil. Faz duas coisas:
1. Compara a taxa de juros anual informada no contrato com a taxa
   efetiva que resultaria da simples capitalizacao mensal composta da
   taxa mensal informada - se a taxa anual contratada for muito maior
   que "taxa mensal x 12", ha indicio de capitalizacao (anatocismo)
   que precisa estar expressamente pactuada (Sumula 539 STJ).
2. Varre um texto de contrato em busca de termos que costumam indicar
   encargos ou clausulas que merecem atencao (red flags textuais).
"""

import re


def taxa_anual_equivalente_juros_simples(taxa_mensal: float) -> float:
    """Taxa anual se os juros fossem apenas somados mes a mes (sem capitalizar)."""
    return taxa_mensal * 12


def taxa_anual_equivalente_capitalizada(taxa_mensal: float) -> float:
    """Taxa anual efetiva se a taxa mensal for capitalizada (juros compostos)."""
    return (1 + taxa_mensal) ** 12 - 1


def avaliar_capitalizacao(taxa_mensal_contratada: float, taxa_anual_contratada: float,
                           tolerancia: float = 0.005) -> dict:
    """
    Compara a taxa anual informada no contrato com as duas taxas de
    referencia (simples e capitalizada) para apontar qual regime o
    contrato provavelmente pratica.

    tolerancia: margem de erro aceitavel na comparacao (0.005 = 0.5 p.p.)
    """
    anual_simples = taxa_anual_equivalente_juros_simples(taxa_mensal_contratada)
    anual_capitalizada = taxa_anual_equivalente_capitalizada(taxa_mensal_contratada)

    dif_simples = abs(taxa_anual_contratada - anual_simples)
    dif_capitalizada = abs(taxa_anual_contratada - anual_capitalizada)

    if dif_capitalizada <= tolerancia and dif_capitalizada < dif_simples:
        diagnostico = (
            "A taxa anual contratada e compativel com capitalizacao mensal "
            "composta da taxa mensal informada. Verificar se o contrato "
            "PACTUA EXPRESSAMENTE a capitalizacao (Sumula 539 STJ exige "
            "pactuacao expressa e clara para ser valida)."
        )
    elif dif_simples <= tolerancia and dif_simples < dif_capitalizada:
        diagnostico = (
            "A taxa anual contratada e compativel com juros simples "
            "(sem capitalizacao). Regime aparentemente regular quanto a "
            "esse ponto especifico."
        )
    else:
        diagnostico = (
            "A taxa anual contratada NAO corresponde nem a juros simples "
            "nem a capitalizacao mensal composta da taxa mensal informada. "
            "Ha inconsistencia a apurar - possivel indicio de cobranca "
            "indevida ou erro na informacao contratual. Recomenda-se "
            "conferencia por perito contabil."
        )

    return {
        "taxa_mensal_contratada": taxa_mensal_contratada,
        "taxa_anual_contratada": taxa_anual_contratada,
        "taxa_anual_se_simples": round(anual_simples, 6),
        "taxa_anual_se_capitalizada": round(anual_capitalizada, 6),
        "diferenca_vs_simples": round(dif_simples, 6),
        "diferenca_vs_capitalizada": round(dif_capitalizada, 6),
        "diagnostico": diagnostico,
    }


RED_FLAGS_TEXTUAIS = {
    "comissao de permanencia": "Vedada cumulacao com correcao monetaria, juros remuneratorios ou moratorios e multa (Sumula 472 STJ).",
    "tarifa de abertura de credito": "TAC - verificar se foi pactuada expressamente e informada previamente ao cliente.",
    "seguro prestamista": "Verificar se houve venda casada (vedada pelo CDC) ou contratacao sem consentimento claro.",
    "tarifa de cadastro": "Verificar previsao expressa e se ha cobranca duplicada com outras tarifas.",
    "capitalizacao": "Confirmar se ha pactuacao expressa e clara da periodicidade (Sumula 539 STJ).",
    "juros sobre juros": "Indicio direto de capitalizacao - checar pactuacao expressa.",
    "vencimento antecipado": "Verificar proporcionalidade e se ha notificacao previa ao devedor.",
}


def escanear_texto_contrato(texto: str) -> list:
    """Retorna a lista de red flags textuais encontrados no contrato."""
    texto_normalizado = texto.lower()
    encontrados = []
    for termo, alerta in RED_FLAGS_TEXTUAIS.items():
        if re.search(termo, texto_normalizado):
            encontrados.append({"termo": termo, "alerta": alerta})
    return encontrados


if __name__ == "__main__":
    print("=== Exemplo: avaliacao de capitalizacao ===")
    resultado = avaliar_capitalizacao(taxa_mensal_contratada=0.03, taxa_anual_contratada=0.4258)
    for chave, valor in resultado.items():
        print(f"{chave}: {valor}")

    print("\n=== Exemplo: varredura textual de contrato ===")
    texto_exemplo = """
    Fica pactuada a cobranca de comissao de permanencia em caso de
    inadimplemento, cumulada com juros moratorios e multa contratual.
    """
    for achado in escanear_texto_contrato(texto_exemplo):
        print(f"- {achado['termo']}: {achado['alerta']}")
