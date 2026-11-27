import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { useAuth } from 'react-oidc-context';

import { Perfil, perfisDoToken } from './perfis';

/** Endereços publicados pelo Kong. Os padrões são os do ambiente local do Compose. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const AUTHORITY: string =
    import.meta.env.VITE_KEYCLOAK_AUTHORITY ?? `${API_URL}/auth/realms/pluvia`;
const CLIENT_ID: string = import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'pluvia-web';

const OIDC = `${AUTHORITY}/protocol/openid-connect`;
const CHAVE_SESSAO_EXPIRADA = 'pluvia.sessao-expirada';

/**
 * Login por Authorization Code com PKCE S256 (padrão da biblioteca), sem client secret.
 * Os endpoints são declarados aqui para o painel não depender da descoberta OIDC.
 */
export const userManager = new UserManager({
    authority: AUTHORITY,
    metadata: {
        issuer: AUTHORITY,
        authorization_endpoint: `${OIDC}/auth`,
        token_endpoint: `${OIDC}/token`,
        end_session_endpoint: `${OIDC}/logout`,
    },
    client_id: CLIENT_ID,
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid profile email',
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
});

/** Encerra a sessão local depois de uma renovação que falhou; a casca volta à entrada. */
export async function expirarSessao(): Promise<void> {
    sessionStorage.setItem(CHAVE_SESSAO_EXPIRADA, '1');
    await userManager.removeUser();
}

/** Diz, uma única vez, se a entrada está sendo mostrada porque a sessão expirou. */
export function consumirAvisoDeSessaoExpirada(): boolean {
    const expirou = sessionStorage.getItem(CHAVE_SESSAO_EXPIRADA) === '1';
    sessionStorage.removeItem(CHAVE_SESSAO_EXPIRADA);
    return expirou;
}

export interface Sessao {
    usuario: string;
    perfis: Perfil[];
    temPerfil: (perfil: Perfil) => boolean;
    entrar: () => Promise<void>;
    sair: () => Promise<void>;
}

/** Usuário, perfis e ações de sessão para as telas. */
export function useSessao(): Sessao {
    const auth = useAuth();
    const perfis = perfisDoToken(auth.user?.access_token);
    const perfil = auth.user?.profile;
    return {
        usuario: perfil?.preferred_username ?? perfil?.name ?? 'Usuário',
        perfis,
        temPerfil: (p) => perfis.includes(p),
        entrar: () => auth.signinRedirect(),
        sair: () => auth.signoutRedirect(),
    };
}
