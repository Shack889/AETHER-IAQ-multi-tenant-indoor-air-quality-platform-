import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.string().default('4000').transform(Number),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MQTT_BROKER_URL: z.string().optional(),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MOCK_DATA: z.string().default('true').transform((v) => v === 'true'),
  JWT_SECRET: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:', result.error.flatten().fieldErrors);
    // In dev, DATABASE_URL might not be set — provide a useful default error
    if (process.env.NODE_ENV !== 'production') {
      console.warn('⚠️  Continuing with partial config in development mode');
      return {
        DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://aether:aether_dev_pass@localhost:5432/aether',
        PORT: Number(process.env.PORT ?? 4000),
        CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
        MQTT_BROKER_URL: process.env.MQTT_BROKER_URL,
        MQTT_USERNAME: process.env.MQTT_USERNAME,
        MQTT_PASSWORD: process.env.MQTT_PASSWORD,
        MOCK_DATA: process.env.MOCK_DATA !== 'false',
        JWT_SECRET: process.env.JWT_SECRET,
        NODE_ENV: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
      };
    }
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
