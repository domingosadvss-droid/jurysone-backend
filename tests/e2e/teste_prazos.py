"""Teste de ponta a ponta do Controle de Prazos (formato da planilha do escritório) no JurysOne.

Rodar contra um app LOCAL apontado para banco de TESTE (nunca produção), com AGENDA_GOOGLE_DESLIGADA=true:
    BACKEND_DIR=<pasta do jurysone-backend>  python -X utf8 tests/e2e/teste_prazos.py
Usa uma planilha SINTÉTICA gerada aqui mesmo (openpyxl), sem dado de cliente real.
Confere o caso de referência da planilha: disponibilizado 26/10/2026, 15 dias úteis, TJSC → 24/11/2026
(o mesmo resultado do eproc no caso real), além de TRF4 x TJSC, Corpus Christi e o recesso.
As rotas de cadastro têm limite de 3/min: espere 1 minuto entre execuções.
"""
import io, json, os, subprocess, sys, time, urllib.request, urllib.error, uuid
from datetime import datetime

import openpyxl

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


def upload(caminho, token, nome, conteudo):
    limite = "----jt" + uuid.uuid4().hex
    corpo = (f"--{limite}\r\nContent-Disposition: form-data; name=\"arquivo\"; filename=\"{nome}\"\r\n"
             f"Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n").encode() + conteudo + f"\r\n--{limite}--\r\n".encode()
    r = urllib.request.Request(BASE + caminho, data=corpo, method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={limite}")
    r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read() or b"null")
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


def simula(tok, disp, dias, trib, contagem="UTEIS"):
    s, b = req("GET", f"/calendario/simular?disponibilizacao={disp}&dias={dias}&tribunal={trib}&contagem={contagem}", tok)
    return b.get("vencimento") if isinstance(b, dict) else (s, b)


def d(iso):
    return datetime.strptime(iso, "%Y-%m-%d")


NUM_A = f"50{sfx[-5:]}-26.2026.8.24.0005"   # TJSC
NUM_B = f"50{sfx[-5:]}-29.2022.8.24.0005"   # TJSC
NUM_C = f"10{sfx[-5:]}-77.2025.4.04.7208"   # TRF4


