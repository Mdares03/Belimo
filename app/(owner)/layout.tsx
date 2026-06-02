import { OwnerShell } from "@/components/shell/owner-shell";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OwnerShell>{children}</OwnerShell>;
}
