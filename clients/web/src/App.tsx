import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { ReactNode, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate, Route, Routes } from 'react-router-dom';

import { consumirAvisoDeSessaoExpirada, useSessao } from './auth';
import { EstadoTela } from './componentes/EstadoTela';
import { Layout } from './componentes/Layout';
import { rotasPermitidas } from './perfis';
import { ROTA_INICIAL, ROTAS } from './rotas';

/** Cartão centralizado das páginas fora da casca: entrada, erro de login e conta sem acesso. */
function Cartao({ children }: { children: ReactNode }) {
    return (
        <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
            <Paper sx={{ p: 4, width: '100%', maxWidth: 420, textAlign: 'center' }}>
                <Box component="img" src="/logo.png" alt="Pluvia" sx={{ width: 180, mb: 2 }} />
                {children}
            </Paper>
        </Box>
    );
}

function Entrada({ erro }: { erro?: string }) {
    const sessao = useSessao();
    const [expirou] = useState(consumirAvisoDeSessaoExpirada);
    return (
        <Cartao>
            <Typography variant="h2" gutterBottom>
                Prevenção de alagamentos em Lavras
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
                Painel da equipe técnica e da gestão.
            </Typography>
            {expirou && (
                <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                    Sua sessão expirou. Entre novamente para continuar.
                </Alert>
            )}
            {erro && (
                <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
                    Não foi possível concluir o login. Tente entrar de novo.
                </Alert>
            )}
            <Button fullWidth size="large" variant="contained" onClick={sessao.entrar}>
                Entrar
            </Button>
        </Cartao>
    );
}

function SemAcesso() {
    const sessao = useSessao();
    return (
        <Cartao>
            <Typography variant="h2" gutterBottom>
                Conta sem acesso ao painel
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
                O painel web é da equipe técnica e da gestão. A conta {sessao.usuario} não tem
                nenhum desses perfis.
            </Typography>
            <Button fullWidth variant="outlined" onClick={sessao.sair}>
                Sair
            </Button>
        </Cartao>
    );
}

export default function App() {
    const auth = useAuth();
    const sessao = useSessao();

    if (auth.isLoading) {
        return (
            <Box sx={{ p: 4 }}>
                <EstadoTela carregando>{null}</EstadoTela>
            </Box>
        );
    }
    if (!auth.isAuthenticated) return <Entrada erro={auth.error?.message} />;
    if (sessao.perfis.length === 0) return <SemAcesso />;

    const rotas = rotasPermitidas(ROTAS, sessao.perfis);
    return (
        <Routes>
            <Route element={<Layout rotas={rotas} />}>
                {rotas.map(({ caminho, tela: Tela }) => (
                    <Route key={caminho} path={caminho} element={<Tela />} />
                ))}
                {/* Também recebe o retorno do login em /auth/callback, já processado. */}
                <Route path="*" element={<Navigate to={ROTA_INICIAL} replace />} />
            </Route>
        </Routes>
    );
}
