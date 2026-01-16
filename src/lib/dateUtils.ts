/**
 * Utilidades para manejo correcto de fechas en UTC
 * 
 * CONTRATO DE FECHAS:
 * - El frontend envía fechas YA convertidas a UTC en formato ISO 8601 UTC
 * - El backend usa las fechas directamente sin conversiones
 * - No se aceptan fechas sin zona horaria (deben terminar en 'Z')
 * - No se hacen ajustes ni conversiones de zona horaria
 */

/**
 * Obtiene la fecha y hora actual en UTC
 */
export function nowUTC(): Date {
  return new Date();
}

/**
 * Parsea un string de fecha en formato ISO 8601 UTC
 * 
 * REQUISITOS:
 * - Debe terminar en 'Z' (UTC)
 * - Formato: "2026-01-16T05:59:59.999Z"
 * 
 * PROHIBICIONES:
 * - ❌ No acepta "YYYY-MM-DD"
 * - ❌ No acepta fechas sin zona horaria
 * - ❌ No hace conversiones de zona horaria
 * 
 * Lanza error si el formato no es válido o no está en UTC
 */
export function parseUTCDate(dateString: string): Date {
  // Validar que termine en Z (UTC obligatorio)
  if (!dateString.endsWith("Z")) {
    throw new Error(`La fecha debe estar en formato ISO 8601 UTC y terminar en 'Z'. Recibido: ${dateString}`);
  }

  // Validar formato ISO 8601 básico
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(dateString)) {
    throw new Error(`Formato de fecha inválido. Debe ser ISO 8601 UTC (ej: 2026-01-16T05:59:59.999Z). Recibido: ${dateString}`);
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    throw new Error(`Fecha inválida: ${dateString}`);
  }

  // Verificar que la fecha parseada es realmente UTC
  // new Date() parsea correctamente ISO 8601 UTC, pero verificamos que no haya sido reinterpretada
  const isoString = date.toISOString();
  if (!isoString.endsWith("Z")) {
    throw new Error(`La fecha no está en UTC: ${dateString}`);
  }

  return date;
}

/**
 * Formatea una fecha UTC a string ISO 8601 UTC
 * Formato: "2026-01-15T18:00:00.000Z"
 */
export function formatUTCToISO(date: Date): string {
  return date.toISOString();
}

/**
 * Formatea una fecha UTC a string de día (YYYY-MM-DD) en UTC
 * Usado solo para estadísticas/agrupaciones, NO para consultas
 */
export function formatUTCToDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Valida que un string sea una fecha ISO 8601 UTC válida
 * Debe terminar en 'Z' obligatoriamente
 */
export function isValidUTCISOString(dateString: string): boolean {
  try {
    parseUTCDate(dateString);
    return true;
  } catch {
    return false;
  }
}
