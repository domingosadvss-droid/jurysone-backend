import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ContatosService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: any, officeId: string) {
    return { message: 'Contatos', officeId, query };
  }

  findOne(id: string, officeId: string) {
    return { message: 'Contato', id, officeId };
  }

  create(body: any, officeId: string) {
    return { message: 'Contato created', body, officeId };
  }

  update(id: string, body: any, officeId: string) {
    return { message: 'Contato updated', id, body, officeId };
  }

  remove(id: string, officeId: string) {
    return { message: 'Contato removed', id, officeId };
  }

  findDatatable(query: any, officeId: string) {
    return { data: [], total: 0, officeId, query };
  }

  getProcessos(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  getFinanceiro(id: string, officeId: string) {
    return { data: [], id, officeId };
  }

  getTarefas(id: string, officeId: string) {
    return { data: [], id, officeId };
  }
}
