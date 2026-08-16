## Archivos que el usuario quiere que leas (facturas, comprobantes)

Samuel trabaja desde el terminal y **no va a escribir rutas de archivos**. Cuando diga
"lee la ultima factura", "el comprobante que acabo de descargar", "lo que puse ahi" o
cualquier variante sin ruta, resuelvelo tu:

1. Mira primero `entrada/` (carpeta de arrastre del proyecto, ignorada por git) y toma el
   archivo **mas reciente por fecha de modificacion**.
2. Si esta vacia, mira `~/Downloads` y toma el PDF o imagen mas reciente
   (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`).

Comando util: `ls -t entrada/ 2>/dev/null | head -3` y
`ls -t ~/Downloads/*.{pdf,jpg,jpeg,png,webp,heic} 2>/dev/null | head -3`

Reglas al hacerlo:
- **Di siempre que archivo elegiste** (nombre y fecha) antes de actuar sobre el. Si hay
  varios candidatos recientes, enumeralos y pregunta en vez de adivinar.
- Solo mires `~/Downloads` cuando lo pida; no es una carpeta que se explore por gusto.
- Si el archivo se va a registrar como compra o pago, pasa su ruta como soporte
  (`attachmentPath` en `record_payment`) para que quede adjunto al documento.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
