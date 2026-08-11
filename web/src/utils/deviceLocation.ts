// Aquisição da geolocalização do dispositivo, compartilhada pelo botão "Minha localização"
// (MapLocateButton) e pelo auto-locate da abertura no mobile (GeoPage). Concentra num só
// lugar a política de qualidade do fix — a razão de o ponto azul aparecer deslocado no
// celular era aceitar o PRIMEIRO fix que chega (quase sempre o fundido de rede/Wi-Fi,
// ±20–100 m, entregue antes de o GNSS convergir).
//
// Duas fases:
//   1. Refino — `watchPosition` de alta precisão que POUSA na primeira leitura (o mapa
//      salta na hora) e depois só reemite quando o fix APERTA, até atingir a precisão-alvo
//      ou estourar a janela de refino. É o "apertar do ponto" do app do Google Maps.
//   2. Rastreamento vivo — depois de assentar, um `watchPosition` de baixa cadência mantém
//      o ponto atualizado enquanto a aba está visível, seguindo o usuário SEM mexer na
//      câmera (o enquadramento é decisão do chamador; ver handleDeviceLocate).

export type DeviceLocation = { lat: number; lng: number; accuracy: number };

// Abaixo disto o fix é bom o bastante para parar de refinar (o usuário está na calçada
// certa) — encerra o refino e passa ao rastreamento vivo.
export const DEVICE_LOCATION_TARGET_ACCURACY_M = 15;

// Acima disto o fix é grosseiro: a câmera afasta para não prometer precisão de rua e a UI
// avisa (ver MapLocateButton e handleDeviceLocate).
export const DEVICE_LOCATION_POOR_ACCURACY_M = 30;

// Janela de refino: passado este prazo vale a melhor leitura obtida, mesmo que ainda não
// tenha atingido a precisão-alvo.
export const DEVICE_LOCATION_REFINE_MS = 12000;

export type DeviceLocationHandlers = {
  // Chamado a cada leitura relevante — a primeira imediata, as seguintes quando o fix
  // aperta (refino) ou quando o usuário se move (rastreamento vivo). `isFirst` marca a
  // primeira leitura da aquisição: é a única em que o chamador deve mexer na câmera (as
  // demais só movem o ponto, para não roubar o enquadramento — ver handleDeviceLocate).
  onUpdate: (location: DeviceLocation, isFirst: boolean) => void;
  // Código de erro da Geolocation API (1=permissão negada, 2=indisponível, 3=timeout).
  // Só dispara quando NENHUMA leitura chegou — uma falha depois de já termos posição não
  // deve virar alerta.
  onError?: (code: number) => void;
  // Fim da fase de refino (por precisão-alvo, prazo ou falha total).
  onSettled?: () => void;
};

const toLocation = (position: GeolocationPosition): DeviceLocation => ({
  lat: position.coords.latitude,
  lng: position.coords.longitude,
  accuracy: position.coords.accuracy,
});

/**
 * Inicia a aquisição e devolve um cancelador que limpa watches, timers e listeners.
 * Chame-o no desmonte do componente e a cada novo acionamento.
 */
export function acquireDeviceLocation(handlers: DeviceLocationHandlers): () => void {
  const geo = typeof navigator !== 'undefined' ? navigator.geolocation : undefined;
  if (!geo) {
    // POSITION_UNAVAILABLE: navegador sem geolocalização.
    handlers.onError?.(2);
    handlers.onSettled?.();
    return () => {};
  }

  let cancelled = false;
  let refineWatchId: number | undefined;
  let liveWatchId: number | undefined;
  let refineTimer: ReturnType<typeof setTimeout> | undefined;
  let bestAccuracy = Number.POSITIVE_INFINITY;
  let emittedAny = false;
  let settled = false;
  // Último código de erro visto enquanto ainda não havia leitura — usado para dar a
  // mensagem certa se a janela de refino fechar sem nenhum fix.
  let lastErrorCode: number | undefined;

  const stopRefine = () => {
    if (refineWatchId !== undefined) {
      geo.clearWatch(refineWatchId);
      refineWatchId = undefined;
    }
    if (refineTimer !== undefined) {
      clearTimeout(refineTimer);
      refineTimer = undefined;
    }
  };

  // Rastreamento vivo: segue o usuário sem mexer na câmera. Pausa quando a aba sai de
  // vista (bateria) e retoma ao voltar. Nunca emite a "primeira" leitura — só começa
  // depois de o refino já ter assentado uma posição.
  const startLive = () => {
    if (cancelled || liveWatchId !== undefined) return;
    liveWatchId = geo.watchPosition(
      (position) => {
        if (!cancelled) handlers.onUpdate(toLocation(position), false);
      },
      // Uma falha aqui é não-fatal: já temos o ponto, apenas mantemos o último.
      () => {},
      { enableHighAccuracy: true, timeout: 27000, maximumAge: 5000 },
    );
  };

  const stopLive = () => {
    if (liveWatchId !== undefined) {
      geo.clearWatch(liveWatchId);
      liveWatchId = undefined;
    }
  };

  const finish = (errorCode?: number) => {
    if (settled || cancelled) return;
    settled = true;
    stopRefine();
    if (!emittedAny) handlers.onError?.(errorCode ?? lastErrorCode ?? 3);
    handlers.onSettled?.();
    if (emittedAny) startLive();
  };

  const onVisibility = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      if (settled && emittedAny) startLive();
    } else {
      stopLive();
    }
  };

  refineWatchId = geo.watchPosition(
    (position) => {
      if (cancelled) return;
      const location = toLocation(position);
      // Primeira leitura sai na hora (o mapa pousa já); as seguintes só quando o fix
      // aperta, para o ponto convergir em vez de piscar.
      if (!emittedAny || location.accuracy < bestAccuracy) {
        const isFirst = !emittedAny;
        bestAccuracy = location.accuracy;
        emittedAny = true;
        handlers.onUpdate(location, isFirst);
      }
      if (location.accuracy <= DEVICE_LOCATION_TARGET_ACCURACY_M) finish();
    },
    (error) => {
      if (cancelled || emittedAny) return;
      lastErrorCode = error.code;
      // Permissão negada é definitivo — não adianta seguir esperando.
      if (error.code === 1) finish(1);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  );

  refineTimer = setTimeout(finish, DEVICE_LOCATION_REFINE_MS);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
  }

  return () => {
    cancelled = true;
    stopRefine();
    stopLive();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
    }
  };
}
