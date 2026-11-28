import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Perfis } from '@app/auth/perfis.decorator';
import { ClienteServicosService, jsonInterno, RespostaInterna } from '@app/integracao/cliente-servicos.service';

@Controller('planejamento')
export class PlanejamentoController {
  constructor(private readonly servicos: ClienteServicosService) {}

  @Get('disponibilidade')
  @Perfis('GESTOR', 'TECNICO')
  async disponibilidade(@Query('data') data: string, @Query('especialidade') especialidade: string | undefined,
    @Query('categoria') categoria: string | undefined, @Req() request: Request) {
    const dataValida = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) &&
      !Number.isNaN(Date.parse(data)) && new Date(data).toISOString().slice(0, 10) === data;
    const especialidades = ['DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL'];
    const categorias = ['CAMINHAO_HIDROJATO', 'RETROESCAVADEIRA', 'CAMINHONETE', 'BOMBA_SUCCAO', 'KIT_VISTORIA'];
    if (!dataValida || (especialidade !== undefined && !especialidades.includes(especialidade)) ||
      (categoria !== undefined && !categorias.includes(categoria))) {
      throw new BadRequestException('Data ou filtro de disponibilidade inválido.');
    }
    const queryEquipes = new URLSearchParams({ data });
    const queryFrota = new URLSearchParams({ data });
    if (especialidade) queryEquipes.set('especialidade', especialidade);
    if (categoria) queryFrota.set('categoria', categoria);
    const [equipes, recursos] = await Promise.all([
      this.servicos.requisitar('EQUIPES', `v1/disponibilidade?${queryEquipes}`, request, { preservarQuery: false }),
      this.servicos.requisitar('FROTA', `v1/disponibilidade?${queryFrota}`, request, { preservarQuery: false }),
    ]);
    const avisos: string[] = [];
    const ler = (resposta: RespostaInterna, nome: string): unknown[] | null => {
      const body = resposta.status >= 200 && resposta.status < 300 ? jsonInterno<unknown>(resposta) : undefined;
      if (Array.isArray(body)) return body;
      avisos.push(`Não foi possível carregar a disponibilidade de ${nome}.`);
      return null;
    };
    return { data, equipes: ler(equipes, 'equipes'), recursos: ler(recursos, 'recursos'), avisos };
  }
}
