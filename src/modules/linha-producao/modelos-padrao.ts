/**
 * JURYSONE — Modelos padrão de linha de produção
 *
 * Primeira versão, montada a partir do levantamento de 07/11/2026. O escritório
 * pode editar cada modelo; ao editar, a versão sobe e os casos já iniciados
 * continuam com as etapas que tinham.
 *
 * responsavelTipo:
 *   ADVOGADO_RESPONSAVEL → advogado responsável pelo processo
 *   ESTAGIARIO           → primeira estagiária ativa (ou o advogado, se não houver)
 *   ADMIN                → administrador do escritório
 */

export interface ItemChecklistModelo { id: string; texto: string; obrigatorio: boolean }
export interface EtapaPadrao {
  nome: string;
  descricao?: string;
  responsavelTipo?: 'ADVOGADO_RESPONSAVEL' | 'ESTAGIARIO' | 'ADMIN';
  aguardando?: string;
  prazoDias?: number;
  opcional?: boolean;
  checklist?: (string | [string, boolean])[];
}
export interface ModeloPadrao { codigo: string; nome: string; area: string; descricao: string; etapas: EtapaPadrao[] }

// ── Etapas comuns de entrada (triagem → consulta → contratação) ─────────────

const TRIAGEM: EtapaPadrao = {
  nome: 'Triagem e entrevista',
  descricao: 'Entrevista pelo questionário da área e checagem de conflito de interesses.',
  responsavelTipo: 'ESTAGIARIO',
  prazoDias: 2,
  checklist: ['Checagem de conflitos feita (sem bloqueio)', 'Questionário da área respondido', ['Origem do cliente registrada', false]],
};

const CONSULTA: EtapaPadrao = {
  nome: 'Consulta com o advogado',
  descricao: 'Atendimento por vídeo, WhatsApp ou presencial. Ficha completada antes de gerar documentos.',
  prazoDias: 5,
  checklist: ['Consulta realizada', 'Ficha do cliente completa', ['Transcrição ou anotações salvas', false]],
};

const CONTRATACAO = (extras: string[] = []): EtapaPadrao => ({
  nome: 'Contratação',
  descricao: 'Contrato de honorários, procuração e termo de entrevista assinados; cobrança criada.',
  prazoDias: 3,
  aguardando: 'Assinatura do cliente',
  checklist: [
    'Contrato de honorários assinado',
    'Procuração assinada',
    'Termo de entrevista assinado',
    ...extras,
    'Papéis no processo registrados (indicação / participação)',
    ['Cobrança criada no Asaas', false],
  ],
});

const RECEBIMENTO: EtapaPadrao = {
  nome: 'Recebimento e encerramento',
  descricao: 'Honorários, êxito e sucumbência recebidos; cota-parte apurada; caso arquivado.',
  responsavelTipo: 'ADMIN',
  prazoDias: 30,
  checklist: ['Valores recebidos lançados no processo', ['Sucumbência verificada', false], 'Cliente informado do encerramento'],
};

// ── Modelos ──────────────────────────────────────────────────────────────────

