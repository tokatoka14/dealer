import { useState, useRef } from "react";
import { type SubmissionInput } from "@shared/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { fileToBase64, cn } from "@/lib/utils";
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

interface Props {
  data: Partial<SubmissionInput>;
  updateData: (data: Partial<SubmissionInput>) => void;
  onNext: () => void;
  onBack: () => void;
}

const GEORGIAN_ERRORS: Record<string, string> = {
  "Document is older than 6 days.": "დოკუმენტი ვადაგასულია (6 დღეზე მეტია გასული ამონაწერის მომზადებიდან). გთხოვთ, ატვირთოთ ახალი ამონაწერი.",
};

function extractVisionApiError(payload: unknown): string | null {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? "");
  for (const [key, georgian] of Object.entries(GEORGIAN_ERRORS)) {
    if (raw.includes(key)) return georgian;
  }
  return null;
}

export function Step2Profile({ data, updateData, onNext, onBack }: Props) {
  const [isPensionerVerified, setIsPensionerVerified] = useState(false);
  const [isVerifyingPensioner, setIsVerifyingPensioner] = useState(false);
  const [pensionerVerifyError, setPensionerVerifyError] = useState<string | null>(null);
  const [pendingPensionerFile, setPendingPensionerFile] = useState<File | null>(null);

  const [isSocialVerified, setIsSocialVerified] = useState(false);
  const [isVerifyingSocial, setIsVerifyingSocial] = useState(false);
  const [socialVerifyError, setSocialVerifyError] = useState<string | null>(null);
  const [pendingSocialFile, setPendingSocialFile] = useState<File | null>(null);

  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const fieldRefs = {
    firstName: useRef<HTMLDivElement>(null),
    lastName: useRef<HTMLDivElement>(null),
    idNumber: useRef<HTMLDivElement>(null),
    phone: useRef<HTMLDivElement>(null),
    socialExtract: useRef<HTMLDivElement>(null),
    pensionerCertificate: useRef<HTMLDivElement>(null),
  };

  const handleFileUpload = async (field: "socialExtract" | "pensionerCertificate", e: React.ChangeEvent<HTMLInputElement>) => {
    // always grab the first File object directly from the input element
    const file = e.target.files?.[0];
    if (!file) return;

    // store a base64 copy for eventual JSON submission, but keep the
    // `pendingPensionerFile` state as a real File so FormData.append works
    const base64 = await fileToBase64(file);
    updateData({ [field]: base64 });
    setErrors((prev) => ({ ...prev, [field]: false }));

    if (field === "pensionerCertificate") {
      // Store file locally and wait for explicit "Send" click to verify.
      setPendingPensionerFile(file);
      setIsVerifyingPensioner(false);
      setPensionerVerifyError(null);
      setIsPensionerVerified(false);
    } else if (field === "socialExtract") {
      // Store file locally and wait for explicit "Send" click to verify.
      setPendingSocialFile(file);
      setIsVerifyingSocial(false);
      setSocialVerifyError(null);
      setIsSocialVerified(false);
    }
  };

  const handleSendPensionerVerification = async () => {
    if (!pendingPensionerFile || isVerifyingPensioner) return;

    setIsVerifyingPensioner(true);
    setPensionerVerifyError(null);
    setIsPensionerVerified(false);

    try {
      const base64 = await fileToBase64(pendingPensionerFile);

      const res = await axios.post("/api/vision/verify-pensioner", { image: base64 }, {
        withCredentials: true,
      });

      const verified = res.data;

      // Safety: if the response is empty or not an object, treat as failure
      if (!verified || typeof verified !== "object") {
        setIsPensionerVerified(false);
        setPensionerVerifyError("პასუხი ცარიელია ან არასწორი ფორმატით მოვიდა");
        return;
      }

      const embeddedError = extractVisionApiError(verified);
      if (embeddedError) {
        setIsPensionerVerified(false);
        setPensionerVerifyError(embeddedError);
        return;
      }

      // If n8n explicitly returns success: false, treat as failure
      if (verified.success === false) {
        setIsPensionerVerified(false);
        setPensionerVerifyError("დოკუმენტის გადამოწმება ვერ მოხერხდა");
        return;
      }

      const normalizeId = (v: string | undefined | null) =>
        String(v ?? "")
          .trim()
          .replace(/\s+/g, "");

      const pid = normalizeId(verified?.personalId);
      const formId = normalizeId(data.idNumber as string | undefined);

      // personalId is the primary unique identifier
      const idMatch = pid.length > 0 && formId.length > 0 && pid === formId;

      if (idMatch) {
        // ID match is sufficient — minor name spelling differences (e.g. ელენე vs ელენა) are allowed
        setIsPensionerVerified(true);
        setPensionerVerifyError(null);
        // Auto-toggle pensioner switcher ON on successful verification
        if (!data.pensioner) {
          updateData({ pensioner: true });
        }
      } else {
        // personalId mismatch — verification fails
        setIsPensionerVerified(false);
        setPensionerVerifyError(
          "პირადი ნომერი არ ემთხვევა. პირადობის მოწმობისა და პენსიონერის დოკუმენტის პირადი ნომრები განსხვავებულია."
        );
      }
    } catch (err: unknown) {
      const errData = (err as any)?.response?.data;
      const georgianMsg = extractVisionApiError(errData);
      const msg = georgianMsg
        ?? (typeof errData?.message === "string" ? errData.message : null)
        ?? "დადასტურება ვერ მოხერხდა";
      setIsPensionerVerified(false);
      setPensionerVerifyError(msg);
    } finally {
      setIsVerifyingPensioner(false);
    }
  };

  const handleSendSocialVerification = async () => {
    if (!pendingSocialFile || isVerifyingSocial) return;

    setIsVerifyingSocial(true);
    setSocialVerifyError(null);
    setIsSocialVerified(false);

    try {
      const base64 = await fileToBase64(pendingSocialFile);

      const res = await axios.post("/api/vision/verify-social-card", {
        image: base64,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        personalId: data.idNumber || "",
        idNumber: data.idNumber || "",
      }, {
        withCredentials: true,
      });

      const embeddedErr = extractVisionApiError(res.data);
      if (embeddedErr) {
        setIsSocialVerified(false);
        setSocialVerifyError(embeddedErr);
      } else if (res.data?.success && res.data?.data) {
        setIsSocialVerified(true);
        setSocialVerifyError(null);
      } else {
        setIsSocialVerified(false);
        setSocialVerifyError("შესაბამისობა ვერ მოხერხდა");
      }
    } catch (err: unknown) {
      const errData = (err as any)?.response?.data;
      const georgianMsg = extractVisionApiError(errData);
      const msg = georgianMsg
        ?? (typeof errData?.message === "string" ? errData.message : null)
        ?? "დადასტურება ვერ მოხერხდა";
      setIsSocialVerified(false);
      setSocialVerifyError(msg);
    } finally {
      setIsVerifyingSocial(false);
    }
  };

  const handleNext = () => {
    const newErrors: Record<string, boolean> = {};
    if (!data.firstName) newErrors.firstName = true;
    if (!data.lastName) newErrors.lastName = true;
    if (!data.idNumber) newErrors.idNumber = true;
    if (!data.phone) newErrors.phone = true;
    if (data.sociallyVulnerable && (!data.socialExtract || !isSocialVerified)) newErrors.socialExtract = true;
    if (data.pensioner && (!data.pensionerCertificate || !isPensionerVerified)) newErrors.pensionerCertificate = true;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Find the first field with an error and scroll to it
      const firstErrorField = (Object.keys(newErrors) as Array<keyof typeof fieldRefs>).find(
        (field) => newErrors[field]
      );
      if (firstErrorField && fieldRefs[firstErrorField].current) {
        fieldRefs[firstErrorField].current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }
    onNext();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">პროფილი</h2>
        <p className="text-muted-foreground">შეავსეთ საკონტაქტო ინფორმაცია და განსაზღვრეთ შესაბამისობის კრიტერიუმები.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2 md:col-span-2">
          <h3 className="text-lg font-semibold border-b pb-2">პირადი მონაცემები</h3>
        </div>

        <div className="space-y-2" ref={fieldRefs.firstName}>
          <Label htmlFor="firstName" className={cn(errors.firstName && "text-destructive")}>სახელი *</Label>
          <Input
            id="firstName"
            placeholder="შეიყვანეთ სახელი"
            value={data.firstName || ""}
            onChange={(e) => {
              updateData({ firstName: e.target.value });
              setErrors((prev) => ({ ...prev, firstName: false }));
            }}
            className={cn("h-12 rounded-xl", errors.firstName && "border-destructive bg-destructive/5")}
          />
        </div>

        <div className="space-y-2" ref={fieldRefs.lastName}>
          <Label htmlFor="lastName" className={cn(errors.lastName && "text-destructive")}>გვარი *</Label>
          <Input
            id="lastName"
            placeholder="შეიყვანეთ გვარი"
            value={data.lastName || ""}
            onChange={(e) => {
              updateData({ lastName: e.target.value });
              setErrors((prev) => ({ ...prev, lastName: false }));
            }}
            className={cn("h-12 rounded-xl", errors.lastName && "border-destructive bg-destructive/5")}
          />
        </div>

        <div className="space-y-2" ref={fieldRefs.idNumber}>
          <Label htmlFor="idNumber" className={cn(errors.idNumber && "text-destructive")}>პირადი ნომერი *</Label>
          <Input
            id="idNumber"
            placeholder="შეიყვანეთ 11-ნიშნა პირადი ნომერი"
            value={data.idNumber || ""}
            onChange={(e) => {
              updateData({ idNumber: e.target.value });
              setErrors((prev) => ({ ...prev, idNumber: false }));
            }}
            className={cn("h-12 rounded-xl", errors.idNumber && "border-destructive bg-destructive/5")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="gender">სქესი</Label>
          <Input
            id="gender"
            placeholder="მაგ: ქალი / კაცი"
            value={data.gender || ""}
            onChange={(e) => updateData({ gender: e.target.value })}
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="expiryDate">პირადობის ვადა</Label>
          <Input
            id="expiryDate"
            placeholder="მაგ: 2030-12-31"
            value={data.expiryDate || ""}
            onChange={(e) => updateData({ expiryDate: e.target.value })}
            className="h-12 rounded-xl"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <h3 className="text-lg font-semibold border-b pb-2 pt-2">კონტაქტი და მდებარეობა</h3>
        </div>

        <div className="space-y-2" ref={fieldRefs.phone}>
          <Label htmlFor="phone" className={cn(errors.phone && "text-destructive")}>ტელეფონი *</Label>
          <Input 
            id="phone" 
            placeholder="მაგ: 599 12 34 56" 
            value={data.phone || ""} 
            onChange={(e) => {
              updateData({ phone: e.target.value });
              setErrors((prev) => ({ ...prev, phone: false }));
            }}
            className={cn("h-12 rounded-xl", errors.phone && "border-destructive bg-destructive/5")}
          />
        </div>
      </div>

      <div className="pt-4 space-y-6">
        <h3 className="text-lg font-semibold border-b pb-2">სტატუსი</h3>

        {/* Socially Vulnerable */}
        <div className="bg-muted/40 p-5 rounded-2xl border border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">სოციალურად დაუცველი</Label>
              <p className="text-sm text-muted-foreground">აქვს თუ არა განმცხადებელს სოციალურად დაუცველის სტატუსი?</p>
            </div>
            <Switch 
              checked={data.sociallyVulnerable || false} 
              onCheckedChange={(c) => {
                updateData({ sociallyVulnerable: c });
                if (!c) {
                  setIsSocialVerified(false);
                  setSocialVerifyError(null);
                  setPendingSocialFile(null);
                }
              }}
            />
          </div>
          <AnimatePresence>
            {data.sociallyVulnerable && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2" ref={fieldRefs.socialExtract}>
                  <Label className={cn("block mb-2 text-sm", errors.socialExtract && "text-destructive")}>სოციალური ამონაწერის ატვირთვა *</Label>
                  <label className={cn(
                    "flex items-center gap-4 p-4 border border-dashed rounded-xl transition-colors",
                    isVerifyingSocial ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-muted/50",
                    errors.socialExtract && "border-destructive bg-destructive/5"
                  )}>
                    <div className="p-3 bg-primary/10 text-primary rounded-lg">
                      {isVerifyingSocial ? (
                        <span className="text-xs animate-pulse">მოწმდება...</span>
                      ) : data.socialExtract ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {isVerifyingSocial
                          ? "მოწმდება..."
                          : data.socialExtract
                            ? "დოკუმენტი აიტვირთა"
                            : "დააჭირეთ ფაილის ასარჩევად"}
                      </p>
                      {pendingSocialFile && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          არჩეული ფაილი: {pendingSocialFile.name}
                        </p>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      disabled={isVerifyingSocial}
                      onChange={(e) => handleFileUpload("socialExtract", e)}
                    />
                  </label>
                  {pendingSocialFile && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        size="sm"
                        className="px-4 h-9 rounded-lg"
                        disabled={isVerifyingSocial}
                        onClick={handleSendSocialVerification}
                      >
                        {isVerifyingSocial ? "იგზავნება..." : "გაგზავნა და შემოწმება"}
                      </Button>
                    </div>
                  )}
                  {isSocialVerified && !isVerifyingSocial && (
                    <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">მონაცემები დაემთხვა</span>
                    </div>
                  )}
                  {socialVerifyError && !isVerifyingSocial && (
                    <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">{socialVerifyError}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* Pensioner */}
        <div className="bg-muted/40 p-5 rounded-2xl border border-border/50 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base font-semibold">პენსიონერი</Label>
              <p className="text-sm text-muted-foreground">არის თუ არა განმცხადებელი პენსიონერი?</p>
            </div>
            <Switch 
              checked={data.pensioner || false} 
              onCheckedChange={(c) => {
                updateData({ pensioner: c });
                if (!c) {
                  setIsPensionerVerified(false);
                  setPensionerVerifyError(null);
                  setPendingPensionerFile(null);
                }
              }}
            />
          </div>
          <AnimatePresence>
            {data.pensioner && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2" ref={fieldRefs.pensionerCertificate}>
                  <Label className={cn("block mb-2 text-sm", errors.pensionerCertificate && "text-destructive")}>პენსიონერის ცნობის ატვირთვა *</Label>
                  <label className={cn(
                    "flex items-center gap-4 p-4 border border-dashed rounded-xl transition-colors",
                    isVerifyingPensioner ? "cursor-wait opacity-70" : "cursor-pointer hover:bg-muted/50",
                    errors.pensionerCertificate && "border-destructive bg-destructive/5"
                  )}>
                    <div className="p-3 bg-primary/10 text-primary rounded-lg">
                      {isVerifyingPensioner ? (
                        <span className="text-xs animate-pulse">მოწმდება...</span>
                      ) : data.pensionerCertificate ? (
                        <FileText className="w-5 h-5" />
                      ) : (
                        <Upload className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {isVerifyingPensioner
                          ? "მოწმდება..."
                          : data.pensionerCertificate
                            ? "ცნობა აიტვირთა"
                            : "დააჭირეთ ფაილის ასარჩევად"}
                      </p>
                      {pendingPensionerFile && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          არჩეული ფაილი: {pendingPensionerFile.name}
                        </p>
                      )}
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      disabled={isVerifyingPensioner}
                      onChange={(e) => handleFileUpload("pensionerCertificate", e)}
                    />
                  </label>
                  {pendingPensionerFile && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        size="sm"
                        className="px-4 h-9 rounded-lg"
                        disabled={isVerifyingPensioner}
                        onClick={handleSendPensionerVerification}
                      >
                        {isVerifyingPensioner ? "იგზავნება..." : "გაგზავნა და შემოწმება"}
                      </Button>
                    </div>
                  )}
                  {isPensionerVerified && !isVerifyingPensioner && (
                    <div className="mt-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2 text-green-700 dark:text-green-400">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">მონაცემები დაემთხვა</span>
                    </div>
                  )}
                  {pensionerVerifyError && !isVerifyingPensioner && (
                    <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="text-sm font-medium">{pensionerVerifyError}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-6 flex justify-between">
        <Button variant="outline" onClick={onBack} className="px-8 h-12 rounded-xl text-base">უკან</Button>
        <Button onClick={handleNext} className="px-8 h-12 rounded-xl text-base shadow-md">გაგრძელება</Button>
      </div>
    </motion.div>
  );
}
