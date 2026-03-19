import { useState, useRef } from "react";
import { type SubmissionInput } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { fileToBase64, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CheckCircle2, ShieldCheck, MapPin, ScanLine, AlertCircle } from "lucide-react";

interface Props {
  data: Partial<SubmissionInput>;
  updateData: (data: Partial<SubmissionInput>) => void;
  onSubmit: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}

export function Step4Finalize({ data, updateData, onSubmit, onBack, isSubmitting }: Props) {
  const [hasCaptured, setHasCaptured] = useState(!!data.receiptPhoto);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean; amount?: number; message?: string } | null>(null);

  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const fieldRefs = {
    installationAddress: useRef<HTMLDivElement>(null),
    receiptPhoto: useRef<HTMLDivElement>(null),
    digitalConsent: useRef<HTMLDivElement>(null),
  };

  const EXPECTED_AMOUNT = 320.00;

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      updateData({ receiptPhoto: base64 });
      setHasCaptured(true);
      setErrors(prev => ({ ...prev, receiptPhoto: false }));
      setVerificationResult(null);
    }
  };

  const handleVerifyReceipt = async () => {
    if (!data.receiptPhoto || isVerifying) return;

    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await fetch("/api/vision/verify-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: data.receiptPhoto }),
      });

      console.log("[Receipt Verification] Response Status:", res.status);
      if (!res.ok) {
        const errorText = await res.text();
        console.error("[Receipt Verification] Error details:", errorText);
        throw new Error(`Verification failed: ${errorText}`);
      }

      const result = await res.json();
      console.log("[Receipt Verification] JSON Result:", result);
      
      let amount: any = undefined;

      // 1. Check top level or data level
      amount = result?.total_amount ?? result?.data?.total_amount ?? result?.[0]?.total_amount ?? result?.[0]?.data?.total_amount;

      // 2. Handle Gemini 'parts' structure: data.content.parts[0].text
      if (amount === undefined) {
        const partsText = result?.data?.content?.parts?.[0]?.text ?? result?.content?.parts?.[0]?.text;
        if (partsText) {
          try {
            // The text might be a JSON string like '{"total_amount": 320}' or just contain the number
            const cleanedText = partsText.replace(/```json|```/g, "").trim();
            const parsedParts = JSON.parse(cleanedText);
            amount = parsedParts?.total_amount ?? parsedParts?.amount;
          } catch (e) {
            // Fallback: try to extract number with regex if JSON parse fails
            const match = partsText.match(/(\d+(\.\d+)?)/);
            if (match) amount = match[0];
          }
        }
      }

      if (amount !== undefined) {
        const parsedAmount = parseFloat(String(amount));
        const isMatch = Math.abs(parsedAmount - EXPECTED_AMOUNT) < 0.01;
        setVerificationResult({
          success: isMatch,
          amount: parsedAmount,
          message: isMatch 
            ? "✅ სწორია" 
            : "❌ მონაცემები არ ემთხვევა"
        });
      } else {
        console.warn("[Receipt Verification] Could not find total_amount in result keys:", Object.keys(result));
        throw new Error("Could not extract amount from response");
      }
    } catch (err) {
      console.error("[Receipt Verification] Catch Block:", err);
      setVerificationResult({
        success: false,
        message: "❌ ვერ მოხერხდა მონაცემების ამოკითხვა"
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFinish = () => {
    const newErrors: Record<string, boolean> = {};
    if (!data.installationAddress) newErrors.installationAddress = true;
    if (!data.receiptPhoto) newErrors.receiptPhoto = true;
    if (!data.digitalConsent) newErrors.digitalConsent = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      const firstErrorField = (Object.keys(newErrors) as Array<keyof typeof fieldRefs>).find(
        field => newErrors[field]
      );
      if (firstErrorField && fieldRefs[firstErrorField].current) {
        fieldRefs[firstErrorField].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    onSubmit();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">დასრულება</h2>
        <p className="text-muted-foreground">დაადასტურეთ მონაცემები, მიუთითეთ მონტაჟის მისამართი და ატვირთეთ ქვითრის ფოტო.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-3" ref={fieldRefs.installationAddress}>
            <Label htmlFor="address" className={cn("text-base font-semibold flex items-center gap-2", errors.installationAddress && "text-destructive")}>
              <MapPin className="w-4 h-4 text-primary" /> მონტაჟის მისამართი *
            </Label>
            <Textarea 
              id="address" 
              placeholder="შეიყვანეთ მონტაჟის სრული მისამართი..." 
              value={data.installationAddress || ""} 
              onChange={(e) => {
                updateData({ installationAddress: e.target.value });
                setErrors(prev => ({ ...prev, installationAddress: false }));
              }}
              className={cn("min-h-[120px] rounded-xl resize-none", errors.installationAddress && "border-destructive bg-destructive/5")}
            />
          </div>

          <div className="space-y-3" ref={fieldRefs.receiptPhoto}>
            <Label className={cn("text-base font-semibold flex items-center gap-2", errors.receiptPhoto && "text-destructive")}>
              <Camera className="w-4 h-4 text-primary" /> ქვითრის ფოტო *
            </Label>
            <div className={cn(
              "bg-muted/40 border border-border/50 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4",
              errors.receiptPhoto && "border-destructive bg-destructive/5"
            )}>
              {hasCaptured ? (
                <div className="w-full space-y-4">
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-2">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <p className="font-semibold text-foreground">ქვითრის ფოტო წარმატებით აიტვირთა.</p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full h-12 rounded-xl gap-2 border-primary/20 hover:bg-primary/5 text-primary font-bold"
                      onClick={handleVerifyReceipt}
                      disabled={isVerifying}
                    >
                      {isVerifying ? (
                        <>
                          <ScanLine className="w-5 h-5 animate-pulse" />
                          მოწმდება...
                        </>
                      ) : (
                        <>
                          <ScanLine className="w-5 h-5" />
                          შეამოწმე ქვითარი
                        </>
                      )}
                    </Button>

                    <AnimatePresence>
                      {verificationResult && (
                        <div className={cn(
                          "p-4 rounded-xl border flex items-center gap-3 text-left shadow-sm transition-all animate-in fade-in slide-in-from-top-2",
                          verificationResult.success 
                            ? "bg-green-500/10 border-green-500/20 text-green-700" 
                            : "bg-red-500/10 border-red-500/20 text-red-600 font-bold"
                        )}>
                          {verificationResult.success ? (
                            <CheckCircle2 className="w-5 h-5 shrink-0" />
                          ) : (
                            <AlertCircle className="w-5 h-5 shrink-0" />
                          )}
                          <span className="text-base">{verificationResult.message}</span>
                        </div>
                      )}
                    </AnimatePresence>

                    <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-border bg-black/5 mt-2">
                      <img
                        src={data.receiptPhoto}
                        alt="Receipt"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    <label className="text-sm text-primary hover:underline cursor-pointer font-medium mt-2 block">
                      ხელახლა გადაღება
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 bg-background border shadow-sm text-muted-foreground rounded-full flex items-center justify-center mb-2">
                    <Camera className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-muted-foreground max-w-[250px]">გადაუღეთ მკაფიო ფოტო დაბეჭდილ ქვითარს.</p>
                  <label className="mt-2 cursor-pointer">
                    <div className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl font-medium shadow-md hover:bg-primary/90 transition-colors inline-block">
                      კამერის გახსნა
                    </div>
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-lg text-foreground flex items-center gap-2 border-b border-primary/10 pb-3">
              შეკვეთის შეჯამება
            </h3>
            
            <div className="space-y-3 pt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">მომხმარებელი:</span>
                <span className="font-medium text-foreground">{data.firstName} {data.lastName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">პირადი ნომერი:</span>
                <span className="font-medium text-foreground">{data.idNumber}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">მდებარეობა:</span>
                <span className="font-medium text-foreground">{data.city}</span>
              </div>
              
              <div className="h-px bg-primary/10 w-full my-2"></div>
              
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">მოდელი:</span>
                <span className="font-medium text-foreground">{data.model}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">საწყისი ფასი:</span>
                <span className="font-medium text-foreground">{data.price} GEL</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">სუბსიდია:</span>
                <span className="font-medium text-foreground">{(data.subsidyRate || 0) * 100}%</span>
              </div>
              
              <div className="h-px bg-primary/10 w-full my-2"></div>
              
              <div className="flex justify-between items-center">
                <span className="font-bold text-foreground">საბოლოო გადასახდელი:</span>
                <span className="text-2xl font-extrabold text-primary">{data.finalPayable?.toFixed(2)} GEL</span>
              </div>
            </div>
          </div>

          <div className={cn("bg-card border border-border p-5 rounded-2xl flex items-start gap-4", errors.digitalConsent && "border-destructive bg-destructive/5")} ref={fieldRefs.digitalConsent}>
            <Checkbox 
              id="consent" 
              checked={data.digitalConsent || false}
              onCheckedChange={(c) => {
                updateData({ digitalConsent: c as boolean });
                setErrors(prev => ({ ...prev, digitalConsent: false }));
              }}
              className={cn("mt-1 w-5 h-5", errors.digitalConsent && "border-destructive")}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="consent" className={cn("text-sm font-semibold cursor-pointer flex items-center gap-1.5", errors.digitalConsent && "text-destructive")}>
                <ShieldCheck className="w-4 h-4 text-primary" /> ციფრული თანხმობა
              </Label>
              <p className="text-sm text-muted-foreground">
                ვადასტურებ, რომ მიწოდებული ინფორმაცია და თანდართული დოკუმენტები არის სწორი და სანდო. ვეთანხმები სუბსიდირების პროგრამის პირობებს.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 flex justify-between border-t border-border mt-8">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting} className="px-8 h-12 rounded-xl text-base">უკან</Button>
        <Button 
          onClick={handleFinish} 
          disabled={isSubmitting} 
          className="px-10 h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/25 hover:-translate-y-0.5 transition-all"
        >
          {isSubmitting ? "განაცხადი მუშავდება..." : "განაცხადის გაგზავნა"}
        </Button>
      </div>
    </motion.div>
  );
}
