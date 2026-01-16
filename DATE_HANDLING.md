# Manejo de Fechas y Zonas Horarias

Este documento describe el **CONTRATO DE FECHAS OBLIGATORIO** para el manejo de fechas y zonas horarias en el proyecto.

## CONTRATO DE FECHAS (OBLIGATORIO)

### 1. Formato de Entrada
- ✅ **Todas las fechas usadas en consultas llegan en ISO 8601 UTC**
- ✅ Ejemplo válido: `"2026-01-16T05:59:59.999Z"`
- ❌ **NO se acepta** `"YYYY-MM-DD"` en queries
- ❌ **NO se aceptan** fechas sin zona horaria

### 2. Suposición Clave
- ✅ Las fechas recibidas **YA representan el instante correcto en UTC**
- ✅ El backend **NO debe**:
  - ❌ Convertir zonas horarias
  - ❌ Ajustar horas
  - ❌ Inferir timezone del usuario

### 3. Uso en Consultas
- ✅ Usar las fechas recibidas **directamente** en la base de datos
- ✅ Comparar contra campos almacenados en UTC
- ❌ **NO modificar** start/end antes de consultar

Ejemplo:
```sql
WHERE created_at BETWEEN startUtc AND endUtc
```

### 4. Prohibiciones
- ❌ No aceptar `"YYYY-MM-DD"` en queries
- ❌ No usar `new Date()` para reinterpretar fechas
- ❌ No aplicar offsets manuales
- ❌ No usar `toLocaleString()`

### 5. Validación
- ✅ Rechazar fechas que:
  - No terminen en `'Z'`
  - No estén en ISO 8601
- ✅ Asumir que cualquier fecha sin zona horaria es inválida

### 6. Salida
- ✅ Devolver fechas siempre en ISO 8601 UTC
- ❌ No formatear para humanos

### 7. Objetivo
- ✅ El backend funciona como **motor de consultas UTC puras**
- ✅ La responsabilidad de zona horaria es **EXCLUSIVA del frontend**
- ✅ Evitar desfases, duplicados y registros perdidos

## Implementación

### Utilidades de Fechas

El proyecto incluye utilidades en `src/lib/dateUtils.ts`:

- `nowUTC()`: Obtiene la fecha/hora actual en UTC
- `parseUTCDate(dateString)`: Parsea string ISO 8601 UTC a Date (debe terminar en 'Z')
- `formatUTCToISO(date)`: Formatea Date a string ISO 8601 UTC
- `formatUTCToDay(date)`: Formatea Date a string de día (`YYYY-MM-DD`) en UTC (solo para estadísticas)

### Schemas Zod

El proyecto incluye schemas de validación en `src/lib/dateSchemas.ts`:

- `utcDateStringSchema`: Valida y parsea strings ISO 8601 UTC (debe terminar en 'Z')
- `utcDateRangeSchema`: Valida rango de fechas ISO 8601 UTC
- `dateSchema`: Valida objetos Date

### Base de Datos

- ✅ Todas las columnas de fecha usan `TIMESTAMPTZ` en PostgreSQL
- ✅ La conexión PostgreSQL está configurada para UTC
- ✅ La función `NOW()` en PostgreSQL retorna UTC

### Ejemplos de Uso

#### Recibir fecha en consulta (filtro)

```typescript
// Entrada del frontend: query.startDate = "2026-01-16T05:59:59.999Z"
// El schema Zod valida y parsea automáticamente a Date

// ✅ CORRECTO: Usar directamente sin conversiones
db.select()
  .where(gte(goals.createdAt, query.startDate)) // Date UTC directo
  .where(lte(goals.createdAt, query.endDate));   // Date UTC directo

// ❌ INCORRECTO: NO hacer conversiones
// const adjusted = new Date(query.startDate); // NO reinterpretar
// const range = parseDayToUTCRange(...); // NO convertir días
```

#### Crear fecha actual en UTC

```typescript
// ✅ CORRECTO: Solo para fechas generadas en el backend
const now = nowUTC(); // Siempre UTC
await db.update(goals).set({ completedAt: now });
```

#### Formatear fecha para respuesta

```typescript
// Las fechas Date se serializan automáticamente a ISO 8601 UTC en JSON
// No es necesario formatear manualmente

return { createdAt: goal.createdAt }; // Se convierte a "2026-01-15T18:00:00.000Z"
```

#### Extraer día de fecha UTC (solo para estadísticas)

```typescript
// ✅ CORRECTO: Solo para agrupaciones/estadísticas, NO para consultas
const day = formatUTCToDay(date); // Extrae día en UTC
// Usado en goalStatistics para agrupar por día
```

## Migración de Base de Datos

Para convertir las columnas existentes de `timestamp` a `timestamptz`, ejecutar:

```bash
# La migración está en drizzle/0006_convert_timestamp_to_timestamptz.sql
# O ejecutar manualmente las queries SQL del archivo
```

## Verificación

### Checklist de Auditoría

- [x] Backend solo guarda timestamps en UTC
- [x] Base de datos tipo `timestamptz` o equivalente
- [x] Formatos de entrada validados estrictamente (solo ISO 8601 UTC con 'Z')
- [x] No se aceptan fechas `"YYYY-MM-DD"` en queries
- [x] Fechas recibidas se usan directamente sin conversiones
- [x] No se usan conversiones implícitas a zonas locales
- [x] Output siempre ISO 8601 UTC
- [x] No se reinterpretan fechas con `new Date()`
- [x] No se aplican offsets manuales
- [ ] Tests cubren DST y bordes de hora (pendiente)

## Referencias

- [PostgreSQL Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601)
- [UTC Best Practices](https://en.wikipedia.org/wiki/Coordinated_Universal_Time)
