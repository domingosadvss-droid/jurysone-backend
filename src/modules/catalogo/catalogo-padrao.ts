/**
 * JURYSONE — Catálogo inicial (etapa B, 20/11/2026)
 *
 * Os 8 serviços da linha de produção (sem "Genérico" e sem "Dativa"), SEM PREÇO: o advogado
 * preenche na tela. Documentos tirados das etapas da linha de produção; perguntas da triagem e
 * respostas frequentes são uma PRIMEIRA VERSÃO redigida pelo Claude, para o advogado revisar.
 *
 * Regras que valem para todos (e que a IA do atendimento segue):
 *   • preço do catálogo é só sugestão — nunca é dito ao cliente sem confirmação do advogado;
 *   • a IA não promete resultado nem dá parecer conclusivo;
 *   • a triagem colhe fatos e documentos; a análise jurídica é do advogado.
 */
export interface ServicoPadrao {
  codigo: string;
  nome: string;
  area: string;
  descricao: string;
  modeloLinhaCodigo: string;
  tipoHonorario: 'FIXO' | 'EXITO' | 'FIXO_MAIS_EXITO' | 'MENSAL' | 'POR_ATO';
  percentualExito?: number;
  documentos: { texto: string; obrigatorio: boolean }[];
  perguntas: { pergunta: string; obrigatoria: boolean }[];
  orientacoes: string;
  faq: { pergunta: string; resposta: string }[];
  palavrasChave: string[];
}

const D = (texto: string, obrigatorio = true) => ({ texto, obrigatorio });
const P = (pergunta: string, obrigatoria = true) => ({ pergunta, obrigatoria });
const F = (pergunta: string, resposta: string) => ({ pergunta, resposta });

const FAQ_COMUM = [
  F('Quanto custa?', 'O valor depende do caso. O advogado responsável analisa as informações e confirma os honorários antes de qualquer contratação.'),
  F('Vou ganhar a causa?', 'Nenhum advogado pode garantir resultado. Depois de analisar os documentos, o advogado explica as chances e os riscos do seu caso.'),
  F('Como assino o contrato?', 'O contrato e a procuração são enviados por link para assinatura digital pelo celular. Não é preciso ir ao escritório.'),
];

