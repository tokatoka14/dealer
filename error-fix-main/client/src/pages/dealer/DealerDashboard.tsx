import { useState } from "react";
import { useDealerAuth } from "@/hooks/use-dealer-auth";
import { type SubmissionInput } from "@shared/routes";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { Step1Identity } from "@/components/wizard/Step1Identity";
import { Step2Profile } from "@/components/wizard/Step2Profile";
import { Step3Product } from "@/components/wizard/Step3Product";
import { Step4Finalize } from "@/components/wizard/Step4Finalize";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { AnimatePresence } from "framer-motion";
import { LogOut, LayoutDashboard, Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function DealerDashboard() {
  const { dealer, logout, isLoading: authLoading } = useDealerAuth();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<SubmissionInput>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateData = (newData: Partial<SubmissionInput>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
  };

  const nextStep = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep((s) => Math.min(4, s + 1));
  };

  const prevStep = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    if (!dealer) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/workspace/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "გაგზავნა ვერ მოხერხდა" }));
        throw new Error(err.message || "განაცხადის გაგზავნა ვერ მოხერხდა");
      }

      toast({
        title: "განაცხადი გაიგზავნა",
        description: "მომხმარებლის განაცხადი წარმატებით დამუშავდა.",
      });
      setFormData({});
      setStep(1);
    } catch (error) {
      toast({
        title: "გაგზავნის შეცდომა",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !dealer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Workspace Navbar — no admin links, only dealer info + logout */}
      <nav className="sticky top-0 z-50 w-full border-b border-white/20 bg-background/60 backdrop-blur-xl transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-3 cursor-pointer"
                onClick={() => { setStep(1); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                    {dealer.name}
                  </span>
                  <span className="block text-xs text-muted-foreground -mt-0.5">სამუშაო პორტალი</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-semibold">{dealer.email}</span>
                <span className="text-xs text-muted-foreground">ავტორიზებული დილერი</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => logout()}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Wizard — the operational sales flow */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">ახალი განაცხადი</h1>
          <p className="text-muted-foreground text-lg">მიჰყევით ნაბიჯებს მომხმარებლის შეკვეთის დასამუშავებლად</p>
        </div>

        <div className="glass-card rounded-3xl p-6 md:p-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[80px] -z-10 pointer-events-none" />

          <StepIndicator currentStep={step} />

          <div className="mt-8 relative min-h-[400px]">
            <ErrorBoundary
              fallbackMessage="ნაბიჯის ჩატვირთვა ვერ მოხერხდა"
              onReset={() => { setStep(1); setFormData({}); }}
            >
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <Step1Identity key="step1" data={formData} updateData={updateData} onNext={nextStep} />
                )}
                {step === 2 && (
                  <Step2Profile key="step2" data={formData} updateData={updateData} onNext={nextStep} onBack={prevStep} />
                )}
                {step === 3 && (
                  <Step3Product key="step3" data={formData} updateData={updateData} onNext={nextStep} onBack={prevStep} dealerKey={dealer.key} dealerName={dealer.name} />
                )}
                {step === 4 && (
                  <Step4Finalize key="step4" data={formData} updateData={updateData} onSubmit={handleSubmit} onBack={prevStep} isSubmitting={isSubmitting} />
                )}
              </AnimatePresence>
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}
