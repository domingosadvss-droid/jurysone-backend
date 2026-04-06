# 📅 Google Calendar Integration — Setup Completo
**JurysOne × Google Calendar (domingos.advss@gmail.com)**
**Data:** 06/04/2026

---

## 📋 O Que Vamos Fazer

1. Ativar Google Calendar API no seu projeto GCP
2. Criar credenciais OAuth 2.0
3. Configurar no JurysOne
4. Sincronizar seu calendário pessoal

**Tempo:** 15 minutos
**Resultado:** Agenda sincronizada em tempo real

---

## PASSO 1: Habilitar Google Calendar API

1. Acesse: https://console.cloud.google.com/
2. Clique no seu projeto (canto superior)
3. Vá para **APIs & Services** → **Library**
4. Procure por **"Google Calendar API"**
5. Clique em **"Enable"**
6. Aguarde carregar (2-3 segundos)

✅ Pronto! API ativada

---

## PASSO 2: Criar OAuth 2.0 Credentials

1. Vá para **APIs & Services** → **Credentials**
2. Clique em **"+ Create Credentials"** → **"OAuth client ID"**
3. Se pedir, configure **OAuth consent screen** primeiro:
   - User Type: **External**
   - Clique **"Create"**
   - Preencha:
     - **App name:** JurysOne
     - **User support email:** domingos.advss@gmail.com
     - **Developer contact:** domingos.advss@gmail.com
   - Clique **"Save and Continue"** (ignore scopes por enquanto)
   - Clique **"Save and Continue"** novamente
   - Clique **"Back to Dashboard"**

4. Agora clique **"+ Create Credentials"** → **"OAuth client ID"**

5. Configure:
   ```
   Application Type: Web application
   Name: JurysOne Calendar
   ```

6. **Authorized redirect URIs** — Adicione:
   ```
   http://localhost:3001/auth/google/callback
   https://seu-dominio-render.onrender.com/auth/google/callback
   ```

   (Se não sabe URL do Render ainda, adicione depois)

7. Clique **"Create"**

8. **COPIE E GUARDE ESTAS 3 INFORMAÇÕES:**
   ```
   Client ID: xxxxx.apps.googleusercontent.com
   Client Secret: GOCSP...xxxxx
   Redirect URI: https://seu-dominio.onrender.com/auth/google/callback
   ```

✅ Credenciais criadas!

---

## PASSO 3: Adicionar Escopos do Google Calendar

De volta em **APIs & Services** → **OAuth consent screen**:

1. Vá para **Scopes** (no painel esquerdo)
2. Clique **"Add or Remove Scopes"**
3. Procure por:
   - `calendar` → Selecione: `../auth/calendar`
   - `calendar.readonly` (opcional)
4. Clique **"Update"**

✅ Escopos configurados!

---

## PASSO 4: Adicionar Usuários de Teste

No **OAuth consent screen**:

1. Clique em **"Test users"**
2. Clique **"Add users"**
3. Adicione: `domingos.advss@gmail.com`
4. Clique **"Add"**

✅ Sua conta autorizada como teste!

---

## PASSO 5: Configurar no JurysOne

Adicione estas 3 variáveis no Render (ou no seu `.env` local):

```
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSP...xxxxx
GOOGLE_REDIRECT_URI=https://seu-dominio.onrender.com/auth/google/callback
```

**Onde adicionar:**
- **Local:** `.env` na raiz de `jurysone-backend/`
- **Produção:** Render Dashboard → Environment → Add Variable

---

## PASSO 6: Sincronizar Seu Calendário

### No App:
1. Acesse: `https://seu-dominio.com/configuracoes` (Settings)
2. Procure por **"Integrações"** → **"Google Calendar"**
3. Clique **"Conectar com Google"**
4. Clique em **"Continue"** quando Google pedir permissão
5. Selecione a conta `domingos.advss@gmail.com`
6. Clique **"Allow"** para autorizar JurysOne acessar seu calendário

✅ Sincronizado!

---

## 🔍 VALIDAÇÃO: Teste de Funcionamento

### Teste 1: Sincronizar Evento
1. Crie um evento no seu calendário Google (celular ou web)
2. Aguarde 2-3 minutos
3. Procure em **JurysOne** → **Agenda**
4. Deve aparecer o novo evento

### Teste 2: Criar via JurysOne
1. Em JurysOne, clique **"+ Nova Audiência"**
2. Preencha data/hora
3. Clique **"Salvar e Sincronizar com Google"**
4. Verifique seu Google Calendar (celular/web)
5. Deve aparecer automaticamente

