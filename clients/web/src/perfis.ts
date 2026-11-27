/** Perfis que o painel web reconhece. Os demais papéis do realm (como AGENTE) não dão acesso. */
export const PERFIS = ['GESTOR', 'TECNICO'] as const;
export type Perfil = (typeof PERFIS)[number];

function ehPerfil(valor: unknown): valor is Perfil {
    return PERFIS.includes(valor as Perfil);
}

/**
 * Lê os perfis do painel em `realm_access.roles` do access token do Keycloak.
 * O id token não traz os papéis de realm, por isso a leitura é do access token.
 */
export function perfisDoToken(accessToken: string | undefined): Perfil[] {
    try {
        const parte = accessToken?.split('.')[1];
        if (!parte) return [];
        const binario = atob(parte.replace(/-/g, '+').replace(/_/g, '/'));
        const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        const papeis: unknown = payload?.realm_access?.roles;
        return Array.isArray(papeis) ? papeis.filter(ehPerfil) : [];
    } catch {
        return [];
    }
}

/** Mantém as rotas sem restrição de perfil e as que aceitam algum perfil do usuário. */
export function rotasPermitidas<R extends { perfis?: readonly Perfil[] }>(
    rotas: readonly R[],
    perfis: readonly Perfil[]
): R[] {
    return rotas.filter((rota) => !rota.perfis || rota.perfis.some((p) => perfis.includes(p)));
}
