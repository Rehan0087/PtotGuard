import { FieldAccessGuard } from "@/components/field-access-guard";

export default function VisitsLayout({ children }: { children: React.ReactNode }) {
  return <FieldAccessGuard>{children}</FieldAccessGuard>;
}
