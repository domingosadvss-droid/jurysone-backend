// ============================================================
//  Domingos Advocacia – Gerador de Documentos
//  Gera: Contrato + Procuração + Decl. Hipossuficiência + Renúncia
//  Uso: node contrato.js [json_com_dados]
// ============================================================
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign,
  PageBreak, LevelFormat, Header, Footer, PageNumber,
  TabStopType, TabStopPosition
} = require('/usr/local/lib/node_modules_global/lib/node_modules/docx');
const fs = require('fs');
const path = require('path');

// ── Dados do cliente (podem ser sobrescritos via JSON externo) ──
const raw = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : {};
const D = {
  // Cliente
  clienteNome:       raw.clienteNome       || '[NOME DO CLIENTE]',
  clienteNaciona:    raw.clienteNaciona    || '[NACIONALIDADE]',
  clienteEstadoCivil:raw.clienteEstadoCivil|| '[ESTADO CIVIL]',
  clienteProfissao:  raw.clienteProfissao  || '[PROFISSÃO]',
  clienteRG:         raw.clienteRG         || '[RG]',
  clienteRGOrgao:    raw.clienteRGOrgao    || 'SSP/SC',
  clienteCPF:        raw.clienteCPF        || '[CPF]',
  clienteEndereco:   raw.clienteEndereco   || '[ENDEREÇO]',
  clienteNum:        raw.clienteNum        || '[Nº]',
  clienteCompl:      raw.clienteCompl      || '',
  clienteBairro:     raw.clienteBairro     || '[BAIRRO]',
  clienteCidade:     raw.clienteCidade     || '[CIDADE]',
  clienteEstado:     raw.clienteEstado     || 'SC',
  clienteCEP:        raw.clienteCEP        || '[CEP]',
  // Serviço
  objetoAcao:        raw.objetoAcao        || '[DESCREVER OBJETO DA AÇÃO]',
  tipoHonorario:     raw.tipoHonorario     || 'êxito',  // 'exito' | 'fixo' | 'misto'
  percHonorarios:    raw.percHonorarios    || '30',
  percPerito:        raw.percPerito        || '4,5',
  valorHonorarios:   raw.valorHonorarios   || '',
  parcelas:          raw.parcelas          || '',
  // Escritório
  cidade:            raw.cidade            || 'Balneário Camboriú',
  dataExtenso:       raw.dataExtenso       || dataPorExtenso(),
  // Renúncia
  renunciaMotivo:    raw.renunciaMotivo    || '',
  // Pessoa Jurídica (opcionais – presentes apenas quando isPJ=true)
  isPJ:              raw.isPJ             || false,
  pj_razaoSocial:    raw.pj_razaoSocial   || '',
  pj_nomeFantasia:   raw.pj_nomeFantasia  || '',
  pj_cnpj:           raw.pj_cnpj          || '',
  pj_inscEstadual:   raw.pj_inscEstadual  || '',
  pj_email:          raw.pj_email         || '',
  pj_telefone:       raw.pj_telefone      || '',
  socioNome:         raw.socioNome        || '',
  socioCPF:          raw.socioCPF         || '',
  socioRG:           raw.socioRG          || '',
  socioCargoLabel:   raw.socioCargoLabel  || 'Sócio(a)',
};

function dataPorExtenso() {
  const meses = ['janeiro','fevereiro','março','abril','maio','junho',
                 'julho','agosto','setembro','outubro','novembro','dezembro'];
  const d = new Date();
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

// ── Paleta ──────────────────────────────────────────────────────────
const AZUL  = '0F2D5E';
const CINZA = 'F1F5F9';
const BORDA = 'CBD5E1';

// ── Ajuda de endereço ────────────────────────────────────────────────
function enderecoCompleto() {
  let end = `${D.clienteEndereco}, nº ${D.clienteNum}`;
  if (D.clienteCompl) end += `, ${D.clienteCompl}`;
  end += `, bairro ${D.clienteBairro} na cidade de ${D.clienteCidade} – ${D.clienteEstado}`;
  end += `, CEP ${D.clienteCEP}`;
  return end;
}

// ── Honorários ───────────────────────────────────────────────────────
function textoHonorarios() {
  if (D.tipoHonorario === 'fixo') {
    return `honorários advocatícios no valor fixo de R$ ${D.valorHonorarios}${D.parcelas ? `, parcelados em ${D.parcelas}` : ''}.`;
  } else if (D.tipoHonorario === 'misto') {
    return `honorários advocatícios no valor de R$ ${D.valorHonorarios} (honorários fixos) mais ${D.percHonorarios}% do valor obtido em caso de êxito na ação${D.percPerito ? `, sendo que ao perito contábil será devido o percentual de ${D.percPerito}% do êxito da ação` : ''}.`;
  } else {
    return `honorários advocatícios em ${D.percHonorarios}% do valor obtido do êxito na ação${D.percPerito ? `, sendo que ao perito contábil que irá realizar o cálculo, será devido o percentual de ${D.percPerito}% do êxito da ação` : ''}.`;
  }
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS DE PARÁGRAFO
// ══════════════════════════════════════════════════════════════════════
const hr = () => new Paragraph({
  border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: AZUL, space: 1 } },
  spacing: { before: 120, after: 120 },
  children: []
});

