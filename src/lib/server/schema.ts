import { pgTable, uuid, varchar, integer, timestamp, text, boolean, index } from 'drizzle-orm/pg-core';

export const players = pgTable('vto_players', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 24 }).notNull(),
  avatar: integer('avatar').notNull().default(0),
  merit: integer('merit').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
export const prayers = pgTable('vto_prayers', {
  id: uuid('id').primaryKey(),
  playerId: uuid('player_id').notNull().references(() => players.id),
  name: varchar('name', { length: 24 }).notNull(),
  text: text('text').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('vto_prayers_public_date').on(table.isPublic, table.createdAt), index('vto_prayers_player_date').on(table.playerId, table.createdAt)]);
