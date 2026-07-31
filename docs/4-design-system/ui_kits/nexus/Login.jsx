// V.tal Nexus UI kit — Login
function Login({ onLogin }) {
  const { Button, Input } = window.VTalNexusDesignSystem_63587b;
  const [email, setEmail] = React.useState('niraldo@vtal.com.br');
  const [pwd, setPwd] = React.useState('••••••••');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
      {/* Brand panel */}
      <div style={{ background: 'var(--surface-sidebar)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 48, color: '#fff' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.07, backgroundImage: 'radial-gradient(circle, var(--vt-yellow) 1.2px, transparent 1.2px)', backgroundSize: '26px 26px' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="../../assets/nexus-mark-white.svg" alt="Nexus" style={{ height: 34 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, letterSpacing: '-0.01em', color: '#fff' }}>Nexus</span>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 32, lineHeight: 1.15, letterSpacing: '-0.02em', maxWidth: 420 }}>
            Inteligência de rede de <span style={{ color: 'var(--vt-yellow)' }}>nova geração</span>.
          </div>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', marginTop: 16, maxWidth: 400, lineHeight: 1.6 }}>
            Inventário de Redes da V.tal — Geosite, Logradouros, Geonet e Viabilidade Fuzzy unificados sob arquitetura modular, API-first e padrão TM Forum.
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            {['TM Forum', 'API-first', 'Escala nacional'].map((t) => (
              <span key={t} style={{ fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}>{t}</span>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Holding V.tal · Tecto · nio internet</div>
      </div>

      {/* Form panel */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, background: 'var(--surface-card)' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ font: 'var(--text-h2)', letterSpacing: '-0.02em', marginBottom: 4 }}>Acessar a plataforma</div>
          <p style={{ fontSize: 13.5, color: 'var(--text-tertiary)', marginBottom: 28 }}>Use suas credenciais funcionais V.tal.</p>
          <form onSubmit={(e) => { e.preventDefault(); onLogin(); }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Input label="E-mail funcional" iconLeft={<Icon name="mail" size={16} />} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="Senha" type="password" iconLeft={<Icon name="lock" size={16} />} value={pwd} onChange={(e) => setPwd(e.target.value)} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <a style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>Esqueci minha senha</a>
            </div>
            <Button variant="primary" size="lg" fullWidth type="submit" iconRight={<Icon name="arrow-right" size={17} />}>Entrar</Button>
          </form>
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <Icon name="shield-check" size={14} color="var(--status-green)" />
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Conexão segura · SSO corporativo V.tal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Login });