const espaco = (antes = 160, depois = 0) => new Paragraph({
  spacing: { before: antes, after: depois },
  children: []
});

const titulo = (txt) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 360, after: 200 },
  children: [new TextRun({ text: txt, bold: true, size: 26, font: 'Arial', allCaps: true })]
});

const secao = (txt) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 280, after: 160 },
  children: [new TextRun({ text: txt, bold: true, size: 22, font: 'Arial', allCaps: true })]
});

// Parágrafo de introdução (justificado, primeira linha recuada)
const intro = (runs) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 80, after: 80 },
  indent: { firstLine: 720 },
  children: runs
});

// Cláusula numerada
const clausula = (num, titulo_txt, corpo_txt) => {
  const runs = [
    new TextRun({ text: `${num} `, bold: true, size: 22, font: 'Arial' }),
  ];
  if (titulo_txt) {
    runs.push(new TextRun({ text: titulo_txt + ' ', bold: true, size: 22, font: 'Arial' }));
  }
  if (corpo_txt) {
    runs.push(new TextRun({ text: corpo_txt, size: 22, font: 'Arial' }));
  }
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { before: 200, after: 80 },
    children: runs
  });
};

// Parágrafo de cláusula (§1º, §2º... ou Parágrafo único)
const par = (label, texto) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 120, after: 60 },
  children: [
    new TextRun({ text: `${label} `, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: texto, size: 22, font: 'Arial' })
  ]
});

// Texto simples justificado
const p = (texto, recuo = false) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 80, after: 80 },
  indent: recuo ? { firstLine: 720 } : undefined,
  children: [new TextRun({ text: texto, size: 22, font: 'Arial' })]
});

// Texto em negrito + normal inline
const pB = (partes) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 80, after: 80 },
  children: partes.map(([txt, bold]) =>
    new TextRun({ text: txt, bold: !!bold, size: 22, font: 'Arial' })
  )
});

const pBR = (partes, recuo = false) => new Paragraph({
  alignment: AlignmentType.JUSTIFIED,
  spacing: { before: 80, after: 80 },
  indent: recuo ? { firstLine: 720 } : undefined,
  children: partes.map(([txt, bold]) =>
    new TextRun({ text: txt, bold: !!bold, size: 22, font: 'Arial' })
  )
});

// Assinatura linha
const assinLinha = (label, nome, extra) => [
  espaco(320),
  new Paragraph({
    children: [new TextRun({ text: '_'.repeat(55), size: 22, font: 'Arial', color: '000000' })]
  }),
  new Paragraph({
    children: [new TextRun({ text: `${label} `, bold: true, size: 22, font: 'Arial' }),
               new TextRun({ text: nome, size: 22, font: 'Arial' })]
  }),
  ...(extra ? [new Paragraph({ children: [new TextRun({ text: extra, size: 20, font: 'Arial', color: '555555' })] })] : [])
];

// ══════════════════════════════════════════════════════════════════════
// HEADER / FOOTER
// ══════════════════════════════════════════════════════════════════════
function makeHeader() {
  return {
    default: {
      options: {
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: AZUL, space: 2 } },
            spacing: { after: 60 },
            children: [
              new TextRun({ text: 'DOMINGOS ', bold: true, size: 22, font: 'Arial', color: AZUL }),
              new TextRun({ text: 'ADVOCACIA & ASSESSORIA JURÍDICA', size: 20, font: 'Arial', color: AZUL }),
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 0 },
            children: [
              new TextRun({ text: 'R. 501, nº 145 sala 05, centro, Balneário Camboriú  |  (47) 99915-9178  |  jonathan@domingosadvocacia.com.br', size: 16, font: 'Arial', color: '555555' })
            ]
          })
        ]
      }
    }
  };
}

function makeFooter() {
  return {
    default: {
      options: {
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 2, color: AZUL, space: 2 } },
            alignment: AlignmentType.CENTER,
            spacing: { before: 60 },
            children: [
              new TextRun({ text: 'R. 501, nº 145 sala 05, centro, Balneário Camboriú  |  jonathan@domingosadvocacia.com.br  |  47 99915-9178', size: 16, font: 'Arial', color: '555555' }),
              new TextRun({ text: '        Página ', size: 16, font: 'Arial', color: '555555' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '555555' }),
            ]
          })
        ]
      }
    }
  };
}

