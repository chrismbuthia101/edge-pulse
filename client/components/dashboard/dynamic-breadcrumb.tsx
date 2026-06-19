"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

// Breadcrumb configuration
const BREADCRUMB_CONFIG: Record<string, { label: string; href?: string }> = {
  "/dashboard": { label: "Dashboard", href: "/dashboard" },
  "/dashboard/alerts": { label: "Alerts", href: "/dashboard/alerts" },
  "/dashboard/devices": { label: "Devices", href: "/dashboard/devices" },
  "/dashboard/live": { label: "Live Feed", href: "/dashboard/live" },
  "/dashboard/insights": { label: "ML Insights", href: "/dashboard/insights" },
  "/dashboard/notifications": {
    label: "Notifications",
    href: "/dashboard/notifications",
  },
  "/dashboard/settings": { label: "Settings", href: "/dashboard/settings" },
};

// Dynamic routes (with parameters)
const DYNAMIC_ROUTES: Record<
  string,
  (params: string[]) => { label: string; href: string }[]
> = {
  "/dashboard/devices/": (params) => [
    { label: "Devices", href: "/dashboard/devices" },
    {
      label: params[0] || "Unknown Device",
      href: `/dashboard/devices/${params[0]}`,
    },
  ],
};

export function DynamicBreadcrumb() {
  const pathname = usePathname();

  const generateBreadcrumbs = () => {
    // Check for dynamic routes first
    for (const [route, generator] of Object.entries(DYNAMIC_ROUTES)) {
      if (pathname.startsWith(route)) {
        const params = pathname.replace(route, "").split("/").filter(Boolean);
        return generator(params);
      }
    }

    // Check for exact matches
    if (BREADCRUMB_CONFIG[pathname]) {
      return [BREADCRUMB_CONFIG[pathname]];
    }

    // Generate from path segments
    const segments = pathname.split("/").filter(Boolean);
    const breadcrumbs = [];
    let currentPath = "";

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      currentPath += `/${segment}`;

      // Skip the auth segment
      if (segment === "auth") continue;

      const config = BREADCRUMB_CONFIG[currentPath];
      if (config) {
        breadcrumbs.push(config);
      } else if (i === segments.length - 1) {
        // Last segment without config - treat as current page
        breadcrumbs.push({
          label: segment
            .replace(/-/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          href: currentPath,
        });
      }
    }

    return breadcrumbs.length > 0
      ? breadcrumbs
      : [{ label: "Dashboard", href: "/dashboard" }];
  };

  const breadcrumbs = generateBreadcrumbs();

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
      <Shield className="h-4 w-4 text-primary shrink-0" />
      <Breadcrumb className="flex-1">
        <BreadcrumbList className="flex items-center gap-1.5">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;

            return (
              <div key={crumb.href} className="flex items-center gap-1.5">
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="text-foreground font-medium truncate">
                      {crumb.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      asChild
                      className="hover:text-foreground transition-colors truncate max-w-30 sm:max-w-none"
                    >
                      <Link href={crumb.href || "#"}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator className="shrink-0" />}
              </div>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
