"""Teste de ponta a ponta da etapa B (catálogo de serviços e fila de sugestões) do JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção):
    DATABASE_URL=<banco de teste>  BACKEND_DIR=<pasta do jurysone-backend>  python -X utf8 tests/e2e/teste_etapaB.py
A sugestão "da IA" é feita chamando o próprio serviço do catálogo (o mesmo método que a IA do WhatsApp vai usar na etapa C).
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import json, os, subprocess, sys, time, urllib.request, urllib.error

BASE = "http://localhost:3099/api"
falhas, oks = [], 0
sfx = str(int(time.time()))


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


def checa(nome, cond, extra=""):
    global oks
    if cond:
        oks += 1
        print("  OK  ", nome)
    else:
        falhas.append(nome)
        print("  FALHA", nome, str(extra)[:700])


def lista(b):
    if isinstance(b, list):
        return b
    if isinstance(b, dict):
        for k in ("data", "items", "notificacoes", "notifications"):
            if isinstance(b.get(k), list):
                return b[k]
    return []


def node(js):
    cod = ("const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();"
           "const {CatalogoService}=require('./dist/modules/catalogo/catalogo.service.js');const svc=new CatalogoService(p);(async()=>{" + js +
           "})().then(r=>{console.log(JSON.stringify(r));return p.$disconnect()}).catch(e=>{console.log(JSON.stringify({erro:String(e.message||e)}));return p.$disconnect()})")
    out = subprocess.run(["node", "-e", cod], cwd=os.environ["BACKEND_DIR"], capture_output=True, text=True, env=os.environ, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr[-800:])
    return json.loads(out.stdout.strip().splitlines()[-1])


# ── Preparação ───────────────────────────────────────────────────────────────
print("== Preparação")
assert "teste" in os.environ.get("DATABASE_URL", ""), "DATABASE_URL precisa apontar para o banco de TESTE"
s, b = req("POST", "/auth/register", corpo={"email": f"cat{sfx}@teste.local", "password": "SenhaForte123!", "nome": "Jonathan Catalogo", "nomeEscritorio": "Escritorio Catalogo"})
assert s in (200, 201), (s, b)
adm = b["access_token"]
s, eq = req("GET", "/equipe", adm)
adm_id = next(u["id"] for u in lista(eq) if u["email"] == f"cat{sfx}@teste.local")
esc_id = node(f"return (await p.usuario.findUnique({{where:{{id:'{adm_id}'}}}})).escritorioId")
tok = {}
for perfil in ("SOCIO", "ESTAGIARIO"):
    s, u = req("POST", "/equipe", adm, {"nome": f"U {perfil}", "email": f"cat{perfil.lower()}{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": perfil})
    assert s in (200, 201), (perfil, s, u)
    s, b = req("POST", "/auth/login", corpo={"email": f"cat{perfil.lower()}{sfx}@teste.local", "password": "SenhaForte123!"})
    tok[perfil] = b["access_token"]
    if perfil == "SOCIO":
        socio_id = u["id"]

# ── 1. Carga inicial ─────────────────────────────────────────────────────────
print("== Carga inicial")
s, b = req("GET", "/catalogo", adm)
checa("catálogo começa vazio", s == 200 and b["servicos"] == [] and b["sugestoesPendentes"] == 0, b)
checa("estagiária vê o catálogo", req("GET", "/catalogo", tok["ESTAGIARIO"])[0] == 200)
checa("estagiária não cria a carga inicial", req("POST", "/catalogo/carga-inicial", tok["ESTAGIARIO"])[0] == 403)
s, b = req("POST", "/catalogo/carga-inicial", adm)
checa("carga inicial cria os 8 serviços", s == 200 and b["novos"] == 8, b)
s, b = req("POST", "/catalogo/carga-inicial", adm)
checa("repetir a carga não duplica", b["novos"] == 0 and b["existentes"] == 8, b)
s, cat = req("GET", "/catalogo", adm)
serv = {x["codigo"]: x for x in cat["servicos"]}
esperados = {"IMOB_REVISAO_CONTRATUAL", "IMOB_LOCACAO_PROPRIETARIO", "IMOB_COMPRA_VENDA", "IMOB_REGULARIZACAO_USUCAPIAO",
             "EMP_SOCIETARIO", "EMP_RECUPERACAO_CREDITO", "EMP_CONSULTORIA_MENSAL", "TRAB_EMPREGADO"}
checa("os 8 da linha de produção, sem Genérico e sem Dativa", set(serv) == esperados, sorted(serv))
checa("todos sem preço", all(x["semPreco"] and x["precoSugerido"] is None for x in cat["servicos"]))
checa("cada serviço com documentos, perguntas e respostas frequentes", all(len(x["documentos"]) >= 2 and len(x["perguntas"]) >= 4 and len(x["faq"]) >= 3 for x in cat["servicos"]),
      [(x["codigo"], len(x["documentos"]), len(x["perguntas"]), len(x["faq"])) for x in cat["servicos"]])
checa("trabalhista do empregado: só êxito de 30%", serv["TRAB_EMPREGADO"]["tipoHonorario"] == "EXITO" and serv["TRAB_EMPREGADO"]["percentualExito"] == 30, serv["TRAB_EMPREGADO"])
checa("ligado ao modelo da linha de produção", all(x["modeloLinhaCodigo"] == x["codigo"] for x in cat["servicos"]))

# ── 2. Edição, versões e preço ───────────────────────────────────────────────
print("== Edição e versões")
rev = serv["IMOB_REVISAO_CONTRATUAL"]
checa("estagiária não edita", req("PATCH", f"/catalogo/{rev['id']}", tok["ESTAGIARIO"], {"precoSugerido": 1})[0] == 403)
s, b = req("PATCH", f"/catalogo/{rev['id']}", adm, {"precoSugerido": "3.500,00", "responsavelId": socio_id})
checa("titular define preço e responsável: nova versão", s == 200 and b["precoSugerido"] == 3500 and b["versao"] == 2 and b["responsavelId"] == socio_id, b)
s, det = req("GET", f"/catalogo/{rev['id']}", adm)
checa("versão anterior guardada no histórico (sem preço)", len(det["versoes"]) == 1 and det["versoes"][0]["versao"] == 1 and det["versoes"][0]["dados"]["precoSugerido"] is None, det.get("versoes"))
checa("área inválida recusada", req("PATCH", f"/catalogo/{rev['id']}", adm, {"area": "ASTROLOGIA"})[0] == 400)
checa("preço negativo recusado", req("PATCH", f"/catalogo/{rev['id']}", adm, {"precoSugerido": -1})[0] == 400)
checa("êxito acima de 100% recusado", req("PATCH", f"/catalogo/{rev['id']}", adm, {"percentualExito": 150})[0] == 400)
checa("responsável de fora da equipe recusado", req("PATCH", f"/catalogo/{rev['id']}", adm, {"responsavelId": "00000000-0000-0000-0000-000000000000"})[0] == 400)
s, n1 = req("POST", "/catalogo", adm, {"nome": "Inventário extrajudicial", "area": "FAMILIA", "documentos": ["Certidão de óbito", "(opcional) Testamento"], "perguntas": ["Quem faleceu e quando?"]})
s, n2 = req("POST", "/catalogo", adm, {"nome": "Inventário extrajudicial", "area": "FAMILIA"})
checa("novo serviço manual, com código próprio e sem repetir", n1.get("codigo") == "INVENTARIO_EXTRAJUDICIAL" and n2.get("codigo") == "INVENTARIO_EXTRAJUDICIAL_2", (n1, n2))
checa("documento marcado '(opcional)' vira não obrigatório", n1["documentos"] == [{"texto": "Certidão de óbito", "obrigatorio": True}, {"texto": "Testamento", "obrigatorio": False}], n1["documentos"])

# ── 3. O que a IA vê ─────────────────────────────────────────────────────────
print("== Visão da IA")
ia = node(f"return await svc.paraAtendimento('{esc_id}')")
texto = json.dumps(ia)
checa("IA recebe os serviços ativos", isinstance(ia, list) and len(ia) == 10, len(ia) if isinstance(ia, list) else ia)
checa("IA NUNCA recebe o preço", "precoSugerido" not in texto and "3500" not in texto and "percentualExito" not in texto, texto[:300])
s, b = req("POST", f"/catalogo/{n2['id']}/desativar", adm)
ia = node(f"return await svc.paraAtendimento('{esc_id}')")
checa("serviço desativado sai da IA e da lista", len(ia) == 9 and n2["id"] not in [x["id"] for x in req("GET", "/catalogo", adm)[1]["servicos"]], len(ia))
s, ina = req("GET", "/catalogo?status=INATIVO", adm)
checa("aba de inativos mostra o desativado", [x["id"] for x in ina["servicos"]] == [n2["id"]])
req("POST", f"/catalogo/{n2['id']}/reativar", adm)

# ── 4. Sugestões ─────────────────────────────────────────────────────────────
print("== Sugestões")
s, sug_u = req("POST", "/catalogo/sugestoes", tok["ESTAGIARIO"], {"tipo": "NOVO_SERVICO", "dados": {"nome": "Divórcio consensual", "area": "FAMILIA", "perguntas": ["Há filhos menores?"]}, "justificativa": "Três clientes pediram este mês."})
checa("estagiária pode sugerir um serviço novo", s == 201 and sug_u["status"] == "PENDENTE" and sug_u["origem"] == "USUARIO", (s, sug_u))
ia_sug = node(f"""return await svc.sugerir('{esc_id}', {{tipo:'AJUSTE', servicoId:'{serv['TRAB_EMPREGADO']['id']}', origem:'IA', conversaId:'conv-1',
  dados:{{faq:[{{pergunta:'Preciso ir ao fórum?', resposta:'Na maioria dos casos só na audiência; o advogado avisa a data e o que levar.'}}]}},
  justificativa:'Pergunta feita em 4 conversas desta semana.'}})""")
checa("IA registra sugestão de ajuste (fica pendente)", ia_sug.get("status") == "PENDENTE" and ia_sug.get("origem") == "IA", ia_sug)
ia_novo = node(f"""return await svc.sugerir('{esc_id}', {{tipo:'NOVO_SERVICO', origem:'IA', conversaId:'conv-2',
  dados:{{nome:'Revisão de aposentadoria', area:'PREVIDENCIARIO', documentos:['Carta de concessão'], perguntas:['Quando se aposentou?']}},
  justificativa:'Cliente pediu e o assunto não está no catálogo.'}})""")
ia_vazio = node(f"return await svc.sugerir('{esc_id}', {{tipo:'AJUSTE', servicoId:'{serv['TRAB_EMPREGADO']['id']}', origem:'IA', dados:{{}}}})")
checa("sugestão que não muda nada é recusada", "nada" in ia_vazio.get("erro", "").lower(), ia_vazio)
s, nt = req("GET", "/notifications?per_page=100", adm)
checa("gestores avisados no sino", len([n for n in lista(nt) if n.get("tipo") == "CATALOGO_SUGESTAO"]) == 3, [n.get("titulo") for n in lista(nt)])
s, nt = req("GET", "/notifications?per_page=100", tok["ESTAGIARIO"])
checa("estagiária não recebe aviso de sugestão", not any(n.get("tipo") == "CATALOGO_SUGESTAO" for n in lista(nt)))
checa("estagiária não vê a fila", req("GET", "/catalogo/sugestoes", tok["ESTAGIARIO"])[0] == 403)
s, fila = req("GET", "/catalogo/sugestoes", tok["SOCIO"])
aj = next((x for x in fila if x["id"] == ia_sug["id"]), {})
checa("fila mostra o antes e o depois do ajuste", len(fila) == 3 and aj.get("servicoNome") and len(aj["antes"]["faq"]) == len(serv["TRAB_EMPREGADO"]["faq"]), aj)
s, cat = req("GET", "/catalogo", adm)
checa("contador de pendentes", cat["sugestoesPendentes"] == 3, cat["sugestoesPendentes"])

s, b = req("POST", f"/catalogo/sugestoes/{ia_sug['id']}/aprovar", tok["SOCIO"])
s2, det = req("GET", f"/catalogo/{serv['TRAB_EMPREGADO']['id']}", adm)
checa("ajuste aprovado vale no serviço, com versão nova", s == 200 and det["versao"] == 2 and det["faq"][0]["pergunta"] == "Preciso ir ao fórum?" and det["versoes"][0]["motivo"].startswith("Sugestão da IA aprovada"), det.get("versoes"))
checa("sugestão decidida não pode ser aprovada de novo", req("POST", f"/catalogo/sugestoes/{ia_sug['id']}/aprovar", adm)[0] == 400)
s, b = req("POST", f"/catalogo/sugestoes/{ia_novo['id']}/aprovar", adm, {"dados": {"nome": "Revisão da vida toda e de aposentadoria", "precoSugerido": 2000}})
checa("editar e aprovar: o serviço novo nasce com a edição e marcado como vindo da IA", s == 200 and b["servico"]["nome"] == "Revisão da vida toda e de aposentadoria"
      and b["servico"]["origem"] == "IA" and b["servico"]["precoSugerido"] == 2000, b)
s, b = req("POST", f"/catalogo/sugestoes/{sug_u['id']}/recusar", adm, {"motivo": "Não atendemos família por enquanto."})
checa("recusar com motivo", s == 200 and b["status"] == "RECUSADA" and "família" in b["motivoDecisao"], b)
s, fila = req("GET", "/catalogo/sugestoes", adm)
s, todas = req("GET", "/catalogo/sugestoes?status=TODAS", adm)
checa("fila vazia e histórico das decisões", fila == [] and sorted(x["status"] for x in todas) == ["APROVADA", "APROVADA", "RECUSADA"], [x["status"] for x in todas])
ia = node(f"return await svc.paraAtendimento('{esc_id}')")
checa("serviço aprovado entra na IA, ainda sem preço", any(x["nome"].startswith("Revisão da vida toda") for x in ia) and "2000" not in json.dumps(ia))

# ── 5. Tela ──────────────────────────────────────────────────────────────────
print("== Tela")
html = urllib.request.urlopen(BASE.replace("/api", "") + "/dashboard.html", timeout=30).read().decode()
checa("painel tem a página e o menu do catálogo", 'id="page-catalogo"' in html and "navigate('catalogo')" in html and "function carregarCatalogo" in html)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
for f_ in falhas:
    print("  -", f_)
sys.exit(1 if falhas else 0)
