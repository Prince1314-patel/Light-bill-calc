import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { supabase } from "../lib/supabase";
import {
  CreateBillBody,
  DeleteBillParams,
  ListBillsResponse,
  GetBillStatsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bills/stats", async (req, res): Promise<void> => {
  const { data, error } = await supabase
    .from("bills")
    .select("tenant_bill, unit_price");

  if (error) {
    req.log.error({ error }, "Failed to fetch bill stats");
    res.status(500).json({ error: "Failed to fetch stats" });
    return;
  }

  const records = data ?? [];
  const totalRecords = records.length;
  const totalTenantPaid = records.reduce((sum, r) => sum + (r.tenant_bill ?? 0), 0);
  const avgUnitPrice =
    totalRecords > 0
      ? records.reduce((sum, r) => sum + (r.unit_price ?? 0), 0) / totalRecords
      : 0;
  const avgMonthlyBill = totalRecords > 0 ? totalTenantPaid / totalRecords : 0;

  res.json(
    GetBillStatsResponse.parse({
      totalRecords,
      totalTenantPaid: parseFloat(totalTenantPaid.toFixed(2)),
      avgUnitPrice: parseFloat(avgUnitPrice.toFixed(4)),
      avgMonthlyBill: parseFloat(avgMonthlyBill.toFixed(2)),
    }),
  );
});

router.get("/bills", async (req, res): Promise<void> => {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    req.log.error({ error }, "Failed to fetch bills");
    res.status(500).json({ error: "Failed to fetch bills" });
    return;
  }

  const bills = (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    totalBill: row.total_bill,
    totalUnits: row.total_units,
    prevReading: row.prev_reading,
    presReading: row.pres_reading,
    unitPrice: row.unit_price,
    tenantUnits: row.tenant_units,
    tenantBill: row.tenant_bill,
    createdAt: row.created_at,
  }));

  res.json(ListBillsResponse.parse(bills));
});

router.post("/bills", async (req, res): Promise<void> => {
  const parsed = CreateBillBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid bill body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const d = parsed.data;
  const id = randomUUID();

  const { data, error } = await supabase
    .from("bills")
    .insert({
      id,
      date: d.date,
      total_bill: d.totalBill,
      total_units: d.totalUnits,
      prev_reading: d.prevReading,
      pres_reading: d.presReading,
      unit_price: d.unitPrice,
      tenant_units: d.tenantUnits,
      tenant_bill: d.tenantBill,
    })
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Failed to insert bill");
    res.status(500).json({ error: "Failed to save bill" });
    return;
  }

  res.status(201).json({
    id: data.id,
    date: data.date,
    totalBill: data.total_bill,
    totalUnits: data.total_units,
    prevReading: data.prev_reading,
    presReading: data.pres_reading,
    unitPrice: data.unit_price,
    tenantUnits: data.tenant_units,
    tenantBill: data.tenant_bill,
    createdAt: data.created_at,
  });
});

router.delete("/bills/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = DeleteBillParams.safeParse({ id: raw });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const { error, count } = await supabase
    .from("bills")
    .delete({ count: "exact" })
    .eq("id", parsed.data.id);

  if (error) {
    req.log.error({ error }, "Failed to delete bill");
    res.status(500).json({ error: "Failed to delete bill" });
    return;
  }

  if (count === 0) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
