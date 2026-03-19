import { useMutation } from "@tanstack/react-query";
import { api, type SubmissionInput } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useSubmission() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: SubmissionInput) => {
      const res = await fetch(api.submission.submit.path, {
        method: api.submission.submit.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "გაგზავნა ვერ მოხერხდა" }));
        throw new Error(err.message || "განაცხადის გაგზავნა ვერ მოხერხდა");
      }
      return res.json();
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
        description: error.message,
        variant: "destructive",
      });
    }
  });
}
