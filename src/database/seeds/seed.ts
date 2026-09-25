/**
 * ─── Seed: JurysOne — Domingos Advocacia ────────────────────────────────────
 * Execução:  npm run db:seed
 *            (ou: DATABASE_URL="..." npm run db:seed  para sobrescrever)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import * as path from 'path';
import * as fs from 'fs';

// ── carrega .env.production se existir, senão .env ────────────────────────
function loadEnv() {
  const envProd = path.resolve(__dirname, '../../..', '.env.production');
  const envDev  = path.resolve(__dirname, '../../..', '.env');

  const file = fs.existsSync(envProd) ? envProd : envDev;
  const content = fs.readFileSync(file, 'utf-8');

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;

    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  console.log(`✅  Env carregado de: ${path.basename(file)}`);
}

loadEnv();

// ── helpers ──────────────────────────────────────────────────────────────────
const prisma = new PrismaClient({ log: ['warn', 'error'] });

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

/** Formata numero de processo no padrão CNJ */
function numeroCNJ(seq: number): string {
  const ano  = 2024;
  const jus  = 8;   // TJ
  const trib = 26;  // SP
  const orig = 100 + seq;
  return `${String(seq).padStart(7, '0')}-${(seq * 13 % 99).toString().padStart(2, '0')}.${ano}.${jus}.${trib}.${String(orig).padStart(4, '0')}`;
}

// ── dados de demonstração ─────────────────────────────────────────────────
const CLIENTES_DEMO = [
  {
    nome:          'Maria Clara Oliveira Santos',
    tipo:          'PF' as const,
    cpf:           '123.456.789-09',
    cpfCnpj:       '123.456.789-09',
    email:         'maria.clara@email.com',
    telefone:      '(11) 98765-4321',
    cidade:        'São Paulo',
    estado:        'SP',
    cep:           '01310-100',
    endereco:      'Av. Paulista, 1000, Apto 52',
    observacoes:   'Cliente desde 2022. Processo trabalhista em andamento.',
    dataNascimento: new Date('1985-06-15'),
  },
  {
    nome:          'Construções Rápidas Ltda',
    tipo:          'PJ' as const,
    cpfCnpj:       '12.345.678/0001-90',
    email:         'juridico@construcoesrapidas.com.br',
    telefone:      '(11) 3456-7890',
    cidade:        'Campinas',
    estado:        'SP',
    cep:           '13015-001',
    endereco:      'Rua Conceição, 250, Sala 3',
    observacoes:   'Empresa do setor de construção civil. Contratos com poder público.',
  },
  {
    nome:          'Roberto Carlos Ferreira',
    tipo:          'PF' as const,
    cpf:           '987.654.321-00',
    cpfCnpj:       '987.654.321-00',
    email:         'roberto.ferreira@hotmail.com',
    telefone:      '(11) 91234-5678',
    cidade:        'Santo André',
    estado:        'SP',
    cep:           '09010-170',
    endereco:      'Rua das Acácias, 45',
    observacoes:   'Litígio familiar — inventário em andamento.',
    dataNascimento: new Date('1970-03-22'),
  },
];

interface ProcessoDemoInput {
  titulo:    string;
  tipoAcao:  string;
  area:      string;
  tribunal:  string;
  fase:      string;
  status:    'ATIVO' | 'ARQUIVADO' | 'ENCERRADO' | 'SUSPENSO';
  valor:     number;
  clienteIdx: number;
  diasInicio: number;
  diasPrazo:  number;
  descricao:  string;
  movimentacoes: string[];
}

