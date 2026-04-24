import axios from "axios";

const N8N_WEBHOOK_URL = "https://tok19.app.n8n.cloud/webhook-test/kodiii";

export type N8NAction = "verify" | "cancel";

export interface SendN8NRequestParams {
  oven_code: string;
  branch_name: string;
  action: N8NAction;
}

export interface N8NResponse {
  status?: string;
  message?: string;
  product_name?: string;
  [key: string]: any;
}

export async function sendN8NRequest(
  params: SendN8NRequestParams
): Promise<N8NResponse> {
  try {
    const res = await axios.post<N8NResponse>(N8N_WEBHOOK_URL, {
      oven_code: params.oven_code,
      branch_name: params.branch_name,
      action: params.action,
    });
    return res.data;
  } catch (err) {
    console.error("[sendN8NRequest] Error:", err);
    throw err;
  }
}
