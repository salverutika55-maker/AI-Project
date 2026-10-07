import { GSTProviderAdapter, GSTProviderType } from "../types";
import { GSTNSandboxGSPAdapter } from "./GSTNSandboxGSPAdapter";

export class GSTProviderFactory {
  private static instances: Map<string, GSTProviderAdapter> = new Map();

  public static getProvider(providerType?: GSTProviderType): GSTProviderAdapter {
    const selected = (providerType || process.env.GST_PROVIDER || "GSTN_SANDBOX") as GSTProviderType;

    if (!this.instances.has(selected)) {
      switch (selected) {
        case "CLEAR_TAX":
        case "MASTERS_INDIA":
        case "CYGNET":
        case "GSTN_SANDBOX":
        default:
          this.instances.set(selected, new GSTNSandboxGSPAdapter());
          break;
      }
    }

    return this.instances.get(selected)!;
  }
}
