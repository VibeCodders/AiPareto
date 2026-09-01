# AI Pareto — costo vs intelligenza

Progetto statico React + TypeScript (Vite) che mostra il **Pareto dei modelli AI**:
sull'asse X il costo (prezzi OpenRouter, USD per 1M token), sull'asse Y il punteggio
(Artificial Analysis Intelligence Index), con la **frontiera di Pareto** evidenziata.

## Funzionalità

- Scatter costo × punteggio con **frontiera di Pareto** (punti non dominati), area ombreggiata sotto la frontiera e **etichette dei modelli** sui punti di frontiera (attivabili/disattivabili).
- **Terza dimensione sul grafico**: dimensione dei punti proporzionale a finestra di contesto o velocità di output (con legenda), oppure uniforme.
- **Anello di evidenziazione** sul grafico per i modelli selezionati e per quelli nel confronto.
- **Esportazione del grafico in PNG** (2×, colori risolti dal tema corrente).
- **Stima dei valori mancanti**: quando attivo, i benchmark/spec senza dato (Coding/Agentic Index, Tau2, velocità, latenza) vengono riempiti con un **k-NN pesato per similarità** (famiglia + punteggi normalizzati), deterministico e clampato ai range osservati. Le stime sono marcate con **≈** in tutta l'interfaccia (punti tratteggiati sul grafico, celle in corsivo in tabella/confronto, tag nella scheda modello, colonna `estimated` nel CSV). Anche i prezzi mancanti possono essere stimati (ratio di famiglia o k-NN) e sono marcati con `≈` nelle colonne costo.
- **Asse X libero**: costo (input, blended 80/20, cache, output, task configurabile) oppure **qualunque metrica** (es. Coding vs Agentic, Contesto vs Intelligenza); la frontiera di Pareto si adatta automaticamente alla direzione "meglio se più alto/basso" di entrambi gli assi. La scala logaritmica si applica agli assi costo.
- **Zoom e pan sul grafico**: rotella per zoomare (centrato sul puntatore), trascinamento per spostare la vista, doppio clic o pulsante ↺ per azzerare; lo zoom si azzera automaticamente quando cambiano i filtri o gli assi.
- Metriche (Artificial Analysis): **Intelligence Index, Coding Index, Agentic Index, Tau2, HLE, Omniscience**. Costo: input, blended 80/20, cache, output, **task configurabile** (token in/out).
- Scala log/lineare, filtri per famiglia, ricerca, soglia minima, varianti di effort.
- **Stato dei filtri nell'URL** (`?metric=…&cost=…&tin=…`): copia l'URL per condividere una vista. Oltre ai filtri, nell'URL viaggiano anche l'**ordinamento della tabella** (`ts`/`td`), le **colonne visibili** (`cols`), il **budget** del pannello Top value (`tbudget`) e il suo **ordinamento** (`tsort`).
- **Preset nominati** (localStorage): salva una combinazione di parametri, ricaricala dal dropdown, eliminala, e condividila via link (`?…&p=<id>`); il link è autosufficiente anche per chi non ha il preset.
- **Pannello "Top value nel budget"**: dato un tetto di costo per unità, elenca modelli e abbonamenti col miglior valueScore (ordinabile per valore/punteggio/efficiency), marca con ★ i pick Pareto-ottimali nel budget, mostra stime `≈`, il **trade-off** tra il miglior valore in-budget e il primo pick sopra il tetto (Δ costo % e Δ valore %, con ⚠ se alzare il budget non migliora il valore), permette di **confrontare i top pick** e di **esportarli in CSV**. Budget e ordinamento sono persistenti nell'URL e nei preset.
- **Analisi di salto di frontiera**: per ogni modello dietro la frontiera la tabella mostra quanto **costa in %** raggiungere il prossimo pick di frontiera con punteggio migliore e **quanto punteggio si guadagna** (con segno corretto anche per metriche lower-is-better tipo latenza); la riga col **miglior ROI sul salto** (punteggio per % di costo) è evidenziata, e scheda/tabella mostrano il **costo assoluto** del movimento.
- **Esportazione CSV** della tabella e dei top pick (separatore `;`, BOM UTF-8, compatibile con Excel): si apre con una riga `#` con i filtri attivi e una riga `# estimated: X/Y` che riassume quanti modelli dipendono da stime.
- **Confidenza del dato**: la scheda modello mostra il **numero di campi stimati** (`≈ N estimated fields`) con la metodologia in tooltip.
- Tema scuro/chiaro e lingua IT/EN, **persistiti tra le sessioni** (localStorage, con override via URL).
- **Azzera filtri** in un clic; messaggio dedicato quando nessun elemento corrisponde ai filtri.
- Accessibilità: righe della tabella e punti del grafico **navigabili da tastiera** (Enter/Spazio).

