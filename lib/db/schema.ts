import type { UIMessage } from "ai";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const games = pgTable(
  "games",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    messages: jsonb("messages").$type<UIMessage[]>().default([]).notNull(),
    lastEventId: text("last_event_id"),
    model: text("model").default("google/gemini-2.5-flash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("games_org_id_idx").on(table.orgId),
    index("games_created_at_idx").on(table.createdAt),
  ]
);

export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;

