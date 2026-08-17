export type Lang = 'it' | 'en'

export interface Strings {
  title: string
  subtitle: string
  frontier: string
  metric: string
  cost: string
  search: string
  logScale: string
  includeEfforts: string
  maxEffortOnly: string
  minScore: string
  family: string
  all: string
  none: string
  modelsShown: string
  ofTotal: string
  noResults: string
  table: string
  sortBy: string
  model: string
  score: string
  input: string
  output: string
  cache: string
  blended: string
  context: string
  openWeights: string
  release: string
  reasoning: string
  details: string
  openRouterLink: string
  aaLink: string
  effort: string
  viewOn: string
  costViewInput: string
  costViewBlended: string
  costViewCache: string
  costViewOutput: string
  costViewTask: string
  taskIn: string
  taskOut: string
  intel: string
  coding: string
  agentic: string
  tau2: string
  hle: string
  omniscience: string
  outputSpeed: string
  latency: string
  maxLatency: string
  fetchedAt: string
  language: string
  theme: string
  frontierNote: string
  clickHint: string
  exportCsv: string
  presets: string
  noPreset: string
  savePreset: string
  saving: string
  confirm: string
  cancel: string
  presetNamePlaceholder: string
  copyLink: string
  copied: string
  deletePreset: string
  valueScore: string
  reasoningOnly: string
  openWeightsOnly: string
  priceRange: string
  minPrice: string
  maxPrice: string
  compare: string
  addToCompare: string
  removeFromCompare: string
  clearCompare: string
  compareTitle: string
  rank: string
  costEfficiency: string
  benchmark: string
  notReasoning: string
  closedWeights: string
  noComparison: string
  cacheWrite: string
  taskCost: string
}

