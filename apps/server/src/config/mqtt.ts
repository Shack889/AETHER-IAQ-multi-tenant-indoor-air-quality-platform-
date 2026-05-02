import * as mqtt from 'mqtt';
import { env } from './env';
import { logger } from '../utils/logger';

let client: mqtt.MqttClient | null = null;

export function getMqttClient(): mqtt.MqttClient | null {
  return client;
}

export function connectMqtt(
  onMessage: (topic: string, payload: Buffer) => void,
  onConnect: () => void,
): mqtt.MqttClient | null {
  if (!env.MQTT_BROKER_URL) {
    logger.warn('MQTT_BROKER_URL not set — skipping MQTT connection');
    return null;
  }

  const options: mqtt.IClientOptions = {
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
    keepalive: 60,
    clean: true,
  };

  client = mqtt.connect(env.MQTT_BROKER_URL, options);

  client.on('connect', () => {
    logger.info({ broker: env.MQTT_BROKER_URL }, 'MQTT connected');
    // Per-user topic format (spec): aether/{userId}/{nodeId}/data
    client!.subscribe('aether/+/+/data', { qos: 1 });
    client!.subscribe('aether/+/+/status', { qos: 0 });
    // Legacy 3-segment format for backwards compatibility with mock generator
    // and any older firmware: aether/{nodeId}/data
    client!.subscribe('aether/+/data', { qos: 1 });
    client!.subscribe('aether/+/status', { qos: 0 });
    onConnect();
  });

  client.on('message', onMessage);

  client.on('error', (err) => {
    logger.error({ err: err.message }, 'MQTT error');
  });

  client.on('offline', () => {
    logger.warn('MQTT client offline — will reconnect');
  });

  return client;
}

export function publishMqtt(topic: string, payload: object): void {
  if (!client?.connected) return;
  client.publish(topic, JSON.stringify(payload), { qos: 1 });
}
