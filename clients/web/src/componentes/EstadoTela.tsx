import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { ReactNode } from 'react';

interface Props {
    carregando: boolean;
    erro?: string;
    aoTentarDeNovo?: () => void;
    /** Mostra `mensagemVazio` no lugar dos filhos quando a consulta deu certo e não trouxe nada. */
    vazio?: boolean;
    mensagemVazio?: string;
    children: ReactNode;
}

/**
 * Estados de uma consulta: carregando, erro com "Tentar de novo", vazio ou os dados.
 * Enquanto recarrega dados que já estavam na tela, os filhos continuam visíveis.
 *
 *     <EstadoTela carregando={carregando && !dados} erro={erro} aoTentarDeNovo={recarregar}>
 */
export function EstadoTela({
    carregando,
    erro,
    aoTentarDeNovo,
    vazio,
    mensagemVazio,
    children,
}: Props) {
    if (carregando) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4 }} role="status">
                <CircularProgress size={22} />
                <Typography color="text.secondary">Carregando…</Typography>
            </Box>
        );
    }
    if (erro) {
        return (
            <Alert
                severity="error"
                action={
                    aoTentarDeNovo && (
                        <Button color="inherit" size="small" onClick={aoTentarDeNovo}>
                            Tentar de novo
                        </Button>
                    )
                }
            >
                {erro}
            </Alert>
        );
    }
    if (vazio) {
        return (
            <Typography color="text.secondary" sx={{ py: 4 }}>
                {mensagemVazio ?? 'Nada para mostrar por aqui.'}
            </Typography>
        );
    }
    return <>{children}</>;
}
