import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, text, boolean, index, check, foreignKey } from 'drizzle-orm/pg-core';

export const players = pgTable('vto_players', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 24 }).notNull(),
  avatar: integer('avatar').notNull().default(0),
  merit: integer('merit').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('vto_players_avatar_range', sql`${table.avatar} >= 0 AND ${table.avatar} <= 3`)]);
export const prayers = pgTable('vto_prayers', {
  id: uuid('id').primaryKey(),
  playerId: uuid('player_id').notNull(),
  name: varchar('name', { length: 24 }).notNull(),
  text: text('text').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('vto_prayers_public_date').on(table.isPublic, table.createdAt.desc()),
  index('vto_prayers_player_date').on(table.playerId, table.createdAt.desc()),
  foreignKey({ name: 'vto_prayers_player_id_fkey', columns: [table.playerId], foreignColumns: [players.id] }),
  check('vto_prayer_length', sql`length(${table.text}) BETWEEN 1 AND 500`),
]);
