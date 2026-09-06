import type { LucideIcon } from 'lucide-react';
import {
  // Padrões
  Folder,
  Box,
  Cpu,

  // ============================================================================
  // GROUP (~70 ícones: pastas temáticas + infraestrutura civil, aérea, subterrânea,
  // data centers, telecom, redes de fibra, torres, rede móvel, gás, dutos,
  // ferrovias, rede elétrica, subestações, alta energia, etc.)
  // ============================================================================
  FolderTree,
  FolderCog,
  FolderHeart,
  FolderKey,
  FolderSearch,
  FolderArchive,
  FolderCheck,
  FolderGit2,
  FolderGit,
  FolderClock,
  FolderClosed,
  FolderDot,
  FolderEdit,
  FolderInput,
  FolderOutput,
  FolderKanban,
  FolderLock,
  FolderPlus,
  FolderMinus,
  FolderRoot,
  FolderSync,
  Folders,
  // Infraestrutura Civil & Edificações
  Building,
  Building2,
  Factory,
  Warehouse,
  Landmark,
  Hotel,
  Home,
  Castle,
  Construction,
  HardHat,
  Hammer,
  Wrench,
  // Telecom, Redes & Fibra Óptica
  RadioTower,
  UtilityPole,
  TowerControl,
  Cable,
  Network,
  Route,
  Waypoints,
  Antenna,
  Radio,
  Podcast,
  Radar,
  Signal,
  SignalHigh,
  Wifi,
  Cast,
  // Data Centers, Servidores & Dados
  Server,
  ServerCog,
  Container,
  Boxes,
  Database,
  DatabaseZap,
  DatabaseBackup,
  Layers,
  Layers2,
  Layers3,
  // Energia Elétrica, Subestações & Alta Tensão
  Zap,
  ZapOff,
  Power,
  PowerSquare,
  PowerCircle,
  Plug,
  Battery,
  BatteryCharging,
  // Gás, Combustível, Dutos & Térmica
  Flame,
  FlameKindling,
  Fuel,
  Gauge,
  GaugeCircle,
  Droplets,
  Pipette,
  Wind,
  // Ferrovias, Transporte & Logística
  Train,
  TrainTrack,
  TrainFront,
  TrainFrontTunnel,
  RailSymbol,
  CableCar,
  Ship,
  Plane,
  Truck,
  Anchor,
  // Geografia, Território & Meio Ambiente
  MapPin,
  Map,
  Globe,
  Globe2,
  Navigation,
  Compass,
  Milestone,
  Signpost,
  TreePine,
  Mountain,

  // ============================================================================
  // PHYSICAL RESOURCE (~70 ícones de hardware, equipamentos, sensores e meios)
  // ============================================================================
  HardDrive,
  HardDriveDownload,
  HardDriveUpload,
  Router,
  CircuitBoard,
  PlugZap,
  Satellite,
  SatelliteDish,
  Camera,
  Webcam,
  Monitor,
  MonitorCheck,
  MonitorSmartphone,
  Laptop,
  Laptop2,
  Smartphone,
  SmartphoneCharging,
  SmartphoneNfc,
  Tablet,
  Tablets,
  Printer,
  Lightbulb,
  Fan,
  Thermometer,
  Disc,
  Speaker,
  Headphones,
  Usb,
  Keyboard,
  Mouse,
  ToggleLeft,
  PackageOpen,
  RadioReceiver,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Tv,
  Tv2,
  Mic,
  Mic2,
  QrCode,
  Barcode,
  ScanLine,
  ScanBarcode,
  ScanSearch,
  ScanFace,
  ScanEye,
  Watch,
  Microscope,
  Microwave,
  Phone,
  PhoneCall,
  PhoneForwarded,
  SignalMedium,
  SignalLow,
  SignalZero,
  WifiOff,
  ServerCrash,
  ServerOff,
  Pocket,
  PocketKnife,
  Crosshair,
  Volume,
  Volume2,
  CircleDot,
  CircleDotDashed,

  // ============================================================================
  // LOGICAL RESOURCE (~70 ícones de software, nuvem, protocolos, segurança, IA)
  // ============================================================================
  Cloud,
  CloudCog,
  CloudLightning,
  CloudRainWind,
  CloudOff,
  Binary,
  Code,
  Code2,
  Terminal,
  FileTerminal,
  Braces,
  FileCode,
  FileCheck,
  FileCheck2,
  FileCog,
  FileLock,
  FileLock2,
  FileSpreadsheet,
  FileStack,
  Share2,
  Share,
  GitBranch,
  GitMerge,
  GitFork,
  GitPullRequest,
  Workflow,
  Activity,
  ActivitySquare,
  BarChart,
  BarChart2,
  BarChart3,
  BarChart4,
  BarChartBig,
  BarChartHorizontal,
  PieChart,
  LineChart,
  TrendingUp,
  Lock,
  LockKeyhole,
  Shield,
  ShieldCheck,
  ShieldOff,
  Key,
  KeyRound,
  KeySquare,
  Fingerprint,
  Eye,
  Scan,
  SearchCode,
  Link,
  Unlink,
  Webhook,
  Bot,
  Brain,
  Atom,
  Sparkles,
  Wand2,
  Blocks,
  Puzzle,
  Component,
  Variable,
  Tag,
  Percent,
  Split,
  Orbit,
  Presentation,
  CornerDownRight,
} from 'lucide-react';

