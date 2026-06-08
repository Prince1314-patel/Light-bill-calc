import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const billsTable = pgTable("bills", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  totalBill: real("total_bill").notNull(),
  totalUnits: real("total_units").notNull(),
  prevReading: real("prev_reading").notNull(),
  presReading: real("pres_reading").notNull(),
  unitPrice: real("unit_price").notNull(),
  tenantUnits: real("tenant_units").notNull(),
  tenantBill: real("tenant_bill").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillSchema = createInsertSchema(billsTable).omit({ createdAt: true });
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof billsTable.$inferSelect;