// ══════════════════════════════════════════════════════════════════════
// SEÇÃO 1 – CONTRATO DE PRESTAÇÃO DE SERVIÇOS
// ══════════════════════════════════════════════════════════════════════
function secaoContrato() {
  const endCli = enderecoCompleto();
  return [
    titulo('CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'),
    hr(),
    espaco(120),

    // Introdução – CONTRATANTE
    pBR([
      ['Pelo presente instrumento particular, que entre si fazem, de um lado como cliente/contratante e assim doravante indicado, ', false],
      [D.clienteNome.toUpperCase(), true],
      [`, ${D.clienteNaciona}, ${D.clienteEstadoCivil}, ${D.clienteProfissao}, portador(a) do RG nº ${D.clienteRG}, ${D.clienteRGOrgao}, inscrito(a) no CPF nº ${D.clienteCPF}, com endereço na ${endCli}.`, false],
    ], true),

    espaco(120),

    // CONTRATADA
    pBR([
      ['CONTRATADA: ', true],
      ['DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA, ', true],
      ['composta por ', false],
      ['Dr. JONATHAN FRANK STOBIENIA DOMINGOS', true],
      [', brasileiro, solteiro, advogado, inscrito na OAB-SC sob nº 43.348, CPF nº 055.993.629-06, e ', false],
      ['Dra. THAMILE ALESSANDRA DOMINGOS', true],
      [', brasileira, casada, CPF nº 090.222.009-81, inscrita na OAB-SC sob nº 57.773, ambos com endereço subscrito no rodapé.', false],
    ], true),

    espaco(120),

    pBR([
      ['Por este instrumento particular, o(a) ', false],
      ['CONTRATANTE', true],
      [' e a ', false],
      ['CONTRATADA', true],
      [', têm, entre si, justo e contratado, o presente contrato de prestação de serviços profissionais de advocacia que se regerá pelos seguintes termos.', false],
    ], true),

    // ── DO OBJETO ──────────────────────────────────────────────────────
    secao('DO OBJETO'),

    clausula('CLÁUSULA 1ª:', null,
      `O Contratado compromete-se, em cumprimento ao mandato recebido, a ${D.objetoAcao}, representando o(a) contratante perante os órgãos competentes.`),

    par('Parágrafo Primeiro:',
      'As atividades inclusas na prestação de serviço, objeto deste instrumento, são todas aquelas inerentes ao exercício da advocacia, as constantes no Estatuto da Ordem dos Advogados do Brasil, bem como as especificadas no Instrumento Procuratório.'),

    par('Parágrafo Segundo:',
      'O Contratante, que reconhece já haver recebido a orientação preventiva comportamental e jurídica para a consecução dos serviços, fornecerá aos Contratados os documentos e meios necessários à comprovação processual do seu pretendido direito.'),

    // ── DOS HONORÁRIOS ─────────────────────────────────────────────────
    secao('DOS HONORÁRIOS ADVOCATÍCIOS'),

    clausula('CLÁUSULA 2ª:', null,
      `Fica acordado entre as partes que a CONTRATADA cobrará ${textoHonorarios()}`),

    par('Parágrafo Primeiro:',
      'Havendo mora no pagamento dos honorários aqui contratados, após o quinto dia de atraso, será cobrada multa de 2% sobre a prestação vencida, com acréscimo de juros moratórios de 1% ao mês, além de correção monetária pelo INPC ou qualquer índice oficial.'),

    par('Parágrafo Segundo:',
      'A CONTRATADA fica autorizada desde já a fazer a retenção de seus honorários quando do recebimento de valores diretamente em sua conta bancária, ou em caso de pagamento de acordo em seu escritório, bem como os advindos de êxito no recebimento do objeto e/ou na demanda, ainda que parcial.'),

    par('Parágrafo Terceiro:',
      'Em caso de desistência da ação ou constituição de outro advogado (com revogação dos poderes outorgados à CONTRATADA), os honorários pactuados permanecerão exigíveis na forma já estipulada, sendo que caso convencionado honorários a título de êxito, os honorários serão calculados pelo valor da causa, ou, caso publicada sentença ou acórdão, pelo valor da condenação, ou, ainda, acaso liquidado o processo, pelo valor arbitrado em sentença de liquidação.'),

    par('Parágrafo Quarto:',
      'O Contratante não poderá entabular qualquer acordo ou tratativas sem a anuência ou acompanhamento da CONTRATADA, sob pena de multa contratual no valor correspondente a 20% sobre o valor atribuído à causa, ou da transação, caso seja na esfera extrajudicial, os quais se tornam imediatamente exigíveis, independente do pagamento dos honorários advocatícios acordados.'),

    par('Parágrafo Quinto:',
      'Os honorários contratuais aqui estipulados não se confundem com os honorários de sucumbência, que pertencerão exclusivamente à CONTRATADA, sem prejuízo do pagamento dos honorários contratuais acima pactuados.'),

    par('Parágrafo Sexto:',
      'O CONTRATANTE declara ter plena e absoluta ciência de que o serviço prestado pela CONTRATADA é uma obrigação de meio, não de resultado, haja vista depender de variáveis que não são por esta controladas, não havendo direito à reparação de qualquer natureza caso aconteça deslinde diverso do que se deseja.'),

    par('Parágrafo Sétimo:',
      'A CONTRATADA obriga-se a prestar os seus serviços profissionais com todo o zelo e total diligência na defesa dos direitos e interesses do CONTRATANTE, relativamente ao objeto contratado.'),

    par('Parágrafo Oitavo:',
      'Os boletos referentes às obrigações financeiras do CONTRATANTE perante a CONTRATADA serão emitidos exclusivamente por meio da plataforma bancária ASAAS e notificados ao CONTRATANTE através do e-mail e WhatsApp devidamente cadastrados no escritório. O CONTRATANTE é responsável por manter seus dados de contato sempre atualizados, sob pena de não receber as notificações de cobrança, não podendo alegar desconhecimento dos vencimentos por falha decorrente de dados desatualizados.'),

    // ── DOS CANAIS OFICIAIS ─────────────────────────────────────────────
    secao('DOS CANAIS OFICIAIS DE ATENDIMENTO E COMUNICAÇÃO'),

    clausula('CLÁUSULA 3ª:', null,
      'Os canais oficiais de atendimento da CONTRATADA são exclusivamente: (a) WhatsApp (47) 99915-9178 e (47) 99624-9295; e (b) e-mail com domínio @domingosadvocacia.com.br.'),

    par('Parágrafo Único:',
      'O CONTRATANTE declara ter ciência de que não deve receber, aceitar ou corresponder a qualquer contato que se apresente em nome da CONTRATADA por canais ou números distintos dos indicados nesta cláusula. Caso o CONTRATANTE venha a interagir, fornecer documentos, realizar pagamentos ou tomar decisões com base em contatos feitos por canais não oficiais, assumirá exclusivamente todos os ônus, perdas e danos decorrentes de tal conduta, isentando integralmente a CONTRATADA de qualquer responsabilidade.'),

    // ── DAS DESPESAS ────────────────────────────────────────────────────
    secao('DAS DESPESAS E DO FORNECIMENTO DE DOCUMENTOS'),

    clausula('CLÁUSULA 4ª:', null,
      'Ao CONTRATANTE caberá o pagamento das custas processuais, despesas judiciais e extrajudiciais, emolumentos, tributos e demais despesas que forem necessárias ao bom andamento de processos, bem como ao pagamento/ressarcimento de despesas de viagens e deslocamentos interurbanos, e ainda, ao fornecimento de documentos e informações que a CONTRATADA solicitar, não sendo esta responsabilizada em caso do não cumprimento parcial ou integral desta cláusula.'),

    par('Parágrafo único:',
      'O CONTRATANTE deverá reembolsar todas as despesas apresentadas pela CONTRATADA que sejam relacionadas a seus processos ou procedimentos, como por exemplo: deslocamento, alimentação, cópias, guias judiciais, consulta CPF, emissão de declarações ou certidões, diligências de advogados correspondentes etc., sendo que a falta do pagamento importará na rescisão do presente contrato, nos termos das cláusulas rescisórias abaixo.'),

    // ── DA RESCISÃO ─────────────────────────────────────────────────────
    secao('DA RESCISÃO DO CONTRATO'),

    clausula('Cláusula 5ª.', null,
      'Em caso de rescisão do presente contrato por interesse do CONTRATANTE, este ficará obrigado pelo pagamento dos honorários advocatícios descritos neste contrato, ocasião em que deverá constituir novo procurador afim de salvaguardar seus direitos, isentando a CONTRATADA de toda e qualquer responsabilidade, que fica desobrigada de patrocinar a(s) demanda(s) do CONTRATANTE, ainda que os honorários pactuados estejam pagos.'),

    clausula('Cláusula 6ª.', null,
      'Em caso de inadimplemento pelo(a) CONTRATANTE, por prazo superior a 30 (trinta) dias, em qualquer pagamento, ficará a CONTRATADA isenta de qualquer obrigação, podendo rescindir o contrato e cessar a prestação de serviços, assumindo o CONTRATANTE o ônus desta conduta, para todos os efeitos legais.'),

    clausula('Cláusula 7ª.', null,
      'O presente contrato poderá ser revogado, mediante comunicação escrita por qualquer das partes com antecedência mínima de 15 (quinze) dias, mantendo-se devidos honorários até o termo da notificação, bem como multa de 20% sobre o valor total das parcelas restantes.'),

    clausula('Cláusula 8ª.', null,
      'Agindo o CONTRATANTE prejudicialmente, de forma dolosa ou culposa, em face da CONTRATADA, ou, ainda, na hipótese de prática de qualquer ato que gere desequilíbrio ou quebra de confiança na relação advogado-cliente, restará facultado a este rescindir o contrato, se exonerando de todas as obrigações, com reserva de honorários previstos na forma do presente instrumento.'),

    clausula('Cláusula 9ª.', null,
      'Caso o CONTRATANTE falte com o pagamento de honorários, taxas ou despesas pactuadas neste contrato, estará sujeito à emissão de boleto e protesto em cartório, e consequente inscrição nos órgãos de proteção ao crédito SPC e SERASA e demais sanções cabíveis arbitradas pela CONTRATADA, nos termos da lei.'),

    // ── DISPOSIÇÕES GERAIS ──────────────────────────────────────────────
    secao('DAS DISPOSIÇÕES GERAIS'),

    clausula('Cláusula 10ª.', null,
      'É obrigação do(a) CONTRATANTE informar imediatamente qualquer mudança de endereço, número de telefone, e-mail ou demais dados cadastrais, não podendo alegar qualquer responsabilidade da CONTRATADA em eventual falta de sua intimação, notificação de cobrança ou a sua não localização.'),

    clausula('Cláusula 11ª.', null,
      'O CONTRATANTE fica ciente de que acaso falte com a verdade ou omita qualquer documento ou informação, visando obter indevidamente o benefício da justiça gratuita, poderá vir a ser condenado ao pagamento de multa por litigância de má-fé, além das sanções civis e criminais, se for o caso. Fica o CONTRATANTE ciente, ainda, de que o benefício da justiça gratuita depende única e exclusivamente do livre convencimento e do entendimento do juiz/tribunal, concordando que em absolutamente nenhuma hipótese será o advogado responsabilizado pelo ônus de decisão desfavorável.'),

    clausula('Cláusula 12ª.', null,
      'O CONTRATANTE fica expressamente ciente de que o sucesso da ação depende diretamente da produção probatória e que este encargo é integralmente e intransferivelmente seu. A CONTRATADA se compromete a requisitar as provas, documentos e/ou testemunhas que se façam necessários ao sucesso da ação, restringindo-se sua atuação à orientação do(a) CONTRATANTE sobre a forma de obtenção das mesmas.'),

    clausula('Cláusula 13ª.', null,
      'A CONTRATADA não se comprometerá a diligenciar na busca de provas, documentos e/ou testemunhas, estando a parte CONTRATANTE ciente de que deverá empenhar os máximos esforços na busca dos elementos que amparem o seu pretenso direito, de modo que o atraso injustificado no fornecimento de tais informações/documentos isentará a CONTRATADA de toda e qualquer obrigação.'),

    clausula('Cláusula 14ª.', null,
      'O CONTRATANTE fica ciente de que o seu não comparecimento aos atos do processo em que seja indispensável sua presença, tais como audiências, perícias, inspeções e outros, poderá acarretar no arquivamento, extinção do processo ou na improcedência da ação, o que poderá gerar inclusive a condenação em custas processuais e/ou multa. Dessa forma, nos casos de arquivamento, extinção do processo ou improcedência da ação em que tenha o(a) CONTRATANTE dado causa por não comparecimento sem motivo justificado, serão cobrados honorários integrais nos valores e percentuais ajustados pela tabela da OAB/SC, ficando desobrigada integralmente a CONTRATADA de quaisquer deveres e obrigações.'),

    clausula('Cláusula 15ª.', null,
      'Se porventura a CONTRATADA depender do CONTRATANTE para promover algum ato extrajudicial ou judicial, e este não o corresponder tempestivamente, a responsabilidade recairá exclusivamente sobre o CONTRATANTE, não podendo argui-la em seu favor posteriormente, restando, da mesma forma, isenta a CONTRATADA de qualquer responsabilidade.'),

    clausula('Cláusula 16ª.', null,
      'Este contrato enquadra-se no rol dos títulos executivos extrajudiciais, nos termos do artigo 784, Inciso XII, do Código de Processo Civil, combinado com o artigo 24 da Lei 8.906/94 (EOAB).'),

    clausula('Cláusula 17ª.', null,
      'O CONTRATANTE autoriza o tratamento e armazenamento de seus dados digitais pela CONTRATADA, tais como documentos, mídias e informações privadas, para o exercício regular de seus direitos no processo judicial ou administrativo, objetos do presente contrato, ficando vedado para qualquer outro fim. Conforme Lei 13.709 de 2018 (Lei Geral de Proteção de Dados).'),

    clausula('Cláusula 18ª.', null,
      'Caso a parte CONTRATANTE compartilhe dados pessoais e processuais sensíveis para terceiros, sem o consentimento do titular dos dados ou da CONTRATADA de forma expressa, assumirá todos os ônus decorrentes do referido compartilhamento, conforme hipóteses previstas na LGPD.'),

    clausula('Cláusula 19ª.', null,
      'As partes reconhecem e acordam que o presente contrato poderá ser assinado eletronicamente por meio de plataforma eletrônica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei nº 13.874/2019 e do Decreto nº 10.278/2020 e acordam ainda em não contestar a sua validade, conteúdo, autenticidade e integridade.'),

    // ── DA ELEIÇÃO DO FORO ──────────────────────────────────────────────
    secao('DA ELEIÇÃO DO FORO'),

    p(`As partes acima identificadas elegem o Foro de ${D.cidade} para dirimir quaisquer divergências originárias deste contrato, e firmam-no em 02 (duas) vias iguais.`, true),

    espaco(120),

    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 80, after: 160 },
      children: [new TextRun({ text: `${D.cidade}, ${D.dataExtenso}.`, size: 22, font: 'Arial' })]
    }),

    // Assinaturas
    espaco(240),
    new Paragraph({
      children: [
        new TextRun({ text: 'CONTRATANTE: ', bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: '_'.repeat(45), size: 22, font: 'Arial' }),
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })]
    }),

    espaco(200),
    new Paragraph({
      children: [
        new TextRun({ text: 'CONTRATADO: ', bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: '_'.repeat(45), size: 22, font: 'Arial' }),
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA.', bold: true, size: 22, font: 'Arial' })]
    }),

    espaco(200),
    new Paragraph({
      children: [new TextRun({ text: 'TESTEMUNHAS:', bold: true, size: 22, font: 'Arial' })]
    }),
    espaco(200),

    // Duas testemunhas lado a lado em tabela
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [4313, 4313],
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideH: { style: BorderStyle.NONE },
        insideV: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4313, type: WidthType.DXA },
              borders: { top: {style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} },
              children: [
                new Paragraph({ children: [new TextRun({ text: '_'.repeat(38), size: 22, font: 'Arial' })] }),
                new Paragraph({ children: [new TextRun({ text: 'Nome: ', bold:true, size: 22, font: 'Arial' })] }),
                new Paragraph({ children: [new TextRun({ text: 'CPF: ', bold:true, size: 22, font: 'Arial' })] }),
              ]
            }),
            new TableCell({
              width: { size: 4313, type: WidthType.DXA },
              borders: { top: {style:BorderStyle.NONE}, bottom:{style:BorderStyle.NONE}, left:{style:BorderStyle.NONE}, right:{style:BorderStyle.NONE} },
              children: [
                new Paragraph({ children: [new TextRun({ text: '_'.repeat(38), size: 22, font: 'Arial' })] }),
                new Paragraph({ children: [new TextRun({ text: 'Nome: ', bold:true, size: 22, font: 'Arial' })] }),
                new Paragraph({ children: [new TextRun({ text: 'CPF: ', bold:true, size: 22, font: 'Arial' })] }),
              ]
            }),
          ]
        })
      ]
    }),
  ];
}

