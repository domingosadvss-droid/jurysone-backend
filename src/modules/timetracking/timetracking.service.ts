import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class TimetrackingService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: any, officeId: string) {
    return { message: 'Time tracking entries', officeId, query };
  }

  findOne(id: string, officeId: string) {
    return { message: 'Time tracking detail', id, officeId };
  }

  create(body: any, userId: string, officeId: string) {
    return { message: 'Time tracking created', body, userId, officeId };
  }

  update(id: string, body: any, officeId: string) {
    return { message: 'Time tracking updated', id, body, officeId };
  }

  remove(id: string, officeId: string) {
    return { message: 'Time tracking removed', id, officeId };
  }

  start(body: any, userId: string, officeId: string) {
    return { message: 'Timer started', body, userId, officeId };
  }

  stop(timerId: string, officeId: string) {
    return { message: 'Timer stopped', timerId, officeId };
  }

  pause(timerId: string, officeId: string) {
    return { message: 'Timer paused', timerId, officeId };
  }

  resume(timerId: string, officeId: string) {
    return { message: 'Timer resumed', timerId, officeId };
  }

  getStats(userId: string, query: any) {
    return { message: 'Time tracking stats', userId, query };
  }

  getTimerAtivo(userId: string) {
    return { timer: null, userId };
  }

  startTimer(userId: string, dto: any) {
    return { message: 'Timer started', userId, dto };
  }

  stopTimer(userId: string, id: string, dto: any) {
    return { message: 'Timer stopped', userId, id, dto };
  }

  pauseTimer(userId: string, id: string) {
    return { message: 'Timer paused', userId, id };
  }

  resumeTimer(userId: string, id: string) {
    return { message: 'Timer resumed', userId, id };
  }

  listEntradas(officeId: string, userId: string, query: any) {
    return { data: [], total: 0, officeId, userId, query };
  }

  createEntrada(userId: string, dto: any) {
    return { message: 'Entrada created', userId, dto };
  }

  updateEntrada(userId: string, id: string, dto: any) {
    return { message: 'Entrada updated', userId, id, dto };
  }

  deleteEntrada(userId: string, id: string) {
    return { message: 'Entrada deleted', userId, id };
  }

  getRelatorioDiario(user: any, query: any) {
    return { data: [], user, query };
  }

  getRelatorioSemanal(user: any, query: any) {
    return { data: [], user, query };
  }

  getRelatorioMensal(user: any, query: any) {
    return { data: [], user, query };
  }

  getRelatorioEquipe(user: any, query: any) {
    return { data: [], user, query };
  }

  getRelatorioFaturamento(officeId: string, query: any) {
    return { data: [], officeId, query };
  }

  getMetas(officeId: string) {
    return { data: [], officeId };
  }

  createMeta(officeId: string, dto: any) {
    return { message: 'Meta created', officeId, dto };
  }

  gerarFatura(user: any, dto: any) {
    return { message: 'Fatura gerada', user, dto };
  }

  getDashboard(userId: string) {
    return { horas: 0, tarefas: 0, userId };
  }
}
