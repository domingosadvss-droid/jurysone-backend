# 🔗 Google Calendar + WhatsApp — Guia de Integração Completa
**JurysOne — Fluxo Integrado**
**Data:** 06/04/2026

---

## 📌 Visão Geral da Integração

Você terá um fluxo completo onde:

```
Cliente envia WhatsApp com dados
       ↓
Juri (🤖) extrai informações
       ↓
Auto-preenche formulário
       ↓
Cria Audiência no sistema
       ↓
Sincroniza com Google Calendar (seu celular)
       ↓
Você responde cliente via WhatsApp
       ↓
Processo jurídico entra no fluxo automático
```

---

## 🎯 PASSO 1: Configurar Google Calendar (15 min)

### Siga o guia: `GOOGLE_CALENDAR_SETUP.md`

**Resumo:**
1. Ativar Google Calendar API (GCP)
2. Criar OAuth 2.0 credentials
3. Adicionar escopos de calendário
4. Adicionar sua conta como test user
5. Adicionar variáveis ao `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:3001/auth/google/callback
   ```

**Resultado:** Você pode sincronizar calendários

---

## 💬 PASSO 2: Configurar WhatsApp Meta (20 min)

### Siga o guia: `WHATSAPP_META_SETUP.md`

**Resumo:**
1. Acessar Meta for Developers
2. Obter credenciais (Business Account ID, Phone Number ID, Access Token)
3. Configurar webhook para `https://seu-dominio/webhooks/whatsapp`
4. Selecionar eventos: messages, message_status
5. Adicionar variáveis ao `.env`:
   ```
   WHATSAPP_BUSINESS_ACCOUNT_ID=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_API_TOKEN=...
   WHATSAPP_VERIFY_TOKEN=...
   WHATSAPP_API_URL=https://graph.instagram.com/v18.0
   ```

**Resultado:** Você pode receber/enviar mensagens e documentos

---

## ⚙️ PASSO 3: Ativar Sincronização Automática

Após adicionar as variáveis ao `.env`:

1. **Reinicie o backend:**
   ```bash
   npm run start:dev  # Se desenvolução local
   # Ou redeploy se produção (Render)
   ```

2. **No app JurysOne, vá para:**
   - **Settings / Configurações** → **Integrações**
   - Clique **"Conectar Google Calendar"**
   - Autorize com `domingos.advss@gmail.com`
   - Clique **"Sincronizar Agora"**

3. **Verifique conexão WhatsApp:**
   - Settings → **WhatsApp**
   - Deve mostrar: "Conectado com sucesso ✅"
   - Se erro: verifique `WHATSAPP_VERIFY_TOKEN`

✅ Integração ativa!

---

## 🔄 FLUXO DE USO COMPLETO

### Cenário 1: Cliente envia mensagem no WhatsApp

```
1. Cliente WhatsApp: "Oi, preciso de ajuda com um divórcio"
   ↓
2. Meta API → JurysOne (webhook recebe)
   ↓
3. Notificação em JurysOne: "Nova mensagem de +55 47 99999-9999"
   ↓
4. Você clica em "Ver Conversa"
   ↓
5. Juri (🤖) analisa e oferece: "Extrair dados automaticamente?"
   ↓
6. Você clica "Extrair"
   ↓
7. Formulário "Novo Atendimento" aparece PRÉ-PREENCHIDO com:
   - Cliente: inferido da mensagem
   - Tipo: Direito de Família
   - Assunto: Divórcio
   - Descrição: Resumo da mensagem
   ↓
8. Você verifica e clica "Salvar"
   ↓
9. Sistema cria Audiência no calendário
   ↓
10. Google Calendar (seu celular) SINCRONIZA AUTOMATICAMENTE
   ↓
11. Você pode responder cliente:
    - Botão: "Responder via WhatsApp"
    - Escreve: "Oi! Recebi sua solicitação. Podemos agendar para..."
    - Clica "Enviar"
    ↓
12. Cliente recebe no WhatsApp em 5 segundos
```

---

### Cenário 2: Você cria Audiência e sincroniza

```
1. Em JurysOne, clique: "Nova Audiência"
   ↓
2. Preencha:
   - Data: 15/05/2026
   - Hora: 14:00
   - Tipo: Audiência Preliminar
   - Cliente: João Silva
   ↓
3. Clique: "Sincronizar com Google Calendar"
   ↓
4. Seu Google Calendar (celular) mostra:
   - "Audiência Preliminar - João Silva"
   - Horário: 15/05 às 14h
   - Local: (do atendimento)
   ↓
5. Se precisar, envie WhatsApp ao cliente:
   - Clique: "Agendar via WhatsApp"
   - Mensagem pronta: "João, agendamos sua audiência para 15/05 às 14h"
   - Clique "Enviar"
   ↓
6. Cliente recebe confirmação no WhatsApp
```