// ══════════════════════════════════════════════════════════════════════
// SEÇÃO 2 – PROCURAÇÃO AD JUDICIA ET EXTRA
// ══════════════════════════════════════════════════════════════════════
function secaoProcuracao() {
  const endCli = enderecoCompleto();
  return [
    titulo('PROCURAÇÃO'),
    hr(),
    espaco(120),

    pBR([
      ['OUTORGANTE: ', true],
      [D.clienteNome.toUpperCase(), true],
      [`, ${D.clienteNaciona}, ${D.clienteEstadoCivil}, ${D.clienteProfissao}, portador(a) do RG nº ${D.clienteRG} ${D.clienteRGOrgao} e CPF nº ${D.clienteCPF} residente e domiciliado(a) na ${endCli}.`, false],
    ], true),

    espaco(120),

    pBR([
      ['OUTORGADOS: ', true],
      ['Dr. JONATHAN FRANK STOBIENIA DOMINGOS', true],
      [', inscrito na OAB/SC sob nº 43.348 e ', false],
      ['Dra. THAMILE ALESSANDRA DOMINGOS', true],
      [', inscrita na OAB/SC nº 57.773, com endereço profissional subscrito no rodapé.', false],
    ], true),

    espaco(120),

    p('PODERES: para o foro em geral, conferindo-lhe os mais amplos e ilimitados poderes inclusive os da cláusula "ad judicia et extra", bem como os especiais constantes do art. 105, do Código de Processo Civil, para, onde com esta se apresentar, em conjunto ou separadamente, além de ordem de nomeação, propor ações e contestá-las, receber citações, notificações e intimações, apresentar justificações, variar de ações e pedidos, notificar, interpelar, protestar, discordar, transigir e desistir, receber a quantia e dar quitação, arrematar ou adjudicar em qualquer praça ou leilão, prestar compromissos de inventariante, oferecer as primeiras e últimas declarações, interpor quaisquer recursos, requerer, assinar, praticar, perante qualquer repartição pública, entidades autárquicas e ou parastatal, Juízo, Instância ou Tribunal, tudo o que julgar conveniente ou necessário ao bom e fiel desempenho deste mandato, que poderá ser substabelecido, no todo ou em parte, a quem melhor lhe convier, com ou sem reserva de poderes. Finalidade específica: ' + D.objetoAcao + '.', true),

    espaco(120),

    pBR([
      ['Os poderes específicos acima outorgados ', false],
      ['poderão ', true],
      ['ser substabelecidos.', false],
    ], true),

    espaco(120),

    p('As partes reconhecem e acordam que o presente documento poderá ser assinado eletronicamente por meio de plataforma eletrônica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei nº 13.874/2019 e do Decreto nº 10.278/2020 e acordam ainda em não contestar a sua validade, conteúdo, autenticidade e integridade.', true),

    espaco(160),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 80, after: 160 },
      children: [new TextRun({ text: `${D.cidade}, ${D.dataExtenso}.`, size: 22, font: 'Arial' })]
    }),

    espaco(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '_'.repeat(50), size: 22, font: 'Arial' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })]
    }),
  ];
}

