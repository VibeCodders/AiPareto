import fs from 'node:fs'
import { extractFlightChunks, extractModelObjects, parseModelRegistry } from './aa-utils.mts'

const raw = extractFlightChunks(fs.readFileSync('.aa_models.html', 'utf8')).join('')
const registry = parseModelRegistry(raw)
console.log('registry:', registry.length)
const objs = extractModelObjects(raw)
console.log('model objects:', objs.length)
for (const o of objs.slice(0, 6)) console.log(' ', o.release?.slug, 'II=', o.intelligenceIndex, 'agentic=', o.agenticIndex)
