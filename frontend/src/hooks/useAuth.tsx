import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { UserRole } from "@/lib/types";
import { SignUpSchema, formatZodError } from "@/lib/validation";
import { z } from "zod";
import { fetchJson } from "@/lib/backendDataApi";
import { guardSharedSupabaseMutation } from "@/lib/sharedSupabaseMutationFreeze";

/* ================= TYPES ================= */

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  client_slug: string | null;
  /** Super Admin: null. All other roles: must be set or access is blocked. */
  organisation_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    organisationId?: string | null
  ) => Promise<{ data?: { user: { id: string }; userId?: string }; error: Error | null }>;
  /** Public signup (Service Manager / Field Executive). Account is created as pending until admin approves. */
  signUpPublic: (
    name: string,
    email: string,
    password: string,
    role: "STAFF" | "FIELD_EXECUTIVE",
    organisationId: string
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isFieldExecutive: boolean;
  isServiceStaff: boolean;
  isAdmin: boolean;
  isClient: boolean;
  clientSlug: string | null;
  /** Current user's organisation_id (null for Super Admin). */
  organisationId: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ================= HELPERS ================= */

const parseUserRole = (role: string): UserRole | null => {
  if (
    role === "STAFF" ||
    role === "FIELD_EXECUTIVE" ||
    role === "ADMIN" ||
    role === "SUPER_ADMIN" ||
    role === "CLIENT"
  ) {
    return role;
  }
  return null;
};

/* ================= PROVIDER ================= */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---------- PROFILE FETCH ---------- */

  const resolveUserProfile = async (
    authUser: User
  ): Promise<{ profile: UserProfile | null; deactivated: boolean; approvalStatus?: "pending" | "rejected" }> => {
    const dataRes = await fetchJson<{ profile: any | null }>(`/auth/me`);
    const data = dataRes?.profile ?? null;
    const error = null;

    if (import.meta.env.DEV) {
      // AUTH DEBUG: DB lookup result
      // eslint-disable-next-line no-console
      console.info("[AUTH DEBUG] DB profile lookup", {
        authUserId: authUser.id,
        email: authUser.email,
        error: error ? { message: error.message, code: (error as any).code } : null,
        found: !!data,
        row: data
          ? {
              id: (data as { id: string }).id,
              role: (data as { role: string }).role,
              organisation_id: (data as { organisation_id?: string | null }).organisation_id ?? null,
              client_slug: (data as { client_slug?: string | null }).client_slug ?? null,
            }
          : null,
      });
    }

    if (error || !data) return { profile: null, deactivated: false };

    // Only block when explicitly pending or rejected. Treat null/undefined as approved (backward compatibility if migration not run).
    const approvalStatus = (data as { approval_status?: string | null }).approval_status;
    if (approvalStatus === "pending" || approvalStatus === "rejected") {
      return { profile: null, deactivated: false, approvalStatus };
    }

    if (data.is_active === false) {
      return { profile: null, deactivated: true };
    }

    const role = parseUserRole(data.role);
    if (!role) return { profile: null, deactivated: false };

    const isSuperAdmin = role === "SUPER_ADMIN";
    if (!isSuperAdmin && (data.organisation_id == null || data.organisation_id === "")) {
      return { profile: null, deactivated: false };
    }

    return {
      profile: {
        id: data.id,
        name: data.name,
        email: data.email,
        role,
        active: data.active,
        client_slug: data.client_slug ?? null,
        organisation_id: data.organisation_id ?? null,
      },
      deactivated: false,
    };
  };

  /* ---------- HYDRATION ---------- */

  useEffect(() => {
    let cancelled = false;

    const hydrate = async (sess: Session | null) => {
      if (cancelled) return;

      setSession(sess);
      setUser(sess?.user ?? null);

      if (import.meta.env.DEV) {
        // AUTH DEBUG: initial session / environment
        // eslint-disable-next-line no-console
        console.info("[AUTH DEBUG] hydrate", {
          supabaseUrl: (import.meta as any).env?.VITE_SUPABASE_URL,
          authUserId: sess?.user?.id ?? null,
          email: sess?.user?.email ?? null,
          hasSession: !!sess,
        });
      }

      if (sess?.user) {
        let result = await resolveUserProfile(sess.user);

        if (result.deactivated) {
          await supabase.auth.signOut();
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("auth_deactivated", "1");
          }
          if (!cancelled) {
            setUser(null);
            setSession(null);
            setUserProfile(null);
          }
          if (!cancelled) setLoading(false);
          return;
        }

        if (result.approvalStatus) {
          await supabase.auth.signOut();
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem("auth_approval_status", result.approvalStatus);
          }
          if (!cancelled) {
            setUser(null);
            setSession(null);
            setUserProfile(null);
          }
          if (!cancelled) setLoading(false);
          return;
        }

        // Auto-provision profile for newly confirmed users (no row in public.users yet).
        if (!result.profile && sess.user.email) {
      await fetchJson<{ profile: unknown }>(`/auth/provision-user`, { method: "POST" });
      result = await resolveUserProfile(sess.user);
        }

        if (!cancelled) setUserProfile(result.profile);
      } else {
        setUserProfile(null);
      }

      if (!cancelled) setLoading(false);
    };

    // ✅ INITIAL SESSION (CRITICAL FIX)
    supabase.auth.getSession().then(({ data }) => {
      hydrate(data.session ?? null);
    });

    // ✅ ALL FUTURE AUTH CHANGES (INCLUDING REFRESH)
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        hydrate(newSession ?? null);
      }
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  /* ---------- ACTIONS ---------- */

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error as Error | null };
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    organisationId?: string | null
  ): Promise<{ data?: { user: { id: string }; userId?: string }; error: Error | null }> => {
    try {
      guardSharedSupabaseMutation("auth.signUp");
      SignUpSchema.parse({ email, password, name, role });

      const metadata: Record<string, unknown> = { name, role };
      if (organisationId && role !== "SUPER_ADMIN") metadata.organisation_id = organisationId;

      const { data: authData, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: metadata,
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) return { error: error as Error | null };

      return { data: authData?.user ? { user: authData.user } : undefined, error: null };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { error: new Error(formatZodError(err)) };
      }
      return { error: err as Error };
    }
  };

  /** Public signup: creates auth user + users row with approval_status 'pending'. Only STAFF and FIELD_EXECUTIVE. */
  const signUpPublic = async (
    name: string,
    email: string,
    password: string,
    role: "STAFF" | "FIELD_EXECUTIVE",
    organisationId: string
  ): Promise<{ error: Error | null }> => {
    try {
      guardSharedSupabaseMutation("auth.signUpPublic");
      const trimmedEmail = email.trim();
      const trimmedName = (name || "").trim() || trimmedEmail;
      if (!organisationId || !trimmedEmail || !password) {
        return { error: new Error("Name, email, password and tenant are required.") };
      }
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: { data: { name: trimmedName, role, organisation_id: organisationId, approval_status: "pending" } },
      });
      if (authError) return { error: authError as Error };
      if (!authData?.user) return { error: new Error("Account could not be created.") };
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Signup failed") };
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Proceed to clear state and redirect even if signOut fails (e.g. network)
    }
    setUser(null);
    setSession(null);
    setUserProfile(null);
    window.location.replace("/");
  };

  /* ---------- DERIVED ROLES ---------- */

  const isFieldExecutive = userProfile?.role === "FIELD_EXECUTIVE";
  const isServiceStaff = userProfile?.role === "STAFF";
  const isAdmin =
    userProfile?.role === "ADMIN" || userProfile?.role === "SUPER_ADMIN";
  const isClient = userProfile?.role === "CLIENT";
  const clientSlug = userProfile?.client_slug ?? null;
  const organisationId = userProfile?.organisation_id ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userProfile,
        loading,
        signIn,
        signUp,
        signUpPublic,
        signOut,
        isFieldExecutive,
        isServiceStaff,
        isAdmin,
        isClient,
        clientSlug,
        organisationId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ================= HOOK ================= */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