// ══════════════════════════════════════════════════════════════════════
// SEÇÃO 3 – DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA
// ══════════════════════════════════════════════════════════════════════
function secaoHipossuficiencia() {
  return [
    titulo('DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA'),
    secao('(Para fins de concessão do benefício de Assistência Judiciária Gratuita – Art. 99, § 3º, CPC)'),
    hr(),
    espaco(120),

    pBR([
      ['Eu, ', false],
      [D.clienteNome.toUpperCase(), true],
      [`, ${D.clienteNaciona}, ${D.clienteEstadoCivil}, ${D.clienteProfissao}, portador(a) do RG nº ${D.clienteRG} ${D.clienteRGOrgao} e inscrito(a) no CPF nº ${D.clienteCPF}, residente e domiciliado(a) na ${enderecoCompleto()}, na qualidade de parte no processo judicial em andamento ou a ser proposto pelo escritório `, false],
      ['DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA', true],
      [', DECLARO, sob as penas da lei, o que segue:', false],
    ], true),

    espaco(120),

    p('1. Que não possuo condições financeiras de arcar com as custas do processo e honorários advocatícios sem prejuízo do sustento próprio ou de minha família, razão pela qual requer a concessão do benefício da Assistência Judiciária Gratuita, nos termos do art. 98 e seguintes do Código de Processo Civil e da Lei nº 1.060/50.', false),

    p('2. Que minha renda mensal é insuficiente para custear as despesas processuais, conforme declarado a seguir:', false),

    espaco(80),

    // Tabela de renda
    new Table({
      width: { size: 9026, type: WidthType.DXA },
      columnWidths: [4513, 4513],
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Renda mensal bruta:', bold: true, size: 22, font: 'Arial' })] })]
            }),
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'R$ ________________________________', size: 22, font: 'Arial' })] })]
            }),
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Número de dependentes:', bold: true, size: 22, font: 'Arial' })] })]
            }),
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: '____', size: 22, font: 'Arial' })] })]
            }),
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              shading: { fill: 'D5E8F0', type: ShadingType.CLEAR },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'Despesas mensais aproximadas:', bold: true, size: 22, font: 'Arial' })] })]
            }),
            new TableCell({
              width: { size: 4513, type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: 'R$ ________________________________', size: 22, font: 'Arial' })] })]
            }),
          ]
        }),
      ]
    }),

    espaco(120),

    p('3. Que estou ciente de que a falsidade desta declaração configura crime de falsidade ideológica (art. 299 do Código Penal), sujeito às penalidades previstas em lei, bem como ao pagamento das custas em dobro (art. 100 do CPC).', false),

    p('4. Que caso minha situação financeira se altere de forma significativa, comprometendo-me a informar imediatamente ao(à) advogado(a) responsável, para que seja avaliada a manutenção ou revogação do benefício.', false),

    espaco(160),

    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 80, after: 160 },
      children: [new TextRun({ text: `${D.cidade}, ${D.dataExtenso}.`, size: 22, font: 'Arial' })]
    }),

    espaco(240),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: '_'.repeat(50), size: 22, font: 'Arial' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `CPF: ${D.clienteCPF}`, size: 20, font: 'Arial', color: '555555' })]
    }),
  ];
}

