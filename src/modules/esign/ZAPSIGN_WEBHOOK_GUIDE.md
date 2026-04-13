# 🔔 Guia de Implementação: Webhooks do Zapsign

## Resumo da Implementação

Foram criados **2 webhooks** no Zapsign para monitorar eventos de documentos:

### ✅ Webhooks Configurados

1. **Documento Criado** (doc_created)
   - Endpoint: `https://jurysone-backend.onrender.com/api/zapsign/webhook`
   - Dispara quando um documento é criado no Zapsign
   - Registra a criação e cria envelope interno

2. **Documento Assinado** (doc_signed)
   - Endpoint: `https://jurysone-backend.onrender.com/api/zapsign/webhook`
   - Dispara quando um documento é assinado
   - Atualiza status, registra assinatura, notifica interessados

---

## 📋 Arquivos Criados

### 1. **zapsign-webhook.controller.ts**
   - Controlador público para receber webhooks do Zapsign
   - Rota: `POST /api/zapsign/webhook` (sem autenticação)
   - Processa 4 tipos de eventos:
     - `doc_created` → Documento criado
     - `doc_signed` → Documento assinado
     - `doc_viewed` → Documento visualizado
     - `doc_rejected` → Documento rejeitado

### 2. **Métodos adicionados em esign.service.ts**
   - `processZapsignDocumentCreated()` - Processa criação
   - `processZapsignDocumentSigned()` - Processa assinatura
   - `processZapsignDocumentViewed()` - Registra visualização
   - `processZapsignDocumentRejected()` - Processa rejeição
   - `registrarAuditoria()` - Registra ações na trilha de auditoria

### 3. **Atualizado: esign.module.ts**
   - Adicionado `ZapsignWebhookController` aos controladores

---

## 🔧 Estrutura do Payload do Webhook

```json
{
  "event": "doc_created|doc_signed|doc_viewed|doc_rejected",
  "document_id": "id-do-zapsign",
  "created_at": "2026-04-12T15:30:00Z",
  "signature_id": "sig-123",
  "status": "pending|signed|viewed|rejected",
  "signer_email": "signatario@example.com",
  "signer_name": "Nome do Signatário",
  "signer_cpf": "123.456.789-00",
  "document_url": "https://zapsign.com/documento.pdf",
  "external_id": "id-interno-seu-sistema",
  "rejection_reason": "Motivo da rejeição (se rejeitado)"
}
```

---

## 📝 Próximas Etapas de Implementação

### 1. **Migrations do Banco de Dados**
Você precisa criar migrations para adicionar os campos ao esquema Prisma:

```prisma
model esignEnvelope {
  id                    String   @id @default(cuid())
  // ... campos existentes ...
  
  // Campos novos para Zapsign
  zapsignDocumentId     String?  @unique
  externalDocumentId    String?
  urlDocumentoAssinado  String?
  dataRejeicao          DateTime?
  motivoRejeicao        String?
  
  // Auditoria
  auditoria             esignAuditoria[]
  
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
}

model esignAuditoria {
  id          String   @id @default(cuid())
  envelopeId  String
  envelope    esignEnvelope @relation(fields: [envelopeId], references: [id], onDelete: Cascade)
  
  acao        String   // assinado, rejeitado, visualizado, etc
  usuario     String
  email       String
  timestamp   DateTime
  descricao   String
  
  createdAt   DateTime @default(now())
}
```

### 2. **Métodos a Implementar/Melhorar**

#### A. Integração com o serviço de Email
```typescript
// Em esign.service.ts, adicionar ao processZapsignDocumentSigned():
private async notificarAssinatura(envelopeId: string, signerEmail: string) {
  // Chamar EmailService para enviar notificação
  // await this.emailService.enviarNotificacaoAssinatura({...})
}
```

#### B. StatusFlowService (Automações Pós-Assinatura)
```typescript
// Adicionar chamada após documento ser assinado
// Exemplo: criar tarefa, gerar notificação, etc
// await this.statusFlowService.handleDocumentSigned(envelope.id);
```

#### C. Buscar PDF Assinado
```typescript
// No webhook doc_signed, buscar o PDF do Zapsign
// e armazenar no S3 ou banco de dados
private async buscarPdfAssinado(documentUrl: string, envelopeId: string) {
  // Download do PDF → Armazenar em S3
  // await this.s3Service.uploadDocumento(...)
}
```

### 3. **Variável de Ambiente Necessária**

✅ **Já configurada:**
```env
ZAPSIGN_API_KEY=ed32f7d9-82c6-4e1c-b0c2-3abef74c41e65c3be04e-abd1-4ca7-974c-1ee71c4e0ba0
```

### 4. **Teste da Integração**

Você pode testar o webhook de 2 formas:

#### **Opção 1: Usar Zapsign Dashboard**
1. Acesse: https://app.zapsign.com.br/conta/configuracoes/integration
2. Clique em "Logs Webhooks"
3. Veja o histórico de webhooks enviados
4. Verifique se chegaram sem erros

#### **Opção 2: Usar Ferramenta como Webhook.cool**
```bash
# Gere uma URL temporária para testes
# Exemplo: https://webhook.cool/...
# Atualize no Zapsign e crie um documento de teste
```

### 5. **Monitoramento e Logs**

Os logs estão configurados no controlador:
```typescript
this.logger.log(`[Zapsign Webhook] Evento recebido: ${payload.event}`);
```

Para visualizar no Render:
1. Acesse: https://dashboard.render.com/web/srv-d7dc7nf7f7vs73ernit0/logs
2. Procure por `[Zapsign Webhook]`

---

## 🎯 Checklist de Implementação

- [x] Criar controlador de webhook público
- [x] Implementar handlers para 4 tipos de eventos
- [x] Adicionar métodos de processamento no serviço
- [x] Atualizar módulo esign
- [ ] Criar/atualizar migrations do banco de dados
- [ ] Implementar busca do PDF assinado do Zapsign
- [ ] Integrar com sistema de notificações (email/WhatsApp)
- [ ] Integrar com StatusFlowService para automações
- [ ] Testar webhooks em ambiente de produção
- [ ] Monitorar logs e tratamento de erros

---

## 🚀 Próximo Passo Recomendado

**1º: Criar as migrations do banco de dados** para adicionar os campos necessários

Execute em seu projeto:
```bash
npx prisma migrate dev --name add_zapsign_fields
npx prisma generate
```

**2º: Fazer um teste de webhook** criando um documento no Zapsign e verificando se a chamada chega no backend

---

## 📞 Observações Importantes

### Autenticação
- O webhook é público (**sem autenticação**) pois vem de um serviço externo (Zapsign)
- O Zapsign se autentica via `Authorization` header (se configurado) ou por IP whitelist

### Timeout
- Zapsign espera uma resposta rápida (< 5 segundos)
- Se processing for longo, use background jobs (Bull/Queue)

### Retry
- Zapsign tenta reenviar 5 vezes com espera de 5 minutos entre tentativas
- Status 200 = sucesso, retorne `{ success: true }`

### Segurança
- Valide o IP origem do Zapsign se possível
- Considere adicionar assinatura do webhook (verificar header)
- Logs sensíveis já removem dados de senha

---

## 📚 Referências

- [Zapsign API Docs](https://docs.zapsign.com.br/)
- [NestJS Controllers](https://docs.nestjs.com/controllers)
- [Prisma Webhooks](https://www.prisma.io/docs/concepts/components/prisma-client)
