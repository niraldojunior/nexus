import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';

// Coordenada devolvida pelo botão ao chamador (o mapa), que a usa para centralizar,
// aproximar e cravar o ponto "minha localização".
export type DeviceLocation = { lat: number; lng: number; accuracy: number };

type LocateStatus = 'idle' | 'locating' | 'error';

// Mensagens por código de erro da Geolocation API do navegador (PERMISSION_DENIED = 1,
// POSITION_UNAVAILABLE = 2, TIMEOUT = 3).
const GEO_ERROR_MESSAGES: Record<number, string> = {
  1: 'Permissão de localização negada. Autorize o acesso no navegador para usar sua posição.',
  2: 'Não foi possível determinar sua localização no momento.',
  3: 'A busca pela sua localização demorou demais. Tente novamente.',
};

// Botão flutuante sobre o mapa que pede a geolocalização do dispositivo ao navegador e
// entrega a coordenada ao mapa (ver GoogleMapPanel), que salta para lá com zoom de rua.
// Cuida do próprio ciclo: mostra spinner enquanto adquire e um aviso temporário se falha.
export function MapLocateButton({ onLocate }: { onLocate: (coords: DeviceLocation) => void }) {
  const [status, setStatus] = useState<LocateStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | undefined>(undefined);
  // O callback do mapa muda a cada render; guardamos a versão atual para o handler
  // de sucesso não precisar recriar o getCurrentPosition em curso.
  const onLocateRef = useRef(onLocate);

  useEffect(() => {
    onLocateRef.current = onLocate;
  }, [onLocate]);

  useEffect(
    () => () => {
      if (errorTimeoutRef.current !== undefined) window.clearTimeout(errorTimeoutRef.current);
    },
    [],
  );

  const showError = useCallback((message: string) => {
    setStatus('error');
    setErrorMsg(message);
    if (errorTimeoutRef.current !== undefined) window.clearTimeout(errorTimeoutRef.current);
    // O aviso some sozinho — é um erro de contexto (permissão, sinal), não um estado
    // que o usuário precise fechar à mão.
    errorTimeoutRef.current = window.setTimeout(() => {
      setStatus('idle');
      setErrorMsg(null);
    }, 6000);
  }, []);

  const handleLocate = useCallback(() => {
    if (status === 'locating') return;
    if (!('geolocation' in navigator)) {
      showError('Este navegador não expõe a localização do dispositivo.');
      return;
    }
    setErrorMsg(null);
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('idle');
        onLocateRef.current({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        showError(GEO_ERROR_MESSAGES[error.code] ?? 'Falha ao obter a localização do dispositivo.');
      },
      // Alta precisão para cair na rua certa; o timeout evita o botão preso girando.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  }, [showError, status]);

  const locating = status === 'locating';

  return (
    <div className="absolute bottom-[6.25rem] left-3 z-30 flex flex-col items-start gap-2">
      {errorMsg ? (
        <div
          role="alert"
          className="max-w-[240px] rounded-[10px] border border-red-200 bg-white px-3 py-2 text-[0.78rem] leading-snug text-red-700 shadow-soft-lg"
        >
          {errorMsg}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Ir para a minha localização"
        title="Minha localização"
        aria-busy={locating}
        disabled={locating}
        onClick={handleLocate}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-app-border bg-white text-app-text shadow-soft-lg transition hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent disabled:opacity-70"
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin text-app-muted" aria-hidden="true" />
        ) : (
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
