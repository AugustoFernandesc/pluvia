import { EntitySchema } from 'typeorm';

import { Envelope } from '@domain/evento';

/** Uma linha da outbox: o evento esperando para ser publicado no RabbitMQ. */
export interface RegistroOutbox {
  id: string;
  routingKey: string;
  payload: Envelope;
  criadoEm: Date;
  publicadoEm: Date | null;
}

export const OutboxSchema = new EntitySchema<RegistroOutbox>({
  name: 'Outbox',
  tableName: 'outbox',
  columns: {
    id: { type: 'uuid', primary: true },
    routingKey: { name: 'routing_key', type: 'text' },
    payload: { type: 'jsonb' },
    criadoEm: { name: 'criado_em', type: 'timestamptz', createDate: true },
    publicadoEm: { name: 'publicado_em', type: 'timestamptz', nullable: true },
  },
});
