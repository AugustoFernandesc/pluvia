import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from 'react-oidc-context';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { userManager } from './auth';
import { BastidoresProvider } from './bastidores';
import { tema } from './tema';

/** Tira o `code` e o `state` do endereço depois do login, para um F5 não repetir o retorno. */
function limparRetornoDoLogin() {
    window.history.replaceState({}, document.title, '/');
}

createRoot(document.getElementById('root')!).render(
    <AuthProvider userManager={userManager} onSigninCallback={limparRetornoDoLogin}>
        <ThemeProvider theme={tema}>
            <CssBaseline />
            <BastidoresProvider>
                <BrowserRouter>
                    <App />
                </BrowserRouter>
            </BastidoresProvider>
        </ThemeProvider>
    </AuthProvider>
);