export type CatalogNodeIconEntry = {
  name: string;
  icon: LucideIcon;
  label: string;
};

/**
 * Ícones disponíveis para nós do tipo GROUP (Agrupamento / Pasta).
 * O primeiro é o padrão ("Folder").
 */
export const GROUP_ICONS: CatalogNodeIconEntry[] = [
  // Pastas canônicas e organizacionais
  { name: 'Folder', icon: Folder, label: 'Pasta Padrão' },
  { name: 'FolderTree', icon: FolderTree, label: 'Árvore de Pastas' },
  { name: 'Folders', icon: Folders, label: 'Conjunto de Pastas' },
  { name: 'FolderRoot', icon: FolderRoot, label: 'Pasta Raiz' },
  { name: 'FolderCog', icon: FolderCog, label: 'Pasta de Configuração' },
  { name: 'FolderArchive', icon: FolderArchive, label: 'Arquivo Morto' },
  { name: 'FolderCheck', icon: FolderCheck, label: 'Pasta Validada' },
  { name: 'FolderLock', icon: FolderLock, label: 'Pasta Segura' },
  { name: 'FolderKey', icon: FolderKey, label: 'Pasta Restrita' },
  { name: 'FolderSearch', icon: FolderSearch, label: 'Pasta de Busca' },
  { name: 'FolderHeart', icon: FolderHeart, label: 'Pasta Favoritos' },
  { name: 'FolderSync', icon: FolderSync, label: 'Pasta Sincronizada' },
  { name: 'FolderGit2', icon: FolderGit2, label: 'Pasta Versionada' },
  { name: 'FolderGit', icon: FolderGit, label: 'Repositório' },
  { name: 'FolderKanban', icon: FolderKanban, label: 'Pasta de Projetos' },
  { name: 'FolderClock', icon: FolderClock, label: 'Histórico / Temporal' },
  { name: 'FolderClosed', icon: FolderClosed, label: 'Pasta Fechada' },
  { name: 'FolderDot', icon: FolderDot, label: 'Pasta Marcada' },
  { name: 'FolderEdit', icon: FolderEdit, label: 'Pasta em Edição' },
  { name: 'FolderInput', icon: FolderInput, label: 'Pasta de Entrada' },
  { name: 'FolderOutput', icon: FolderOutput, label: 'Pasta de Saída' },
  { name: 'FolderPlus', icon: FolderPlus, label: 'Adição de Pasta' },
  { name: 'FolderMinus', icon: FolderMinus, label: 'Pasta Reduzida' },

  // Telecom, Redes de Fibra, Torres & Infra Aérea
  { name: 'RadioTower', icon: RadioTower, label: 'Torre de Telecom / Celular' },
  { name: 'UtilityPole', icon: UtilityPole, label: 'Poste de Rede / Fibra Aérea' },
  { name: 'TowerControl', icon: TowerControl, label: 'Torre de Controle / Central' },
  { name: 'Antenna', icon: Antenna, label: 'Infraestrutura Aérea / RF' },
  { name: 'Cable', icon: Cable, label: 'Rede de Cabos / Dutos de Fibra' },
  { name: 'Network', icon: Network, label: 'Topologia de Rede / Backhaul' },
  { name: 'Route', icon: Route, label: 'Traçado de Fibra / Rota' },
  { name: 'Waypoints', icon: Waypoints, label: 'Pontos de Passagem / Roteamento' },
  { name: 'Radio', icon: Radio, label: 'Telecom / Broadcast' },
  { name: 'Podcast', icon: Podcast, label: 'Transmissão Sem Fio' },
  { name: 'Radar', icon: Radar, label: 'Radar / Telemetria' },
  { name: 'Signal', icon: Signal, label: 'Sinal de Cobertura' },
  { name: 'SignalHigh', icon: SignalHigh, label: 'Cobertura Alta' },
  { name: 'Wifi', icon: Wifi, label: 'Rede Sem Fio / Wi-Fi' },
  { name: 'Cast', icon: Cast, label: 'Distribuição / Streaming' },

  // Data Centers, Servidores & Infra de Dados
  { name: 'Server', icon: Server, label: 'Data Center / Sala de Racks' },
  { name: 'ServerCog', icon: ServerCog, label: 'Servidores de Gerenciamento' },
  { name: 'Container', icon: Container, label: 'Contêiner de Telecom / Shelter' },
  { name: 'Boxes', icon: Boxes, label: 'Agrupador de Módulos' },
  { name: 'Database', icon: Database, label: 'Repositório de Dados' },
  { name: 'DatabaseZap', icon: DatabaseZap, label: 'Processamento de Alta Velocidade' },
  { name: 'DatabaseBackup', icon: DatabaseBackup, label: 'Backup / Redundância' },
  { name: 'Layers', icon: Layers, label: 'Camadas de Infraestrutura' },
  { name: 'Layers2', icon: Layers2, label: 'Múltiplos Níveis' },
  { name: 'Layers3', icon: Layers3, label: 'Pilha Tecnológica' },

  // Rede Elétrica, Subestações & Alta Energia
  { name: 'Zap', icon: Zap, label: 'Rede Elétrica / Alta Tensão' },
  { name: 'ZapOff', icon: ZapOff, label: 'Circuito Desenergizado' },
  { name: 'Power', icon: Power, label: 'Subestação / Gerador' },
  { name: 'PowerSquare', icon: PowerSquare, label: 'Quadro de Distribuição de Energia' },
  { name: 'PowerCircle', icon: PowerCircle, label: 'Ponto de Alimentação Principal' },
  { name: 'Plug', icon: Plug, label: 'Alimentação / Conectividade Elétrica' },
  { name: 'Battery', icon: Battery, label: 'Banco de Baterias / No-Break' },
  { name: 'BatteryCharging', icon: BatteryCharging, label: 'Retificadores de Energia' },

  // Indústria de Gás, Combustível, Dutos & Térmica
  { name: 'Flame', icon: Flame, label: 'Gasoduto / Térmica' },
  { name: 'FlameKindling', icon: FlameKindling, label: 'Queimador / Flare' },
  { name: 'Fuel', icon: Fuel, label: 'Dutos de Combustível / Tanques' },
  { name: 'Gauge', icon: Gauge, label: 'Pressurização / Manômetros de Gás' },
  { name: 'GaugeCircle', icon: GaugeCircle, label: 'Estação de Medição de Gás' },
  { name: 'Droplets', icon: Droplets, label: 'Oleoduto / Saneamento' },
  { name: 'Pipette', icon: Pipette, label: 'Coleta de Amostras de Fluido' },
  { name: 'Wind', icon: Wind, label: 'Parque Eólico / Ventilação' },

  // Ferrovias, Trens & Transporte
  { name: 'TrainTrack', icon: TrainTrack, label: 'Malha Ferroviária / Trilhos' },
  { name: 'Train', icon: Train, label: 'Ferrovias / Trens' },
  { name: 'TrainFront', icon: TrainFront, label: 'Locomotiva / Transporte Ferroviário' },
  { name: 'TrainFrontTunnel', icon: TrainFrontTunnel, label: 'Túnel Ferroviário / Subterrâneo' },
  { name: 'RailSymbol', icon: RailSymbol, label: 'Entroncamento Ferroviário' },
  { name: 'CableCar', icon: CableCar, label: 'Teleférico / Aéreo por Cabo' },
  { name: 'Ship', icon: Ship, label: 'Portos / Rotas Marítimas' },
  { name: 'Plane', icon: Plane, label: 'Aeroportos / Rotas Aéreas' },
  { name: 'Truck', icon: Truck, label: 'Logística / Frotas de Campo' },
  { name: 'Anchor', icon: Anchor, label: 'Cabos Submarinos / Ancoragem' },

  // Infra Civil & Construção
  { name: 'Building', icon: Building, label: 'Edificação / Prédio' },
  { name: 'Building2', icon: Building2, label: 'Complexo Predial / POP' },
  { name: 'Factory', icon: Factory, label: 'Planta Industrial / Usina' },
  { name: 'Warehouse', icon: Warehouse, label: 'Galpão / Centro Logístico' },
  { name: 'Landmark', icon: Landmark, label: 'Infraestrutura Pública / Sede' },
  { name: 'Hotel', icon: Hotel, label: 'Hospitalidade / Telecom Predial' },
  { name: 'Home', icon: Home, label: 'Rede de Acesso Residencial (FTTH)' },
  { name: 'Castle', icon: Castle, label: 'Infraestrutura Fortificada' },
  { name: 'Construction', icon: Construction, label: 'Obras Civis / Instalação' },
  { name: 'HardHat', icon: HardHat, label: 'Engenharia de Campo' },
  { name: 'Hammer', icon: Hammer, label: 'Manutenção / Obras' },
  { name: 'Wrench', icon: Wrench, label: 'Oficina / Reparos' },

  // Geografia & Território
  { name: 'MapPin', icon: MapPin, label: 'Localidade / Ponto Notável' },
  { name: 'Map', icon: Map, label: 'Regional / Mapa de Cobertura' },
  { name: 'Globe', icon: Globe, label: 'Rede Global / Internacional' },
  { name: 'Globe2', icon: Globe2, label: 'Backbone Global' },
  { name: 'Navigation', icon: Navigation, label: 'Navegação / Georreferenciamento' },
  { name: 'Compass', icon: Compass, label: 'Orientação Espacial' },
  { name: 'Milestone', icon: Milestone, label: 'Marco Quilométrico' },
  { name: 'Signpost', icon: Signpost, label: 'Sinalização / Rota' },
  { name: 'TreePine', icon: TreePine, label: 'Diretrizes Ambientais' },
  { name: 'Mountain', icon: Mountain, label: 'Relevo / Topografia' },
];

