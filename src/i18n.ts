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
  speedAdjustedScore: string
  contextValue: string
  codingValue: string
  agenticValue: string
  minContext: string
  releasedFrom: string
  columns: string
  exportCompare: string
  subscriptions: string
  showSubscriptions: string
  subscriptionUsage: string
  usageFull: string
  usageHeavy: string
  usageLight: string
  plan: string
  priceMonthly: string
  tokensMonthly: string
  effectiveCost: string
  rateLimits: string
  planNotes: string
  subscriptionOnly: string
  efficiencyScore: string
  efficiencyWeights: string
  weightValue: string
  weightSpeed: string
  weightContext: string
  valueScoreBase: string
  vsFrontier: string
  onFrontier: string
  methodology: string
  paygoEquivalent: string
  paygoCheaper: string
  paygoPricier: string
  showTrend: string
  hideTrend: string
  trendTitle: string
  trendHint: string
  teamTier: string
  individualTier: string
  paretoOnly: string
  maxMonthlyCost: string
  resetFilters: string
  pointSize: string
  sizeNone: string
  sizeContext: string
  sizeSpeed: string
  frontierLabels: string
  downloadPng: string
  pngSaved: string
  estimateMissing: string
  estimated: string
  estimatedHint: string
  xAxis: string
  xAxisCost: string
  xAxisMetrics: string
  logScaleOnlyCost: string
}

