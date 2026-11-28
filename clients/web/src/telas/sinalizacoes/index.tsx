import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    MenuItem,
    Pagination,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useSessao } from '../../auth';
import { Bastidores } from '../../bastidores';
import { ChipEstado } from '../../componentes/ChipEstado';
import { ChipNivel } from '../../componentes/ChipNivel';
import { EstadoTela } from '../../componentes/EstadoTela';
import { Pagina } from '../../componentes/Layout';
import { mensagemErro } from '../../erros';
import { useConsulta } from '../../useConsulta';
import { obterPainel } from '../visao_geral/api';
import { dataHora, listar, rotulo, Sinalizacao } from '../comum';
export default function Sinalizacoes() {
    const [query] = useSearchParams();
    const [estado, setEstado] = useState('ABERTA'),
        [origem, setOrigem] = useState(''),
        [regiao, setRegiao] = useState(query.get('regiaoId') ?? ''),
        [pagina, setPagina] = useState(1);
    const [erro, setErro] = useState(''),
        [ocupado, setOcupado] = useState(''),
        [reconhecidas, setReconhecidas] = useState<Record<string, string>>({});
    const sessao = useSessao();
    const lista = useConsulta(
        () =>
            listar<Sinalizacao>('/web/v1/sinalizacoes', {
                estado: estado || undefined,
                origem: origem || undefined,
                regiaoId: regiao || undefined,
                pagina,
                tamanho: 20,
            }),
        [estado, origem, regiao, pagina]
    );
    const painel = useConsulta(obterPainel, []);
    const sinalizacaoId = query.get('sinalizacaoId');
    const origemAcao = useConsulta(
        () =>
            sinalizacaoId
                ? api.get<Sinalizacao>(`/web/v1/sinalizacoes/${sinalizacaoId}`).then((r) => r.data)
                : Promise.resolve(null),
        [sinalizacaoId]
    );
    const reconhecer = async (id: string) => {
        setErro('');
        setOcupado(id);
        try {
            const r = await api.post<Sinalizacao>(`/web/v1/sinalizacoes/${id}/reconhecimento`);
            setReconhecidas((a) => ({
                ...a,
                [id]: r.data.reconhecidaEm || new Date().toISOString(),
            }));
        } catch (e) {
            setErro(mensagemErro(e));
            if ((e as { response?: { status: number } }).response?.status === 409)
                lista.recarregar();
        } finally {
            setOcupado('');
        }
    };
    return (
        <Pagina titulo="Sinalizações" sobretitulo="Lavras, MG">
            <Stack spacing={2}>
                {sinalizacaoId && (
                    <Paper sx={{ p: 2.5 }}>
                        <Typography variant="h6">Sinalização de origem</Typography>
                        <EstadoTela
                            carregando={origemAcao.carregando}
                            erro={origemAcao.erro}
                            aoTentarDeNovo={origemAcao.recarregar}
                        >
                            {origemAcao.dados && (
                                <Stack spacing={1}>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                        <ChipNivel nivel={origemAcao.dados.nivelAtencao} />
                                        <ChipEstado estado={origemAcao.dados.estado} />
                                    </Box>
                                    <Typography>{origemAcao.dados.motivo}</Typography>
                                    <Typography color="text.secondary">
                                        {rotulo(origemAcao.dados.origem)} ·{' '}
                                        {dataHora(origemAcao.dados.emitidaEm)}
                                    </Typography>
                                    {origemAcao.dados.fatores?.map((f, i) => (
                                        <Typography key={i}>
                                            {f.descricao} · {f.fonte}
                                        </Typography>
                                    ))}
                                </Stack>
                            )}
                        </EstadoTela>
                    </Paper>
                )}
                <Paper sx={{ p: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        select
                        label="Estado"
                        value={estado}
                        onChange={(e) => {
                            setEstado(e.target.value);
                            setPagina(1);
                        }}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="">Todas</MenuItem>
                        <MenuItem value="ABERTA">Abertas</MenuItem>
                        <MenuItem value="RECONHECIDA">Reconhecidas</MenuItem>
                        <MenuItem value="ENCERRADA">Encerradas</MenuItem>
                    </TextField>
                    <TextField
                        select
                        label="Região"
                        value={regiao}
                        onChange={(e) => {
                            setRegiao(e.target.value);
                            setPagina(1);
                        }}
                        sx={{ minWidth: 200 }}
                    >
                        <MenuItem value="">Todas</MenuItem>
                        {painel.dados?.regioes.map((r) => (
                            <MenuItem key={r.regiaoId} value={r.regiaoId}>
                                {r.nome}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="Origem"
                        value={origem}
                        onChange={(e) => {
                            setOrigem(e.target.value);
                            setPagina(1);
                        }}
                        sx={{ minWidth: 180 }}
                    >
                        <MenuItem value="">Todas</MenuItem>
                        <MenuItem value="OBSERVADO">Observada</MenuItem>
                        <MenuItem value="PREVISTO">Prevista</MenuItem>
                    </TextField>
                </Paper>
                {painel.erro && (
                    <Alert severity="warning">
                        Não foi possível carregar as regiões.{' '}
                        <Button onClick={painel.recarregar}>Tentar de novo</Button>
                    </Alert>
                )}
                {erro && (
                    <Alert severity="error" onClose={() => setErro('')}>
                        {erro}
                    </Alert>
                )}
                <EstadoTela
                    carregando={lista.carregando && !lista.dados}
                    erro={lista.erro}
                    aoTentarDeNovo={lista.recarregar}
                    vazio={lista.dados?.itens.length === 0}
                    mensagemVazio="Nenhuma sinalização encontrada."
                >
                    {lista.dados && (
                        <>
                            <Typography>{lista.dados.total} sinalizações</Typography>
                            {lista.dados.itens.map((s) => {
                                const atual = reconhecidas[s.id] ? 'RECONHECIDA' : s.estado;
                                return (
                                    <Accordion key={s.id}>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    gap: 1.5,
                                                    alignItems: 'center',
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <ChipNivel nivel={s.nivelAtencao} />
                                                <Typography fontWeight={600}>
                                                    {painel.dados?.regioes.find(
                                                        (r) => r.regiaoId === s.regiaoId
                                                    )?.nome ?? 'Região não identificada'}
                                                </Typography>
                                                <Typography>{s.motivo}</Typography>
                                                <Typography>
                                                    {rotulo(s.origem)} · {dataHora(s.emitidaEm)}
                                                </Typography>
                                                <ChipEstado estado={atual} />
                                            </Box>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <Stack spacing={1}>
                                                {s.fatores?.map((f, i) => (
                                                    <Typography key={i}>
                                                        {f.descricao} · {f.fonte}
                                                    </Typography>
                                                ))}
                                                {(reconhecidas[s.id] || s.reconhecidaEm) && (
                                                    <Typography>
                                                        Reconhecida em{' '}
                                                        {dataHora(
                                                            reconhecidas[s.id] || s.reconhecidaEm
                                                        )}
                                                    </Typography>
                                                )}
                                                <Stack direction="row" spacing={1}>
                                                    {sessao.temPerfil('TECNICO') &&
                                                        atual === 'ABERTA' && (
                                                            <Button
                                                                variant="contained"
                                                                disabled={!!ocupado}
                                                                onClick={() => reconhecer(s.id)}
                                                            >
                                                                Reconhecer
                                                            </Button>
                                                        )}
                                                    {sessao.temPerfil('GESTOR') && (
                                                        <Button
                                                            component={Link}
                                                            to={`/acoes?regiaoId=${s.regiaoId}&sinalizacaoId=${s.id}`}
                                                        >
                                                            Abrir ação
                                                        </Button>
                                                    )}
                                                </Stack>
                                                <Bastidores>
                                                    <Typography>
                                                        Sinalização: {s.id} · Reconhecida por:{' '}
                                                        {s.reconhecidaPor ?? '—'}
                                                    </Typography>
                                                </Bastidores>
                                            </Stack>
                                        </AccordionDetails>
                                    </Accordion>
                                );
                            })}
                            <Pagination
                                count={Math.ceil(lista.dados.total / 20)}
                                page={pagina}
                                onChange={(_, p) => setPagina(p)}
                            />
                        </>
                    )}
                </EstadoTela>
                <Bastidores>
                    <Typography>
                        O reconhecimento grava no modelo de escrita; o panorama é atualizado depois
                        por evento.
                    </Typography>
                </Bastidores>
            </Stack>
        </Pagina>
    );
}
