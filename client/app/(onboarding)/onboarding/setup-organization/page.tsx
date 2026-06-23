"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, CheckCircle2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { useAuth } from "@/lib/auth/useAuth";
import { createClient } from "@/lib/config/client";
import { useOrganizationStore } from "@/lib/stores/organization-store";
import { StorageRepository } from "@/lib/repositories/storage-repository";
import { toast } from "sonner";

const ALLOWED_TYPES = ["image/png", "image/jpeg"];
const MAX_SIZE = 2 * 1024 * 1024;

const storageRepository = new StorageRepository(createClient());

export default function SetupOrganizationPage() {
  const router = useRouter();
  const { user, session, loading, refreshSession } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoTempPath, setLogoTempPath] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && user) {
      if (user.profiles.some((p) => p.organization_id !== null)) {
        router.push("/dashboard");
      }
    }
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "org";
  };

  const handleNameChange = (value: string) => {
    setOrgName(value);
    if (!slugTouched) {
      setOrgSlug(generateSlug(value));
    }
  };

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return "Only PNG, JPEG, and WebP images are accepted";
    }
    if (file.size > MAX_SIZE) {
      return "File must be under 2MB";
    }
    return null;
  };

  const handleFileSelect = async (file: File) => {
    setLogoError(null);
    const error = validateFile(file);
    if (error) {
      setLogoError(error);
      return;
    }

    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
    setLogoTempPath(null);

    if (!session?.access_token) {
      setLogoError("Session not available. Please refresh.");
      return;
    }

    setIsUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const uuid = crypto.randomUUID();
      const tempPath = `temp/${user!.id}/${uuid}.${ext}`;

      const { path, error: uploadError } = await storageRepository.uploadFile(
        "org-logos",
        tempPath,
        file,
        { contentType: file.type, upsert: false },
      );

      if (uploadError) {
        setLogoError(uploadError.message);
        return;
      }

      setLogoTempPath(path);
    } catch {
      setLogoError("Upload failed. You can still create the organization.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeLogo = async () => {
    if (logoTempPath) {
      try {
        await storageRepository.deleteFile("org-logos", logoTempPath);
      } catch {
        // best-effort cleanup
      }
    }
    setLogoFile(null);
    setLogoPreview(null);
    setLogoTempPath(null);
    setLogoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orgName.trim()) {
      toast.error("Organization name is required");
      return;
    }
    if (!orgSlug.trim()) {
      toast.error("Organization slug is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error("Session not available. Please refresh.");
        return;
      }

      const result = await useOrganizationStore.getState().setupOrganization(
        {
          org_name: orgName.trim(),
          org_slug: orgSlug.trim(),
          ...(logoTempPath ? { logo_temp_path: logoTempPath } : {}),
        },
        accessToken,
      );

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Organization created successfully!");
      await refreshSession();
      router.push("/dashboard");
    } catch {
      toast.error("Failed to set up organization. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
          <Logo className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground mb-1.5">
          Set Up Your Organization
        </h1>
        <p className="text-muted-foreground text-sm">
          Create your organization to get started with EdgePulse
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="orgName">Organization Name</Label>
          <div className="relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="orgName"
              value={orgName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="pl-10 h-10"
              placeholder="Acme Corp"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="orgSlug">Organization Slug</Label>
          <Input
            id="orgSlug"
            value={orgSlug}
            onChange={(e) => {
              setOrgSlug(e.target.value.replace(/[^a-z0-9-]/g, ""));
              setSlugTouched(true);
            }}
            className="h-10 font-mono"
            placeholder="acme-corp"
            required
          />
          <p className="text-xs text-muted-foreground">
            Used in URLs and API references. Must be unique.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Organization Logo</Label>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : logoPreview
                  ? "border-muted-foreground/30"
                  : "border-muted-foreground/25 hover:border-muted-foreground/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleInputChange}
              className="hidden"
            />

            {logoPreview ? (
              <div className="w-full">
                <div className="relative mx-auto w-24 h-24 mb-3">
                  <Image
                    src={logoPreview}
                    alt="Logo preview"
                    className="w-full h-full object-contain rounded-lg"
                    width={96}
                    height={96}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLogo();
                    }}
                    className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-0.5 shadow-sm"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {logoFile?.name}
                </p>
                {isUploadingLogo && (
                  <div className="flex items-center gap-2 mt-2 justify-center">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-muted-foreground">
                      Uploading...
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-1">
                  <span className="text-primary">Click to upload</span> or
                  drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  PNG, JPEG, or WebP (max 2MB)
                </p>
              </>
            )}
          </div>
          {logoError && (
            <p className="text-xs text-destructive mt-1">{logoError}</p>
          )}
          {logoTempPath && !logoError && (
            <p className="text-xs text-emerald-500 flex items-center gap-1.5 mt-1">
              <CheckCircle2 className="h-3 w-3" />
              Logo uploaded
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-10 gap-2"
          disabled={isSubmitting || isUploadingLogo || !orgName.trim() || !orgSlug.trim()}
        >
          {isSubmitting ? (
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              Create Organization
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-8 pt-6 border-t border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          You will be set as the organization administrator
        </div>
      </div>
    </div>
  );
}
