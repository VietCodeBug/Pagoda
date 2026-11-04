import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, timestamp, text, boolean, index, check, foreignKey, primaryKey, doublePrecision, jsonb } from 'drizzle-orm/pg-core';

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

export const gameWallets = pgTable('vto_game_wallets', {
  playerId: uuid('player_id').primaryKey().references(() => players.id),
  coins: integer('coins').notNull().default(0),
  xp: integer('xp').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [check('vto_game_wallet_nonnegative', sql`${table.coins} >= 0 AND ${table.xp} >= 0`)]);
export const fishCollection = pgTable('vto_fish_collection', {
  playerId: uuid('player_id').notNull().references(() => players.id),
  speciesId: varchar('species_id', { length: 40 }).notNull(),
  amount: integer('amount').notNull().default(0),
  bestSize: doublePrecision('best_size').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.playerId, table.speciesId] }), check('vto_fish_collection_nonnegative', sql`${table.amount} >= 0 AND ${table.bestSize} >= 0`)]);
export const activityScores = pgTable('vto_activity_scores', {
  playerId: uuid('player_id').notNull().references(() => players.id),
  mode: varchar('mode', { length: 24 }).notNull(),
  plays: integer('plays').notNull().default(0),
  bestScore: integer('best_score').notNull().default(0),
  totalScore: integer('total_score').notNull().default(0),
}, (table) => [primaryKey({ columns: [table.playerId, table.mode] }), check('vto_activity_scores_nonnegative', sql`${table.plays} >= 0 AND ${table.bestScore} >= 0 AND ${table.totalScore} >= 0`)]);
export const gameClaims = pgTable('vto_game_claims', {
  id: uuid('id').primaryKey(),
  playerId: uuid('player_id').notNull().references(() => players.id),
  mode: varchar('mode', { length: 24 }).notNull(),
  reward: jsonb('reward').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('vto_game_claims_player_date').on(table.playerId, table.createdAt.desc())]);