export const CATALOGO_PADRAO: ServicoPadrao[] = [
  {
    codigo: 'IMOB_REVISAO_CONTRATUAL',
    nome: 'Revisão de contrato imobiliário (financiamento, imóvel na planta e distrato)',
    area: 'IMOBILIARIO',
    descricao: 'Revisão de contrato de compra de imóvel na planta, distrato com construtora ou loteadora, atraso de obra e revisão de financiamento imobiliário.',
    modeloLinhaCodigo: 'IMOB_REVISAO_CONTRATUAL',
    tipoHonorario: 'FIXO_MAIS_EXITO',
    documentos: [D('Contrato de compra e venda ou de financiamento, completo'), D('Comprovantes de pagamento (boletos, extratos ou recibos)'),
      D('Extrato do financiamento ou demonstrativo da construtora', false), D('Conversas e e-mails com a construtora ou o banco', false), D('Documento de identidade e CPF'), D('Comprovante de residência')],
    perguntas: [P('Qual é o problema com o contrato: quer desistir, a obra atrasou, as parcelas ficaram altas ou outro motivo?'),
      P('Com quem é o contrato (construtora, loteadora, banco) e em que cidade fica o imóvel?'), P('Em que data assinou o contrato e qual o valor total?'),
      P('Quanto já pagou até hoje, aproximadamente?'), P('O imóvel já foi entregue? Se não, qual era a data prometida?'),
      P('Já pediu o distrato ou recebeu alguma proposta da empresa?', false), P('Há parcelas atrasadas ou nome negativado?', false)],
    orientacoes: 'Pedir o contrato completo antes de qualquer estimativa. Nos casos de distrato, a calculadora do sistema mostra três cenários; quem escolhe é o advogado.',
    faq: [...FAQ_COMUM, F('Recebo de volta o que paguei?', 'Depende do contrato e do motivo do distrato. O advogado calcula os cenários possíveis com base nos seus pagamentos e explica cada um.')],
    palavrasChave: ['distrato', 'planta', 'construtora', 'loteadora', 'financiamento', 'atraso de obra', 'parcela', 'imóvel'],
  },
  {
    codigo: 'IMOB_LOCACAO_PROPRIETARIO',
    nome: 'Locação — despejo e cobrança de aluguéis (proprietário)',
    area: 'IMOBILIARIO',
    descricao: 'Atendimento ao proprietário: notificação do inquilino e do fiador, ação de despejo e cobrança de aluguéis, condomínio e IPTU em atraso.',
    modeloLinhaCodigo: 'IMOB_LOCACAO_PROPRIETARIO',
    tipoHonorario: 'FIXO_MAIS_EXITO',
    documentos: [D('Contrato de locação'), D('Relação dos aluguéis e encargos em atraso'), D('Dados do fiador ou da caução', false),
      D('Boletos de condomínio e IPTU em atraso', false), D('Documento de identidade e CPF do proprietário'), D('Matrícula ou documento do imóvel', false)],
    perguntas: [P('Você é o proprietário do imóvel ou administra para outra pessoa?'), P('Desde quando o inquilino está sem pagar e quantos meses estão em atraso?'),
      P('O contrato é residencial ou comercial, e tem fiador, caução ou seguro-fiança?'), P('O inquilino ainda mora no imóvel?'),
      P('Já houve alguma notificação ou conversa sobre o atraso?', false), P('Quer o imóvel de volta, receber os valores ou as duas coisas?')],
    orientacoes: 'Notificação formal por e-mail e carta com AR; mensagem de WhatsApp ao inquilino só com aprovação do advogado.',
    faq: [...FAQ_COMUM, F('Quanto tempo demora o despejo?', 'Depende do caso e da vara. Com caução, é possível pedir liminar de desocupação; o advogado explica o caminho mais rápido para a sua situação.')],
    palavrasChave: ['aluguel', 'inquilino', 'despejo', 'locação', 'fiador', 'atraso', 'proprietário'],
  },
  {
    codigo: 'IMOB_COMPRA_VENDA',
    nome: 'Compra e venda de imóvel (assessoria completa)',
    area: 'IMOBILIARIO',
    descricao: 'Pesquisa de certidões, parecer de risco, contrato, escritura, ITBI e registro na matrícula.',
    modeloLinhaCodigo: 'IMOB_COMPRA_VENDA',
    tipoHonorario: 'FIXO',
    documentos: [D('Matrícula atualizada do imóvel'), D('Documentos pessoais do comprador e do vendedor (e cônjuges)'),
      D('Proposta ou acordo de valores já combinado', false), D('Carnê ou certidão de IPTU', false)],
    perguntas: [P('Você está comprando ou vendendo?'), P('Onde fica o imóvel e qual é o número da matrícula, se souber?'),
      P('Qual o valor combinado e como será pago (à vista, financiamento, permuta)?'), P('Já assinou algum documento ou pagou sinal?'),
      P('Os vendedores são casados ou há herdeiros envolvidos?', false), P('Há prazo para fechar o negócio?', false)],
    orientacoes: 'As certidões são emitidas pelo serviço pago; o custo é reembolsável pelo cliente. O parecer de risco é rascunhado pela IA e conferido pelo advogado.',
    faq: [...FAQ_COMUM, F('Quem paga as certidões?', 'O custo das certidões é repassado ao cliente, como despesa reembolsável, com o comprovante.')],
    palavrasChave: ['compra', 'venda', 'imóvel', 'escritura', 'ITBI', 'matrícula', 'certidões'],
  },
  {
    codigo: 'IMOB_REGULARIZACAO_USUCAPIAO',
    nome: 'Regularização de imóvel e usucapião',
    area: 'IMOBILIARIO',
    descricao: 'Regularização da documentação do imóvel e usucapião, em cartório ou na Justiça, com levantamento técnico.',
    modeloLinhaCodigo: 'IMOB_REGULARIZACAO_USUCAPIAO',
    tipoHonorario: 'FIXO',
    documentos: [D('Matrícula ou transcrição do imóvel, se houver', false), D('Comprovantes de posse (contas, IPTU, contratos, fotos antigas)'),
      D('Documentos pessoais do possuidor (e cônjuge)'), D('Planta e memorial descritivo, se já tiver', false)],
    perguntas: [P('Onde fica o imóvel e há quanto tempo você está nele?'), P('Como conseguiu o imóvel (compra sem escritura, herança, posse)?'),
      P('O imóvel tem matrícula no cartório? Em nome de quem?'), P('Alguém já reclamou a posse ou há disputa com vizinhos?'),
      P('Você usa o imóvel para morar ou trabalhar?', false), P('Já tem planta ou levantamento de topógrafo?', false)],
    orientacoes: 'O técnico (topógrafo ou engenheiro) é definido no caso, com quem paga registrado. Avaliar cartório ou Justiça conforme o caso.',
    faq: [...FAQ_COMUM, F('Precisa de topógrafo?', 'Na maioria dos casos sim: a planta e o memorial descritivo são exigidos. O advogado indica o profissional e explica o custo.')],
    palavrasChave: ['usucapião', 'regularização', 'escritura', 'posse', 'matrícula', 'terreno'],
  },
  {
    codigo: 'EMP_SOCIETARIO',
    nome: 'Abertura e alteração de empresa',
    area: 'EMPRESARIAL',
    descricao: 'Contrato social, alterações, entrada e saída de sócios, com registro pelo contador parceiro.',
    modeloLinhaCodigo: 'EMP_SOCIETARIO',
    tipoHonorario: 'FIXO',
    documentos: [D('Documentos pessoais de todos os sócios'), D('Endereço da sede'), D('Contrato social atual (se for alteração)', false), D('Atividades que a empresa vai exercer')],
    perguntas: [P('É abertura de empresa nova ou alteração de uma existente?'), P('Quantos sócios e como fica a divisão de quotas?'),
      P('Quais atividades a empresa vai exercer?'), P('Já tem contador?'), P('Onde será a sede?', false)],
    orientacoes: 'O registro é feito pelo contador parceiro; registrar a indicação nos dois sentidos, sem pagamento ao contador.',
    faq: [...FAQ_COMUM],
    palavrasChave: ['empresa', 'contrato social', 'sócio', 'CNPJ', 'abertura', 'alteração'],
  },
  {
    codigo: 'EMP_RECUPERACAO_CREDITO',
    nome: 'Cobrança e recuperação de crédito',
    area: 'EMPRESARIAL',
    descricao: 'Cobrança de dívidas: notificação, protesto, execução, monitória ou ação de cobrança.',
    modeloLinhaCodigo: 'EMP_RECUPERACAO_CREDITO',
    tipoHonorario: 'FIXO_MAIS_EXITO',
    documentos: [D('Título ou contrato da dívida (nota promissória, cheque, contrato, duplicata)'), D('Demonstrativo do valor devido'),
      D('Dados do devedor (nome, CPF/CNPJ, endereço)'), D('Conversas ou acordos anteriores', false)],
    perguntas: [P('Quem deve e qual o valor aproximado?'), P('Qual o documento da dívida e a data do vencimento?'),
      P('Já tentou cobrar ou fez algum acordo?'), P('O devedor tem bens ou empresa ativa que você conheça?', false)],
    orientacoes: 'Calcular e cadastrar o prazo de prescrição logo na entrada (alerta de prescrição).',
    faq: [...FAQ_COMUM, F('A dívida pode estar prescrita?', 'Depende do documento e da data do vencimento. O advogado confere o prazo logo na análise.')],
    palavrasChave: ['cobrança', 'dívida', 'cheque', 'nota promissória', 'execução', 'protesto', 'devedor'],
  },
  {
    codigo: 'EMP_CONSULTORIA_MENSAL',
    nome: 'Consultoria jurídica mensal para empresas',
    area: 'EMPRESARIAL',
    descricao: 'Assessoria jurídica contínua, com mensalidade, registro de demandas e tempo gasto.',
    modeloLinhaCodigo: 'EMP_CONSULTORIA_MENSAL',
    tipoHonorario: 'MENSAL',
    documentos: [D('Cartão CNPJ e contrato social'), D('Contatos de quem vai falar com o escritório')],
    perguntas: [P('Qual o ramo da empresa e quantos funcionários tem?'), P('Que tipo de demanda jurídica aparece com mais frequência?'),
      P('Já tem algum processo em andamento?', false), P('Quem será o contato principal com o escritório?')],
    orientacoes: 'Mensalidade cadastrada no Asaas; demandas e tempo registrados mensalmente; revisão anual do valor.',
    faq: [...FAQ_COMUM, F('Tem limite de consultas?', 'A forma de atendimento e o que está incluído na mensalidade são definidos no contrato, conversados com o advogado.')],
    palavrasChave: ['consultoria', 'mensal', 'assessoria', 'empresa', 'jurídico'],
  },
  {
    codigo: 'TRAB_EMPREGADO',
    nome: 'Reclamação trabalhista (empregado)',
    area: 'TRABALHISTA',
    descricao: 'Ação trabalhista do empregado: verbas rescisórias, horas extras, adicionais, FGTS e outros direitos.',
    modeloLinhaCodigo: 'TRAB_EMPREGADO',
    tipoHonorario: 'EXITO',
    percentualExito: 30,
    documentos: [D('Carteira de trabalho (CTPS digital)'), D('Holerites'), D('Termo de rescisão (TRCT)', false), D('Extrato do FGTS', false),
      D('Cartão de ponto', false), D('Documento de identidade e CPF'), D('Comprovante de residência')],
    perguntas: [P('Qual o nome da empresa e em que cidade trabalhava?'), P('Data de entrada e de saída (ou ainda trabalha lá)?'),
      P('Como saiu: foi demitido, pediu demissão ou ainda está trabalhando?'), P('Qual era o salário e a função?'),
      P('Fazia horas extras? Qual era o horário de trabalho?'), P('Recebeu tudo na rescisão (férias, 13º, FGTS, multa)?'),
      P('Tem testemunhas que trabalharam com você?', false), P('Trabalhou sem carteira assinada em algum período?', false)],
    orientacoes: 'Honorários só de êxito (30%). A estimativa dos pedidos é feita pela calculadora com cenários; o advogado ajusta.',
    faq: [...FAQ_COMUM.filter((f) => f.pergunta !== 'Quanto custa?'),
      F('Quanto custa?', 'Na reclamação trabalhista os honorários costumam ser cobrados só se você ganhar, sobre o valor recebido. O advogado confirma as condições antes de você assinar.'),
      F('Tenho prazo para entrar com a ação?', 'Existe prazo legal contado da saída do emprego. Por isso é importante falar com o advogado o quanto antes.')],
    palavrasChave: ['trabalhista', 'demissão', 'rescisão', 'horas extras', 'FGTS', 'carteira', 'empregado', 'patrão'],
  },
];
