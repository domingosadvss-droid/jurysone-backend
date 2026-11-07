"""Teste de ponta a ponta da etapa 2 (linha de produção) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção):
    python -X utf8 tests/e2e/teste_etapa2.py
O app precisa estar em http://localhost:3099. As rotas de cadastro têm limite de 3/min:
espere 1 minuto entre execuções.
"""
import json, sys, time, urllib.request, urllib.error

BASE = "http://localhost:3099/api"
falhas, oks = [], 0


def req(metodo, caminho, token=None, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(BASE + caminho, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def checa(nome, cond, extra=""):
    global oks
    if cond:
        oks += 1
        print("  OK  ", nome)
    else:
        falhas.append(nome)
        print("  FALHA", nome, str(extra)[:400])


sfx = str(int(time.time()))


def registrar(rotulo):
    s, b = req("POST", "/auth/register", corpo={
        "email": f"{rotulo}{sfx}@teste.local", "password": "SenhaForte123!", "nome": f"Titular {rotulo}",
        "nomeEscritorio": f"Escritorio {rotulo}"})
    assert s in (200, 201), (s, b)
    return b["access_token"]


def login(email):
    s, b = req("POST", "/auth/login", corpo={"email": email, "password": "SenhaForte123!"})
    assert s in (200, 201), (s, b)
    return b["access_token"]


def etapa_atual(linha):
    return next((e for e in linha["etapas"] if e["status"] == "EM_ANDAMENTO"), None)


def concluir_tudo(etapa, token):
    for item in etapa.get("checklist") or []:
        if item["obrigatorio"]:
            req("POST", f"/linhas/etapas/{etapa['id']}/checklist", token, {"itemId": item["id"], "feito": True})
    return req("POST", f"/linhas/etapas/{etapa['id']}/concluir", token, {"observacao": "ok"})


print("== Preparação")
adm = registrar("lp")
s, me = req("GET", "/auth/me", adm)
s, parc = req("POST", "/parceiros", adm, {"nome": "Dr. Parceiro Linha"})
us = {}
for perfil in ["ESTAGIARIO", "ASSOCIADO", "PARCEIRO"]:
    corpo = {"nome": f"Usuario {perfil}", "email": f"lp{perfil.lower()}{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": perfil}
    if perfil == "PARCEIRO":
        corpo["parceiroId"] = parc["id"]
    s, u = req("POST", "/equipe", adm, corpo)
    us[perfil] = u
    if perfil in ("ASSOCIADO", "PARCEIRO"):
        req("POST", f"/equipe/{u['id']}/termo", adm, {"documentoUrl": "https://drive/termo.pdf"})
tok = {p: login(f"lp{p.lower()}{sfx}@teste.local") for p in us}

print("== Modelos padrão")
s, b = req("POST", "/linhas/modelos/instalar-padrao", tok["ASSOCIADO"])
checa("associada NÃO instala modelos", s == 403, s)
s, b = req("POST", "/linhas/modelos/instalar-padrao", adm)
checa("admin instala 10 modelos padrão", s == 200 and b["criados"] == 10, (s, b))
s, b = req("POST", "/linhas/modelos/instalar-padrao", adm)
checa("instalar de novo não duplica", b["criados"] == 0, b)
s, modelos = req("GET", "/linhas/modelos", tok["ESTAGIARIO"])
codigos = {m["codigo"]: m for m in modelos} if s == 200 else {}
checa("estagiária lista os modelos", s == 200 and "TRAB_EMPREGADO" in codigos and "IMOB_REVISAO_CONTRATUAL" in codigos, s)
checa("revisão contratual tem etapa opcional de notificação",
      any(e["opcional"] and "Notificação" in e["nome"] for e in codigos["IMOB_REVISAO_CONTRATUAL"]["etapas"]))
s, _ = req("GET", "/linhas/modelos", tok["PARCEIRO"])
checa("parceiro NÃO vê modelos", s == 403, s)

print("== Iniciar linha")
s, cli = req("POST", "/clientes", adm, {"nome": "Cliente Linha", "cpfCnpj": "22233344455", "tipo": "PF"})
s, proc = req("POST", "/processos", adm, {"numero": "5000100-11.2026.8.24.0005", "clienteId": cli["id"], "titulo": "Revisão do financiamento"})
s, proc2 = req("POST", "/processos", adm, {"numero": "5000200-22.2026.8.24.0005", "clienteId": cli["id"], "titulo": "Outro"})
pid = proc["id"]
s, _ = req("POST", f"/linhas/processos/{pid}", tok["ESTAGIARIO"], {"codigo": "IMOB_REVISAO_CONTRATUAL"})
checa("estagiária NÃO inicia linha", s == 403, s)
s, linha = req("POST", f"/linhas/processos/{pid}", adm, {"codigo": "IMOB_REVISAO_CONTRATUAL"})
checa("admin inicia a linha da revisão contratual", s in (200, 201) and linha["status"] == "ATIVA", (s, linha))
at = etapa_atual(linha)
checa("primeira etapa é a triagem, com a estagiária", at and at["nome"] == "Triagem e entrevista" and at["responsavelId"] == us["ESTAGIARIO"]["id"], at)
checa("etapa tem prazo calculado", at and at["prazoEm"], at)
s, b = req("POST", f"/linhas/processos/{pid}", adm, {"codigo": "GENERICO"})
checa("não abre duas linhas ativas no mesmo processo", s == 400, s)

print("== Andamento das etapas")
s, minhas = req("GET", "/linhas/minhas", tok["ESTAGIARIO"])
checa("estagiária vê a etapa dela", s == 200 and len(minhas) == 1 and minhas[0]["linha"]["processo"]["id"] == pid, (s, minhas))
s, n = req("GET", "/notifications", tok["ESTAGIARIO"])
lista_n = n.get("data", n) if isinstance(n, dict) else n
checa("estagiária foi notificada da nova etapa", s == 200 and any(x.get("tipo") == "linha_producao" for x in lista_n), (s, n))
s, b = req("POST", f"/linhas/etapas/{at['id']}/concluir", tok["ESTAGIARIO"], {})
checa("não conclui com checklist obrigatório pendente", s == 400 and b.get("pendentes"), (s, b))
s, linha = concluir_tudo(at, tok["ESTAGIARIO"])
checa("estagiária conclui a triagem", s == 200 and linha["etapas"][0]["status"] == "CONCLUIDA", (s, linha))
at = etapa_atual(linha)
checa("abre a consulta com o advogado (admin)", at["nome"] == "Consulta com o advogado" and at["responsavelId"] == me["id"], at)
s, _ = req("POST", f"/linhas/etapas/{at['id']}/concluir", tok["ESTAGIARIO"], {})
checa("estagiária NÃO conclui etapa de outra pessoa", s == 403, s)
checa("progresso avança", linha["progresso"] > 0, linha.get("progresso"))

for esperado in ["Consulta com o advogado", "Contratação", "Documentos do contrato", "Cálculo revisional"]:
    at = etapa_atual(linha)
    s, linha = concluir_tudo(at, adm)
    checa(f"conclui: {esperado}", s == 200 and at["nome"] == esperado, (s, at and at["nome"]))

at = etapa_atual(linha)
checa("chega na etapa opcional de notificação", at["opcional"] and "Notificação" in at["nome"], at)
s, _ = req("POST", f"/linhas/etapas/{at['id']}/pular", adm, {})
checa("pular exige motivo", s == 400, s)
s, linha = req("POST", f"/linhas/etapas/{at['id']}/pular", adm, {"motivo": "Cliente quer ajuizar direto"})
checa("pula a notificação com motivo", s == 200 and any(e["status"] == "PULADA" for e in linha["etapas"]), s)
at = etapa_atual(linha)
checa("segue para a petição inicial", at["nome"] == "Petição inicial", at)
s, _ = req("POST", f"/linhas/etapas/{at['id']}/pular", adm, {"motivo": "x"})
checa("etapa obrigatória NÃO pode ser pulada", s == 400, s)

print("== Casos parados")
s, b = req("PATCH", f"/linhas/etapas/{at['id']}", adm, {"responsavelId": us["ASSOCIADO"]["id"], "prazoEm": "2026-01-01"})
checa("admin reatribui à associada com prazo vencido", s == 200 and b["responsavelId"] == us["ASSOCIADO"]["id"], (s, b))
s, par = req("GET", "/linhas/paradas", adm)
checa("admin vê o caso parado com dias de atraso", s == 200 and len(par) == 1 and par[0]["diasDeAtraso"] > 0 and par[0]["responsavelNome"], (s, par))
s, par = req("GET", "/linhas/paradas", tok["ASSOCIADO"])
checa("associada vê o caso parado dela", s == 200 and len(par) == 1, (s, par))
s, par = req("GET", "/linhas/paradas", tok["ESTAGIARIO"])
checa("estagiária não vê o parado dos outros", s == 200 and len(par) == 0, (s, par))
s, b = req("POST", "/linhas/paradas/alertar", adm)
checa("alerta de parados dispara", s == 200 and b["alertadas"] == 1, (s, b))
s, b = req("POST", "/linhas/paradas/alertar", adm)
checa("não alerta duas vezes no mesmo dia", s == 200 and b["alertadas"] == 0, (s, b))
s, n = req("GET", "/notifications", tok["ASSOCIADO"])
lista_n = n.get("data", n) if isinstance(n, dict) else n
checa("associada recebeu alerta de etapa parada", any("parada" in (x.get("titulo") or "").lower() for x in lista_n), n)

print("== Parceiro")
req("POST", f"/cota-parte/processos/{pid}/participacoes", adm, {"parceiroId": parc["id"], "papel": "PARTICIPACAO"})
s, ls = req("GET", f"/linhas/processos/{pid}", tok["PARCEIRO"])
checa("parceiro vê a linha do processo dele", s == 200 and len(ls) == 1, (s, ls))
s, _ = req("GET", f"/linhas/processos/{proc2['id']}", tok["PARCEIRO"])
checa("parceiro NÃO vê linha de processo alheio", s == 404, s)
s, _ = req("POST", f"/linhas/etapas/{at['id']}/concluir", tok["PARCEIRO"], {})
checa("parceiro NÃO conclui etapa que não é dele", s == 403, s)
req("PATCH", f"/linhas/etapas/{at['id']}", adm, {"responsavelId": us["PARCEIRO"]["id"]})
s, linha = concluir_tudo(at, tok["PARCEIRO"])
checa("parceiro conclui a etapa atribuída a ele", s == 200 and etapa_atual(linha)["nome"] == "Protocolo", (s, linha if s != 200 else ""))

print("== Modelos personalizados e versões")
s, mod = req("POST", "/linhas/modelos", adm, {"nome": "Ambiental — licenciamento", "area": "ambiental",
                                              "etapas": [{"nome": "Diagnóstico", "checklist": ["Vistoria"]}, {"nome": "Protocolo no órgão", "prazoDias": 10}]})
checa("cria modelo personalizado", s in (200, 201) and len(mod["etapas"]) == 2 and mod["versao"] == 1, (s, mod))
s, linha2 = req("POST", f"/linhas/processos/{proc2['id']}", adm, {"modeloId": mod["id"]})
checa("inicia linha com o modelo novo", s in (200, 201) and linha2["modeloVersao"] == 1, s)
s, mod2 = req("PATCH", f"/linhas/modelos/{mod['id']}", adm, {"etapas": [{"nome": "Diagnóstico"}, {"nome": "Estudo"}, {"nome": "Protocolo"}]})
checa("editar etapas sobe a versão", s == 200 and mod2["versao"] == 2 and len(mod2["etapas"]) == 3, (s, mod2))
s, ls = req("GET", f"/linhas/processos/{proc2['id']}", adm)
checa("caso já iniciado mantém as etapas antigas", len(ls[0]["etapas"]) == 2, ls)
s, c = req("POST", f"/linhas/{linha2['id']}/cancelar", adm, {"motivo": "teste"})
checa("cancela a linha", s == 200 and c["status"] == "CANCELADA", (s, c))
s, l3 = req("POST", f"/linhas/processos/{proc2['id']}", adm, {"modeloId": mod["id"]})
checa("após cancelar, pode iniciar nova linha (versão 2)", s in (200, 201) and l3["modeloVersao"] == 2 and len(l3["etapas"]) == 3, s)
s, _ = req("POST", "/linhas/modelos", adm, {"nome": "Sem etapas", "area": "x", "etapas": []})
checa("modelo sem etapas é recusado", s == 400, s)

print("== Isolamento entre escritórios")
outro = registrar("lq")
s, ls = req("GET", f"/linhas/processos/{pid}", outro)
checa("outro escritório não vê a linha", s == 200 and ls == [], (s, ls))
s, _ = req("POST", f"/linhas/etapas/{etapa_atual(linha)['id']}/concluir", outro, {})
checa("outro escritório NÃO conclui etapa", s == 404, s)
s, _ = req("POST", f"/linhas/processos/{pid}", outro, {"codigo": "GENERICO"})
checa("outro escritório NÃO inicia linha no processo", s == 404, s)
s, par = req("GET", "/linhas/paradas", outro)
checa("outro escritório não vê parados alheios", par == [], par)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
if falhas:
    print("Falhas:", *falhas, sep="\n - ")
    sys.exit(1)
