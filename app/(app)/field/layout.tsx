import { FieldAccessGuard } from "@/components/field-access-guard";

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldAccessGuard>{children}</FieldAccessGuard>;
}
