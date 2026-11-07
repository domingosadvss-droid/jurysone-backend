"""Teste de ponta a ponta da etapa 1 do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção):
    python -X utf8 tests/e2e/teste_etapa1.py
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
        print("  FALHA", nome, extra)


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


print("== Cadastro e perfis")
adm = registrar("a")
s, me = req("GET", "/auth/me", adm)
checa("quem registra o escritório vira ADMIN", me.get("roles") == "ADMIN", me)

s, parc = req("POST", "/parceiros", adm, {"nome": "Dr. Parceiro Externo", "oabNumero": "999", "oabEstado": "SC",
                                          "pixChave": "chave-secreta", "percentualHonorarios": 25})
checa("cria cadastro de parceiro", s in (200, 201), (s, parc))
parceiro_id = parc["id"]

usuarios = {}
for perfil in ["SOCIO", "ASSOCIADO", "ESTAGIARIO", "PARCEIRO"]:
    corpo = {"nome": f"Usuario {perfil}", "email": f"{perfil.lower()}{sfx}@teste.local",
             "senha": "SenhaForte123!", "perfil": perfil}
    if perfil == "PARCEIRO":
        corpo["parceiroId"] = parceiro_id
    s, u = req("POST", "/equipe", adm, corpo)
    checa(f"admin cria usuário {perfil}", s in (200, 201), (s, u))
    usuarios[perfil] = u
tok = {p: login(f"{p.lower()}{sfx}@teste.local") for p in usuarios}

s, _ = req("POST", "/equipe", tok["SOCIO"], {"nome": "x", "email": f"x{sfx}@t.local", "senha": "SenhaForte123!", "perfil": "ADMIN"})
checa("sócio NÃO cria usuário", s == 403, s)
s, b = req("PATCH", f"/equipe/{me['id']}", adm, {"perfil": "SOCIO"})
checa("admin não consegue se rebaixar", s == 400, (s, b))

print("== Dados do caso")
s, cli = req("POST", "/clientes", adm, {"nome": "Cliente Pagante", "cpfCnpj": "11122233344", "tipo": "PF",
                                        "temFilhos": True, "origem": "instagram", "indicadoPor": "Fulano"})
checa("cria cliente com origem e temFilhos", s in (200, 201) and cli.get("origem") == "INSTAGRAM" and cli.get("temFilhos") is True, (s, cli))
s, proc = req("POST", "/processos", adm, {"numero": "5000001-11.2026.8.24.0005", "clienteId": cli["id"], "titulo": "Revisão contratual"})
checa("cria processo 1", s in (200, 201), (s, proc))
s, proc2 = req("POST", "/processos", adm, {"numero": "5000002-22.2026.8.24.0005", "clienteId": cli["id"], "titulo": "Outro caso"})
checa("cria processo 2", s in (200, 201), (s, proc2))

s, lanc = req("POST", "/financeiro/lancamentos", adm, {
    "descricao": "Honorário fixo parcela 1", "valor": 1000, "tipo": "receita", "status": "pago",
    "clienteId": cli["id"], "processoId": proc["id"], "tipoHonorario": "fixo", "taxaGateway": 10, "origemRecebimento": "asaas"})
checa("lançamento ligado ao processo, com taxa e tipo", s in (200, 201) and lanc.get("processoId") == proc["id"], (s, lanc))

print("== Cota-parte")
s, b = req("PUT", "/cota-parte/config", tok["SOCIO"], {"aliquotaImposto": 6})
checa("sócio NÃO altera alíquota", s == 403, s)
s, b = req("PUT", "/cota-parte/config", adm, {"aliquotaImposto": 6})
checa("admin define alíquota 6%", s == 200 and b["percentual"] == 6, (s, b))

pid = proc["id"]
for corpo, rotulo in [({"usuarioId": usuarios["ASSOCIADO"]["id"], "papel": "INDICACAO"}, "associada indicação"),
                      ({"usuarioId": usuarios["ASSOCIADO"]["id"], "papel": "PARTICIPACAO"}, "associada participação"),
                      ({"parceiroId": parceiro_id, "papel": "INDICACAO"}, "parceiro indicação")]:
    s, b = req("POST", f"/cota-parte/processos/{pid}/participacoes", adm, corpo)
    checa(f"registra {rotulo}", s in (200, 201), (s, b))
s, b = req("POST", f"/cota-parte/processos/{pid}/participacoes", adm, {"usuarioId": usuarios["ASSOCIADO"]["id"], "papel": "INDICACAO"})
checa("não duplica o mesmo papel", s == 400, s)

s, prev = req("GET", "/cota-parte/previa", adm)
benef = {g["beneficiarioKey"]: g["total"] for g in prev.get("beneficiarios", [])}
# base = 1000 - 10 - 60 = 930 -> associada fica com o MAIOR (50%) = 465; parceiro 25% = 232,50
checa("associada: maior papel (50%) sobre a base líquida = 465,00", benef.get("u:" + usuarios["ASSOCIADO"]["id"]) == 465, prev)
checa("parceiro: indicação 25% = 232,50", benef.get("p:" + parceiro_id) == 232.5, prev)

s, ficha = req("GET", f"/cota-parte/processos/{pid}/ficha-financeira", adm)
checa("ficha financeira: recebido 1000", s == 200 and ficha["resumo"]["recebido"] == 1000, (s, ficha))

print("== Associada")
s, _ = req("GET", "/financeiro/lancamentos", tok["ASSOCIADO"])
checa("associada sem termo é bloqueada", s == 403, s)
s, b = req("POST", f"/equipe/{usuarios['ASSOCIADO']['id']}/termo", adm, {"documentoUrl": "https://drive/termo-associada.pdf"})
checa("admin registra termo da associada", s in (200, 201) and b.get("termoAceitoEm"), (s, b))
s, _ = req("GET", "/financeiro/lancamentos", tok["ASSOCIADO"])
checa("associada NÃO vê o financeiro geral", s == 403, s)
s, _ = req("GET", f"/cota-parte/processos/{pid}/ficha-financeira", tok["ASSOCIADO"])
checa("associada NÃO vê a ficha financeira do processo", s == 403, s)
s, minha = req("GET", "/cota-parte/minha", tok["ASSOCIADO"])
checa("associada vê a própria cota em apuração = 465", s == 200 and minha["emApuracao"]["total"] == 465, (s, minha))
pagou = minha["emApuracao"]["itens"][0]["cliente"]["nome"] if s == 200 and minha["emApuracao"]["itens"] else None
checa("associada vê quem pagou", pagou == "Cliente Pagante", pagou)

print("== Estagiária")
s, _ = req("GET", "/financeiro/lancamentos", tok["ESTAGIARIO"])
checa("estagiária NÃO vê financeiro", s == 403, s)
s, _ = req("GET", "/analytics/overview", tok["ESTAGIARIO"])
checa("estagiária NÃO vê analytics", s == 403, s)
s, _ = req("GET", "/cota-parte/minha", tok["ESTAGIARIO"])
checa("estagiária NÃO tem cota", s == 403, s)
s, b = req("GET", "/processos", tok["ESTAGIARIO"])
checa("estagiária vê processos", s == 200, s)
s, b = req("GET", f"/parceiros/{parceiro_id}", tok["ESTAGIARIO"])
txt = json.dumps(b)
checa("estagiária recebe parceiro SEM pix e percentual", s == 200 and "chave-secreta" not in txt and "percentualHonorarios" not in txt, (s, txt[:200]))

print("== Parceiro externo")
s, _ = req("GET", "/processos", tok["PARCEIRO"])
checa("parceiro sem termo é bloqueado", s == 403, s)
req("POST", f"/equipe/{usuarios['PARCEIRO']['id']}/termo", adm, {"documentoUrl": "https://drive/termo-parceiro.pdf"})
s, lista = req("GET", "/processos", tok["PARCEIRO"])
ids = [p["id"] for p in (lista.get("data") or [])] if s == 200 else []
checa("parceiro vê só o processo em que participa", ids == [pid], (s, ids))
s, _ = req("GET", f"/processos/{proc2['id']}", tok["PARCEIRO"])
checa("parceiro NÃO abre processo alheio", s == 404, s)
s, _ = req("GET", f"/processos/{pid}", tok["PARCEIRO"])
checa("parceiro abre o processo dele", s == 200, s)
s, _ = req("GET", "/clientes", tok["PARCEIRO"])
checa("parceiro NÃO lista clientes", s == 403, s)
s, _ = req("GET", "/financeiro/lancamentos", tok["PARCEIRO"])
checa("parceiro NÃO vê financeiro", s == 403, s)
s, m = req("GET", "/cota-parte/minha", tok["PARCEIRO"])
checa("parceiro vê a própria comissão = 232,50", s == 200 and m["emApuracao"]["total"] == 232.5, (s, m))

print("== Fechamento e repasse")
s, _ = req("POST", "/cota-parte/fechamentos", tok["SOCIO"], {})
checa("sócio NÃO fecha período", s == 403, s)
s, f = req("POST", "/cota-parte/fechamentos", adm, {})
checa("admin fecha período", s in (200, 201) and f.get("quantidadeItens") == 2 and f.get("total") == 697.5, (s, f))
s, prev2 = req("GET", "/cota-parte/previa", adm)
checa("após fechar, nada em aberto", prev2.get("totalGeral") == 0, prev2)
s, minha2 = req("GET", "/cota-parte/minha", tok["ASSOCIADO"])
checa("associada: 465 disponível para repasse", minha2["disponivelParaRepasse"]["total"] == 465, minha2)
s, b = req("POST", f"/cota-parte/fechamentos/{f['id']}/repassar", adm,
           {"beneficiarioKey": "u:" + usuarios["ASSOCIADO"]["id"], "comprovanteUrl": "https://drive/pix.pdf"})
checa("admin marca repasse com comprovante", s in (200, 201) and b.get("itens") == 1, (s, b))
s, minha3 = req("GET", "/cota-parte/minha", tok["ASSOCIADO"])
checa("associada: repasse aparece como feito", minha3["disponivelParaRepasse"]["total"] == 0 and len(minha3["repassados"]) == 1, minha3)

print("== Conflitos e impedimentos")
s, emp = req("POST", "/clientes", adm, {"nome": "Construtora Exemplo Ltda", "cpfCnpj": "12.345.678/0001-90", "tipo": "PJ"})
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "Trabalhador Novo", "parteContrariaNome": "Outra Razão", "parteContrariaCpfCnpj": "12345678000190"})
checa("parte contrária é cliente -> bloqueia", s == 200 and v["bloqueado"] and v["ocorrencias"][0]["tipo"] == "PARTE_CONTRARIA_E_CLIENTE", (s, v))
checa("mensagem ao contato não revela o motivo", v.get("mensagemAoContato") and "cliente" not in v["mensagemAoContato"].lower(), v.get("mensagemAoContato"))
req("POST", f"/processos/{pid}/partes", adm, {"nome": "Banco Réu S.A.", "cpfCnpj": "99.888.777/0001-66", "polo": "passivo"})
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "banco reu sa", "cpfCnpj": "99888777000166"})
checa("contato é adversário de cliente -> bloqueia", v.get("bloqueado") and v["ocorrencias"][0]["tipo"] == "CONTATO_E_PARTE_CONTRARIA", v)
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "Pessoa Sem Relação", "parteContrariaNome": "Empresa Qualquer"})
checa("sem relação -> livre", s == 200 and v["bloqueado"] is False, v)
s, b = req("POST", "/conflitos/impedimentos/sessao-conciliacao", adm,
           {"orgao": "CEJUSC Balneário Camboriú", "dataSessao": "2026-10-01", "partes": [{"nome": "Maria Souza"}, {"nome": "João Pereira", "cpfCnpj": "555.666.777-88"}]})
checa("lança partes da sessão de conciliação", s in (200, 201) and b["registrados"] == 2, (s, b))
validade = b["impedimentos"][0]["validoAte"][:10] if s in (200, 201) else None
checa("impedimento vale 1 ano", validade == "2027-10-01", validade)
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "MARIA  souza"})
checa("parte conciliada procura o escritório -> bloqueia", v.get("bloqueado") and v["ocorrencias"][0]["tipo"] == "IMPEDIMENTO_CONCILIACAO", v)
req("POST", "/conflitos/impedimentos", adm, {"tipo": "TJD", "orgao": "TJD-SC"})
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "Clube Novo", "orgao": "TJD-SC"})
checa("caso no TJD onde atua como auditor -> bloqueia", v.get("bloqueado") and v["ocorrencias"][0]["tipo"] == "IMPEDIMENTO_ORGAO", v)
s, _ = req("POST", "/conflitos/verificar", tok["PARCEIRO"], {"nome": "x x x x x"})
checa("parceiro NÃO consulta conflitos", s == 403, s)

print("== Isolamento entre escritórios")
outro = registrar("b")
s, _ = req("GET", f"/cota-parte/processos/{pid}/ficha-financeira", outro)
checa("outro escritório NÃO vê a ficha", s == 404, s)
s, _ = req("POST", f"/cota-parte/processos/{pid}/participacoes", outro, {"usuarioId": me["id"], "papel": "INDICACAO"})
checa("outro escritório NÃO adiciona participação", s == 404, s)
s, p = req("GET", "/cota-parte/previa", outro)
checa("outro escritório: prévia vazia", p.get("totalGeral") == 0, p)
s, v = req("POST", "/conflitos/verificar", outro, {"nome": "Maria Souza"})
checa("outro escritório NÃO herda impedimentos", v.get("bloqueado") is False, v)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
if falhas:
    print("Falhas:", *falhas, sep="\n - ")
    sys.exit(1)