export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    codigo: 'GENERICO',
    nome: 'Genérico (qualquer área)',
    area: 'GERAL',
    descricao: 'Motor padrão para áreas que ainda não têm linha própria.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Documentos do cliente', aguardando: 'Cliente', prazoDias: 10, responsavelTipo: 'ESTAGIARIO', checklist: ['Checklist de documentos enviado ao cliente', 'Documentos recebidos e salvos na pasta'] },
      { nome: 'Peça inicial', prazoDias: 10, checklist: ['Rascunho elaborado', 'Revisão e aprovação do advogado'] },
      { nome: 'Protocolo', prazoDias: 2, checklist: ['Peça protocolada', 'Número do processo cadastrado'] },
      { nome: 'Acompanhamento', prazoDias: 180, checklist: ['Prazos cadastrados', ['Audiências agendadas e cliente avisado', false]] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'IMOB_REVISAO_CONTRATUAL',
    nome: 'Imobiliário — revisão contratual (financiamento, planta, distrato)',
    area: 'IMOBILIARIO',
    descricao: 'Revisão de contrato imobiliário com etapa opcional de notificação ou acordo antes da ação.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Documentos do contrato', aguardando: 'Cliente', prazoDias: 10, responsavelTipo: 'ESTAGIARIO', checklist: ['Contrato completo', 'Boletos e comprovantes de pagamento', ['Extrato do financiamento ou da construtora', false], ['Comunicações com a construtora ou o banco', false]] },
      { nome: 'Cálculo revisional', descricao: 'Planilha Excel com fórmulas visíveis; índices do Banco Central.', prazoDias: 5, checklist: ['Planilha gerada', 'Cálculo conferido pelo advogado'] },
      { nome: 'Notificação ou tentativa de acordo', descricao: 'Opcional: o advogado decide se notifica antes de ajuizar.', opcional: true, prazoDias: 15, aguardando: 'Resposta da construtora ou do banco', checklist: ['Notificação enviada', 'Prazo de resposta controlado'] },
      { nome: 'Petição inicial', prazoDias: 10, checklist: ['Rascunho a partir da entrevista e do cálculo', 'Revisão e aprovação do advogado'] },
      { nome: 'Protocolo', prazoDias: 2, checklist: ['Petição protocolada', 'Número do processo cadastrado'] },
      { nome: 'Acompanhamento até a sentença', prazoDias: 365, checklist: ['Prazos cadastrados', ['Perícia acompanhada', false]] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'IMOB_LOCACAO_PROPRIETARIO',
    nome: 'Imobiliário — locação (proprietário: despejo e cobrança)',
    area: 'IMOBILIARIO',
    descricao: 'Cobrança do inquilino e do fiador e, sem pagamento, ação de despejo com cobrança.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Documentos da locação', aguardando: 'Cliente', prazoDias: 7, responsavelTipo: 'ESTAGIARIO', checklist: ['Contrato de locação', 'Demonstrativo dos aluguéis em atraso', ['Dados do fiador ou da caução', false], ['Boletos de condomínio e IPTU em atraso', false]] },
      { nome: 'Cálculo do débito', descricao: 'Aluguéis, condomínio, IPTU, multa e correção.', prazoDias: 3, checklist: ['Planilha do débito gerada', 'Cálculo conferido'] },
      { nome: 'Notificação do inquilino e do fiador', descricao: 'Notificação formal por e-mail e carta com AR; WhatsApp ao inquilino só com aprovação.', prazoDias: 10, aguardando: 'Pagamento ou resposta do inquilino', checklist: ['Notificação formal enviada (e-mail e AR)', ['Mensagem no WhatsApp aprovada e enviada', false], 'Prazo para pagamento controlado'] },
      { nome: 'Ação de despejo com cobrança', prazoDias: 7, checklist: ['Petição inicial revisada', ['Caução para a liminar providenciada', false]] },
      { nome: 'Protocolo e liminar', prazoDias: 3, checklist: ['Petição protocolada', 'Número do processo cadastrado'] },
      { nome: 'Acompanhamento até a desocupação', prazoDias: 180, checklist: ['Prazos cadastrados', ['Desocupação ou acordo registrado', false]] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'IMOB_COMPRA_VENDA',
    nome: 'Imobiliário — compra e venda (pacote completo)',
    area: 'IMOBILIARIO',
    descricao: 'Análise de risco, contrato e acompanhamento até o registro na matrícula.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Certidões do vendedor e do imóvel', descricao: 'Emissão automática pelo serviço pago; custo reembolsável pelo cliente.', responsavelTipo: 'ESTAGIARIO', prazoDias: 7, checklist: ['Certidões do vendedor (e cônjuge)', 'Matrícula atualizada', ['Certidões do comprador', false], 'Despesa das certidões lançada como reembolsável'] },
      { nome: 'Parecer de risco', descricao: 'Rascunho pela IA a partir das certidões; o advogado confere e assina.', prazoDias: 5, checklist: ['Apontamentos conferidos um a um', 'Parecer assinado e enviado ao cliente'] },
      { nome: 'Minuta do contrato', prazoDias: 5, checklist: ['Minuta elaborada', 'Minuta aprovada pelas partes'] },
      { nome: 'Assinatura do contrato', aguardando: 'Partes', prazoDias: 7, checklist: ['Contrato assinado pelas partes'] },
      { nome: 'Escritura e ITBI', aguardando: 'Cartório', prazoDias: 30, checklist: ['ITBI recolhido', 'Escritura lavrada'] },
      { nome: 'Registro na matrícula', aguardando: 'Registro de Imóveis', prazoDias: 30, checklist: ['Registro concluído', 'Matrícula atualizada salva na pasta'] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'IMOB_REGULARIZACAO_USUCAPIAO',
    nome: 'Imobiliário — regularização e usucapião',
    area: 'IMOBILIARIO',
    descricao: 'REURB, retificação, averbação e usucapião (judicial ou em cartório), com técnico parceiro.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Levantamento técnico', descricao: 'Planta, memorial descritivo e ART/RRT. Técnico definido no caso.', aguardando: 'Técnico (topógrafo/engenheiro)', prazoDias: 30, checklist: ['Técnico definido e quem paga registrado', 'Planta recebida', 'Memorial descritivo recebido', 'ART ou RRT recebida'] },
      { nome: 'Documentos e certidões do imóvel', responsavelTipo: 'ESTAGIARIO', prazoDias: 15, checklist: ['Matrícula ou transcrição', 'Certidões necessárias', ['Comprovantes de posse', false]] },
      { nome: 'Requerimento', descricao: 'Em cartório ou ação judicial, conforme o caso.', prazoDias: 10, checklist: ['Requerimento ou petição revisado'] },
      { nome: 'Protocolo', prazoDias: 3, checklist: ['Protocolado', 'Número do procedimento cadastrado'] },
      { nome: 'Exigências e confrontantes', aguardando: 'Cartório ou juízo', prazoDias: 90, checklist: ['Exigências cumpridas', ['Confrontantes notificados', false]] },
      { nome: 'Registro', aguardando: 'Registro de Imóveis', prazoDias: 60, checklist: ['Registro ou averbação concluída'] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'EMP_SOCIETARIO',
    nome: 'Empresarial — abertura e alteração de empresa',
    area: 'EMPRESARIAL',
    descricao: 'Contrato social ou alteração pelo escritório; registro pelo contador parceiro.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Documentos dos sócios', aguardando: 'Cliente', responsavelTipo: 'ESTAGIARIO', prazoDias: 7, checklist: ['Documentos pessoais dos sócios', 'Endereço da sede', 'Atividades (CNAE) definidas'] },
      { nome: 'Minuta do contrato social ou da alteração', prazoDias: 5, checklist: ['Minuta elaborada', 'Revisada pelo advogado'] },
      { nome: 'Assinatura pelos sócios', aguardando: 'Sócios', prazoDias: 7, checklist: ['Assinado por todos os sócios'] },
      { nome: 'Registro pelo contador parceiro', aguardando: 'Contador parceiro', prazoDias: 20, checklist: ['Enviado ao contador', 'Indicação registrada', 'Registro na Junta Comercial concluído'] },
      { nome: 'Arquivamento', prazoDias: 3, checklist: ['Contrato registrado e CNPJ salvos na pasta'] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'EMP_RECUPERACAO_CREDITO',
    nome: 'Empresarial — cobrança e recuperação de crédito',
    area: 'EMPRESARIAL',
    descricao: 'Poucas dívidas de valor alto: título, prescrição, via de cobrança e êxito.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(),
      { nome: 'Documentos do título', aguardando: 'Cliente', prazoDias: 5, checklist: ['Título ou contrato original', 'Demonstrativo da dívida', 'Dados do devedor'] },
      { nome: 'Prescrição e escolha da via', descricao: 'Prazo de prescrição calculado; execução, monitória, cobrança ou protesto.', prazoDias: 3, checklist: ['Prazo de prescrição calculado e cadastrado', 'Via de cobrança definida'] },
      { nome: 'Notificação ou protesto', opcional: true, prazoDias: 10, aguardando: 'Devedor', checklist: ['Notificação ou protesto realizado'] },
      { nome: 'Ação de cobrança', prazoDias: 7, checklist: ['Petição revisada'] },
      { nome: 'Protocolo', prazoDias: 2, checklist: ['Protocolada', 'Número do processo cadastrado'] },
      { nome: 'Citação, penhora ou acordo', prazoDias: 180, checklist: ['Prazos cadastrados', ['Acordo registrado no financeiro', false]] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'EMP_CONSULTORIA_MENSAL',
    nome: 'Empresarial — implantação de consultoria mensal',
    area: 'EMPRESARIAL',
    descricao: 'Contrato de mensalidade e cadastro; as demandas do mês são registradas à parte.',
    etapas: [
      TRIAGEM, CONSULTA,
      { nome: 'Contrato de consultoria', aguardando: 'Assinatura do cliente', prazoDias: 5, checklist: ['Contrato de consultoria assinado', 'Mensalidade cadastrada no Asaas', 'Papéis no processo registrados'] },
      { nome: 'Implantação', prazoDias: 7, checklist: ['Contatos da empresa cadastrados', 'Canal de demandas explicado ao cliente'] },
      { nome: 'Consultoria ativa', descricao: 'Demandas e tempo gasto registrados mensalmente.', prazoDias: 365, checklist: [['Revisão anual do valor da mensalidade', false]] },
    ],
  },
  {
    codigo: 'TRAB_EMPREGADO',
    nome: 'Trabalhista — empregado (reclamatória)',
    area: 'TRABALHISTA_EMPREGADO',
    descricao: 'Pedidos combinados; só êxito (30%); alvará com repasse ao trabalhador.',
    etapas: [
      TRIAGEM, CONSULTA, CONTRATACAO(['Declaração de hipossuficiência assinada']),
      { nome: 'Documentos do trabalhador', aguardando: 'Cliente', responsavelTipo: 'ESTAGIARIO', prazoDias: 10, checklist: ['CTPS', 'Holerites', ['Termo de rescisão (TRCT)', false], ['Extrato do FGTS', false], ['Cartão de ponto', false], ['Provas e testemunhas indicadas', false]] },
      { nome: 'Cálculo estimado dos pedidos', descricao: 'Planilha Excel; o advogado ajusta pelo chat do caso.', prazoDias: 5, checklist: ['Planilha gerada', 'Valores conferidos pelo advogado'] },
      { nome: 'Petição inicial', prazoDias: 7, checklist: ['Rascunho com valor de cada pedido', 'Revisão e aprovação do advogado'] },
      { nome: 'Protocolo', prazoDias: 2, checklist: ['Petição protocolada', 'Número do processo cadastrado'] },
      { nome: 'Audiência', descricao: 'Cliente avisado e lembretes com confirmação.', prazoDias: 120, checklist: ['Audiência cadastrada na agenda', 'Cliente confirmou presença', ['Testemunhas avisadas', false]] },
      { nome: 'Acompanhamento até sentença ou acordo', prazoDias: 365, checklist: ['Prazos cadastrados'] },
      { nome: 'Alvará e repasse ao trabalhador', responsavelTipo: 'ADMIN', prazoDias: 10, checklist: ['Alvará recebido e lançado (origem ALVARÁ)', 'Honorários de êxito retidos', 'Repasse ao cliente feito com recibo'] },
      RECEBIMENTO,
    ],
  },
  {
    codigo: 'DATIVA',
    nome: 'Advocacia dativa',
    area: 'DATIVA',
    descricao: 'Nomeação, atuação e pagamento dos honorários pelo Estado.',
    etapas: [
      { nome: 'Nomeação', prazoDias: 2, checklist: ['Nomeação registrada', 'Assistido cadastrado', 'Prazos da nomeação cadastrados'] },
      { nome: 'Atuação no processo', prazoDias: 365, checklist: ['Atos praticados registrados'] },
      { nome: 'Valor fixado pelo juiz', prazoDias: 30, checklist: ['Valor dos honorários registrado'] },
      { nome: 'Certidão de atuação', prazoDias: 15, checklist: ['Certidão emitida e salva'] },
      { nome: 'Pedido de pagamento ao Estado', responsavelTipo: 'ADMIN', prazoDias: 10, checklist: ['Pedido protocolado'] },
      { nome: 'Pagamento recebido', responsavelTipo: 'ADMIN', aguardando: 'Estado', prazoDias: 120, checklist: ['Valor recebido lançado (origem ESTADO)'] },
    ],
  },
];

/** Converte a lista curta de checklist em itens com id estável */
export function montarChecklist(itens: EtapaPadrao['checklist'] = []): ItemChecklistModelo[] {
  return itens.map((it, i) => {
    const [texto, obrigatorio] = Array.isArray(it) ? it : [it, true];
    return { id: `c${i + 1}`, texto, obrigatorio };
  });
}
