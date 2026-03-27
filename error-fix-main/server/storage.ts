import { db } from "./db";
import {
  users,
  products,
  dealers,
  branches,
  type User,
  type InsertUser,
  type Product,
  type InsertProduct,
  type Branch,
  type InsertBranch,
  type Dealer,
  type InsertDealer,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getDealerIdByKey(key: string): Promise<number | undefined>;
  
  // Dealer management
  getAllDealers(): Promise<Dealer[]>;
  getDealerById(id: number): Promise<Dealer | undefined>;
  getDealerByEmail(email: string): Promise<Dealer | undefined>;
  createDealer(dealer: { key: string; name: string; identificationCode: string; email: string; password: string }): Promise<Dealer>;
  updateDealer(id: number, update: Partial<Dealer>): Promise<Dealer>;
  deleteDealerCascade(id: number): Promise<void>;

  // Product management
  getProducts(dealerId: number): Promise<Product[]>;
  getProduct(dealerId: number, id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(dealerId: number, id: number, product: Partial<Product>): Promise<Product>;
  deleteProduct(dealerId: number, id: number): Promise<void>;

  // Branch management (e.g., for Gorgia branches)
  getBranches(dealerId: number): Promise<Branch[]>;
  getBranch(dealerId: number, id: number): Promise<Branch | undefined>;
  createBranch(branch: InsertBranch): Promise<Branch>;
  updateBranch(dealerId: number, id: number, branch: Partial<Branch>): Promise<Branch>;
  deleteBranch(dealerId: number, id: number): Promise<void>;
  
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getDealerIdByKey(key: string): Promise<number | undefined> {
    const [dealer] = await db.select().from(dealers).where(eq(dealers.key, key));
    return dealer?.id;
  }

  async getAllDealers(): Promise<Dealer[]> {
    return await db.select().from(dealers);
  }

  async getDealerById(id: number): Promise<Dealer | undefined> {
    const [dealer] = await db.select().from(dealers).where(eq(dealers.id, id));
    return dealer;
  }

  async getDealerByEmail(email: string): Promise<Dealer | undefined> {
    const [dealer] = await db.select().from(dealers).where(eq(dealers.email, email));
    return dealer;
  }

  async createDealer(dealer: { key: string; name: string; identificationCode: string; email: string; password: string }): Promise<Dealer> {
    const [created] = await db.insert(dealers).values(dealer).returning();
    return created;
  }

  async updateDealer(id: number, update: Partial<Dealer>): Promise<Dealer> {
    const [updated] = await db.update(dealers).set(update).where(eq(dealers.id, id)).returning();
    if (!updated) throw new Error("Dealer not found");
    return updated;
  }

  async deleteDealerCascade(id: number): Promise<void> {
    // Delete all products and branches belonging to this dealer, then the dealer
    await db.delete(products).where(eq(products.dealerId, id));
    await db.delete(branches).where(eq(branches.dealerId, id));
    await db.delete(dealers).where(eq(dealers.id, id));
  }

  // Product implementation
  async getProducts(dealerId: number): Promise<Product[]> {
    return await db.select().from(products).where(eq(products.dealerId, dealerId));
  }

  // Branch implementation
  async getBranches(dealerId: number): Promise<Branch[]> {
    return await db.select().from(branches).where(eq(branches.dealerId, dealerId));
  }

  async getBranch(dealerId: number, id: number): Promise<Branch | undefined> {
    const [branch] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.dealerId, dealerId), eq(branches.id, id)));
    return branch;
  }

  async createBranch(insertBranch: InsertBranch): Promise<Branch> {
    const [branch] = await db.insert(branches).values(insertBranch).returning();
    return branch;
  }

  async updateBranch(dealerId: number, id: number, update: Partial<Branch>): Promise<Branch> {
    const [branch] = await db
      .update(branches)
      .set(update)
      .where(and(eq(branches.dealerId, dealerId), eq(branches.id, id)))
      .returning();
    if (!branch) throw new Error("Branch not found");
    return branch;
  }

  async deleteBranch(dealerId: number, id: number): Promise<void> {
    await db.delete(branches).where(and(eq(branches.dealerId, dealerId), eq(branches.id, id)));
  }

  async getProduct(dealerId: number, id: number): Promise<Product | undefined> {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.dealerId, dealerId), eq(products.id, id)));
    return product;
  }

  async createProduct(insertProduct: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(insertProduct).returning();
    return product;
  }

  async updateProduct(dealerId: number, id: number, update: Partial<Product>): Promise<Product> {
    const [product] = await db
      .update(products)
      .set(update)
      .where(and(eq(products.dealerId, dealerId), eq(products.id, id)))
      .returning();
    if (!product) throw new Error("Product not found");
    return product;
  }

  async deleteProduct(dealerId: number, id: number): Promise<void> {
    await db.delete(products).where(and(eq(products.dealerId, dealerId), eq(products.id, id)));
  }
}

let _storage: DatabaseStorage | undefined;
export function getStorage(): DatabaseStorage {
  if (!_storage) _storage = new DatabaseStorage();
  return _storage;
}