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
  intel: string
  agentic: string
  omniscience: string
  fetchedAt: string
  language: string
  theme: string
  frontierNote: string
  clickHint: string
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
    intel: 'Intelligence Index',
    agentic: 'Agentic Index',
    omniscience: 'Omniscience',
    fetchedAt: 'Dati aggiornati al',
    language: 'Lingua',
    theme: 'Tema',
    frontierNote: 'Solo i punti non dominati (costo ≤ e punteggio ≥ di ogni altro)',
    clickHint: 'Clicca un punto per i dettagli',
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
    intel: 'Intelligence Index',
    agentic: 'Agentic Index',
    omniscience: 'Omniscience',
    fetchedAt: 'Data as of',
    language: 'Language',
    theme: 'Theme',
    frontierNote: 'Only non-dominated points (cost ≤ and score ≥ of every other)',
    clickHint: 'Click a point for details',
  },
}

export type T = Strings
