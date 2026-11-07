import { SetMetadata } from '@nestjs/common';

export const PERFIS_KEY = 'perfisPermitidos';
export const PERMITE_PARCEIRO_KEY = 'permiteParceiro';
export const PERMITE_SEM_TERMO_KEY = 'permiteSemTermo';

/** Restringe a rota (ou o controller inteiro) aos perfis informados */
export const Perfis = (...perfis: string[]) => SetMetadata(PERFIS_KEY, perfis);

/** Libera a rota para o perfil PARCEIRO (por padrão, parceiros são bloqueados em tudo) */
export const PermiteParceiro = () => SetMetadata(PERMITE_PARCEIRO_KEY, true);

/** Libera a rota mesmo sem o termo de ciência e responsabilidade assinado */
export const PermiteSemTermo = () => SetMetadata(PERMITE_SEM_TERMO_KEY, true);
