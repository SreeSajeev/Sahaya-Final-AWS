import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicJson } from '@/lib/backendDataApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { Truck, Mail, ArrowRight, CheckCircle, UserPlus, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { PasswordField } from '@/components/auth/PasswordField';

type Tab = 'signin' | 'signup';

/**
 * Login and public signup. Signup creates a pending account; admin must approve before login.
 */
export function LoginForm() {
  const { signIn, signUpPublic } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [signupRole, setSignupRole] = useState<'STAFF' | 'FIELD_EXECUTIVE'>('STAFF');
  const [signupOrgId, setSignupOrgId] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'pending' | 'rejected' | 'inactive'; message: string } | null>(null);
  const { data: organisations = [] } = useQuery({
    queryKey: ['organisations-login'],
    queryFn: async () => {
      const res = await fetchPublicJson<{ items: { id: string; name: string }[] }>('/auth/public/organisations');
      return res.items ?? [];
    },
  });

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    const approval = sessionStorage.getItem('auth_approval_status');
    const deactivated = sessionStorage.getItem('auth_deactivated');
    sessionStorage.removeItem('auth_approval_status');
    sessionStorage.removeItem('auth_deactivated');
    if (approval === 'pending') {
      setStatusMessage({ type: 'pending', message: 'Your account is awaiting approval from your tenant administrator.' });
    } else if (approval === 'rejected') {
      setStatusMessage({ type: 'rejected', message: 'Your account request was rejected. Contact your tenant administrator if you believe this is an error.' });
    } else if (deactivated === '1') {
      setStatusMessage({ type: 'inactive', message: 'Your account has been deactivated. Contact your tenant administrator to reactivate.' });
    }
  }, []);

  /* =========================
     HANDLERS
  ========================= */

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setStatusMessage(null);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string)?.trim();
    const password = formData.get('password') as string;
    const { error } = await signIn(email ?? '', password);
    if (error) {
      toast({ title: 'Sign in failed', description: error.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = (formData.get('signup-name') as string)?.trim();
    const email = (formData.get('signup-email') as string)?.trim();
    const password = formData.get('signup-password') as string;
    if (!name || !email || !password || !signupOrgId) {
      toast({ title: 'Please fill all fields including tenant', variant: 'destructive' });
      setLoading(false);
      return;
    }
    const { error } = await signUpPublic(name, email, password, signupRole, signupOrgId);
    if (error) {
      toast({ title: 'Sign up failed', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    setSignupSuccess(true);
    setLoading(false);
  };

  if (signupSuccess) {
    return (
      <div className="grid min-h-screen w-full lg:grid-cols-2">
        <div className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br from-[#3b124d] via-[#4a1659] to-[#5a1a6d] p-12 text-white lg:flex">
          <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(hsl(285 45% 55% / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(285 45% 55% / 0.06) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
          <div className="relative z-10 flex items-center gap-4">
            <img src="/sahaya-logo.png" alt="Sahaya Logo" className="h-12 w-auto" />
            <div>
              <h1 className="text-2xl font-bold">Sahaya</h1>
              <p className="text-xs tracking-wide text-orange-300">Service Operations Platform</p>
            </div>
          </div>
          <div className="relative z-10" />
        </div>
        <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
          <Card className="relative z-10 w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-xl">Account request submitted</CardTitle>
              <CardDescription className="text-base">
                Your tenant administrator must approve your account before you can access the platform.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login">Back to sign in</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">

      {/* ================= LEFT PANEL ================= */}
      <div className="relative hidden min-h-screen flex-col justify-between overflow-hidden bg-gradient-to-br from-[#3b124d] via-[#4a1659] to-[#5a1a6d] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(hsl(285 45% 55% / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(285 45% 55% / 0.06) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="absolute top-1/4 right-0 w-96 h-96 pointer-events-none rounded-full blur-3xl" style={{ background: "radial-gradient(ellipse, hsl(32 95% 52% / 0.12) 0%, transparent 70%)" }} />
        <div className="absolute bottom-1/4 left-0 w-80 h-80 pointer-events-none rounded-full blur-3xl" style={{ background: "radial-gradient(ellipse, hsl(285 55% 55% / 0.08) 0%, transparent 70%)" }} />

        {/* Top Branding */}
        <div className="relative z-10 flex items-center gap-4">
          <img
            src="/sahaya-logo.png"
            alt="Sahaya Logo"
            className="h-12 w-auto"
          />
          <div>
            <h1 className="text-2xl font-bold">Sahaya</h1>
            <p className="text-xs tracking-wide text-orange-300">
              Service Operations Platform
            </p>
          </div>
        </div>

        {/* Pitch */}
        <div className="relative z-10 space-y-8 max-w-lg">
          <h2 className="text-3xl font-bold leading-[1.15]">
            Intelligent Complaint Resolution,
            <br />
            <span className="text-orange-300">
              Powered by Visibility & Accountability
            </span>
          </h2>

          <p className="text-lg text-white/80">
            Sahaya transforms complaints, incidents, service requests, and operational issues from multiple channels into structured, SLA-driven, and auditable workflows.
          </p>

          <p className="text-lg text-white/80">
            Whether requests arrive through email, phone calls, QR scans, manual entry, or bulk uploads, Sahaya ensures every issue is tracked, assigned, resolved, and measured.
          </p>

          <div className="space-y-4">
            {[
              {
                icon: Mail,
                text: 'Multi-channel complaint capture (Email, QR, Phone, Manual & Bulk Upload)',
              },
              {
                icon: Truck,
                text: 'SLA-driven assignment and resolution workflows',
              },
              {
                icon: CheckCircle,
                text: 'Complete audit trails and operational visibility',
              },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white/10 p-4 rounded-xl"
              >
                <item.icon className="h-5 w-5 text-orange-300" />
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ================= RIGHT PANEL ================= */}
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-gray-100/80 p-6">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(hsl(285 45% 45% / 0.04) 1.5px, transparent 1.5px)", backgroundSize: "28px 28px" }} />
        <Card className="relative z-10 w-full max-w-md border border-gray-200/80 bg-white/95 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.06)] transition-shadow duration-300">
          <CardHeader className="text-center pb-2">
            <div className="lg:hidden mb-4 flex flex-col items-center">
              <img src="/sahaya-logo.png" alt="Sahaya" className="h-12" />
            </div>
            <CardTitle className="text-2xl">Welcome to Sahaya</CardTitle>
            <CardDescription>
              {tab === 'signin' ? 'Sign in with your email and password' : 'Create an account (pending admin approval)'}
            </CardDescription>
            <div className="flex gap-2 mt-4 border-b">
              <button
                type="button"
                onClick={() => { setTab('signin'); setStatusMessage(null); }}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'signin' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab('signup'); setStatusMessage(null); }}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === 'signup' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              >
                Sign Up
              </button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {statusMessage && (
              <Alert variant={statusMessage.type === 'rejected' || statusMessage.type === 'inactive' ? 'destructive' : 'default'} className="bg-amber-50 border-amber-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{statusMessage.message}</AlertDescription>
              </Alert>
            )}

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <Label htmlFor="signin-email">Email</Label>
                  <Input id="signin-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <Label htmlFor="signin-password" className="text-sm font-medium leading-tight pt-0.5">
                      Password
                    </Label>
                    <Link
                      to="/forgot-password"
                      className="text-xs font-medium text-primary hover:underline shrink-0 rounded-md px-1 py-0.5 -mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordField
                    id="signin-password"
                    name="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign In'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-4">
                <div>
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input id="signup-name" name="signup-name" type="text" autoComplete="name" required />
                </div>
                <div>
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" name="signup-email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium">
                    Password
                  </Label>
                  <PasswordField
                    id="signup-password"
                    name="signup-password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <Select value={signupRole} onValueChange={(v) => setSignupRole(v as 'STAFF' | 'FIELD_EXECUTIVE')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STAFF">Service Manager</SelectItem>
                      <SelectItem value="FIELD_EXECUTIVE">Field Executive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tenant</Label>
                  <Select value={signupOrgId} onValueChange={setSignupOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {organisations.map((org) => (
                        <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={loading || organisations.length === 0 || !signupOrgId}>
                  {loading ? 'Submitting…' : 'Submit request'}
                  <UserPlus className="ml-2 h-4 w-4" />
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <div className="relative z-10 flex flex-col items-center mt-8">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            Powered by
          </p>
          <img
            src="/pariskq-logo.png"
            alt="Pariskq"
            className="h-10 w-auto mt-2"
          />
        </div>
      </div>
    </div>
  );
}