def planilha(com_feriados=False, extra_fatal_a=None):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    if com_feriados:
        f = wb.create_sheet("Feriados")
        f.append(["Data", "Motivo", "Tribunal", "Efeito", "Fonte"])
        f.append([d("2026-12-10"), "Feriado de teste", "TJSC", "Sem expediente", "teste"])
        f.append([d("2026-12-11"), "Prazos suspensos – teste", "Todos", "Só suspende prazo", "teste"])
    p = wb.create_sheet("Prazos")
    p.append(["ID DJEN", "Disponibilização", "Publicação", "Processo", "Tribunal", "Órgão", "Cliente", "O que fazer", "Tipo", "Dias",
              "Contagem", "Início da contagem", "PRAZO FATAL", "Alerta D-5", "Alerta D-3", "Alerta D-1", "Situação", "Responsável",
              "Conferir?", "Cumprido em", "Cumprido por", "Observações", "Link"])
    # 1) caso de referência: sem fatal na planilha → o programa calcula
    p.append(["900001", d("2026-10-26"), None, NUM_A, "TJSC", "1ª Vara Cível de Balneário Camboriú", "Fulano de Teste (autor)",
              "Especificar provas", "Prazo", 15, "Úteis", None, extra_fatal_a, None, None, None, None, "Jonathan", "Não", None, None, "Prazo comum", "abrir"])
    p.cell(row=2, column=23).hyperlink = "https://comunica.pje.jus.br/consulta?id=900001"
    # 2) planilha com data MAIS CEDO que o cálculo → fica a mais cedo, fixada e "conferir"
    p.append(["900002", d("2026-10-27"), None, NUM_B, "TJSC", "1ª Vara Cível de Balneário Camboriú", "Beltrano de Teste (exequente)",
              "Dar andamento ao cumprimento", "Prazo", 15, "Úteis", None, d("2026-11-10"), None, None, None, None, "Jonathan", "Não", None, None, "", ""])
    # 3) prazo manual (sem DJEN) já cumprido
    p.append(["MAN-abc12345", None, None, NUM_C, "TRF4", "1ª Vara Federal de Itajaí", "Sicrano de Teste", "Juntar procuração", "Prazo", None,
              "Úteis", None, d("2026-12-15"), None, None, None, None, "Jonathan", "Não", d("2026-11-19"), "Jonathan", "", ""])
    # 4) só ciência → não vira prazo
    p.append(["900004", d("2026-11-03"), None, NUM_A, "TJSC", "1ª Vara Cível", "Fulano de Teste", "Ciência da decisão", "Ciência", None,
              "Úteis", None, None, None, None, None, None, "Jonathan", "Não", None, None, "", ""])
    # 5) prazo do DJEN sem dias (provisório de 5 dias, conferir) e responsável fora da equipe
    p.append(["900005", d("2026-11-11"), None, NUM_A, "TJSC", "1ª Vara Cível", "Fulano de Teste", "Abrir a intimação", "Prazo", None,
              "Úteis", None, None, None, None, None, None, "Fulana Externa", "Sim", None, None, "Prazo provisório.", ""])
    # 6) a mesma publicação (ID 900001) com um segundo prazo, de 10 dias: vira outro prazo, ligado à mesma intimação
    p.append(["900001", d("2026-10-26"), None, NUM_A, "TJSC", "1ª Vara Cível de Balneário Camboriú", "Fulano de Teste (autor)",
              "Recurso inominado", "Prazo", 10, "Úteis", None, None, None, None, None, None, "Jonathan", "Não", None, None, "", ""])
    a = wb.create_sheet("Audiências e sessões")
    a.append(["Data", "Hora", "Tipo", "Processo", "Órgão", "Cliente", "Local / link", "Responsável", "Providências", "Cliente avisado em", "Situação", "Evento (id)"])
    a.append([d("2026-12-03"), "14:00", "Audiência de conciliação", NUM_A, "Cejusc", "Fulano de Teste", "Teams (link na intimação)", "Jonathan", "Avisar cliente", None, None, None])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── Preparação ───────────────────────────────────────────────────────────────
print("== Preparação")
s, b = req("POST", "/auth/register", corpo={"email": f"prz{sfx}@teste.local", "password": "SenhaForte123!", "nome": "Jonathan Prazos", "nomeEscritorio": "Escritorio Prazos"})
assert s in (200, 201), (s, b)
adm = b["access_token"]
s, est = req("POST", "/equipe", adm, {"nome": "Estagiária Prazos", "email": f"przest{sfx}@teste.local", "senha": "SenhaForte123!", "perfil": "ESTAGIARIO"})
assert s in (200, 201), (s, est)
s, b = req("POST", "/auth/login", corpo={"email": f"przest{sfx}@teste.local", "password": "SenhaForte123!"})
tok_est = b["access_token"]

# ── 1. Calendário ────────────────────────────────────────────────────────────
print("== Calendário")
checa("sem o calendário do TJSC, o caso de referência daria 18/11 (prazo curto, mas nunca mais longo)", simula(adm, "2026-10-26", 15, "TJSC") == "2026-11-18", simula(adm, "2026-10-26", 15, "TJSC"))
checa("Corpus Christi deixou de ser nacional (TRF4 conta 04/06/2026)", simula(adm, "2026-06-02", 3, "TRF4") == "2026-06-08", simula(adm, "2026-06-02", 3, "TRF4"))
checa("estagiária não aplica o calendário", req("POST", "/controle-prazos/calendario-padrao", tok_est)[0] == 403)

# prazos criados antes do calendário (para testar o recálculo)
s, imp1 = upload("/controle-prazos/importar-planilha", adm, "prazos.xlsx", planilha())
checa("importação da planilha aceita (.xlsx exportado do Google)", s == 200 and isinstance(imp1, dict), (s, imp1))
pz = imp1.get("prazos", {}) if isinstance(imp1, dict) else {}
checa("prazos novos, ciência ignorada e cumprido marcado", pz.get("novos") == 5 and pz.get("cumpridos") == 1
      and any("ciência" in x["motivo"] for x in pz.get("ignorados", [])), pz)
