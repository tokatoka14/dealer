import { useMutation } from "@tanstack/react-query";
import { type SubmissionInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

const N8N_WEBHOOK_URL = "https://tok18.app.n8n.cloud/webhook-test/69083b0e-989b-4fa9-a091-0bd322884e1f";

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(",");
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const raw = atob(parts.length > 1 ? parts[1] : base64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return new Blob([buf], { type: mime });
}

function appendImageIfPresent(fd: FormData, key: string, value: string | undefined, filename: string) {
  if (!value) return;
  try {
    const blob = base64ToBlob(value);
    fd.append(key, blob, filename);
  } catch {
    // not a valid base64 image — skip
  }
}

export function useSubmission() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: SubmissionInput) => {
      const fd = new FormData();

      // Text fields
      // Derive famale/male booleans from gender string
      const rawGender = String(data.gender ?? "").trim().toLowerCase();
      const isFemale = rawGender === "f" || rawGender.startsWith("f ") || rawGender.includes("ქალ") || rawGender.includes("female") || rawGender.includes("მდედრობითი");
      const isMale = rawGender === "m" || rawGender.startsWith("m ") || rawGender.includes("კაც") || rawGender.includes("male") || rawGender.includes("მამრობითი");

      const textFields: Record<string, string | number | boolean | undefined> = {
        firstName: data.firstName,
        lastName: data.lastName,
        idNumber: data.idNumber,
        gender: data.gender,
        famale: Boolean(isFemale && !isMale),
        male: Boolean(isMale && !isFemale),
        expiryDate: data.expiryDate,
        phone: data.phone,
        legalAddress: data.legalAddress,
        region: data.region,
        municipality: data.municipality,
        city: data.city,
        cityDistrict: (data as any).cityDistrict,
        addressVillage: (data as any).addressVillage,
        sociallyVulnerable: data.sociallyVulnerable,
        nomadic: data.nomadic,
        pensioner: data.pensioner,
        supplierName: data.supplierName,
        supplierId: data.supplierId,
        model: data.model,
        price: data.price,
        subsidyRate: data.subsidyRate,
        subsidyAmount: data.subsidyAmount,
        deliveryFee: data.deliveryFee,
        ironPlus: data.ironPlus,
        ironPlusFee: data.ironPlusFee,
        finalPayable: data.finalPayable,
        installationAddress: data.installationAddress,
        digitalConsent: data.digitalConsent,
      };
      for (const [key, val] of Object.entries(textFields)) {
        if (val !== undefined && val !== null && val !== "") fd.append(key, String(val));
      }

      // Binary images
      appendImageIfPresent(fd, "idFront", data.idFront, "id_front.jpg");
      appendImageIfPresent(fd, "idBack", data.idBack, "id_back.jpg");
      appendImageIfPresent(fd, "socialExtract", data.socialExtract, "social_extract.jpg");
      appendImageIfPresent(fd, "pensionerCertificate", data.pensionerCertificate, "pensioner_cert.jpg");
      appendImageIfPresent(fd, "receiptPhoto", data.receiptPhoto, "receipt.jpg");

      const res = await axios.post(N8N_WEBHOOK_URL, fd, {
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "განაცხადი გაიგზავნა",
        description: "დილერის განაცხადი წარმატებით დამუშავდა.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "გაგზავნის შეცდომა",
        description: error.message || "განაცხადის გაგზავნა ვერ მოხერხდა",
        variant: "destructive",
      });
    }
  });
}
