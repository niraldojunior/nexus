// Resolve a opção `ssl` do `pg` a partir da própria connection string.
//
// Neon exige TLS e traz `sslmode=require` na URL → { rejectUnauthorized: false }
// (o proxy TLS corporativo reescreve a cadeia; validar a CA quebraria).
// Um Postgres em contêiner, no mesmo host, não fala TLS → a URL vem sem
// `sslmode` (ou com `sslmode=disable`) → `false`, senão o `pg` falha com
// "The server does not support SSL connections".
export const sslFor = (url) => {
  try {
    const mode = new URL(url).searchParams.get('sslmode');
    return mode === null || mode === 'disable' ? false : { rejectUnauthorized: false };
  } catch {
    // URL malformada: mantém o comportamento histórico (TLS relaxado).
    return { rejectUnauthorized: false };
  }
};
