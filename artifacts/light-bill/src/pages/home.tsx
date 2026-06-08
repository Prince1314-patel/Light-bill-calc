import React, { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Trash2, Globe } from "lucide-react";

import {
  useListBills,
  getListBillsQueryKey,
  useCreateBill,
  useDeleteBill,
  useGetBillStats,
  getGetBillStatsQueryKey
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { translations, Language } from "@/lib/translations";

const formSchema = z.object({
  date: z.date({
    required_error: "A date is required.",
  }),
  totalBill: z.coerce.number().min(1, "Must be greater than 0"),
  totalUnits: z.coerce.number().min(1, "Must be greater than 0"),
  prevReading: z.coerce.number().min(0, "Cannot be negative"),
  presReading: z.coerce.number().min(0, "Cannot be negative"),
}).refine((data) => data.presReading >= data.prevReading, {
  message: "Present reading must be >= Previous reading",
  path: ["presReading"],
});

export default function Home() {
  const [lang, setLang] = useState<Language>("en");
  const t = translations[lang];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bills, isLoading: isLoadingBills } = useListBills();
  const { data: stats, isLoading: isLoadingStats } = useGetBillStats();
  
  const createBill = useCreateBill();
  const deleteBill = useDeleteBill();

  const [lastCalculated, setLastCalculated] = useState<{
    unitPrice: number;
    tenantUnits: number;
    tenantBill: number;
  } | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      date: new Date(),
      totalBill: 0,
      totalUnits: 0,
      prevReading: 0,
      presReading: 0,
    },
  });

  // Auto-fill previous reading from the latest bill
  useEffect(() => {
    if (bills && bills.length > 0) {
      // Assuming bills are ordered latest first. If not, we might need to sort.
      const latestBill = [...bills].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      if (form.getValues("prevReading") === 0) {
        form.setValue("prevReading", latestBill.presReading);
      }
    }
  }, [bills, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const unitPrice = values.totalBill / values.totalUnits;
    const tenantUnits = values.presReading - values.prevReading;
    const tenantBill = Math.round(unitPrice * tenantUnits);

    setLastCalculated({ unitPrice, tenantUnits, tenantBill });

    createBill.mutate({
      data: {
        date: format(values.date, "yyyy-MM-dd"),
        totalBill: values.totalBill,
        totalUnits: values.totalUnits,
        prevReading: values.prevReading,
        presReading: values.presReading,
        unitPrice,
        tenantUnits,
        tenantBill,
      }
    }, {
      onSuccess: () => {
        toast({ title: t.successMsg });
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBillStatsQueryKey() });
        // Update previous reading to the one just submitted
        form.setValue("prevReading", values.presReading);
        form.setValue("presReading", 0);
      },
      onError: () => {
        toast({ title: t.errorMsg, variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: string) => {
    deleteBill.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBillStatsQueryKey() });
      }
    });
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background p-4 md:p-8 font-sans selection:bg-primary selection:text-primary-foreground">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Light Bill Calculator
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Precise, simple tenant calculations.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLang(lang === "en" ? "gu" : "en")}
            className="flex items-center gap-2 font-medium"
          >
            <Globe className="h-4 w-4" />
            {lang === "en" ? "ગુજરાતી" : "English"}
          </Button>
        </header>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card shadow-sm border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.statsRecords}</p>
              {isLoadingStats ? <Skeleton className="h-6 w-12 mt-1" /> : <p className="text-xl font-semibold mt-1">{stats?.totalRecords || 0}</p>}
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.statsPaid}</p>
              {isLoadingStats ? <Skeleton className="h-6 w-20 mt-1" /> : <p className="text-xl font-semibold mt-1">{t.rupees}{stats?.totalTenantPaid || 0}</p>}
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.statsAvgUnit}</p>
              {isLoadingStats ? <Skeleton className="h-6 w-16 mt-1" /> : <p className="text-xl font-semibold mt-1">{t.rupees}{stats?.avgUnitPrice?.toFixed(2) || "0.00"}</p>}
            </CardContent>
          </Card>
          <Card className="bg-card shadow-sm border-border">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t.statsAvgBill}</p>
              {isLoadingStats ? <Skeleton className="h-6 w-20 mt-1" /> : <p className="text-xl font-semibold mt-1">{t.rupees}{stats?.avgMonthlyBill?.toFixed(0) || "0"}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Left Column: Form & Summary */}
          <div className="space-y-6">
            <Card className="shadow-md border-border overflow-hidden">
              <div className="h-1 w-full bg-primary" />
              <CardContent className="p-6">
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    
                    <FormField
                      control={form.control}
                      name="date"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>{t.date}</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant={"outline"}
                                  className={cn(
                                    "w-full pl-3 text-left font-normal bg-white",
                                    !field.value && "text-muted-foreground"
                                  )}
                                >
                                  {field.value ? (
                                    format(field.value, "PPP")
                                  ) : (
                                    <span>Pick a date</span>
                                  )}
                                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={field.value}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="totalBill"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.totalBill}</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" className="bg-white" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="totalUnits"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.totalUnits}</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" className="bg-white" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="prevReading"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.prevReading}</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" className="bg-white" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="presReading"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t.presReading}</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" className="bg-white" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button type="submit" className="w-full font-medium" disabled={createBill.isPending}>
                      {createBill.isPending ? "..." : t.calcSave}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            {/* Result Summary */}
            {lastCalculated && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <Card className="bg-primary/5 border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg text-primary-foreground">{t.billSummary}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{t.unitPrice}</span>
                        <span className="font-mono font-medium">{t.rupees}{lastCalculated.unitPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{t.unitsConsumed}</span>
                        <span className="font-mono font-medium">{lastCalculated.tenantUnits}</span>
                      </div>
                      <div className="pt-3 border-t border-border flex justify-between items-center">
                        <span className="font-semibold">{t.tenantBill}</span>
                        <span className="text-2xl font-bold text-primary-foreground">
                          {t.rupees}{lastCalculated.tenantBill}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Right Column: History */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
              {t.history}
            </h2>
            
            {isLoadingBills ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-24 w-full rounded-md" />
                ))}
              </div>
            ) : !bills || bills.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-lg bg-card/50">
                <p className="text-muted-foreground">{t.noHistory}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {bills.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(bill => (
                  <Card key={bill.id} className="bg-card shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-foreground">{format(new Date(bill.date), "MMMM d, yyyy")}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{bill.tenantUnits} units</span>
                            <span className="w-1 h-1 rounded-full bg-border" />
                            <span>{t.rupees}{bill.unitPrice.toFixed(2)}/u</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-primary-foreground">{t.rupees}{bill.tenantBill}</p>
                        </div>
                      </div>
                      
                      <div className="absolute right-0 top-0 bottom-0 flex items-center translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all bg-gradient-to-l from-background via-background to-transparent pl-8 pr-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(bill.id)}
                          disabled={deleteBill.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </div>
    </div>
  );
}
