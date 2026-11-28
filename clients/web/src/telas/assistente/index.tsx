import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Alert,
    Box,
    Button,
    CircularProgress,
    Paper,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FormEvent, useState } from 'react';
import { api } from '../../api';
import { Bastidores } from '../../bastidores';
import { Pagina } from '../../componentes/Layout';
import { mensagemErro } from '../../erros';
interface Resposta {
    resposta: string;
    trechos: { titulo: string; trecho: string }[];
    origem: string;
    modelo: string | null;
    latenciaMs: number;
    buscaDegradada: boolean;
    etapasMs: Record<string, number>;
}
interface Consulta {
    pergunta: string;
    com: Resposta;
    sem?: Resposta;
}
const exemplos = [
    'Qual percentil e janela definem o nível de atenção?',
    'O que fazer em alta atenção?',
    'Quais cuidados tomar na limpeza depois de um alagamento?',
];
function RespostaCard({ titulo, dados }: { titulo: string; dados: Resposta }) {
    return (
        <Paper sx={{ p: 2.5, minWidth: 0 }}>
            <Typography variant="h6">{titulo}</Typography>
            {dados.origem === 'FALLBACK' && (
                <Alert severity="warning" sx={{ my: 1 }}>
                    O modelo de linguagem não respondeu; este texto foi montado direto dos trechos
                    encontrados.
                </Alert>
            )}
            <Typography sx={{ whiteSpace: 'pre-wrap', my: 1 }}>{dados.resposta}</Typography>
            {dados.trechos.length > 0 && (
                <>
                    <Typography variant="subtitle1">Trechos consultados</Typography>
                    {dados.trechos.map((t, i) => (
                        <Accordion key={i}>
                            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                {t.titulo}
                            </AccordionSummary>
                            <AccordionDetails>
                                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{t.trecho}</Typography>
                            </AccordionDetails>
                        </Accordion>
                    ))}
                </>
            )}
            <Bastidores>
                <Typography variant="body2">
                    Origem: {dados.origem} · Modelo: {dados.modelo ?? '—'} · Latência:{' '}
                    {dados.latenciaMs} ms
                </Typography>
                {Object.entries(dados.etapasMs ?? {}).map(([etapa, ms]) => (
                    <Typography key={etapa} variant="body2">
                        {etapa}: {ms} ms
                    </Typography>
                ))}
                {dados.buscaDegradada && (
                    <Alert severity="info">A busca utilizou o modo degradado.</Alert>
                )}
            </Bastidores>
        </Paper>
    );
}
export default function Assistente() {
    const [pergunta, setPergunta] = useState(''),
        [historico, setHistorico] = useState<Consulta[]>([]),
        [respondendo, setRespondendo] = useState(false),
        [erro, setErro] = useState('');
    const perguntar = async (e: FormEvent) => {
        e.preventDefault();
        const texto = pergunta.trim();
        if (texto.length < 5 || texto.length > 1000) return;
        setRespondendo(true);
        setErro('');
        try {
            const r = await api.post<Resposta>('/web/v1/consultas', {
                pergunta: texto,
                usarRecuperacao: true,
            });
            setHistorico((h) => [{ pergunta: texto, com: r.data }, ...h]);
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setRespondendo(false);
        }
    };
    const comparar = async () => {
        const atual = historico[0];
        if (!atual) return;
        setRespondendo(true);
        setErro('');
        try {
            const r = await api.post<Resposta>('/web/v1/consultas', {
                pergunta: atual.pergunta,
                usarRecuperacao: false,
            });
            setHistorico((h) => [{ ...h[0], sem: r.data }, ...h.slice(1)]);
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setRespondendo(false);
        }
    };
    const atual = historico[0];
    return (
        <Pagina titulo="Assistente" sobretitulo="Base de conhecimento">
            <Stack spacing={2}>
                <Paper component="form" onSubmit={perguntar} sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                        <TextField
                            label="Sua pergunta"
                            multiline
                            minRows={3}
                            value={pergunta}
                            onChange={(e) => setPergunta(e.target.value)}
                            slotProps={{ htmlInput: { maxLength: 1000 } }}
                            helperText={`${pergunta.length}/1000 · mínimo de 5 caracteres`}
                        />
                        <Box>
                            <Button
                                type="submit"
                                variant="contained"
                                disabled={respondendo || pergunta.trim().length < 5}
                            >
                                Perguntar
                            </Button>
                        </Box>
                        <Typography color="text.secondary">Experimente perguntar:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {exemplos.map((p) => (
                                <Button
                                    key={p}
                                    variant="outlined"
                                    size="small"
                                    onClick={() => setPergunta(p)}
                                >
                                    {p}
                                </Button>
                            ))}
                        </Box>
                    </Stack>
                </Paper>
                {respondendo && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CircularProgress size={20} />
                        <Typography>Consultando a base de conhecimento…</Typography>
                    </Stack>
                )}
                {erro && (
                    <Alert severity="error" onClose={() => setErro('')}>
                        {erro}
                    </Alert>
                )}
                {atual && (
                    <>
                        <Typography variant="h6">{atual.pergunta}</Typography>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: {
                                    xs: '1fr',
                                    md: atual.sem ? '1fr 1fr' : '1fr',
                                },
                                gap: 2,
                            }}
                        >
                            <RespostaCard titulo="Com a base de conhecimento" dados={atual.com} />
                            {atual.sem && (
                                <RespostaCard
                                    titulo="Sem a base de conhecimento"
                                    dados={atual.sem}
                                />
                            )}
                        </Box>
                        {!atual.sem && (
                            <Box>
                                <Button onClick={comparar} disabled={respondendo}>
                                    Comparar sem a base
                                </Button>
                            </Box>
                        )}
                    </>
                )}
                {historico.length > 1 && (
                    <Paper sx={{ p: 2.5 }}>
                        <Typography variant="h6">Histórico da sessão</Typography>
                        {historico.slice(1).map((h, i) => (
                            <Accordion key={i}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    {h.pergunta}
                                </AccordionSummary>
                                <AccordionDetails>
                                    <RespostaCard
                                        titulo="Com a base de conhecimento"
                                        dados={h.com}
                                    />
                                    {h.sem && (
                                        <RespostaCard
                                            titulo="Sem a base de conhecimento"
                                            dados={h.sem}
                                        />
                                    )}
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Paper>
                )}
            </Stack>
        </Pagina>
    );
}