/**
 * Ícones disponíveis para nós do tipo RESOURCE_TYPE — Físico (~70 ícones).
 * O primeiro é o padrão ("Box").
 */
export const PHYSICAL_RESOURCE_ICONS: CatalogNodeIconEntry[] = [
  // Padrão & Equipamentos Principais
  { name: 'Box', icon: Box, label: 'Equipamento Padrão' },
  { name: 'Server', icon: Server, label: 'Servidor / OLT / Chassis' },
  { name: 'HardDrive', icon: HardDrive, label: 'Storage / Disco Rígido' },
  { name: 'HardDriveDownload', icon: HardDriveDownload, label: 'Storage de Download' },
  { name: 'HardDriveUpload', icon: HardDriveUpload, label: 'Storage de Upload' },
  { name: 'Router', icon: Router, label: 'Roteador / Switch / BNG' },
  { name: 'CircuitBoard', icon: CircuitBoard, label: 'Placa / Módulo de Linha' },
  { name: 'Cpu', icon: Cpu, label: 'Processador / DSP / ASIC' },
  { name: 'Cable', icon: Cable, label: 'Cabo Óptico / Cabo Metálico' },
  { name: 'PlugZap', icon: PlugZap, label: 'Fonte de Alimentação DC/AC' },
  { name: 'Plug', icon: Plug, label: 'Conector / Tomada Industrial' },
  { name: 'Battery', icon: Battery, label: 'Banco de Baterias' },
  { name: 'BatteryCharging', icon: BatteryCharging, label: 'Retificador / Carregador' },

  // Antenas, Rádio, Satélite & Sem Fio
  { name: 'Antenna', icon: Antenna, label: 'Antena Setorial / Painel RF' },
  { name: 'SatelliteDish', icon: SatelliteDish, label: 'Parabólica / VSAT / Hub' },
  { name: 'Satellite', icon: Satellite, label: 'Satélite / Transponder' },
  { name: 'RadioTower', icon: RadioTower, label: 'Torre de Transmissão' },
  { name: 'RadioReceiver', icon: RadioReceiver, label: 'Receptor de Rádio' },
  { name: 'Radio', icon: Radio, label: 'Rádio Enlace / Micro-ondas' },
  { name: 'Wifi', icon: Wifi, label: 'Access Point Wi-Fi / Hotspot' },
  { name: 'WifiOff', icon: WifiOff, label: 'Wi-Fi Desativado' },
  { name: 'Signal', icon: Signal, label: 'Modem RF / Transceiver' },
  { name: 'SignalHigh', icon: SignalHigh, label: 'Sinal Forte' },
  { name: 'SignalMedium', icon: SignalMedium, label: 'Sinal Médio' },
  { name: 'SignalLow', icon: SignalLow, label: 'Sinal Fraco' },
  { name: 'SignalZero', icon: SignalZero, label: 'Sem Sinal' },
  { name: 'Radar', icon: Radar, label: 'Sensor de Radar' },

  // Sensores, Câmeras & Monitoramento Físico
  { name: 'Camera', icon: Camera, label: 'Câmera CFTV / Sensor Óptico' },
  { name: 'Webcam', icon: Webcam, label: 'Webcam de Sala Técnica' },
  { name: 'Thermometer', icon: Thermometer, label: 'Sensor de Temperatura' },
  { name: 'Gauge', icon: Gauge, label: 'Manômetro / Sensor de Pressão' },
  { name: 'GaugeCircle', icon: GaugeCircle, label: 'Medidor Analógico' },
  { name: 'Lightbulb', icon: Lightbulb, label: 'Iluminação / Sinalizador' },
  { name: 'Fan', icon: Fan, label: 'Ar Condicionado / Fan Tray' },
  { name: 'ShieldAlert', icon: ShieldAlert, label: 'Sensor de Intrusão / Alarme' },
  { name: 'Speaker', icon: Speaker, label: 'Sirene / Alarme Sonoro' },
  { name: 'Headphones', icon: Headphones, label: 'Intercomunicador de Sala' },
  { name: 'Volume', icon: Volume, label: 'Aviso Sonoro' },
  { name: 'Volume2', icon: Volume2, label: 'Alarme em Volume Alto' },

  // Terminais, Telas & Periféricos
  { name: 'Monitor', icon: Monitor, label: 'Terminal / Display de Monitoramento' },
  { name: 'MonitorCheck', icon: MonitorCheck, label: 'Monitor de Diagnóstico' },
  { name: 'MonitorSmartphone', icon: MonitorSmartphone, label: 'Console Multi-Dispositivo' },
  { name: 'Tv', icon: Tv, label: 'Video Wall / NOC' },
  { name: 'Tv2', icon: Tv2, label: 'Monitor Grande' },
  { name: 'Laptop', icon: Laptop, label: 'Console Móvel de Engenharia' },
  { name: 'Laptop2', icon: Laptop2, label: 'Notebook de Campo' },
  { name: 'Smartphone', icon: Smartphone, label: 'Coletor de Dados Portátil' },
  { name: 'SmartphoneCharging', icon: SmartphoneCharging, label: 'Dispositivo em Carga' },
  { name: 'SmartphoneNfc', icon: SmartphoneNfc, label: 'Leitor NFC de Campo' },
  { name: 'Tablet', icon: Tablet, label: 'Tablet de Operação' },
  { name: 'Tablets', icon: Tablets, label: 'Pool de Tablets' },
  { name: 'Printer', icon: Printer, label: 'Impressora de Etiquetas / Plotter' },
  { name: 'Watch', icon: Watch, label: 'Wearable de Segurança' },
  { name: 'Keyboard', icon: Keyboard, label: 'Teclado de Operação' },
  { name: 'Mouse', icon: Mouse, label: 'Mouse / Trackball' },
  { name: 'Usb', icon: Usb, label: 'Porta USB / Conexão Serial' },
  { name: 'Disc', icon: Disc, label: 'Mídia Óptica / DVD-ROM' },

  // Chaves, Controles & Componentes Mecânicos
  { name: 'Power', icon: Power, label: 'Disjuntor / Chave Geral' },
  { name: 'PowerSquare', icon: PowerSquare, label: 'Chave Bipolar' },
  { name: 'PowerCircle', icon: PowerCircle, label: 'Botão Liga/Desliga' },
  { name: 'ToggleLeft', icon: ToggleLeft, label: 'Chave Seletora' },
  { name: 'Sliders', icon: Sliders, label: 'Painel de Ajuste' },
  { name: 'SlidersHorizontal', icon: SlidersHorizontal, label: 'Atenuadores / Ganho' },
  { name: 'Mic', icon: Mic, label: 'Microfone de Despacho' },
  { name: 'Mic2', icon: Mic2, label: 'Sensor Acústico' },
  { name: 'Phone', icon: Phone, label: 'Telefone IP / Linha de Serviço' },
  { name: 'PhoneCall', icon: PhoneCall, label: 'Ramal de Suporte' },
  { name: 'PhoneForwarded', icon: PhoneForwarded, label: 'PABX / Redirecionador' },

  // Identificação, Rastreamento & Diagnóstico
  { name: 'QrCode', icon: QrCode, label: 'Etiqueta QR Code' },
  { name: 'Barcode', icon: Barcode, label: 'Código de Barras / Patrimônio' },
  { name: 'ScanLine', icon: ScanLine, label: 'Leitor Laser de Código' },
  { name: 'ScanBarcode', icon: ScanBarcode, label: 'Scanner de Patrimônio' },
  { name: 'ScanSearch', icon: ScanSearch, label: 'Localizador de Ativo' },
  { name: 'ScanFace', icon: ScanFace, label: 'Controle de Acesso Biométrico' },
  { name: 'ScanEye', icon: ScanEye, label: 'Scanner de Íris' },
  { name: 'PackageOpen', icon: PackageOpen, label: 'Kit de Instalação / Peça' },
  { name: 'Pocket', icon: Pocket, label: 'Módulo de Bolso' },
  { name: 'PocketKnife', icon: PocketKnife, label: 'Ferramenta Multiuso' },
  { name: 'Crosshair', icon: Crosshair, label: 'Mira Óptica / Alinhador' },
  { name: 'Microscope', icon: Microscope, label: 'Microscópio de Inspeção de Fibra' },
  { name: 'Microwave', icon: Microwave, label: 'Guia de Onda / Micro-ondas' },
  { name: 'ServerCrash', icon: ServerCrash, label: 'Servidor com Falha' },
  { name: 'ServerOff', icon: ServerOff, label: 'Servidor Standby' },
  { name: 'CircleDot', icon: CircleDot, label: 'Ponto de Teste' },
  { name: 'CircleDotDashed', icon: CircleDotDashed, label: 'Porta de Loopback' },
];

