# AI Pareto — costo vs intelligenza

Progetto statico React + TypeScript (Vite) che mostra il **Pareto dei modelli AI**:
sull'asse X il costo (prezzi OpenRouter, USD per 1M token), sull'asse Y il punteggio
(Artificial Analysis Intelligence Index), con la **frontiera di Pareto** evidenziata.

## Funzionalità

- Scatter costo × punteggio con **frontiera di Pareto** (punti non dominati).
- Metriche: Intelligence Index, Agentic Index, Omniscience. Costo: input, blended 80/20, cache, output, **task configurabile** (token in/out).
- Scala log/lineare, filtri per famiglia, ricerca, soglia minima, varianti di effort.
- **Stato dei filtri nell'URL** (`?metric=…&cost=…&tin=…`): copia l'URL per condividere una vista.
- **Esportazione CSV** della tabella (separatore `;`, BOM UTF-8, compatibile con Excel).
- Tema scuro/chiaro, lingua IT/EN.

## Sviluppo

```bash
npm install
npm run dev      # dev server
npm run build    # build statico in dist/
npm run preview  # serve dist/
```

## Dati

I dati sono snapshot "una tantum" committati in `src/data/models.json` (104 modelli, 18 famiglie),
generati da:

- **OpenRouter** — `https://openrouter.ai/api/v1/models` (endpoint pubblico, senza API key):
  prezzi input/output/cache read/cache write.
- **Artificial Analysis** — pagina `/models` e pagine dettaglio dei modelli (senza API key):
  Intelligence Index, Agentic Index, Omniscience.

Per rigenerare i dati:

```bash
npm run fetch-data
```

Lo script:

1. scarica i modelli OpenRouter e la pagina Artificial Analysis;
2. crawla le pagine dettaglio dei modelli selezionati (cache in `.tmp/aa_pages/`);
3. unisce le due fonti usando la mappa curata in `scripts/model-map.ts`
   (slug Artificial Analysis → id OpenRouter);
4. scrive `src/data/models.json` e `src/data/meta.json`.

**Nota:** il crawl di Artificial Analysis è uno snapshot non ufficiale; la mappa dei modelli
va aggiornata a mano quando escono modelli nuovi (vedi `scripts/match-models.mts` per trovare
i candidati OpenRouter).

## Attribuzione

Punteggi: © Artificial Analysis (Intelligence Index). Prezzi: OpenRouter.
