import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { UserRole } from "@/lib/types";
import { SignUpSchema, formatZodError } from "@/lib/validation";
import { z } from "zod";
import {
  clearStoredAccessToken,
  fetchJson,
  postPublicJson,
  setStoredAccessToken,
  crmApiUrl,
} from "@/lib/backendDataApi";

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

/** Compatibility shape formerly from Supabase User/Session. */
interface AuthUser {
  id: string;
  email?: string | null;
}

interface AuthSession {
  access_token: string;
  user: AuthUser;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
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

function toProfile(data: Record<string, unknown> | null): {
  profile: UserProfile | null;
  deactivated: boolean;
  approvalStatus?: "pending" | "rejected";
} {
  if (!data) return { profile: null, deactivated: false };

  const approvalStatus = data.approval_status as string | null | undefined;
  if (approvalStatus === "pending" || approvalStatus === "rejected") {
    return { profile: null, deactivated: false, approvalStatus };
  }
  if (data.is_active === false) {
    return { profile: null, deactivated: true };
  }
  const role = parseUserRole(String(data.role ?? ""));
  if (!role) return { profile: null, deactivated: false };
  const isSuperAdmin = role === "SUPER_ADMIN";
  if (!isSuperAdmin && (data.organisation_id == null || data.organisation_id === "")) {
    return { profile: null, deactivated: false };
  }
  return {
    profile: {
      id: String(data.id),
      name: String(data.name ?? ""),
      email: String(data.email ?? ""),
      role,
      active: data.active !== false,
      client_slug: data.client_slug != null ? String(data.client_slug) : null,
      organisation_id: data.organisation_id != null ? String(data.organisation_id) : null,
    },
    deactivated: false,
  };
}

/* ================= PROVIDER ================= */

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = (profile: UserProfile | null, accessToken: string | null) => {
    if (!profile || !accessToken) {
      setUser(null);
      setSession(null);
      setUserProfile(null);
      return;
    }
    const authUser = { id: profile.id, email: profile.email };
    setUser(authUser);
    setSession({ access_token: accessToken, user: authUser });
    setUserProfile(profile);
  };

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const res = await fetch(crmApiUrl("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: "{}",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          clearStoredAccessToken();
          applyProfile(null, null);
          setLoading(false);
          return;
        }
        const accessToken = (data as { accessToken?: string }).accessToken ?? null;
        const profileRaw = (data as { profile?: Record<string, unknown> }).profile ?? null;
        if (accessToken) setStoredAccessToken(accessToken);
        const resolved = toProfile(profileRaw);
        if (resolved.deactivated) {
          clearStoredAccessToken();
          sessionStorage.setItem("auth_deactivated", "1");
          applyProfile(null, null);
        } else if (resolved.approvalStatus) {
          clearStoredAccessToken();
          sessionStorage.setItem("auth_approval_status", resolved.approvalStatus);
          applyProfile(null, null);
        } else {
          applyProfile(resolved.profile, accessToken);
        }
      } catch {
        if (!cancelled) {
          clearStoredAccessToken();
          applyProfile(null, null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const res = await fetch(crmApiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { error?: string })?.error || "Login failed";
        const code = (data as { code?: string })?.code;
        if (code === "ACCOUNT_DEACTIVATED") sessionStorage.setItem("auth_deactivated", "1");
        if (code === "APPROVAL_REQUIRED") {
          sessionStorage.setItem(
            "auth_approval_status",
            String((data as { approvalStatus?: string }).approvalStatus || "pending")
          );
        }
        return { error: new Error(msg) };
      }
      const accessToken = (data as { accessToken?: string }).accessToken ?? null;
      const profileRaw = (data as { profile?: Record<string, unknown> }).profile ?? null;
      if (accessToken) setStoredAccessToken(accessToken);
      const resolved = toProfile(profileRaw);
      applyProfile(resolved.profile, accessToken);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Login failed") };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    role: UserRole,
    organisationId?: string | null
  ): Promise<{ data?: { user: { id: string }; userId?: string }; error: Error | null }> => {
    try {
      SignUpSchema.parse({ email, password, name, role });
      if (role === "SUPER_ADMIN" || role === "ADMIN" || role === "CLIENT") {
        return {
          error: new Error("Use admin provisioning for this role (server-side)."),
        };
      }
      if (!organisationId) {
        return { error: new Error("organisationId is required") };
      }
      const data = await postPublicJson<{ userId?: string }>("/auth/signup", {
        email: email.trim(),
        password,
        name: name.trim(),
        role,
        organisationId,
      });
      return {
        data: data.userId ? { user: { id: data.userId }, userId: data.userId } : undefined,
        error: null,
      };
    } catch (err) {
      if (err instanceof z.ZodError) {
        return { error: new Error(formatZodError(err)) };
      }
      return { error: err as Error };
    }
  };

  const signUpPublic = async (
    name: string,
    email: string,
    password: string,
    role: "STAFF" | "FIELD_EXECUTIVE",
    organisationId: string
  ): Promise<{ error: Error | null }> => {
    try {
      const trimmedEmail = email.trim();
      const trimmedName = (name || "").trim() || trimmedEmail;
      if (!organisationId || !trimmedEmail || !password) {
        return { error: new Error("Name, email, password and tenant are required.") };
      }
      await postPublicJson("/auth/signup", {
        name: trimmedName,
        email: trimmedEmail,
        password,
        role,
        organisationId,
      });
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error("Signup failed") };
    }
  };

  const signOut = async () => {
    try {
      await fetch(crmApiUrl("/auth/logout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: "{}",
      });
    } catch {
      /* ignore */
    }
    clearStoredAccessToken();
    setUser(null);
    setSession(null);
    setUserProfile(null);
    window.location.replace("/");
  };

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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
