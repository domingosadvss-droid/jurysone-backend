"""Teste de ponta a ponta da etapa A (base da IA: chaves cifradas, uso, custo e limite mensal) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção), SEM ANTHROPIC_API_KEY no ambiente
(a chave do escritório é salva pela própria rota), com:
    BCB_API_URL=http://localhost:3195  ANTHROPIC_BASE_URL=http://localhost:3196  NODE_ENV=development
    python -X utf8 tests/e2e/teste_etapaA.py
Variáveis para conferir o banco direto: DATABASE_URL (o mesmo do app) e BACKEND_DIR (pasta do jurysone-backend).
Sobe servidores falsos do Banco Central (3195) e da Anthropic (3196): nada sai para serviços reais e nada é cobrado.
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import json, os, subprocess, sys, threading, time, urllib.request, urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "http://localhost:3099/api"
falhas, oks = [], 0
sfx = str(int(time.time()))
COTACAO = 5.0
CHAVE_BOA = "sk-ant-teste-local-abcd1234"
CHAVE_RUIM = "sk-ant-invalida-0000"
FAKE = {"falhar": False, "pedidos": []}

# ── Servidores falsos ────────────────────────────────────────────────────────


class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def chave(self):
        # o SDK 1.x manda a chave como "Authorization: Bearer"; versões antigas usavam x-api-key
        auth = self.headers.get("authorization") or ""
        return auth[7:] if auth.lower().startswith("bearer ") else self.headers.get("x-api-key")

    def _json(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path.startswith("/dados/serie/bcdata.sgs.1/dados/ultimos/1"):
            return self._json(200, [{"data": "19/11/2026", "valor": f"{COTACAO:.4f}"}])
        if self.path.startswith("/v1/models"):
            if self.chave() == CHAVE_RUIM:
                return self._json(401, {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}})
            return self._json(200, {"data": [{"id": "claude-opus-5-5", "type": "model", "display_name": "Claude Opus 5.5", "created_at": "2026-01-01T00:00:00Z"}],
                                    "has_more": False, "first_id": "claude-opus-5-5", "last_id": "claude-opus-5-5"})
        return self._json(404, {})

    def do_POST(self):
        corpo = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        if not self.path.startswith("/v1/messages"):
            return self._json(404, {})
        FAKE["pedidos"].append({"modelo": corpo.get("model"), "chave": self.chave()})
        if FAKE["falhar"]:
            return self._json(400, {"type": "error", "error": {"type": "invalid_request_error", "message": "falha simulada"}})
        return self._json(200, {"id": "msg_t", "type": "message", "role": "assistant", "model": corpo.get("model"),
                                "content": [{"type": "text", "text": "OK"}], "stop_reason": "end_turn", "stop_sequence": None,
                                "usage": {"input_tokens": 1000, "output_tokens": 500, "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}})


for porta in (3195, 3196):
    srv = ThreadingHTTPServer(("localhost", porta), Fake)
    threading.Thread(target=srv.serve_forever, daemon=True).start()

# custo esperado de uma chamada falsa (1000 de entrada + 500 de saída)
CUSTO = {"claude-sonnet-5-5": (1000 * 2 + 500 * 10) / 1e6, "claude-opus-5-5": (1000 * 4 + 500 * 20) / 1e6}
BRL = {m: round(v * COTACAO, 4) for m, v in CUSTO.items()}

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


def texto_bruto(caminho, token):
    r = urllib.request.Request(BASE + caminho, method="GET")
    r.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.read().decode()


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


def banco(js):
    """Roda um trecho com o Prisma no banco de TESTE e devolve o JSON impresso"""
    cod = "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{" + js + "})().then(r=>{console.log(JSON.stringify(r));return p.$disconnect()}).catch(e=>{console.error(e);process.exit(1)})"
    out = subprocess.run(["node", "-e", cod], cwd=os.environ["BACKEND_DIR"], capture_output=True, text=True, env=os.environ, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[-800:])
    return json.loads(out.stdout.strip().splitlines()[-1])


def perto(a, b, tol=0.0002):
    return abs(float(a) - float(b)) <= tol


# ── Preparação ───────────────────────────────────────────────────────────────
print("== Preparação")
assert os.environ.get("DATABASE_URL", "").find("teste") >= 0, "DATABASE_URL precisa apontar para o banco de TESTE"
s, b = req("POST", "/auth/register", corpo={"email": f"iaa{sfx}@teste.local", "password": "SenhaForte123!", "nome": "Jonathan IA", "nomeEscritorio": "Escritorio IA"})
assert s in (200, 201), (s, b)
adm = b["access_token"]
s, eq = req("GET", "/equipe", adm)
adm_id = next(u["id"] for u in lista(eq) if u["email"] == f"iaa{sfx}@teste.local")
esc_id = banco(f"return (await p.usuario.findUnique({{where:{{id:'{adm_id}'}}}})).escritorioId")
s, est = req("POST", "/equipe", adm, {"nome": "Estagiária IA", "email": f"iaest{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": "ESTAGIARIO"})
assert s in (200, 201), (s, est)
s, b = req("POST", "/auth/login", corpo={"email": f"iaest{sfx}@teste.local", "password": "SenhaForte123!"})
tok_est = b["access_token"]
s, cli = req("POST", "/clientes", adm, {"nome": "Cliente IA", "cpfCnpj": "777" + sfx[-6:] + "02", "tipo": "PF", "cidade": "Itajaí", "estado": "SC"})
s, proc = req("POST", "/processos", adm, {"numero": f"5001{sfx[-3:]}-22.2026.8.24.0033", "clienteId": cli["id"], "titulo": "Caso IA", "tribunal": "TJSC"})
assert s in (200, 201), (s, proc)

# ── 1. Chaves cifradas ──────────────────────────────────────────────────────
print("== Chaves de API")
s, b = req("GET", "/chaves", adm)
sit = {c["id"]: c for c in (b or {}).get("chaves", [])}
checa("tela recebe a situação das chaves, com o Claude na lista", s == 200 and "anthropic" in sit and sit["anthropic"]["configurada"] is False, b)
checa("estagiária não salva chave", req("POST", "/chaves", tok_est, {"id": "anthropic", "chave": CHAVE_BOA})[0] == 403)
s, b = req("POST", "/chaves", adm, {"id": "anthropic", "chave": CHAVE_BOA})
checa("titular salva a chave do Claude", s in (200, 201) and b["situacao"]["configurada"] and b["situacao"]["origem"] == "ESCRITORIO" and b["situacao"]["final"] == "1234", b)
bruto = texto_bruto("/chaves", adm)
checa("nenhuma rota devolve o valor da chave", CHAVE_BOA not in bruto and "teste-local" not in bruto, bruto[:300])
checa("estagiária vê a situação mas não o valor", CHAVE_BOA not in texto_bruto("/chaves", tok_est))
gravado = banco(f"return (await p.configuracao.findFirst({{where:{{escritorioId:'{esc_id}',chave:'api_keys'}}}})).valor")
checa("chave gravada cifrada no banco (AES-GCM, prefixo v1:)", str(gravado.get("anthropic", "")).startswith("v1:") and CHAVE_BOA not in json.dumps(gravado), gravado)
# chave antiga em texto aberto é recifrada na primeira leitura
banco(f"const r=await p.configuracao.findFirst({{where:{{escritorioId:'{esc_id}',chave:'api_keys'}}}});const v=r.valor;v.resend='re_antiga_texto_aberto_9999';return (await p.configuracao.update({{where:{{id:r.id}},data:{{valor:v}}}})).id")
s, b = req("GET", "/chaves", adm)
sit = {c["id"]: c for c in b["chaves"]}
gravado = banco(f"return (await p.configuracao.findFirst({{where:{{escritorioId:'{esc_id}',chave:'api_keys'}}}})).valor")
checa("chave antiga em texto aberto continua valendo e é recifrada", sit["resend"]["configurada"] and sit["resend"]["final"] == "9999" and str(gravado.get("resend", "")).startswith("v1:"), gravado)
s, b = req("POST", "/chaves/anthropic/verificar", adm)
checa("verificação real da chave do Claude (lista de modelos)", s in (200, 201) and b["ok"] is True, b)
req("POST", "/chaves", adm, {"id": "anthropic", "chave": CHAVE_RUIM})
s, b = req("POST", "/chaves/anthropic/verificar", adm)
checa("chave recusada pela Anthropic aparece como inválida", b.get("ok") is False and "recusou" in b.get("mensagem", ""), b)
req("POST", "/chaves", adm, {"id": "anthropic", "chave": CHAVE_BOA})
s, b = req("POST", "/chaves/asaas/verificar", adm)
checa("integração sem chave não finge que verificou", b.get("ok") is False, b)
s, b = req("DELETE", "/chaves/resend", adm)
checa("titular apaga uma chave", s == 200 and b["situacao"]["configurada"] is False, b)
checa("estagiária não apaga chave", req("DELETE", "/chaves/anthropic", tok_est)[0] == 403)

# ── 2. Uso e custo ───────────────────────────────────────────────────────────
print("== Uso e custo")
s, st = req("GET", "/ia/situacao", adm)
checa("sem limite definido: IA funciona e a tela mostra o lembrete", s == 200 and st["semLimite"] and st["lembrete"] and st["chaveConfigurada"] and not st["pesadasPausadas"], st)
checa("estagiária não vê o gasto da IA", req("GET", "/ia/situacao", tok_est)[0] == 403)
n0 = len(FAKE["pedidos"])
s, b = req("POST", "/ia/teste", adm, {"categoria": "CONVERSA"})
checa("conversa usa o Sonnet com a chave do escritório", s in (200, 201) and FAKE["pedidos"][-1] == {"modelo": "claude-sonnet-5-5", "chave": CHAVE_BOA}, (s, b, FAKE["pedidos"][n0:]))
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA", "processoId": proc["id"]})
checa("tarefa pesada usa o Opus", s in (200, 201) and FAKE["pedidos"][-1]["modelo"] == "claude-opus-5-5", (s, b))
s, rel = req("GET", "/ia/relatorio", adm)
total = BRL["claude-sonnet-5-5"] + BRL["claude-opus-5-5"]
mods = {m["modelo"]: m for m in rel.get("porModelo", [])}
checa("custo calculado pela tabela de preços e pela cotação do BCB",
      perto(rel["totalUsd"], CUSTO["claude-sonnet-5-5"] + CUSTO["claude-opus-5-5"]) and perto(rel["totalBrl"], total, 0.011)
      and perto(mods["claude-sonnet-5-5"]["custoBrl"], BRL["claude-sonnet-5-5"], 0.011) and mods["claude-opus-5-5"]["tokensSaida"] == 500, rel)
linha = banco(f"return await p.iaUso.findFirst({{where:{{escritorioId:'{esc_id}',modelo:'claude-opus-5-5'}}}})")
checa("cada chamada grava tokens, US$, cotação e R$", linha["tokensEntrada"] == 1000 and perto(linha["custoUsd"], CUSTO["claude-opus-5-5"], 1e-6) and perto(linha["cotacaoUsd"], COTACAO) and perto(linha["custoBrl"], BRL["claude-opus-5-5"]), linha)
checa("relatório mostra o processo que gastou", any(p["processoId"] == proc["id"] and perto(p["custoBrl"], BRL["claude-opus-5-5"], 0.011) for p in rel["porProcesso"]), rel["porProcesso"])
s, cp = req("GET", f"/ia/processos/{proc['id']}/custo", adm)
checa("custo de IA do processo", cp["chamadas"] == 1 and perto(cp["custoBrl"], BRL["claude-opus-5-5"], 0.011), cp)

FAKE["falhar"] = True
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})
FAKE["falhar"] = False
s, rel = req("GET", "/ia/relatorio", adm)
checa("falha da IA fica registrada sem custo", s == 200 and rel["porStatus"].get("ERRO") == 1 and rel["chamadas"] == 3, rel["porStatus"])

# ── 3. Limite mensal ─────────────────────────────────────────────────────────
print("== Limite mensal")
checa("limite negativo recusado", req("PUT", "/ia/config", adm, {"limiteMensalBrl": -5})[0] == 400)
checa("aviso acima de 99% recusado", req("PUT", "/ia/config", adm, {"avisoPercentual": 150})[0] == 400)
checa("estagiária não define limite", req("PUT", "/ia/config", tok_est, {"limiteMensalBrl": 10})[0] == 403)
gasto = total  # 0,105
s, st = req("PUT", "/ia/config", adm, {"limiteMensalBrl": 0.2, "avisoPercentual": 50})
checa("titular define limite e ponto de aviso", s == 200 and st["limiteMensalBrl"] == 0.2 and st["avisoPercentual"] == 50 and not st["semLimite"] and st["lembrete"] is None, st)
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})  # 0,175 = 87,5%
s, nt = req("GET", "/notifications?per_page=100", adm)
avisos = [n for n in lista(nt) if n.get("tipo") == "IA_LIMITE"]
checa("passou do ponto de aviso: sino avisa o titular uma vez", len(avisos) == 1 and "50%" in avisos[0]["titulo"], [n.get("titulo") for n in avisos])
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})  # 0,245 → atinge o limite
checa("chamada que cruza o limite ainda termina", s in (200, 201), (s, b))
s, st = req("GET", "/ia/situacao", adm)
checa("limite atingido: tarefas pesadas pausadas", st["limiteAtingido"] and st["pesadasPausadas"], st)
s, nt = req("GET", "/notifications?per_page=100", adm)
avisos = [n for n in lista(nt) if n.get("tipo") == "IA_LIMITE"]
checa("sino avisa que o limite foi atingido e que o WhatsApp continua", len(avisos) == 2 and any("atingido" in n["titulo"] and "WhatsApp continua" in n["mensagem"] for n in avisos), [n.get("titulo") for n in avisos])
s, nt = req("GET", "/notifications?per_page=100", tok_est)
checa("estagiária não recebe aviso de gasto", not any(n.get("tipo") == "IA_LIMITE" for n in lista(nt)))
n0 = len(FAKE["pedidos"])
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})
checa("tarefa pesada bloqueada sem chamar a IA", s == 400 and "limite" in str(b).lower() and len(FAKE["pedidos"]) == n0, (s, b))
s, b = req("POST", "/ia/teste", adm, {"categoria": "CONVERSA"})
checa("conversa com o cliente continua acima do limite", s in (200, 201) and len(FAKE["pedidos"]) == n0 + 1, (s, b))
s, rel = req("GET", "/ia/relatorio", adm)
checa("bloqueio fica registrado no relatório", rel["porStatus"].get("BLOQUEADO") == 1, rel["porStatus"])
s, nt = req("GET", "/notifications?per_page=100", adm)
checa("avisos não se repetem no mesmo mês", len([n for n in lista(nt) if n.get("tipo") == "IA_LIMITE"]) == 2)
s, st = req("POST", "/ia/liberar", adm)
checa("titular libera até o fim do mês", st["liberadoAteFimDoMes"] and not st["pesadasPausadas"], st)
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})
checa("tarefa pesada volta a funcionar depois de liberada", s in (200, 201), (s, b))
s, st = req("POST", "/ia/liberar/cancelar", adm)
s, b = req("POST", "/ia/teste", adm, {"categoria": "PESADA"})
checa("cancelar a liberação pausa de novo", s == 400 and st["pesadasPausadas"], (s, st))
s, st = req("PUT", "/ia/config", adm, {"limiteMensalBrl": "", "avisoPercentual": ""})
checa("apagar o limite volta para sem limite", st["semLimite"] and not st["pesadasPausadas"] and st["lembrete"], st)

# ── 4. Tela ──────────────────────────────────────────────────────────────────
print("== Tela")
html = urllib.request.urlopen(BASE.replace("/api", "") + "/dashboard.html", timeout=30).read().decode()
checa("painel tem a aba IA e o card do Claude", 'id="cfg-ia"' in html and "ia-uso-container" in html and "id:'anthropic'" in html)
checa("painel não guarda mais chave no navegador", "localStorage.setItem('jurysone_apis'" not in html and "Simulate API test" not in html)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
for f_ in falhas:
    print("  -", f_)
sys.exit(1 if falhas else 0)