export const STRINGS: Record<Lang, Strings> = {
  it: {
    title: 'AI Pareto — costo vs intelligenza',
    subtitle: 'Prezzi OpenRouter (USD/1M token) × Artificial Analysis Intelligence Index. Frontiera di Pareto evidenziata.',
    frontier: 'Frontiera di Pareto',
    metric: 'Punteggio',
    cost: 'Costo',
    search: 'Cerca modello…',
    logScale: 'Scala logaritmica',
    includeEfforts: 'Includi varianti di effort',
    maxEffortOnly: 'Solo max effort',
    minScore: 'Punteggio minimo',
    family: 'Famiglia',
    all: 'Tutti',
    none: 'Nessuno',
    modelsShown: 'modelli mostrati',
    ofTotal: 'su',
    noResults: 'Nessun modello corrisponde ai filtri.',
    table: 'Tabella',
    sortBy: 'Ordina',
    model: 'Modello',
    score: 'Score',
    input: 'Input',
    output: 'Output',
    cache: 'Cache read',
    blended: '80/20',
    context: 'Contesto',
    openWeights: 'Open',
    release: 'Rilascio',
    reasoning: 'Reasoning',
    details: 'Dettagli',
    openRouterLink: 'OpenRouter',
    aaLink: 'Artificial Analysis',
    effort: 'Effort',
    viewOn: 'Vedi su',
    costViewInput: 'Input /1M',
    costViewBlended: 'Blended 80/20 /1M',
    costViewCache: 'Input con cache /1M',
    costViewOutput: 'Output /1M',
    costViewTask: 'Costo per task',
    taskIn: 'Token input',
    taskOut: 'Token output',
    intel: 'Intelligence Index',
    coding: 'Coding Index',
    agentic: 'Agentic Index',
    tau2: 'Tau2',
    hle: 'HLE',
    omniscience: 'Omniscience',
    outputSpeed: 'Velocità output',
    latency: 'Latenza',
    maxLatency: 'Latenza max',
    fetchedAt: 'Dati aggiornati al',
    language: 'Lingua',
    theme: 'Tema',
    frontierNote: 'Solo i punti non dominati (costo ≤ e punteggio ≥ di ogni altro)',
    clickHint: 'Clicca un punto per i dettagli',
    exportCsv: 'Esporta CSV',
    presets: 'Preset',
    noPreset: '— Nessun preset —',
    savePreset: 'Salva preset',
    saving: 'Salva…',
    confirm: 'Salva',
    cancel: 'Annulla',
    presetNamePlaceholder: 'Nome del preset (es. Coding a basso costo)',
    copyLink: 'Copia link',
    copied: 'Copiato!',
    deletePreset: 'Elimina',
    valueScore: 'Value Score',
    reasoningOnly: 'Solo reasoning',
    openWeightsOnly: 'Solo open weights',
    priceRange: 'Range prezzo',
    minPrice: 'Prezzo min $',
    maxPrice: 'Prezzo max $',
    compare: 'Confronta',
    addToCompare: 'Aggiungi al confronto',
    removeFromCompare: 'Rimuovi dal confronto',
    clearCompare: 'Svuota confronto',
    compareTitle: 'Confronto Modelli',
    rank: 'Rank',
    costEfficiency: 'Efficienza costo',
    benchmark: 'Benchmark',
    notReasoning: 'Non reasoning',
    closedWeights: 'Pesi chiusi',
    noComparison: 'Nessun modello selezionato per il confronto',
    cacheWrite: 'Cache write',
    taskCost: 'Costo task selezionato',
  },
  en: {
    title: 'AI Pareto — cost vs intelligence',
    subtitle: 'OpenRouter prices (USD/1M tokens) × Artificial Analysis Intelligence Index. Pareto frontier highlighted.',
    frontier: 'Pareto frontier',
    metric: 'Score',
    cost: 'Cost',
    search: 'Search model…',
    logScale: 'Log scale',
    includeEfforts: 'Include effort variants',
    maxEffortOnly: 'Max effort only',
    minScore: 'Min score',
    family: 'Family',
    all: 'All',
    none: 'None',
    modelsShown: 'models shown',
    ofTotal: 'of',
    noResults: 'No models match the filters.',
    table: 'Table',
    sortBy: 'Sort',
    model: 'Model',
    score: 'Score',
    input: 'Input',
    output: 'Output',
    cache: 'Cache read',
    blended: '80/20',
    context: 'Context',
    openWeights: 'Open',
    release: 'Release',
    reasoning: 'Reasoning',
    details: 'Details',
    openRouterLink: 'OpenRouter',
    aaLink: 'Artificial Analysis',
    effort: 'Effort',
    viewOn: 'View on',
    costViewInput: 'Input /1M',
    costViewBlended: 'Blended 80/20 /1M',
    costViewCache: 'Input w/ cache /1M',
    costViewOutput: 'Output /1M',
    costViewTask: 'Cost per task',
    taskIn: 'Input tokens',
    taskOut: 'Output tokens',
    intel: 'Intelligence Index',
    coding: 'Coding Index',
    agentic: 'Agentic Index',
    tau2: 'Tau2',
    hle: 'HLE',
    omniscience: 'Omniscience',
    outputSpeed: 'Output speed',
    latency: 'Latency',
    maxLatency: 'Max latency',
    fetchedAt: 'Data as of',
    language: 'Language',
    theme: 'Theme',
    frontierNote: 'Only non-dominated points (cost ≤ and score ≥ of every other)',
    clickHint: 'Click a point for details',
    exportCsv: 'Export CSV',
    presets: 'Presets',
    noPreset: '— No preset —',
    savePreset: 'Save preset',
    saving: 'Save…',
    confirm: 'Save',
    cancel: 'Cancel',
    presetNamePlaceholder: 'Preset name (e.g. cheap coding)',
    copyLink: 'Copy link',
    copied: 'Copied!',
    deletePreset: 'Delete',
    valueScore: 'Value Score',
    reasoningOnly: 'Reasoning only',
    openWeightsOnly: 'Open weights only',
    priceRange: 'Price range',
    minPrice: 'Min price $',
    maxPrice: 'Max price $',
    compare: 'Compare',
    addToCompare: 'Add to compare',
    removeFromCompare: 'Remove from compare',
    clearCompare: 'Clear compare',
    compareTitle: 'Model Comparison',
    rank: 'Rank',
    costEfficiency: 'Cost efficiency',
    benchmark: 'Benchmark',
    notReasoning: 'Not reasoning',
    closedWeights: 'Closed weights',
    noComparison: 'No models selected for comparison',
    cacheWrite: 'Cache write',
    taskCost: 'Selected task cost',
  },
}

export type T = Strings
