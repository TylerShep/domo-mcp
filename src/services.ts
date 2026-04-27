import { type AIProvider, buildAIProvider } from "./ai/gateway.js";
import { AuthManager } from "./auth/manager.js";
import { type DomoMcpConfig, hasDeveloperToken } from "./config.js";
import { BeastModesApi } from "./domo/beastModes.js";
import { CardsApi } from "./domo/cards.js";
import { DomoClient } from "./domo/client.js";
import { DataflowsApi } from "./domo/dataflows.js";
import { DatasetsApi } from "./domo/datasets.js";
import { GovernanceApi } from "./domo/governance.js";
import { GroupsApi } from "./domo/groups.js";
import { PagesApi } from "./domo/pages.js";
import { RedshiftApi } from "./domo/redshift.js";
import { SemanticLayerGenerator } from "./domo/semanticLayer.js";
import { UsersApi } from "./domo/users.js";

/**
 * Cohesive container of all Domo API surfaces. Lazily initialized so we don't
 * pay startup cost for paths the user never invokes.
 */
export class Services {
  readonly auth: AuthManager;
  readonly client: DomoClient;
  readonly datasets: DatasetsApi;
  readonly cards: CardsApi;
  readonly pages: PagesApi;
  readonly users: UsersApi;
  readonly groups: GroupsApi;
  readonly dataflows: DataflowsApi;
  readonly governance: GovernanceApi;
  private _beastModes: BeastModesApi | null = null;
  private _redshift: RedshiftApi | null = null;
  private _semanticLayer: SemanticLayerGenerator | null = null;
  private _ai: AIProvider | null = null;

  constructor(public readonly config: DomoMcpConfig) {
    this.auth = new AuthManager(config);
    this.client = new DomoClient(this.auth, config);
    this.datasets = new DatasetsApi(this.client);
    this.cards = new CardsApi(this.client);
    this.pages = new PagesApi(this.client);
    this.users = new UsersApi(this.client);
    this.groups = new GroupsApi(this.client);
    this.dataflows = new DataflowsApi(this.client);
    this.governance = new GovernanceApi(this.client, this.datasets, this.cards);
  }

  beastModes(): BeastModesApi {
    if (!this._beastModes) {
      this._beastModes = new BeastModesApi(this.client, this.config.domoInstance);
    }
    return this._beastModes;
  }

  redshift(): RedshiftApi {
    if (!this._redshift) {
      this._redshift = new RedshiftApi(this.client, this.datasets, this.config.domoInstance);
    }
    return this._redshift;
  }

  ai(): AIProvider {
    if (!this._ai) this._ai = buildAIProvider(this.config);
    return this._ai;
  }

  semanticLayer(): SemanticLayerGenerator {
    if (!this._semanticLayer) {
      this._semanticLayer = new SemanticLayerGenerator(
        this.pages,
        this.cards,
        this.datasets,
        this.beastModes(),
        this.ai(),
        this.config.domoInstance,
      );
    }
    return this._semanticLayer;
  }

  hasInstanceAuth(): boolean {
    return (
      hasDeveloperToken(this.config) || this.auth.available.oauth || this.auth.available.browser
    );
  }
}
