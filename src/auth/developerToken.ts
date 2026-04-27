export interface DeveloperTokenCredentials {
  instance: string;
  developerToken: string;
}

/**
 * Static-token strategy: every request gets the X-DOMO-Developer-Token header
 * on the instance host (https://{instance}.domo.com). Used for instance-only
 * APIs like page tree, beast modes search, Redshift connector queries.
 *
 * Ported from dsl-beast/auth.py:_developer_token_client.
 */
export class DeveloperTokenManager {
  constructor(private readonly creds: DeveloperTokenCredentials) {}

  get token(): string {
    return this.creds.developerToken;
  }

  get instance(): string {
    return this.creds.instance;
  }

  headers(): Record<string, string> {
    return {
      "X-DOMO-Developer-Token": this.creds.developerToken,
    };
  }
}