// ══════════════════════════════════════════════════════════════════════
// SEÇÃO 4 – CARTA DE RENÚNCIA DE MANDATO
// ══════════════════════════════════════════════════════════════════════
function secaoRenuncia() {
  // Abertura: difere para PF e PJ
  const aberturaRuns = D.isPJ ? [
    new TextRun({ text: 'Prezada empresa ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.pj_razaoSocial, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: ', inscrita no CNPJ nº ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.pj_cnpj, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: ', neste ato representada por seu(sua) ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.socioCargoLabel + ' ' + D.socioNome, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: ', portador(a) do CPF nº ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.socioCPF, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: '.', size: 22, font: 'Arial' }),
  ] : [
    new TextRun({ text: 'Prezado senhor(a) ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.clienteNome, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: ',', size: 22, font: 'Arial' }),
    new TextRun({ text: '\nportador(a) do RG nº ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.clienteRG, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: ' e CPF nº ', size: 22, font: 'Arial' }),
    new TextRun({ text: D.clienteCPF, bold: true, size: 22, font: 'Arial' }),
    new TextRun({ text: '.', size: 22, font: 'Arial' }),
  ];

  // Nome para canhoto de recebimento
  const assinNome = D.isPJ
    ? D.pj_razaoSocial.toUpperCase() + ' / ' + D.socioNome + ' (' + D.socioCargoLabel + ')'
    : D.clienteNome.toUpperCase();

  return [
    titulo('CARTA DE RENÚNCIA DE MANDATO'),
    hr(),
    espaco(120),

    // Abertura
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 160 },
      indent: { firstLine: 720 },
      children: aberturaRuns,
    }),

    // Corpo principal
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 160 },
      indent: { firstLine: 720 },
      children: [
        new TextRun({ text: 'Serve a presente, para notificar de que o subscritor desta ', size: 22, font: 'Arial' }),
        new TextRun({ text: 'RENUNCIA AO MANDATO QUE LHE FOI OUTORGADO POR PROCURAÇÃO AD JUDICIA OS ADVOGADOS DR. JONATHAN FRANK STOBIENIA DOMINGOS OAB/SC 43.348 E THAMILE ALESSANDRA DOMINGOS OAB/SC 57.773', bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: ', como já foi devidamente notificado via WhatsApp no dia ', size: 22, font: 'Arial' }),
        new TextRun({ text: D.dataExtenso, bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: ', fica notificado da renúncia acima expressa, sendo certo que senhor(a) têm, a partir do recebimento desta, o prazo legal de ', size: 22, font: 'Arial' }),
        new TextRun({ text: '10 (dez) dias', bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: ', para, nos termos do art. 45 do CPC, para contratar novo patrono para o referido processo assinando ao final o canhoto do recebimento.', size: 22, font: 'Arial' }),
      ],
    }),

    // Atenciosamente
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 80 },
      indent: { firstLine: 720 },
      children: [new TextRun({ text: 'Atenciosamente Jonathan Domingos OAB/SC 43.348.', size: 22, font: 'Arial' })],
    }),

    espaco(240),

    // Data
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 80, after: 80 },
      children: [new TextRun({ text: 'Balneário Camboriú, ___ de _________ de ____', size: 22, font: 'Arial' })],
    }),

    espaco(400),

    // Assinatura dos advogados (linha centralizada)
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } },
      spacing: { before: 80, after: 40 },
      children: [
        new TextRun({ text: 'Dr. Jonathan Frank Stobienia Domingos / Thamile Alessandra Domingos', size: 22, font: 'Arial' }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 200 },
      children: [
        new TextRun({ text: 'OAB/SC 43.348', size: 20, font: 'Arial' }),
        new TextRun({ text: '                              ', size: 20, font: 'Arial' }),
        new TextRun({ text: 'OAB/SC 57.773', size: 20, font: 'Arial' }),
      ],
    }),

    espaco(240),

    // Canhoto de recebimento
    new Paragraph({
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: 'ASSINATURA DE RECEBIMENTO', bold: true, allCaps: true, size: 22, font: 'Arial' })],
    }),
    espaco(280),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } },
      spacing: { before: 80, after: 40 },
      children: [new TextRun({ text: assinNome, bold: true, size: 22, font: 'Arial' })],
    }),
  ];
}

