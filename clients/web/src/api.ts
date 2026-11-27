import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

import { API_URL, expirarSessao, userManager } from './auth';

type ConfigRepetida = InternalAxiosRequestConfig & { _repetida?: boolean };

/** Cliente das chamadas ao BFF Web, pelo Kong. Cada tela declara as suas no próprio `api.ts`. */
export const api = axios.create({ baseURL: API_URL, headers: { Accept: 'application/json' } });

api.interceptors.request.use(async (config) => {
    const usuario = await userManager.getUser();
    if (usuario) config.headers.Authorization = `Bearer ${usuario.access_token}`;
    return config;
});

// Várias chamadas podem receber 401 ao mesmo tempo: todas esperam a mesma renovação.
let renovando: Promise<unknown> | null = null;

api.interceptors.response.use(
    (resposta) => resposta,
    async (erro: AxiosError) => {
        const config = erro.config as ConfigRepetida | undefined;
        if (erro.response?.status !== 401 || !config || config._repetida) {
            return Promise.reject(erro);
        }
        config._repetida = true;
        try {
            renovando ??= userManager.signinSilent().finally(() => {
                renovando = null;
            });
            await renovando;
        } catch {
            await expirarSessao();
            return Promise.reject(new Error('Sua sessão expirou. Entre novamente.'));
        }
        return api(config);
    }
);
