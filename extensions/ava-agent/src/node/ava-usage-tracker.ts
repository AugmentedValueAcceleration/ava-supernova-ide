/**
 * Persists per-completion usage records to ~/.ava/usage/YYYY-MM.json.
 * Provides summaries for the dashboard (today, this month, by provider).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface UsageRecord {
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface UsageSummary {
  today: { tokens: number; cost: number };
  month: { tokens: number; cost: number };
  byProvider: Record<string, { tokens: number; cost: number }>;
}

export class UsageTracker {
  private readonly usageDir: string;

  constructor() {
    this.usageDir = path.join(os.homedir(), '.ava', 'usage');
  }

  /** Record a single completion's usage. */
  async record(entry: Omit<UsageRecord, 'timestamp'>): Promise<void> {
    const now = new Date();
    const record: UsageRecord = {
      timestamp: now.toISOString(),
      ...entry,
    };

    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const filePath = path.join(this.usageDir, `${monthKey}.json`);

    try {
      await fs.mkdir(this.usageDir, { recursive: true });

      let records: UsageRecord[] = [];
      try {
        const data = await fs.readFile(filePath, 'utf-8');
        records = JSON.parse(data);
      } catch {
        // File doesn't exist yet — start fresh
      }

      records.push(record);

      // Write atomically: write to temp then rename
      const tmpPath = filePath + '.tmp';
      await fs.writeFile(tmpPath, JSON.stringify(records, null, 2), 'utf-8');
      await fs.rename(tmpPath, filePath);
    } catch (err) {
      console.error('[ava-agent] Usage tracking write failed:', err);
    }
  }

  /** Get usage summary for the dashboard. */
  async getSummary(): Promise<UsageSummary> {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    const records = await this.readMonth(monthKey);

    const summary: UsageSummary = {
      today: { tokens: 0, cost: 0 },
      month: { tokens: 0, cost: 0 },
      byProvider: {},
    };

    for (const r of records) {
      const tokens = r.inputTokens + r.outputTokens;

      // Month totals
      summary.month.tokens += tokens;
      summary.month.cost += r.cost;

      // Today totals
      if (r.timestamp.startsWith(todayStr)) {
        summary.today.tokens += tokens;
        summary.today.cost += r.cost;
      }

      // By provider
      if (!summary.byProvider[r.provider]) {
        summary.byProvider[r.provider] = { tokens: 0, cost: 0 };
      }
      summary.byProvider[r.provider].tokens += tokens;
      summary.byProvider[r.provider].cost += r.cost;
    }

    return summary;
  }

  private async readMonth(monthKey: string): Promise<UsageRecord[]> {
    const filePath = path.join(this.usageDir, `${monthKey}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }
}