### Teste 3: Atualizar Evento
1. No JurysOne, edite uma audiência
2. Aguarde sincronização (automática)
3. Verifique no Google Calendar
4. Mudanças devem aparecer

✅ Se todos os testes passam = Integração funcional!

---

## 🚨 Troubleshooting

### ❌ "Invalid_grant" ao conectar
**Causa:** Credenciais incorretas
**Solução:** Verifique se CLIENT_ID e CLIENT_SECRET estão iguais no código e no Render

### ❌ "Redirect URI mismatch"
**Causa:** URI no código diferente do configurado no GCP
**Solução:**
- Se local: use `http://localhost:3001/auth/google/callback`
- Se produção: use URL exata do Render

### ❌ "Calendar not syncing"
**Causa:** Permissão não concedida ou token expirado
**Solução:**
1. Desconecte em Configurações → Integrações
2. Reconecte e autorize novamente
3. Aguarde 5 minutos pela sincronização

### ❌ "User not authorized"
**Causa:** Conta não é teste user
**Solução:** Adicione seu email em OAuth consent screen → Test users

---

## 📱 Sincronizar Calendário Pessoal (Celular)

Já que você usa Google Calendar no celular, tudo sincroniza automaticamente:

1. **Google Calendar (celular)** → Sincroniza com **Google (web)**
2. **Google (web)** → Sincroniza com **JurysOne (via API)**
3. **JurysOne** → Sincroniza de volta com **Google Calendar**

**Resultado:** Seus eventos aparecem em tempo real em 3 lugares!

### Para Verificar:
1. Abra Google Calendar (celular)
2. Vá para Configurações → Minhas agendas
3. Seu calendário deve estar sincronizado
4. Ao criar evento no celular, aparece em JurysOne em 2-3 minutos

---

## 🔐 Segurança

- ✅ JurysOne nunca vê sua senha do Google
- ✅ Usa OAuth 2.0 (padrão de segurança)
- ✅ Você controla permissões (pode revogar em qualquer momento)
- ✅ Token expira automaticamente (reautenticação mensal)

### Revogar Acesso (Se Necessário)
1. Acesse: https://myaccount.google.com/permissions
2. Procure por **"JurysOne"**
3. Clique em remover

---

## 📋 Checklist Final

- [ ] Google Calendar API ativada em GCP
- [ ] OAuth 2.0 credentials criadas
- [ ] Client ID e Secret copiados
- [ ] Redirect URI configurado
- [ ] Escopos do Calendar adicionados
- [ ] domingos.advss@gmail.com adicionado como test user
- [ ] Variáveis configuradas em .env (local) ou Render (prod)
- [ ] Aplicação reiniciada
- [ ] Conectado via "Conectar com Google" no app
- [ ] Evento criado e sincronizado com sucesso
- [ ] Evento criado no Google e apareceu em JurysOne

---

## 🎯 Funcionalidades Liberadas

Após sincronizar, você terá:

✅ **Ver Audiências no Calendário** — Sua agenda jurídica visível no Google Calendar
✅ **Criar Audiências via JurysOne** — Automaticamente aparecem no Google Calendar
✅ **Sincronização Automática** — Mudanças sincronizam em 2-3 minutos
✅ **Notificações Google** — Receba lembretes via Google Calendar
✅ **Acesso via Celular** — Veja tudo no app Google Calendar do seu celular
✅ **Conflito Detection** — JurysOne alertará se houver conflito de horários

---

## 💡 Dicas

1. **Para Mobile:** Após sincronizar, abra Google Calendar (celular) → seu calendário aparecerá lá automaticamente
2. **Para Desktop:** Use Google Calendar web para gerenciar quando não estiver em JurysOne
3. **Lembretes:** Configure lembretes no Google Calendar (15 min antes é padrão)
4. **Cor:** No Google Calendar, customize a cor do calendário JurysOne para fácil identificação

---

## 📞 Próximas Etapas

Após configurar Google Calendar:
1. ✅ Configure WhatsApp Integration (outro arquivo)
2. Teste sincronização de eventos
3. Crie algumas audiências teste
4. Convide colegas para compartilhar calendário (feature Google)

---

**Status:** 🟢 Pronto para configurar
**Tempo Estimado:** 15 minutos
**Dificuldade:** Fácil (copy-paste)

Avise quando tiver copiado as credenciais para eu configurar no sistema! 📅
