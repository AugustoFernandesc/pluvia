import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api';
import { Bastidores } from '../../bastidores';
import { ChipEstado } from '../../componentes/ChipEstado';
import { EstadoTela } from '../../componentes/EstadoTela';
import { Pagina } from '../../componentes/Layout';
import { useConsulta } from '../../useConsulta';
import { obterPainel } from '../visao_geral/api';
import { Acao, dataCurta, dataHora, Disponibilidade, rotulo } from '../comum';

interface Detalhe extends Acao {
    descricao: string | null;
    especialidade: string;
    categoriaRecurso: string;
    sinalizacaoId: string | null;
    motivoCancelamento: string | null;
}
interface Passo {
    mensagem: string;
    direcao: string;
    participante: string | null;
    detalhe: string | null;
    registradoEm: string;
}
interface Saga {
    sagaId: string;
    estado: string;
    passos: Passo[];
    iniciadaEm: string;
    encerradaEm: string | null;
}
const frases: Record<string, string> = {
    ReservarEquipe: 'Pedido de reserva enviado a Equipes',
    EquipeReservada: 'Equipe reservada',
    ReservaEquipeRecusada: 'Equipes recusou',
    ReservarRecurso: 'Pedido de reserva enviado a Frota',
    RecursoReservado: 'Veículo reservado',
    ReservaRecursoRecusada: 'Frota recusou',
    LiberarEquipe: 'Reserva da equipe desfeita',
    EquipeLiberada: 'Equipe liberada',
    LiberarRecurso: 'Reserva do veículo desfeita',
    RecursoLiberado: 'Veículo liberado',
};
function legivel(texto: string) {
    return texto
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
        .replace(/\b[A-Z][A-Z_]{2,}\b/g, (valor) => {
            const nome = rotulo(valor);
            return nome === '—' ? valor.toLowerCase().replace(/_/g, ' ') : nome.toLowerCase();
        });
}
export default function DetalheAcao() {
    const { acaoId = '' } = useParams();
    const [inicio, setInicio] = useState(Date.now());
    const acao = useConsulta(
        () => api.get<Detalhe>(`/web/v1/acoes/${acaoId}`).then((r) => r.data),
        [acaoId]
    );
    const saga = useConsulta(
        () => api.get<Saga>(`/web/v1/acoes/${acaoId}/saga`).then((r) => r.data),
        [acaoId]
    );
    const painel = useConsulta(obterPainel, []);
    const a = acao.dados;
    const disponibilidade = useConsulta(
        () =>
            a && (a.equipeId || a.recursoId)
                ? api
                      .get<Disponibilidade>('/web/v1/planejamento/disponibilidade', {
                          params: { data: a.data },
                      })
                      .then((r) => r.data)
                : Promise.resolve(null),
        [a?.data, a?.equipeId, a?.recursoId]
    );
    useEffect(() => {
        setInicio(Date.now());
    }, [acaoId]);
    useEffect(() => {
        if (!a || a.estado !== 'PENDENTE') return;
        const intervalo = window.setInterval(() => {
            if (Date.now() - inicio >= 30000) {
                window.clearInterval(intervalo);
                return;
            }
            acao.recarregar();
            saga.recarregar();
        }, 2000);
        return () => window.clearInterval(intervalo);
    }, [a?.estado, acaoId, inicio, acao.recarregar, saga.recarregar]);
    const equipe = disponibilidade.dados?.equipes?.find(
        (e) => e.equipeId === a?.equipeId
    )?.equipeNome;
    const recurso = disponibilidade.dados?.recursos?.find(
        (r) => r.recursoId === a?.recursoId
    )?.identificacao;
    const regiao =
        painel.dados?.regioes.find((r) => r.regiaoId === a?.regiaoId)?.nome ??
        'Região não identificada';
    const passos = [...(saga.dados?.passos ?? [])].sort(
        (x, y) => Date.parse(x.registradoEm) - Date.parse(y.registradoEm)
    );
    return (
        <Pagina
            titulo={a ? rotulo(a.tipo) : 'Detalhe da ação'}
            sobretitulo={a ? `${regiao} · ${dataCurta(a.data)} · ${rotulo(a.turno)}` : undefined}
            acoes={a && <ChipEstado estado={a.estado} />}
        >
            <EstadoTela
                carregando={acao.carregando && !a}
                erro={acao.erro}
                aoTentarDeNovo={acao.recarregar}
            >
                {a && (
                    <Stack spacing={2}>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Resultado</Typography>
                            {a.estado === 'PENDENTE' ? (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <CircularProgress size={18} />
                                    <Typography>Reservando equipe e veículo…</Typography>
                                </Stack>
                            ) : a.estado === 'CONFIRMADA' ? (
                                <Typography>
                                    Equipe {equipe ?? 'não identificada'} e{' '}
                                    {recurso ?? 'veículo não identificado'} reservados para{' '}
                                    {dataCurta(a.data)}, {rotulo(a.turno).toLowerCase()}.
                                </Typography>
                            ) : a.estado === 'REJEITADA' ? (
                                <Typography>
                                    {legivel(a.motivoRejeicao ?? 'A ação foi rejeitada.')}
                                </Typography>
                            ) : a.estado === 'CANCELADA' ? (
                                <Typography>
                                    {legivel(a.motivoCancelamento ?? 'A ação foi cancelada.')}
                                </Typography>
                            ) : (
                                <Typography>
                                    Estado atual:{' '}
                                    {a.estado === 'CONCLUIDA' ? 'concluída' : 'em andamento'}.
                                </Typography>
                            )}
                            {disponibilidade.erro && (
                                <Alert severity="warning">
                                    Não foi possível carregar os nomes da equipe e do veículo.{' '}
                                    <Button onClick={disponibilidade.recarregar}>
                                        Tentar de novo
                                    </Button>
                                </Alert>
                            )}
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Linha do tempo</Typography>
                            <EstadoTela
                                carregando={saga.carregando && !saga.dados}
                                erro={saga.erro}
                                aoTentarDeNovo={saga.recarregar}
                            >
                                {passos.length ? (
                                    passos.map((p, i) => {
                                        const recusa = p.mensagem.includes('Recusada'),
                                            compensacao =
                                                p.mensagem.startsWith('Liberar') ||
                                                p.mensagem.endsWith('Liberada') ||
                                                p.mensagem.endsWith('Liberado');
                                        return (
                                            <Box key={i} sx={{ mt: 1.5 }}>
                                                <Alert
                                                    severity={
                                                        recusa
                                                            ? 'error'
                                                            : compensacao
                                                              ? 'warning'
                                                              : 'info'
                                                    }
                                                >
                                                    <Typography variant="body2">
                                                        {dataHora(p.registradoEm)}
                                                        {compensacao ? ' · Compensação' : ''}
                                                    </Typography>
                                                    {frases[p.mensagem] ?? 'Etapa registrada'}
                                                    {recusa && p.detalhe
                                                        ? `: ${legivel(p.detalhe)}`
                                                        : ''}
                                                </Alert>
                                                <Bastidores>
                                                    <Typography variant="body2">
                                                        {p.mensagem} · {p.direcao} ·{' '}
                                                        {p.participante ?? '—'}
                                                    </Typography>
                                                </Bastidores>
                                            </Box>
                                        );
                                    })
                                ) : (
                                    <Typography color="text.secondary">
                                        Nenhuma etapa registrada ainda.
                                    </Typography>
                                )}
                            </EstadoTela>
                        </Paper>
                        <Paper sx={{ p: 2.5 }}>
                            <Typography variant="h6">Dados da ação</Typography>
                            <Typography>Descrição: {a.descricao || 'Não informada'}</Typography>
                            <Typography>Especialidade: {rotulo(a.especialidade)}</Typography>
                            <Typography>
                                Veículo ou equipamento: {rotulo(a.categoriaRecurso)}
                            </Typography>
                            {a.sinalizacaoId && (
                                <Button
                                    component={Link}
                                    to={`/sinalizacoes?regiaoId=${a.regiaoId}&sinalizacaoId=${a.sinalizacaoId}`}
                                >
                                    Ver sinalização de origem
                                </Button>
                            )}
                        </Paper>
                        <Bastidores>
                            {saga.dados && (
                                <Typography>
                                    SAGA: {saga.dados.sagaId} · Estado: {saga.dados.estado} ·
                                    Duração:{' '}
                                    {saga.dados.encerradaEm
                                        ? `${Date.parse(saga.dados.encerradaEm) - Date.parse(saga.dados.iniciadaEm)} ms`
                                        : 'em andamento'}
                                </Typography>
                            )}
                        </Bastidores>
                    </Stack>
                )}
            </EstadoTela>
        </Pagina>
    );
}
