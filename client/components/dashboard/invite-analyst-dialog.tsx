"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  User,
  Upload,
  CheckCircle2,
  Loader2,
  XCircle,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/useAuth";
import { useOrganizationStore } from "@/lib/stores/organization-store";
import { toast } from "sonner";

const MAX_INVITES = 100;

interface InviteResult {
  email: string;
  success: boolean;
  error?: string;
  invite_link?: string;
}

interface InviteAnalystDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SubmitPhase = "idle" | "creating" | "finalizing" | "done";

interface EdgeFunctionResponse {
  success?: boolean;
  error?: string;
  results?: InviteResult[];
}

export function InviteAnalystDialog({
  open,
  onOpenChange,
}: InviteAnalystDialogProps) {
  const { session } = useAuth();
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const resetForm = () => {
    setEmail("");
    setFullName("");
    setBulkInput("");
    setResults(null);
    setMode("single");
    setPhase("idle");
  };

  const parseBulkInput = (): { email: string; full_name: string }[] => {
    return bulkInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length >= 2 && parts[0].includes("@")) {
          return { email: parts[0], full_name: parts[1] };
        }
        const spaceSplit = line.split(/\s+/);
        if (spaceSplit.length >= 2 && spaceSplit[0].includes("@")) {
          return {
            email: spaceSplit[0],
            full_name: spaceSplit.slice(1).join(" "),
          };
        }
        return null;
      })
      .filter(
        (item): item is { email: string; full_name: string } => item !== null,
      );
  };

  const sendRequest = async (body: {
    email?: string;
    full_name?: string;
    invites?: { email: string; full_name: string }[];
  }): Promise<EdgeFunctionResponse | null> => {
    const token = session?.access_token;

    if (!token) {
      toast.error("You must be signed in to invite analysts");
      return null;
    }

    const { result, error } = await useOrganizationStore.getState().inviteAnalyst(
      body,
      token,
    );

    if (error) {
      toast.error(error);
      return null;
    }

    return result as EdgeFunctionResponse;
  };

  const handleSingleInvite = async () => {
    if (!email || !fullName) {
      toast.error("Email and full name are required");
      return;
    }

    setIsSubmitting(true);
    setPhase("creating");
    setResults(null);

    try {
      const result = await sendRequest({ email, full_name: fullName });
      setPhase("done");

      if (result?.success) {
        toast.success(`Invitation sent to ${email}`);
        resetForm();
        onOpenChange(false);
      } else {
        toast.error(result?.error || "Failed to send invitation");
      }
    } catch {
      toast.error("Failed to send invitation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkInvite = async () => {
    const invites = parseBulkInput();
    if (invites.length === 0) {
      toast.error("No valid entries found. Use format: email, full name");
      return;
    }

    setIsSubmitting(true);
    setPhase("creating");
    setResults(null);

    try {
      const result = await sendRequest({
        invites: invites.map((inv) => ({
          email: inv.email,
          full_name: inv.full_name,
        })),
      });
      setPhase("finalizing");

      const inviteResults: InviteResult[] = result?.results || [];
      setResults(inviteResults);
      setPhase("done");

      const successCount = inviteResults.filter((r) => r.success).length;
      const failCount = inviteResults.filter((r) => !r.success).length;

      if (failCount === 0) {
        toast.success(`All ${successCount} invitation(s) sent successfully`);
      } else {
        toast.warning(`${successCount} sent, ${failCount} failed`);
      }
    } catch {
      toast.error("Failed to send invitations. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;
  const progressValue =
    phase === "creating"
      ? 40
      : phase === "finalizing"
        ? 80
        : phase === "done"
          ? 100
          : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetForm();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Analyst</DialogTitle>
          <DialogDescription>
            Send an invitation to join your organization
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as "single" | "bulk");
            setResults(null);
            setPhase("idle");
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Single Invite</TabsTrigger>
            <TabsTrigger value="bulk">Bulk Invite</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email Address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-10"
                  placeholder="analyst@company.com"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10 h-10"
                  placeholder="Jane Analyst"
                  disabled={isSubmitting}
                />
              </div>
            </div>
            <Button
              onClick={handleSingleInvite}
              disabled={isSubmitting || !email || !fullName}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-4 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-input">
                Email, Full Name (one per line)
              </Label>
              <Textarea
                id="bulk-input"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                className="min-h-30 font-mono text-sm"
                placeholder={`analyst1@company.com, Alice Analyst\nanalyst2@company.com, Bob Analyst`}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                Format: <code>email, full name</code> or{" "}
                <code>email full name</code> — one per line
              </p>
            </div>

            {bulkInput.trim() && !isSubmitting && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {parseBulkInput().length} valid entry
                  {parseBulkInput().length !== 1 ? "ies" : ""} detected
                </span>
                {parseBulkInput().length > MAX_INVITES && (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <Ban className="h-3 w-3" />
                    Max {MAX_INVITES}
                  </span>
                )}
              </div>
            )}

            {isSubmitting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {phase === "creating" && "Creating accounts..."}
                    {phase === "finalizing" && "Setting up profiles..."}
                    {phase === "done" && "Complete"}
                  </span>
                  <span>{progressValue}%</span>
                </div>
                <Progress value={progressValue} className="h-1.5" />
              </div>
            )}

            <Button
              onClick={handleBulkInvite}
              disabled={
                isSubmitting ||
                parseBulkInput().length === 0 ||
                parseBulkInput().length > MAX_INVITES
              }
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending{" "}
                  {results
                    ? `${results.filter((r) => r.success).length}/${results.length}`
                    : `${parseBulkInput().length}`}
                  ...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Send {parseBulkInput().length} Invitation
                  {parseBulkInput().length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </TabsContent>
        </Tabs>

        <AnimatePresence>
          {results && results.length > 0 && phase === "done" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-2">
                <Badge
                  variant={failCount === 0 ? "default" : "destructive"}
                  className="text-xs"
                >
                  {successCount} succeeded
                  {failCount > 0 ? `, ${failCount} failed` : ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {results.length} total
                </span>
              </div>

              <div className="space-y-1.5 border rounded-lg p-3 max-h-48 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.success ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    )}
                    <span className="truncate">{r.email}</span>
                    {r.error && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
