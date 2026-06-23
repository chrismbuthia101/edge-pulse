import { create } from "zustand";
import {
  OrganizationService,
  type SetupOrganizationData,
  type InviteAnalystData,
} from "@/lib/services/organization-service";
import { OrganizationRepository } from "@/lib/repositories/organization-repository";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import { createClient } from "@/lib/config/client";
import type { Organization, Billing } from "@/lib/types/organization";

interface InviteResult {
  result: unknown;
  error: string | null;
}

interface OrganizationStore {
  organizations: Organization[];
  currentOrganization: Organization | null;
  billing: Billing | null;
  loading: boolean;
  error: string | null;

  fetchOrganizations: (ids: string[]) => Promise<void>;
  fetchOrganization: (slug: string) => Promise<void>;
  fetchOrganizationById: (id: string) => Promise<void>;
  fetchBilling: (orgId: string) => Promise<void>;
  updateOrganizationData: (orgId: string, data: Partial<Organization>) => Promise<void>;
  setupOrganization: (
    data: SetupOrganizationData,
    accessToken: string,
  ) => Promise<{ orgId?: string; error?: string }>;
  inviteAnalyst: (data: InviteAnalystData, accessToken: string) => Promise<InviteResult>;
  clear: () => void;
}

const supabase = createClient();
const storageRepository = new StorageRepository(supabase);
const organizationRepository = new OrganizationRepository(supabase);
const organizationService = new OrganizationService(
  organizationRepository,
  storageRepository,
);

export const useOrganizationStore = create<OrganizationStore>((set) => ({
  organizations: [],
  currentOrganization: null,
  billing: null,
  loading: false,
  error: null,

  fetchOrganizations: async (ids) => {
    set({ loading: true, error: null });
    try {
      const orgs = await organizationService.findByIds(ids);
      set({ organizations: orgs, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch organizations",
      });
    }
  },

  fetchOrganization: async (slug) => {
    set({ loading: true, error: null });
    try {
      const org = await organizationService.findBySlug(slug);
      set({ currentOrganization: org, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch organization",
      });
    }
  },

  fetchOrganizationById: async (id) => {
    set({ loading: true, error: null });
    try {
      const org = await organizationService.findById(id);
      set({ currentOrganization: org, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch organization",
      });
    }
  },

  fetchBilling: async (orgId) => {
    set({ loading: true, error: null });
    try {
      const billing = await organizationService.getBilling(orgId);
      set({ billing, loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to fetch billing",
      });
    }
  },

  updateOrganizationData: async (orgId, data) => {
    set({ loading: true, error: null });
    try {
      const updated = await organizationService.updateOrganization(orgId, data);
      if (updated) {
        set({ currentOrganization: updated, loading: false });
      } else {
        set({ loading: false, error: "Failed to update organization" });
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Failed to update organization",
      });
    }
  },

  inviteAnalyst: async (data, accessToken) => {
    set({ loading: true, error: null });
    const result = await organizationService.inviteAnalyst(data, accessToken);
    if (result.error) {
      set({ loading: false, error: result.error });
    } else {
      set({ loading: false });
    }
    return result;
  },

  setupOrganization: async (data, accessToken) => {
    set({ loading: true, error: null });
    try {
      const result = await organizationService.setupOrganization(
        data,
        accessToken,
      );
      if (result.error) {
        set({ loading: false, error: result.error });
        return { error: result.error };
      }
      set({ loading: false });
      return { orgId: result.orgId };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to setup organization";
      set({ loading: false, error: message });
      return { error: message };
    }
  },

  clear: () => {
    set({
      organizations: [],
      currentOrganization: null,
      billing: null,
      loading: false,
      error: null,
    });
  },
}));

export { organizationService, organizationRepository };
