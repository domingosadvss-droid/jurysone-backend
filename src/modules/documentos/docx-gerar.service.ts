/**
 * Gera documentos jurídicos em .docx preenchidos com dados do cliente.
 * Portado de public/contrato.js — mesma lógica, mesma formatação.
 */
import { Injectable } from '@nestjs/common';
import * as fs   from 'fs';
import * as path from 'path';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType, ShadingType,
  Header, Footer, PageNumber, ImageRun,
} from 'docx';

export interface DadosCliente {
  isPJ?:              boolean;
  clienteNome:        string;
  clienteNaciona?:    string;
  clienteEstadoCivil?:string;
  clienteProfissao?:  string;
  clienteRG?:         string;
  clienteRGOrgao?:    string;
  clienteCPF?:        string;
  clienteRua?:        string;
  clienteEndereco?:   string;
  clienteNum?:        string;
  clienteCompl?:      string;
  clienteBairro?:     string;
  clienteCidade?:     string;
  clienteEstado?:     string;
  clienteCEP?:        string;
  objetoAcao?:        string;
  tipoHonorario?:     string;
  percHonorarios?:    string;
  percPerito?:        string;
  valorHonorarios?:   string;
  parcelas?:          string;
  cidade?:            string;
  dataExtenso?:       string;
  renunciaMotivo?:    string;
  pj_razaoSocial?:   string;
  pj_nomeFantasia?:  string;
  pj_cnpj?:          string;
  pj_inscEstadual?:  string;
  pj_email?:         string;
  pj_telefone?:      string;
  socioNome?:        string;
  socioCPF?:         string;
  socioRG?:          string;
  socioCargoLabel?:  string;
}

@Injectable()
export class DocxGerarService {

  private readonly AZUL = '0F2D5E';

  // ── helpers de parágrafo ──────────────────────────────────────────────

