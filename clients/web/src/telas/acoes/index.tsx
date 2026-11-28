import {
    Alert,
    Box,
    Button,
    MenuItem,
    Pagination,
    Paper,
    Stack,
    Tab,
    Tabs,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useSessao } from '../../auth';
import { Bastidores } from '../../bastidores';
import { ChipEstado } from '../../componentes/ChipEstado';
import { EstadoTela } from '../../componentes/EstadoTela';
import { Pagina } from '../../componentes/Layout';
import { mensagemErro } from '../../erros';
import { useConsulta } from '../../useConsulta';
import { obterPainel } from '../visao_geral/api';
import { Acao, dataCurta, Disponibilidade, listar, rotulo, Turno } from '../comum';
const turnos = ['MANHA', 'TARDE', 'NOITE'];
const tipos = ['VISTORIA', 'LIMPEZA_DRENAGEM', 'DESOBSTRUCAO', 'INSPECAO_PONTO_CRITICO'];
const especialidades = ['DRENAGEM', 'VISTORIA', 'DESOBSTRUCAO', 'GERAL'];
const categorias = [
    'CAMINHAO_HIDROJATO',
    'RETROESCAVADEIRA',
    'CAMINHONETE',
    'BOMBA_SUCCAO',
    'KIT_VISTORIA',
];
function motivoLegivel(texto: string) {
    return texto
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
        .replace(/\b[A-Z][A-Z_]{2,}\b/g, (valor) => {
            const conhecido = rotulo(valor);
            return conhecido === '—'
                ? valor.toLowerCase().replace(/_/g, ' ')
                : conhecido.toLowerCase();
        });
}
function hoje() {
    const d = new Date();
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
}
function Grade({
    titulo,
    linhas,
    turno,
}: {
    titulo: string;
    linhas: { id: string; nome: string; turnos: Turno[] }[] | null;
    turno: string;
}) {
    return (
        <Box>
            <Typography variant="subtitle1" fontWeight={600}>
                {titulo}
            </Typography>
            {linhas === null ? (
                <Alert severity="warning">Disponibilidade não está acessível agora.</Alert>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Nome</TableCell>
                            {turnos.map((t) => (
                                <TableCell
                                    key={t}
                                    sx={{
                                        fontWeight: t === turno ? 700 : 400,
                                        bgcolor: t === turno ? 'action.selected' : undefined,
                                    }}
                                >
                                    {rotulo(t)}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {linhas.map((l) => (
                            <TableRow key={l.id}>
                                <TableCell>{l.nome}</TableCell>
                                {turnos.map((t) => {
                                    const v = l.turnos.find((x) => x.turno === t);
                                    return (
                                        <TableCell
                                            key={t}
                                            sx={{
                                                bgcolor:
                                                    t === turno ? 'action.selected' : undefined,
                                            }}
                                        >
                                            {!v
                                                ? '—'
                                                : v.disponivel
                                                  ? 'Livre'
                                                  : v.motivo === 'EM_MANUTENCAO'
                                                    ? 'Em manutenção'
                                                    : 'Ocupado'}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
            {linhas?.length === 0 && (
                <Typography color="text.secondary">Nenhum recurso encontrado.</Typography>
            )}
        </Box>
    );
}
function Formulario({
    regiaoInicial,
    sinalizacaoId,
    aoFechar,
}: {
    regiaoInicial: string;
    sinalizacaoId: string;
    aoFechar: () => void;
}) {
    const navigate = useNavigate();
    const [regiaoId, setRegiao] = useState(regiaoInicial),
        [tipo, setTipo] = useState('VISTORIA'),
        [data, setData] = useState(hoje()),
        [turno, setTurno] = useState('MANHA'),
        [especialidade, setEspecialidade] = useState('GERAL'),
        [categoria, setCategoria] = useState('KIT_VISTORIA'),
        [descricao, setDescricao] = useState(''),
        [erro, setErro] = useState(''),
        [enviando, setEnviando] = useState(false);
    const painel = useConsulta(obterPainel, []);
    const disponibilidade = useConsulta(
        () =>
            api
                .get<Disponibilidade>('/web/v1/planejamento/disponibilidade', {
                    params: { data, especialidade, categoria },
                })
                .then((r) => r.data),
        [data, especialidade, categoria]
    );
    const enviar = async (e: FormEvent) => {
        e.preventDefault();
        setErro('');
        setEnviando(true);
        try {
            const r = await api.post<Acao>(
                '/web/v1/acoes',
                {
                    regiaoId,
                    tipo,
                    data,
                    turno,
                    especialidade,
                    categoriaRecurso: categoria,
                    ...(descricao.trim() ? { descricao: descricao.trim() } : {}),
                    ...(sinalizacaoId ? { sinalizacaoId } : {}),
                },
                { headers: { 'Idempotency-Key': crypto.randomUUID() } }
            );
            navigate(`/acoes/${r.data.id}`);
        } catch (err) {
            setErro(mensagemErro(err));
            setEnviando(false);
        }
    };
    const d = disponibilidade.dados;
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
            <Paper component="form" onSubmit={enviar} sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Nova ação</Typography>
                    {erro && <Alert severity="error">{erro}</Alert>}
                    {painel.erro && (
                        <Alert severity="error">
                            Não foi possível carregar as regiões.{' '}
                            <Button onClick={painel.recarregar}>Tentar de novo</Button>
                        </Alert>
                    )}
                    <TextField
                        select
                        required
                        label="Região"
                        value={regiaoId}
                        onChange={(e) => setRegiao(e.target.value)}
                    >
                        <MenuItem value="">Selecione</MenuItem>
                        {painel.dados?.regioes.map((r) => (
                            <MenuItem key={r.regiaoId} value={r.regiaoId}>
                                {r.nome}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="Tipo"
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                    >
                        {tipos.map((v) => (
                            <MenuItem key={v} value={v}>
                                {rotulo(v)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        required
                        type="date"
                        label="Data"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: hoje() } }}
                    />
                    <TextField
                        select
                        label="Turno"
                        value={turno}
                        onChange={(e) => setTurno(e.target.value)}
                    >
                        {turnos.map((v) => (
                            <MenuItem key={v} value={v}>
                                {rotulo(v)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="Especialidade da equipe"
                        value={especialidade}
                        onChange={(e) => setEspecialidade(e.target.value)}
                    >
                        {especialidades.map((v) => (
                            <MenuItem key={v} value={v}>
                                {rotulo(v)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        label="Tipo de veículo ou equipamento"
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value)}
                    >
                        {categorias.map((v) => (
                            <MenuItem key={v} value={v}>
                                {rotulo(v)}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        multiline
                        minRows={3}
                        label="Descrição (opcional)"
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        slotProps={{ htmlInput: { maxLength: 500 } }}
                        helperText={`${descricao.length}/500`}
                    />
                    <Stack direction="row" spacing={1}>
                        <Button
                            type="submit"
                            variant="contained"
                            disabled={enviando || !regiaoId || !data || data < hoje()}
                        >
                            Abrir ação
                        </Button>
                        <Button onClick={aoFechar}>Cancelar</Button>
                    </Stack>
                    <Bastidores>
                        <Typography>
                            O envio responde 202: a ação nasce pendente e o resultado vem da SAGA.
                        </Typography>
                    </Bastidores>
                </Stack>
            </Paper>
            <Paper sx={{ p: 2.5 }}>
                <Stack spacing={2}>
                    <Typography variant="h6">Disponibilidade do dia</Typography>
                    <EstadoTela
                        carregando={disponibilidade.carregando}
                        erro={disponibilidade.erro}
                        aoTentarDeNovo={disponibilidade.recarregar}
                    >
                        {d && (
                            <>
                                {d.avisos.map((a, i) => (
                                    <Alert key={i} severity="warning">
                                        {a}
                                    </Alert>
                                ))}
                                {d.equipes &&
                                    !d.equipes.some((e) =>
                                        e.turnos.some((t) => t.turno === turno && t.disponivel)
                                    ) && (
                                        <Alert severity="warning">
                                            Nenhuma equipe livre neste turno; a ação será recusada.
                                        </Alert>
                                    )}
                                {d.recursos &&
                                    !d.recursos.some((e) =>
                                        e.turnos.some((t) => t.turno === turno && t.disponivel)
                                    ) && (
                                        <Alert severity="warning">
                                            Nenhum veículo ou equipamento livre neste turno; a ação
                                            será recusada.
                                        </Alert>
                                    )}
                                <Grade
                                    titulo="Equipes"
                                    turno={turno}
                                    linhas={
                                        d.equipes?.map((e) => ({
                                            id: e.equipeId,
                                            nome: e.equipeNome,
                                            turnos: e.turnos,
                                        })) ?? null
                                    }
                                />
                                <Grade
                                    titulo="Veículos e equipamentos"
                                    turno={turno}
                                    linhas={
                                        d.recursos?.map((e) => ({
                                            id: e.recursoId,
                                            nome: e.identificacao,
                                            turnos: e.turnos,
                                        })) ?? null
                                    }
                                />
                            </>
                        )}
                    </EstadoTela>
                </Stack>
            </Paper>
        </Box>
    );
}
export default function Acoes() {
    const [query] = useSearchParams();
    const gestor = useSessao().temPerfil('GESTOR');
    const [form, setForm] = useState(gestor && !!query.get('regiaoId'));
    const [estado, setEstado] = useState(''),
        [pagina, setPagina] = useState(1);
    const regiaoId = query.get('regiaoId') ?? '';
    const painel = useConsulta(obterPainel, []);
    const lista = useConsulta(
        () =>
            listar<Acao>('/web/v1/acoes', {
                estado: estado || undefined,
                regiaoId: regiaoId || undefined,
                pagina,
                tamanho: 20,
            }),
        [estado, regiaoId, pagina]
    );
    return (
        <Pagina
            titulo="Ações"
            sobretitulo="Lavras, MG"
            acoes={
                gestor &&
                !form && (
                    <Button variant="contained" onClick={() => setForm(true)}>
                        Nova ação
                    </Button>
                )
            }
        >
            {form && gestor ? (
                <Formulario
                    regiaoInicial={regiaoId}
                    sinalizacaoId={query.get('sinalizacaoId') ?? ''}
                    aoFechar={() => setForm(false)}
                />
            ) : (
                <Stack spacing={2}>
                    <Paper>
                        <Tabs
                            value={estado}
                            onChange={(_, v: string) => {
                                setEstado(v);
                                setPagina(1);
                            }}
                            variant="scrollable"
                        >
                            <Tab label="Todas" value="" />
                            <Tab label="Pendentes" value="PENDENTE" />
                            <Tab label="Confirmadas" value="CONFIRMADA" />
                            <Tab label="Rejeitadas" value="REJEITADA" />
                            <Tab label="Canceladas" value="CANCELADA" />
                        </Tabs>
                    </Paper>
                    {painel.erro && (
                        <Alert severity="warning">
                            Não foi possível carregar as regiões.{' '}
                            <Button onClick={painel.recarregar}>Tentar de novo</Button>
                        </Alert>
                    )}
                    <EstadoTela
                        carregando={lista.carregando && !lista.dados}
                        erro={lista.erro}
                        aoTentarDeNovo={lista.recarregar}
                        vazio={lista.dados?.itens.length === 0}
                        mensagemVazio="Nenhuma ação encontrada."
                    >
                        {lista.dados && (
                            <>
                                <Typography>{lista.dados.total} ações</Typography>
                                {lista.dados.itens.map((a) => (
                                    <Paper key={a.id} sx={{ p: 2 }}>
                                        <Stack
                                            direction="row"
                                            alignItems="center"
                                            spacing={2}
                                            flexWrap="wrap"
                                        >
                                            <Button component={Link} to={`/acoes/${a.id}`}>
                                                {rotulo(a.tipo)}
                                            </Button>
                                            <Typography>
                                                {painel.dados?.regioes.find(
                                                    (r) => r.regiaoId === a.regiaoId
                                                )?.nome ?? 'Região não identificada'}
                                            </Typography>
                                            <Typography>
                                                {dataCurta(a.data)} · {rotulo(a.turno)}
                                            </Typography>
                                            <ChipEstado estado={a.estado} />
                                        </Stack>
                                        {a.motivoRejeicao && (
                                            <Typography color="text.secondary">
                                                {motivoLegivel(a.motivoRejeicao)}
                                            </Typography>
                                        )}
                                        <Bastidores>
                                            <Typography>
                                                Ação: {a.id} · Equipe: {a.equipeId ?? '—'} ·
                                                Recurso: {a.recursoId ?? '—'}
                                            </Typography>
                                        </Bastidores>
                                    </Paper>
                                ))}
                                <Pagination
                                    count={Math.ceil(lista.dados.total / 20)}
                                    page={pagina}
                                    onChange={(_, p) => setPagina(p)}
                                />
                            </>
                        )}
                    </EstadoTela>
                </Stack>
            )}
        </Pagina>
    );
}
