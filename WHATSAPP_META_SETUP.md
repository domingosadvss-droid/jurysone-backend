# 💬 WhatsApp Meta Integration — Setup Completo
**JurysOne × WhatsApp Business API (Meta)**
**Data:** 06/04/2026

---

## 📋 O Que Vamos Fazer

1. Configurar WhatsApp Business Account (Meta)
2. Obter credenciais da API
3. Configurar Webhook para receber mensagens
4. Integrar no JurysOne
5. Sincronizar documentos e conversas

**Tempo:** 20 minutos
**Resultado:** Enviar/receber mensagens e documentos do WhatsApp direto no app

---

## PASSO 1: Acessar Meta for Developers

1. Acesse: https://developers.facebook.com/
2. Clique em **"My Apps"**
3. Procure ou crie um app para WhatsApp:
   - Se não existe: **"Create App"** → **"Business"** → dê nome "JurysOne WhatsApp"
4. Dentro do app, vá para **"WhatsApp"** (no menu esquerdo)

✅ Acesso ao painel WhatsApp

---

## PASSO 2: Obter Credenciais da API

No painel WhatsApp (Meta for Developers):

1. Vá para **"API Setup"** ou **"Getting Started"**
2. Você verá:
   ```
   Business Account ID: 123456789
   Phone Number ID: 987654321
   Access Token: EAABs...xxxxx (Token de acesso)
   ```

3. **COPIE E GUARDE:**
   - Business Account ID
   - Phone Number ID
   - Access Token (válido por 60 dias)

⚠️ **IMPORTANTE:** O token expira! Você precisará renovar ou usar refresh token

---

## PASSO 3: Configurar Webhook (Receber Mensagens)

Seu app precisa de um endpoint para receber mensagens do WhatsApp.

### Pré-requisito:
- JurysOne já deve estar deployado no Render (URL pública)
- Exemplo: `https://jurysone-xxxxx.onrender.com`

### No painel Meta:

1. Vá para **Configuration** ou **Webhook Setup**
2. Clique **"Edit"** ou **"Setup Webhook"**
3. Preencha:
   ```
   Callback URL: https://jurysone-xxxxx.onrender.com/webhooks/whatsapp
   Verify Token: um_token_aleatorio_seu_escolher
   ```

4. Para gerar Verify Token (algo aleatório):
   ```bash
   node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
   ```
   Saída exemplo: `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`

5. Clique **"Verify and Save"**

   Meta fará uma requisição para seu webhook para verificar. Precisa estar respondendo!

---

## PASSO 4: Selecionar Webhooks Events

No Meta Dashboard → Webhook:

1. Procure por **"Subscribe to this object"** ou **"Webhook Fields"**
2. Selecione:
   - ✅ `messages` (receber mensagens)
   - ✅ `message_template_status_update` (confirmação de templates)
   - ✅ `message_status` (confirmação de entrega)
   - ✅ `read_receipts` (confirmação de leitura)

3. Clique **"Save"**

✅ Webhooks configurados!

---

## PASSO 5: Configurar no JurysOne

Adicione estas variáveis no `.env` (local) ou Render (produção):

```
# WhatsApp Meta API
WHATSAPP_BUSINESS_ACCOUNT_ID=seu_business_account_id
WHATSAPP_PHONE_NUMBER_ID=seu_phone_number_id
WHATSAPP_API_TOKEN=EAABs...seu_access_token
WHATSAPP_VERIFY_TOKEN=um_token_aleatorio_seu_escolher
WHATSAPP_API_URL=https://graph.instagram.com/v18.0
```

**Onde adicionar:**
- **Local:** `jurysone-backend/.env`
- **Produção:** Render Dashboard → Environment Variables

---

## PASSO 6: Implementar Webhook Handler

O backend já tem suporte para WhatsApp. Você precisa garantir que:

### ✅ Endpoint existe:
```
POST /webhooks/whatsapp
GET /webhooks/whatsapp (para verificação do Meta)
```

### Estrutura esperada:
```javascript
// Mensagem recebida do WhatsApp
{
  object: "whatsapp_business_account",
  entry: [{
    id: "...",
    changes: [{
      value: {
        messaging_product: "whatsapp",
        messages: [{
          from: "554799999999",
          id: "wamid...",
          timestamp: "1234567890",
          text: { body: "Olá" },
          image: { link: "https://..." },  // Se for imagem/documento
          document: { link: "https://..." }
        }]
      }
    }]
  }]
}
```