const PROCESSOS_DEMO: ProcessoDemoInput[] = [
  {
    titulo:    'Reclamação Trabalhista — Horas Extras',
    tipoAcao:  'Reclamação Trabalhista',
    area:      'Trabalhista',
    tribunal:  'TRT 2ª Região',
    fase:      'Instrução',
    status:    'ATIVO',
    valor:     45000,
    clienteIdx: 0,
    diasInicio: -120,
    diasPrazo:   30,
    descricao:  'Ação trabalhista referente ao pagamento de horas extras não quitadas, adicional noturno e FGTS retroativo.',
    movimentacoes: [
      'Petição inicial protocolada.',
      'Citação do réu realizada.',
      'Audiência de conciliação realizada — sem acordo.',
      'Réu apresentou contestação.',
    ],
  },
  {
    titulo:    'Divórcio Consensual — Partilha de Bens',
    tipoAcao:  'Divórcio',
    area:      'Família',
    tribunal:  'TJSP — 3ª Vara de Família',
    fase:      'Acordo',
    status:    'ATIVO',
    valor:     8000,
    clienteIdx: 0,
    diasInicio: -60,
    diasPrazo:   15,
    descricao:  'Divórcio consensual com partilha de imóvel e veículo. Guarda compartilhada de filho menor.',
    movimentacoes: [
      'Petição conjunta protocolada.',
      'Documentação de partilha anexada.',
    ],
  },
  {
    titulo:    'Contrato Administrativo — Rescisão',
    tipoAcao:  'Ação Ordinária',
    area:      'Administrativo',
    tribunal:  'TJSP — 5ª Vara da Fazenda Pública',
    fase:      'Conhecimento',
    status:    'ATIVO',
    valor:     230000,
    clienteIdx: 1,
    diasInicio: -200,
    diasPrazo:   45,
    descricao:  'Ação visando indenização por rescisão unilateral de contrato de obra pública sem justa causa.',
    movimentacoes: [
      'Petição inicial protocolada.',
      'Tutela de urgência indeferida.',
      'Citação da Fazenda realizada.',
      'Contestação e reconvenção recebidas.',
      'Perícia técnica determinada pelo juízo.',
    ],
  },
  {
    titulo:    'Inventário — Espólio Ferreira',
    tipoAcao:  'Inventário',
    area:      'Sucessões',
    tribunal:  'TJSP — 2ª Vara Cível',
    fase:      'Partilha',
    status:    'ATIVO',
    valor:     180000,
    clienteIdx: 2,
    diasInicio: -90,
    diasPrazo:  -10,    // prazo vencido — demonstra alerta
    descricao:  'Inventário judicial do espólio. Herdeiros: cônjuge e dois filhos. Imóvel e quotas de empresa.',
    movimentacoes: [
      'Abertura do inventário.',
      'Nomeação de inventariante.',
      'Avaliação dos bens realizada.',
      'Plano de partilha apresentado.',
    ],
  },
  {
    titulo:    'Ação de Cobrança — Nota Promissória',
    tipoAcao:  'Execução de Título Extrajudicial',
    area:      'Cível',
    tribunal:  'TJSP — 1ª Vara Cível',
    fase:      'Execução',
    status:    'SUSPENSO',
    valor:     12500,
    clienteIdx: 1,
    diasInicio: -300,
    diasPrazo:   60,
    descricao:  'Execução de nota promissória não paga. Devedor não localizado. Processo suspenso aguardando citação por edital.',
    movimentacoes: [
      'Petição de execução protocolada.',
      'Penhora online (SISBAJUD) — sem saldo.',
      'Devedor não localizado — requerimento de citação por edital.',
      'Processo suspenso por 6 meses.',
    ],
  },
];

