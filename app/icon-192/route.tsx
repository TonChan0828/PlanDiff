import { generateAppIcon } from "@/lib/pwa/app-icon";

export const dynamic = "force-static";

export async function GET() {
  return generateAppIcon(192);
}