✅ Backend processa e armazena mensagens

---

## PASSO 7: Enviar Mensagens via JurysOne

Para enviar mensagens **DE** JurysOne **PARA** WhatsApp:

### API Chamada:
```bash
POST https://graph.instagram.com/v18.0/{PHONE_NUMBER_ID}/messages
Authorization: Bearer {WHATSAPP_API_TOKEN}

Body:
{
  "messaging_product": "whatsapp",
  "to": "554799999999",
  "type": "text",
  "text": { "body": "Sua mensagem aqui" }
}
```

No JurysOne, isso será feito automaticamente quando você enviar uma mensagem via interface.

---

## 🖼️ PASSO 8: Sincronizar Documentos WhatsApp

### Receber Documentos:
Quando alguém enviar um documento no WhatsApp:

1. Webhook recebe o arquivo (link temporário)
2. JurysOne baixa e armazena localmente
3. Você vê em **Documentos** → **WhatsApp**
4. Pode usar para pré-preencher formulários

### Tipos Suportados:
- 📄 PDF, Word, Excel
- 📸 Imagens (PNG, JPG)
- 🎥 Vídeos
- 🎵 Áudios (será transcrito se configurado)

### No App:
1. Abra **Atendimentos** → **Conversa WhatsApp**
2. Documentos aparecem em **Anexos**
3. Clique para visualizar ou fazer download
4. Use **"Extrair Dados"** para auto-preencher formulário

---

## 📱 PASSO 9: Testar Integração

### Teste 1: Receber Mensagem
1. Abra WhatsApp no celular
2. Procure seu número do negócio (configurado no Meta)
3. Envie uma mensagem: "Teste 123"
4. Em JurysOne → **Mensagens** → deve aparecer em 2-3 segundos
5. Clique para responder

### Teste 2: Enviar Mensagem
1. Em JurysOne, vá para um atendimento
2. Clique **"Enviar via WhatsApp"**
3. Escreva: "Olá teste"
4. Clique **"Enviar"**
5. No seu celular, a mensagem deve chegar em 5 segundos

### Teste 3: Enviar Documento
1. Em um atendimento, clique **"Enviar Documento"**
2. Selecione um PDF
3. Clique **"Enviar via WhatsApp"**
4. No seu celular, deve chegar o arquivo

✅ Se todos passam = Integração funcional!

---

## 🔄 Fluxo Completo: Do WhatsApp ao Formulário

```
1. Cliente envia mensagem + documento no WhatsApp
   ↓
2. Meta API envia para JurysOne webhook
   ↓
3. JurysOne recebe e armazena mensagem/documento
   ↓
4. Você vê notificação em "Novo Atendimento"
   ↓
5. Clica em "Extrair Dados do WhatsApp"
   ↓
6. IA (Gemini) lê mensagem e documento
   ↓
7. Auto-preenche formulário "Novo Atendimento"
   ↓
8. Você aprova e salva
   ↓
9. Responde cliente via WhatsApp direto do app
```

---

## 🚨 Troubleshooting

### ❌ "Webhook verification failed"
**Causa:** Verify Token incorreto ou endpoint não respondendo
**Solução:**
1. Verifique `WHATSAPP_VERIFY_TOKEN` no `.env`
2. Certifique que é exatamente igual no Meta Dashboard
3. Reinicie o app
4. Teste novamente no Meta Dashboard

### ❌ "Messages not being received"
**Causa:** Webhook events não selecionados ou token expirado
**Solução:**
1. Verifique se `messages` está selecionado no Meta Dashboard
2. Gere novo Access Token se expirou (>60 dias)
3. Verifique logs: `Render Dashboard → Logs`
4. Procure por "whatsapp" para ver erros

### ❌ "Can't send messages"
**Causa:** Token inválido ou Phone Number ID errado
**Solução:**
1. Copie novamente `WHATSAPP_API_TOKEN` do Meta
2. Verifique `WHATSAPP_PHONE_NUMBER_ID` (não é seu número celular!)
3. Teste token com:
   ```bash
   curl -H "Authorization: Bearer TOKEN" \
     https://graph.instagram.com/v18.0/me?fields=id
   ```
