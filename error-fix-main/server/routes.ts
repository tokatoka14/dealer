import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { z } from "zod";
import { api, submissionSchema } from "@shared/routes";
import { users, dealers, products, branches } from "@shared/schema";
import { getStorage } from "./storage";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import FormData from "form-data";
import axios from "axios";
import type { User, Dealer, Product, Branch } from "@shared/schema";
import { withAuth, withAdminOnly, withDealerOnly, withDealerScope, type AuthRequest } from "./middleware/auth";
import { validateBody, loginSchema, productQuerySchema, branchQuerySchema } from "./middleware/validation";
import { securityConfig } from "./middleware/security";

const JWT_SECRET = process.env.JWT_SECRET || process.env.AUTH_SECRET || "fallback-secret-change-in-production";
const ADMIN_EMAIL = "zurabbabulaidze@gmail.com";
const ADMIN_PASSWORD_HASH = bcrypt.hashSync("iron123#", 12);

// Default webhook configuration for new dealers/dashboards
const DEFAULT_WEBHOOKS = {
  identityCard: "https://blablabla233.app.n8n.cloud/webhook/process-id-card",
  pensioner: "https://blablabla233.app.n8n.cloud/webhook/process-document",
  socialCard: "https://blablabla233.app.n8n.cloud/webhook/socialuri-id-card",
  receipt: "https://blablabla233.app.n8n.cloud/webhook-test/qvitari",
  oven: "https://blablabla233.app.n8n.cloud/webhook-test/gumeliskodi",
  submission: "https://blablabla233.app.n8n.cloud/webhook/process-document"
};

function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const bearerToken = req.headers.authorization?.split(" ")[1];
  const tokenFromHeader =
    bearerToken && bearerToken !== "null" && bearerToken !== "undefined" ? bearerToken : undefined;
  const token = tokenFromHeader || req.cookies?.admin_token || req.cookies?.auth_token;
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    if (decoded.email !== ADMIN_EMAIL) throw new Error();
    next();
  } catch (err) {
    res.status(401).json({ message: "Unauthorized" });
  }
}

async function resolveDealerId(req: Request, res: Response) {
  const dealerKeyRaw = req.query.dealer;
  const dealerKey = (Array.isArray(dealerKeyRaw) ? dealerKeyRaw[0] : dealerKeyRaw) as string | undefined;
  if (!dealerKey) {
    res.status(400).json({ message: "Missing dealer" });
    return undefined;
  }
  const storage = getStorage();
  const dealerId = await storage.getDealerIdByKey(dealerKey);
  if (!dealerId) {
    res.status(404).json({ message: "Dealer not found" });
    return undefined;
  }
  return dealerId;
}

function isSubsidyEligibleProduct(product: Product) {
  const discountableFlag = (product as any).discountable;
  if (typeof discountableFlag === "boolean") {
    return discountableFlag;
  }

  const category = String(product.category || "").toLowerCase();
  return category.includes("discountable") || category.includes("subsid") || category.includes("სუბსიდ");
}

function calculateConditionalDiscountPricing(params: {
  product: Product;
  sociallyVulnerable: boolean;
  pensioner: boolean;
  deliveryFee: number;
  ironPlusFee: number;
}) {
  const basePrice = params.product.price / 100;
  const hasPriorityStatus = params.sociallyVulnerable || params.pensioner;
  // Default 50% discount for ALL products; 75% only for eligible products when status is set
  let subsidyRate = 0.5;
  if (hasPriorityStatus) {
    const isEligible = isSubsidyEligibleProduct(params.product);
    subsidyRate = isEligible ? 0.75 : 0.5;
  }
  const discountedPrice = Math.max(0, basePrice * (1 - subsidyRate));
  const finalPayable = Math.max(0, discountedPrice + Math.max(0, params.deliveryFee) + Math.max(0, params.ironPlusFee));

  return {
    price: Number(basePrice.toFixed(2)),
    subsidyRate,
    finalPayable: Number(finalPayable.toFixed(2)),
  };
}