/**
 * Ícones disponíveis para nós do tipo RESOURCE_TYPE — Lógico (~70 ícones).
 * O primeiro é o padrão ("Cpu").
 */
export const LOGICAL_RESOURCE_ICONS: CatalogNodeIconEntry[] = [
  // Padrão & Computação Lógica
  { name: 'Cpu', icon: Cpu, label: 'Recurso Lógico Padrão' },
  { name: 'Cloud', icon: Cloud, label: 'Nuvem / IaaS / VPC' },
  { name: 'CloudCog', icon: CloudCog, label: 'Serviço em Nuvem Gerenciado' },
  { name: 'CloudLightning', icon: CloudLightning, label: 'Função Serverless' },
  { name: 'CloudRainWind', icon: CloudRainWind, label: 'Alta Disponibilidade Multi-Cloud' },
  { name: 'CloudOff', icon: CloudOff, label: 'Ambiente Offline / Air-Gapped' },
  { name: 'Database', icon: Database, label: 'Banco de Dados Relacional / NoSQL' },
  { name: 'Binary', icon: Binary, label: 'Endereçamento IP / Bloco CIDR' },
  { name: 'Code', icon: Code, label: 'Script de Automação / Firmware' },
  { name: 'Code2', icon: Code2, label: 'Código-Fonte / Algoritmo' },
  { name: 'Terminal', icon: Terminal, label: 'CLI / Console de Comandos' },
  { name: 'FileTerminal', icon: FileTerminal, label: 'Script Shell / Batch' },
  { name: 'Braces', icon: Braces, label: 'API REST / Schema JSON' },
  { name: 'FileCode', icon: FileCode, label: 'Template de Configuração / YANG' },

  // Redes Lógicas, Circuitos & Roteamento
  { name: 'Network', icon: Network, label: 'Topologia de Rede / VRF / VLAN' },
  { name: 'Share2', icon: Share2, label: 'Ponto a Ponto / Pseudowire' },
  { name: 'Share', icon: Share, label: 'Compartilhamento de Rota / BGP' },
  { name: 'GitBranch', icon: GitBranch, label: 'Circuito Virtual / Sub-interface' },
  { name: 'GitMerge', icon: GitMerge, label: 'Agregação de Links (LAG / LACP)' },
  { name: 'GitFork', icon: GitFork, label: 'Bifurcação de Tráfego / Espelhamento' },
  { name: 'GitPullRequest', icon: GitPullRequest, label: 'Revisão de Mudança de Rede' },
  { name: 'Workflow', icon: Workflow, label: 'Fluxo de Processamento / Orquestração' },
  { name: 'Link', icon: Link, label: 'Enlace Lógico / Peering' },
  { name: 'Unlink', icon: Unlink, label: 'Segmentação / Isolamento Lógico' },
  { name: 'Webhook', icon: Webhook, label: 'Notificação de Evento / Webhook' },
  { name: 'Split', icon: Split, label: 'Divisor de Carga / Load Balancer' },
  { name: 'Orbit', icon: Orbit, label: 'Anel Lógico / Token Ring' },
  { name: 'CornerDownRight', icon: CornerDownRight, label: 'Salto de Roteamento / Next-Hop' },

  // Monitoramento, Métricas & Desempenho
  { name: 'Activity', icon: Activity, label: 'Monitoramento de Rede / QoS' },
  { name: 'ActivitySquare', icon: ActivitySquare, label: 'Health Check / Keepalive' },
  { name: 'BarChart', icon: BarChart, label: 'Gráfico de Uso de Banda' },
  { name: 'BarChart2', icon: BarChart2, label: 'Estatísticas de Tráfego' },
  { name: 'BarChart3', icon: BarChart3, label: 'Telemetria / Contador SNMP' },
  { name: 'BarChart4', icon: BarChart4, label: 'Consumo por Porta' },
  { name: 'BarChartBig', icon: BarChartBig, label: 'Volume Agregado' },
  { name: 'BarChartHorizontal', icon: BarChartHorizontal, label: 'Comparativo de Capacidade' },
  { name: 'PieChart', icon: PieChart, label: 'Alocação de Banda por Serviço' },
  { name: 'LineChart', icon: LineChart, label: 'SLA de Latência / Jitter' },
  { name: 'TrendingUp', icon: TrendingUp, label: 'Projeção de Tráfego' },
  { name: 'Presentation', icon: Presentation, label: 'Relatório Executivo de Rede' },

  // Segurança, Criptografia & Identidade
  { name: 'Lock', icon: Lock, label: 'Túnel Seguro / IPSec / VPN' },
  { name: 'LockKeyhole', icon: LockKeyhole, label: 'Cofre de Senhas / Credenciais' },
  { name: 'Shield', icon: Shield, label: 'Firewall / ACL de Segurança' },
  { name: 'ShieldCheck', icon: ShieldCheck, label: 'Certificado Digital / TLS' },
  { name: 'ShieldOff', icon: ShieldOff, label: 'Proteção Desativada' },
  { name: 'Key', icon: Key, label: 'Chave Criptográfica / Token' },
  { name: 'KeyRound', icon: KeyRound, label: 'Chave Pública / Privada' },
  { name: 'KeySquare', icon: KeySquare, label: 'Chave de Licença' },
  { name: 'Fingerprint', icon: Fingerprint, label: 'Identidade Digital / Assinatura' },
  { name: 'Eye', icon: Eye, label: 'Sonda de Monitoramento / Probe' },
  { name: 'Scan', icon: Scan, label: 'Varredura de Vulnerabilidades' },
  { name: 'SearchCode', icon: SearchCode, label: 'Inspeção Profunda de Pacotes (DPI)' },

  // Automação, IA & Lógica Avançada
  { name: 'Bot', icon: Bot, label: 'Robô de Automação / Bot' },
  { name: 'Brain', icon: Brain, label: 'Inteligência Artificial / AIOps' },
  { name: 'Atom', icon: Atom, label: 'Microsserviço / Lógica Atômica' },
  { name: 'Sparkles', icon: Sparkles, label: 'Otimização Dinâmica de Tráfego' },
  { name: 'Wand2', icon: Wand2, label: 'Zero-Touch Provisioning (ZTP)' },
  { name: 'Blocks', icon: Blocks, label: 'Função de Rede Virtualizada (VNF/CNF)' },
  { name: 'Puzzle', icon: Puzzle, label: 'Módulo de Extensão / Plugin' },
  { name: 'Component', icon: Component, label: 'Serviço Composto' },
  { name: 'Variable', icon: Variable, label: 'Variável de Política / Contexto' },
  { name: 'Tag', icon: Tag, label: 'Pool de Recursos / Etiqueta' },
  { name: 'Percent', icon: Percent, label: 'Taxa de Compressão / Overbooking' },

  // Arquivos & Documentos de Configuração
  { name: 'FileCheck', icon: FileCheck, label: 'Configuração Homologada' },
  { name: 'FileCheck2', icon: FileCheck2, label: 'Auditoria de Configuração' },
  { name: 'FileCog', icon: FileCog, label: 'Arquivo de Parâmetros' },
  { name: 'FileLock', icon: FileLock, label: 'Configuração Criptografada' },
  { name: 'FileLock2', icon: FileLock2, label: 'Arquivo Restrito' },
  { name: 'FileSpreadsheet', icon: FileSpreadsheet, label: 'Plano de Numeração / IPAM' },
  { name: 'FileStack', icon: FileStack, label: 'Versionamento de Configuração' },
];

