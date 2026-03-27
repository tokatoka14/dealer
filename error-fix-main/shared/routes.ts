import { z } from 'zod';
import { insertUserSchema, users } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Form submission schema
export const submissionSchema = z.object({
  idFront: z.string(), // base64
  idBack: z.string(), // base64
  firstName: z.string(),
  lastName: z.string(),
  idNumber: z.string(),
  gender: z.string().default(""),
  expiryDate: z.string(),
  phone: z.string(),
  legalAddress: z.string().default(""),
  region: z.string().default(""),
  municipality: z.string().default(""),
  city: z.string().default(""),
  sociallyVulnerable: z.boolean().default(false),
  socialExtract: z.string().optional(), // base64
  nomadic: z.boolean().default(false),
  pensioner: z.boolean().default(false),
  pensionerCertificate: z.string().optional(), // base64
  supplierName: z.string(),
  supplierId: z.string(),
  model: z.string(),
  price: z.number(),
  subsidyRate: z.number(),
  subsidyAmount: z.number().default(0),
  deliveryFee: z.number().default(0),
  ironPlus: z.boolean().default(false),
  ironPlusFee: z.number().default(0),
  finalPayable: z.number(),
  installationAddress: z.string(),
  receiptPhoto: z.string(), // base64
  digitalConsent: z.boolean().default(false),
});

export const api = {
  auth: {
    login: {
      method: 'POST' as const,
      path: '/api/session/login' as const,
      input: z.object({ username: z.string(), password: z.string() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.validation,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.validation,
      },
    },
  },
  submission: {
    submit: {
      method: 'POST' as const,
      path: '/api/submit' as const,
      input: submissionSchema,
      responses: {
        200: z.object({ success: z.boolean() }),
        500: errorSchemas.internal,
      },
    },
  },
  vision: {
    extractId: {
      method: 'POST' as const,
      path: '/api/vision/extract-id' as const,
      input: z.object({
        idFront: z.string(), // base64 data URL
        idBack: z.string(), // base64 data URL
      }),
      responses: {
        200: z.object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          idNumber: z.string().optional(),
          gender: z.string().optional(),
          expiryDate: z.string().optional(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.validation,
        500: errorSchemas.internal,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type SubmissionInput = z.infer<typeof api.submission.submit.input>;
