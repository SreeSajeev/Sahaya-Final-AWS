import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapPin, Mail, Phone, Menu, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

const OFFICE_EMAIL = "enquiry@pariskq.in";
const OFFICE_PHONE = "+91 98801 18388";

const OFFICE_ADDRESS_LINES = [
  "#19, 1st Floor, Ranoji Rao Road",
  "Basavanagudi",
  "Bangalore 560004",
  "India",
];

// ─── Header (matches SahayaLanding) ─────────────────────────────────────────

function EnquiryHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={
        scrolled
          ? {
              background: "rgba(59, 18, 77, 0.92)",
              backdropFilter: "blur(16px)",
              borderBottom: "1px solid hsl(285 35% 22% / 0.8)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
            }
          : { background: "transparent" }
      }
    >
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/sahaya-logo.png" alt="Sahaya" className="h-8 w-auto sm:h-9 object-contain" />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-white tracking-tight">Sahaya</span>
            <span className="text-[9px] font-semibold text-white/45 tracking-[0.16em] uppercase">by Pariskq</span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          <Link to="/" className="px-3.5 py-1.5 text-[13px] font-medium text-white/60 hover:text-white/90 transition-colors">
            Home
          </Link>
          <Link to="/enquiry" className="px-3.5 py-1.5 text-[13px] font-medium text-white/90">
            Enquiry
          </Link>
        </nav>

        <div className="hidden lg:block">
          <Link to="/login">
            <Button
              size="sm"
              className="rounded-lg text-[13px] font-semibold px-5"
              style={{
                background: "linear-gradient(135deg, hsl(32 95% 46%), hsl(32 95% 54%))",
                boxShadow: "0 2px 12px hsl(32 95% 52% / 0.4)",
                color: "white",
                border: "none",
              }}
            >
              Login
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="lg:hidden p-2 text-white/70 hover:text-white"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div
          className="lg:hidden"
          style={{
            background: "hsl(285 45% 12% / 0.97)",
            borderTop: "1px solid hsl(285 35% 22% / 0.5)",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col gap-0.5">
            <Link
              to="/"
              className="px-3 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 rounded-lg"
              onClick={() => setMobileOpen(false)}
            >
              Home
            </Link>
            <Link
              to="/enquiry"
              className="px-3 py-2.5 text-sm font-medium text-white hover:bg-white/5 rounded-lg"
              onClick={() => setMobileOpen(false)}
            >
              Enquiry
            </Link>
            <div className="pt-3 mt-1 border-t border-white/8">
              <Link to="/login" className="block">
                <Button
                  size="sm"
                  className="w-full justify-center rounded-lg"
                  style={{
                    background: "linear-gradient(135deg, hsl(32 95% 46%), hsl(32 95% 54%))",
                    color: "white",
                    border: "none",
                  }}
                  onClick={() => setMobileOpen(false)}
                >
                  Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Card style (matches landing) ───────────────────────────────────────────

const cardStyle = {
  background: "linear-gradient(145deg, hsl(285 40% 18%), hsl(285 45% 14%))",
  border: "1px solid hsl(285 40% 30% / 0.5)",
  boxShadow: "0 0 0 1px hsl(285 45% 40% / 0.1), 0 20px 60px hsl(285 45% 10% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.06)",
};

export default function EnquiryPage() {
  const [name, setName] = useState("");
  const [products, setProducts] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      toast({
        title: "Message sent",
        description: "We'll get back to you as soon as possible.",
      });
      setName("");
      setProducts("");
      setEmail("");
      setPhone("");
      setMessage("");
    } catch {
      toast({
        title: "Failed to send",
        description: "Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="min-h-screen relative"
      style={{
        background: "linear-gradient(150deg, #3b124d 0%, #4a1659 50%, #5a1a6d 100%)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(hsl(285 45% 55% / 0.04) 1px, transparent 1px), linear-gradient(90deg, hsl(285 45% 55% / 0.04) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <EnquiryHeader />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16 md:py-28">
        <div className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Contact us
          </h1>
          <p className="mt-2 text-[15px] text-white/70 max-w-xl">
            Whether you have a question, a suggestion, or just want to say hello — we’d love to hear from you.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
          {/* Left: Contact form */}
          <div
            className="rounded-2xl overflow-hidden p-6 sm:p-8"
            style={cardStyle}
          >
            <h2 className="text-lg font-semibold text-white mb-1">Send a message</h2>
            <p className="text-[13px] text-white/60 mb-6">
              Fill in your details and we’ll get back to you as soon as possible.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-white/90 text-sm">
                    Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="Your Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="rounded-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="products" className="text-white/90 text-sm">
                    Products interested in
                  </Label>
                  <Input
                    id="products"
                    placeholder="e.g. ADAS Camera's"
                    value={products}
                    onChange={(e) => setProducts(e.target.value)}
                    className="rounded-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-white/90 text-sm">
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Your Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="rounded-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-white/90 text-sm">
                    Phone
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Your Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message" className="text-white/90 text-sm">
                  Message
                </Label>
                <Textarea
                  id="message"
                  placeholder="Your Message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="rounded-lg bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30 resize-none"
                />
              </div>
              <Button
                type="submit"
                disabled={sending}
                className="rounded-lg font-semibold px-8"
                style={{
                  background: "linear-gradient(135deg, hsl(32 95% 46%), hsl(32 95% 54%))",
                  boxShadow: "0 2px 12px hsl(32 95% 52% / 0.4)",
                  color: "white",
                  border: "none",
                }}
              >
                {sending ? "Sending…" : "Send Message"}
              </Button>
            </form>
          </div>

          {/* Right: Our Office card — office info + contact details */}
          <div
            className="rounded-2xl overflow-hidden flex flex-col"
            style={cardStyle}
          >
            <div className="p-6 sm:p-8 pb-4">
              <h2 className="text-lg font-semibold text-white">Our Office</h2>
              <p className="text-[13px] text-white/60 mt-1">
                Visit us or get in touch
              </p>
            </div>

            <div className="px-6 sm:px-8 pb-6 space-y-6">
              {/* Office information block — same card look, no map */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-6">
                <div className="flex gap-3">
                  <Building2 className="h-5 w-5 text-white/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                      Company
                    </p>
                    <p className="text-sm font-medium leading-snug text-white/90">
                      PARISKQ IOT SOLUTIONS PRIVATE LIMITED
                    </p>
                  </div>
                </div>
                <div className="flex gap-3 mt-4 pt-4 border-t border-white/10">
                  <MapPin className="h-5 w-5 text-white/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                      Address
                    </p>
                    <p className="text-sm leading-relaxed text-white/90">
                      {OFFICE_ADDRESS_LINES.map((line, i) => (
                        <span key={i}>
                          {line}
                          {i < OFFICE_ADDRESS_LINES.length - 1 && <br />}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 text-white/90">
                <div className="flex gap-3">
                  <Mail className="h-5 w-5 text-white/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                      Email
                    </p>
                    <a
                      href={`mailto:${OFFICE_EMAIL}`}
                      className="text-sm text-white/90 hover:text-white underline underline-offset-2"
                    >
                      {OFFICE_EMAIL}
                    </a>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Phone className="h-5 w-5 text-white/50 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50 mb-1">
                      Phone
                    </p>
                    <a
                      href={`tel:${OFFICE_PHONE.replace(/\s/g, "")}`}
                      className="text-sm text-white/90 hover:text-white underline underline-offset-2"
                    >
                      {OFFICE_PHONE}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
