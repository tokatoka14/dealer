import helmet from "helmet";
import cors from "cors";
import { Express } from "express";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

export function configureSecurityMiddleware(app: Express) {
  // Helmet.js for secure HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: ["'self'", "https://blablabla233.app.n8n.cloud"],
          fontSrc: ["'self'", "data:"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      xssFilter: true,
      hidePoweredBy: true,
      frameguard: { action: "deny" },
    })
  );

  // CORS configuration - restrict to frontend URL only
  app.use(
    cors({
      origin: (origin, callback) => {
        const allowedOrigins = [FRONTEND_URL, "http://localhost:5173", "http://localhost:5001"];
        
        // Allow requests with no origin (like mobile apps or curl requests) in development
        if (!origin && !IS_PRODUCTION) {
          return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin || "")) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Set-Cookie"],
      maxAge: 86400, // 24 hours
    })
  );

  // Additional security headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    
    // Force HTTPS in production
    if (IS_PRODUCTION && req.headers["x-forwarded-proto"] !== "https") {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    
    next();
  });
}

export const securityConfig = {
  jwtExpiration: "2h", // 2 hours for enhanced security
  cookieOptions: {
    httpOnly: true,
    secure: IS_PRODUCTION, // HTTPS only in production
    sameSite: "strict" as const,
    maxAge: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
    path: "/",
  },
};