4. Deve retornar seu ID sem erro

### ❌ "Documents not showing"
**Causa:** Tipos de arquivo não suportados ou link expirado
**Solução:**
1. Verifique tipo de arquivo (PDF, JPG, docx são ok)
2. Tamanho máximo: 100MB
3. Links expiram em 24h, documento deve ser processado rapidamente
4. Procure em **Documentos → WhatsApp**

### ⚠️ "Token expires in 60 days"
**Causa:** Access tokens do Meta expiram
**Solução:**
1. Configure Long-Lived Token em Meta Dashboard
2. Ou: Cron job para renovar token mensalmente
3. Ou: Usar refresh token (se disponível em sua conta)

---

## 📊 Monitoramento

### Verificar Status:
1. **Render Logs:** Procure por erros de conexão WhatsApp
2. **Meta Dashboard:** Veja número de mensagens processadas
3. **JurysOne:** Veja fila de mensagens em **Admin → Logs**

### Métricas Importantes:
- Mensagens recebidas hoje
- Mensagens enviadas hoje
- Documentos sincronizados
- Taxa de erro

---

## 🔐 Segurança

- ✅ Token armazenado encriptado em Render
- ✅ Webhook URL só responde a requisições Meta verificadas
- ✅ Mensagens criptografadas em trânsito (HTTPS)
- ✅ Dados armazenados seguindo LGPD

### Revogar Acesso:
Se precisar desconectar WhatsApp:
1. Meta Dashboard → App Roles
2. Remova token ou desative app

---

## 📋 Checklist Final

- [ ] WhatsApp Business Account criado/verificado
- [ ] Business Account ID copiado
- [ ] Phone Number ID copiado
- [ ] Access Token obtido
- [ ] Verify Token gerado (aleatório)
- [ ] Webhook URL configurado no Meta
- [ ] Webhook events selecionados (messages, etc)
- [ ] Variáveis adicionadas ao `.env` ou Render
- [ ] App reiniciado/redeploy realizado
- [ ] Webhook verification passou
- [ ] Teste: Mensagem recebida ✅
- [ ] Teste: Mensagem enviada ✅
- [ ] Teste: Documento sincronizado ✅

---

## 🎯 Funcionalidades Liberadas

Após sincronizar, você terá:

✅ **Receber Mensagens** — Todas as conversas do WhatsApp em um lugar
✅ **Enviar Mensagens** — Responda diretamente do app (sem abrir WhatsApp)
✅ **Sincronizar Documentos** — PDFs, imagens, arquivos automaticamente importados
✅ **Auto-preenchimento** — IA extrai dados para formulários
✅ **Histórico** — Todas as conversas salvas em banco de dados
✅ **Notificações** — Alertas para novas mensagens
✅ **Status de Entrega** — Veja quando cliente leu sua mensagem
✅ **Rápidas Respostas** — Templates de mensagens frequentes

---

## 💡 Dicas de Uso

1. **Número WhatsApp:** Configure um número específico para negócio (não use pessoal)
2. **Horário:** Configure "fora do horário" para resposta automática
3. **Templates:** Crie templates para respostas frequentes
4. **Documentos:** Solicite PDF no início da conversa para agilizar
5. **CRM:** Sincronize contatos do WhatsApp com seus clientes no app

---

## 🔗 Próximas Integrações

Após WhatsApp:
1. ✅ Configure Google Calendar (já tem guide)
2. Adicione DataJud para buscar processos automaticamente
3. Configure assinatura eletrônica (ZapSign/DocuSign)
4. Crie automações com Zapier

---

## 📞 API Endpoints Criados

Após setup, você terá:

```
POST /api/whatsapp/send       → Enviar mensagem
POST /webhooks/whatsapp       → Receber mensagem (Meta envia)
GET  /api/whatsapp/messages   → Histórico de mensagens
GET  /api/whatsapp/documents  → Documentos sincronizados
POST /api/whatsapp/documents/sync → Sincronizar documento
```

---

**Status:** 🟢 Pronto para configurar
**Tempo Estimado:** 20 minutos
**Dificuldade:** Média (requer tokens do Meta)

Avise quando tiver as credenciais do Meta para eu finalizar a integração! 💬
