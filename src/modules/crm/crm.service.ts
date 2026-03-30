import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(query: any, officeId: string) {
    return { message: 'CRM', officeId, query };
  }

  findOne(id: string, officeId: string) {
    return { message: 'CRM detail', id, officeId };
  }

  create(body: any, userId?: string, officeId?: string) {
    return { message: 'CRM created', body, userId, officeId };
  }

  update(id: string, body: any, officeId: string) {
    return { message: 'CRM updated', id, body, officeId };
  }

  remove(id: string, officeId: string) {
    return { message: 'CRM removed', id, officeId };
  }

  getBoard(officeId: string) {
    return { stages: [], officeId };
  }

  getPerformance(query: any, officeId: string) {
    return { data: [], officeId, query };
  }

  getStages(officeId: string) {
    return { data: [], officeId };
  }

  createStage(body: any, officeId: string) {
    return { message: 'Stage created', body, officeId };
  }

  updateStage(id: string, body: any, officeId: string) {
    return { message: 'Stage updated', id, body, officeId };
  }

  moveStage(id: string, stageId: string, officeId: string) {
    return { message: 'Moved to stage', id, stageId, officeId };
  }

  markWon(id: string, body: any, officeId: string) {
    return { message: 'Marked as won', id, body, officeId };
  }

  markLost(id: string, reason: string, officeId: string) {
    return { message: 'Marked as lost', id, reason, officeId };
  }
}
