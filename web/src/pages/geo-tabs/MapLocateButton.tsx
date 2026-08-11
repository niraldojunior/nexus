import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed } from 'lucide-react';
import {
  acquireDeviceLocation,
  DEVICE_LOCATION_POOR_ACCURACY_M,
  type DeviceLocation,
} from '../../utils/deviceLocation';

// Reexporta o tipo canônico da coordenada do dispositivo (a origem é deviceLocation.ts),
// para os importadores que já o pegam por aqui não quebrarem.
export type { DeviceLocation };

type LocateStatus = 'idle' | 'locating' | 'error';

// Mensagens por código de erro da Geolocation API do navegador (PERMISSION_DENIED = 1,
// POSITION_UNAVAILABLE = 2, TIMEOUT = 3).
const GEO_ERROR_MESSAGES: Record<number, string> = {
  1: 'Permissão de localização negada. Autorize o acesso no navegador para usar sua posição.',
  2: 'Não foi possível determinar sua localização no momento.',
  3: 'A busca pela sua localização demorou demais. Tente novamente.',
};

// Quanto tempo o chip de precisão de um fix BOM fica na tela antes de sumir sozinho — é
// só uma confirmação ("±8 m"), não um estado a gerenciar. O aviso de fix ruim não expira:
// fica enquanto a precisão não melhora.
const PRECISION_CHIP_MS = 6000;

// Botão flutuante sobre o mapa que adquire a geolocalização do dispositivo (ver
// deviceLocation.acquireDeviceLocation) e entrega a coordenada ao mapa (GoogleMapPanel),
// que salta para lá e crava o ponto azul. O fix é REFINADO: o mapa pousa na primeira
// leitura e o botão mostra a precisão (±X m), avisando quando o sinal está grosseiro.
export function MapLocateButton({
  onLocate,
}: {
  // `isFirst` distingue a primeira leitura da aquisição (a única que deve mover a câmera)
  // das melhoras/rastreamento seguintes — ver deviceLocation e handleDeviceLocate.
  onLocate: (coords: DeviceLocation, isFirst: boolean) => void;
}) {
  const [status, setStatus] = useState<LocateStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Precisão da última leitura (m), para o chip ±X m. `null` = sem chip.
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const errorTimeoutRef = useRef<number | undefined>(undefined);
  const precisionTimeoutRef = useRef<number | undefined>(undefined);
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  // O callback do mapa muda a cada render; guardamos a versão atual para o handler de
  // sucesso não precisar reiniciar a aquisição em curso.
  const onLocateRef = useRef(onLocate);

  useEffect(() => {
    onLocateRef.current = onLocate;
  }, [onLocate]);

  useEffect(
    () => () => {
      if (errorTimeoutRef.current !== undefined) window.clearTimeout(errorTimeoutRef.current);
      if (precisionTimeoutRef.current !== undefined)
        window.clearTimeout(precisionTimeoutRef.current);
      cancelRef.current?.();
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

  const showPrecision = useCallback((meters: number) => {
    setAccuracy(meters);
    if (precisionTimeoutRef.current !== undefined) window.clearTimeout(precisionTimeoutRef.current);
    // Fix bom: o chip é só confirmação e some sozinho. Fix ruim: fica na tela e vai se
    // atualizando a cada leitura, até melhorar.
    if (meters <= DEVICE_LOCATION_POOR_ACCURACY_M) {
      precisionTimeoutRef.current = window.setTimeout(() => setAccuracy(null), PRECISION_CHIP_MS);
    }
  }, []);

  const handleLocate = useCallback(() => {
    if (status === 'locating') return;
    if (!('geolocation' in navigator)) {
      showError('Este navegador não expõe a localização do dispositivo.');
      return;
    }
    setErrorMsg(null);
    setAccuracy(null);
    setStatus('locating');
    if (errorTimeoutRef.current !== undefined) window.clearTimeout(errorTimeoutRef.current);
    if (precisionTimeoutRef.current !== undefined) window.clearTimeout(precisionTimeoutRef.current);
    cancelRef.current?.();
    cancelRef.current = acquireDeviceLocation({
      onUpdate: (coords, isFirst) => {
        // A primeira leitura já para o spinner; o refino segue em segundo plano.
        setStatus('idle');
        showPrecision(coords.accuracy);
        onLocateRef.current(coords, isFirst);
      },
      onError: (code) => {
        showError(GEO_ERROR_MESSAGES[code] ?? 'Falha ao obter a localização do dispositivo.');
      },
    });
  }, [status, showError, showPrecision]);

  const locating = status === 'locating';
  const poor = accuracy !== null && accuracy > DEVICE_LOCATION_POOR_ACCURACY_M;

  return (
    <div className="absolute bottom-8 right-3 z-30 flex flex-col items-end gap-2">
      {errorMsg ? (
        <div
          role="alert"
          className="max-w-[240px] rounded-[10px] border border-red-200 bg-white px-3 py-2 text-[0.78rem] leading-snug text-red-700 shadow-map-control-lg"
        >
          {errorMsg}
        </div>
      ) : null}
      {accuracy !== null ? (
        <div
          role="status"
          className={`max-w-[240px] rounded-[999px] border px-2.5 py-1 text-[0.72rem] font-semibold leading-snug tracking-[0.02em] shadow-map-control ${
            poor
              ? 'border-status-amber/30 bg-status-amber-soft text-status-amber'
              : 'border-app-border bg-white text-app-muted'
          }`}
        >
          {poor
            ? `Sinal de GPS impreciso (±${Math.round(accuracy)} m). Aguardando melhorar…`
            : `±${Math.round(accuracy)} m`}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Ir para a minha localização"
        title="Minha localização"
        aria-busy={locating}
        disabled={locating}
        onClick={handleLocate}
        className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-app-border bg-white text-app-text shadow-map-control transition hover:border-app-accent-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent disabled:opacity-70"
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
