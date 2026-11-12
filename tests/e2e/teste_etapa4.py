"""Teste de ponta a ponta da etapa 4 (DJEN, prazos, agenda, avisos e dativa) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção), com:
    DJEN_API_URL=http://localhost:3198  DATAJUD_BASE_URL=http://localhost:3198/datajud
    WHATSAPP_API_URL=http://localhost:3197/enviar  WHATSAPP_API_KEY=wa_teste
    ANTHROPIC_BASE_URL=http://localhost:3196  ANTHROPIC_API_KEY=sk-ant-teste-local
    CHAVE_CRIPTOGRAFIA=<64 hex>  DJEN_CAPTURA_DESLIGADA=true  NODE_ENV=development
    python -X utf8 tests/e2e/teste_etapa4.py  [pasta-com-autos_limpo.pdf-e-autos_injecao.pdf]
Sobe servidores falsos do DJEN/DataJud (3198), WhatsApp (3197) e Anthropic (3196): nada sai para serviços reais.
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import json, os, sys, threading, time, urllib.parse, urllib.request, urllib.error, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://localhost:3099/api"
PASTA_PDFS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("TEMP", "/tmp"), "jtpg", "pdfs")
falhas, oks = [], 0
sfx = str(int(time.time()))
n = sfx[-5:]  # deixa OABs e números únicos por execução


def oab(base):
    return f"{base}{n}"


def cnj(seq, j="8", tr="24", origem="0033"):
    return f"{seq:07d}-{int(n) % 97:02d}.2026.{j}.{tr}.{origem}"


def dig(num):
    return "".join(c for c in num if c.isdigit())


# ── Servidores falsos ────────────────────────────────────────────────────────
DJEN = {"itens": [], "chamadas": 0, "vazio_uma_vez": set(), "falhar": set()}
WA, IA = [], []


def item(id_, numero, data, texto, oabs, destinatarios, tipo_doc="Despacho", orgao="1ª Vara Cível da Comarca de Itajaí",
         classe="Procedimento Comum Cível", cancelado=None, tribunal="TJSC"):
    return {"id": int(id_), "hash": f"h{id_}", "numero_processo": dig(numero), "numeroprocessocommascara": numero,
            "siglaTribunal": tribunal, "tipoComunicacao": "Intimação", "tipoDocumento": tipo_doc, "nomeOrgao": orgao,
            "nomeClasse": classe, "data_disponibilizacao": data, "texto": f"<p>{texto}</p>", "link": "https://djen.fake/doc",
            "motivo_cancelamento": cancelado, "destinatarios": [{"nome": d, "polo": p} for d, p in destinatarios],
            "destinatarioadvogados": [{"advogado": {"nome": "Adv", "numero_oab": o, "uf_oab": "SC"}} for o in oabs],
            "_consulta": oabs}


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if u.path != "/api/v1/comunicacao":
            return self._json(404, {})
        DJEN["chamadas"] += 1
        if int(q.get("itensPorPagina", 0)) > 50:
            return self._json(200, {"count": 1, "items": []})
        no = q.get("numeroOab")
        if no and any(no.startswith(f) for f in DJEN["falhar"]):
            return self._json(500, {"erro": "instavel"})
        sel = []
        for it in DJEN["itens"]:
            if no and no not in it["_consulta"]:
                continue
            if q.get("numeroProcesso") and it["numero_processo"] != q["numeroProcesso"]:
                continue
            if q.get("dataDisponibilizacaoInicio") and it["data_disponibilizacao"] < q["dataDisponibilizacaoInicio"]:
                continue
            if q.get("dataDisponibilizacaoFim") and it["data_disponibilizacao"] > q["dataDisponibilizacaoFim"]:
                continue
            sel.append({k: v for k, v in it.items() if k != "_consulta"})
        pag = int(q.get("pagina", 1))
        if no in DJEN["vazio_uma_vez"] and sel:
            DJEN["vazio_uma_vez"].discard(no)
            return self._json(200, {"count": len(sel), "items": []})
        return self._json(200, {"count": len(sel), "items": sel[(pag - 1) * 50: pag * 50]})

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if self.path.startswith("/datajud/"):
            return self._json(200, {"hits": {"hits": []}})
        if self.path == "/enviar":
            WA.append(corpo)
            return self._json(200, {"id": "wa" + str(len(WA))})
        if self.path.startswith("/v1/messages"):
            IA.append({"path": self.path, "beta": self.headers.get("anthropic-beta"), "key": self.headers.get("x-api-key"), "corpo": corpo})
            modelo = corpo.get("model")
            if not corpo.get("stream"):
                return self._json(200, {"id": "msg_t", "type": "message", "role": "assistant", "model": modelo,
                                        "content": [{"type": "text", "text": "Resumo IA: o juiz decidiu a seu favor nesta fase. O advogado vai explicar os próximos passos."}],
                                        "stop_reason": "end_turn", "stop_sequence": None, "usage": {"input_tokens": 5, "output_tokens": 9}})
            texto = "EXCELENTÍSSIMO SENHOR JUIZ...\nRESPOSTA À ACUSAÇÃO\n[CONFERIR: data da prisão]\nPONTOS A CONFERIR\n- testemunhas"
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
        self._json(404, {})


for porta in (3198, 3197, 3196):
    srv = ThreadingHTTPServer(("localhost", porta), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()


# ── Utilitários ──────────────────────────────────────────────────────────────

def req(metodo, caminho, token=None, corpo=None, headers=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(BASE + caminho, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
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
        print("  FALHA", nome, str(extra)[:500])


def lista(b):
    if isinstance(b, list):
        return b
    if isinstance(b, dict):
        for k in ("data", "items", "notificacoes", "notifications"):
            if isinstance(b.get(k), list):
                return b[k]
    return []


def notifs(token):
    s, b = req("GET", "/notifications?per_page=100", token)
    return lista(b)


def dia(iso):
    # dataPrazo é fim do dia em Brasília (23:59 −03:00 → 02:59Z do dia seguinte)
    from datetime import datetime, timedelta
    d = datetime.fromisoformat(iso.replace("Z", "+00:00")) - timedelta(hours=3)
    return d.strftime("%Y-%m-%d")


def pub(token, djen_id):
    s, b = req("GET", "/publicacoes?per_page=100", token)
    for x in lista(b):
        if x.get("djenId") == str(djen_id):
            return x
    return None


# ── Preparação ───────────────────────────────────────────────────────────────
print("== Preparação")
s, b = req("POST", "/auth/register", corpo={"email": f"dj{sfx}@teste.local", "password": "SenhaForte123!", "nome": "Jonathan Teste", "nomeEscritorio": "Escritorio DJEN"})
assert s in (200, 201), (s, b)
adm = b["access_token"]
s, eq = req("GET", "/equipe", adm)
adm_id = next(u["id"] for u in lista(eq) if u["email"] == f"dj{sfx}@teste.local")
req("PATCH", f"/equipe/{adm_id}", adm, {"oabNumero": oab("1"), "oabEstado": "SC", "telefone": "(47) 98888-1111"})
s, parc = req("POST", "/parceiros", adm, {"nome": "Dr. Parceiro DJEN"})
us = {}
for perfil, o in [("SOCIO", oab("2")), ("ASSOCIADO", oab("3")), ("PARCEIRO", oab("4"))]:
    corpo = {"nome": f"U {perfil}", "email": f"dj{perfil.lower()}{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": perfil, "oabNumero": o, "oabEstado": "SC"}
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


tok = {p: login(f"dj{p.lower()}{sfx}@teste.local") for p in us}
req("POST", "/linhas/modelos/instalar-padrao", adm)

s, jose = req("POST", "/clientes", adm, {"nome": "José da Silva", "cpfCnpj": "33344455566", "tipo": "PF", "telefone": "(47) 99999-0000", "cidade": "Itajaí", "estado": "SC"})
s, lead = req("POST", "/clientes", adm, {"nome": "Pedro Lead Atendido", "cpfCnpj": "111" + n + "001", "tipo": "PF", "cidade": "Itajaí"})
s, joana = req("POST", "/clientes", adm, {"nome": "Joana Homonima", "cpfCnpj": "222" + n + "002", "tipo": "PF", "cidade": "Joinville"})
NA, NB, NE = cnj(101), cnj(102), cnj(105)
s, pa = req("POST", "/processos", adm, {"numero": NA, "clienteId": jose["id"], "titulo": "Revisão contratual José", "tribunal": "TJSC"})
s, pb = req("POST", "/processos", adm, {"numero": NB, "clienteId": jose["id"], "titulo": "Locação José"})
s, pe = req("POST", "/processos", adm, {"numero": NE, "clienteId": jose["id"], "titulo": "Caso da associada", "responsavelId": us["ASSOCIADO"]["id"]})

print("== Calendário")
s, f = req("POST", "/calendario/feriados", adm, {"tipo": "MUNICIPAL", "data": "2026-11-17", "comarca": "Itajaí", "descricao": "Feriado municipal de teste"})
checa("cadastra feriado municipal", s in (200, 201) and f.get("comarca") == "Itajaí", (s, f))
s, f = req("POST", "/calendario/feriados", tok["ASSOCIADO"], {"tipo": "MUNICIPAL", "data": "2026-11-18", "comarca": "X", "descricao": "x"})
checa("associada NÃO cadastra feriado", s == 403, s)
s, sim = req("GET", "/calendario/simular?disponibilizacao=2026-12-10&dias=15&tribunal=TJSC", adm)
checa("simulação atravessa recesso e suspensão até 20/01 (vence 03/02/2027)", s == 200 and sim.get("vencimento") == "2027-02-03", sim)
s, sim = req("GET", "/calendario/simular?disponibilizacao=2026-12-14&dias=10&contagem=CORRIDOS&penal=true&reuPreso=true&tribunal=TJSC", adm)
checa("penal com réu preso: não suspende, prorroga do Natal ao fim do recesso (07/01/2027)", s == 200 and sim.get("vencimento") == "2027-01-07", sim)

# ── Publicações no DJEN falso ────────────────────────────────────────────────
O1, O2, O3, O4 = oab("1"), oab("2"), oab("3"), oab("4")
NX, ND, NF8, NP, NQ = cnj(106), cnj(107, origem="0135"), cnj(108), cnj(110), cnj(111)
base_id = int(n) * 100
I = {k: base_id + k for k in range(1, 20)}
DJEN["itens"] = [
    item(I[1], NA, "2026-11-12", "Intime-se a parte autora para, no prazo de 15 (quinze) dias, manifestar-se sobre a contestação.", [O1], [("JOSÉ DA SILVA", "A")]),
    item(I[2], NB, "2026-11-12", "Vistos. Aguarde-se o retorno da carta precatória.", [O1, O2], [("JOSÉ DA SILVA", "A")], orgao="2ª Vara Cível da Comarca de Balneário Camboriú"),
    item(I[3], NA, "2026-11-12", "Designo audiência de conciliação para o dia 10/12/2026, às 14h00, a ser realizada por videoconferência.", [O1], [("JOSÉ DA SILVA", "A")]),
    item(I[4], NA, "2026-11-12", "Ante o exposto, JULGO PROCEDENTE o pedido para revisar o contrato.", [O1], [("JOSÉ DA SILVA", "A")], tipo_doc="Sentença"),
    item(I[5], NX, "2026-11-12", "Segredo de justiça. Manifestem-se as partes.", [O1], [("J.D.S.", "A")], orgao="Vara da Família da Comarca de Balneário Camboriú"),
    item(I[6], ND, "2026-11-12", "Nomeio o Dr. Jonathan, OAB/SC, como defensor dativo do réu preso CARLOS ACUSADO. Cite-se para resposta à acusação no prazo de 10 (dez) dias.",
         [O1], [("CARLOS ACUSADO", "P"), ("MINISTÉRIO PÚBLICO DO ESTADO DE SANTA CATARINA", "A")], orgao="Vara Criminal da Comarca de Itajaí", classe="Ação Penal - Procedimento Ordinário"),
    item(I[8], NF8, "2026-11-12", "Nomeio a advogada dativa para patrocinar a requerida, beneficiária da assistência judiciária gratuita (AJG). Prazo de 15 dias para contestar.",
         [O1], [("ANA ASSISTIDA", "P"), ("José da Silva", "A")], orgao="1ª Vara Cível da Comarca de Itajaí"),
    item(I[9], NE, "2026-11-12", "Intime-se para pagar as custas em 5 (cinco) dias.", [O3 + "-A"], [("JOSÉ DA SILVA", "A")]),
    item(I[10], NP, "2026-11-11", "Intime-se o autor no prazo de 15 dias.", [O4], [("Pedro Lead Atendido", "A")], orgao="1ª Vara Cível da Comarca de Joinville"),
    item(I[11], NQ, "2026-11-11", "Intime-se o réu no prazo de 15 dias.", [O4], [("Fulano Desconhecido Total", "P")], orgao="1ª Vara Cível da Comarca de Joinville"),
]
DJEN["vazio_uma_vez"].add(O2)

print("== Captura")
s, cap = req("POST", "/publicacoes/capturar", adm, {"inicio": "2026-11-10", "fim": "2026-11-12"})
caps = {c["oab"]: c for c in (cap or {}).get("capturas", [])}
checa("captura de todas as OABs do escritório (inclusive parceiro)", s == 200 and all(f"{o}/SC" in caps for o in (O1, O2, O3, O4)), cap)
checa("página vazia transitória do DJEN foi repetida (sócia capturou 1)", caps.get(f"{O2}/SC", {}).get("encontradas") == 1 and caps[f"{O2}/SC"].get("completo"), caps.get(f"{O2}/SC"))
checa("variante de sufixo da OAB (33333-A) encontrada", caps.get(f"{O3}/SC", {}).get("encontradas") == 1, caps.get(f"{O3}/SC"))
s, cap2 = req("POST", "/publicacoes/capturar", adm, {"inicio": "2026-11-10", "fim": "2026-11-12"})
checa("segunda captura não duplica (dedupe pelo id)", s == 200 and sum(c.get("novas", 0) for c in cap2["capturas"]) == 0, cap2)

print("== Prazos (97/98/115/116)")
p1 = pub(adm, I[1])
s, d1 = req("GET", f"/publicacoes/{p1['id']}", adm)
pr1 = d1["prazos"][0] if d1.get("prazos") else {}
checa("prazo de 15 dias úteis com feriado nacional (20/11) e municipal (17/11): vence 08/12", dia(pr1.get("dataPrazo", "1970-01-01T00:00:00Z")) == "2026-12-08" and not pr1.get("conferir"), pr1)
checa("memória do cálculo explica a publicação no dia útil seguinte", any("Lei 11.419" in m for m in pr1.get("memoriaCalculo", [])), pr1.get("memoriaCalculo"))
checa("prazo vinculado ao processo e com evento na agenda", pr1.get("processoId") == pa["id"] and pr1.get("eventoId"), pr1)
p2 = pub(adm, I[2])
s, d2 = req("GET", f"/publicacoes/{p2['id']}", adm)
pr2 = d2["prazos"][0]
checa("sem prazo explícito: provisório de 5 dias úteis marcado conferir (vence 23/11)", pr2["conferir"] and dia(pr2["dataPrazo"]) == "2026-11-23", pr2)
checa("publicação com 2 advogados: prazo para os dois", sorted(pr2["responsaveisIds"]) == sorted([adm_id, us["SOCIO"]["id"]]) and sorted(p2["intimadosIds"]) == sorted([adm_id, us["SOCIO"]["id"]]), pr2)
s, b = req("POST", f"/prazos/{pr2['id']}/cumprir", tok["ASSOCIADO"])
checa("associada não dá baixa em prazo alheio", s == 403, s)
s, b = req("POST", f"/prazos/{pr2['id']}/cumprir", tok["SOCIO"], {})
s, d2b = req("GET", f"/publicacoes/{p2['id']}", adm)
checa("baixa da sócia vale para o titular também (só marcação)", d2b["prazos"][0]["status"] == "cumprido" and d2b["prazos"][0]["cumpridoPorId"] == us["SOCIO"]["id"], d2b["prazos"][0])

print("== Visibilidade (95/96/112/113/114)")
s, la = req("GET", "/publicacoes?per_page=100", tok["ASSOCIADO"])
ids_assoc = {x["djenId"] for x in lista(la)}
checa("associada vê só a própria publicação", ids_assoc == {str(I[9])}, ids_assoc)
s, b = req("GET", f"/publicacoes/{p1['id']}", tok["ASSOCIADO"])
checa("associada NÃO abre publicação de outro", s == 404, s)
s, b = req("GET", "/intimacoes?per_page=100", tok["ASSOCIADO"])
checa("rota antiga /intimacoes também filtra para a associada", s == 200 and {x.get("djenId") for x in lista(b)} <= {str(I[9])}, [x.get("djenId") for x in lista(b)])
s, lp = req("GET", "/publicacoes?per_page=100", tok["PARCEIRO"])
ids_parc = {x["djenId"] for x in lista(lp)}
checa("parceiro vê as publicações dos processos particulares dele", ids_parc == {str(I[10]), str(I[11])}, ids_parc)
part = next(x for x in lista(lp) if x["djenId"] == str(I[11]))
checa("processo particular do parceiro tem vencimento calculado (sem ir para a agenda do escritório)", part.get("particular") and part.get("prazoFatal"), part)
s, ls = req("GET", "/publicacoes?per_page=100", tok["SOCIO"])
ids_socio = {x["djenId"] for x in lista(ls)}
checa("sócia vê o escritório todo, sem os particulares de parceiro", str(I[1]) in ids_socio and str(I[10]) not in ids_socio and str(I[11]) not in ids_socio, ids_socio)
ids_adm = {x["djenId"] for x in lista(req("GET", "/publicacoes?per_page=100", adm)[1])}
checa("titular vê o particular com coincidência e NÃO vê o sem coincidência", str(I[10]) in ids_adm and str(I[11]) not in ids_adm, ids_adm)
s, co = req("GET", "/publicacoes/coincidencias", adm)
c10 = next((x for x in lista(co) if x["djenId"] == str(I[10])), {})
checa("coincidência: parte do processo do parceiro é lead/cliente do escritório", any("Pedro Lead" in c["detalhe"] for c in (c10.get("coincidencias") or [])), c10)
s, b = req("GET", "/publicacoes/coincidencias", tok["SOCIO"])
checa("sócia NÃO acessa coincidências (só o titular)", s == 403, s)
na = notifs(adm)
checa("titular recebeu alerta de coincidência no sino", any(x.get("tipo") == "COINCIDENCIA_PARCEIRO" for x in na), [x.get("tipo") for x in na][:20])
checa("sócia NÃO recebeu alerta de coincidência", not any(x.get("tipo") == "COINCIDENCIA_PARCEIRO" for x in notifs(tok["SOCIO"])))
checa("aviso de publicação nova e de prazo a conferir no sino", any(x.get("tipo") == "PUBLICACAO_NOVA" for x in na) and any(x.get("tipo") == "PRAZO_CONFERIR" for x in na), [x.get("tipo") for x in na][:20])

print("== Sem vínculo (126)")
s, sv = req("GET", "/publicacoes?semVinculo=true&per_page=100", adm)
p5 = next((x for x in lista(sv) if x["djenId"] == str(I[5])), None)
checa("publicação em segredo vai para a fila sem vínculo do intimado", p5 is not None, [x["djenId"] for x in lista(sv)])
sug = (p5 or {}).get("sugestoesVinculo") or []
checa("sugestões pelas iniciais do cliente", any(x["processoId"] in (pa["id"], pb["id"]) for x in sug), sug)
s, d5 = req("GET", f"/publicacoes/{p5['id']}", adm)
checa("prazo da publicação sem vínculo já está na agenda", len(d5["prazos"]) == 1 and d5["prazos"][0]["processoId"] is None, d5["prazos"])
s, b = req("POST", f"/publicacoes/{p5['id']}/vincular", tok["ASSOCIADO"], {"processoId": pa["id"]})
checa("associada não vincula publicação alheia", s in (403, 404), s)
s, v5 = req("POST", f"/publicacoes/{p5['id']}/vincular", adm, {"processoId": pb["id"]})
checa("vínculo com um toque leva o prazo junto", s == 200 and not v5["semVinculo"] and v5["prazos"][0]["processoId"] == pb["id"], v5)

print("== Audiência e avisos ao cliente (119/120)")
s, msgs = req("GET", f"/mensagens-cliente?processoId={pa['id']}", adm)
tipos = sorted(m["tipo"] for m in lista(msgs))
checa("audiência gera aviso imediato e 2 lembretes, sem aprovação", tipos.count("AVISO_AUDIENCIA") == 1 and tipos.count("LEMBRETE_AUDIENCIA") == 2 and all(m["status"] == "AGENDADA" for m in lista(msgs) if "AUDIENCIA" in m["tipo"]), tipos)
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "enviarAgendadas"})
checa("aviso da audiência saiu pelo WhatsApp para o cliente", any(w.get("number") == "5547999990000" and "audiência" in w.get("text", "") for w in WA), WA)
s, msgs = req("GET", f"/mensagens-cliente?processoId={pa['id']}", adm)
lemb = [m for m in lista(msgs) if m["tipo"] == "LEMBRETE_AUDIENCIA"]
checa("lembretes futuros continuam agendados", all(m["status"] == "AGENDADA" for m in lemb) and len(lemb) == 2, lemb)
marco = next((m for m in lista(msgs) if m["tipo"] == "MARCO_PROCESSO"), None)
checa("sentença gera rascunho de aviso que precisa de aprovação", marco and marco["status"] == "RASCUNHO" and marco["precisaAprovacao"], marco)
checa("resumo do marco escrito pela IA barata (Haiku 5.5)", marco and marco["texto"].startswith("Resumo IA") and any(c["corpo"].get("model") == "claude-haiku-5-5" for c in IA), [c["corpo"].get("model") for c in IA])
antes = len(WA)
s, ap = req("POST", f"/mensagens-cliente/{marco['id']}/aprovar", adm, {})
checa("aprovado, o aviso é enviado na hora", s == 200 and ap["status"] == "ENVIADA" and len(WA) == antes + 1, (s, ap))
s, b = req("POST", f"/mensagens-cliente/{marco['id']}/aprovar", adm, {})
checa("não reenvia mensagem já enviada", s == 400, s)
s, evs = req("GET", f"/agenda?start=2026-12-01&end=2026-12-31&processId={pa['id']}", adm)
aud = [e for e in lista(evs) if e.get("tipo") == "AUDIENCIA" and e.get("processoId") == pa["id"]]
checa("audiência lançada na agenda em 10/12 às 14h", aud and aud[0]["data"].startswith("2026-12-10T17:00"), [e.get("data") for e in aud])

print("== Dativa (102/107/121/122)")
s, casos = req("GET", "/dativa", adm)
cd = next((c for c in lista(casos) if c["processo"] and c["processo"]["numero"] == ND), None)
checa("nomeação no DJEN criou o caso de dativa sozinho", cd is not None, [c.get("processo") for c in lista(casos)])
checa("réu preso em destaque", cd and cd["reuPreso"] and cd["destaque"] == "RÉU PRESO" and cd["materia"] == "CRIMINAL", cd)
s, det = req("GET", f"/dativa/{cd['id']}", adm)
checa("assistido é o réu (não o Ministério Público), com cadastro incompleto", det["processo"]["cliente"]["nome"] == "CARLOS ACUSADO" and det["processo"]["cliente"]["cadastroIncompleto"], det["processo"]["cliente"])
resp = [p for p in det["prazos"] if p["origem"] == "DJEN"]
aceite = [p for p in det["prazos"] if p["origem"] == "DATIVA_ACEITE"]
checa("prazo penal em dias corridos (começa no 1º dia útil, vence 25/11)", resp and resp[0]["contagem"] == "CORRIDOS" and dia(resp[0]["dataPrazo"]) == "2026-11-25", resp)
checa("prazo de aceite no AJG lançado como conferir", aceite and aceite[0]["conferir"], aceite)
s, lin = req("GET", f"/linhas/processos/{det['processoId']}", adm)
checa("linha de produção da dativa iniciada", s == 200 and "dativa" in json.dumps(lin, ensure_ascii=False).lower(), (s, str(lin)[:200]))
s, tar = req("GET", f"/tarefas?process_id={det['processoId']}&per_page=100", adm)
checa("réu preso: tarefa de contato (sem WhatsApp)", any("preso" in (t.get("titulo") or "") for t in lista(tar)), [t.get("titulo") for t in lista(tar)])
c8 = next((c for c in lista(casos) if c["processo"] and c["processo"]["numero"] == NF8), None)
checa("conflito: parte contrária da nomeada é cliente do escritório (alerta para recusar)", c8 and c8.get("conflitos") and any(o["tipo"] == "PARTE_CONTRARIA_E_CLIENTE" for o in c8["conflitos"]), c8)
checa("alerta de conflito no sino do titular", any(x.get("tipo") == "DATIVA_CONFLITO" for x in notifs(adm)))
s, b = req("GET", f"/dativa/{cd['id']}", tok["SOCIO"])
checa("dativa é do advogado nomeado: sócia não abre", s == 403, s)
s, b = req("POST", f"/dativa/{c8['id']}/recusar", adm, {"motivo": "Conflito de interesses: parte contrária é cliente."})
checa("recusa por conflito registrada", s == 200 and b["status"] == "RECUSADO", b)
s, b = req("POST", f"/dativa/{cd['id']}/aceitar", adm)
s, det = req("GET", f"/dativa/{cd['id']}", adm)
checa("aceite dá baixa no prazo de aceite", det["status"] == "ACEITO" and all(p["status"] == "cumprido" for p in det["prazos"] if p["origem"] == "DATIVA_ACEITE"), det["prazos"])
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "preventivas", "agora": "2027-02-11T12:00:00-03:00"})
s, det2 = req("GET", f"/dativa/{cd['id']}", adm)
checa("réu preso: alerta de 90 dias para cobrar a revisão da preventiva", any(x.get("tipo") == "DATIVA_REVISAO_PREVENTIVA" for x in notifs(adm)) and det2["proximoAlertaPreventiva"] > "2027-05", det2.get("proximoAlertaPreventiva"))

print("== Autos, varredura e rascunho pela IA (123/124)")
limpo = open(os.path.join(PASTA_PDFS, "autos_limpo.pdf"), "rb").read()
injecao = open(os.path.join(PASTA_PDFS, "autos_injecao.pdf"), "rb").read()
s, au = upload(f"/dativa/{cd['id']}/autos", adm, "autos.pdf", limpo)
checa("autos limpos: varredura sem achados e rascunho em geração", s in (200, 201) and au["varredura"]["resultado"] == "LIMPO" and au["rascunho"]["status"] == "GERANDO", (s, au))
for _ in range(40):
    s, rs = req("GET", f"/dativa/rascunhos/{au['rascunho']['id']}", adm)
    if rs.get("status") != "GERANDO":
        break
    time.sleep(0.5)
checa("rascunho pronto pelo Claude Opus 5.5", rs.get("status") == "PRONTO" and "PONTOS A CONFERIR" in (rs.get("texto") or ""), rs)
op = [c for c in IA if c["corpo"].get("model") == "claude-opus-5-5"]
checa("pedido ao Opus leva o PDF, raciocínio adaptativo e modelo de reserva", op and any(b.get("type") == "document" for b in op[-1]["corpo"]["messages"][0]["content"]) and op[-1]["corpo"].get("thinking", {}).get("type") == "adaptive" and "server-side-fallback" in (op[-1]["beta"] or ""), op[-1]["corpo"].keys() if op else None)
n_ia = len(IA)
s, au2 = upload(f"/dativa/{cd['id']}/autos", adm, "autos2.pdf", injecao)
checa("autos com instrução escondida: varredura acusa e a IA NÃO lê", s in (200, 201) and au2["varredura"]["resultado"] == "ACHADOS" and au2["rascunho"]["status"] == "AGUARDANDO_LIBERACAO", (s, au2))
time.sleep(1)
checa("nenhuma chamada à IA com o arquivo suspeito", len(IA) == n_ia, len(IA) - n_ia)
checa("advogado avisado com o trecho", any(x.get("tipo") == "VARREDURA_ACHADOS" and "Ignore" in x.get("mensagem", "") for x in notifs(adm)))
s, dv = req("POST", f"/dativa/varreduras/{au2['varredura']['id']}/decisao", adm, {"decisao": "DESCARTADO"})
s, rs2 = req("GET", f"/dativa/rascunhos/{au2['rascunho']['id']}", adm)
checa("advogado descarta: rascunho descartado", rs2.get("status") == "DESCARTADO", rs2)

print("== E-mail do AJG (103/104)")
s, tk = req("POST", "/dativa/email-ajg/token", tok["SOCIO"])
checa("só o titular gera o token do e-mail", s == 403, s)
s, tk = req("POST", "/dativa/email-ajg/token", adm)
NG = cnj(112, origem="0135")
email = {"from": "ajg@tjsc.jus.br", "subject": f"Nomeação - Processo {NG}",
         "text": f"Prezado(a), V. Sa. foi nomeado(a) no processo {NG}.\nAssistido: Rosa Assistida da Silva\nTelefone: (47) 99888-7766\nComarca de Navegantes\nAJG nº 778899"}
s, b = req("POST", "/dativa/email-ajg", None, email, {"X-JurysOne-Token": "token-errado-123456789012345"})
checa("e-mail com token errado é recusado", s == 403, s)
s, em = req("POST", "/dativa/email-ajg", None, email, {"X-JurysOne-Token": tk["token"]})
checa("e-mail do AJG cria o caso de dativa", s == 200 and em.get("criado"), em)
s, em2 = req("POST", "/dativa/email-ajg", None, email, {"X-JurysOne-Token": tk["token"]})
checa("mesmo e-mail de novo não duplica", em2.get("duplicado") is True, em2)
s, msgs = req("GET", f"/mensagens-cliente?processoId={em['processoId']}", adm)
ap_d = next((m for m in lista(msgs) if m["tipo"] == "APRESENTACAO_DATIVA"), None)
checa("assistido com telefone: apresentação por WhatsApp aguardando aprovação", ap_d and ap_d["status"] == "RASCUNHO" and ap_d["telefone"] == "47998887766", ap_d)

print("== Fim da dativa e honorários (105/106)")
s, ov0 = req("GET", "/financeiro/overview", adm)
DJEN["itens"].append(item(I[12], ND, "2026-11-12", "Ante o exposto, ABSOLVO o réu CARLOS ACUSADO. Fixo os honorários do defensor dativo nomeado em R$ 1.500,00.",
                          [O1], [("CARLOS ACUSADO", "P")], tipo_doc="Sentença", orgao="Vara Criminal da Comarca de Itajaí", classe="Ação Penal - Procedimento Ordinário"))
DJEN["itens"][0]["motivo_cancelamento"] = "Publicada em duplicidade"
s, cap3 = req("POST", "/publicacoes/capturar", adm, {"inicio": "2026-11-10", "fim": "2026-11-12", "usuarioId": adm_id})
s, det = req("GET", f"/dativa/{cd['id']}", adm)
checa("sentença com honorários fixados: valor registrado", float(det.get("valorFixado") or 0) == 1500.0 and det["status"] == "FIXADO", det)
s, fd = req("GET", "/dativa/financeiro", adm)
checa("financeiro da dativa do titular mostra o valor a receber", float(fd.get("fixadoNaoPago") or 0) == 1500.0, fd)
s, ld = req("GET", "/financeiro/lancamentos?per_page=200", adm)
checa("lançamento da dativa fica fora do financeiro do escritório", det["lancamentoId"] not in json.dumps(ld), "")
s, prev = req("GET", "/cota-parte/previa", adm)
checa("e fora da cota-parte", det["lancamentoId"] not in json.dumps(prev), "")
s, b = req("POST", f"/dativa/{cd['id']}/pedido-pagamento", adm, {})
checa("pedido de pagamento exige a certidão de atuação", s == 400, b)
req("POST", f"/dativa/{cd['id']}/certidao", adm, {})
s, b = req("POST", f"/dativa/{cd['id']}/pedido-pagamento", adm, {})
checa("pedido de pagamento ao Estado registrado", s == 200 and b["status"] == "AGUARDANDO_PAGAMENTO", b)
s, b = req("POST", f"/dativa/{cd['id']}/pagamento", adm, {"valor": 1500})
s, ov1 = req("GET", "/financeiro/overview", adm)
checa("pagamento recebido: caso PAGO e caixa do escritório inalterado", b["status"] == "PAGO" and ov0.get("receitas") == ov1.get("receitas"), (b.get("status"), ov0.get("receitas"), ov1.get("receitas")))
s, d1c = req("GET", f"/publicacoes/{p1['id']}", adm)
checa("publicação cancelada pelo tribunal: prazo cancelado", d1c["cancelada"] and d1c["prazos"][0]["status"] == "cancelado", (d1c.get("cancelada"), d1c["prazos"][0]["status"]))

print("== Alertas de prazo (100) e saúde da captura (127)")
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "alertarPrazos", "agora": "2026-11-21T10:00:00-03:00"})
s, d5b = req("GET", f"/publicacoes/{p5['id']}", adm)
checa("alerta 3 dias antes do vencimento", d5b["prazos"][0].get("alerta3dEm"), d5b["prazos"][0])
s, r2 = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "alertarPrazos", "agora": "2026-11-21T11:00:00-03:00"})
s, d5c = req("GET", f"/publicacoes/{p5['id']}", adm)
checa("sem alerta repetido", d5c["prazos"][0]["alerta3dEm"] == d5b["prazos"][0]["alerta3dEm"])
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "alertarPrazos", "agora": "2026-11-23T10:00:00-03:00"})
s, d5d = req("GET", f"/publicacoes/{p5['id']}", adm)
checa("alerta no dia do vencimento", d5d["prazos"][0].get("alertaDiaEm"), d5d["prazos"][0])
DJEN["falhar"].add(O4)
s, cf = req("POST", "/publicacoes/capturar", adm, {"usuarioId": us["PARCEIRO"]["id"]})
checa("falha do DJEN registrada sem derrubar a rotina", s == 200 and cf["capturas"][0].get("erro"), cf)
s, sd = req("GET", "/publicacoes/saude", adm)
checa("painel de saúde mostra a falha", any(e["oab"] == f"{O4}/SC" and e["falhaDesde"] for e in sd), sd)
from datetime import datetime, timedelta, timezone
futuro = (datetime.now(timezone.utc) + timedelta(hours=26)).isoformat()
antes = len(WA)
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "saudeCaptura", "agora": futuro})
checa("24 h sem captura: alerta no WhatsApp pessoal do titular", any(w.get("number") == "5547988881111" and O4 in w.get("text", "") for w in WA[antes:]), WA[antes:])
antes = len(WA)
s, r = req("POST", "/publicacoes/rotinas/executar", adm, {"rotina": "saudeCaptura", "agora": futuro})
checa("alerta não se repete enquanto a falha continua", not any(O4 in w.get("text", "") for w in WA[antes:]))
DJEN["falhar"].discard(O4)
s, cr = req("POST", "/publicacoes/capturar", adm, {"usuarioId": us["PARCEIRO"]["id"]})
s, sd = req("GET", "/publicacoes/saude", adm)
checa("captura volta e limpa a falha", any(e["oab"] == f"{O4}/SC" and not e["falhaDesde"] for e in sd), sd)

print("== Conciliações pelo número (117)")
NC = cnj(113)
DJEN["itens"].append(item(I[13], NC, "2026-10-01", "Intimem-se as partes para a sessão de conciliação.", ["000000"], [("Roberto Conciliado", "A"), ("Sandra Conciliada", "P")], orgao="CEJUSC da Comarca de Itajaí"))
s, cc = req("POST", "/conflitos/conciliacoes/por-numero", adm, {"numeros": [NC, "123"], "dataSessao": "2026-11-05"})
r0 = (cc or {}).get("resultado", [{}])[0]
checa("partes da conciliação buscadas pelo número (DJEN)", s == 200 and r0.get("impedimentosCriados") == 2, cc)
checa("número inválido apontado", s == 200 and cc["resultado"][1].get("erro"), cc)
s, v = req("POST", "/conflitos/verificar", adm, {"nome": "Roberto Conciliado"})
checa("parte conciliada fica impedida", v.get("bloqueado") and v["ocorrencias"][0]["tipo"] == "IMPEDIMENTO_CONCILIACAO", v)

print("== Importação pela OAB (109/110/111)")
NH, NI, NJ, NK = cnj(114), cnj(115), cnj(116), cnj(117)
DJEN["itens"] += [
    item(I[14], NH, "2026-06-10", "Intime-se.", [O2], [("Maria Nova Cliente", "A")]),
    item(I[15], NI, "2023-05-10", "Arquive-se.", [O2], [("Cliente Antigo Sumido", "A")]),
    item(I[16], NJ, "2026-07-01", "Intime-se.", [O2], [("José da Silva", "A")]),
    item(I[17], NK, "2026-08-01", "Intime-se.", [O2], [("Joana Homonima", "A")]),
]
s, im = req("POST", "/publicacoes/importar", tok["SOCIO"], {"desde": "2022-01-01"})
checa("importação: recentes entram, antigo vai para decisão, homônimo pede confirmação",
      s == 200 and im["processosCriados"] == 2 and im["paraDecidir"] == 1 and im["clientesAConfirmar"] == 1 and im["clientesVinculados"] == 1 and im["clientesNovos"] == 1, im)
checa("processo já cadastrado não é duplicado", im.get("jaCadastrados", 0) >= 1, im)
s, pend = req("GET", "/publicacoes/importacao/pendencias", tok["SOCIO"])
tipos = sorted(p["tipo"] for p in lista(pend))
checa("pendências: decidir antigo e confirmar cliente", tipos == ["CONFIRMAR_CLIENTE", "DECIDIR_ANTIGO"], tipos)
pk = next(p for p in lista(pend) if p["tipo"] == "CONFIRMAR_CLIENTE")
s, b = req("POST", f"/publicacoes/importacao/pendencias/{pk['id']}", tok["SOCIO"], {"acao": "IMPORTAR"})
checa("confirmação exige escolher o cliente ou criar novo", s == 400, b)
s, b = req("POST", f"/publicacoes/importacao/pendencias/{pk['id']}", tok["SOCIO"], {"acao": "IMPORTAR", "clienteId": joana["id"]})
checa("homônimo confirmado: processo criado no cliente escolhido", s == 200 and b["status"] == "IMPORTADO" and b["processoId"], b)
pi = next(p for p in lista(pend) if p["tipo"] == "DECIDIR_ANTIGO")
s, b = req("POST", f"/publicacoes/importacao/pendencias/{pi['id']}", tok["SOCIO"], {"acao": "DESCARTAR"})
checa("processo antigo descartado", s == 200 and b["status"] == "DESCARTADO", b)
s, cl = req("GET", "/clientes?search=Maria%20Nova&per_page=50", adm)
mn = next((c for c in lista(cl) if c["nome"] == "Maria Nova Cliente"), None)
checa("cliente novo marcado como cadastro incompleto", mn and mn.get("cadastroIncompleto"), mn)

print("== Google Agenda (108)")
s, b = req("GET", "/agenda-google/conectar", adm)
checa("conectar a agenda sem credenciais do Google explica o que falta", s == 400 and "GOOGLE_AGENDA_REDIRECT_URI" in json.dumps(b), (s, b))
s, b = req("GET", "/agenda-google/status", tok["PARCEIRO"])
checa("parceiro também pode ligar a própria agenda", s == 200 and b["conectada"] is False, (s, b))

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
for f in falhas:
    print("  -", f)
sys.exit(1 if falhas else 0)