checa("processos e clientes criados com cadastro incompleto", imp1.get("processosCriados") == 3 and imp1.get("clientesCriados") == 3, imp1)
checa("divergência registrada e resolvida pela data mais cedo", any(x["planilha"] == "2026-11-10" and "mais cedo" in x["acao"] for x in pz.get("divergencias", [])), pz.get("divergencias"))
checa("audiência importada", imp1.get("audiencias", {}).get("novas") == 1, imp1.get("audiencias"))

s, pn = req("GET", "/controle-prazos?filtro=todos", adm)
por_id = {p["idDjen"]: p for p in pn["prazos"] if p.get("idDjen")}
checa("prazo de referência calculado pelo calendário atual (sem o TJSC ainda): 18/11", por_id.get("900001", {}).get("fatal") == "2026-11-18", por_id.get("900001"))

s, cal = req("POST", "/controle-prazos/calendario-padrao", adm)
checa("calendário padrão por tribunal aplicado", s == 200 and cal["feriados"]["novos"] >= 60, cal.get("feriados") if isinstance(cal, dict) else cal)
alt = {a["antes"] + ">" + a["depois"] for a in cal["recalculo"]["alterados"]}
checa("recálculo moveu o prazo em aberto para 24/11", "2026-11-18>2026-11-24" in alt, cal["recalculo"])
checa("recálculo não mexe no prazo fixado pela importação", not any(a["depois"] != "2026-11-10" and a["antes"] == "2026-11-10" for a in cal["recalculo"]["alterados"]), cal["recalculo"])
s, cal2 = req("POST", "/controle-prazos/calendario-padrao", adm)
checa("aplicar de novo não duplica nem muda nada", cal2["feriados"]["novos"] == 0 and not cal2["recalculo"]["alterados"], cal2)
s, nt = req("GET", "/notifications?per_page=100", adm)
checa("responsável avisado no sino da mudança de data", any(n.get("tipo") == "PRAZO_RECALCULADO" and "24/11/2026" in n.get("mensagem", "") for n in lista(nt)), [n.get("titulo") for n in lista(nt)])

checa("caso de referência: 26/10/2026 + 15 dias úteis no TJSC = 24/11/2026", simula(adm, "2026-10-26", 15, "TJSC") == "2026-11-24", simula(adm, "2026-10-26", 15, "TJSC"))
checa("suspensão só do TRF4 (21/10) não mexe no TJSC", simula(adm, "2026-10-19", 5, "TRF4") == "2026-10-28" and simula(adm, "2026-10-19", 5, "TJSC") == "2026-10-27",
      (simula(adm, "2026-10-19", 5, "TRF4"), simula(adm, "2026-10-19", 5, "TJSC")))
checa("Corpus Christi vale para o TJSC pelo calendário do tribunal", simula(adm, "2026-06-02", 3, "TJSC") == "2026-06-09", simula(adm, "2026-06-02", 3, "TJSC"))
checa("recesso: publicação de 18/12/2026 com 5 dias úteis vence em 27/01/2027", simula(adm, "2026-12-18", 5, "TJSC") == "2027-01-27", simula(adm, "2026-12-18", 5, "TJSC"))

# ── 2. Painel no formato da planilha ─────────────────────────────────────────
print("== Painel")
s, pn = req("GET", "/controle-prazos?filtro=todos", adm)
por_id = {p["idDjen"]: p for p in pn["prazos"] if p.get("idDjen")}
r = por_id.get("900001", {})
checa("linha igual à da planilha: publicação 27/10, início 29/10, fatal 24/11", r.get("publicacao") == "2026-10-27" and r.get("inicio") == "2026-10-29" and r.get("fatal") == "2026-11-24", r)
checa("alertas D-5 16/11, D-3 18/11 e D-1 23/11 (dias úteis do tribunal)", r.get("alertaD5") == "2026-11-16" and r.get("alertaD3") == "2026-11-18" and r.get("alertaD1") == "2026-11-23", r)
checa("situação no padrão da planilha", r.get("situacao") in ("⚫ Vencido", "🔴 Vence hoje", "🔴 Urgente", "🟡 Atenção", "🟢 No prazo") and r.get("tribunal") == "TJSC", r.get("situacao"))
checa("órgão, cliente, responsável e link da publicação", "Balneário" in (r.get("orgao") or "") and r.get("cliente", "").startswith("Fulano de Teste")
      and r.get("responsaveis") == ["Jonathan Prazos"] and "comunica.pje" in (r.get("link") or ""), r)