/** Mapa de busca rápida por nome de ícone */
const ALL_ICONS_MAP: Record<string, LucideIcon> = {};
for (const entry of [...GROUP_ICONS, ...PHYSICAL_RESOURCE_ICONS, ...LOGICAL_RESOURCE_ICONS]) {
  ALL_ICONS_MAP[entry.name] = entry.icon;
}

/**
 * Retorna os ícones disponíveis para um determinado tipo de nó.
 */
export function getIconsForNodeType(
  kind: 'GROUP' | 'RESOURCE_TYPE',
  isLogical: boolean,
): CatalogNodeIconEntry[] {
  if (kind === 'GROUP') return GROUP_ICONS;
  if (isLogical) return LOGICAL_RESOURCE_ICONS;
  return PHYSICAL_RESOURCE_ICONS;
}

/**
 * Retorna o ícone Lucide padrão para o tipo de nó.
 */
export function getDefaultNodeIcon(
  kind: 'GROUP' | 'RESOURCE_TYPE',
  isLogical: boolean,
): LucideIcon {
  if (kind === 'GROUP') return Folder;
  if (isLogical) return Cpu;
  return Box;
}

/**
 * Resolve o componente LucideIcon para um nó, levando em consideração o `metadata.icon`
 * personalizado ou o fallback para o padrão do tipo.
 */
export function resolveNodeIcon(
  iconName: string | undefined | null,
  kind: 'GROUP' | 'RESOURCE_TYPE',
  isLogical: boolean,
): LucideIcon {
  if (iconName && ALL_ICONS_MAP[iconName]) {
    return ALL_ICONS_MAP[iconName];
  }
  return getDefaultNodeIcon(kind, isLogical);
}
