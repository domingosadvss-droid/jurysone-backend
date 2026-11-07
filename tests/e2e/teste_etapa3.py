"""Teste de ponta a ponta da etapa 3 (arquivos do caso e assinatura) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção), com:
    ZAPSIGN_API_URL=http://localhost:3199  ZAPSIGN_API_TOKEN=tok_teste  ZAPSIGN_WEBHOOK_TOKEN=wh_teste
    python -X utf8 tests/e2e/teste_etapa3.py
O teste sobe um servidor falso da ZapSign na porta 3199 (só imita a API pública; não fala com a ZapSign).
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import base64, json, sys, threading, time, urllib.request, urllib.error, uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://localhost:3099/api"
falhas, oks = [], 0

# ── Servidor falso da ZapSign ────────────────────────────────────────────────
ZAP = {"docs": {}, "chamadas": []}


class FakeZap(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        ZAP["chamadas"].append(("POST", self.path, self.headers.get("Authorization"), corpo))
        if self.headers.get("Authorization") != "Bearer tok_teste":
            return self._json(401, {"detail": "token"})
        if self.path == "/api/v1/docs/":
            tok = "zap_" + uuid.uuid4().hex[:10]
            ZAP["docs"][tok] = {"principal": corpo["base64_pdf"], "extras": []}
            return self._json(200, {"token": tok, "status": "pending",
                                    "signers": [{"token": "s1", "sign_url": f"https://app.zapsign.fake/verificar/{tok}"}]})
        if self.path.endswith("/upload-extra-doc/"):
            tok = self.path.split("/")[4]
            ZAP["docs"][tok]["extras"].append(corpo["base64_pdf"])
            return self._json(200, {"token": "extra"})
        self._json(404, {})

    def do_GET(self):
        ZAP["chamadas"].append(("GET", self.path, self.headers.get("Authorization"), None))
        partes = self.path.strip("/").split("/")
        if self.path.startswith("/api/v1/docs/"):
            tok = partes[3]
            d = ZAP["docs"].get(tok)
            if not d:
                return self._json(404, {})
            return self._json(200, {"status": "signed", "signed_file": f"http://localhost:3199/arquivo/{tok}/0",
                                    "extra_docs": [{"signed_file": f"http://localhost:3199/arquivo/{tok}/{i + 1}"} for i in range(len(d["extras"]))]})
        if partes[0] == "arquivo":
            d = ZAP["docs"][partes[1]]
            idx = int(partes[2])
            pdf = base64.b64decode(d["principal"] if idx == 0 else d["extras"][idx - 1])
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(pdf)))
            self.end_headers()
            return self.wfile.write(pdf)
        self._json(404, {})


srv = ThreadingHTTPServer(("localhost", 3199), FakeZap)
threading.Thread(target=srv.serve_forever, daemon=True).start()


# ── Utilitários ──────────────────────────────────────────────────────────────

def req(metodo, caminho, token=None, corpo=None, headers=None, bruto=False):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    r = urllib.request.Request(BASE + caminho, data=dados, method=metodo)
    r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            b = resp.read()
            return resp.status, (b if bruto else (json.loads(b) if b else None))
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def upload(processo_id, token, nome, conteudo, mime, campos=None):
    limite = "----jurysone" + uuid.uuid4().hex
    partes = []
    for k, v in (campos or {}).items():
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="{nome}"\r\nContent-Type: {mime}\r\n\r\n'.encode("utf-8") + conteudo + b"\r\n")
    partes.append(f"--{limite}--\r\n".encode())
    r = urllib.request.Request(f"{BASE}/arquivos/processos/{processo_id}", data=b"".join(partes), method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={limite}")
    r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
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
        print("  FALHA", nome, str(extra)[:400])


sfx = str(int(time.time()))


def registrar(rotulo):
    s, b = req("POST", "/auth/register", corpo={"email": f"{rotulo}{sfx}@teste.local", "password": "SenhaForte123!",
                                                "nome": f"Titular {rotulo}", "nomeEscritorio": f"Escritorio {rotulo}"})
    assert s in (200, 201), (s, b)
    return b["access_token"]


def login(email):
    s, b = req("POST", "/auth/login", corpo={"email": email, "password": "SenhaForte123!"})
    assert s in (200, 201), (s, b)
    return b["access_token"]


def atual(linha):
    return next(e for e in linha["etapas"] if e["status"] == "EM_ANDAMENTO")


def concluir(etapa, token, pular_itens=()):
    for it in etapa.get("checklist") or []:
        if it["obrigatorio"] and not it.get("feito") and it["id"] not in pular_itens:
            req("POST", f"/linhas/etapas/{etapa['id']}/checklist", token, {"itemId": it["id"], "feito": True})
    return req("POST", f"/linhas/etapas/{etapa['id']}/concluir", token, {})


PDF_MINIMO = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"

print("== Preparação")
adm = registrar("ar")
s, parc = req("POST", "/parceiros", adm, {"nome": "Dr. Parceiro Arquivos"})
us = {}
for perfil in ["ESTAGIARIO", "PARCEIRO"]:
    corpo = {"nome": f"U {perfil}", "email": f"ar{perfil.lower()}{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": perfil}
    if perfil == "PARCEIRO":
        corpo["parceiroId"] = parc["id"]
    s, us[perfil] = req("POST", "/equipe", adm, corpo)
req("POST", f"/equipe/{us['PARCEIRO']['id']}/termo", adm, {"documentoUrl": "https://drive/termo.pdf"})
tok = {p: login(f"ar{p.lower()}{sfx}@teste.local") for p in us}
req("POST", "/linhas/modelos/instalar-padrao", adm)
s, cli = req("POST", "/clientes", adm, {"nome": "José da Silva", "cpfCnpj": "33344455566", "tipo": "PF",
                                        "email": "jose@cliente.local", "telefone": "(47) 99999-0000", "cidade": "Itajaí", "estado": "SC"})
s, proc = req("POST", "/processos", adm, {"numero": "0000100-11.2026.5.12.0005", "clienteId": cli["id"], "titulo": "Reclamatória rescisão", "area": "TRABALHISTA_EMPREGADO"})
pid = proc["id"]
s, proc2 = req("POST", "/processos", adm, {"numero": "0000200-22.2026.5.12.0005", "clienteId": cli["id"], "titulo": "Outra"})

s, st = req("GET", "/arquivos/armazenamento", adm)
checa("sem Drive conectado, usa pasta local (desenvolvimento)", s == 200 and st["provedor"] == "LOCAL" and st["driveConectado"] is False, (s, st))
s, b = req("GET", "/arquivos/drive/conectar", adm)
checa("conectar Drive sem credenciais do Google explica o que falta", s == 400 and "GOOGLE_CLIENT_ID" in json.dumps(b), (s, b))
s, b = req("GET", "/arquivos/drive/callback?code=x&state=forjado.123.abc", bruto=True)
checa("retorno do Google com state forjado é recusado", s == 200 and "inválido".encode() in b, (s, b))

print("== Linha até a contratação")
s, linha = req("POST", f"/linhas/processos/{pid}", adm, {"codigo": "TRAB_EMPREGADO"})
s, linha = concluir(atual(linha), tok["ESTAGIARIO"])
s, linha = concluir(atual(linha), adm)
etapa_c = atual(linha)
checa("etapa atual é a contratação", etapa_c["nome"] == "Contratação", etapa_c["nome"])

print("== Pacote de contratação (assinatura simulada)")
questionario = [{"pergunta": "Data de admissão", "resposta": "10/03/2021"},
                {"pergunta": "Recebeu a rescisão?", "resposta": False},
                {"pergunta": "Fazia horas extras?", "resposta": "Sim, cerca de 2h por dia"}]
s, _ = req("POST", f"/contratacao/processos/{pid}/pacote", tok["ESTAGIARIO"], {"provedor": "SIMULADO"})
checa("estagiária NÃO gera pacote", s == 403, s)
s, pac = req("POST", f"/contratacao/processos/{pid}/pacote", adm, {"provedor": "SIMULADO", "questionario": questionario})
tipos = [d["tipo"] for d in pac.get("documentos", [])] if isinstance(pac, dict) else []
checa("gera 4 documentos no trabalhista (com hipossuficiência)", s in (200, 201) and sorted(tipos) == sorted(["contrato", "procuracao", "termo_entrevista", "hipossuficiencia"]), (s, pac))
checa("pacote nasce como rascunho ligado à etapa", pac.get("status") == "RASCUNHO" and pac.get("etapaId") == etapa_c["id"], pac)
s, arqs = req("GET", f"/arquivos/processos/{pid}?categoria=CONTRATACAO", adm)
checa("rascunhos salvos na pasta 01 Contratação", s == 200 and len(arqs) == 4 and all(a["nome"].startswith("RASCUNHO") for a in arqs), (s, arqs))
termo = next(a for a in arqs if a["tipo"] == "termo_entrevista")
s, pdf = req("GET", f"/arquivos/{termo['id']}/download", adm, bruto=True)
checa("termo de entrevista é um PDF válido", s == 200 and pdf[:4] == b"%PDF" and len(pdf) > 1500, (s, len(pdf) if isinstance(pdf, bytes) else pdf))

s, env = req("POST", f"/contratacao/pacotes/{pac['id']}/enviar", adm, {})
checa("envia para assinatura e devolve o link", s == 200 and env["status"] == "ENVIADO" and env["linkAssinatura"], (s, env))
s, b = req("POST", f"/contratacao/pacotes/{pac['id']}/enviar", adm, {})
checa("não reenvia pacote já enviado", s == 400, s)
s, wh = req("POST", "/contratacao/webhook/SIMULADO", corpo={"externoId": env["externoId"], "evento": "ASSINADO"})
checa("webhook de assinatura processa", s == 200 and wh.get("status") == "ASSINADO" and wh.get("itensMarcados") == 4, (s, wh))
s, wh2 = req("POST", "/contratacao/webhook/SIMULADO", corpo={"externoId": env["externoId"], "evento": "ASSINADO"})
checa("webhook repetido não duplica", wh2.get("jaProcessado") is True, wh2)
s, arqs = req("GET", f"/arquivos/processos/{pid}?categoria=CONTRATACAO", adm)
assinados = [a for a in arqs if a["origem"] == "ASSINADO"]
checa("4 PDFs assinados guardados na pasta", len(assinados) == 4, [a["nome"] for a in arqs])
s, pdf = req("GET", f"/arquivos/{assinados[0]['id']}/download", adm, bruto=True)
checa("PDF assinado baixa pelo sistema", s == 200 and pdf[:4] == b"%PDF", s)
s, ls = req("GET", f"/linhas/processos/{pid}", adm)
etapa_c = next(e for e in ls[0]["etapas"] if e["id"] == etapa_c["id"])
marcados = [i["texto"] for i in etapa_c["checklist"] if i.get("feito")]
checa("checklist da contratação marcado sozinho", all(any(k in m for m in marcados) for k in ["Contrato", "Procuração", "Termo", "hipossuficiência"]), marcados)
s, linha = concluir(etapa_c, adm)
checa("conclui a contratação após a assinatura", s == 200 and atual(linha)["nome"] == "Documentos do trabalhador", (s, linha if s != 200 else ""))
s, n = req("GET", "/notifications", adm)
lst = n.get("data", n) if isinstance(n, dict) else n
checa("advogado é avisado da assinatura", any(x.get("tipo") == "assinatura" for x in lst), n)

print("== Upload na etapa de documentos")
etapa_d = atual(linha)
item_ctps = next(i for i in etapa_d["checklist"] if i["texto"] == "CTPS")
s, d = upload(pid, tok["ESTAGIARIO"], "CTPS do José.pdf", PDF_MINIMO, "application/pdf",
              {"categoria": "DOCUMENTOS_CLIENTE", "etapaId": etapa_d["id"], "itemChecklistId": item_ctps["id"]})
checa("estagiária envia a CTPS ligada ao item do checklist", s in (200, 201) and d["categoria"] == "DOCUMENTOS_CLIENTE" and d["nome"] == "CTPS do José.pdf", (s, d))
s, ls = req("GET", f"/linhas/processos/{pid}", adm)
item = next(i for e in ls[0]["etapas"] if e["id"] == etapa_d["id"] for i in e["checklist"] if i["id"] == item_ctps["id"])
checa("item CTPS marcado com o documento", item.get("feito") and item.get("documentoId") == d["id"], item)
s, b = upload(pid, tok["ESTAGIARIO"], "virus.exe", b"MZ....", "application/x-msdownload", {"categoria": "OUTROS"})
checa("tipo de arquivo não permitido é recusado", s == 400, (s, b))
s, b = upload(pid, tok["ESTAGIARIO"], "extrato.pdf", PDF_MINIMO, "application/pdf", {"categoria": "FINANCEIRO"})
checa("estagiária NÃO envia arquivo financeiro", s == 403, s)
s, fin = upload(pid, adm, "comprovante honorarios.pdf", PDF_MINIMO, "application/pdf", {"categoria": "FINANCEIRO"})
checa("admin envia arquivo financeiro", s in (200, 201), s)
s, lst = req("GET", f"/arquivos/processos/{pid}", tok["ESTAGIARIO"])
checa("estagiária NÃO vê arquivos financeiros", s == 200 and all(a["categoria"] != "FINANCEIRO" for a in lst), [a["categoria"] for a in lst] if s == 200 else s)
s, _ = req("GET", f"/arquivos/{fin['id']}/download", tok["ESTAGIARIO"], bruto=True)
checa("estagiária NÃO baixa arquivo financeiro", s == 404, s)

print("== Parceiro")
s, _ = upload(pid, tok["PARCEIRO"], "peca.pdf", PDF_MINIMO, "application/pdf", {"categoria": "PECAS"})
checa("parceiro sem participação NÃO envia", s == 404, s)
req("POST", f"/cota-parte/processos/{pid}/participacoes", adm, {"parceiroId": parc["id"], "papel": "PARTICIPACAO"})
s, d = upload(pid, tok["PARCEIRO"], "Contestação rascunho.pdf", PDF_MINIMO, "application/pdf", {"categoria": "PECAS"})
checa("parceiro do caso envia peça para a pasta do escritório", s in (200, 201) and d["enviadoPorId"] == us["PARCEIRO"]["id"], (s, d))
s, lst = req("GET", f"/arquivos/processos/{pid}", tok["PARCEIRO"])
checa("parceiro lista arquivos do caso (sem financeiro)", s == 200 and len(lst) > 0 and all(a["categoria"] != "FINANCEIRO" for a in lst), s)
s, pdf = req("GET", f"/arquivos/{d['id']}/download", tok["PARCEIRO"], bruto=True)
checa("parceiro baixa pelo JurysOne", s == 200 and pdf[:4] == b"%PDF", s)
s, _ = req("GET", f"/arquivos/processos/{proc2['id']}", tok["PARCEIRO"])
checa("parceiro NÃO vê arquivos de outro processo", s == 404, s)
s, _ = req("POST", f"/contratacao/processos/{pid}/pacote", tok["PARCEIRO"], {})
checa("parceiro NÃO gera pacote de contratação", s == 403, s)

print("== ZapSign (servidor falso)")
s, pacz = req("POST", f"/contratacao/processos/{proc2['id']}/pacote", adm, {"documentos": ["contrato", "procuracao"]})
checa("com token da ZapSign, o pacote usa a ZapSign", s in (200, 201) and pacz["provedor"] == "ZAPSIGN", (s, pacz))
s, envz = req("POST", f"/contratacao/pacotes/{pacz['id']}/enviar", adm, {})
checa("envio cria documento e anexo extra na ZapSign", s == 200 and envz["linkAssinatura"].startswith("https://app.zapsign.fake/"), (s, envz))
criacao = next(c for c in ZAP["chamadas"] if c[1] == "/api/v1/docs/")
signer = criacao[3]["signers"][0]
checa("signatário com telefone e e-mail, sem disparo automático", signer["phone_number"] == "47999990000" and signer["email"] == "jose@cliente.local" and signer["send_automatic_whatsapp"] is False, signer)
checa("external_id é o pacote do JurysOne", criacao[3]["external_id"] == pacz["id"], criacao[3].get("external_id"))
checa("procuração enviada como documento extra", any(c[1].endswith("/upload-extra-doc/") for c in ZAP["chamadas"]))
s, _ = req("POST", "/contratacao/webhook/ZAPSIGN", corpo={"event_type": "doc_signed", "token": envz["externoId"]})
checa("webhook da ZapSign sem token é recusado", s == 403, s)
s, _ = req("POST", "/contratacao/webhook/ZAPSIGN", corpo={"event_type": "doc_signed", "token": envz["externoId"]}, headers={"x-jurysone-token": "errado_xx"})
checa("webhook da ZapSign com token errado é recusado", s == 403, s)
s, whz = req("POST", "/contratacao/webhook/ZAPSIGN", corpo={"event_type": "doc_signed", "token": envz["externoId"]}, headers={"x-jurysone-token": "wh_teste"})
checa("webhook da ZapSign com token certo baixa os assinados", s == 200 and whz.get("status") == "ASSINADO", (s, whz))
s, arqs = req("GET", f"/arquivos/processos/{proc2['id']}?categoria=CONTRATACAO", adm)
checa("2 PDFs assinados da ZapSign na pasta", len([a for a in arqs if a["origem"] == "ASSINADO"]) == 2, [a["nome"] for a in arqs])

print("== Isolamento entre escritórios")
outro = registrar("as")
s, _ = req("GET", f"/arquivos/{assinados[0]['id']}/download", outro, bruto=True)
checa("outro escritório NÃO baixa o arquivo", s == 404, s)
s, _ = req("GET", f"/arquivos/processos/{pid}", outro)
checa("outro escritório NÃO lista arquivos", s == 404, s)
s, _ = req("POST", f"/contratacao/pacotes/{pac['id']}/enviar", outro, {})
checa("outro escritório NÃO mexe no pacote", s == 404, s)
s, b = req("POST", "/contratacao/webhook/SIMULADO", corpo={"externoId": "sim_inexistente"})
checa("webhook de pacote inexistente é ignorado", s == 200 and b.get("ignorado"), b)

srv.shutdown()
print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
if falhas:
    print("Falhas:", *falhas, sep="\n - ")
    sys.exit(1)
