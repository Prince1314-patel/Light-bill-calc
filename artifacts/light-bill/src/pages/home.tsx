import React, { useState, useEffect, useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarIcon } from "lucide-react";
import { motion, AnimatePresence, animate } from "framer-motion";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
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

const vt = {
  en: {
    brand: "VoltMetric",
    analyst: "Energy Analyst",
    unit: "Utility Billing Unit",
    newCalc: "New Calculation",
    dashboard: "Dashboard",
    analytics: "Analytics",
    settings: "Settings",
    support: "Support",
    signOut: "Sign Out",
    billingMonth: "Billing Date",
    liveSummary: "Live Bill Summary",
    payable: "Tenant Payable Amount",
    consumed: "Consumed",
    rate: "Rate",
    units: "Units",
    perU: "/ U",
    history: "Billing History"
  },
  gu: {
    brand: "VoltMetric",
    analyst: "ઉર્જા વિશ્લેષક",
    unit: "બિલિંગ વિભાગ",
    newCalc: "નવી ગણતરી",
    dashboard: "ડેશબોર્ડ",
    analytics: "વિશ્લેષણ",
    settings: "સેટિંગ્સ",
    support: "સહાયતા",
    signOut: "સાઇન આઉટ",
    billingMonth: "બિલિંગ તારીખ",
    liveSummary: "બિલ વિગત (લાઈવ)",
    payable: "ચૂકવવાપાત્ર રકમ",
    consumed: "વપરાયેલ",
    rate: "દર",
    units: "યુનિટ",
    perU: "/ યુનિટ",
    history: "બિલિંગ ઇતિહાસ"
  }
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15
    }
  }
};