## Sviluppo

```bash
npm install
npm run dev      # dev server
npm run build    # build statico in dist/
npm run preview  # serve dist/
npm test         # unit test (vitest)
npm run coverage # unit test + report di copertura (soglia in vite.config)
```

## Test e CI

La suite (vitest) copre le utility condivise (`pareto`, `compare`, `urlState`, `estimation`,
`csv`, `download`, `chartExport`, colonne visibili). La CI esegue typecheck, test, **copertura
con soglia minima** e build prima del deploy su GitHub Pages.

## Dati

I dati sono snapshot "una tantum" committati in `src/data/models.json` (114 modelli, 19 famiglie),
generati da:

- **OpenRouter** — `https://openrouter.ai/api/v1/models` (endpoint pubblico, senza API key):
  prezzi input/output/cache read/cache write, ID modello Hugging Face (dove disponibile) e flag
  di reasoning.
- **Artificial Analysis** — pagina `/models` (registry), `/leaderboards/models` (oggetti completi con
  Intelligence/Coding/Agentic Index, Tau2, HLE, Omniscience) e pagine dettaglio (senza API key)
  per velocità e latenza.
- **Hugging Face Hub** (`https://huggingface.co/api/models`): conteggio download, tag e
  parametri stimati da file safetensors — per i modelli open-weights, come indicatore di
  popolarità. I modelli vengono abbinati all'ID Hugging Face fornito da OpenRouter.
- **LMSYS Chatbot Arena** (via `api.wulong.dev`): ELO umani per preferenze conversazionali (text e code).
- **BenchLM.ai** (`https://benchlm.ai/api/data/leaderboard`): punteggi aggregati da benchmark multi-categoria.

Per rigenerare i dati:

```bash
npm run fetch-data
```

Lo script:

1. scarica i modelli OpenRouter, la pagina Artificial Analysis e la pagina `/leaderboards/models`;
2. usa le pagine dettaglio dei modelli (cache in `.tmp/aa_pages/`) per riempire i buchi;
3. unisce le due fonti usando la mappa curata in `scripts/model-map.ts`
   (slug Artificial Analysis → id OpenRouter), con **auto-match di fallback**
   per gli slug non mappati (corrispondenza per somiglianza del nome);
4. scarica la **HF Hub** per arricchire i modelli
   open-weights con conteggi download, parametri stimati e tag (via
   `scripts/hf-utils.mts`);
5. include anche i modelli nuovi di OpenRouter assenti su Artificial Analysis
   (valori mancanti stimati a runtime via k-NN);
6. scrive `src/data/models.json` e `src/data/meta.json`.

**Flag di saltscelta:** `--skip-arena`, `--skip-benchlm`, `--skip-hf` per disabilitare
singole fonti; `--skip-perf` per velocizzare gli aggiornamenti incrementali;
`--force` per ignorare tutte le cache.

**Nota:** il crawl di Artificial Analysis è uno snapshot non ufficiale; la mappa dei modelli
va aggiornata a mano quando escono modelli nuovi (vedi `scripts/match-models.mts` per trovare
i candidati OpenRouter). L'auto-match di fallback copre la maggior parte dei casi, ma
aggiungere voci esplicite alla mappa garantisce corrispondenze più affidabili.

## Deploy su GitHub Pages

Il repo include un workflow GitHub Actions (`.github/workflows/deploy.yml`) che builda e
pubblica `dist/` su GitHub Pages a ogni push su `main` (o manualmente da
Actions → *Deploy to GitHub Pages* → *Run workflow*).

Configurazione una tantum su GitHub:

1. **Repo → Settings → Pages → Build and deployment → Source: *GitHub Actions*** (il workflow
   si occupa di tutto, non serve il branch `gh-pages`).
2. Il sito sarà pubblicato su `https://<utente>.github.io/<repo>/`.

Dettagli già gestiti: `base: './'` in `vite.config.ts` (asset relativi, funziona su subpath),
`public/.nojekyll` (evita l'elaborazione Jekyll), stato dei filtri via URL.

## Attribuzione

Punteggi: © Artificial Analysis (Intelligence Index). Prezzi: OpenRouter.
