# 🚀 CONFIGURE GOOGLE CALENDAR + WHATSAPP — GUIA RÁPIDO
**Próximos 35 minutos: Sua agenda + WhatsApp no JurysOne**

---

## 📋 O QUE VOCÊ VAI CONSEGUIR

Após isso, você terá:

✅ Calendário Google sincronizado (domingos.advss@gmail.com)
✅ WhatsApp integrado (receber/enviar mensagens)
✅ Documentos do WhatsApp importados automaticamente
✅ Formulários preenchidos automaticamente com dados do WhatsApp
✅ Conversas salvas no banco de dados

---

## ⏱️ TIMELINE

- **Google Calendar:** 15 minutos
- **WhatsApp Meta:** 20 minutos
- **Total:** 35 minutos

---

## PASSO 1: GOOGLE CALENDAR (15 min)

### 1.1 Acesse Google Cloud Console
```
https://console.cloud.google.com/
```

### 1.2 Ativar Google Calendar API
- Vá para: **APIs & Services** → **Library**
- Procure: `Google Calendar API`
- Clique: **Enable**

### 1.3 Criar OAuth 2.0 Credentials
- Vá para: **APIs & Services** → **Credentials**
- Clique: **+ Create Credentials** → **OAuth client ID**

Se pedir **OAuth Consent Screen**, configure:
- User Type: **External**
- App name: **JurysOne**
- User support email: `domingos.advss@gmail.com`
- Developer contact: `domingos.advss@gmail.com`
- Save → Save → Back to Dashboard

### 1.4 Criar Credentials (de novo)
- **+ Create Credentials** → **OAuth client ID**
- Application Type: **Web application**
- Name: `JurysOne Calendar`
- Authorized redirect URIs:
  ```
  http://localhost:3001/auth/google/callback
  https://jurysone-xxxxx.onrender.com/auth/google/callback
  ```
- Clique: **Create**

### 1.5 COPIAR AS 3 INFORMAÇÕES
```
Client ID: xxxxxx.apps.googleusercontent.com
Client Secret: GOCSP...xxxxx
Redirect URI: https://seu-dominio.onrender.com/auth/google/callback
```

**Guarde em um arquivo txt** ← Vai usar agora

### 1.6 Adicionar Escopos
- **APIs & Services** → **OAuth consent screen**
- Clique: **Scopes**
- **Add or Remove Scopes**
- Procure: `calendar`
- Selecione: `../auth/calendar`
- **Update**

### 1.7 Adicionar Sua Conta como Test User
- **OAuth consent screen** → **Test users**
- **Add users**
- Email: `domingos.advss@gmail.com`
- **Add**

✅ **GOOGLE CALENDAR CONFIGURADO!**

---

## PASSO 2: WHATSAPP META (20 min)

### 2.1 Acesse Meta for Developers
```
https://developers.facebook.com/
```

### 2.2 Vá para Seu App
- **My Apps**
- Procure app para WhatsApp (ou crie novo: **Create App** → **Business**)
- Clique no app
- Vá para: **WhatsApp**

### 2.3 Copiar Credenciais
Em **API Setup** ou **Getting Started**, copie:

```
Business Account ID: xxxxx
Phone Number ID: xxxxx
Access Token: EAABs...xxxxx
```

**Guarde em um arquivo txt** ← Vai usar agora

### 2.4 Configurar Webhook
- **Configuration** ou **Webhook Setup**
- Clique: **Edit** ou **Setup Webhook**
- Preencha:
  ```
  Callback URL: https://jurysone-xxxxx.onrender.com/webhooks/whatsapp
  Verify Token: <gere um token aleatório>
  ```

Para gerar token aleatório:
```bash
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```
Saída: `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`

- Clique: **Verify and Save**

### 2.5 Selecionar Webhook Events
- **Subscribe to this object** ou **Webhook Fields**
- Marque:
  - ✅ `messages` (receber mensagens)
  - ✅ `message_status` (status de entrega)
- **Save**

✅ **WHATSAPP CONFIGURADO!**

---

## PASSO 3: ADICIONAR NO JURYSONE (5 min)

### 3.1 Atualizar `.env` (Desenvolvimento Local)

Se estiver rodando localmente, abra: `jurysone-backend/.env`

Adicione ou atualize:

```
# ── Google Calendar Integration ────────────────────────────────────────
GOOGLE_CLIENT_ID=<COPIAR DO PASSO 1.5>
GOOGLE_CLIENT_SECRET=<COPIAR DO PASSO 1.5>
GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback

# ── WhatsApp Meta API ──────────────────────────────────────────────────
WHATSAPP_BUSINESS_ACCOUNT_ID=<COPIAR DO PASSO 2.3>
WHATSAPP_PHONE_NUMBER_ID=<COPIAR DO PASSO 2.3>
WHATSAPP_API_TOKEN=<COPIAR DO PASSO 2.3>
WHATSAPP_VERIFY_TOKEN=<GERAR DO PASSO 2.4>
WHATSAPP_API_URL=https://graph.instagram.com/v18.0
```

Salve o arquivo.

### 3.2 Atualizar em Render (Produção)

Se estiver em produção, vá para:
```
https://dashboard.render.com/
```

- Clique em seu app: **jurysone**
- Vá para: **Environment**
- Adicione as 9 variáveis acima manualmente

