"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  isAdmin: boolean;
  isAnalyst: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();
  const router = useRouter();

  // Fetch user role from analyst_users table
  const fetchUserRole = useCallback(async (userId: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from("analyst_users")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching user role:", error);
        return null;
      }
      return (data as unknown as { role: string | null })?.role ?? null;
    } catch (error) {
      console.error("Error fetching user role:", error);
      return null;
    }
  }, [supabase]);

  // Refresh session and role
  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession();

      if (error) {
        console.error("Error refreshing session:", error);
        setUser(null);
        setSession(null);
        setRole(null);
        return;
      }

      setSession(session);
      setUser(session?.user || null);

      // Fetch role if user exists
      if (session?.user) {
        const userRole = await fetchUserRole(session.user.id);
        setRole(userRole);
      } else {
        setRole(null);
      }
    } catch (error) {
      console.error("Error refreshing session:", error);
      setUser(null);
      setSession(null);
      setRole(null);
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setRole(null);
      router.push("/auth/login");
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("Error signing out:", error);
      toast.error("Error signing out");
    }
  };

  // Check if user has specific role(s)
  const hasRole = (roles: string[]): boolean => {
    if (!role) return false;
    return roles.includes(role);
  };

  // Computed properties
  const isAdmin = hasRole(["ADMINISTRATOR"]);
  const isAnalyst = hasRole(["ANALYST", "ADMINISTRATOR"]);

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error) {
          console.error("Error getting session:", error);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user || null);

        // Fetch role if user exists
        if (session?.user) {
          const userRole = await fetchUserRole(session.user.id);
          if (mounted) {
            setRole(userRole);
          }
        } else {
          if (mounted) {
            setRole(null);
          }
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log("Auth state changed:", event, session?.user?.id);

        setSession(session);
        setUser(session?.user || null);

        // Fetch role if user exists
        if (session?.user) {
          const userRole = await fetchUserRole(session.user.id);
          if (mounted) {
            setRole(userRole);
          }
        } else {
          if (mounted) {
            setRole(null);
          }
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, fetchUserRole]);

  const value: AuthContextType = {
    user,
    session,
    role,
    loading,
    signOut,
    refreshSession,
    hasRole,
    isAdmin,
    isAnalyst,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Higher-order component for role-based access
export function withRole<T extends object>(
  Component: React.ComponentType<T>,
  requiredRoles: string[]
) {
  return function RoleProtectedComponent(props: T) {
    const { hasRole, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading && !hasRole(requiredRoles)) {
        router.push("/dashboard");
        toast.error("You don't have permission to access this page");
      }
    }, [hasRole, loading, router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (!hasRole(requiredRoles)) {
      return null; // Will redirect
    }

    return <Component {...props} />;
  };
}
