/**
 * JURYSONE — Interfaces Comuns para Paginação
 *
 * Interfaces reutilizáveis em múltiplos serviços para evitar duplicação
 */

/**
 * Resposta paginada genérica para listagens
 */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pages: number;
}

/**
 * Filtros comuns para consultas com paginação
 */
export interface FindAllFilters {
  escritorioId: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Utilidade para calcular valores de paginação
 */
export class PaginationHelper {
  static calculateSkip(page: number = 1, limit: number = 10): number {
    return (page - 1) * limit;
  }

  static calculatePages(total: number, limit: number = 10): number {
    return Math.ceil(total / limit);
  }

  static createResponse<T>(
    data: T[],
    total: number,
    page: number = 1,
    limit: number = 10,
  ): PaginatedResponse<T> {
    return {
      data,
      total,
      page,
      pages: this.calculatePages(total, limit),
    };
  }
}
