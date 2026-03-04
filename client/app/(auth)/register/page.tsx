"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Shield,
  CheckCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const passwordRequirements = [
  { id: "length", label: "At least 8 characters", test: (pwd: string) => pwd.length >= 8 },
  { id: "uppercase", label: "One uppercase letter", test: (pwd: string) => /[A-Z]/.test(pwd) },
  { id: "lowercase", label: "One lowercase letter", test: (pwd: string) => /[a-z]/.test(pwd) },
  { id: "number", label: "One number", test: (pwd: string) => /\d/.test(pwd) },
  { id: "special", label: "One special character", test: (pwd: string) => /[!@#$%^&*]/.test(pwd) },
];

export default function RegisterPage() {
  const supabase = createClient();
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");

  const passwordStrength = passwordRequirements.filter((req) =>
    req.test(password)
  ).length;

  const strengthColor =
    passwordStrength <= 2
      ? "bg-destructive"
      : passwordStrength <= 4
      ? "bg-chart-3"
      : "bg-chart-2";

  const strengthText =
    passwordStrength <= 2
      ? "Weak"
      : passwordStrength <= 4
      ? "Fair"
      : "Strong";

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!role) {
      setError("Please select a role");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (passwordStrength < 3) {
      setError("Password is too weak");
      return;
    }

    setIsLoading(true);

    const form = new FormData(e.currentTarget);
    const fullName = form.get("name") as string;
    const email = form.get("email") as string;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: role,
        },
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex">
      {/* Decorative Panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-linear-to-bl from-background to-muted/20 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="0.5"
                opacity="0.3"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div className="absolute top-8 right-8 flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <span className="text-xl font-display font-bold">
            Edge<span className="text-primary">Pulse</span>
          </span>
        </div>
      </div>

      {/* Form Panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="flex justify-end mb-8">
            <ThemeToggle />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-display font-bold mb-2">
              Create Account
            </h1>
            <p className="text-muted-foreground">
              Join EdgePulse today
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Full Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  type="text"
                  placeholder="Enter your full name"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="Enter your email"
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="analyst">Security Analyst</SelectItem>
                  <SelectItem value="admin">IT Administrator</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  className="pl-10 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  className="pl-10 pr-10"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() =>
                    setShowConfirmPassword((prev) => !prev)
                  }
                >
                  {showConfirmPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                isLoading ||
                password !== confirmPassword ||
                passwordStrength < 3
              }
            >
              {isLoading ? (
                <motion.div
                  className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
              ) : (
                "Create Account"
              )}
            </Button>

            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                Already have an account?{" "}
              </span>
              <Link
                href="/auth/login"
                className="text-primary hover:underline"
              >
                Sign In →
              </Link>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}