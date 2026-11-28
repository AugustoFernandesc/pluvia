import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { useSessao } from '../../auth';
import { Bastidores } from '../../bastidores';
import { ChipEstado } from '../../componentes/ChipEstado';
import { ChipNivel } from '../../componentes/ChipNivel';
import { EstadoTela } from '../../componentes/EstadoTela';
import { Pagina } from '../../componentes/Layout';
import { useConsulta } from '../../useConsulta';
import { Acao, dataCurta, dataHora, Fator, rotulo } from '../comum';
interface Detalhe {
    regiao: {
        nome: string;
        caracteristicas?: {
            areaKm2?: number;
            declividadeMediaPct?: number;
            proximidadeCursoAgua?: boolean;
            tipoOcupacao?: string;
        };
    };
    panorama: {
        nivelAtencao: string;
        fatores: Fator[];
        sinalizacoes: { id: string; nivel: string; estado: string }[];
        versao: number;
        atualizadoEm: string;
    };
    acoes: { itens: Acao[] } | null;
    avisos: string[];
}
interface Analise {
    sintese: string;
    fontes: { nome: string }[];
    origem: string;
    modelo: string | null;
    latenciaMs: number | null;
    geradaEm: string;
}
export default function Regiao() {
    const { regiaoId = '' } = useParams();
    const gestor = useSessao().temPerfil('GESTOR');
    const consulta = useConsulta(
        () => api.get<Detalhe>(`/web/v1/regioes/${regiaoId}`).then((r) => r.data),
        [regiaoId]
    );
    const analise = useConsulta(
        () => api.get<Analise>(`/web/v1/regioes/${regiaoId}/analise`).then((r) => r.data),
        [regiaoId]
    );
    const d = consulta.dados,
        c = d?.regiao.caracteristicas;
    return (
        <Pagina
            titulo={d?.regiao.nome ?? 'Região'}
            sobretitulo="Lavras, MG"
            acoes={
                gestor && (
                    <Button component={Link} to={`/acoes?regiaoId=${regiaoId}`} variant="contained">
                        Abrir ação
                    </Button>
                )
            }
        >
            <EstadoTela
                carregando={consulta.carregando && !d}
                erro={consulta.erro}
                aoTentarDeNovo={consulta.recarregar}
            >
                {d && (
                    <Stack spacing={2}>
                        <Box>
                            <ChipNivel nivel={d.panorama.nivelAtencao} />
                        </Box>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Por que este nível</Typography>
                            {d.panorama.fatores?.length ? (
                                d.panorama.fatores.map((f, i) => (
                                    <Typography key={i}>
                                        {f.descricao} · {f.fonte}
                                    </Typography>
                                ))
                            ) : (
                                <Typography>Nenhum fator informado.</Typography>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Explicação da IA</Typography>
                            {analise.carregando && !analise.dados ? (
                                <Typography>Preparando a explicação…</Typography>
                            ) : (
                                <EstadoTela
                                    carregando={false}
                                    erro={analise.erro}
                                    aoTentarDeNovo={analise.recarregar}
                                >
                                    {analise.dados && (
                                        <>
                                            <Typography>{analise.dados.sintese}</Typography>
                                            <Typography color="text.secondary">
                                                Com base em:{' '}
                                                {analise.dados.fontes
                                                    .map((f) => f.nome)
                                                    .join(', ') || 'fontes não informadas'}
                                            </Typography>
                                            <Bastidores>
                                                <Typography>
                                                    Origem: {analise.dados.origem} · Modelo:{' '}
                                                    {analise.dados.modelo ?? '—'} · Latência:{' '}
                                                    {analise.dados.latenciaMs ?? '—'} ms ·{' '}
                                                    {dataHora(analise.dados.geradaEm)}
                                                </Typography>
                                            </Bastidores>
                                        </>
                                    )}
                                </EstadoTela>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Stack direction="row" justifyContent="space-between">
                                <Typography variant="h6">Sinalizações da região</Typography>
                                <Button component={Link} to={`/sinalizacoes?regiaoId=${regiaoId}`}>
                                    Ver todas
                                </Button>
                            </Stack>
                            {d.panorama.sinalizacoes?.length ? (
                                d.panorama.sinalizacoes.map((s) => (
                                    <Stack key={s.id} direction="row" spacing={1} sx={{ mt: 1 }}>
                                        <ChipNivel nivel={s.nivel} />
                                        <ChipEstado estado={s.estado} />
                                    </Stack>
                                ))
                            ) : (
                                <Typography>Nenhuma sinalização.</Typography>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Ações na região</Typography>
                            {!d.acoes ? (
                                <Alert severity="info">
                                    Não foi possível carregar as ações agora.
                                </Alert>
                            ) : d.acoes.itens.length ? (
                                d.acoes.itens.map((a) => (
                                    <Box key={a.id}>
                                        <Button component={Link} to={`/acoes/${a.id}`}>
                                            {rotulo(a.tipo)} · {dataCurta(a.data)} ·{' '}
                                            {rotulo(a.turno)}
                                        </Button>
                                        <ChipEstado estado={a.estado} />
                                    </Box>
                                ))
                            ) : (
                                <Typography>Nenhuma ação nesta região.</Typography>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Sobre a região</Typography>
                            <Typography>
                                Área: {c?.areaKm2 != null ? `${c.areaKm2} km²` : 'Não informada'}
                            </Typography>
                            <Typography>
                                Declividade média:{' '}
                                {c?.declividadeMediaPct != null
                                    ? `${c.declividadeMediaPct}%`
                                    : 'Não informada'}
                            </Typography>
                            <Typography>
                                Proximidade de curso d'água:{' '}
                                {c?.proximidadeCursoAgua == null
                                    ? 'Não informada'
                                    : c.proximidadeCursoAgua
                                      ? 'Próxima'
                                      : 'Não próxima'}
                            </Typography>
                            <Typography>
                                Tipo de ocupação:{' '}
                                {(
                                    {
                                        RESIDENCIAL: 'Residencial',
                                        COMERCIAL: 'Comercial',
                                        MISTA: 'Mista',
                                        INDUSTRIAL: 'Industrial',
                                        RURAL: 'Rural',
                                    } as Record<string, string>
                                )[c?.tipoOcupacao ?? ''] ?? 'Não informado'}
                            </Typography>
                        </Paper>
                        <Bastidores>
                            <Typography>
                                Panorama versão {d.panorama.versao} ·{' '}
                                {dataHora(d.panorama.atualizadoEm)}
                            </Typography>
                            {d.avisos.map((a, i) => (
                                <Typography key={i}>{a}</Typography>
                            ))}
                        </Bastidores>
                    </Stack>
                )}
            </EstadoTela>
        </Pagina>
    );
}
