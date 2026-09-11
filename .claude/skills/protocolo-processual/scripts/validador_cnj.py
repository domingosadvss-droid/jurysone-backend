#!/usr/bin/env python3
"""
Validador do numero unico de processo (padrao CNJ, Resolucao 65/2008).

Formato: NNNNNNN-DD.AAAA.J.TR.OOOO
  NNNNNNN = numero sequencial (7 digitos)
  DD      = digito verificador (2 digitos)
  AAAA    = ano de ajuizamento (4 digitos)
  J       = segmento do Judiciario (1 digito)
  TR      = tribunal/regiao (2 digitos)
  OOOO    = unidade de origem (4 digitos)

O digito verificador segue o algoritmo MOD 97-10 (ISO 7064):
  1. Concatenar NNNNNNN + AAAA + J + TR + OOOO (18 digitos)
  2. Acrescentar "00" ao final (totalizando 20 digitos)
  3. Calcular o resto da divisao por 97
  4. DD = 98 - resto
"""

import re


def _limpar(numero: str) -> str:
    return re.sub(r"[^0-9]", "", numero)


def calcular_digito_verificador(sequencial: str, ano: str, segmento: str,
                                 tribunal: str, origem: str) -> str:
    base = f"{sequencial}{ano}{segmento}{tribunal}{origem}00"
    resto = int(base) % 97
    dv = 98 - resto
    return f"{dv:02d}"


def validar_numero_cnj(numero_formatado: str) -> dict:
    """
    Recebe o numero no formato NNNNNNN-DD.AAAA.J.TR.OOOO (ou so os
    digitos, 20 no total) e retorna se o digito verificador confere.
    """
    digitos = _limpar(numero_formatado)

    if len(digitos) != 20:
        return {
            "valido": False,
            "motivo": f"Numero deve ter 20 digitos, encontrados {len(digitos)}.",
        }

    sequencial = digitos[0:7]
    dv_informado = digitos[7:9]
    ano = digitos[9:13]
    segmento = digitos[13:14]
    tribunal = digitos[14:16]
    origem = digitos[16:20]

    dv_calculado = calcular_digito_verificador(sequencial, ano, segmento, tribunal, origem)

    return {
        "valido": dv_calculado == dv_informado,
        "sequencial": sequencial,
        "dv_informado": dv_informado,
        "dv_calculado": dv_calculado,
        "ano": ano,
        "segmento_judiciario": segmento,
        "tribunal": tribunal,
        "unidade_origem": origem,
    }


def formatar_numero_cnj(sequencial: str, dv: str, ano: str, segmento: str,
                         tribunal: str, origem: str) -> str:
    return f"{sequencial}-{dv}.{ano}.{segmento}.{tribunal}.{origem}"


if __name__ == "__main__":
    # Exemplo: gerar um numero valido e depois valida-lo, para
    # demonstrar o algoritmo (nao corresponde a um processo real).
    sequencial, ano, segmento, tribunal, origem = "0001234", "2025", "8", "26", "0001"
    dv = calcular_digito_verificador(sequencial, ano, segmento, tribunal, origem)
    numero = formatar_numero_cnj(sequencial, dv, ano, segmento, tribunal, origem)
    print(f"Numero gerado para teste: {numero}")

    resultado = validar_numero_cnj(numero)
    print(f"Valido: {resultado['valido']}")
    print(resultado)

    print("\n--- Teste com digito verificador adulterado ---")
    numero_invalido = formatar_numero_cnj(sequencial, "00", ano, segmento, tribunal, origem)
    print(f"Numero: {numero_invalido}")
    print(validar_numero_cnj(numero_invalido))
