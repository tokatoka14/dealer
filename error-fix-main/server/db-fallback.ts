// Fallback database for development when Neon is unreachable
// This provides in-memory storage that doesn't persist across restarts

export class FallbackDB {
  private users = new Map();
  private dealers = new Map();
  private products = new Map();
  private sessions = new Map();
  private branches = new Map();

  async query(text: string, params?: any[]) {
    console.log('[fallback-db] Mock query:', text, params);
    
    // Basic mock responses for common queries
    if (text.includes('SELECT NOW()')) {
      return { rows: [{ now: new Date().toISOString() }] };
    }
    
    if (text.includes('CREATE TABLE')) {
      return { rows: [] };
    }
    
    if (text.includes('INSERT INTO users')) {
      const [username, password] = params || [];
      this.users.set(username, { id: this.users.size + 1, username, password });
      return { rows: [{ id: this.users.size, username, password }] };
    }
    
    if (text.includes('INSERT INTO dealers')) {
      const [key, name] = params || [];
      this.dealers.set(key, { id: this.dealers.size + 1, key, name });
      return { rows: [{ id: this.dealers.size, key, name }] };
    }
    
    if (text.includes('INSERT INTO products')) {
      return { rows: [] };
    }
    
    if (text.includes('INSERT INTO branches')) {
      return { rows: [] };
    }
    
    // Default empty response
    return { rows: [] };
  }

  async end() {
    console.log('[fallback-db] Connection ended');
  }
}

export const fallbackPool = new FallbackDB();