---

### Cenário 3: Cliente envia Documento

```
1. Cliente envia documento PDF no WhatsApp
   ↓
2. Meta API → JurysOne (webhook recebe arquivo)
   ↓
3. Documento armazenado em "Documentos > WhatsApp"
   ↓
4. Notificação: "Documento recebido: contrato.pdf"
   ↓
5. Você clica "Visualizar"
   ↓
6. Juri (🤖) oferece: "Analisar documento?"
   ↓
7. Clica "Analisar"
   ↓
8. IA extrai:
   - Tipo de contrato
   - Partes envolvidas
   - Datas importantes
   - Cláusulas críticas
   ↓
9. Relatório de análise aparece
   ↓
10. Você responde no WhatsApp:
    "João, analisei o contrato. Encontrei 3 cláusulas críticas que precisam revisar..."
```

---

## 📱 Visualização no App

### Abas Principais:

#### 1. Dashboard
```
┌─────────────────────────────────────┐
│ Próximas Audiências (Google Calendar) │
├─────────────────────────────────────┤
│ 📅 15/05 14:00 - Audiência Preliminar│
│ 📅 17/05 10:30 - Julgamento         │
│ 📅 20/05 16:00 - Consulta Inicial   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Mensagens Recentes (WhatsApp)       │
├─────────────────────────────────────┤
│ 💬 +55 47 99999-9999: "Oi, tudo bem?"│
│ 💬 +55 47 88888-8888: "Qual é meu...│
│ 💬 +55 47 77777-7777: "Recebi o...  │
└─────────────────────────────────────┘
```

#### 2. Mensagens → WhatsApp
```
┌─────────────────────────────────────┐
│ Conversa com João Silva             │
├─────────────────────────────────────┤
│ João: "Preciso de ajuda com divórcio│
│        Tenho 2 filhos menores"      │
│                                      │
│ Você: [Campo de mensagem]           │
│ [Enviar] [Extrair Dados]            │
│ [Enviar Documento]                  │
└─────────────────────────────────────┘
```

#### 3. Atendimentos
```
┌─────────────────────────────────────┐
│ Novo Atendimento (Auto-preenchido)  │
├─────────────────────────────────────┤
│ Cliente: João Silva                 │
│ Email: joao@email.com              │
│ Telefone: +55 47 99999-9999        │
│ Tipo: Direito de Família           │
│ Assunto: Divórcio                  │
│ Descrição: Tem 2 filhos menores    │
│                                     │
│ [Salvar] [Cancelar]                │
└─────────────────────────────────────┘
```

#### 4. Calendario
```
     Maio 2026
┌─────────────────────────────┐
│ Dom Seg Ter Qua Qui Sex Sab│
│               1   2   3   4│
│ 5   6   7   8   9  10  11│
│12  13  14 [15] 16  17  18│
│    📅 14h Audiência Preliminar│
│19  20  21  22  23  24  25│
│26  27  28  29  30  31    │
└─────────────────────────────┘
```

---

## 🔐 Segurança & Privacidade

### Google Calendar
- ✅ Você controla quem vê seu calendário
- ✅ JurysOne usa OAuth (nunca vê sua senha)
- ✅ Pode desconectar a qualquer momento
- ✅ Dados criptografados em trânsito

### WhatsApp
- ✅ Mensagens criptografadas (Meta cuida)
- ✅ Você é responsável pelo número de negócio
- ✅ Dados LGPD-compliant (armazenados no Brasil via Supabase)
- ✅ Pode revogar acesso na Meta Dashboard

---

## ⚡ Dicas & Truques

### Google Calendar
1. **No celular:** Configure Google Calendar para notificações 15 min antes
2. **Cores:** Customize cores por tipo de audiência (civil, trabalhista, etc)
3. **Compartilhar:** Pode compartilhar seu calendário JurysOne com colegas
4. **Conflitos:** Sistema alerta se houver 2 audiências no mesmo horário

### WhatsApp
1. **Templates:** Crie respostas rápidas para perguntas comuns
2. **Status:** Veja quando cliente leu sua mensagem
3. **Documentos:** Peça sempre em PDF (mais fácil de processar)
4. **Horário:** Configure resposta automática fora do horário

### Automações
1. **Criar Atendimento automático:** Ao receber 1ª mensagem do cliente
2. **Enviar lembrete:** 24h antes da audiência (via WhatsApp)
3. **Notificar cliente:** Quando audiência for marcada
4. **Salvar conversa:** Toda mensagem fica armazenada