  private hr() {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: this.AZUL, space: 1 } },
      spacing: { before: 120, after: 120 },
      children: [],
    });
  }

  private espaco(antes = 160) {
    return new Paragraph({ spacing: { before: antes, after: 0 }, children: [] });
  }

  private titulo(txt: string) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 360, after: 200 },
      children: [new TextRun({ text: txt, bold: true, size: 26, font: 'Arial', allCaps: true })],
    });
  }

  private secao(txt: string) {
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 280, after: 160 },
      children: [new TextRun({ text: txt, bold: true, size: 22, font: 'Arial', allCaps: true })],
    });
  }

  private pBR(partes: [string, boolean][], recuo = false) {
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 80 },
      indent: recuo ? { firstLine: 720 } : undefined,
      children: partes.map(([txt, bold]) =>
        new TextRun({ text: txt, bold, size: 22, font: 'Arial' }),
      ),
    });
  }

  private p(texto: string, recuo = false) {
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 80, after: 80 },
      indent: recuo ? { firstLine: 720 } : undefined,
      children: [new TextRun({ text: texto, size: 22, font: 'Arial' })],
    });
  }

  private clausula(num: string, tituloCl: string | null, corpo: string) {
    const runs: TextRun[] = [new TextRun({ text: `${num} `, bold: true, size: 22, font: 'Arial' })];
    if (tituloCl) runs.push(new TextRun({ text: tituloCl + ' ', bold: true, size: 22, font: 'Arial' }));
    if (corpo)    runs.push(new TextRun({ text: corpo, size: 22, font: 'Arial' }));
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 200, after: 80 },
      children: runs,
    });
  }

  private par(label: string, texto: string) {
    return new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { before: 120, after: 60 },
      children: [
        new TextRun({ text: `${label} `, bold: true, size: 22, font: 'Arial' }),
        new TextRun({ text: texto, size: 22, font: 'Arial' }),
      ],
    });
  }

  // ── Header / Footer ───────────────────────────────────────────────────

  private makeHeader() {
    const logoPath = path.join(process.cwd(), 'public', 'logo-domingos.png');
    let logoBuffer: Buffer | null = null;
    try { logoBuffer = fs.readFileSync(logoPath); } catch { /* fallback texto */ }

    const headerChildren = logoBuffer
      ? [new ImageRun({ data: logoBuffer, transformation: { width: 200, height: 67 }, type: 'png' } as any)]
      : [
          new TextRun({ text: 'DOMINGOS ', bold: true, size: 22, font: 'Arial', color: this.AZUL }),
          new TextRun({ text: 'ADVOCACIA & ASSESSORIA JURÍDICA', size: 20, font: 'Arial', color: this.AZUL }),
        ];

    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: this.AZUL, space: 2 } },
          spacing: { after: 60 },
          children: headerChildren,
        }),
      ],
    });
  }

  private makeFooter() {
    return new Footer({
      children: [
        new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 2, color: this.AZUL, space: 2 } },
          alignment: AlignmentType.CENTER,
          spacing: { before: 60 },
          children: [
            new TextRun({ text: 'R. 501, nº 145 sala 05, centro, Balneário Camboriú  |  jonathan@domingosadvocacia.com.br  |  47 99915-9178  |  Página ', size: 16, font: 'Arial', color: '555555' }),
            new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '555555' }),
          ],
        }),
      ],
    });
  }

  // ── Helpers de dados ──────────────────────────────────────────────────

  private dataPorExtenso() {
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const d = new Date();
    return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
  }

  private enderecoCompleto(D: DadosCliente) {
    const rua = D.clienteRua || D.clienteEndereco || '[ENDEREÇO]';
    let end = `${rua}, nº ${D.clienteNum || '[Nº]'}`;
    if (D.clienteCompl) end += `, ${D.clienteCompl}`;
    end += `, bairro ${D.clienteBairro || '[BAIRRO]'} na cidade de ${D.clienteCidade || '[CIDADE]'} – ${D.clienteEstado || 'SC'}`;
    end += `, CEP ${D.clienteCEP || '[CEP]'}`;
    return end;
  }

  private textoHonorarios(D: DadosCliente) {
    const tipo = D.tipoHonorario || 'exito';
    if (tipo === 'fixo') {
      return `honorários advocatícios no valor fixo de R$ ${D.valorHonorarios || ''}${D.parcelas ? `, parcelados em ${D.parcelas}` : ''}.`;
    } else if (tipo === 'misto') {
      return `honorários advocatícios no valor de R$ ${D.valorHonorarios || ''} (honorários fixos) mais ${D.percHonorarios || '30'}% do valor obtido em caso de êxito na ação${D.percPerito ? `, sendo que ao perito contábil será devido o percentual de ${D.percPerito}% do êxito da ação` : ''}.`;
    } else {
      return `honorários advocatícios em ${D.percHonorarios || '30'}% do valor obtido do êxito na ação${D.percPerito ? `, sendo que ao perito contábil que irá realizar o cálculo, será devido o percentual de ${D.percPerito}% do êxito da ação` : ''}.`;
    }
  }

  // ── Seções dos documentos ─────────────────────────────────────────────

  private secaoContrato(D: DadosCliente): Paragraph[] {
    const endCli = this.enderecoCompleto(D);
    const cidade  = D.cidade || 'Balneário Camboriú';
    const data    = D.dataExtenso || this.dataPorExtenso();

    return [
      this.titulo('CONTRATO DE PRESTAÇÃO DE SERVIÇOS ADVOCATÍCIOS'),
      this.hr(),
      this.espaco(120),
      this.pBR([
        ['Pelo presente instrumento particular, que entre si fazem, de um lado como cliente/contratante e assim doravante indicado, ', false],
        [D.clienteNome.toUpperCase(), true],
        [`, ${D.clienteNaciona || 'brasileiro(a)'}, ${D.clienteEstadoCivil || ''}, ${D.clienteProfissao || ''}, portador(a) do RG nº ${D.clienteRG || ''} ${D.clienteRGOrgao || 'SSP/SC'}, inscrito(a) no CPF nº ${D.clienteCPF || ''}, com endereço na ${endCli}.`, false],
      ], true),
      this.espaco(120),
      this.pBR([
        ['CONTRATADA: ', true],
        ['DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA, ', true],
        ['composta por ', false],
        ['Dr. JONATHAN FRANK STOBIENIA DOMINGOS', true],
        [', brasileiro, solteiro, advogado, inscrito na OAB-SC sob nº 43.348, CPF nº 055.993.629-06, e ', false],
        ['Dra. THAMILE ALESSANDRA DOMINGOS', true],
        [', brasileira, casada, CPF nº 090.222.009-81, inscrita na OAB-SC sob nº 57.773, ambos com endereço subscrito no rodapé.', false],
      ], true),
      this.espaco(120),
      this.pBR([
        ['Por este instrumento particular, o(a) ', false],
        ['CONTRATANTE', true],
        [' e a ', false],
        ['CONTRATADA', true],
        [', têm, entre si, justo e contratado, o presente contrato de prestação de serviços profissionais de advocacia que se regerá pelos seguintes termos.', false],
      ], true),
      this.secao('DO OBJETO'),
      this.clausula('CLÁUSULA 1ª:', null, `O Contratado compromete-se, em cumprimento ao mandato recebido, a ${D.objetoAcao || '[OBJETO DA AÇÃO]'}, representando o(a) contratante perante os órgãos competentes.`),
      this.par('Parágrafo Primeiro:', 'As atividades inclusas na prestação de serviço, objeto deste instrumento, são todas aquelas inerentes ao exercício da advocacia, as constantes no Estatuto da Ordem dos Advogados do Brasil, bem como as especificadas no Instrumento Procuratório.'),
      this.par('Parágrafo Segundo:', 'O Contratante, que reconhece já haver recebido a orientação preventiva comportamental e jurídica para a consecução dos serviços, fornecerá aos Contratados os documentos e meios necessários à comprovação processual do seu pretendido direito.'),
      this.secao('DOS HONORÁRIOS ADVOCATÍCIOS'),
      this.clausula('CLÁUSULA 2ª:', null, `Fica acordado entre as partes que a CONTRATADA cobrará ${this.textoHonorarios(D)}`),
      this.par('Parágrafo Primeiro:', 'Havendo mora no pagamento dos honorários aqui contratados, após o quinto dia de atraso, será cobrada multa de 2% sobre a prestação vencida, com acréscimo de juros moratórios de 1% ao mês, além de correção monetária pelo INPC ou qualquer índice oficial.'),
      this.par('Parágrafo Segundo:', 'A CONTRATADA fica autorizada desde já a fazer a retenção de seus honorários quando do recebimento de valores diretamente em sua conta bancária, ou em caso de pagamento de acordo em seu escritório, bem como os advindos de êxito no recebimento do objeto e/ou na demanda, ainda que parcial.'),
      this.par('Parágrafo Terceiro:', 'Em caso de desistência da ação ou constituição de outro advogado (com revogação dos poderes outorgados à CONTRATADA), os honorários pactuados permanecerão exigíveis na forma já estipulada, sendo que caso convencionado honorários a título de êxito, os honorários serão calculados pelo valor da causa, ou, caso publicada sentença ou acórdão, pelo valor da condenação, ou, ainda, acaso liquidado o processo, pelo valor arbitrado em sentença de liquidação.'),
      this.par('Parágrafo Quarto:', 'O Contratante não poderá entabular qualquer acordo ou tratativas sem a anuência ou acompanhamento da CONTRATADA, sob pena de multa contratual no valor correspondente a 20% sobre o valor atribuído à causa, ou da transação, caso seja na esfera extrajudicial, os quais se tornam imediatamente exigíveis, independente do pagamento dos honorários advocatícios acordados.'),
      this.par('Parágrafo Quinto:', 'Os honorários contratuais aqui estipulados não se confundem com os honorários de sucumbência, que pertencerão exclusivamente à CONTRATADA, sem prejuízo do pagamento dos honorários contratuais acima pactuados.'),
      this.par('Parágrafo Sexto:', 'O CONTRATANTE declara ter plena e absoluta ciência de que o serviço prestado pela CONTRATADA é uma obrigação de meio, não de resultado, haja vista depender de variáveis que não são por esta controladas, não havendo direito à reparação de qualquer natureza caso aconteça deslinde diverso do que se deseja.'),
      this.par('Parágrafo Sétimo:', 'A CONTRATADA obriga-se a prestar os seus serviços profissionais com todo o zelo e total diligência na defesa dos direitos e interesses do CONTRATANTE, relativamente ao objeto contratado.'),
      this.par('Parágrafo Oitavo:', 'Os boletos referentes às obrigações financeiras do CONTRATANTE perante a CONTRATADA serão emitidos exclusivamente por meio da plataforma bancária ASAAS e notificados ao CONTRATANTE através do e-mail e WhatsApp devidamente cadastrados no escritório. O CONTRATANTE é responsável por manter seus dados de contato sempre atualizados, sob pena de não receber as notificações de cobrança, não podendo alegar desconhecimento dos vencimentos por falha decorrente de dados desatualizados.'),
      this.secao('DOS CANAIS OFICIAIS DE ATENDIMENTO E COMUNICAÇÃO'),
      this.clausula('CLÁUSULA 3ª:', null, 'Os canais oficiais de atendimento da CONTRATADA são exclusivamente: (a) WhatsApp (47) 99915-9178 e (47) 99624-9295; e (b) e-mail com domínio @domingosadvocacia.com.br.'),
      this.par('Parágrafo Único:', 'O CONTRATANTE declara ter ciência de que não deve receber, aceitar ou corresponder a qualquer contato que se apresente em nome da CONTRATADA por canais ou números distintos dos indicados nesta cláusula. Caso o CONTRATANTE venha a interagir, fornecer documentos, realizar pagamentos ou tomar decisões com base em contatos feitos por canais não oficiais, assumirá exclusivamente todos os ônus, perdas e danos decorrentes de tal conduta, isentando integralmente a CONTRATADA de qualquer responsabilidade.'),
      this.secao('DAS DESPESAS E DO FORNECIMENTO DE DOCUMENTOS'),
      this.clausula('CLÁUSULA 4ª:', null, 'Ao CONTRATANTE caberá o pagamento das custas processuais, despesas judiciais e extrajudiciais, emolumentos, tributos e demais despesas que forem necessárias ao bom andamento de processos, bem como ao pagamento/ressarcimento de despesas de viagens e deslocamentos interurbanos, e ainda, ao fornecimento de documentos e informações que a CONTRATADA solicitar, não sendo esta responsabilizada em caso do não cumprimento parcial ou integral desta cláusula.'),
      this.par('Parágrafo único:', 'O CONTRATANTE deverá reembolsar todas as despesas apresentadas pela CONTRATADA que sejam relacionadas a seus processos ou procedimentos, como por exemplo: deslocamento, alimentação, cópias, guias judiciais, consulta CPF, emissão de declarações ou certidões, diligências de advogados correspondentes etc., sendo que a falta do pagamento importará na rescisão do presente contrato, nos termos das cláusulas rescisórias abaixo.'),
      this.secao('DA RESCISÃO DO CONTRATO'),
      this.clausula('Cláusula 5ª.', null, 'Em caso de rescisão do presente contrato por interesse do CONTRATANTE, este ficará obrigado pelo pagamento dos honorários advocatícios descritos neste contrato, ocasião em que deverá constituir novo procurador afim de salvaguardar seus direitos, isentando a CONTRATADA de toda e qualquer responsabilidade, que fica desobrigada de patrocinar a(s) demanda(s) do CONTRATANTE, ainda que os honorários pactuados estejam pagos.'),
      this.clausula('Cláusula 6ª.', null, 'Em caso de inadimplemento pelo(a) CONTRATANTE, por prazo superior a 30 (trinta) dias, em qualquer pagamento, ficará a CONTRATADA isenta de qualquer obrigação, podendo rescindir o contrato e cessar a prestação de serviços, assumindo o CONTRATANTE o ônus desta conduta, para todos os efeitos legais.'),
      this.clausula('Cláusula 7ª.', null, 'O presente contrato poderá ser revogado, mediante comunicação escrita por qualquer das partes com antecedência mínima de 15 (quinze) dias, mantendo-se devidos honorários até o termo da notificação, bem como multa de 20% sobre o valor total das parcelas restantes.'),
      this.clausula('Cláusula 8ª.', null, 'Agindo o CONTRATANTE prejudicialmente, de forma dolosa ou culposa, em face da CONTRATADA, ou, ainda, na hipótese de prática de qualquer ato que gere desequilíbrio ou quebra de confiança na relação advogado-cliente, restará facultado a este rescindir o contrato, se exonerando de todas as obrigações, com reserva de honorários previstos na forma do presente instrumento.'),
      this.clausula('Cláusula 9ª.', null, 'Caso o CONTRATANTE falte com o pagamento de honorários, taxas ou despesas pactuadas neste contrato, estará sujeito à emissão de boleto e protesto em cartório, e consequente inscrição nos órgãos de proteção ao crédito SPC e SERASA e demais sanções cabíveis arbitradas pela CONTRATADA, nos termos da lei.'),
      this.secao('DAS DISPOSIÇÕES GERAIS'),
      this.clausula('Cláusula 10ª.', null, 'É obrigação do(a) CONTRATANTE informar imediatamente qualquer mudança de endereço, número de telefone, e-mail ou demais dados cadastrais, não podendo alegar qualquer responsabilidade da CONTRATADA em eventual falta de sua intimação, notificação de cobrança ou a sua não localização.'),
      this.clausula('Cláusula 11ª.', null, 'O CONTRATANTE fica ciente de que acaso falte com a verdade ou omita qualquer documento ou informação, visando obter indevidamente o benefício da justiça gratuita, poderá vir a ser condenado ao pagamento de multa por litigância de má-fé, além das sanções civis e criminais, se for o caso. Fica o CONTRATANTE ciente, ainda, de que o benefício da justiça gratuita depende única e exclusivamente do livre convencimento e do entendimento do juiz/tribunal, concordando que em absolutamente nenhuma hipótese será o advogado responsabilizado pelo ônus de decisão desfavorável.'),
      this.clausula('Cláusula 12ª.', null, 'O CONTRATANTE fica expressamente ciente de que o sucesso da ação depende diretamente da produção probatória e que este encargo é integralmente e intransferivelmente seu. A CONTRATADA se compromete a requisitar as provas, documentos e/ou testemunhas que se façam necessários ao sucesso da ação, restringindo-se sua atuação à orientação do(a) CONTRATANTE sobre a forma de obtenção das mesmas.'),
      this.clausula('Cláusula 13ª.', null, 'A CONTRATADA não se comprometerá a diligenciar na busca de provas, documentos e/ou testemunhas, estando a parte CONTRATANTE ciente de que deverá empenhar os máximos esforços na busca dos elementos que amparem o seu pretenso direito, de modo que o atraso injustificado no fornecimento de tais informações/documentos isentará a CONTRATADA de toda e qualquer obrigação.'),
      this.clausula('Cláusula 14ª.', null, 'O CONTRATANTE fica ciente de que o seu não comparecimento aos atos do processo em que seja indispensável sua presença, tais como audiências, perícias, inspeções e outros, poderá acarretar no arquivamento, extinção do processo ou na improcedência da ação, o que poderá gerar inclusive a condenação em custas processuais e/ou multa. Dessa forma, nos casos de arquivamento, extinção do processo ou improcedência da ação em que tenha o(a) CONTRATANTE dado causa por não comparecimento sem motivo justificado, serão cobrados honorários integrais nos valores e percentuais ajustados pela tabela da OAB/SC, ficando desobrigada integralmente a CONTRATADA de quaisquer deveres e obrigações.'),
      this.clausula('Cláusula 15ª.', null, 'Se porventura a CONTRATADA depender do CONTRATANTE para promover algum ato extrajudicial ou judicial, e este não o corresponder tempestivamente, a responsabilidade recairá exclusivamente sobre o CONTRATANTE, não podendo argui-la em seu favor posteriormente, restando, da mesma forma, isenta a CONTRATADA de qualquer responsabilidade.'),
      this.clausula('Cláusula 16ª.', null, 'Este contrato enquadra-se no rol dos títulos executivos extrajudiciais, nos termos do artigo 784, Inciso XII, do Código de Processo Civil, combinado com o artigo 24 da Lei 8.906/94 (EOAB).'),
      this.clausula('Cláusula 17ª.', null, 'O CONTRATANTE autoriza o tratamento e armazenamento de seus dados digitais pela CONTRATADA, tais como documentos, mídias e informações privadas, para o exercício regular de seus direitos no processo judicial ou administrativo, objetos do presente contrato, ficando vedado para qualquer outro fim. Conforme Lei 13.709 de 2018 (Lei Geral de Proteção de Dados).'),
      this.clausula('Cláusula 18ª.', null, 'Caso a parte CONTRATANTE compartilhe dados pessoais e processuais sensíveis para terceiros, sem o consentimento do titular dos dados ou da CONTRATADA de forma expressa, assumirá todos os ônus decorrentes do referido compartilhamento, conforme hipóteses previstas na LGPD.'),
      this.clausula('Cláusula 19ª.', null, 'As partes reconhecem e acordam que o presente contrato poderá ser assinado eletronicamente por meio de plataforma eletrônica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei nº 13.874/2019 e do Decreto nº 10.278/2020 e acordam ainda em não contestar a sua validade, conteúdo, autenticidade e integridade.'),
      this.secao('DA ELEIÇÃO DO FORO'),
      this.p(`As partes acima identificadas elegem o Foro de ${cidade} para dirimir quaisquer divergências originárias deste contrato, e firmam-no em 02 (duas) vias iguais.`, true),
      this.espaco(120),
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 80, after: 160 },
        children: [new TextRun({ text: `${cidade}, ${data}.`, size: 22, font: 'Arial' })],
      }),
      this.espaco(240),
      new Paragraph({ children: [new TextRun({ text: '{{~position_sign_cliente}}', size: 8, font: 'Arial', color: 'AAAAAA' })] }),
      new Paragraph({
        children: [
          new TextRun({ text: 'CONTRATANTE: ', bold: true, size: 22, font: 'Arial' }),
          new TextRun({ text: '_'.repeat(45), size: 22, font: 'Arial' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })],
      }),
      this.espaco(200),
      new Paragraph({
        children: [
          new TextRun({ text: 'CONTRATADO: ', bold: true, size: 22, font: 'Arial' }),
          new TextRun({ text: '_'.repeat(45), size: 22, font: 'Arial' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: 'DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA.', bold: true, size: 22, font: 'Arial' })],
      }),
      this.espaco(200),
      new Paragraph({ children: [new TextRun({ text: 'TESTEMUNHAS:', bold: true, size: 22, font: 'Arial' })] }),
      this.espaco(200),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [4313, 4313],
        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 4313, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: '_'.repeat(38), size: 22, font: 'Arial' })] }), new Paragraph({ children: [new TextRun({ text: 'Nome: ', bold: true, size: 22, font: 'Arial' })] }), new Paragraph({ children: [new TextRun({ text: 'CPF: ', bold: true, size: 22, font: 'Arial' })] })] }),
              new TableCell({ width: { size: 4313, type: WidthType.DXA }, borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: '_'.repeat(38), size: 22, font: 'Arial' })] }), new Paragraph({ children: [new TextRun({ text: 'Nome: ', bold: true, size: 22, font: 'Arial' })] }), new Paragraph({ children: [new TextRun({ text: 'CPF: ', bold: true, size: 22, font: 'Arial' })] })] }),
            ],
          }),
        ],
      }) as any,
    ] as any;
  }

  private secaoProcuracao(D: DadosCliente): Paragraph[] {
    const endCli = this.enderecoCompleto(D);
    const cidade  = D.cidade || 'Balneário Camboriú';
    const data    = D.dataExtenso || this.dataPorExtenso();

    return [
      this.titulo('PROCURAÇÃO'),
      this.hr(),
      this.espaco(120),
      this.pBR([
        ['OUTORGANTE: ', true],
        [D.clienteNome.toUpperCase(), true],
        [`, ${D.clienteNaciona || 'brasileiro(a)'}, ${D.clienteEstadoCivil || ''}, ${D.clienteProfissao || ''}, portador(a) do RG nº ${D.clienteRG || ''} ${D.clienteRGOrgao || 'SSP/SC'} e CPF nº ${D.clienteCPF || ''} residente e domiciliado(a) na ${endCli}.`, false],
      ], true),
      this.espaco(120),
      this.pBR([
        ['OUTORGADOS: ', true],
        ['Dr. JONATHAN FRANK STOBIENIA DOMINGOS', true],
        [', inscrito na OAB/SC sob nº 43.348 e ', false],
        ['Dra. THAMILE ALESSANDRA DOMINGOS', true],
        [', inscrita na OAB/SC nº 57.773, com endereço profissional subscrito no rodapé.', false],
      ], true),
      this.espaco(120),
      this.p(`PODERES: para o foro em geral, conferindo-lhe os mais amplos e ilimitados poderes inclusive os da cláusula "ad judicia et extra", bem como os especiais constantes do art. 105, do Código de Processo Civil, para, onde com esta se apresentar, em conjunto ou separadamente, além de ordem de nomeação, propor ações e contestá-las, receber citações, notificações e intimações, apresentar justificações, variar de ações e pedidos, notificar, interpelar, protestar, discordar, transigir e desistir, receber a quantia e dar quitação, arrematar ou adjudicar em qualquer praça ou leilão, prestar compromissos de inventariante, oferecer as primeiras e últimas declarações, interpor quaisquer recursos, requerer, assinar, praticar, perante qualquer repartição pública, entidades autárquicas e ou parastatal, Juízo, Instância ou Tribunal, tudo o que julgar conveniente ou necessário ao bom e fiel desempenho deste mandato, que poderá ser substabelecido, no todo ou em parte, a quem melhor lhe convier, com ou sem reserva de poderes. Finalidade específica: ${D.objetoAcao || '[OBJETO DA AÇÃO]'}.`, true),
      this.espaco(120),
      this.pBR([['Os poderes específicos acima outorgados ', false], ['poderão ', true], ['ser substabelecidos.', false]], true),
      this.espaco(120),
      this.p('As partes reconhecem e acordam que o presente documento poderá ser assinado eletronicamente por meio de plataforma eletrônica Docusign, ZapSign ou pelo sistema de assinatura gov.br, produzindo os mesmos efeitos legais da via assinada fisicamente, nos termos da Lei nº 13.874/2019 e do Decreto nº 10.278/2020 e acordam ainda em não contestar a sua validade, conteúdo, autenticidade e integridade.', true),
      this.espaco(160),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 160 }, children: [new TextRun({ text: `${cidade}, ${data}.`, size: 22, font: 'Arial' })] }),
      this.espaco(240),
      new Paragraph({ children: [new TextRun({ text: '{{~position_sign_cliente}}', size: 8, font: 'Arial', color: 'AAAAAA' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '_'.repeat(50), size: 22, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })] }),
    ] as any;
  }

  private secaoHipossuficiencia(D: DadosCliente): Paragraph[] {
    const cidade = D.cidade || 'Balneário Camboriú';
    const data   = D.dataExtenso || this.dataPorExtenso();

    return [
      this.titulo('DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA'),
      this.secao('(Para fins de concessão do benefício de Assistência Judiciária Gratuita – Art. 99, § 3º, CPC)'),
      this.hr(),
      this.espaco(120),
      this.pBR([
        ['Eu, ', false],
        [D.clienteNome.toUpperCase(), true],
        [`, ${D.clienteNaciona || 'brasileiro(a)'}, ${D.clienteEstadoCivil || ''}, ${D.clienteProfissao || ''}, portador(a) do RG nº ${D.clienteRG || ''} ${D.clienteRGOrgao || 'SSP/SC'} e inscrito(a) no CPF nº ${D.clienteCPF || ''}, residente e domiciliado(a) na ${this.enderecoCompleto(D)}, na qualidade de parte no processo judicial em andamento ou a ser proposto pelo escritório `, false],
        ['DOMINGOS ADVOCACIA E ASSESSORIA JURÍDICA', true],
        [', DECLARO, sob as penas da lei, o que segue:', false],
      ], true),
      this.espaco(120),
      this.p('1. Que não possuo condições financeiras de arcar com as custas do processo e honorários advocatícios sem prejuízo do sustento próprio ou de minha família, razão pela qual requer a concessão do benefício da Assistência Judiciária Gratuita, nos termos do art. 98 e seguintes do Código de Processo Civil e da Lei nº 1.060/50.', false),
      this.p('2. Que minha renda mensal é insuficiente para custear as despesas processuais, conforme declarado a seguir:', false),
      this.espaco(80),
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        columnWidths: [4513, 4513],
        rows: [
          new TableRow({ children: [new TableCell({ width: { size: 4513, type: WidthType.DXA }, shading: { fill: 'D5E8F0', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Renda mensal bruta:', bold: true, size: 22, font: 'Arial' })] })] }), new TableCell({ width: { size: 4513, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'R$ ________________________________', size: 22, font: 'Arial' })] })] })] }),
          new TableRow({ children: [new TableCell({ width: { size: 4513, type: WidthType.DXA }, shading: { fill: 'D5E8F0', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Número de dependentes:', bold: true, size: 22, font: 'Arial' })] })] }), new TableCell({ width: { size: 4513, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: '____', size: 22, font: 'Arial' })] })] })] }),
          new TableRow({ children: [new TableCell({ width: { size: 4513, type: WidthType.DXA }, shading: { fill: 'D5E8F0', type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'Despesas mensais aproximadas:', bold: true, size: 22, font: 'Arial' })] })] }), new TableCell({ width: { size: 4513, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 }, children: [new Paragraph({ children: [new TextRun({ text: 'R$ ________________________________', size: 22, font: 'Arial' })] })] })] }),
        ],
      }) as any,
      this.espaco(120),
      this.p('3. Que estou ciente de que a falsidade desta declaração configura crime de falsidade ideológica (art. 299 do Código Penal), sujeito às penalidades previstas em lei, bem como ao pagamento das custas em dobro (art. 100 do CPC).', false),
      this.p('4. Que caso minha situação financeira se altere de forma significativa, comprometendo-me a informar imediatamente ao(à) advogado(a) responsável, para que seja avaliada a manutenção ou revogação do benefício.', false),
      this.espaco(160),
      new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 160 }, children: [new TextRun({ text: `${cidade}, ${data}.`, size: 22, font: 'Arial' })] }),
      this.espaco(240),
      new Paragraph({ children: [new TextRun({ text: '{{~position_sign_cliente}}', size: 8, font: 'Arial', color: 'AAAAAA' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: '_'.repeat(50), size: 22, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: D.clienteNome.toUpperCase(), bold: true, size: 22, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `CPF: ${D.clienteCPF || ''}`, size: 20, font: 'Arial', color: '555555' })] }),
    ] as any;
  }

  private secaoRenuncia(D: DadosCliente): Paragraph[] {
    const data = D.dataExtenso || this.dataPorExtenso();
    const assinNome = D.clienteNome.toUpperCase();

    return [
      this.titulo('CARTA DE RENÚNCIA DE MANDATO'),
      this.hr(),
      this.espaco(120),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 80, after: 160 },
        indent: { firstLine: 720 },
        children: [
          new TextRun({ text: 'Prezado senhor(a) ', size: 22, font: 'Arial' }),
          new TextRun({ text: D.clienteNome, bold: true, size: 22, font: 'Arial' }),
          new TextRun({ text: `, portador(a) do RG nº ${D.clienteRG || ''} e CPF nº ${D.clienteCPF || ''}.`, size: 22, font: 'Arial' }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 80, after: 160 },
        indent: { firstLine: 720 },
        children: [
          new TextRun({ text: 'Serve a presente, para notificar de que o subscritor desta ', size: 22, font: 'Arial' }),
          new TextRun({ text: 'RENUNCIA AO MANDATO QUE LHE FOI OUTORGADO POR PROCURAÇÃO AD JUDICIA OS ADVOGADOS DR. JONATHAN FRANK STOBIENIA DOMINGOS OAB/SC 43.348 E THAMILE ALESSANDRA DOMINGOS OAB/SC 57.773', bold: true, size: 22, font: 'Arial' }),
          new TextRun({ text: `, como já foi devidamente notificado via WhatsApp no dia ${data}, fica notificado da renúncia acima expressa, sendo certo que senhor(a) têm, a partir do recebimento desta, o prazo legal de `, size: 22, font: 'Arial' }),
          new TextRun({ text: '10 (dez) dias', bold: true, size: 22, font: 'Arial' }),
          new TextRun({ text: ', para, nos termos do art. 45 do CPC, para contratar novo patrono para o referido processo assinando ao final o canhoto do recebimento.', size: 22, font: 'Arial' }),
        ],
      }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { before: 80, after: 80 }, indent: { firstLine: 720 }, children: [new TextRun({ text: 'Atenciosamente Jonathan Domingos OAB/SC 43.348.', size: 22, font: 'Arial' })] }),
      this.espaco(240),
      new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 80, after: 80 }, children: [new TextRun({ text: 'Balneário Camboriú, ___ de _________ de ____', size: 22, font: 'Arial' })] }),
      this.espaco(400),
      new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } }, spacing: { before: 80, after: 40 }, children: [new TextRun({ text: 'Dr. Jonathan Frank Stobienia Domingos / Thamile Alessandra Domingos', size: 22, font: 'Arial' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 40, after: 200 }, children: [new TextRun({ text: 'OAB/SC 43.348                              OAB/SC 57.773', size: 20, font: 'Arial' })] }),
      this.espaco(240),
      new Paragraph({ spacing: { before: 80, after: 40 }, children: [new TextRun({ text: 'ASSINATURA DE RECEBIMENTO', bold: true, allCaps: true, size: 22, font: 'Arial' })] }),
      this.espaco(280),
      new Paragraph({ children: [new TextRun({ text: '{{~position_sign_cliente}}', size: 8, font: 'Arial', color: 'AAAAAA' })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000', space: 1 } }, spacing: { before: 80, after: 40 }, children: [new TextRun({ text: assinNome, bold: true, size: 22, font: 'Arial' })] }),
    ] as any;
  }

  // ── API pública ────────────────────────────────────────────────────────

  async gerarDocumento(tipo: string, dados: DadosCliente): Promise<Buffer> {
    const pageProps = {
      size:   { width: 11906, height: 16838 },
      margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },
    };

    let children: any[];
    switch (tipo) {
      case 'contrato':         children = this.secaoContrato(dados);         break;
      case 'procuracao':       children = this.secaoProcuracao(dados);       break;
      case 'hipossuficiencia': children = this.secaoHipossuficiencia(dados); break;
      case 'renuncia':         children = this.secaoRenuncia(dados);         break;
      default: throw new Error(`Tipo de documento desconhecido: ${tipo}`);
    }

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
      sections: [{
        properties: { page: pageProps },
        headers:    { default: this.makeHeader() },
        footers:    { default: this.makeFooter() },
        children,
      }],
    });

    return Packer.toBuffer(doc);
  }

  async gerarTodosDocumentos(dados: DadosCliente): Promise<Buffer> {
    const pageProps = {
      size:   { width: 11906, height: 16838 },
      margin: { top: 1701, right: 1134, bottom: 1134, left: 1701 },
    };

    const doc = new Document({
      styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
      sections: [
        { properties: { page: pageProps }, headers: { default: this.makeHeader() }, footers: { default: this.makeFooter() }, children: this.secaoContrato(dados) },
        { properties: { page: pageProps }, headers: { default: this.makeHeader() }, footers: { default: this.makeFooter() }, children: this.secaoProcuracao(dados) },
        { properties: { page: pageProps }, headers: { default: this.makeHeader() }, footers: { default: this.makeFooter() }, children: this.secaoHipossuficiencia(dados) },
        { properties: { page: pageProps }, headers: { default: this.makeHeader() }, footers: { default: this.makeFooter() }, children: this.secaoRenuncia(dados) },
      ],
    });

    return Packer.toBuffer(doc);
  }
}