// ══════════════════════════════════════════════════════════════════════
// MONTAR DOCUMENTO
// ══════════════════════════════════════════════════════════════════════
function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

const pageProps = {
  size: { width: 11906, height: 16838 },  // A4
  margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },  // 3cm esq, 2cm resto
};

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: 'Arial', size: 22 }
      }
    }
  },
  sections: [
    // Seção 1 – Contrato
    {
      properties: { page: pageProps },
      headers: makeHeader(),
      footers: makeFooter(),
      children: secaoContrato(),
    },
    // Seção 2 – Procuração
    {
      properties: { page: pageProps },
      headers: makeHeader(),
      footers: makeFooter(),
      children: secaoProcuracao(),
    },
    // Seção 3 – Declaração
    {
      properties: { page: pageProps },
      headers: makeHeader(),
      footers: makeFooter(),
      children: secaoHipossuficiencia(),
    },
    // Seção 4 – Renúncia
    {
      properties: { page: pageProps },
      headers: makeHeader(),
      footers: makeFooter(),
      children: secaoRenuncia(),
    },
  ]
});

const outDir = process.env.OUT_DIR || path.join(__dirname, 'mnt/jurysone/app-preview');
const outFile = path.join(outDir, 'Domingos_Advocacia_Documentos.docx');

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync(outFile, buffer);
  console.log('OK – ' + outFile);
}).catch(err => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
