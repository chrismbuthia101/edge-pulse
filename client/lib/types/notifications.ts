export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  // severity levels used in the UI
  severity?: "critical" | "high" | "medium" | "low";
  // optional category/label for display
  category?: string | null;
}