export async function registerRoutes(
  httpServer: ReturnType<typeof createServer>,
  app: express.Application
): Promise<ReturnType<typeof createServer>> {
  const storage = getStorage();
  const demoUser = { id: 1, username: "demo@example.com" } as const;

  // ── Unified Login with Zod Validation and HttpOnly Cookies ──
  app.post("/api/login", validateBody(loginSchema), async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Step A: Super Admin check
    if (email === ADMIN_EMAIL) {
      if (!bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign({ email, role: "admin" }, JWT_SECRET, { expiresIn: "2h" });
      res.cookie("auth_token", token, securityConfig.cookieOptions);
      res.cookie("admin_token", token, securityConfig.cookieOptions);
      return res.json({ role: "admin", redirect: "/admin/dashboard" });
    }

    // Step B: Dealers table check
    try {
      const dealer = await storage.getDealerByEmail(email);
      console.log(`[Login] dealer lookup for "${email}":`, dealer ? `found id=${dealer.id} hasPassword=${!!dealer.password}` : "NOT FOUND");
      if (!dealer || !dealer.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const passwordMatch = bcrypt.compareSync(password, dealer.password);
      console.log(`[Login] password match for "${email}":`, passwordMatch);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign(
        { dealerId: dealer.id, dealerKey: dealer.key, email: dealer.email, role: "dealer" },
        JWT_SECRET,
        { expiresIn: "2h" }
      );
      res.cookie("auth_token", token, securityConfig.cookieOptions);
      res.cookie("dealer_token", token, securityConfig.cookieOptions);
      return res.json({
        role: "dealer",
        redirect: "/workspace",
        dealer: { id: dealer.id, key: dealer.key, name: dealer.name, email: dealer.email },
      });
    } catch (err) {
      console.error("[Unified Login] Error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  // Auth setup
  app.set("trust proxy", 1);
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dealer-portal-secret",
      resave: false,
      saveUninitialized: false,
      store:
        process.env.NODE_ENV === "production"
          ? storage.sessionStore
          : new session.MemoryStore(),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username: string, password: string, done: any) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        // Support both bcrypt hashes and legacy plain-text passwords
        const isValid = user.password.startsWith("$2")
          ? bcrypt.compareSync(password, user.password)
          : user.password === password;
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, { id: user.id, username: user.username });
      } catch (e) {
        return done(null, false, {
          message:
            (e as Error)?.message ??
            "Login failed (database unavailable). Try the demo credentials.",
        });
      }
    }),
  );

  passport.serializeUser((user: any, done: any) => {
    done(null, (user as any).id);
  });

  passport.deserializeUser(async (id: number, done: any) => {
    if (id === demoUser.id) return done(null, demoUser);
    try {
      const user = await storage.getUser(id);
      if (!user) return done(null, false);
      return done(null, { id: user.id, username: user.username });
    } catch {
      return done(null, false);
    }
  });

  app.post("/api/session/login", passport.authenticate("local", {
    failureRedirect: "/login",
    failureMessage: true,
  }), (req: Request, res: Response) => {
    res.redirect("/admin/dashboard");
  });

  app.post("/api/logout", (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) return next(err);
      res.clearCookie("auth_token", securityConfig.cookieOptions);
      res.clearCookie("admin_token", securityConfig.cookieOptions);
      res.clearCookie("dealer_token", securityConfig.cookieOptions);
      res.sendStatus(200);
    });
  });

  app.get("/api/me", (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.status(200).json(req.user);
  });

  app.post("/api/vision/extract-id", async (req: Request, res: Response) => {
    console.log("Extraction started...");

    try {
      const input = z
        .object({
          frontImage: z.string().optional(),
          backImage: z.string().optional(),
          idFront: z.string().optional(),
          idBack: z.string().optional(),
        })
        .parse(req.body);

      const frontImage = input.frontImage ?? input.idFront;
      const backImage = input.backImage ?? input.idBack;

      if (!frontImage || !backImage) {
        return res.status(400).json({
          message: "Both frontImage and backImage (or idFront/idBack) are required",
        });
      }

      const n8nUrl =
        "https://blablabla233.app.n8n.cloud/webhook/process-id-card";

      const formData = new FormData();

      const frontBase64 = frontImage.includes(',') ? frontImage.split(',')[1] : frontImage;
      const backBase64 = backImage.includes(',') ? backImage.split(',')[1] : backImage;

      const frontBuffer = Buffer.from(frontBase64, "base64");
      const backBuffer = Buffer.from(backBase64, "base64");

      formData.append('image0', frontBuffer, {
        filename: 'front.jpg',
        contentType: 'image/jpeg',
      });
      formData.append('image1', backBuffer, {
        filename: 'back.jpg',
        contentType: 'image/jpeg',
      });

      console.log("[ID Extraction] Sending to n8n via axios...", n8nUrl);

      const n8nRes = await axios.post(n8nUrl, formData, {
        headers: formData.getHeaders(),
      });

      console.log("[ID Extraction] n8n response:", n8nRes.data);

      // Handle n8n response format: [{"success": true, "data": {...}}]
      if (!Array.isArray(n8nRes.data) || n8nRes.data.length === 0) {
        return res.status(400).json({
          message: "Could not extract ID data",
        });
      }

      const result = n8nRes.data[0];
      
      if (!result.success || !result.data) {
        return res.status(400).json({
          message: "Could not extract ID data",
        });
      }

      const extracted = result.data;

      // Validate required fields in the extracted data
      // n8n returns: name, surname, personalId (not firstName, lastName)
      if (!extracted.name || !extracted.surname || !extracted.personalId) {
        return res.status(400).json({
          message: "Could not extract ID data - missing required fields",
        });
      }

      // Attempt to persist the extracted data, but never block the UI on failure.
      try {
        const storageAny = storage as any;
        if (typeof storageAny.createSubmission === "function") {
          await storageAny.createSubmission(extracted);
        }
      } catch (e) {
        console.warn("storage.createSubmission failed, returning data anyway:", e);
      }

      res.status(200).json(extracted);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/vision/verify-receipt", async (req: Request, res: Response) => {

    try {
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image is required" });
      }

      console.log("[Receipt Verification] Sending to n8n via axios...");
      const n8nUrl = "https://blablabla233.app.n8n.cloud/webhook-test/qvitari";
      
      const base64String = image.includes(',') ? image.split(',')[1] : image;
      const buffer = Buffer.from(base64String, "base64");

      const formData = new FormData();
      formData.append('image0', buffer, {
        filename: 'upload.jpg',
        contentType: 'image/jpeg',
      });

      console.log("[Receipt Verification] Sending to n8n via axios...", n8nUrl);

      const n8nRes = await axios.post(n8nUrl, formData, {
        headers: formData.getHeaders(),
      });

      console.log("[Receipt Verification] n8n result:", n8nRes.data);
      res.json(n8nRes.data);
    } catch (err: any) {
      console.error("[Receipt Verification] Error:", err);
      const message = err.response?.data || err.message;
      res.status(500).json({ message });
    }
  });

  app.post("/api/vision/verify-oven", async (req: Request, res: Response) => {

    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Code is required" });
      }

      console.log("[Oven Verification] Sending to n8n (gumeliskodi)...", code);
      const n8nUrl = "https://blablabla233.app.n8n.cloud/webhook-test/gumeliskodi";

      const n8nRes = await axios.post(n8nUrl, { oven_code: code }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      });

      console.log("[n8n Response]", n8nRes.data);

      // Return the exact JSON response to the frontend
      return res.json(n8nRes.data);
    } catch (err) {
      console.error("[Oven Verification] Detailed Error:", {
        message: (err as Error).message,
        response: (err as any).response?.data,
        status: (err as any).response?.status
      });
      const message = (err as any).response?.data || (err as Error).message;
      res.status(500).json({ message });
    }
  });

  // Social Card Verification
  app.post("/api/vision/verify-social-card", async (req: Request, res: Response) => {

    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ message: "Request body is missing or not JSON" });
      }
      const { image, firstName, lastName, personalId, idNumber } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image is required" });
      }

      console.log("[Social Card Verification] Sending to n8n via axios...");
      const n8nUrl = "https://blablabla233.app.n8n.cloud/webhook/socialuri-id-card";
      
      const base64String = image.includes(',') ? image.split(',')[1] : image;
      const buffer = Buffer.from(base64String, "base64");

      const formData = new FormData();
      formData.append('image0', buffer, {
        filename: 'upload.jpg',
        contentType: 'image/jpeg',
      });

      console.log("[Social Card Verification] Sending to n8n via axios...", n8nUrl);

      const n8nRes = await axios.post(n8nUrl, formData, {
        headers: formData.getHeaders(),
      });

      console.log("[Social Card Verification] n8n result:", n8nRes.data);

      const n8nData = n8nRes.data;
      // If n8n returns an array, unwrap first element
      const extracted = Array.isArray(n8nData) ? n8nData[0] : n8nData;

      // Normalise: if n8n already returns { success, data } pass it through; otherwise wrap it
      if (extracted && typeof extracted === "object" && "success" in extracted) {
        return res.json(extracted);
      }

      // Perform identity match when n8n returns raw extracted fields
      if (extracted && (firstName || lastName || personalId || idNumber)) {
        const norm = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, "").toLowerCase();
        const normId = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, "");
        const fMatch = !firstName || norm(extracted.firstName) === norm(firstName);
        const lMatch = !lastName || norm(extracted.lastName) === norm(lastName);
        const idKey = personalId || idNumber;
        const idMatch = !idKey || normId(extracted.personalId) === normId(idKey);
        if (fMatch && lMatch && idMatch) {
          return res.json({ success: true, data: extracted });
        }
        return res.json({ success: false, data: extracted });
      }

      res.json({ success: true, data: extracted });
    } catch (err: any) {
      console.error("[Social Card Verification] Error:", err);
      const message = err.response?.data || err.message;
      res.status(500).json({ message });
    }
  });

  // Pensioner Document Verification
  app.post("/api/vision/verify-pensioner", async (req: Request, res: Response) => {

    try {
      if (!req.body || typeof req.body !== "object") {
        return res.status(400).json({ message: "Request body is missing or not JSON" });
      }
      const { image } = req.body;
      if (!image) {
        return res.status(400).json({ message: "Image is required" });
      }

      console.log("[Pensioner Document Verification] Sending to n8n via axios...");
      const n8nUrl = "https://blablabla233.app.n8n.cloud/webhook/process-document";
      
      const base64String = image.includes(',') ? image.split(',')[1] : image;
      const buffer = Buffer.from(base64String, "base64");

      const formData = new FormData();
      formData.append('image0', buffer, {
        filename: 'upload.jpg',
        contentType: 'image/jpeg',
      });

      console.log("[Pensioner Document Verification] Sending to n8n via axios...", n8nUrl);

      const n8nRes = await axios.post(n8nUrl, formData, {
        headers: formData.getHeaders(),
      });

      console.log("[Pensioner Document Verification] n8n result:", n8nRes.data);
      res.json(n8nRes.data);
    } catch (err: any) {
      console.error("[Pensioner Document Verification] Error:", err);
      const message = err.response?.data || err.message;
      res.status(500).json({ message });
    }
  });

  // Proxy the submission to n8n webhook
  app.post("/api/submission/submit", async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const input = submissionSchema.parse(req.body);
      
      const n8nWebhookUrl = "https://blablabla233.app.n8n.cloud/webhook/process-document";
      
      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error("Failed to submit to n8n");
      }

      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Workspace submission — dealer JWT auth, tags dealer_id
  app.post("/api/workspace/submit", async (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Not authenticated" });

    let dealerId: number;
    let dealerKey: string;
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (decoded.role !== "dealer") throw new Error();
      dealerId = decoded.dealerId;
      dealerKey = decoded.dealerKey;
    } catch {
      return res.status(401).json({ message: "Invalid dealer token" });
    }

    try {
      const input = submissionSchema.parse(req.body);

      const allProducts = await storage.getProducts(dealerId);
      const selectedProduct = allProducts.find(
        (p) => p.name === input.model || p.id.toString() === input.model,
      );

      const deliveryFee = dealerKey === "iron" ? Math.max(0, Number(input.deliveryFee ?? 0)) : 0;
      const ironPlusFee = dealerKey === "iron" && input.model.includes("L1-MZ-27") && input.ironPlus ? 100 : 0;

      const pricing = selectedProduct
        ? calculateConditionalDiscountPricing({
            product: selectedProduct,
            sociallyVulnerable: Boolean(input.sociallyVulnerable),
            pensioner: Boolean(input.pensioner),
            deliveryFee,
            ironPlusFee,
          })
        : {
            price: input.price,
            subsidyRate: input.subsidyRate,
            finalPayable: input.finalPayable,
          };

      const n8nWebhookUrl = "https://blablabla233.app.n8n.cloud/webhook/process-document";

      const payload = {
        ...input,
        ...pricing,
        deliveryFee,
        ironPlusFee,
        dealer_id: dealerId,
        dealer_key: dealerKey,
      };
      console.log("[Workspace Submit] dealer_id:", dealerId, "dealer_key:", dealerKey);

      const response = await fetch(n8nWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to submit to n8n");
      }

      res.status(200).json({ success: true });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Public Products Route
  app.get("/api/products", async (req, res) => {
    try {
      const dealerKeyRaw = req.query.dealer;
      const dealerKey = (Array.isArray(dealerKeyRaw) ? dealerKeyRaw[0] : dealerKeyRaw) as string | undefined;
      const dealerId = dealerKey ? await storage.getDealerIdByKey(dealerKey) : await storage.getDealerIdByKey("iron");
      if (!dealerId) return res.status(404).json({ message: "Dealer not found" });
      const products = await storage.getProducts(dealerId);
      res.json(products);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Public Branches Route
  app.get("/api/branches", async (req, res) => {
    try {
      const dealerKeyRaw = req.query.dealer;
      const dealerKey = (Array.isArray(dealerKeyRaw) ? dealerKeyRaw[0] : dealerKeyRaw) as string | undefined;
      const dealerId = dealerKey ? await storage.getDealerIdByKey(dealerKey) : await storage.getDealerIdByKey("iron");
      if (!dealerId) return res.status(404).json({ message: "Dealer not found" });
      const branches = await storage.getBranches(dealerId);
      res.json(branches);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  // Admin Routes
  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
      const token = jwt.sign({ email, role: "admin" }, JWT_SECRET, { expiresIn: "2h" });
      res.cookie("auth_token", token, securityConfig.cookieOptions);
      res.cookie("admin_token", token, securityConfig.cookieOptions);
      return res.json({ role: "admin", redirect: "/admin/dashboard" });
    }
    res.status(401).json({ message: "Invalid credentials" });
  });

  // ── Dealer Auth ──
  app.post("/api/dealer/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    try {
      const dealer = await storage.getDealerByEmail(email);
      if (!dealer || !dealer.password) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const valid = bcrypt.compareSync(password, dealer.password);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const token = jwt.sign(
        { dealerId: dealer.id, dealerKey: dealer.key, email: dealer.email, role: "dealer" },
        JWT_SECRET,
        { expiresIn: "2h" }
      );
      res.cookie("auth_token", token, securityConfig.cookieOptions);
      res.cookie("dealer_token", token, securityConfig.cookieOptions);
      return res.json({ role: "dealer", dealer: { id: dealer.id, key: dealer.key, name: dealer.name, email: dealer.email } });
    } catch (err) {
      console.error("[Dealer Login] Error:", err);
      return res.status(500).json({ message: "Login failed" });
    }
  });

  app.get("/api/dealer/me", withAuth as any, withDealerOnly as any, async (req: Request, res: Response) => {
    try {
      const dealerId = (req as AuthRequest).user?.dealerId;
      if (!dealerId) return res.status(401).json({ message: "Unauthorized" });
      const dealer = await storage.getDealerById(dealerId);
      if (!dealer) return res.status(404).json({ message: "Dealer not found" });
      return res.json({ id: dealer.id, key: dealer.key, name: dealer.name, email: dealer.email });
    } catch {
      return res.status(401).json({ message: "Unauthorized" });
    }
  });

  app.get("/api/admin/me", authenticateAdmin, (_req: Request, res: Response) => {
    return res.json({ role: "admin", email: ADMIN_EMAIL });
  });

  // ── Admin Dealer Management ──
  app.get("/api/admin/dealers", authenticateAdmin, async (_req: Request, res: Response) => {
    try {
      const allDealers = await storage.getAllDealers();
      const safe = allDealers.map(({ password: _pwd, ...rest }) => rest);
      res.json(safe);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/dealers", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const { name, email, password: rawPassword } = req.body;
      if (!name || !email || !rawPassword) {
        return res.status(400).json({ message: "Name, email, and password are required" });
      }

      const existing = await storage.getDealerByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "Dealer with this email already exists" });
      }

      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
      const hashedPassword = bcrypt.hashSync(rawPassword, 10);

      const dealer = await storage.createDealer({ key, name, email, password: hashedPassword });
      
      // Note: Webhook configuration is hardcoded in DEFAULT_WEBHOOKS constant
      // and should be used by frontend when making requests to vision endpoints
      
      const { password: _, ...safe } = dealer;
      res.json({ ...safe, webhooks: DEFAULT_WEBHOOKS });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate key") || message.includes("unique")) {
        return res.status(409).json({ message: "Dealer with this key or email already exists" });
      }
      res.status(500).json({ message });
    }
  });

  app.patch("/api/admin/dealers/:id", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const { name, email, password: rawPassword } = req.body;
      const update: any = {};
      if (name) update.name = name;
      if (email) update.email = email;
      if (rawPassword) update.password = bcrypt.hashSync(rawPassword, 10);

      const dealer = await storage.updateDealer(id, update);
      const { password: _, ...safe } = dealer;
      res.json(safe);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes("duplicate key") || message.includes("unique")) {
        return res.status(409).json({ message: "Dealer with this email already exists" });
      }
      res.status(400).json({ message });
    }
  });

  app.delete("/api/admin/dealers/:id", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      await storage.deleteDealerCascade(id);
      res.sendStatus(200);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.get("/api/admin/products", authenticateAdmin, async (req: Request, res: Response) => {
    const dealerId = await resolveDealerId(req, res);
    if (!dealerId) return;
    const products = await storage.getProducts(dealerId);
    res.json(products);
  });

  // Branch management (Admin)
  app.get("/api/admin/branches", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const branches = await storage.getBranches(dealerId);
      res.json(branches);
    } catch (err) {
      console.error("Error fetching branches:", err);
      res.status(500).json({ message: "Failed to load branches", error: (err as Error).message });
    }
  });

  app.post("/api/admin/branches", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "Branch name is required" });
      const branch = await storage.createBranch({ dealerId, name });
      res.json(branch);
    } catch (err) {
      console.error("Error creating branch:", err);
      const message = (err as Error).message;
      if (message.includes("duplicate key") || message.includes("already exists") || message.includes("unique")) {
        return res.status(409).json({ message: "Branch with this name already exists" });
      }
      res.status(400).json({ message });
    }
  });

  app.patch("/api/admin/branches/:id", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const id = Number(req.params.id);
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ message: "Branch name is required" });
      const branch = await storage.updateBranch(dealerId, id, { name });
      res.json(branch);
    } catch (err) {
      console.error("Error updating branch:", err);
      const message = (err as Error).message;
      if (message.includes("duplicate key") || message.includes("already exists") || message.includes("unique")) {
        return res.status(409).json({ message: "Branch with this name already exists" });
      }
      res.status(400).json({ message });
    }
  });

  app.delete("/api/admin/branches/:id", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const id = Number(req.params.id);
      await storage.deleteBranch(dealerId, id);
      res.sendStatus(200);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.post("/api/admin/products", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      console.log("Admin Add Product Request:", req.body);
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const productData = {
        ...req.body,
        dealerId,
        price: Number(req.body.price),
        stock: Number(req.body.stock),
      };
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (err) {
      console.error("Error adding product:", err);
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/admin/products/:id", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const id = Number(req.params.id);
      const existing = await storage.getProduct(dealerId, id);
      if (!existing) return res.status(404).json({ message: "Product not found" });

      const input = z
        .object({
          name: z.string().min(1).optional(),
          description: z.string().min(1).optional(),
          category: z.string().min(1).optional(),
          imageUrl: z.string().optional().nullable(),
          stock: z.coerce.number().int().optional(),
          price: z.coerce.number().int().optional(),
          discountPrice: z.coerce.number().int().optional().nullable(),
          discountPercentage: z.coerce.number().int().optional().nullable(),
          discountExpiry: z.coerce.string().optional().nullable(),
        })
        .parse(req.body);

      const update: any = { ...input };
      if (update.discountExpiry !== undefined) {
        update.discountExpiry = update.discountExpiry ? new Date(update.discountExpiry) : null;
      }

      const MAX_DISCOUNT_CENTS = 300 * 100;
      const priceCents = typeof update.price === "number" ? update.price : existing.price;

      // Enforce discount cap (50% up to 300 GEL) on any discount update.
      if (typeof update.discountPercentage === "number") {
        const pct = Math.max(0, Math.min(100, update.discountPercentage));
        const rawDiscount = Math.round(priceCents * (pct / 100));
        const discountAmount = Math.min(rawDiscount, MAX_DISCOUNT_CENTS);
        update.discountPrice = Math.max(0, priceCents - discountAmount);
        update.discountPercentage = pct;
      } else if (typeof update.discountPrice === "number") {
        const discountAmount = Math.max(0, priceCents - update.discountPrice);
        const cappedDiscountAmount = Math.min(discountAmount, MAX_DISCOUNT_CENTS);
        update.discountPrice = Math.max(0, priceCents - cappedDiscountAmount);
      }

      const product = await storage.updateProduct(dealerId, id, update);
      return res.json(product);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(400).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/admin/products/:id/price", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const id = Number(req.params.id);
      const existing = await storage.getProduct(dealerId, id);
      if (!existing) return res.status(404).json({ message: "Product not found" });
      const product = await storage.updateProduct(dealerId, id, { price: req.body.price });
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.patch("/api/admin/products/:id/discount", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const dealerId = await resolveDealerId(req, res);
      if (!dealerId) return;
      const id = Number(req.params.id);
      const existing = await storage.getProduct(dealerId, id);
      if (!existing) return res.status(404).json({ message: "Product not found" });

      const MAX_DISCOUNT_CENTS = 300 * 100;
      const priceCents = existing.price;

      // If percentage is provided, compute discount price with cap.
      let discountPrice = req.body.discountPrice;
      let discountPercentage = req.body.discountPercentage;

      if (typeof discountPercentage === "number") {
        const pct = Math.max(0, Math.min(100, discountPercentage));
        const rawDiscount = Math.round(priceCents * (pct / 100));
        const discountAmount = Math.min(rawDiscount, MAX_DISCOUNT_CENTS);
        discountPrice = Math.max(0, priceCents - discountAmount);
        discountPercentage = pct;
      } else if (typeof discountPrice === "number") {
        const discountAmount = Math.max(0, priceCents - discountPrice);
        const cappedDiscountAmount = Math.min(discountAmount, MAX_DISCOUNT_CENTS);
        discountPrice = Math.max(0, priceCents - cappedDiscountAmount);
      }

      const product = await storage.updateProduct(dealerId, id, {
        discountPrice,
        discountPercentage,
        discountExpiry: req.body.discountExpiry ? new Date(req.body.discountExpiry) : null,
      });
      res.json(product);
    } catch (err) {
      res.status(400).json({ message: (err as Error).message });
    }
  });

  app.delete("/api/admin/products/:id", authenticateAdmin, async (req: Request, res: Response) => {
    const dealerId = await resolveDealerId(req, res);
    if (!dealerId) return;
    const id = Number(req.params.id);
    const existing = await storage.getProduct(dealerId, id);
    if (!existing) return res.status(404).json({ message: "Product not found" });
    await storage.deleteProduct(dealerId, id);
    res.sendStatus(200);
  });

  app.post("/api/admin/products/copy", authenticateAdmin, async (req: Request, res: Response) => {
    try {
      const input = z
        .object({ from: z.string().min(1), to: z.string().min(1) })
        .parse(req.body);

      const fromId = await storage.getDealerIdByKey(input.from);
      const toId = await storage.getDealerIdByKey(input.to);
      if (!fromId) return res.status(404).json({ message: "Source dealer not found" });
      if (!toId) return res.status(404).json({ message: "Target dealer not found" });

      const products = await storage.getProducts(fromId);
      let copied = 0;
      let updated = 0;
      for (const p of products) {
        const existing = (await storage.getProducts(toId)).find((x: any) => x.name === p.name);
        if (!existing) {
          await storage.createProduct({
            dealerId: toId,
            name: p.name,
            description: p.description,
            price: p.price,
            category: p.category,
            stock: p.stock,
            imageUrl: p.imageUrl,
          });
          copied++;
        } else {
          await storage.updateProduct(toId, existing.id, {
            description: p.description,
            price: p.price,
            category: p.category,
            imageUrl: p.imageUrl,
            stock: p.stock,
            discountPrice: p.discountPrice,
            discountPercentage: p.discountPercentage,
            discountExpiry: p.discountExpiry as any,
          } as any);
          updated++;
        }
      }

      return res.json({ success: true, copied, updated });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: (err as Error).message });
    }
  });
  void (async () => {
    try {
      const demoUser = await storage.getUserByUsername("demo@example.com");
      if (!demoUser) {
        await storage.createUser({
          username: "demo@example.com",
          password: "Energo123#",
        });
      }
    } catch (e) {
      console.log("Error seeding demo user (tables might not exist yet):", e);
    }
  })();

  return httpServer;
}