const SETTINGS_DEFAULT = [
  { chave: 'notificacoes_email',       valor: true,               tipo: 'notificacoes'  },
  { chave: 'notificacoes_whatsapp',    valor: false,              tipo: 'notificacoes'  },
  { chave: 'notificacoes_push',        valor: true,               tipo: 'notificacoes'  },
  { chave: 'prazo_alerta_dias',        valor: 7,                  tipo: 'prazos'        },
  { chave: 'fuso_horario',             valor: 'America/Sao_Paulo', tipo: 'global'       },
  { chave: 'idioma',                   valor: 'pt-BR',            tipo: 'global'        },
  { chave: 'moeda',                    valor: 'BRL',              tipo: 'global'        },
  { chave: 'formato_data',             valor: 'DD/MM/YYYY',       tipo: 'global'        },
  { chave: 'cor_primaria',             valor: '#1a56db',          tipo: 'aparencia'     },
  { chave: 'tema',                     valor: 'light',            tipo: 'aparencia'     },
  { chave: 'onboarding_concluido',     valor: false,              tipo: 'onboarding'    },
  { chave: 'numero_oab_obrigatorio',   valor: false,              tipo: 'escritorio'    },
];

// ── seed principal ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  JurysOne — Seed de Banco de Dados');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const now = new Date();

  // ── 1. Escritório ────────────────────────────────────────────────────────
  console.log('📁  Criando escritório: Domingos Advocacia ...');

  const escritorio = await prisma.escritorio.upsert({
    where:  { dominio: 'jurysone.com.br' },
    update: {},
    create: {
      nome:        'Domingos Advocacia',
      dominio:     'jurysone.com.br',
      corPrimaria: '#1a56db',
    },
  });

  console.log(`    ✓ Escritório ID: ${escritorio.id}`);

  // ── 2. Usuário administrador ──────────────────────────────────────────────
  console.log('\n👤  Criando administrador ...');

  const SENHA_PLAIN = 'Jurysone@2026';
  const senhaHash = await argon2.hash(SENHA_PLAIN, {
    type:        argon2.argon2id,
    memoryCost:  65536,
    timeCost:    3,
    parallelism: 4,
  });

  const admin = await prisma.usuario.upsert({
    where:  { email: 'domingos.advss@gmail.com' },
    update: { senha: senhaHash },
    create: {
      nome:         'Jonathan Domingos',
      email:        'domingos.advss@gmail.com',
      senha:        senhaHash,
      roles:        'ADMIN',
      oabNumero:    '123456',
      oabEstado:    'SP',
      telefone:     '(11) 99999-0000',
      ativo:        true,
      escritorioId: escritorio.id,
    },
  });

  console.log(`    ✓ Admin ID:    ${admin.id}`);
  console.log(`    ✓ Email:       ${admin.email}`);
  console.log(`    ✓ Senha:       ${SENHA_PLAIN}   ← GUARDE ESTA SENHA`);

  // ── 3. Assinatura TRIAL ───────────────────────────────────────────────────
  console.log('\n💳  Criando assinatura TRIAL (30 dias) ...');

  const trialFim = addDays(now, 30);

  const assinatura = await prisma.assinatura.upsert({
    where:  { escritorioId: escritorio.id },
    update: {},
    create: {
      escritorioId:       escritorio.id,
      status:             'TRIAL',
      nomePlano:          'PRO',
      trialVenceEm:       trialFim,
      periodoAtualInicio: now,
      periodoAtualFim:    trialFim,
    },
  });

  console.log(`    ✓ Assinatura ID: ${assinatura.id}  |  Trial até: ${trialFim.toLocaleDateString('pt-BR')}`);

  // ── 4. Configurações padrão ───────────────────────────────────────────────
  console.log('\n⚙️   Criando configurações padrão ...');

  for (const cfg of SETTINGS_DEFAULT) {
    await prisma.configuracao.upsert({
      where:  { escritorioId_chave: { escritorioId: escritorio.id, chave: cfg.chave } },
      update: { valor: cfg.valor },
      create: {
        escritorioId: escritorio.id,
        chave:        cfg.chave,
        valor:        cfg.valor as any,
        tipo:         cfg.tipo,
      },
    });
  }

  console.log(`    ✓ ${SETTINGS_DEFAULT.length} configurações criadas`);

  // ── 5. Clientes de exemplo ────────────────────────────────────────────────
  console.log('\n👥  Criando clientes de demonstração ...');

  const clientesCriados = [];

  for (const cd of CLIENTES_DEMO) {
    const cliente = await prisma.cliente.upsert({
      where:  { id: (await prisma.cliente.findFirst({ where: { cpfCnpj: cd.cpfCnpj, escritorioId: escritorio.id } }))?.id ?? 'none' },
      update: {},
      create: {
        escritorioId:   escritorio.id,
        nome:           cd.nome,
        tipo:           cd.tipo,
        cpfCnpj:        cd.cpfCnpj,
        cpf:            (cd as any).cpf,
        email:          cd.email,
        telefone:       cd.telefone,
        cidade:         cd.cidade,
        estado:         cd.estado,
        cep:            cd.cep,
        endereco:       cd.endereco,
        observacoes:    cd.observacoes,
        dataNascimento: (cd as any).dataNascimento,
        ativo:          true,
        status:         'ativo',
      },
    });
    clientesCriados.push(cliente);
    console.log(`    ✓ ${cliente.nome} (${cliente.id})`);
  }

  // ── 6. Processos de exemplo ───────────────────────────────────────────────
  console.log('\n⚖️   Criando processos de demonstração ...');

  for (let i = 0; i < PROCESSOS_DEMO.length; i++) {
    const pd = PROCESSOS_DEMO[i];
    const cliente = clientesCriados[pd.clienteIdx];
    const numero  = numeroCNJ(i + 1);

    const processoExistente = await prisma.processo.findFirst({
      where: { numero, escritorioId: escritorio.id },
    });

    if (processoExistente) {
      console.log(`    ↩  Processo já existe: ${numero} — pulando`);
      continue;
    }

    const processo = await prisma.processo.create({
      data: {
        escritorioId:  escritorio.id,
        numero,
        titulo:        pd.titulo,
        tipoAcao:      pd.tipoAcao,
        area:          pd.area,
        tribunal:      pd.tribunal,
        fase:          pd.fase,
        status:        pd.status,
        valor:         pd.valor,
        clienteId:     cliente.id,
        responsavelId: admin.id,
        dataInicio:    addDays(now, pd.diasInicio),
        dataPrazo:     addDays(now, pd.diasPrazo),
        descricao:     pd.descricao,
        tipo:          'judicial',
      },
    });

    // Movimentações
    for (let m = 0; m < pd.movimentacoes.length; m++) {
      await prisma.movimentacao.create({
        data: {
          processoId: processo.id,
          data:       addDays(now, pd.diasInicio + m * 15),
          descricao:  pd.movimentacoes[m],
          fonte:      'manual',
          lida:       true,
        },
      });
    }

    console.log(`    ✓ [${pd.area}] ${pd.titulo} — ${numero}`);
  }

  // ── Resumo final ──────────────────────────────────────────────────────────
  const totalClientes  = await prisma.cliente.count({ where: { escritorioId: escritorio.id } });
  const totalProcessos = await prisma.processo.count({ where: { escritorioId: escritorio.id } });
  const totalMovs      = await prisma.movimentacao.count();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅  SEED CONCLUÍDO COM SUCESSO!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Escritório:     ${escritorio.nome}  (${escritorio.id})`);
  console.log(`  Clientes:       ${totalClientes}`);
  console.log(`  Processos:      ${totalProcessos}`);
  console.log(`  Movimentações:  ${totalMovs}`);
  console.log(`  Assinatura:     TRIAL até ${trialFim.toLocaleDateString('pt-BR')}`);
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  CREDENCIAIS DO ADMINISTRADOR                       │');
  console.log(`  │  Email:  ${admin.email.padEnd(43)}│`);
  console.log(`  │  Senha:  ${SENHA_PLAIN.padEnd(43)}│`);
  console.log(`  │  Role:   ADMIN                                       │`);
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => {
    console.error('\n❌  Erro no seed:\n', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
