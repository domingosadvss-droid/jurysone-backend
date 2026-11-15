"""Teste de ponta a ponta da etapa 5 (calculadoras) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção), com:
    BCB_API_URL=http://localhost:3195  ANTHROPIC_BASE_URL=http://localhost:3196  ANTHROPIC_API_KEY=sk-ant-teste-local
    CALCULOS_ATUALIZACAO_DESLIGADA=true  DJEN_CAPTURA_DESLIGADA=true  NODE_ENV=development
    python -X utf8 tests/e2e/teste_etapa5.py  [pasta-com-autos_limpo.pdf-e-autos_injecao.pdf]
Sobe servidores falsos do Banco Central (3195) e da Anthropic (3196): nada sai para serviços reais.
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import json, math, os, sys, threading, time, urllib.parse, urllib.request, urllib.error, uuid
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://localhost:3099/api"
PASTA_PDFS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TEMP", "/tmp"), "jtpg", "pdfs")
falhas, oks = [], 0
sfx = str(int(time.time()))

hoje = (datetime.now(timezone.utc) - timedelta(hours=3)).date()


def comp_menos(d, n):
    t = d.year * 12 + (d.month - 1) - n
    return f"{t // 12}-{t % 12 + 1:02d}"


COMP_ATUAL, COMP_ANT, COMP_ANT2 = comp_menos(hoje, 0), comp_menos(hoje, 1), comp_menos(hoje, 2)

# ── Servidores falsos ────────────────────────────────────────────────────────
VAL = {"433": 0.4, "188": 0.35, "189": 0.5, "190": 0.5, "192": 0.6, "7456": 0.6, "10764": 0.45, "4390": 0.9, "226": 0.1, "25471": 1.8}
BCB = {"ate": COMP_ANT2, "extra": {}, "pedidos": []}
IA = []


def valor_bcb(cod, comp):
    return BCB["extra"].get((cod, comp), VAL.get(cod, 2.0))


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj, ctype="application/json"):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if not u.path.startswith("/dados/serie/bcdata.sgs."):
            return self._json(404, {})
        cod = u.path.split("bcdata.sgs.")[1].split("/")[0]
        BCB["pedidos"].append(cod)
        di = datetime.strptime(q["dataInicial"], "%d/%m/%Y").date()
        df = datetime.strptime(q["dataFinal"], "%d/%m/%Y").date()
        out, d = [], date(di.year, di.month, 1)
        while d <= df:
            c = f"{d.year}-{d.month:02d}"
            if c <= BCB["ate"] or (cod, c) in BCB["extra"]:
                out.append({"data": d.strftime("%d/%m/%Y"), "valor": f"{valor_bcb(cod, c):.4f}"})
                if cod == "226":  # TR diária: a linha do dia 2 deve ser ignorada
                    out.append({"data": d.replace(day=2).strftime("%d/%m/%Y"), "dataFim": "", "valor": "9.9999"})
            d = date(d.year + (d.month // 12), d.month % 12 + 1, 1)
        return self._json(200, out)

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if not self.path.startswith("/v1/messages"):
            return self._json(404, {})
        IA.append({"path": self.path, "beta": self.headers.get("anthropic-beta"), "corpo": corpo})
        modelo = corpo.get("model")
        conteudo = corpo["messages"][0]["content"]
        if corpo.get("stream"):
            texto = json.dumps({"pagamentos": [
                {"data": "2025-10-10", "valor": 50000, "descricao": "Sinal", "tipo": "SINAL", "pagina": 1},
                {"data": "2025-11-10", "valor": 10000, "descricao": "Parcela 1", "tipo": "PARCELA", "pagina": 2},
            ], "observacoes": "Comprovante da parcela 2 ilegível."})
            eventos = [
                ("message_start", {"type": "message_start", "message": {"id": "msg_s", "type": "message", "role": "assistant", "model": modelo, "content": [], "stop_reason": None, "stop_sequence": None, "usage": {"input_tokens": 10, "output_tokens": 1}}}),
                ("content_block_start", {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}),
                ("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": texto}}),
                ("content_block_stop", {"type": "content_block_stop", "index": 0}),
                ("message_delta", {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None}, "usage": {"output_tokens": 30}}),
                ("message_stop", {"type": "message_stop"}),
            ]
            b = "".join(f"event: {e}\ndata: {json.dumps(d)}\n\n" for e, d in eventos).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            return self.wfile.write(b)
        txt = conteudo if isinstance(conteudo, str) else json.dumps(conteudo)
        pedido = txt.split("<pedido_do_advogado>")[-1].lower()
        if "corretagem" in pedido:
            r = {"entendeu": True, "alteracoes": [{"caminho": "descontos.corretagem.ativo", "valorJson": "false"}], "explicacao": "Desliguei o desconto da corretagem."}
        elif "negativo" in pedido:
            r = {"entendeu": True, "alteracoes": [{"caminho": "valorContrato", "valorJson": "-5"}], "explicacao": "Mudei o valor do contrato."}
        else:
            r = {"entendeu": False, "alteracoes": [], "explicacao": "Não consegui traduzir o pedido em parâmetros."}
        return self._json(200, {"id": "msg_t", "type": "message", "role": "assistant", "model": modelo,
                                "content": [{"type": "text", "text": json.dumps(r)}], "stop_reason": "end_turn", "stop_sequence": None,
                                "usage": {"input_tokens": 5, "output_tokens": 9}})


for porta in (3195, 3196):
    srv = ThreadingHTTPServer(("localhost", porta), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


# ── Utilitários ──────────────────────────────────────────────────────────────

def req(metodo, caminho, token=None, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(BASE + caminho, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            b = resp.read()
            return resp.status, (json.loads(b) if b else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def baixar(caminho, token):
    r = urllib.request.Request(BASE + caminho, method="GET")
    r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.headers.get("Content-Disposition", ""), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, "", "", e.read()


def upload(caminho, token, nome, conteudo, campos=None):
    limite = "----jurysone" + uuid.uuid4().hex
    partes = [f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in (campos or {}).items()]
    partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="{nome}"\r\nContent-Type: application/pdf\r\n\r\n'.encode() + conteudo + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    r = urllib.request.Request(BASE + caminho, data=b"".join(partes), method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={limite}")
    r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        t = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t


def checa(nome, cond, extra=""):
    global oks
    if cond:
        oks += 1
        print("  OK  ", nome)
    else:
        falhas.append(nome)
        print("  FALHA", nome, str(extra)[:600])


def lista(b):
    if isinstance(b, list):
        return b
    if isinstance(b, dict):
        for k in ("data", "items", "notificacoes", "notifications"):
            if isinstance(b.get(k), list):
                return b[k]
    return []


def r2(v):
    return math.floor(v * 100 + 0.5 + 1e-9) / 100


def bloco(res, id_):
    return next((b for b in res.get("blocos", []) if b["id"] == id_), None)


def linha(b, trecho):
    return next((l for l in b["linhas"] if trecho in l["rotulo"]), None)


def resumo(res, rotulo):
    return next((x["valor"] for x in res.get("resumo", []) if x["rotulo"] == rotulo), None)


def esperar_extracao(token, id_, estados, limite=30):
    for _ in range(limite * 4):
        s, b = req("GET", f"/calculos/extracoes/{id_}", token)
        if s == 200 and b.get("status") in estados:
            return b
        time.sleep(0.25)
    return b


# ── Preparação ───────────────────────────────────────────────────────────────
print("== Preparação")
s, b = req("POST", "/auth/register", corpo={"email": f"calc{sfx}@teste.local", "password": "SenhaForte123!", "nome": "Jonathan Calculos", "nomeEscritorio": "Escritorio Calculos"})
assert s in (200, 201), (s, b)
adm = b["access_token"]
s, eq = req("GET", "/equipe", adm)
adm_id = next(u["id"] for u in lista(eq) if u["email"] == f"calc{sfx}@teste.local")
s, parc = req("POST", "/parceiros", adm, {"nome": "Dr. Parceiro Calc"})
us = {}
for perfil in ("SOCIO", "ASSOCIADO", "PARCEIRO"):
    corpo = {"nome": f"U {perfil}", "email": f"calc{perfil.lower()}{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": perfil}
    if perfil == "PARCEIRO":
        corpo["parceiroId"] = parc["id"]
    s, us[perfil] = req("POST", "/equipe", adm, corpo)
    assert s in (200, 201), (perfil, s, us[perfil])
for p in ("ASSOCIADO", "PARCEIRO"):
    req("POST", f"/equipe/{us[p]['id']}/termo", adm, {"documentoUrl": "https://drive/termo.pdf"})


def login(email):
    s, b = req("POST", "/auth/login", corpo={"email": email, "password": "SenhaForte123!"})
    assert s in (200, 201), (s, b)
    return b["access_token"]


tok = {p: login(f"calc{p.lower()}{sfx}@teste.local") for p in us}
s, cli = req("POST", "/clientes", adm, {"nome": "Maria Compradora", "cpfCnpj": "555" + sfx[-6:] + "01", "tipo": "PF", "cidade": "Itajaí", "estado": "SC"})
s, proc = req("POST", "/processos", adm, {"numero": f"5000{sfx[-3:]}-11.2026.8.24.0033", "clienteId": cli["id"], "titulo": "Distrato Maria", "tribunal": "TJSC"})
assert s in (200, 201), (s, proc)

print("== Catálogo e acesso")
s, cat = req("GET", "/calculos/catalogo", adm)
tipos = sorted(c["tipo"] for c in (cat or []))
checa("catálogo com as 9 calculadoras", tipos == sorted(["DISTRATO", "ATRASO_OBRA", "FINANCIAMENTO", "TRABALHISTA", "DEBITO", "LOCACAO", "PENSAO", "INSS", "VALOR_CAUSA"]), tipos)
checa("catálogo traz o esquema de parâmetros", all(isinstance(c.get("parametros"), dict) and c["parametros"].get("properties") for c in cat), cat[0] if cat else cat)
s, b = req("GET", "/calculos/catalogo", tok["PARCEIRO"])
checa("parceiro externo não acessa as calculadoras", s == 403, s)

print("== Distrato (128–135)")
P_DIS = {
    "lado": "COMPRADOR", "regime": "INCORPORACAO", "valorContrato": 400000, "dataContrato": "2018-06-01", "dataDistrato": "2026-03-01",
    "dataCalculo": "2026-10-15", "indice": "INCC",
    "pagamentos": [{"data": "2025-10-10", "valor": 100000, "tipo": "PARCELA"}, {"data": "2025-10-10", "valor": 10000, "tipo": "CORRETAGEM"}],
    "descontos": {"corretagem": {"ativo": True}, "campoLivre": {"ativo": True, "descricao": "Despesa de teste", "valor": 100}},
    "citacaoEm": "2026-01-10",
}
s, r = req("POST", "/calculos/simular", adm, {"tipo": "DISTRATO", "parametros": P_DIS})
f = 1.006 ** 12
pago = r2(100000 * f) + r2(10000 * f)
c1, c2, c3 = bloco(r, "cenario1"), bloco(r, "cenario2"), bloco(r, "cenario3")
checa("três cenários sempre lado a lado", s == 200 and c1 and c2 and c3, r)
checa("correção pelo índice do contrato (INCC, 12 meses de 0,6%)", c3 and abs(linha(c3, "Valores pagos")["valor"] - r2(pago)) < 0.02, (c3, pago))
checa("cenário 1: retenção de 25% sobre a quantia paga sem corretagem (art. 67-A)", c1 and abs(linha(c1, "Retenção")["valor"] + r2(r2(100000 * f) * 0.25)) < 0.02, c1)
checa("cenário 2 do comprador: retenção padrão de 10%", c2 and abs(linha(c2, "Retenção")["valor"] + r2(r2(100000 * f) * 0.10)) < 0.02, c2)
checa("cenário 2 mostra a faixa de 10% a 25%", c2 and any("25%" in o for o in c2.get("observacoes", [])), c2.get("observacoes") if c2 else None)
checa("desconto de corretagem e campo livre aplicados nos cenários 1 e 2", c1 and linha(c1, "corretagem") and linha(c2, "Despesa de teste"), c1)
juros3 = linha(c3, "Juros de mora desde a citação")
checa("cenário 3: juros desde a citação pela taxa legal (Selic − IPCA = 0,5% × 9 meses)", juros3 and abs(juros3["valor"] - r2(r2(pago) * 0.045)) < 0.05, juros3)
checa("cenários 1 e 2: juros só do trânsito em julgado (Tema 1002)", linha(c1, "trânsito")["valor"] == 0 and any("Tema 1002" in a for a in r["avisos"]), r["avisos"])
checa("data de devolução do cenário 1: 180 dias do distrato (sem afetação)", "28/08/2026" in c1.get("subtitulo", "") and "vencida há" in c1["subtitulo"], c1.get("subtitulo"))
checa("cenários 2 e 3: devolução imediata (Súmula 543)", "Súmula 543" in c2["subtitulo"] and "Súmula 543" in c3["subtitulo"], c2.get("subtitulo"))
checa("série 192 (INCC) consultada no BCB", "192" in BCB["pedidos"], BCB["pedidos"][:20])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "DISTRATO", "parametros": {**P_DIS, "patrimonioAfetacao": True, "habiteseEm": "2026-05-01", "lado": "CONSTRUTORA"}})
checa("afetação: retenção de 50% e devolução 30 dias após o habite-se", "50,00%" in linha(bloco(r, "cenario1"), "Retenção")["rotulo"] and "31/05/2026" in bloco(r, "cenario1")["subtitulo"], bloco(r, "cenario1"))
checa("lado da construtora: cenário 2 com 25%", "25,00%" in linha(bloco(r, "cenario2"), "Retenção")["rotulo"], bloco(r, "cenario2"))
s, r = req("POST", "/calculos/simular", adm, {"tipo": "DISTRATO", "parametros": {**P_DIS, "regime": "LOTEAMENTO", "descontos": {"fruicao": {"ativo": True, "inicioPosse": "2026-01-01", "fimPosse": "2026-01-31"}}}})
b1 = bloco(r, "cenario1")
checa("loteamento: retenção de 10% do valor atualizado do contrato e fruição de 0,75% a.m.", b1 and "valor atualizado do contrato" in linha(b1, "Retenção")["rotulo"] and "0,75%" in linha(b1, "fruição")["rotulo"], b1)
s, b = req("POST", "/calculos/simular", adm, {"tipo": "DISTRATO", "parametros": {**P_DIS, "valorContrato": -1}})
checa("parâmetros inválidos voltam 400 com a lista de erros", s == 400 and any("valorContrato" in e for e in b.get("erros", [])), b)

print("== Guardar, versões, chat e juntada (143/144)")
s, cr = req("POST", "/calculos", adm, {"tipo": "DISTRATO", "parametros": P_DIS, "processoId": proc["id"], "titulo": "Distrato Maria"})
cid = cr["calculo"]["id"] if s in (200, 201) else None
checa("cálculo guardado no caso com a versão 1", s in (200, 201) and cr["versao"]["numero"] == 1 and cr["calculo"]["processoId"] == proc["id"], cr)
s, ls = req("GET", f"/calculos?processoId={proc['id']}", adm)
checa("lista por processo com o total da versão atual", s == 200 and len(ls) == 1 and ls[0]["totalPrincipal"], ls)
s, v2 = req("POST", f"/calculos/{cid}/ajuste", adm, {"alteracoes": [{"caminho": "descontos.campoLivre.valor", "valor": 500}]})
checa("ajuste manual cria a versão 2", s == 200 and v2["numero"] == 2 and v2["parametros"]["descontos"]["campoLivre"]["valor"] == 500, v2)
n_ia = len(IA)
s, ch = req("POST", f"/calculos/{cid}/chat", adm, {"mensagem": "Tira a corretagem do cálculo"})
checa("chat: a IA só muda parâmetros e o sistema recalcula (versão 3)", s == 200 and ch.get("aplicado") and ch["versao"]["numero"] == 3 and ch["versao"]["parametros"]["descontos"]["corretagem"]["ativo"] is False, ch)
c1v3 = bloco(ch["versao"]["resultado"], "cenario1") if ch.get("versao") else None
checa("recalculado sem a linha da corretagem", c1v3 and not linha(c1v3, "corretagem"), c1v3)
ia_chat = IA[n_ia]["corpo"] if len(IA) > n_ia else {}
checa("chamada à IA: Opus 5.5 com saída estruturada (json_schema)", ia_chat.get("model") == "claude-opus-5-5" and (ia_chat.get("output_config") or {}).get("format", {}).get("type") == "json_schema", ia_chat.get("output_config"))
checa("chamada à IA com fallback no servidor", "server-side-fallback-2026-07-01" in (IA[n_ia]["beta"] or "") and ia_chat.get("fallbacks") == "default", (IA[n_ia]["beta"] if len(IA) > n_ia else None, ia_chat.get("fallbacks")))
checa("versão 3 guarda a mensagem e a explicação da IA", ch["versao"]["mensagemChat"] and "corretagem" in ch["versao"]["explicacaoIa"], ch["versao"])
s, ch2 = req("POST", f"/calculos/{cid}/chat", adm, {"mensagem": "faz nada com isso aí"})
checa("pedido que a IA não entende não cria versão", s == 200 and ch2["aplicado"] is False, ch2)
s, ch3 = req("POST", f"/calculos/{cid}/chat", adm, {"mensagem": "coloca valor negativo no contrato"})
checa("alteração inválida da IA é barrada pela validação", s == 200 and ch3["aplicado"] is False and ch3["erros"], ch3)
s, ob = req("GET", f"/calculos/{cid}", adm)
checa("só 3 versões existem depois dos pedidos recusados", s == 200 and ob["calculo"]["versaoAtual"] == 3 and len(ob["versoes"]) == 3, ob.get("versoes"))
for fmt, magica, mime in (("xlsx", b"PK", "spreadsheetml"), ("docx", b"PK", "wordprocessingml"), ("pdf", b"%PDF", "application/pdf")):
    s, ct, cd, corpo = baixar(f"/calculos/{cid}/arquivo/{fmt}", adm)
    checa(f"baixa a memória em {fmt}", s == 200 and corpo[:len(magica)] == magica and mime in ct and "attachment" in cd, (s, ct, cd, corpo[:20]))
s, ct, cd, corpo = baixar(f"/calculos/{cid}/arquivo/xlsx?versao=1", adm)
checa("baixa uma versão anterior", s == 200 and "_v1_" in cd, cd)
s, jt = req("POST", f"/calculos/{cid}/versoes/3/juntar", adm)
checa("versão 3 juntada aos autos com PDF, Word e Excel no processo", s == 200 and jt["juntada"] and len(jt["documentosIds"]) == 3, jt)
s, v4 = req("POST", f"/calculos/{cid}/ajuste", adm, {"alteracoes": [{"caminho": "retencaoJurisprudenciaPct", "valor": 15}]})
s, v3 = req("GET", f"/calculos/{cid}/versoes/3", adm)
checa("ajuste depois da juntada vira versão 4 e a 3 fica intacta", v4.get("numero") == 4 and v3["juntada"] and v3["parametros"].get("retencaoJurisprudenciaPct") is None, (v4.get("numero"), v3.get("parametros", {}).get("retencaoJurisprudenciaPct")))

s, b = req("GET", f"/calculos/{cid}", tok["ASSOCIADO"])
checa("associada não vê cálculo de outro advogado", s == 403, s)
s, ca = req("POST", "/calculos", tok["ASSOCIADO"], {"tipo": "VALOR_CAUSA", "parametros": {"modo": "ALIMENTOS", "prestacaoMensal": 1000}})
s2, la = req("GET", "/calculos", tok["ASSOCIADO"])
checa("associada cria e vê só o próprio cálculo", s in (200, 201) and len(la) == 1 and la[0]["id"] == ca["calculo"]["id"], la)
s, la = req("GET", "/calculos", tok["SOCIO"])
checa("sócia vê todos os cálculos do escritório", s == 200 and len(la) == 2, la)

print("== Financiamentos (137–139)")
P_FIN = {"tipo": "VEICULO", "credor": {"nome": "Banco Privado", "natureza": "PRIVADO"}, "dataContratacao": "2024-03-10", "dataCalculo": "2026-10-15",
         "valorLiberado": 40000, "prazoMeses": 36, "taxaMensal": 3.5, "parcelasPagas": 10, "sistema": "PRICE",
         "tarifas": [{"tipo": "TAC", "valor": 800}, {"tipo": "AVALIACAO", "valor": 400, "servicoComprovado": False}, {"tipo": "SEGURO_PRESTAMISTA", "valor": 1200, "escolhaSeguradora": False}, {"tipo": "IOF", "valor": 600}],
         "citacaoEm": "2026-02-01"}
s, r = req("POST", "/calculos/simular", adm, {"tipo": "FINANCIAMENTO", "parametros": P_FIN})
checa("média do BCB de veículos (série 25471) consultada", "25471" in BCB["pedidos"] and resumo(r, "Média do BCB (% a.m.)") == 1.8, resumo(r, "Média do BCB (% a.m.)"))
checa("juros acima da média + 50% limitados à média", resumo(r, "Taxa revisada (% a.m.)") == 1.8, resumo(r, "Taxa revisada (% a.m.)"))
tes = bloco(r, "teses")
obs = " ".join(tes.get("observacoes", [])) if tes else ""
checa("TAC após 2008, avaliação sem serviço e seguro sem escolha retirados (Temas 618, 958, 972)", "Tema 618" in obs and "Tema 958" in obs and "Tema 972" in obs and "IOF" not in obs, obs)
ind = bloco(r, "indebito")
checa("credor privado: dobra do art. 42 do CDC, separando antes/depois de 30/03/2021", ind and linha(ind, "após 30/03/2021") and linha(ind, "até 30/03/2021"), ind)
tot_corr = linha(ind, "corrigidos")["valor"]
checa("dobra soma o valor pago a mais duas vezes", abs(linha(ind, "após 30/03/2021")["valor"] + linha(ind, "até 30/03/2021")["valor"] - tot_corr) < 0.02 and tot_corr > 0, ind)
checa("destaques próprios de veículo", any("Tema 958" in d for d in r["destaques"]), r["destaques"])
checa("tabelas: indébito, parcelas pagas e Price × SAC", [t["id"] for t in r["tabelas"]] == ["indebito", "parcelas", "price_sac"], [t["id"] for t in r["tabelas"]])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "FINANCIAMENTO", "parametros": {**P_FIN, "credor": {"nome": "Caixa", "natureza": "PUBLICO"}}})
ind = bloco(r, "indebito")
checa("credor público: sempre simples", ind and not linha(ind, "Dobra") and "simples" in ind["titulo"], ind)
s, r = req("POST", "/calculos/simular", adm, {"tipo": "FINANCIAMENTO", "parametros": {"tipo": "CHEQUE_ESPECIAL", "dataContratacao": "2025-01-10", "dataCalculo": "2026-10-15", "valorLiberado": 1, "taxaMensal": 12, "limiteDiscrepanciaPct": 500, "rotativo": {"saldoUtilizado": 5000, "meses": 6}}})
checa("cheque especial de PF limitado a 8% a.m. (Res. CMN 4.765)", s == 200 and resumo(r, "Taxa revisada (% a.m.)") == 8, (s, r if s != 200 else resumo(r, "Taxa revisada (% a.m.)")))
s, r = req("POST", "/calculos/simular", adm, {"tipo": "FINANCIAMENTO", "parametros": {"tipo": "CARTAO_ROTATIVO", "dataContratacao": "2024-06-10", "dataCalculo": "2026-10-15", "valorLiberado": 1, "taxaMensal": 2.5, "capitalizacaoPactuada": True, "rotativo": {"saldoUtilizado": 1000, "meses": 60}}})
checa("rotativo: encargos limitados a 100% do principal (Lei 14.690)", s == 200 and resumo(r, "Encargos devidos") == 1000, resumo(r, "Encargos devidos") if s == 200 else r)
s, r = req("POST", "/calculos/simular", adm, {"tipo": "FINANCIAMENTO", "parametros": {**P_FIN, "tipo": "CAPITAL_GIRO"}})
checa("pessoa jurídica: aviso de que precisa demonstrar vulnerabilidade", any("vulnerabilidade" in a for a in r["avisos"]), r["avisos"])

print("== Trabalhista (140/141)")
P_TRA = {"salario": 3000, "dataAdmissao": "2020-02-01", "dataDemissao": "2025-12-15", "ajuizamentoEm": "2026-03-01", "dataCalculo": "2026-10-15",
         "pedidos": [{"tipo": "AVISO_PREVIO", "chance": "ALTA"}, {"tipo": "HORAS_EXTRAS", "chance": "MEDIA", "horasMes": 10}, {"tipo": "DANO_MORAL", "chance": "BAIXA", "valor": 10000}]}
s, r = req("POST", "/calculos/simular", adm, {"tipo": "TRABALHISTA", "parametros": P_TRA})
oti, rea, pes = bloco(r, "otimista"), bloco(r, "realista"), bloco(r, "pessimista")
checa("três faixas: otimista ≥ realista ≥ pessimista", s == 200 and oti["total"]["valor"] >= rea["total"]["valor"] >= pes["total"]["valor"] > 0, r if s != 200 else [oti["total"], rea["total"], pes["total"]])
hon = linha(rea, "êxito")
bruto = sum(l["valor"] for l in rea["linhas"] if "êxito" not in l["rotulo"])
checa("30% de êxito descontados do cliente", hon and abs(hon["valor"] + r2(bruto * 0.3)) < 0.02 and rea.get("recomendado"), hon)
checa("aviso prévio de 45 dias (5 anos completos)", resumo(r, "Aviso prévio (dias)") == 45, resumo(r, "Aviso prévio (dias)"))
tab = r["tabelas"][0]
lv = next(l for l in tab["linhas"] if l["pedido"].startswith("Aviso"))
checa("correção ADC 58: IPCA-E e TRD antes da ação; IPCA e taxa legal depois", lv["f1"] > 1 and lv["trd"] > 0 and lv["selic"] == 0 and lv["f3"] > 1 and lv["jl"] > 0, lv)
checa("TR: só a linha do dia 1º de cada mês (TRD = 0,1% × meses)", abs(lv["trd"] - 0.1 * 3) < 1e-6, lv["trd"])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "TRABALHISTA", "parametros": {**P_TRA, "dataDemissao": "2023-01-10", "dataAdmissao": "2015-01-10", "ajuizamentoEm": "2024-01-10"}})
lv = next(l for l in r["tabelas"][0]["linhas"] if l["pedido"].startswith("Aviso"))
checa("ação antes de set/2024: Selic até ago/2024 e IPCA + taxa legal depois", lv["selic"] > 0 and lv["f3"] > 1, lv)
checa("prescrição quinquenal limita as horas extras", any("prescrição quinquenal" in a for a in r["avisos"]), r["avisos"])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "TRABALHISTA", "parametros": {**P_TRA, "ajuizamentoEm": "2028-01-10", "dataCalculo": "2028-02-01"}})
checa("prescrição bienal avisada", any("PRESCRIÇÃO BIENAL" in a for a in r["avisos"]), r["avisos"])

print("== Débito, locação, pensão, INSS e atraso de obra (136/142)")
s, r = req("POST", "/calculos/simular", adm, {"tipo": "DEBITO", "parametros": {"parcelas": [{"descricao": "NP antiga", "vencimento": "2022-01-10", "valor": 5000}, {"descricao": "NP nova", "vencimento": "2025-06-10", "valor": 5000}],
                                                                               "dataCalculo": "2026-10-15", "tipoTitulo": "NOTA_PROMISSORIA", "cumprimentoSentenca": {"ativo": True, "intimadoEm": "2026-08-01"}}})
deb = bloco(r, "debito")
checa("alerta de prescrição por tipo de título (nota promissória: 3 anos)", any("prescreveu" in a and "NP antiga" in a for a in r["avisos"]) and not any("NP nova" in a and "prescreveu" in a for a in r["avisos"]), r["avisos"])
checa("cumprimento de sentença: multa e honorários de 10% (art. 523)", deb and linha(deb, "Multa de 10%") and linha(deb, "Honorários de 10%"), deb)
s, r = req("POST", "/calculos/simular", adm, {"tipo": "LOCACAO", "parametros": {"modo": "AMBOS", "aluguelVigente": 2000, "alugueis": [{"vencimento": "2026-07-05", "valor": 2000}], "aniversarioReajuste": "2026-09-01", "dataCalculo": "2026-10-15"}})
checa("locação: purgação da mora, reajuste anual e valor da causa de 12 aluguéis", bloco(r, "purgacao") and bloco(r, "reajuste") and resumo(r, "Valor da causa do despejo (12 aluguéis)") == 24000, r.get("resumo"))
checa("reajuste pelo IGP-M de 12 meses (0,5% ao mês)", abs(resumo(r, "Novo aluguel") - r2(2000 * 1.005 ** 12)) < 0.02, resumo(r, "Novo aluguel"))
s, r = req("POST", "/calculos/simular", adm, {"tipo": "PENSAO", "parametros": {"periodos": [{"de": "2025-11", "ate": "2026-09", "valor": 1000}], "ajuizamentoEm": "2026-06-01", "dataCalculo": "2026-10-15"}})
pr = r["tabelas"][0]["linhas"]
checa("pensão: 3 últimas antes da ação + as do curso no rito da prisão (Súmula 309)", sum(1 for l in pr if l["rito"] == "PRISÃO") == 3 + 4 and sum(1 for l in pr if l["rito"] == "PENHORA") == 4, [(l["competencia"], l["rito"]) for l in pr])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "INSS", "parametros": {"dib": "2021-03-10", "dip": "2026-06-01", "rmi": 2000, "ajuizamentoEm": "2025-01-10", "citacaoEm": "2025-03-01", "dataCalculo": "2026-10-15", "honorariosPct": 10}})
ins = bloco(r, "atrasados")
checa("INSS: Selic desde dez/2021 (EC 113) e honorários da Súmula 111", ins and linha(ins, "Súmula 111") is None and linha(ins, "Honorários") and any(l["selic"] > 0 for l in r["tabelas"][0]["linhas"]), ins)
checa("INSS: aviso para conferir os reajustes", any("reajustes" in a for a in r["avisos"]), r["avisos"])
s, r = req("POST", "/calculos/simular", adm, {"tipo": "ATRASO_OBRA", "parametros": {"valorImovel": 500000, "dataContrato": "2020-01-01", "prazoEntrega": "2024-01-01", "entregaEm": "2025-01-01", "dataCalculo": "2026-10-15",
                                                                                   "clausulaPenal": {"ativo": True, "modo": "VALOR_MENSAL", "valor": 1000}, "danosMorais": {"ativo": True, "valor": 10000}, "campoLivre": {"ativo": True, "descricao": "Aluguel pago", "valor": 3000}}})
la_, pb_ = bloco(r, "lucros"), bloco(r, "penal")
checa("atraso: tolerância de 180 dias e lucros cessantes de 0,5% a.m.", la_ and "0,50%" in la_["linhas"][0]["rotulo"] and resumo(r, "Data-limite com tolerância") == "29/06/2024", r.get("resumo"))
checa("cláusula penal não cumula (Tema 970) e a maior é indicada", la_.get("recomendado") and not pb_.get("recomendado") and any("Tema 970" in a for a in r["avisos"]), (la_["total"], pb_["total"]))
checa("faixa de 0,5% a 1% nos lucros cessantes", any("1% a.m." in o for o in la_.get("observacoes", [])), la_.get("observacoes"))

print("== Valor da causa e custas")
s, r = req("POST", "/calculos/simular", adm, {"tipo": "VALOR_CAUSA", "parametros": {"modo": "INDENIZACAO", "pedidos": [{"descricao": "Material", "valor": 20000}, {"descricao": "Moral", "valor": 10000}], "salarioMinimo": 1500}})
checa("valor da causa pela soma dos pedidos (art. 292, V)", resumo(r, "Valor da causa") == 30000 and resumo(r, "Juizado Especial Cível (até 40 SM)") == "cabe", r.get("resumo"))
checa("sem tabela de custas cadastrada: aviso, sem valor inventado", resumo(r, "Custas") == "não calculadas" and any("não cadastrada" in a for a in r["avisos"]), r["avisos"])
TAB = {"tribunal": "TJSC", "ato": "INICIAL", "vigenciaDe": "2026-01-01", "fonte": "Tabela de teste", "faixas": [{"valorDe": 0, "valorAte": 10000, "valorFixo": 150}, {"valorDe": 10000.01, "valorAte": None, "valorFixo": 100, "percentual": 1, "maximo": 5000}]}
s, b = req("POST", "/calculos/custas", tok["ASSOCIADO"], TAB)
checa("associada não cadastra tabela de custas", s == 403, s)
s, b = req("POST", "/calculos/custas", adm, TAB)
checa("titular cadastra a tabela de custas", s in (200, 201) and len(b) == 2, b)
s, r = req("POST", "/calculos/simular", adm, {"tipo": "VALOR_CAUSA", "parametros": {"modo": "INDENIZACAO", "pedidos": [{"descricao": "Material", "valor": 30000}]}})
checa("custas pela faixa cadastrada (R$ 100 + 1% = R$ 400)", resumo(r, "Custas") == 400, r.get("resumo"))

print("== Leitura de pagamentos pela IA (133)")
limpo = open(os.path.join(PASTA_PDFS, "autos_limpo.pdf"), "rb").read()
injecao = open(os.path.join(PASTA_PDFS, "autos_injecao.pdf"), "rb").read()
n_ia = len(IA)
s, ex = upload("/calculos/extracoes", adm, "extrato.pdf", limpo, {"processoId": proc["id"], "finalidade": "distrato"})
checa("PDF limpo passa na varredura e vai para a IA", s in (200, 201) and ex["status"] == "PROCESSANDO" and ex["varredura"]["resultado"] != "ACHADOS", ex)
exr = esperar_extracao(adm, ex["id"], ("AGUARDANDO_CONFERENCIA", "ERRO", "SEM_IA"))
checa("IA devolve a tabela e espera a conferência do advogado", exr.get("status") == "AGUARDANDO_CONFERENCIA" and len(exr.get("pagamentos") or []) == 2 and "ilegível" in (exr.get("observacoes") or ""), exr)
ia_pdf = next((x for x in IA[n_ia:] if x["corpo"].get("stream")), {"corpo": {}})
docs = [c for c in ia_pdf["corpo"].get("messages", [{}])[0].get("content", []) if isinstance(c, dict) and c.get("type") == "document"]
checa("PDF enviado como documento ao Opus 5.5 com saída estruturada", docs and ia_pdf["corpo"].get("model") == "claude-opus-5-5" and (ia_pdf["corpo"].get("output_config") or {}).get("format", {}).get("type") == "json_schema", ia_pdf["corpo"].get("model"))
s, b = req("POST", "/calculos", adm, {"tipo": "DISTRATO", "extracaoId": ex["id"], "parametros": {k: v for k, v in P_DIS.items() if k != "pagamentos"}})
checa("tabela não conferida não entra no cálculo", s == 400 and "conferida" in json.dumps(b), (s, b))
s, cf = req("POST", f"/calculos/extracoes/{ex['id']}/conferir", adm, {"pagamentos": [{"data": "2025-10-10", "valor": 50000, "tipo": "SINAL"}, {"data": "2025-11-10", "valor": 10000}, {"data": "2025-12-10", "valor": 10000, "descricao": "parcela 2 conferida à mão"}]})
checa("advogado confere e corrige a tabela", s == 200 and cf["status"] == "CONFERIDA" and len(cf["pagamentos"]) == 3, cf)
s, cr2 = req("POST", "/calculos", adm, {"tipo": "DISTRATO", "extracaoId": ex["id"], "parametros": {k: v for k, v in P_DIS.items() if k != "pagamentos"}})
checa("cálculo criado com os pagamentos conferidos", s in (200, 201) and len(cr2["versao"]["parametros"]["pagamentos"]) == 3, cr2)
n_ia = len(IA)
s, ex2 = upload("/calculos/extracoes", adm, "contrato.pdf", injecao)
checa("PDF com instrução escondida: leitura suspensa", s in (200, 201) and ex2["status"] == "AGUARDANDO_LIBERACAO" and ex2["varredura"]["resultado"] == "ACHADOS", ex2)
time.sleep(1)
checa("nenhuma chamada à IA antes da decisão do advogado", not any(x["corpo"].get("stream") for x in IA[n_ia:]), len(IA) - n_ia)
s, nt = req("GET", "/notifications?per_page=100", adm)
checa("alerta no sino com o trecho suspeito", any(n.get("tipo") == "VARREDURA_ACHADOS" and "Trecho" in n.get("mensagem", "") for n in lista(nt)), [n.get("tipo") for n in lista(nt)])
s, d = req("POST", f"/calculos/extracoes/{ex2['id']}/decisao", adm, {"decisao": "DESCARTADO"})
checa("advogado descarta o arquivo suspeito", s == 200 and d["status"] == "DESCARTADA", d)
s, ex3 = upload("/calculos/extracoes", adm, "contrato2.pdf", injecao)
s, d = req("POST", f"/calculos/extracoes/{ex3['id']}/decisao", adm, {"decisao": "LIBERADO"})
exr3 = esperar_extracao(adm, ex3["id"], ("AGUARDANDO_CONFERENCIA", "ERRO", "SEM_IA"))
checa("liberado pelo advogado, a leitura segue", d.get("status") == "PROCESSANDO" and exr3.get("status") == "AGUARDANDO_CONFERENCIA", exr3)

print("== Atualização mensal (143)")
P_ATU = {**P_DIS, "dataCalculo": None, "citacaoEm": None}
s, cr3 = req("POST", "/calculos", adm, {"tipo": "DISTRATO", "parametros": P_ATU, "titulo": "Distrato para atualizar"})
cid3 = cr3["calculo"]["id"]
checa("mês sem índice divulgado entra como zero com aviso", any("sem valor divulgado" in a for a in cr3["versao"]["resultado"]["avisos"]), cr3["versao"]["resultado"]["avisos"])
s, v3a = req("GET", f"/calculos/{cid}/versoes/3", adm)
BCB["extra"][("192", COMP_ANT)] = 10.0
s, at = req("POST", "/calculos/atualizar-agora", adm, {})
mud = next((x for x in at if x["id"] == cid3), {}) if s == 200 else {}
checa("índice novo publicado: nova versão com a correção atualizada", s == 200 and mud.get("mudou") and mud.get("versao") == 2 and mud.get("variacao", 0) > 0.05, at)
s, nt = req("GET", "/notifications?per_page=100", adm)
checa("variação acima de 5% avisada no sino", any(n.get("tipo") == "CALCULO_VARIACAO" and "Distrato para atualizar" in n.get("mensagem", "") for n in lista(nt)), [n.get("titulo") for n in lista(nt)])
s, v3b = req("GET", f"/calculos/{cid}/versoes/3", adm)
checa("versão juntada aos autos não muda com a atualização", v3b["juntada"] and v3b["totalPrincipal"] == v3a["totalPrincipal"] and v3b["resultado"] == v3a["resultado"], (v3a.get("totalPrincipal"), v3b.get("totalPrincipal")))
s, ob = req("GET", f"/calculos/{cid}", adm)
checa("cálculo com a versão juntada também ganhou versão atualizada", ob["calculo"]["versaoAtual"] >= 5 and ob["versoes"][-1]["origem"] == "ATUALIZACAO_MENSAL", ob["versoes"][-1])
s, at2 = req("POST", "/calculos/atualizar-agora", adm, {})
checa("sem índice novo, não cria versão repetida", s == 200 and not any(x.get("mudou") for x in at2), at2)
s, b = req("POST", "/calculos/atualizar-agora", tok["SOCIO"], {})
checa("só o titular dispara a atualização manual", s == 403, s)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
for f_ in falhas:
    print("  -", f_)
sys.exit(1 if falhas else 0)
