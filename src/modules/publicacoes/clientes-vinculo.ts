/**
 * JURYSONE — Achar ou criar o cliente de um processo que chegou de fora (DJEN, AJG, importação)
 *
 * Decisões 110 e 111:
 *   • primeiro procura nos cadastros que o escritório já tem;
 *   • mesmo nome sem CPF: vincula sozinho só se outro dado também bater (cidade/comarca);
 *     senão pede confirmação (não vincula);
 *   • não achou: cria com o nome e marca "cadastro incompleto".
 */
import { PrismaService } from '../../database/prisma.service';
import { normalizarNome } from '../conflitos/conflitos.service';
import { normalizarLocal } from './calendario';

export type ResultadoCliente =
  | { tipo: 'VINCULADO'; clienteId: string; motivo: string }
  | { tipo: 'CONFIRMAR'; candidatos: { id: string; nome: string; cidade: string | null }[] }
  | { tipo: 'NOVO' };

export async function procurarCliente(prisma: PrismaService, escritorioId: string, nome: string, local?: string | null): Promise<ResultadoCliente> {
  const alvo = normalizarNome(nome);
  if (alvo.length < 5) return { tipo: 'NOVO' };
  const clientes = await prisma.cliente.findMany({
    where: { escritorioId, deletedAt: null }, select: { id: true, nome: true, cidade: true },
  });
  const mesmos = clientes.filter((c) => normalizarNome(c.nome) === alvo);
  if (!mesmos.length) return { tipo: 'NOVO' };
  const loc = normalizarLocal(local);
  const comCidade = loc ? mesmos.filter((c) => c.cidade && loc.includes(normalizarLocal(c.cidade))) : [];
  if (comCidade.length === 1) return { tipo: 'VINCULADO', clienteId: comCidade[0].id, motivo: 'mesmo nome e mesma cidade/comarca' };
  return { tipo: 'CONFIRMAR', candidatos: mesmos.map((c) => ({ id: c.id, nome: c.nome, cidade: c.cidade })) };
}

export async function criarClienteIncompleto(prisma: PrismaService, escritorioId: string, d: {
  nome: string; telefone?: string | null; cidade?: string | null; origem?: string; observacao?: string;
}) {
  return prisma.cliente.create({
    data: {
      escritorioId, nome: d.nome.trim().slice(0, 200), tipo: 'PF', telefone: d.telefone ?? null, cidade: d.cidade ?? null,
      estado: null, origem: d.origem ?? null, cadastroIncompleto: true,
      observacoes: d.observacao ?? 'Cadastro criado automaticamente; completar CPF, contato e endereço.',
    },
  });
}