export const STRINGS: Record<Lang, Strings> = {
  it: {
    title: 'AI Pareto — costo vs intelligenza',
    subtitle: 'Prezzi OpenRouter (USD/1M token) × Artificial Analysis Intelligence Index. Frontiera di Pareto evidenziata.',
    frontier: 'Frontiera di Pareto',
    metric: 'Punteggio',
    cost: 'Costo',
    search: 'Cerca modello o abbonamento…',
    logScale: 'Scala logaritmica',
    includeEfforts: 'Includi varianti di effort',
    maxEffortOnly: 'Solo max effort',
    minScore: 'Punteggio minimo',
    family: 'Famiglia',
    all: 'Tutti',
    none: 'Nessuno',
    modelsShown: 'elementi mostrati',
    ofTotal: 'su',
    noResults: 'Nessun modello o abbonamento corrisponde ai filtri.',
    table: 'Tabella',
    sortBy: 'Ordina',
    model: 'Modello / Abbonamento',
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
    compareTitle: 'Confronto Modelli & Abbonamenti',
    rank: 'Rank',
    costEfficiency: 'Efficienza costo',
    benchmark: 'Benchmark',
    notReasoning: 'Non reasoning',
    closedWeights: 'Pesi chiusi',
    noComparison: 'Nessun elemento selezionato per il confronto',
    cacheWrite: 'Cache write',
    taskCost: 'Costo task selezionato',
    speedAdjustedScore: 'Score/Latenza',
    contextValue: 'Contesto/$',
    codingValue: 'Coding/$',
    agenticValue: 'Agentic/$',
    minContext: 'Contesto minimo',
    releasedFrom: 'Rilasciato dopo',
    columns: 'Colonne',
    exportCompare: 'Esporta confronto CSV',
    subscriptions: 'Abbonamenti',
    showSubscriptions: 'Includi Abbonamenti',
    subscriptionUsage: 'Scenario Utilizzo',
    usageFull: 'Pieno utilizzo (100%)',
    usageHeavy: 'Power user (50%)',
    usageLight: 'Uso moderato (25%)',
    plan: 'Piano',
    priceMonthly: 'Costo Mensile',
    tokensMonthly: 'Token/Mese Stimati',
    effectiveCost: 'Costo Effettivo/1M',
    rateLimits: 'Limiti & Finestre',
    planNotes: 'Note Piano',
    subscriptionOnly: 'Solo Abbonamenti',
    efficiencyScore: 'Efficiency Score',
    efficiencyWeights: 'Pesi Efficiency Score',
    weightValue: 'Peso valore/$',
    weightSpeed: 'Peso velocità',
    weightContext: 'Peso contesto/$',
    valueScoreBase: 'Base Value Score',
    vsFrontier: 'Δ vs frontiera',
    onFrontier: 'Sulla frontiera',
    methodology: 'Metodologia stima',
    paygoEquivalent: 'Equivalente a consumo',
    paygoCheaper: 'più economico dell\'abbonamento',
    paygoPricier: 'più caro dell\'abbonamento',
    showTrend: 'Mostra andamento nel tempo',
    hideTrend: 'Nascondi andamento',
    trendTitle: 'Andamento del miglior Value Score nel tempo',
    trendHint: 'Miglior Value Score cumulativo raggiunto da un modello rilasciato entro ciascuna data (frontiera nel tempo)',
    teamTier: 'Team/Business',
    individualTier: 'Individuale',
    paretoOnly: 'Solo Pareto',
    maxMonthlyCost: 'Costo mensile max',
    resetFilters: 'Azzera filtri',
    pointSize: 'Dimensione punti',
    sizeNone: 'Uniforme',
    sizeContext: 'Contesto',
    sizeSpeed: 'Velocità',
    frontierLabels: 'Etichette frontiera',
    downloadPng: 'Scarica PNG',
    pngSaved: 'PNG scaricato!',
    estimateMissing: 'Stima valori mancanti',
    estimated: 'stimato',
    estimatedHint: 'I valori mancanti sono stimati da modelli simili (k-NN: famiglia + punteggi); ≈ indica una stima',
    xAxis: 'Asse X',
    xAxisCost: 'Costo',
    xAxisMetrics: 'Metriche',
    logScaleOnlyCost: 'La scala logaritmica si applica solo agli assi costo',
  },
  en: {
    title: 'AI Pareto — cost vs intelligence',
    subtitle: 'OpenRouter prices (USD/1M tokens) × Artificial Analysis Intelligence Index. Pareto frontier highlighted.',
    frontier: 'Pareto frontier',
    metric: 'Score',
    cost: 'Cost',
    search: 'Search model or subscription…',
    logScale: 'Log scale',
    includeEfforts: 'Include effort variants',
    maxEffortOnly: 'Max effort only',
    minScore: 'Min score',
    family: 'Family',
    all: 'All',
    none: 'None',
    modelsShown: 'items shown',
    ofTotal: 'of',
    noResults: 'No models or subscriptions match the filters.',
    table: 'Table',
    sortBy: 'Sort',
    model: 'Model / Subscription',
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
    compareTitle: 'Model & Subscription Comparison',
    rank: 'Rank',
    costEfficiency: 'Cost efficiency',
    benchmark: 'Benchmark',
    notReasoning: 'Not reasoning',
    closedWeights: 'Closed weights',
    noComparison: 'No items selected for comparison',
    cacheWrite: 'Cache write',
    taskCost: 'Selected task cost',
    speedAdjustedScore: 'Score/Latency',
    contextValue: 'Context/$',
    codingValue: 'Coding/$',
    agenticValue: 'Agentic/$',
    minContext: 'Min context',
    releasedFrom: 'Released after',
    columns: 'Columns',
    exportCompare: 'Export comparison CSV',
    subscriptions: 'Subscriptions',
    showSubscriptions: 'Include Subscriptions',
    subscriptionUsage: 'Usage Scenario',
    usageFull: 'Full utilization (100%)',
    usageHeavy: 'Power user (50%)',
    usageLight: 'Moderate use (25%)',
    plan: 'Plan',
    priceMonthly: 'Monthly Price',
    tokensMonthly: 'Est. Tokens/Mo',
    effectiveCost: 'Effective Cost/1M',
    rateLimits: 'Limits & Windows',
    planNotes: 'Plan Notes',
    subscriptionOnly: 'Subscriptions Only',
    efficiencyScore: 'Efficiency Score',
    efficiencyWeights: 'Efficiency Score weights',
    weightValue: 'Value/$ weight',
    weightSpeed: 'Speed weight',
    weightContext: 'Context/$ weight',
    valueScoreBase: 'Value Score basis',
    vsFrontier: 'Δ vs frontier',
    onFrontier: 'On frontier',
    methodology: 'Estimation methodology',
    paygoEquivalent: 'Pay-as-you-go equivalent',
    paygoCheaper: 'cheaper than the subscription',
    paygoPricier: 'pricier than the subscription',
    showTrend: 'Show trend over time',
    hideTrend: 'Hide trend',
    trendTitle: 'Best Value Score over time',
    trendHint: 'Cumulative best Value Score reached by any model released by each date (frontier over time)',
    teamTier: 'Team/Business',
    individualTier: 'Individual',
    paretoOnly: 'Pareto only',
    maxMonthlyCost: 'Max monthly cost',
    resetFilters: 'Reset filters',
    pointSize: 'Point size',
    sizeNone: 'Uniform',
    sizeContext: 'Context',
    sizeSpeed: 'Speed',
    frontierLabels: 'Frontier labels',
    downloadPng: 'Download PNG',
    pngSaved: 'PNG downloaded!',
    estimateMissing: 'Estimate missing values',
    estimated: 'estimated',
    estimatedHint: 'Missing values are estimated from similar models (k-NN: family + scores); ≈ marks an estimate',
    xAxis: 'X axis',
    xAxisCost: 'Cost',
    xAxisMetrics: 'Metrics',
    logScaleOnlyCost: 'Log scale only applies to cost axes',
  },
}

export type T = Strings
