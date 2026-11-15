/**
 * JURYSONE — Índices econômicos do Banco Central (SGS) com cache no banco
 *
 * API: {BCB_API_URL}/dados/serie/bcdata.sgs.{codigo}/dados?formato=json&dataInicial=dd/MM/aaaa&dataFinal=dd/MM/aaaa
 * (BCB_API_URL padrão: https://api.bcb.gov.br). A TR (226) é diária: usa-se o período iniciado no dia 1º.
 * Meses já fechados ficam no cache; o mês corrente e o anterior são consultados de novo (podem ser divulgados depois).
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import { MEDIAS_BCB, MapaIndices, SERIES, competencia, compsEntre, hojeIso, somarMesesComp } from './nucleo';

function base() {
  return (process.env.BCB_API_URL || 'https://api.bcb.gov.br').replace(/\/+$/, '');
}
function br(dia: string) {
  return dia.split('-').reverse().join('/');
}

@Injectable()
export class IndicesService {
  private readonly logger = new Logger(IndicesService.name);
  constructor(private readonly prisma: PrismaService) {}

  private codigo(chave: string) {
    return (SERIES[chave] ?? MEDIAS_BCB[chave])?.codigo;
  }

  /** Busca no BCB os valores mensais de uma série no intervalo [de, ate] (competências) */
  async buscarNoBcb(chave: string, de: string, ate: string): Promise<Record<string, number>> {
    const cod = this.codigo(chave);
    if (!cod) return {};
    const out: Record<string, number> = {};
    // o SGS limita consultas longas: busca em janelas de 10 anos
    for (let ini = de; ini <= ate; ini = somarMesesComp(ini, 120)) {
      const fimJ = [somarMesesComp(ini, 119), ate].sort()[0];
      const ultimoDia = new Date(Date.UTC(Number(fimJ.slice(0, 4)), Number(fimJ.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const url = `${base()}/dados/serie/bcdata.sgs.${cod}/dados?formato=json&dataInicial=${br(ini + '-01')}&dataFinal=${br(ultimoDia)}`;
      const r = await axios.get(url, { timeout: 20000, headers: { Accept: 'application/json' }, validateStatus: (s) => s < 500 });
      if (r.status === 404 || !Array.isArray(r.data)) continue;
      for (const it of r.data as Array<{ data: string; valor: string }>) {
        const [d, m, a] = String(it.data).split('/');
        if (chave === 'TR' && d !== '01') continue;
        const v = Number(String(it.valor).replace(',', '.'));
        if (!Number.isNaN(v)) out[`${a}-${m}`] = v;
      }
    }
    return out;
  }

  /** Mapa com as séries pedidas, do mês `de` até o mês atual, usando o cache e completando pelo BCB */
  async carregar(chaves: string[], desdeDia: string, avisos: string[] = []): Promise<MapaIndices> {
    const de = competencia(desdeDia < '1995-01-01' ? '1995-01-01' : desdeDia);
    const ate = competencia(hojeIso());
    const comps = compsEntre(de, ate);
    const mapa: MapaIndices = {};
    for (const chave of [...new Set(chaves)]) {
      const cod = this.codigo(chave);
      if (!cod) continue;
      const linhas = await this.prisma.indiceEconomico.findMany({ where: { serie: cod, competencia: { gte: de, lte: ate } } });
      mapa[chave] = {};
      for (const l of linhas) mapa[chave][l.competencia] = Number(l.valor);
      const recentes = new Set([ate, somarMesesComp(ate, -1)]);
      const faltam = comps.filter((c) => mapa[chave][c] === undefined || recentes.has(c));
      if (!faltam.length) continue;
      try {
        const novos = await this.buscarNoBcb(chave, faltam[0], faltam[faltam.length - 1]);
        const inserir: Array<{ serie: string; competencia: string; valor: number }> = [];
        for (const [c, v] of Object.entries(novos)) {
          const tinha = mapa[chave][c];
          mapa[chave][c] = v;
          if (tinha === undefined) inserir.push({ serie: cod, competencia: c, valor: v });
          else if (tinha !== v) await this.prisma.indiceEconomico.update({ where: { serie_competencia: { serie: cod, competencia: c } }, data: { valor: v, obtidoEm: new Date() } });
        }
        if (inserir.length) await this.prisma.indiceEconomico.createMany({ data: inserir, skipDuplicates: true });
      } catch (e: any) {
        this.logger.warn(`BCB indisponível para a série ${cod}: ${e?.message}`);
        avisos.push(`CONFERIR: não foi possível consultar o Banco Central (série ${cod}); usados apenas os índices já guardados.`);
      }
    }
    return mapa;
  }
}
