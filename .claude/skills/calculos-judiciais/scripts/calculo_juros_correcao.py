#!/usr/bin/env python3
"""
Calculadora de correcao monetaria + juros para debitos judiciais.

Uso: o usuario informa o principal, a data inicial, a tabela de indices
mensais (IPCA-E/INPC/SELIC/outro, em formato decimal, ex: 0.0045 = 0.45%)
e a taxa de juros de mora. O script NAO traz indices pre-carregados,
porque eles mudam mensalmente e usar um valor desatualizado geraria um
calculo errado - o usuario (ou o SKILL.md, orientando o usuario) deve
informar a tabela de indices vigente para o periodo, obtida de fonte
oficial (IBGE para IPCA-E/INPC, BACEN para SELIC).

Suporta juros simples ou compostos, aplicados sobre o saldo corrigido.
"""

from dataclasses import dataclass, field
from datetime import date


@dataclass
class ParametrosCalculo:
    principal: float
    data_inicial: date
    data_final: date
    indices_mensais: dict  # {"YYYY-MM": taxa_decimal_do_mes}
    taxa_juros_mensal: float  # ex: 0.01 para 1% a.m.
    juros_compostos: bool = False
    pagamentos_parciais: list = field(default_factory=list)
    # pagamentos_parciais: [{"data": date, "valor": float}, ...]


def gerar_meses(data_inicial: date, data_final: date):
    ano, mes = data_inicial.year, data_inicial.month
    while (ano, mes) <= (data_final.year, data_final.month):
        yield f"{ano:04d}-{mes:02d}"
        mes += 1
        if mes > 12:
            mes = 1
            ano += 1


def calcular(params: ParametrosCalculo) -> list:
    """Retorna a memoria de calculo mes a mes."""
    saldo = params.principal
    memoria = []

    pagamentos_por_mes = {}
    for pgto in params.pagamentos_parciais:
        chave = f"{pgto['data'].year:04d}-{pgto['data'].month:02d}"
        pagamentos_por_mes[chave] = pagamentos_por_mes.get(chave, 0) + pgto["valor"]

    for chave_mes in gerar_meses(params.data_inicial, params.data_final):
        indice = params.indices_mensais.get(chave_mes)
        if indice is None:
            raise ValueError(
                f"Indice do mes {chave_mes} nao informado em indices_mensais. "
                f"Confirme a tabela de indices antes de calcular."
            )

        saldo_corrigido = saldo * (1 + indice)

        if params.juros_compostos:
            saldo_com_juros = saldo_corrigido * (1 + params.taxa_juros_mensal)
            valor_juros = saldo_com_juros - saldo_corrigido
        else:
            valor_juros = params.principal * params.taxa_juros_mensal
            saldo_com_juros = saldo_corrigido + valor_juros

        pagamento_mes = pagamentos_por_mes.get(chave_mes, 0)
        saldo_final = saldo_com_juros - pagamento_mes

        memoria.append({
            "mes": chave_mes,
            "saldo_anterior": round(saldo, 2),
            "indice_aplicado": indice,
            "saldo_corrigido": round(saldo_corrigido, 2),
            "juros": round(valor_juros, 2),
            "pagamento": round(pagamento_mes, 2),
            "saldo_final": round(saldo_final, 2),
        })

        saldo = saldo_final

    return memoria


def imprimir_memoria(memoria: list):
    print(f"{'Mes':<8}{'Saldo ant.':>14}{'Indice':>10}{'Corrigido':>14}{'Juros':>12}{'Pagto':>12}{'Saldo final':>14}")
    for linha in memoria:
        print(
            f"{linha['mes']:<8}"
            f"{linha['saldo_anterior']:>14,.2f}"
            f"{linha['indice_aplicado']*100:>9.4f}%"
            f"{linha['saldo_corrigido']:>14,.2f}"
            f"{linha['juros']:>12,.2f}"
            f"{linha['pagamento']:>12,.2f}"
            f"{linha['saldo_final']:>14,.2f}"
        )
    if memoria:
        print(f"\nValor final atualizado: R$ {memoria[-1]['saldo_final']:,.2f}")


if __name__ == "__main__":
    # Exemplo de uso - SUBSTITUIR pelos dados reais do caso antes de rodar.
    exemplo = ParametrosCalculo(
        principal=10000.00,
        data_inicial=date(2025, 1, 1),
        data_final=date(2025, 6, 1),
        indices_mensais={
            "2025-01": 0.0050,
            "2025-02": 0.0040,
            "2025-03": 0.0035,
            "2025-04": 0.0038,
            "2025-05": 0.0042,
            "2025-06": 0.0041,
        },
        taxa_juros_mensal=0.01,
        juros_compostos=False,
    )
    resultado = calcular(exemplo)
    imprimir_memoria(resultado)
