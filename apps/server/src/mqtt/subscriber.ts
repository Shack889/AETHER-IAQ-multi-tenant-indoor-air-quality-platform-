import { connectMqtt } from '../config/mqtt';
import { handleMqttMessage } from './handler';
import { logger } from '../utils/logger';
import { setMqttConnected } from '../utils/runtimeStats';

export function startMqttSubscriber(): void {
  connectMqtt(
    (topic, payload) => {
      void handleMqttMessage(topic, payload);
    },
    () => {
      setMqttConnected(true);
      logger.info('MQTT subscriber ready (aether/+/data, aether/+/status)');
    },
  );
}
