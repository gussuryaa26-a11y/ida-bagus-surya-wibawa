import { redirect } from "next/navigation";
import { dashboardPathForRole, getSessionUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(dashboardPathForRole(user.role));
}
