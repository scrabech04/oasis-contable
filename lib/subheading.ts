/**
 * Un subtitulo suele venir como "ROTULO EN MAYUSCULAS: explicacion en una o dos lineas".
 * Todo en negrita se veia cargado, asi que solo el rotulo va en negrita y la explicacion
 * en peso normal. Si no hay rotulo (sin dos puntos, o no esta en mayusculas), se deja el
 * texto entero en negrita como antes.
 */
export function splitSubheading(text: string): { label: string; body: string } | null {
    const match = /^([^:\n]{2,120}):\s*(\S[\s\S]*)$/.exec(text || "");
    if (!match) return null;
    const label = match[1].trim();
    if (label !== label.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]/.test(label)) return null;
    return { label, body: match[2] };
}