### 3.3 Reiniciar Aplicação

**Local:**
```bash
npm run start:dev
```

**Produção (Render):**
- Clique: **Manual Deploy** (ou faça `git push`)
- Aguarde build (3-5 min)

---

## PASSO 4: CONECTAR NO APP (5 min)

Abra: `http://localhost:3001` (ou seu domínio)

### 4.1 Google Calendar
1. **Settings** → **Integrações** ou **Integrations**
2. Procure: **Google Calendar**
3. Clique: **Conectar com Google** ou **Connect with Google**
4. Autorize: `domingos.advss@gmail.com`
5. Clique: **Allow**

✅ Pronto! Seu calendário está sincronizado

### 4.2 WhatsApp
1. **Settings** → **Integrações**
2. Procure: **WhatsApp**
3. Deve mostrar: **Conectado com sucesso ✅**

Se erro: Verifique as variáveis (typo?)

---

## PASSO 5: TESTAR (5 min)

### Teste Google Calendar
1. Crie um evento em JurysOne: **Nova Audiência** → preencha → **Salvar**
2. Abra Google Calendar (web ou celular)
3. Deve aparecer o evento em 2-3 minutos

### Teste WhatsApp
1. Abra WhatsApp no seu celular
2. Procure seu número de negócio (do Meta)
3. Envie: "Olá teste"
4. Em JurysOne → **Mensagens**, deve aparecer a mensagem
5. Clique para responder
6. Digite: "Oi! Recebi sua mensagem"
7. Clique: **Enviar**
8. No WhatsApp do celular, deve chegar a resposta

✅ **TUDO FUNCIONANDO!**

---

## 📋 CHECKLIST RÁPIDO

**Google Calendar:**
- [ ] API ativada no GCP
- [ ] OAuth 2.0 credentials criadas
- [ ] Client ID copiado
- [ ] Client Secret copiado
- [ ] Redirect URI configurado
- [ ] Escopos adicionados
- [ ] Sua conta (domingos.advss@gmail.com) adicionada como test user
- [ ] Variáveis adicionadas ao `.env` ou Render
- [ ] App reiniciado
- [ ] Conectado via app ✅

**WhatsApp Meta:**
- [ ] Meta for Developers acessado
- [ ] Business Account ID copiado
- [ ] Phone Number ID copiado
- [ ] Access Token copiado
- [ ] Webhook URL configurado
- [ ] Verify Token gerado e configurado
- [ ] Events selecionados (messages, message_status)
- [ ] Variáveis adicionadas ao `.env` ou Render
- [ ] App reiniciado
- [ ] Webhook verification passou ✅

**Testes:**
- [ ] Evento criado aparece em Google Calendar ✅
- [ ] Mensagem recebida do WhatsApp aparece em JurysOne ✅
- [ ] Resposta enviada de JurysOne chegou no WhatsApp ✅

---

## 🆘 ERROS COMUNS

### "Invalid_grant" ao conectar Google
**Solução:** Copie novamente GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET. Typo?

### "Webhook verification failed" no WhatsApp
**Solução:**
1. Copie novamente WHATSAPP_VERIFY_TOKEN (sem espaços)
2. Garanta que é exatamente igual no Meta Dashboard
3. Reinicie o app

### "Messages not being received"
**Solução:**
1. Verifique se `messages` está selecionado em Webhook Fields
2. Veja logs: `Render Dashboard → Logs` (procure por "whatsapp")
3. Teste webhook com: `curl https://seu-dominio/webhooks/whatsapp`

### "Calendar not syncing"
**Solução:**
1. Desconecte e reconecte (Settings → Google Calendar)
2. Autorize novamente com `domingos.advss@gmail.com`
3. Aguarde 3-5 minutos

---

## 💡 DICAS

1. **Google Calendar:** Depois que sincronizar, você pode compartilhar seu calendário JurysOne com colegas em https://calendar.google.com

2. **WhatsApp:** Salve seu número de negócio (o que configurou no Meta) no seu contato para lembrar qual é

3. **Notificações:** Configure lembretes 15 min antes das audiências no Google Calendar

4. **Documentos:** Quando cliente enviar documento no WhatsApp, clique "Extrair" para IA preencher formulário automaticamente

---

## 📞 DOCUMENTAÇÃO COMPLETA

Se precisar de detalhes, veja:
- `GOOGLE_CALENDAR_SETUP.md` — Setup detalhado do Google Calendar
- `WHATSAPP_META_SETUP.md` — Setup detalhado do WhatsApp
- `GOOGLE_CALENDAR_WHATSAPP_INTEGRATION.md` — Fluxo completo integrado

---

## ✅ STATUS: PRONTO PARA COMEÇAR!

Próximos passos:
1. ✅ Siga este guia (35 minutos)
2. ✅ Teste tudo
3. ✅ Pronto para usar!

Depois disso, você terá:
- 📅 Calendário sincronizado
- 💬 WhatsApp integrado
- 🤖 Juri extraindo dados
- 📱 Tudo automático

**Tempo:** 35 minutos
**Dificuldade:** Fácil (copy-paste + cliques)
**Valor:** Altíssimo (economia de 5h/semana)

---

**Comece agora! ⏱️**

Se travar em algo, releia a seção "ERROS COMUNS" acima ou consulte os guias detalhados.

Boa sorte! 🚀