function NumberCounter({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const startVal = prevValue.current;
    prevValue.current = value;

    const controls = animate(startVal, value, {
      duration: 1.0,
      ease: "easeOut",
      onUpdate(latest) {
        node.textContent = `${prefix}${latest.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })}${suffix}`;
      },
    });

    return () => controls.stop();
  }, [value, decimals, prefix, suffix]);

  return (
    <span ref={ref}>
      {prefix}
      {value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

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

  const [showSuccessAnim, setShowSuccessAnim] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "history">("dashboard");

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
        setShowSuccessAnim(true);
        setTimeout(() => setShowSuccessAnim(false), 2000);
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
        toast({ title: "Record deleted successfully" });
        queryClient.invalidateQueries({ queryKey: getListBillsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetBillStatsQueryKey() });
        // Reset last calculation state if it was deleted
        setLastCalculated(null);
      }
    });
  };

  const handleNewCalculation = () => {
    const latestReading = bills && bills.length > 0
      ? [...bills].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].presReading
      : 0;

    form.reset({
      date: new Date(),
      totalBill: 0,
      totalUnits: 0,
      prevReading: latestReading,
      presReading: 0,
    });
    setLastCalculated(null);
    toast({ title: "Form reset for new calculation" });
  };

  const latestBill = useMemo(() => {
    if (bills && bills.length > 0) {
      return [...bills].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    }
    return null;
  }, [bills]);

  const displayPayable = lastCalculated ? lastCalculated.tenantBill : (latestBill ? latestBill.tenantBill : 0);
  const displayConsumed = lastCalculated ? lastCalculated.tenantUnits : (latestBill ? latestBill.tenantUnits : 0);
  const displayRate = lastCalculated ? lastCalculated.unitPrice : (latestBill ? latestBill.unitPrice : 0);

  return (
    <div className="font-body-md text-on-surface antialiased flex h-screen w-full overflow-hidden bg-background">
      
      {/* SideNavBar */}
      <motion.nav 
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 80, damping: 15 }}
        className="bg-surface-container-low border-r border-outline-variant h-screen w-64 fixed left-0 top-0 flex flex-col py-md px-sm gap-base overflow-y-auto z-40 hidden md:flex"
      >
        {/* Brand */}
        <div className="px-md py-sm mb-lg">
          <span className="font-headline-md text-headline-md text-on-surface">{vt[lang].brand}</span>
        </div>
        
        {/* User Profile Info */}
        <div className="flex items-center gap-md px-md mb-lg">
          <img
            alt="User Profile"
            className="w-10 h-10 rounded-full border border-outline-variant object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDLB0jjOAfypdE4p_HMoNbiOOl7Z4OwZ1GAcIwcR0gbXYEcki3oMNyniFYgD_Num9myTG-47T6DuCUyizn8raJ5s6QQvOYayNZLpl-4lmXQTfbCC6uIaoiEkKGIj4IfgSXSjENjdEIL4aIyNcNNKiJkFxxO6rzlCFYHS6oVu2Fvu258aXUSkpXaRCJk2bvnhx0Xp_pYMDb_6pcsNbZc_0vMawkDe_05gAaYMX0Bu7s0zoz042cXAGt42WdOScYLqGJ-t_vOjPLaNMcD"
          />
          <div>
            <p className="font-label-sm text-label-sm text-on-surface font-semibold">{vt[lang].analyst}</p>
            <p className="font-label-sm text-label-sm text-on-surface-variant text-[10px]">{vt[lang].unit}</p>
          </div>
        </div>

        {/* CTA button: Reset / New Calc */}
        <div className="px-md mb-lg">
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleNewCalculation}
            className="w-full bg-primary text-on-primary py-sm px-md rounded-DEFAULT font-label-sm text-label-sm font-bold flex items-center justify-center gap-sm hover:opacity-90 transition-opacity cursor-pointer shadow-sm border-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            {vt[lang].newCalc}
          </motion.button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex-1 flex flex-col gap-base relative">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`w-full rounded-lg font-bold flex items-center gap-md px-md py-sm transition-all active:scale-95 duration-150 border-0 cursor-pointer text-left relative z-0 ${
              activeTab === "dashboard"
                ? "text-on-secondary-container font-extrabold"
                : "text-on-surface-variant hover:bg-surface-container-high/40 bg-transparent"
            }`}
          >
            {activeTab === "dashboard" && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-secondary-container rounded-lg -z-10"
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              />
            )}
            <span className="material-symbols-outlined z-10">dashboard</span>
            <span className="z-10">{vt[lang].dashboard}</span>
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`w-full rounded-lg font-bold flex items-center gap-md px-md py-sm transition-all active:scale-95 duration-150 border-0 cursor-pointer text-left relative z-0 ${
              activeTab === "history"
                ? "text-on-secondary-container font-extrabold"
                : "text-on-surface-variant hover:bg-surface-container-high/40 bg-transparent"
            }`}
          >
            {activeTab === "history" && (
              <motion.div
                layoutId="activeTabPill"
                className="absolute inset-0 bg-secondary-container rounded-lg -z-10"
                transition={{ type: "spring", stiffness: 350, damping: 25 }}
              />
            )}
            <span className="material-symbols-outlined z-10">history</span>
            <span className="z-10">{t.history}</span>
          </button>
        </div>

        {/* Footer Tabs */}
        <div className="mt-auto flex flex-col gap-base pt-md border-t border-outline-variant">
          <a
            className="text-on-surface-variant flex items-center gap-md px-md py-sm hover:bg-surface-container-high transition-all active:scale-95 duration-150 rounded-lg"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            <span className="material-symbols-outlined">help</span>
            {vt[lang].support}
          </a>
          <a
            className="text-on-surface-variant flex items-center gap-md px-md py-sm hover:bg-surface-container-high transition-all active:scale-95 duration-150 rounded-lg"
            href="#"
            onClick={(e) => e.preventDefault()}
          >
            <span className="material-symbols-outlined">logout</span>
            {vt[lang].signOut}
          </a>
        </div>
      </motion.nav>

      {/* Main Content Wrapper */}
      <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden">
        
        {/* TopNavBar */}
        <motion.header 
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100, damping: 18 }}
          className="bg-surface-container-lowest border-b border-outline-variant flex justify-between items-center px-lg h-xl w-full sticky top-0 z-30"
        >
          <div className="flex items-center gap-md md:hidden">
            <span className="font-headline-md text-headline-md text-primary font-bold">{vt[lang].brand}</span>
          </div>
          <div className="flex-1"></div>
          
          <div className="flex items-center gap-lg">
            <button
              onClick={() => setLang(lang === "en" ? "gu" : "en")}
              className="text-secondary font-label-sm text-label-sm cursor-pointer hover:text-primary transition-colors flex items-center gap-2 bg-transparent border-0 font-medium"
            >
              <span className="material-symbols-outlined text-[18px]">translate</span>
              Language: {lang.toUpperCase()}
            </button>
          </div>
        </motion.header>

        {/* Main Canvas */}
        <main className="flex-1 overflow-y-auto p-lg lg:p-gutter">
          <div className="max-w-container-max mx-auto space-y-gutter">
            
            {/* Stat Cards */}
            <motion.div 
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 lg:grid-cols-4 gap-md"
            >
              <motion.div 
                variants={itemVariants}
                whileHover={{ 
                  y: -4, 
                  scale: 1.02, 
                  borderColor: "var(--color-primary-container)", 
                  boxShadow: "0 10px 20px -10px rgba(0, 102, 255, 0.15)"
                }}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md transition-all duration-200 cursor-pointer"
              >
                <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-xs">{t.statsRecords}</p>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <p className="font-headline-md text-headline-md font-bold text-on-surface">
                    <NumberCounter value={stats?.totalRecords || 0} />
                  </p>
                )}
              </motion.div>
              <motion.div 
                variants={itemVariants}
                whileHover={{ 
                  y: -4, 
                  scale: 1.02, 
                  borderColor: "var(--color-primary)", 
                  boxShadow: "0 10px 20px -10px rgba(0, 80, 203, 0.15)"
                }}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md transition-all duration-200 cursor-pointer"
              >
                <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-xs">{t.statsPaid}</p>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="font-data-mono text-data-mono font-bold text-primary text-xl">
                    <NumberCounter value={Math.round(stats?.totalTenantPaid || 0)} prefix={t.rupees} />
                  </p>
                )}
              </motion.div>
              <motion.div 
                variants={itemVariants}
                whileHover={{ 
                  y: -4, 
                  scale: 1.02, 
                  borderColor: "var(--color-tertiary-container)", 
                  boxShadow: "0 10px 20px -10px rgba(0, 128, 117, 0.15)"
                }}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md transition-all duration-200 cursor-pointer"
              >
                <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-xs">{t.statsAvgUnit}</p>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <p className="font-data-mono text-data-mono font-bold text-tertiary-container text-xl">
                    <NumberCounter value={stats?.avgUnitPrice || 0} decimals={2} prefix={t.rupees} />
                  </p>
                )}
              </motion.div>
              <motion.div 
                variants={itemVariants}
                whileHover={{ 
                  y: -4, 
                  scale: 1.02, 
                  borderColor: "var(--color-outline)", 
                  boxShadow: "0 10px 20px -10px rgba(114, 118, 135, 0.12)"
                }}
                className="bg-surface-container-lowest border border-outline-variant rounded-lg p-md transition-all duration-200 cursor-pointer"
              >
                <p className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-xs">{t.statsAvgBill}</p>
                {isLoadingStats ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="font-data-mono text-data-mono font-bold text-on-surface text-xl">
                    <NumberCounter value={Math.round(stats?.avgMonthlyBill || 0)} prefix={t.rupees} />
                  </p>
                )}
              </motion.div>
            </motion.div>

            {/* Bento Grid Layout or History Tab View */}
            {activeTab === "dashboard" ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter items-start">
                
                {/* Left Col: Form & Summary */}
                <div className="lg:col-span-2 space-y-gutter">
                  
                  {/* Calculation Form */}
                  <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.15 }}
                    className="glass-card rounded-lg p-lg bg-white"
                  >
                    <h2 className="font-headline-md text-headline-md text-on-surface mb-md">{vt[lang].newCalc}</h2>
                    
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-lg">
                        <motion.div 
                          variants={containerVariants}
                          initial="hidden"
                          animate="show"
                          className="grid grid-cols-1 md:grid-cols-2 gap-lg"
                        >
                          
                          {/* Month Picker */}
                          <motion.div variants={itemVariants}>
                            <FormField
                              control={form.control}
                              name="date"
                              render={({ field }) => (
                                <FormItem className="flex flex-col gap-xs focus-glow rounded-DEFAULT transition-all">
                                  <FormLabel className="font-label-sm text-label-sm text-on-surface-variant">
                                    {vt[lang].billingMonth}
                                  </FormLabel>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <button
                                          type="button"
                                          className="w-full border border-outline-variant rounded-DEFAULT p-sm font-data-mono text-data-mono bg-surface-container-lowest focus:outline-none flex justify-between items-center text-left h-auto font-normal text-on-surface cursor-pointer"
                                        >
                                          {field.value ? (
                                            format(field.value, "MMMM d, yyyy")
                                          ) : (
                                            <span className="text-secondary">Pick a date</span>
                                          )}
                                          <span className="material-symbols-outlined text-secondary text-[18px]">calendar_today</span>
                                        </button>
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
                          </motion.div>

                          {/* Total Main Bill */}
                          <motion.div variants={itemVariants}>
                            <FormField
                              control={form.control}
                              name="totalBill"
                              render={({ field }) => (
                                <FormItem className="flex flex-col gap-xs focus-glow rounded-DEFAULT transition-all">
                                  <FormLabel className="font-label-sm text-label-sm text-on-surface-variant">
                                    {t.totalBill}
                                  </FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <span className="absolute left-sm top-1/2 -translate-y-1/2 text-secondary font-data-mono">₹</span>
                                      <input
                                        type="number"
                                        step="any"
                                        className="w-full border border-outline-variant rounded-DEFAULT py-sm pr-sm pl-8 font-data-mono text-data-mono bg-surface-container-lowest focus:outline-none"
                                        placeholder="0.00"
                                        {...field}
                                      />
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </motion.div>

                          {/* Total Units Main */}
                          <motion.div variants={itemVariants}>
                            <FormField
                              control={form.control}
                              name="totalUnits"
                              render={({ field }) => (
                                <FormItem className="flex flex-col gap-xs focus-glow rounded-DEFAULT transition-all">
                                  <FormLabel className="font-label-sm text-label-sm text-on-surface-variant">
                                    {t.totalUnits}
                                  </FormLabel>
                                  <FormControl>
                                    <input
                                      type="number"
                                      step="any"
                                      className="w-full border border-outline-variant rounded-DEFAULT p-sm font-data-mono text-data-mono bg-surface-container-lowest focus:outline-none"
                                      placeholder="0"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </motion.div>
                        </motion.div>

                        {/* Readings */}
                        <motion.div 
                          variants={containerVariants}
                          initial="hidden"
                          animate="show"
                          className="border-t border-outline-variant pt-lg grid grid-cols-1 md:grid-cols-2 gap-lg"
                        >
                          
                          {/* Prev Reading */}
                          <motion.div variants={itemVariants}>
                            <FormField
                              control={form.control}
                              name="prevReading"
                              render={({ field }) => (
                                <FormItem className="flex flex-col gap-xs focus-glow rounded-DEFAULT transition-all">
                                  <FormLabel className="font-label-sm text-label-sm text-on-surface-variant">
                                    {t.prevReading}
                                  </FormLabel>
                                  <FormControl>
                                    <input
                                      type="number"
                                      step="any"
                                      className="w-full border border-outline-variant rounded-DEFAULT p-sm font-data-mono text-data-mono bg-surface-container-lowest focus:outline-none"
                                      placeholder="0"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </motion.div>

                          {/* Present Reading */}
                          <motion.div variants={itemVariants}>
                            <FormField
                              control={form.control}
                              name="presReading"
                              render={({ field }) => (
                                <FormItem className="flex flex-col gap-xs focus-glow rounded-DEFAULT transition-all">
                                  <FormLabel className="font-label-sm text-label-sm text-on-surface-variant">
                                    {t.presReading}
                                  </FormLabel>
                                  <FormControl>
                                    <input
                                      type="number"
                                      step="any"
                                      className="w-full border border-outline-variant rounded-DEFAULT p-sm font-data-mono text-data-mono bg-surface-container-lowest focus:outline-none"
                                      placeholder="0"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </motion.div>

                        </motion.div>

                        {/* Form Actions */}
                        <div className="flex justify-end pt-md">
                          <motion.button
                            whileHover={{ 
                              scale: 1.03,
                              boxShadow: "0 4px 15px rgba(0, 80, 203, 0.4)"
                            }}
                            whileTap={{ scale: 0.97 }}
                            type="submit"
                            className="electric-btn py-sm px-lg rounded-DEFAULT font-label-sm text-label-sm font-bold flex items-center gap-sm shadow-sm transition-all cursor-pointer border-0 relative overflow-hidden group"
                            disabled={createBill.isPending}
                          >
                            <motion.div
                              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                              initial={{ left: "-100%" }}
                              whileHover={{ left: "100%" }}
                              transition={{ duration: 0.6, ease: "easeOut" }}
                            />
                            {createBill.isPending ? (
                              <>
                                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                                {"Calculating..."}
                              </>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-[18px]">calculate</span>
                                {t.calcSave}
                              </>
                            )}
                          </motion.button>
                        </div>

                      </form>
                    </Form>
                  </motion.div>

                  {/* Live Bill Summary */}
                  <motion.div 
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.25 }}
                    whileHover={{ 
                      y: -4, 
                      scale: 1.01,
                      boxShadow: "0 12px 30px -10px rgba(0, 0, 0, 0.08)"
                    }}
                    className={`bg-surface-container-lowest border rounded-lg p-lg relative overflow-hidden transition-all duration-500 ${
                      showSuccessAnim 
                        ? "border-tertiary-container ring-4 ring-tertiary-container/30 shadow-lg shadow-tertiary-container/10" 
                        : createBill.isPending 
                          ? "border-primary ring-2 ring-primary-fixed shadow-md shadow-primary/5" 
                          : "border-outline-variant"
                    }`}
                  >
                    {/* Concentric expanding ripples on success */}
                    {showSuccessAnim && (
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
                        {[1, 2, 3].map((i) => (
                          <motion.div
                            key={i}
                            className="absolute rounded-full border-2 border-tertiary-container/20"
                            initial={{ width: 0, height: 0, opacity: 0.8 }}
                            animate={{ width: 500, height: 500, opacity: 0 }}
                            transition={{
                              duration: 1.6,
                              ease: "easeOut",
                              delay: (i - 1) * 0.3,
                              repeat: Infinity
                            }}
                          />
                        ))}
                      </div>
                    )}

                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-500 ${showSuccessAnim ? "bg-tertiary-container" : "bg-primary"}`}></div>
                    
                    <div className="relative z-10">
                      <h3 className="font-label-sm text-label-sm text-secondary uppercase tracking-widest mb-md">{vt[lang].liveSummary}</h3>
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-lg">
                        <div>
                          <p className="font-label-sm text-label-sm text-on-surface-variant mb-xs">{vt[lang].payable}</p>
                          
                          <div className="flex items-center gap-sm">
                            <motion.div 
                              className={`font-display-lg text-display-lg font-bold text-on-surface transition-opacity duration-300 ${createBill.isPending ? "opacity-50" : "opacity-100"}`}
                            >
                              <span className="text-primary font-data-mono">{t.rupees}</span>
                              <span className="font-data-mono">
                                <NumberCounter value={displayPayable} />
                              </span>
                            </motion.div>

                            <AnimatePresence>
                              {showSuccessAnim && (
                                <motion.span 
                                  initial={{ scale: 0, opacity: 0, rotate: -45 }}
                                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 15 }}
                                  className="material-symbols-outlined text-tertiary-container text-[28px] font-bold"
                                >
                                  check_circle
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>
                        
                        <div className={`flex gap-lg bg-surface-container-low p-md rounded-lg transition-opacity duration-300 ${createBill.isPending ? "opacity-50" : "opacity-100"}`}>
                          <div>
                            <p className="font-label-sm text-label-sm text-secondary">{vt[lang].consumed}</p>
                            <p className="font-data-mono text-data-mono font-bold text-on-surface">
                              <NumberCounter value={displayConsumed} /> {vt[lang].units}
                            </p>
                          </div>
                          <div className="w-px bg-outline-variant"></div>
                          <div>
                            <p className="font-label-sm text-label-sm text-secondary">{vt[lang].rate}</p>
                            <p className="font-data-mono text-data-mono font-bold text-on-surface">
                              <NumberCounter value={displayRate} decimals={2} prefix={t.rupees} /> {vt[lang].perU}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>

                </div>

                {/* Right Col: History List */}
                <motion.div 
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 60, damping: 15, delay: 0.2 }}
                  id="history-section" 
                  className="glass-card rounded-lg p-md flex flex-col max-h-[600px] overflow-hidden lg:col-span-1 bg-white"
                >
                  <div className="flex justify-between items-center mb-md px-sm">
                    <h3 className="font-label-sm text-label-sm text-secondary uppercase tracking-widest">{vt[lang].history}</h3>
                    <span className="material-symbols-outlined text-secondary text-[18px] cursor-pointer hover:text-primary">filter_list</span>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pr-sm space-y-sm">
                    {isLoadingBills ? (
                      [1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full rounded-md" />
                      ))
                    ) : !bills || bills.length === 0 ? (
                      <div className="p-8 text-center border border-dashed border-border rounded-lg bg-card/50">
                        <p className="text-muted-foreground">{t.noHistory}</p>
                      </div>
                    ) : (
                      <motion.div 
                        variants={containerVariants}
                        initial="hidden"
                        animate="show"
                        className="space-y-sm relative"
                      >
                        <AnimatePresence initial={false}>
                          {[...bills]
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map((bill, index) => {
                              const isLatest = index === 0;
                              const circleBg = isLatest 
                                ? "bg-primary-fixed text-primary" 
                                : "bg-surface-container-highest text-secondary";
                              
                              return (
                                <motion.div 
                                  key={bill.id}
                                  layout
                                  variants={itemVariants}
                                  whileHover={{ 
                                    scale: 1.02, 
                                    borderColor: "var(--color-primary)",
                                    x: 2
                                  }}
                                  exit={{ opacity: 0, x: -50, transition: { duration: 0.2 } }}
                                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                  className="bg-surface-container-lowest border border-outline-variant rounded-md p-sm flex items-center justify-between transition-colors cursor-pointer group"
                                >
                                  <div className="flex items-center gap-md">
                                    <div className={`w-12 h-12 ${circleBg} rounded-full flex flex-col items-center justify-center font-label-sm text-[10px] leading-tight font-bold shrink-0`}>
                                      <span>{format(new Date(bill.date), "MMM").toUpperCase()}</span>
                                      <span className="text-[14px] font-extrabold">{format(new Date(bill.date), "dd")}</span>
                                    </div>
                                    <div>
                                      <p className="font-data-mono text-data-mono font-bold text-on-surface group-hover:text-primary transition-colors">
                                        {t.rupees}{bill.tenantBill.toLocaleString()}
                                      </p>
                                      <p className="font-label-sm text-label-sm text-secondary">
                                        {bill.tenantUnits} {vt[lang].units} • {format(new Date(bill.date), "MMM d, yyyy")}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-xs">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDelete(bill.id);
                                      }}
                                      className="p-1 rounded text-outline-variant hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer border-0 bg-transparent"
                                      disabled={deleteBill.isPending}
                                    >
                                      <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                    <span className="material-symbols-outlined text-outline-variant group-hover:text-primary transition-colors">chevron_right</span>
                                  </div>
                                </motion.div>
                              );
                            })}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </div>
                </motion.div>

              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="glass-card rounded-lg p-lg bg-white overflow-x-auto"
              >
                <div className="flex justify-between items-center mb-md px-sm">
                  <h3 className="font-headline-md text-headline-md text-on-surface">{vt[lang].history}</h3>
                </div>
                
                {isLoadingBills ? (
                  <div className="space-y-3 p-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 w-full rounded-md" />
                    ))}
                  </div>
                ) : !bills || bills.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-lg bg-card/50">
                    <p className="text-muted-foreground">{t.noHistory}</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="border-b border-outline-variant text-secondary font-label-sm text-label-sm">
                        <th className="py-sm px-md">{t.date}</th>
                        <th className="py-sm px-md">{t.totalBill}</th>
                        <th className="py-sm px-md">{t.totalUnits}</th>
                        <th className="py-sm px-md">{t.prevReading} / {t.presReading}</th>
                        <th className="py-sm px-md">{vt[lang].consumed}</th>
                        <th className="py-sm px-md">{vt[lang].rate}</th>
                        <th className="py-sm px-md font-bold text-primary">{t.tenantBill}</th>
                        <th className="py-sm px-md text-right"></th>
                      </tr>
                    </thead>
                    <motion.tbody 
                      variants={containerVariants}
                      initial="hidden"
                      animate="show"
                      className="divide-y divide-outline-variant font-data-mono text-data-mono"
                    >
                      {bills
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                        .map((bill) => (
                          <motion.tr 
                            key={bill.id}
                            variants={itemVariants}
                            layout
                            whileHover={{ 
                              backgroundColor: "rgba(236, 238, 240, 0.4)",
                              x: 4
                            }}
                            className="transition-colors group cursor-pointer"
                          >
                            <td className="py-md px-md font-sans font-medium text-on-surface">
                              {format(new Date(bill.date), "MMMM d, yyyy")}
                            </td>
                            <td className="py-md px-md">{t.rupees}{bill.totalBill.toLocaleString()}</td>
                            <td className="py-md px-md">{bill.totalUnits} kWh</td>
                            <td className="py-md px-md text-secondary">
                              {bill.prevReading} ➔ {bill.presReading}
                            </td>
                            <td className="py-md px-md font-semibold text-on-surface">{bill.tenantUnits} kWh</td>
                            <td className="py-md px-md">{t.rupees}{bill.unitPrice.toFixed(2)}/u</td>
                            <td className="py-md px-md font-bold text-primary text-base">
                              {t.rupees}{bill.tenantBill.toLocaleString()}
                            </td>
                            <td className="py-md px-md text-right">
                              <button
                                onClick={() => handleDelete(bill.id)}
                                className="p-2 rounded text-outline-variant hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer border-0 bg-transparent"
                                disabled={deleteBill.isPending}
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                    </motion.tbody>
                  </table>
                )}
              </motion.div>
            )}
          </div>
        </main>
      </div>

    </div>
  );
}
