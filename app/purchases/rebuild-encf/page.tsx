import { getCompanySettings } from "@/app/actions";
import { EncfRebuilderTool } from "@/components/purchases/EncfRebuilderTool";

export default async function RebuildEncfPage() {
  const settings = await getCompanySettings();

  return <EncfRebuilderTool initialBuyerTaxId={settings.taxId || ""} />;
}
