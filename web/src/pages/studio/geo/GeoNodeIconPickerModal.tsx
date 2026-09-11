import { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Image as ImageIcon, Search } from 'lucide-react';
import { Button, Modal } from '../../../components/ui';
import type {
  StudioGeoEntityNode,
  StudioGeoPointVisualConfig,
} from '../../../services/studioGeoApi';
import {
  createStudioSvgAsset,
  listStudioAssets,
  type StudioAsset,
} from '../../../services/studioAssetApi';
import {
  NATIVE_MAP_ICON_INDUSTRIES,
  NATIVE_MAP_ICON_INDUSTRY_LABEL,
  filterNativeMapIcons,
  nativeMapIconForCode,
  type NativeMapIconIndustry,
} from '../../../utils/nativeMapIcons';
import { canonicalPointIconPreviewUrl } from './GeoNodeVisualConfigTab';

type Selection = { kind: 'system'; iconCode: string } | { kind: 'asset'; assetId: string };

type GeoNodeIconPickerModalProps = {
  isOpen: boolean;
  node: StudioGeoEntityNode;
  pointConfig: StudioGeoPointVisualConfig;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
};

export function GeoNodeIconPickerModal({
  isOpen,
  node,
  pointConfig,
  onClose,
  onSelect,
}: GeoNodeIconPickerModalProps) {
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState<NativeMapIconIndustry>('TELECOM');
  const [selection, setSelection] = useState<Selection>(
    pointConfig.assetId
      ? { kind: 'asset', assetId: pointConfig.assetId }
      : { kind: 'system', iconCode: pointConfig.iconCode ?? 'CO' },
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelection(
      pointConfig.assetId
        ? { kind: 'asset', assetId: pointConfig.assetId }
        : { kind: 'system', iconCode: pointConfig.iconCode ?? 'CO' },
    );
    setIndustry(nativeMapIconForCode(pointConfig.iconCode)?.industry ?? 'TELECOM');
    setSearch('');
    setUploadError(null);
    void listStudioAssets()
      .then(setAssets)
      .catch(() => setAssets([]));
  }, [isOpen, pointConfig.assetId, pointConfig.iconCode]);

  const systemIcons = useMemo(() => filterNativeMapIcons(industry, search), [industry, search]);
  const customAssets = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    return assets.filter((asset) => !term || asset.name.toLocaleLowerCase('pt-BR').includes(term));
  }, [assets, search]);

  const confirm = (nextSelection = selection) => {
    onSelect(nextSelection);
    onClose();
  };

  const uploadSvg = async (file: File | undefined) => {
    if (!file) return;
    if (file.type !== 'image/svg+xml' && !file.name.toLowerCase().endsWith('.svg')) {
      setUploadError('Envie um arquivo SVG.');
      return;
    }
    try {
      setUploading(true);
      setUploadError(null);
      const asset = await createStudioSvgAsset({
        name: file.name.replace(/\.svg$/i, ''),
        content: await file.text(),
      });
      setAssets((current) => [asset, ...current]);
      setSelection({ kind: 'asset', assetId: asset.id });
    } catch (reason) {
      setUploadError(reason instanceof Error ? reason.message : 'Não foi possível enviar o SVG.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      onClose={onClose}
      width={760}
      title={<h3>Escolher ícone do ponto</h3>}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => confirm()}>
            Confirmar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-app-muted" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar ícone ou asset..."
            className="w-full rounded-[12px] border border-app-border bg-white py-1.5 pl-8 pr-3 text-[0.84rem] text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-[0.82rem] font-semibold text-app-text">Ícones nativos</h4>
            <span className="text-[0.74rem] text-app-muted">
              Os mesmos ícones disponíveis no mapa
            </span>
          </div>
          <div
            role="tablist"
            aria-label="Indústrias de ícones"
            className="mb-2 flex gap-1 overflow-x-auto border-b border-app-border"
          >
            {NATIVE_MAP_ICON_INDUSTRIES.map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={industry === option}
                onClick={() => setIndustry(option)}
                className={`shrink-0 border-b-2 px-2.5 py-1.5 text-[0.76rem] font-semibold transition ${
                  industry === option
                    ? 'border-app-accent text-app-text'
                    : 'border-transparent text-app-muted hover:text-app-text'
                }`}
              >
                {NATIVE_MAP_ICON_INDUSTRY_LABEL[option]}
              </button>
            ))}
          </div>
          {systemIcons.length === 0 ? (
            <p className="flex h-[216px] items-center justify-center rounded-[10px] border border-dashed border-app-border text-[0.76rem] text-app-muted">
              Nenhum ícone encontrado nesta indústria.
            </p>
          ) : (
            <div
              data-testid="native-icon-grid"
              className="grid h-[216px] grid-cols-7 content-start gap-1 overflow-y-auto p-1"
            >
              {systemIcons.map((mapIcon) => {
                const selected = selection.kind === 'system' && selection.iconCode === mapIcon.code;
                const nextSelection: Selection = { kind: 'system', iconCode: mapIcon.code };
                return (
                  <button
                    key={mapIcon.code}
                    type="button"
                    title={mapIcon.name}
                    aria-label={mapIcon.name}
                    onClick={() => setSelection(nextSelection)}
                    onDoubleClick={() => confirm(nextSelection)}
                    className={`flex h-12 items-center justify-center rounded-[8px] border p-1 transition ${
                      selected
                        ? 'border-app-accent bg-app-accent-soft ring-2 ring-app-accent/30'
                        : 'border-app-border bg-white hover:bg-black/[0.02]'
                    }`}
                  >
                    <img
                      src={canonicalPointIconPreviewUrl(node, mapIcon.code, 32)}
                      alt=""
                      className="h-8 w-8"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-app-border pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-[0.82rem] font-semibold text-app-text">Ícones personalizados</h4>
              <p className="text-[0.74rem] text-app-muted">SVGs seguros gerenciados pelo Studio.</p>
            </div>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="image/svg+xml,.svg"
              onChange={(event) => void uploadSvg(event.target.files?.[0])}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              iconLeft={<FileUp className="h-3.5 w-3.5" />}
            >
              {uploading ? 'Enviando…' : 'Carregar SVG'}
            </Button>
          </div>
          {uploadError && <p className="mb-2 text-[0.76rem] text-status-red">{uploadError}</p>}
          {customAssets.length === 0 ? (
            <p className="rounded-[8px] border border-dashed border-app-border p-3 text-center text-[0.76rem] text-app-muted">
              Nenhum SVG personalizado encontrado.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {customAssets.map((asset) => {
                const selected = selection.kind === 'asset' && selection.assetId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelection({ kind: 'asset', assetId: asset.id })}
                    className={`flex items-center gap-2 rounded-[9px] border p-2 text-left text-[0.76rem] transition ${
                      selected
                        ? 'border-app-accent bg-app-accent-soft ring-2 ring-app-accent/30'
                        : 'border-app-border bg-white hover:bg-black/[0.02]'
                    }`}
                  >
                    <ImageIcon className="h-4 w-4 shrink-0 text-app-muted" />
                    <span className="truncate font-medium text-app-text">{asset.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