dois = sorted(p["fatal"] for p in pn["prazos"] if p.get("idDjen") == "900001")
checa("uma publicação com dois prazos (15 e 10 dias) vira dois prazos", dois == ["2026-11-16", "2026-11-24"], dois)
r5 = por_id.get("900005", {})
checa("sem dias na planilha: provisório de 5 dias úteis, marcado conferir", r5.get("dias") == 5 and r5.get("conferir") is True, r5)
checa("responsável fora da equipe fica anotado na memória", any("Fulana Externa".lower() in m.lower() for m in r5.get("memoria", [])), r5.get("memoria"))
r2 = por_id.get("900002", {})
checa("prazo divergente fica com a data mais cedo e conferir", r2.get("fatal") == "2026-11-10" and r2.get("conferir") is True, r2)
man = [p for p in pn["prazos"] if p.get("processo") == NUM_C]
checa("prazo manual já cumprido aparece como cumprido", man and man[0]["situacaoCodigo"] == "CUMPRIDO" and man[0]["cumpridoEm"] == "2026-11-19", man)
s, ab = req("GET", "/controle-prazos?filtro=abertos", adm)
checa("filtro 'em aberto' não traz cumpridos", all(p["situacaoCodigo"] != "CUMPRIDO" for p in ab["prazos"]) and len(ab["prazos"]) == 4, [p["situacaoCodigo"] for p in ab["prazos"]])
s, cf = req("GET", "/controle-prazos?filtro=conferir", adm)
checa("filtro 'conferir'", {p["idDjen"] for p in cf["prazos"]} == {"900002", "900005"}, [p["idDjen"] for p in cf["prazos"]])
checa("resumo conta os prazos a conferir", ab["resumo"].get("CONFERIR") == 2, ab["resumo"])
s, pe = req("GET", "/controle-prazos?filtro=todos", tok_est)
checa("estagiária só vê os prazos em que é responsável", s == 200 and pe["prazos"] == [], (s, pe))

# ── 3. Reimportação, ajustes e baixa ─────────────────────────────────────────
print("== Reimportação e baixa")
s, imp2 = upload("/controle-prazos/importar-planilha", adm, "prazos.xlsx", planilha(com_feriados=True, extra_fatal_a=d("2026-11-25")))
pz2 = imp2.get("prazos", {})
checa("reimportar não duplica prazos nem audiências", pz2.get("novos") == 0 and pz2.get("jaExistiam") == 5 and imp2["audiencias"]["jaExistiam"] == 1, imp2)
checa("data diferente numa linha que já existia vira aviso, sem mexer no prazo", any(x["planilha"] == "2026-11-25" and x["jurysone"] == "2026-11-24" for x in pz2.get("divergencias", [])), pz2.get("divergencias"))
checa("aba Feriados da planilha é importada", imp2["feriados"]["novos"] == 2, imp2["feriados"])
checa("feriado só do TJSC vindo da planilha conta no cálculo", simula(adm, "2026-12-08", 1, "TJSC") == "2026-12-14" and simula(adm, "2026-12-08", 1, "TRF4") == "2026-12-10",
      (simula(adm, "2026-12-08", 1, "TJSC"), simula(adm, "2026-12-08", 1, "TRF4")))
s, b = req("POST", f"/prazos/{r5['id']}/ajustar", adm, {})
s, cf = req("GET", "/controle-prazos?filtro=conferir", adm)
checa("marcar como conferido tira da lista de conferir", r5["id"] not in [p["id"] for p in cf["prazos"]], cf["prazos"])
s, b = req("POST", f"/prazos/{r['id']}/cumprir", adm, {})
s, pn = req("GET", "/controle-prazos?filtro=cumpridos", adm)
checa("baixa do prazo pelo painel", any(p["id"] == r["id"] and p["situacaoCodigo"] == "CUMPRIDO" and p["cumpridoPor"] == "Jonathan Prazos" for p in pn["prazos"]), pn["prazos"])
s, b = req("POST", "/controle-prazos/recalcular", adm)
checa("recálculo não mexe em prazo cumprido", s == 200 and not any(a["prazoId"] == r["id"] for a in b["alterados"]), b)