---

## 🧪 Testes Recomendados

### Teste 1: Sincronização Google Calendar
- [ ] Crie evento no JurysOne
- [ ] Verifique se aparece no Google Calendar web
- [ ] Verifique se aparece no app Google Calendar (celular)
- [ ] Edite no app do celular, confirme mudança em JurysOne

### Teste 2: WhatsApp Messaging
- [ ] Envie mensagem do celular para seu número de negócio
- [ ] Confirme que apareceu em JurysOne
- [ ] Responda via JurysOne
- [ ] Confirme que cliente recebeu no WhatsApp

### Teste 3: Extração de Dados
- [ ] Envie mensagem com seus dados pessoais
- [ ] Clique "Extrair Dados"
- [ ] Confirme que formulário foi preenchido corretamente
- [ ] Salve o atendimento

### Teste 4: Documento + Análise
- [ ] Envie PDF simples no WhatsApp
- [ ] Clique "Analisar Documento"
- [ ] Verifique relatório gerado
- [ ] Confirme que dados foram extraídos

---

## 🚨 Solução de Problemas

### Google Calendar não sincroniza
```
❌ Problema: Audiência criada mas não aparece no Google Calendar
✅ Solução:
  1. Verifique se está logado na conta correta (domingos.advss@gmail.com)
  2. Aguarde 2-3 minutos
  3. Atualize Google Calendar (pull to refresh)
  4. Se nada: Desconecte e reconecte integração
```

### WhatsApp não recebe mensagens
```
❌ Problema: Envia mensagem no WhatsApp mas não aparece em JurysOne
✅ Solução:
  1. Verificar WHATSAPP_VERIFY_TOKEN está correto
  2. Checar Render logs para erros
  3. Garantir webhook está ativo em Meta Dashboard
  4. Testar com: curl -X POST https://seu-dominio/webhooks/whatsapp
```

### Dados não extraem corretamente
```
❌ Problema: IA não consegue extrair dados da mensagem
✅ Solução:
  1. Mensagem foi muito breve (adicione mais contexto)
  2. Formato errado (pedir dados estruturados)
  3. GEMINI_API_KEY inválida
  4. Verificar quotas de IA em aistudio.google.com
```

---

## 📊 Monitoramento

### Dashboard Admin (para você)
```
Statisticas (últimos 30 dias):
- Mensagens recebidas: 127
- Mensagens enviadas: 98
- Taxa de resposta: 77%
- Documentos sincronizados: 34
- Audiências criadas: 12
- Tempo médio de resposta: 2.3 horas
```

---

## 🎯 Próximas Integrações (Opcional)

Após estabilizar Google Calendar + WhatsApp:

1. **DataJud** — Consultar processos automaticamente
2. **Assinatura Eletrônica** — ZapSign/DocuSign/ClickSign
3. **Automações Zapier** — Conectar com outros sistemas
4. **WhatsApp Broadcast** — Enviar para múltiplos clientes
5. **Análise de Sentimento** — Detectar urgência nas mensagens

---

## 📞 Checklist Final de Configuração

- [ ] Google Calendar OAuth configurado
- [ ] GOOGLE_CLIENT_ID no .env
- [ ] GOOGLE_CLIENT_SECRET no .env
- [ ] GOOGLE_REDIRECT_URI configurado
- [ ] Conectado via App (Settings → Integrações)
- [ ] WhatsApp Meta API credenciais obtidas
- [ ] WHATSAPP_BUSINESS_ACCOUNT_ID no .env
- [ ] WHATSAPP_PHONE_NUMBER_ID no .env
- [ ] WHATSAPP_API_TOKEN no .env
- [ ] WHATSAPP_VERIFY_TOKEN gerado
- [ ] Webhook configurado em Meta Dashboard
- [ ] Teste: Mensagem recebida ✅
- [ ] Teste: Evento criado e sincronizado ✅
- [ ] Teste: Extração de dados funciona ✅

---

## 🎉 Status: Pronto para Usar!

Após completar:
✅ Suas audiências estarão no Google Calendar (celular + web)
✅ Seus clientes estarão no WhatsApp
✅ Tudo sincronizado e automático
✅ Você tem um fluxo completo de trabalho

---

**Tempo Total Setup:** ~35 minutos
**Valor Agregado:** Altíssimo (automação completa de comunicação)
**ROI:** Economia de ~5h/semana em gerenciamento manual

Comece com **GOOGLE_CALENDAR_SETUP.md** → depois **WHATSAPP_META_SETUP.md** → depois volte aqui! 🚀
