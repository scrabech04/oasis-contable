import { notFound } from "next/navigation";
import { getContacts, getProjects, getProforma } from "@/app/actions";
import { ProformaForm } from "@/components/proformas/ProformaForm";

export default async function EditProformaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proformaId = Number(id);
  if (!Number.isInteger(proformaId)) notFound();
  const [proforma, contacts, projects] = await Promise.all([
    getProforma(proformaId),
    getContacts({ type: "CLIENT" as any }),
    getProjects(),
  ]);
  if (!proforma) notFound();

  return (
    <div className="animate-in fade-in duration-500">
      <ProformaForm contacts={contacts} projects={projects} initialData={proforma} />
    </div>
  );
}
