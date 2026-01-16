import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Configuración de conexión PostgreSQL
 * IMPORTANTE: Todas las fechas se manejan en UTC
 * La base de datos debe estar configurada para trabajar en UTC
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: 10,
  min: 1,
  // Asegurar que las consultas de timezone se ejecuten en UTC
  // Esto garantiza que NOW() y operaciones de fecha usen UTC
});

// Ejecutar query inicial para configurar timezone en UTC para esta conexión
pool.on('connect', async (client) => {
  await client.query('SET timezone = UTC');
});

export const db = drizzle({ client: pool, schema });