# ── 4. Formato do Google Agenda (funções puras, sem falar com o Google) ──────
print("== Formato do Google Agenda")
js = r"""
const f=require('./dist/modules/publicacoes/agenda-google-formato.js');
const {AgendaPrazosService}=require('./dist/modules/publicacoes/agenda-prazos.service.js');
const base={prazoId:'p1',dias:15,vencimento:'2026-11-24',alertaD3:'2026-11-18',oQueFazer:'Especificar provas',processo:'5001812-26.2026.8.24.0005',
 tribunal:'TJSC',orgao:'1ª Vara',cliente:'Fulano',responsaveis:['Jonathan','Thamile'],conferir:false,cumprido:false};
const fat=f.corpoPrazoFatal(base), d3=f.corpoAlertaD3(base), ok=f.corpoPrazoFatal({...base,cumprido:true});
const au=f.corpoAudiencia({titulo:'Sessão de julgamento',descricao:'x',inicio:new Date('2026-12-03T14:00:00-03:00'),fim:null,local:'TJSC',processo:'X',cancelado:false});
console.log(JSON.stringify({fat,d3,ok,au,desligada:(process.env.AGENDA_GOOGLE_DESLIGADA='true',AgendaPrazosService.agendaGoogleDesligada())}));
"""
out = subprocess.run(["node", "-e", js], cwd=os.environ["BACKEND_DIR"], capture_output=True, text=True, timeout=60)
g = json.loads(out.stdout.strip().splitlines()[-1]) if out.returncode == 0 else {}
fat, d3, okc, au = g.get("fat", {}), g.get("d3", {}), g.get("ok", {}), g.get("au", {})
checa("prazo fatal: 9h, vermelho, lembretes na hora e 1 dia antes", fat.get("start", {}).get("dateTime") == "2026-11-24T12:00:00.000Z" and fat.get("colorId") == "11"
      and [o["minutes"] for o in fat["reminders"]["overrides"]] == [0, 1440] and fat["summary"].startswith("⚖️ PRAZO FATAL – Especificar provas"), (out.stderr[-300:], fat))
checa("etiqueta anti-duplicação no padrão da planilha", "[prazo:p1:15:fatal]" in fat.get("description", "") and "[prazo:p1:15:d3]" in d3.get("description", ""), fat.get("description"))
checa("alerta D-3: 9h, amarelo, com a data do vencimento no título", d3.get("start", {}).get("dateTime") == "2026-11-18T12:00:00.000Z" and d3.get("colorId") == "5" and "(vence 24/11)" in d3.get("summary", ""), d3)
checa("prazo cumprido vira ✅ CUMPRIDO e sem lembretes", okc.get("summary", "").startswith("✅ CUMPRIDO – PRAZO FATAL") and okc["reminders"]["overrides"] == [], okc.get("summary"))
checa("sessão/audiência: azul, lembretes 2 dias e 2 horas antes", au.get("colorId") == "9" and [o["minutes"] for o in au["reminders"]["overrides"]] == [2880, 120] and au["summary"].startswith("🏛️"), au)
checa("trava AGENDA_GOOGLE_DESLIGADA reconhecida", g.get("desligada") is True, g.get("desligada"))

# ── 5. Tela ──────────────────────────────────────────────────────────────────
print("== Tela")
html = urllib.request.urlopen(BASE.replace("/api", "") + "/dashboard.html", timeout=30).read().decode()
checa("painel tem a página e o menu do Controle de Prazos", 'id="page-controle-prazos"' in html and "navigate('controle-prazos')" in html and "carregarControlePrazos" in html)
checa("só uma definição de _authHeaders, aceitando cabeçalhos extras", html.count("function _authHeaders") == 1 and "function _authHeaders(extra)" in html)

print(f"\nResultado: {oks} OK, {len(falhas)} falha(s)")
for f_ in falhas:
    print("  -", f_)
sys.exit(1 if falhas else 0)
